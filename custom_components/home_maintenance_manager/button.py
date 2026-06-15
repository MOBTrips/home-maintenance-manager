from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN

BUTTON_TYPES = {"complete": "Mark Complete", "snooze": "Snooze 7 Days", "reset_runtime": "Reset Runtime"}

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([MaintenanceButton(coordinator, task.id, t) for task in coordinator.tasks.values() for t in BUTTON_TYPES])

class MaintenanceButton(ButtonEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator, task_id: str, button_type: str) -> None:
        self.coordinator = coordinator
        self.task_id = task_id
        self.button_type = button_type
        self._attr_name = BUTTON_TYPES[button_type]
        self._attr_unique_id = f"{task_id}_{button_type}"

    @property
    def available(self):
        return self.task_id in self.coordinator.tasks

    @property
    def task(self):
        return self.coordinator.tasks.get(self.task_id)

    @property
    def device_info(self):
        task = self.task
        if task is None:
            return None
        return {"identifiers": {task.device_identifier}, "name": task.name, "manufacturer": "Home Maintenance Manager", "model": "Maintenance Task"}

    async def async_press(self) -> None:
        if self.task_id not in self.coordinator.tasks:
            return
        if self.button_type == "complete":
            await self.coordinator.async_mark_complete(self.task_id, method="button")
        elif self.button_type == "snooze":
            await self.coordinator.async_snooze(self.task_id, 7)
        elif self.button_type == "reset_runtime":
            await self.coordinator.async_reset_runtime(self.task_id)
