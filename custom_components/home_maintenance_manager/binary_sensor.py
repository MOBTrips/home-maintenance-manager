from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorEntity, BinarySensorDeviceClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN

BINARY_TYPES = {
    "due": "Due",
    "upcoming": "Upcoming",
    "overdue": "Overdue",
}

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([MaintenanceBinarySensor(coordinator, task.id, t) for task in coordinator.tasks.values() for t in BINARY_TYPES])

class MaintenanceBinarySensor(BinarySensorEntity):
    _attr_has_entity_name = True
    _attr_device_class = BinarySensorDeviceClass.PROBLEM

    def __init__(self, coordinator, task_id: str, sensor_type: str) -> None:
        self.coordinator = coordinator
        self.task_id = task_id
        self.sensor_type = sensor_type
        self._attr_name = BINARY_TYPES[sensor_type]
        self._attr_unique_id = f"{task_id}_{sensor_type}"

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.coordinator.async_add_listener(self._handle_update))

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()

    @property
    def task(self):
        return self.coordinator.tasks[self.task_id]

    @property
    def device_info(self):
        task = self.task
        return {"identifiers": {task.device_identifier}, "name": task.name, "manufacturer": "Home Maintenance Manager", "model": "Maintenance Task"}

    @property
    def is_on(self):
        status = self.task.status(self.hass)
        if self.sensor_type == "due":
            return status in ("due", "overdue")
        if self.sensor_type == "upcoming":
            return status == "upcoming"
        if self.sensor_type == "overdue":
            return status == "overdue"
        return False
