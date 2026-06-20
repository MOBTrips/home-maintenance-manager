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
from homeassistant.helpers.storage import Store
from homeassistant.components import websocket_api
try:
    from homeassistant.components.frontend import async_register_built_in_panel
    from homeassistant.components.http import StaticPathConfig
except Exception:  # pragma: no cover - older HA fallback
    async_register_built_in_panel = None
    StaticPathConfig = None

from .const import DOMAIN, PLATFORMS, CONF_TASKS, STORAGE_KEY, STORAGE_VERSION, LEGACY_STORAGE_KEY, LEGACY_STORAGE_VERSION, SERVICE_MARK_COMPLETE, SERVICE_SNOOZE, SERVICE_ADD_LOG, SERVICE_RESET_RUNTIME, SERVICE_UPSERT_TASK, SERVICE_DELETE_TASK
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
    vol.Optional("seasonal", default={}): dict,
    vol.Optional("paused", default=False): cv.boolean,
    vol.Optional("last_completed", default=""): vol.Any(cv.string, None),
    vol.Optional("baseline_method", default=""): vol.Any(cv.string, None),
    vol.Optional("baseline_ago_value", default=""): vol.Any(cv.string, vol.Coerce(float), None),
    vol.Optional("baseline_ago_unit", default="days"): vol.Any(cv.string, None),
    vol.Optional("provenance", default={}): dict,
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
    coordinator = _coordinator_for_entry(hass)
    if coordinator is not None:
        return coordinator.get_notification_settings()
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






@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/export_data"})
@websocket_api.async_response
async def websocket_export_data(hass: HomeAssistant, connection, msg) -> None:
    """Return a portable JSON export package for HMM data."""
    coordinator = _coordinator_for_entry(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Home Maintenance Manager coordinator was not found")
        return
    connection.send_result(msg["id"], coordinator.export_data())


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/export_task_pack",
    vol.Required("task_ids"): [cv.string],
    vol.Required("pack"): dict,
})
@websocket_api.async_response
async def websocket_export_task_pack(hass: HomeAssistant, connection, msg) -> None:
    """Return selected HMM tasks as a formal Task Pack package."""
    coordinator = _coordinator_for_entry(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Home Maintenance Manager coordinator was not found")
        return
    try:
        connection.send_result(msg["id"], coordinator.export_task_pack(msg.get("task_ids") or [], msg.get("pack") or {}))
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_task_pack", str(err))
    except Exception as err:  # pragma: no cover
        _LOGGER.exception("Home Maintenance Manager Task Pack export failed")
        connection.send_error(msg["id"], "export_failed", str(err))


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/list_built_in_task_packs"})
@websocket_api.async_response
async def websocket_list_built_in_task_packs(hass: HomeAssistant, connection, msg) -> None:
    """Return metadata for bundled local Task Packs."""
    coordinator = _coordinator_for_entry(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Home Maintenance Manager coordinator was not found")
        return
    try:
        connection.send_result(msg["id"], {"packs": coordinator.built_in_task_packs()})
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_task_pack_library", str(err))
    except Exception as err:  # pragma: no cover
        _LOGGER.exception("Home Maintenance Manager built-in Task Pack listing failed")
        connection.send_error(msg["id"], "task_pack_library_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/get_built_in_task_pack",
    vol.Required("pack_id"): cv.string,
})
@websocket_api.async_response
async def websocket_get_built_in_task_pack(hass: HomeAssistant, connection, msg) -> None:
    """Return one bundled local Task Pack package."""
    coordinator = _coordinator_for_entry(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Home Maintenance Manager coordinator was not found")
        return
    try:
        connection.send_result(msg["id"], coordinator.built_in_task_pack(msg.get("pack_id") or ""))
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_task_pack", str(err))
    except Exception as err:  # pragma: no cover
        _LOGGER.exception("Home Maintenance Manager built-in Task Pack load failed")
        connection.send_error(msg["id"], "task_pack_load_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/import_data",
    vol.Required("data"): dict,
    vol.Optional("mode", default="merge"): vol.In(["merge", "replace"]),
})
@websocket_api.async_response
async def websocket_import_data(hass: HomeAssistant, connection, msg) -> None:
    """Import a portable JSON export package for HMM data."""
    entries = hass.config_entries.async_entries(DOMAIN)
    coordinator = _coordinator_for_entry(hass, entries[0].entry_id if entries else None)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Home Maintenance Manager coordinator was not found")
        return
    try:
        result = await coordinator.async_import_data(msg.get("data") or {}, msg.get("mode") or "merge")
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_import", str(err))
        return
    except Exception as err:  # pragma: no cover - defensive import error reporting
        _LOGGER.exception("Home Maintenance Manager import failed")
        connection.send_error(msg["id"], "import_failed", str(err))
        return

    if entries:
        hass.async_create_task(hass.config_entries.async_reload(entries[0].entry_id))
    connection.send_result(msg["id"], result)



@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/import_preview",
    vol.Required("data"): dict,
    vol.Optional("mode", default="merge"): vol.In(["merge", "replace"]),
})
@websocket_api.async_response
async def websocket_import_preview(hass: HomeAssistant, connection, msg) -> None:
    """Preview a backup or task-pack import without saving changes."""
    coordinator = _coordinator_for_entry(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Home Maintenance Manager coordinator was not found")
        return
    try:
        connection.send_result(msg["id"], coordinator.import_preview(msg.get("data") or {}, msg.get("mode") or "merge"))
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_import", str(err))
    except Exception as err:  # pragma: no cover
        _LOGGER.exception("Home Maintenance Manager import preview failed")
        connection.send_error(msg["id"], "preview_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/import_apply",
    vol.Required("data"): dict,
    vol.Optional("mode", default="merge"): vol.In(["merge", "replace"]),
    vol.Optional("selected_ids", default=None): vol.Any([cv.string], None),
    vol.Optional("entity_mapping", default={}): dict,
    vol.Optional("import_settings", default=True): cv.boolean,
    vol.Optional("restore_deleted", default=False): cv.boolean,
})
@websocket_api.async_response
async def websocket_import_apply(hass: HomeAssistant, connection, msg) -> None:
    """Apply a reviewed backup or task-pack import selection."""
    entries = hass.config_entries.async_entries(DOMAIN)
    coordinator = _coordinator_for_entry(hass, entries[0].entry_id if entries else None)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Home Maintenance Manager coordinator was not found")
        return
    try:
        result = await coordinator.async_apply_import_preview(
            msg.get("data") or {},
            msg.get("selected_ids"),
            msg.get("mode") or "merge",
            msg.get("entity_mapping") or {},
            bool(msg.get("import_settings", True)),
            bool(msg.get("restore_deleted", False)),
        )
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_import", str(err))
        return
    except Exception as err:  # pragma: no cover
        _LOGGER.exception("Home Maintenance Manager reviewed import failed")
        connection.send_error(msg["id"], "import_failed", str(err))
        return
    if entries:
        hass.async_create_task(hass.config_entries.async_reload(entries[0].entry_id))
    connection.send_result(msg["id"], result)

@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/get_backup_status"})
@websocket_api.async_response
async def websocket_get_backup_status(hass: HomeAssistant, connection, msg) -> None:
    """Return storage and Home Assistant backup alignment status."""
    coordinator = _coordinator_for_entry(hass)
    if coordinator is None:
        connection.send_result(msg["id"], {
            "storage_key": DOMAIN,
            "storage_version": None,
            "storage_path": f"/config/.storage/{DOMAIN}",
            "included_in_ha_backup": True,
            "tasks": 0,
            "completion_history_records": 0,
            "activity_history_records": 0,
            "settings_in_storage": False,
            "migration": {},
        })
        return
    connection.send_result(msg["id"], coordinator.backup_status())


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
    settings = _default_notification_settings()
    settings.update(msg.get("settings") or {})
    coordinator = _coordinator_for_entry(hass, entries[0].entry_id)
    if coordinator is not None:
        settings = await coordinator.async_update_notification_settings(settings)
    else:
        # Fallback during early startup; setup migration will move this into unified storage.
        entry = entries[0]
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
    websocket_api.async_register_command(hass, websocket_get_backup_status)
    websocket_api.async_register_command(hass, websocket_export_data)
    websocket_api.async_register_command(hass, websocket_export_task_pack)
    websocket_api.async_register_command(hass, websocket_list_built_in_task_packs)
    websocket_api.async_register_command(hass, websocket_get_built_in_task_pack)
    websocket_api.async_register_command(hass, websocket_import_data)
    websocket_api.async_register_command(hass, websocket_import_preview)
    websocket_api.async_register_command(hass, websocket_import_apply)
    websocket_api.async_register_command(hass, websocket_update_notification_settings)
    websocket_api.async_register_command(hass, websocket_test_notification)
    await _async_register_panel(hass)
    yaml_tasks = config.get(DOMAIN, {}).get(CONF_TASKS, [])
    hass.data[DOMAIN]["yaml_tasks"] = yaml_tasks
    return True


async def _async_cleanup_task_registry_entries(
    hass: HomeAssistant,
    entry: ConfigEntry,
    task_id: str,
    task_name: str | None = None,
) -> None:
    """Remove registry entries for a deleted maintenance task.

    Home Assistant can keep deleted task devices around as unavailable if the
    entity registry entries still exist when the config entry reloads.  Cleanup
    must therefore remove both the task-owned entity registry entries and the
    task device after the platforms have been unloaded.
    """
    from homeassistant.helpers import device_registry as dr, entity_registry as er

    entity_registry = er.async_get(hass)
    device_registry = dr.async_get(hass)

    device_ids: set[str] = set()
    device = device_registry.async_get_device({(DOMAIN, task_id)})
    if device is not None:
        device_ids.add(device.id)

    # Task entities use unique IDs like f"{task_id}_{entity_type}". Also remove
    # any entity attached to the task device, because stale entities can keep the
    # device visible in Settings > Devices & Services after task deletion.
    for entity_entry in list(er.async_entries_for_config_entry(entity_registry, entry.entry_id)):
        unique_id = str(entity_entry.unique_id or "")
        should_remove = unique_id.startswith(f"{task_id}_")
        if entity_entry.device_id and entity_entry.device_id in device_ids:
            should_remove = True
        if should_remove:
            if entity_entry.device_id:
                device_ids.add(entity_entry.device_id)
            try:
                entity_registry.async_remove(entity_entry.entity_id)
            except Exception:  # pragma: no cover - cleanup should not block delete
                _LOGGER.debug(
                    "Could not remove entity registry entry %s for deleted HMM task %s",
                    entity_entry.entity_id,
                    task_id,
                    exc_info=True,
                )

    # Re-resolve by identifier after entity cleanup in case the first lookup was
    # blocked by stale entity/device state.
    device = device_registry.async_get_device({(DOMAIN, task_id)})
    if device is not None:
        device_ids.add(device.id)

    for device_id in list(device_ids):
        try:
            dev = device_registry.async_get(device_id)
            if dev is not None:
                device_registry.async_remove_device(device_id)
        except Exception:  # pragma: no cover - registry cleanup should not block delete
            _LOGGER.debug(
                "Could not remove device registry entry %s for deleted HMM task %s (%s)",
                device_id,
                task_id,
                task_name or "unknown name",
                exc_info=True,
            )

async def _async_cleanup_config_entry_registry_entries(
    hass: HomeAssistant,
    entry: ConfigEntry,
) -> None:
    """Remove all HMM-owned registry entries for a deleted config entry."""
    from homeassistant.helpers import device_registry as dr, entity_registry as er

    entity_registry = er.async_get(hass)
    device_registry = dr.async_get(hass)

    for entity_entry in list(er.async_entries_for_config_entry(entity_registry, entry.entry_id)):
        try:
            entity_registry.async_remove(entity_entry.entity_id)
        except Exception:  # pragma: no cover - cleanup should not block uninstall
            _LOGGER.debug(
                "Could not remove HMM entity registry entry %s during config-entry removal",
                entity_entry.entity_id,
                exc_info=True,
            )

    for device in list(device_registry.devices.values()):
        identifiers = getattr(device, "identifiers", set()) or set()
        if not any(identifier and identifier[0] == DOMAIN for identifier in identifiers):
            continue
        try:
            device_registry.async_remove_device(device.id)
        except Exception:  # pragma: no cover - cleanup should not block uninstall
            _LOGGER.debug(
                "Could not remove HMM device registry entry %s during config-entry removal",
                device.id,
                exc_info=True,
            )

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    coordinator = MaintenanceCoordinator(hass)
    await coordinator.async_load(entry.options, hass.data[DOMAIN].get("yaml_tasks", []))

    # v0.6 migration: task definitions and HMM-owned settings now live in the
    # unified HA Store file. Keep the config entry for integration setup only.
    migrated_options = dict(entry.options)
    changed_options = False
    for legacy_key in (CONF_TASKS, "notification_settings"):
        if legacy_key in migrated_options:
            migrated_options.pop(legacy_key, None)
            changed_options = True
    if changed_options:
        hass.config_entries.async_update_entry(entry, options=migrated_options)

    hass.data[DOMAIN][entry.entry_id] = coordinator

    async def handle_mark_complete(call):
        await coordinator.async_mark_complete(call.data["task_id"], call.data.get("method", "service"), call.context.user_id, call.data.get("notes"))

    async def handle_snooze(call):
        await coordinator.async_snooze(call.data["task_id"], call.data.get("days", 7))

    async def handle_add_log(call):
        await coordinator.async_add_log(call.data["task_id"], call.data.get("activity", "note"), call.data.get("notes"))

    async def handle_reset_runtime(call):
        await coordinator.async_reset_runtime(call.data["task_id"])

    async def _async_reload_entry_after_options_change(
        cleanup_task_id: str | None = None,
        cleanup_task_name: str | None = None,
    ) -> None:
        """Reload the config entry so HA creates/removes task entities and devices.

        For deleted tasks, unload first, clean registry entries while the stale
        entities are not loaded, then set the entry back up. This prevents
        unavailable orphan devices from remaining under the integration.
        """
        if cleanup_task_id:
            unload_ok = await hass.config_entries.async_unload(entry.entry_id)
            if unload_ok:
                await _async_cleanup_task_registry_entries(
                    hass, entry, cleanup_task_id, cleanup_task_name
                )
                await hass.config_entries.async_setup(entry.entry_id)
            else:
                _LOGGER.warning(
                    "Could not unload Home Maintenance Manager before deleting task %s; falling back to reload",
                    cleanup_task_id,
                )
                await _async_cleanup_task_registry_entries(
                    hass, entry, cleanup_task_id, cleanup_task_name
                )
                await hass.config_entries.async_reload(entry.entry_id)
            return

        await hass.config_entries.async_reload(entry.entry_id)

    async def handle_upsert_task(call):
        task = call.data["task"]
        # v0.6: the unified storage file is the task source of truth. The config
        # entry is no longer updated with task definitions.
        await coordinator.async_upsert_task(task)
        hass.async_create_task(_async_reload_entry_after_options_change())

    async def handle_delete_task(call):
        task_id = call.data["task_id"]
        task_name = coordinator.tasks.get(task_id).name if task_id in coordinator.tasks else None
        await coordinator.async_delete_task(task_id)
        hass.async_create_task(
            _async_reload_entry_after_options_change(task_id, task_name)
        )

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


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Remove HMM-owned data when the integration config entry is deleted.

    HACS reinstall/update does not call this; Home Assistant only calls it when
    the user removes the integration config entry. That makes a deliberate
    remove/add cycle behave like a clean reset while normal HA backups and
    restores still preserve the unified storage file.
    """
    await _async_cleanup_config_entry_registry_entries(hass, entry)

    for version, key in ((STORAGE_VERSION, STORAGE_KEY), (LEGACY_STORAGE_VERSION, LEGACY_STORAGE_KEY)):
        try:
            await Store(hass, version, key).async_remove()
        except FileNotFoundError:
            pass
        except Exception:  # pragma: no cover - do not block HA config-entry removal
            _LOGGER.debug("Could not remove HMM storage key %s during config-entry removal", key, exc_info=True)
