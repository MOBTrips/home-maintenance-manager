from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_NAME
from homeassistant.core import HomeAssistant
import homeassistant.helpers.config_validation as cv
from homeassistant.helpers import selector

from .const import DOMAIN, PLATFORMS, CONF_TASKS, SERVICE_MARK_COMPLETE, SERVICE_SNOOZE, SERVICE_ADD_LOG, SERVICE_RESET_RUNTIME, SERVICE_UPSERT_TASK, SERVICE_DELETE_TASK
from .coordinator import MaintenanceCoordinator
from .models import MaintenanceTask

_LOGGER = logging.getLogger(__name__)

TASK_SCHEMA = vol.Schema({
    vol.Required("id"): cv.string,
    vol.Required(CONF_NAME): cv.string,
    vol.Optional("description", default=""): cv.string,
    vol.Optional("category", default="General"): cv.string,
    vol.Optional("area"): cv.string,
    vol.Optional("linked_entities", default=[]): vol.All(cv.ensure_list, [cv.entity_id]),
    vol.Optional("rules", default=[]): list,
    vol.Optional("rule_logic", default="any"): vol.In(["any", "all", "primary"]),
    vol.Optional("primary_rule_id"): cv.string,
    vol.Optional("nfc_tags", default=[]): vol.All(cv.ensure_list, [cv.string]),
    vol.Optional("nfc_action", default="confirm"): vol.In(["complete", "confirm", "inspection", "open_dashboard", "disabled"]),
    vol.Optional("instructions", default=""): cv.string,
    vol.Optional("checklist", default=[]): vol.All(cv.ensure_list, [cv.string]),
    vol.Optional("parts", default=[]): list,
    vol.Optional("tools", default=[]): vol.All(cv.ensure_list, [cv.string]),
    vol.Optional("notification_mode", default="automation_only"): vol.In(["none", "persistent", "mobile", "both", "automation_only"]),
    vol.Optional("mobile_notify_service"): cv.string,
    vol.Optional("allow_snooze", default=True): cv.boolean,
    vol.Optional("max_snooze_count", default=0): vol.Coerce(int),
    vol.Optional("max_snooze_days", default=30): vol.Coerce(int),
    vol.Optional("warning_percent", default=0.8): vol.Coerce(float),
    vol.Optional("paused", default=False): cv.boolean,
})

CONFIG_SCHEMA = vol.Schema({
    DOMAIN: vol.Schema({
        vol.Optional(CONF_TASKS, default=[]): vol.All(cv.ensure_list, [TASK_SCHEMA])
    })
}, extra=vol.ALLOW_EXTRA)

async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    hass.data.setdefault(DOMAIN, {})
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

    async def handle_upsert_task(call):
        await coordinator.async_upsert_task(call.data["task"])

    async def handle_delete_task(call):
        await coordinator.async_delete_task(call.data["task_id"])

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
