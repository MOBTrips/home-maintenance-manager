from __future__ import annotations

from homeassistant.components.sensor import SensorEntity, SensorDeviceClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import PERCENTAGE, UnitOfTime
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import DOMAIN

SENSOR_TYPES = {
    "status": ("Status", None, None),
    "percent_used": ("Percent Used", PERCENTAGE, None),
    "days_remaining": ("Days Remaining", UnitOfTime.DAYS, None),
    "runtime_remaining": ("Runtime Remaining", UnitOfTime.HOURS, None),
    "last_completed": ("Last Completed", None, SensorDeviceClass.TIMESTAMP),
    "completion_count": ("Completion Count", None, None),
    "late_count": ("Late Count", None, None),
}

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    entities = []
    for task in coordinator.tasks.values():
        for sensor_type in SENSOR_TYPES:
            entities.append(MaintenanceSensor(coordinator, task.id, sensor_type))
    async_add_entities(entities)

class MaintenanceSensor(SensorEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator, task_id: str, sensor_type: str) -> None:
        self.coordinator = coordinator
        self.task_id = task_id
        self.sensor_type = sensor_type
        name, unit, device_class = SENSOR_TYPES[sensor_type]
        self._attr_name = name
        self._attr_native_unit_of_measurement = unit
        self._attr_device_class = device_class
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
        return {
            "identifiers": {task.device_identifier},
            "name": task.name,
            "manufacturer": "Home Maintenance Manager",
            "model": "Maintenance Task",
            "sw_version": "0.1.0",
        }

    @property
    def native_value(self):
        task = self.task
        if self.sensor_type == "status":
            return task.status(self.hass)
        if self.sensor_type == "percent_used":
            value = task.percent_used(self.hass)
            return round(value, 1) if value is not None else None
        if self.sensor_type == "days_remaining":
            value = task.days_remaining(self.hass)
            return round(value, 1) if value is not None else None
        if self.sensor_type == "runtime_remaining":
            value = task.runtime_remaining(self.hass)
            return round(value, 1) if value is not None else None
        if self.sensor_type == "last_completed":
            return dt_util.parse_datetime(task.last_completed) if task.last_completed else None
        if self.sensor_type == "completion_count":
            return len(task.completion_history)
        if self.sensor_type == "late_count":
            return task.late_count
        return None

    @property
    def extra_state_attributes(self):
        task = self.task
        if self.sensor_type == "status":
            return {
                "category": task.category,
                "description": task.description,
                "instructions": task.instructions,
                "checklist": task.checklist,
                "parts": task.parts,
                "tools": task.tools,
                "linked_entities": task.linked_entities,
                "rule_logic": task.rule_logic,
                "rule_progress": [p.__dict__ for p in task.rule_progress(self.hass)],
                "nfc_action": task.nfc_action,
                "notification_mode": task.notification_mode,
            }
        return None
