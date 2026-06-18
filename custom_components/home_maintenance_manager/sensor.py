from __future__ import annotations

from homeassistant.components.sensor import SensorEntity, SensorDeviceClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import PERCENTAGE, UnitOfTime
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import DOMAIN

SENSOR_TYPES = {
    "summary": ("Summary", None, None),
    "status": ("Status", None, None),
    "percent_used": ("Percent Used", PERCENTAGE, None),
    "days_remaining": ("Days Remaining", UnitOfTime.DAYS, None),
    # Unit intentionally omitted so time-only tasks can show N/A instead of Unknown.
    "runtime_remaining": ("Runtime Remaining", None, None),
    "usage_used": ("Metered Usage Used", None, None),
    "usage_remaining": ("Metered Usage Remaining", None, None),
    "totalized_usage": ("Totalized Usage", None, None),
    "next_due": ("Next Due", None, SensorDeviceClass.TIMESTAMP),
    "last_completed": ("Last Completed", None, SensorDeviceClass.TIMESTAMP),
    "completion_count": ("Completion Count", None, None),
    "late_count": ("Late Count", None, None),
}

GLOBAL_SENSOR_TYPES = {
    "health_score": ("Maintenance Health Score", PERCENTAGE, None),
    "tasks_upcoming": ("Maintenance Tasks Upcoming", None, None),
    "tasks_due": ("Maintenance Tasks Due", None, None),
    "tasks_overdue": ("Maintenance Tasks Overdue", None, None),
}

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    entities = [MaintenanceGlobalSensor(coordinator, sensor_type) for sensor_type in GLOBAL_SENSOR_TYPES]
    for task in coordinator.tasks.values():
        for sensor_type in SENSOR_TYPES:
            entities.append(MaintenanceSensor(coordinator, task.id, sensor_type))
    async_add_entities(entities)

class MaintenanceGlobalSensor(SensorEntity):
    _attr_has_entity_name = False

    def __init__(self, coordinator, sensor_type: str) -> None:
        self.coordinator = coordinator
        self.sensor_type = sensor_type
        name, unit, device_class = GLOBAL_SENSOR_TYPES[sensor_type]
        self._attr_name = name
        self._attr_native_unit_of_measurement = unit
        self._attr_device_class = device_class
        self._attr_unique_id = f"home_maintenance_manager_{sensor_type}"

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.coordinator.async_add_listener(self._handle_update))

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()

    @property
    def device_info(self):
        return {
            "identifiers": {(DOMAIN, "manager")},
            "name": "Home Maintenance Manager",
            "manufacturer": "Home Maintenance Manager",
            "model": "Maintenance Manager",
        }

    def _counts(self):
        statuses = [task.status(self.hass) for task in self.coordinator.tasks.values()]
        return {
            "total": len(statuses),
            "upcoming": statuses.count("upcoming"),
            "due": statuses.count("due"),
            "overdue": statuses.count("overdue"),
            "paused": statuses.count("paused"),
            "snoozed": statuses.count("snoozed"),
            "unknown": statuses.count("unknown"),
        }

    @property
    def native_value(self):
        counts = self._counts()
        if self.sensor_type == "tasks_upcoming":
            return counts["upcoming"]
        if self.sensor_type == "tasks_due":
            return counts["due"]
        if self.sensor_type == "tasks_overdue":
            return counts["overdue"]
        if self.sensor_type == "health_score":
            total = counts["total"] or 0
            if total == 0:
                return 100
            penalty = counts["overdue"] * 35 + counts["due"] * 20 + counts["upcoming"] * 5 + counts["unknown"] * 10
            return max(0, round(100 - (penalty / total), 1))
        return None

    @property
    def extra_state_attributes(self):
        return self._counts()

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
        if self.task_id in self.coordinator.tasks:
            self.async_write_ha_state()

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
        info = {
            "identifiers": {task.device_identifier},
            "name": task.name,
            "manufacturer": "Home Maintenance Manager",
            "model": "Maintenance Task",
            "sw_version": "0.6.5",
        }
        if task.area:
            info["suggested_area"] = task.area
        return info

    @property
    def native_value(self):
        task = self.task
        if task is None:
            return None
        if self.sensor_type == "summary":
            return task.status(self.hass)
        if self.sensor_type == "status":
            return task.status(self.hass)
        if self.sensor_type == "percent_used":
            value = task.percent_used(self.hass)
            return round(value, 1) if value is not None else None
        if self.sensor_type == "days_remaining":
            value = task.days_remaining(self.hass)
            return round(value, 1) if value is not None else None
        if self.sensor_type == "runtime_remaining":
            if not task.has_runtime_rule():
                return "N/A"
            value = task.runtime_remaining(self.hass)
            return round(value, 1) if value is not None else None
        if self.sensor_type == "usage_used":
            if not task.has_counter_rule():
                return "N/A"
            value = task.counter_used(self.hass)
            return round(value, 1) if value is not None else None
        if self.sensor_type == "usage_remaining":
            if not task.has_counter_rule():
                return "N/A"
            value = task.counter_remaining(self.hass)
            return round(value, 1) if value is not None else None
        if self.sensor_type == "totalized_usage":
            # Only meaningful for rate-based metered usage rules.
            for rule in task.rules:
                if rule.get("type") == "counter" and rule.get("source_mode") == "rate":
                    value = task.totalized_usage.get(str(rule.get("id") or rule.get("entity")), 0)
                    return round(value, 1)
            return None
        if self.sensor_type == "next_due":
            return task.next_due_datetime(self.hass)
        if self.sensor_type == "last_completed":
            return dt_util.parse_datetime(task.last_completed) if task.last_completed else None
        if self.sensor_type == "completion_count":
            return len(task.completion_history)
        if self.sensor_type == "late_count":
            return task.late_count
        return None

    def _rate_target_unit(self, unit: str | None) -> str | None:
        if not unit:
            return None
        u = str(unit).strip()
        lower = u.lower().replace(" ", "")
        if lower == "w":
            return "kWh"
        for sep in ("/min", "/minute", "/h", "/hr", "/hour", "/s", "/sec", "/second"):
            if sep in lower and "/" in u:
                return u.split("/", 1)[0].strip() or "units"
        for sep in ("permin", "perminute", "perhour", "persecond"):
            if sep in lower:
                return u.split("per", 1)[0].strip() or "units"
        return "units"

    @property
    def native_unit_of_measurement(self):
        if self.sensor_type == "totalized_usage":
            task = self.task
            if task is None:
                return None
            for rule in task.rules:
                if rule.get("type") == "counter" and rule.get("source_mode") == "rate":
                    if rule.get("target_unit"):
                        return str(rule.get("target_unit"))
                    source_unit = rule.get("source_unit") or rule.get("unit")
                    if not source_unit and rule.get("entity"):
                        state = self.hass.states.get(rule.get("entity"))
                        if state:
                            source_unit = state.attributes.get("unit_of_measurement")
                    return self._rate_target_unit(source_unit)
            return None
        if self.sensor_type in ("usage_used", "usage_remaining"):
            task = self.task
            return task.counter_unit(self.hass) if task is not None else None
        return self._attr_native_unit_of_measurement

    @property
    def extra_state_attributes(self):
        task = self.task
        if task is None:
            return None
        if self.sensor_type in ("summary", "status"):
            attrs = task.summary_attributes(self.hass)
            attrs.update({
                "description": task.description,
                "instructions": task.instructions,
                "checklist": task.checklist,
                "parts": task.parts,
                "tools": task.tools,
                "rule_logic": task.rule_logic,
                "nfc_action": task.nfc_action,
                "notification_mode": task.notification_mode,
            })
            return attrs
        return None
