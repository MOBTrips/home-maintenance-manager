from __future__ import annotations

import logging
from typing import Any
from pathlib import Path

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_NAME
from homeassistant.core import HomeAssistant
import homeassistant.helpers.config_validation as cv
from homeassistant.helpers import selector
from homeassistant.components import websocket_api
try:
    from homeassistant.components.frontend import async_register_built_in_panel
    from homeassistant.components.http import StaticPathConfig
except Exception:  # pragma: no cover - older HA fallback
    async_register_built_in_panel = None
    StaticPathConfig = None

from .const import DOMAIN, PLATFORMS, CONF_TASKS, SERVICE_MARK_COMPLETE, SERVICE_SNOOZE, SERVICE_ADD_LOG, SERVICE_RESET_RUNTIME, SERVICE_UPSERT_TASK, SERVICE_DELETE_TASK
from .coordinator import MaintenanceCoordinator
from .models import MaintenanceTask

_LOGGER = logging.getLogger(__name__)

TASK_SCHEMA = vol.Schema({
    vol.Required("id"): cv.string,
    vol.Required(CONF_NAME): cv.string,
    vol.Optional("description", default=""): cv.string,
    vol.Optional("category", default="General"): cv.string,
    vol.Optional("area", default=""): vol.Any(cv.string, None),
    vol.Optional("linked_entities", default=[]): vol.All(cv.ensure_list, [cv.entity_id]),
    vol.Optional("linked_device_id", default=""): vol.Any(cv.string, None),
    vol.Optional("equipment_name", default=""): cv.string,
    vol.Optional("rules", default=[]): list,
    vol.Optional("rule_logic", default="any"): vol.In(["any", "all", "primary"]),
    vol.Optional("primary_rule_id", default=""): vol.Any(cv.string, None),
    vol.Optional("nfc_tags", default=[]): vol.All(cv.ensure_list, [cv.string]),
    vol.Optional("nfc_action", default="confirm"): vol.In(["complete", "confirm", "inspection", "open_dashboard", "disabled"]),
    vol.Optional("instructions", default=""): cv.string,
    vol.Optional("checklist", default=[]): vol.All(cv.ensure_list, [cv.string]),
    vol.Optional("parts", default=[]): list,
    vol.Optional("tools", default=[]): vol.All(cv.ensure_list, [cv.string]),
    vol.Optional("notification_mode", default="global"): vol.In(["global", "disabled", "custom", "none", "persistent", "mobile", "both", "automation_only"]),
    vol.Optional("mobile_notify_service", default=""): vol.Any(cv.string, None),
    vol.Optional("allow_snooze", default=True): cv.boolean,
    vol.Optional("max_snooze_count", default=0): vol.Coerce(int),
    vol.Optional("max_snooze_days", default=30): vol.Coerce(int),
    vol.Optional("warning_percent", default=0.8): vol.Coerce(float),
    vol.Optional("paused", default=False): cv.boolean,
    vol.Optional("last_completed", default=""): vol.Any(cv.string, None),
    vol.Optional("baseline_method", default=""): vol.Any(cv.string, None),
})

CONFIG_SCHEMA = vol.Schema({
    DOMAIN: vol.Schema({
        vol.Optional(CONF_TASKS, default=[]): vol.All(cv.ensure_list, [TASK_SCHEMA])
    })
}, extra=vol.ALLOW_EXTRA)



def _coordinator_for_entry(hass: HomeAssistant, entry_id: str | None = None) -> MaintenanceCoordinator | None:
    data = hass.data.get(DOMAIN, {})
    if entry_id and entry_id in data:
        return data[entry_id]
    for value in data.values():
        if isinstance(value, MaintenanceCoordinator):
            return value
    return None


def _serialize_tasks(coordinator: MaintenanceCoordinator | None) -> list[dict[str, Any]]:
    if coordinator is None:
        return []
    return [task.as_dict() | {"status": task.status(coordinator.hass), "summary": task.summary_attributes(coordinator.hass)} for task in coordinator.tasks.values()]


def _default_notification_settings() -> dict[str, Any]:
    return {
        "enabled": True,
        "default_mode": "automation_only",
        "mobile_notify_services": [],
        "notify_upcoming": True,
        "notify_due": True,
        "notify_overdue": True,
        "notify_completed": False,
        "notify_snoozed": False,
        "repeat_mode": "once",
        "repeat_days": 1,
        "quiet_start": "",
        "quiet_end": "",
        "title_template": "[{category}] {task_name}",
        "body_template": "{task_name} is {status}.",
    }

def _notification_settings_for_entry(hass: HomeAssistant) -> dict[str, Any]:
    entries = hass.config_entries.async_entries(DOMAIN)
    settings = _default_notification_settings()
    if entries:
        settings.update(entries[0].options.get("notification_settings", {}) or {})
    return settings


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/get_tasks"})
@websocket_api.async_response
async def websocket_get_tasks(hass: HomeAssistant, connection, msg) -> None:
    """Return task data for the custom frontend panel."""
    coordinator = _coordinator_for_entry(hass)
    connection.send_result(msg["id"], {"tasks": _serialize_tasks(coordinator)})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/get_metadata"})
@websocket_api.async_response
async def websocket_get_metadata(hass: HomeAssistant, connection, msg) -> None:
    """Return friendly lookup lists for the custom frontend panel."""
    from homeassistant.helpers import area_registry as ar, device_registry as dr, entity_registry as er

    area_registry = ar.async_get(hass)
    device_registry = dr.async_get(hass)
    entity_registry = er.async_get(hass)
    notify_services = []
    for service in sorted(hass.services.async_services().get("notify", {})):
        full = f"notify.{service}"
        label = service.replace("mobile_app_", "Mobile app - ").replace("_", " ").strip().title()
        notify_services.append({"value": full, "label": label})
    connection.send_result(msg["id"], {
        "areas": [{"id": area.id, "name": area.name} for area in area_registry.async_list_areas()],
        "devices": [{"id": device.id, "name": device.name_by_user or device.name or device.model or device.id, "area_id": device.area_id} for device in device_registry.devices.values()],
        "entities": [{"entity_id": entity.entity_id, "name": entity.name or entity.original_name or entity.entity_id, "device_id": entity.device_id, "area_id": entity.area_id} for entity in entity_registry.entities.values()],
        "notify_services": notify_services,
        "notification_settings": _notification_settings_for_entry(hass),
    })



@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/update_notification_settings",
    vol.Required("settings"): dict,
})
@websocket_api.async_response
async def websocket_update_notification_settings(hass: HomeAssistant, connection, msg) -> None:
    """Update global Home Maintenance Manager notification settings."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        connection.send_error(msg["id"], "not_found", "Home Maintenance Manager config entry was not found")
        return
    entry = entries[0]
    settings = _default_notification_settings()
    settings.update(msg.get("settings") or {})
    hass.config_entries.async_update_entry(entry, options={**entry.options, "notification_settings": settings})
    connection.send_result(msg["id"], {"settings": settings})



@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/test_notification",
    vol.Optional("settings", default=None): vol.Any(dict, None),
})
@websocket_api.async_response
async def websocket_test_notification(hass: HomeAssistant, connection, msg) -> None:
    """Send a test notification using Home Maintenance Manager settings."""
    settings = _notification_settings_for_entry(hass)
    if msg.get("settings"):
        settings.update(msg.get("settings") or {})

    mode = settings.get("default_mode", "automation_only")
    title = "Home Maintenance Manager Test"
    message = "This is a test notification from Home Maintenance Manager."
    sent: list[str] = []

    if mode in ("persistent", "both"):
        await hass.services.async_call(
            "persistent_notification",
            "create",
            {
                "title": title,
                "message": message,
                "notification_id": "home_maintenance_manager_test",
            },
            blocking=True,
        )
        sent.append("persistent_notification.create")

    if mode in ("mobile", "both"):
        targets = settings.get("mobile_notify_services") or []
        for target in targets:
            if not isinstance(target, str) or not target.startswith("notify."):
                continue
            service = target.split(".", 1)[1]
            if not hass.services.has_service("notify", service):
                continue
            await hass.services.async_call(
                "notify",
                service,
                {"title": title, "message": message},
                blocking=True,
            )
            sent.append(target)

    if mode in ("none", "automation_only"):
        connection.send_result(msg["id"], {"sent": sent, "message": "No built-in notification was sent because the selected method is None or Automation only."})
        return

    if not sent:
        connection.send_result(msg["id"], {"sent": sent, "message": "No notification was sent. Select Persistent, Mobile, or Both and choose at least one valid mobile target for mobile notifications."})
        return

    connection.send_result(msg["id"], {"sent": sent, "message": f"Test notification sent to {len(sent)} target(s)."})

async def _async_register_panel(hass: HomeAssistant) -> None:
    """Register the Home Maintenance Manager sidebar panel."""
    if async_register_built_in_panel is None or StaticPathConfig is None:
        _LOGGER.warning("Home Maintenance Manager panel was not registered because this Home Assistant version does not expose the expected frontend helpers")
        return
    panel_dir = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths([
        StaticPathConfig(f"/{DOMAIN}_frontend", str(panel_dir), True)
    ])
    panel_url = "home-maintenance-manager"
    if panel_url in hass.data.get("frontend_panels", {}):
        return

    async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title="Maintenance",
        sidebar_icon="mdi:home-wrench",
        frontend_url_path=panel_url,
        require_admin=False,
        config={
            "domain": DOMAIN,
            "_panel_custom": {
                "name": "home-maintenance-manager-panel",
                "module_url": f"/{DOMAIN}_frontend/home-maintenance-manager-panel.js",
                "embed_iframe": False,
                "trust_external": False,
            },
        },
    )

async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    hass.data.setdefault(DOMAIN, {})
    websocket_api.async_register_command(hass, websocket_get_tasks)
    websocket_api.async_register_command(hass, websocket_get_metadata)
    websocket_api.async_register_command(hass, websocket_update_notification_settings)
    websocket_api.async_register_command(hass, websocket_test_notification)
    await _async_register_panel(hass)
    yaml_tasks = config.get(DOMAIN, {}).get(CONF_TASKS, [])
    hass.data[DOMAIN]["yaml_tasks"] = yaml_tasks
    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    coordinator = MaintenanceCoordinator(hass)
    await coordinator.async_load()

    # UI tasks come from the config entry options; YAML tasks are also supported.
    # They are synced into storage while preserving each task's runtime and history.
    configured_tasks = []
    configured_tasks.extend(entry.options.get(CONF_TASKS, []))
    configured_tasks.extend(hass.data[DOMAIN].get("yaml_tasks", []))
    await coordinator.async_sync_configured_tasks(configured_tasks)

    hass.data[DOMAIN][entry.entry_id] = coordinator

    async def handle_mark_complete(call):
        await coordinator.async_mark_complete(call.data["task_id"], call.data.get("method", "service"), call.context.user_id, call.data.get("notes"))

    async def handle_snooze(call):
        await coordinator.async_snooze(call.data["task_id"], call.data.get("days", 7))

    async def handle_add_log(call):
        await coordinator.async_add_log(call.data["task_id"], call.data.get("activity", "note"), call.data.get("notes"))

    async def handle_reset_runtime(call):
        await coordinator.async_reset_runtime(call.data["task_id"])

    async def _async_reload_entry_after_options_change() -> None:
        """Reload the config entry so HA creates/removes task entities and devices.

        Maintenance tasks are represented as Home Assistant entities/devices.
        Updating the coordinator store alone updates the sidebar panel, but it does
        not cause the sensor/binary_sensor/button platforms to add new entities.
        A config entry reload is the safest current approach for this custom panel
        flow because the platform setup code rebuilds entities from stored tasks.
        """
        await hass.config_entries.async_reload(entry.entry_id)

    async def handle_upsert_task(call):
        task = call.data["task"]
        tasks = list(entry.options.get(CONF_TASKS, []))
        tasks = [item for item in tasks if item.get("id") != task["id"]]
        tasks.append(task)
        hass.config_entries.async_update_entry(entry, options={**entry.options, CONF_TASKS: tasks})
        # Update storage immediately so the panel can refresh, then reload the
        # entry to create/update the real HA device and entities.
        await coordinator.async_upsert_task(task)
        hass.async_create_task(_async_reload_entry_after_options_change())

    async def handle_delete_task(call):
        task_id = call.data["task_id"]
        tasks = [item for item in entry.options.get(CONF_TASKS, []) if item.get("id") != task_id]
        hass.config_entries.async_update_entry(entry, options={**entry.options, CONF_TASKS: tasks})
        await coordinator.async_delete_task(task_id)
        hass.async_create_task(_async_reload_entry_after_options_change())

    hass.services.async_register(DOMAIN, SERVICE_MARK_COMPLETE, handle_mark_complete, schema=vol.Schema({vol.Required("task_id"): cv.string, vol.Optional("method", default="service"): cv.string, vol.Optional("notes"): cv.string}))
    hass.services.async_register(DOMAIN, SERVICE_SNOOZE, handle_snooze, schema=vol.Schema({vol.Required("task_id"): cv.string, vol.Optional("days", default=7): vol.Coerce(int)}))
    hass.services.async_register(DOMAIN, SERVICE_ADD_LOG, handle_add_log, schema=vol.Schema({vol.Required("task_id"): cv.string, vol.Optional("activity", default="note"): cv.string, vol.Optional("notes"): cv.string}))
    hass.services.async_register(DOMAIN, SERVICE_RESET_RUNTIME, handle_reset_runtime, schema=vol.Schema({vol.Required("task_id"): cv.string}))
    hass.services.async_register(DOMAIN, SERVICE_UPSERT_TASK, handle_upsert_task, schema=vol.Schema({vol.Required("task"): TASK_SCHEMA}))
    hass.services.async_register(DOMAIN, SERVICE_DELETE_TASK, handle_delete_task, schema=vol.Schema({vol.Required("task_id"): cv.string}))

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unload_ok
