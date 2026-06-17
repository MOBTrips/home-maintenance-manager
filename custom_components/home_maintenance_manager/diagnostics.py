from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN, STORAGE_KEY, STORAGE_VERSION
from .coordinator import MaintenanceCoordinator

TO_REDACT = {
    "mobile_notify_service",
    "mobile_notify_services",
    "last_completed_by",
    "user",
    "user_id",
    "scanner_device_id",
}


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, item in value.items():
            if key in TO_REDACT:
                redacted[key] = "REDACTED"
            else:
                redacted[key] = _redact(item)
        return redacted
    if isinstance(value, list):
        return [_redact(item) for item in value]
    return value


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: ConfigEntry
) -> dict[str, Any]:
    """Return diagnostics for Home Maintenance Manager."""
    coordinator = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    if not isinstance(coordinator, MaintenanceCoordinator):
        return {
            "storage": {
                "storage_key": STORAGE_KEY,
                "storage_version": STORAGE_VERSION,
                "loaded": False,
            },
            "entry": {
                "entry_id": entry.entry_id,
                "title": entry.title,
                "options_keys": sorted(entry.options.keys()),
            },
        }

    tasks = [task.as_dict() for task in coordinator.tasks.values()]
    return _redact({
        "storage": coordinator.backup_status(),
        "entry": {
            "entry_id": entry.entry_id,
            "title": entry.title,
            "options_keys": sorted(entry.options.keys()),
        },
        "counts": {
            "tasks": len(tasks),
            "rules": sum(len(task.get("rules") or []) for task in tasks),
            "nfc_linked_tasks": sum(1 for task in tasks if task.get("nfc_tags")),
        },
        "tasks": tasks,
    })
