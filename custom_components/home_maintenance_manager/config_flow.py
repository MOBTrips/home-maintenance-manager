from __future__ import annotations

import json
import re
from copy import deepcopy
from datetime import timedelta
from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.const import CONF_NAME
from homeassistant.core import callback
from homeassistant.helpers import selector
from homeassistant.util import dt as dt_util

from .const import CONF_TASKS, DOMAIN

CATEGORIES = [
    "General", "HVAC", "Pool", "Hot Tub", "Appliance", "Plumbing", "Electrical",
    "Yard", "Vehicle", "3D Printer", "Seasonal", "Safety", "Other",
]
TIME_UNITS = ["days", "weeks", "months", "years"]
SCHEDULE_TYPES = ["time", "usage", "service_due", "time_or_usage", "time_and_usage"]
LAST_PERFORMED_MODES = ["today", "days_ago", "specific_date", "unknown"]
RUNTIME_METHODS = ["entity_on", "above_threshold", "specific_state"]
SERVICE_DUE_TYPES = ["binary", "status", "remaining_percent", "next_due_timestamp"]
SERVICE_DUE_UNAVAILABLE_BEHAVIORS = ["ignore", "mark_due", "warning"]


def _friendly_service_name(service: str) -> str:
    name = service.replace("notify.", "").replace("mobile_app_", "Mobile app - ")
    name = name.replace("_", " ").strip()
    return name[:1].upper() + name[1:] if name else service

def _notify_service_options(hass) -> list[dict[str, str]]:
    services = hass.services.async_services().get("notify", {})
    opts: list[dict[str, str]] = []
    for service in sorted(services):
        full = f"notify.{service}"
        label = _friendly_service_name(full)
        opts.append({"value": full, "label": label})
    return opts


def _slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9_]+", "_", value)
    value = re.sub(r"_+", "_", value).strip("_")
    return value or "maintenance_task"


def _csv_to_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _list_to_csv(value: list[str] | None) -> str:
    return ", ".join(value or [])


def _json_loads(value: str | None, default: Any) -> Any:
    if value is None or str(value).strip() == "":
        return deepcopy(default)
    return json.loads(value)


def _json_dumps(value: Any) -> str:
    return json.dumps(value or [], indent=2)


def _tasks_from_entry(config_entry: config_entries.ConfigEntry) -> list[dict[str, Any]]:
    return deepcopy(config_entry.options.get(CONF_TASKS, []))


def _days_from_time(value: float, unit: str) -> float:
    if unit == "weeks":
        return value * 7
    if unit == "months":
        return value * 30.4375
    if unit == "years":
        return value * 365.25
    return value


def _time_unit_from_days(days: float) -> tuple[float, str]:
    # Prefer user friendly whole-ish units when editing.
    for unit, div in (("years", 365.25), ("months", 30.4375), ("weeks", 7)):
        val = days / div
        if abs(val - round(val)) < 0.01 and val >= 1:
            return round(val, 2), unit
    return round(days, 2), "days"


def _baseline_from_input(mode: str, days_ago: int | None, date_text: str | None) -> str:
    now = dt_util.utcnow()
    if mode == "days_ago":
        return (now - timedelta(days=int(days_ago or 0))).isoformat()
    if mode == "specific_date" and date_text:
        # Accept YYYY-MM-DD. Store at noon local/UTC-ish to avoid timezone edge cases.
        try:
            parsed = dt_util.parse_datetime(date_text)
            if parsed:
                return parsed.isoformat()
        except Exception:
            pass
        try:
            return dt_util.parse_datetime(f"{date_text}T12:00:00+00:00").isoformat()
        except Exception:
            return now.isoformat()
    # Unknown still needs a baseline so the task works immediately. Mark as estimated.
    return now.isoformat()


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle the Home Maintenance Manager config flow."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry):
        return OptionsFlowHandler()

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(
                title=user_input[CONF_NAME],
                data={},
                options={CONF_TASKS: []},
            )
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required(CONF_NAME, default="Home Maintenance Manager"): str}),
        )


class OptionsFlowHandler(config_entries.OptionsFlowWithReload):
    """Homeowner-friendly UI task editor for Home Maintenance Manager."""

    def _ensure_state(self) -> None:
        if hasattr(self, "tasks"):
            return
        self.tasks: list[dict[str, Any]] = _tasks_from_entry(self.config_entry)
        self._selected_task_id: str | None = None
        self._task_in_progress: dict[str, Any] | None = None

    async def async_step_init(self, user_input=None):
        self._ensure_state()
        task_count = len(self.tasks)
        if user_input is not None:
            action = user_input["action"]
            if action == "add":
                self._selected_task_id = None
                self._task_in_progress = None
                return await self.async_step_task_name()
            if action == "edit":
                return await self.async_step_select_edit()
            if action == "delete":
                return await self.async_step_select_delete()
            if action == "import_json":
                return await self.async_step_import_json()
            if action == "finish":
                return self.async_create_entry(title="", data={CONF_TASKS: self.tasks})

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({
                vol.Required("action", default="add"): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": "add", "label": "Add a maintenance task"},
                            {"value": "edit", "label": f"Edit a maintenance task ({task_count} configured)"},
                            {"value": "delete", "label": "Delete a maintenance task"},
                            {"value": "import_json", "label": "Import/replace UI tasks from JSON"},
                            {"value": "finish", "label": "Save and reload"},
                        ],
                        mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                )
            }),
            description_placeholders={"task_count": str(task_count)},
        )

    def _task_options(self) -> list[dict[str, str]]:
        return [{"value": task["id"], "label": f"{task.get('name', task['id'])}"} for task in self.tasks]

    def _find_task_index(self, task_id: str) -> int | None:
        for idx, task in enumerate(self.tasks):
            if task["id"] == task_id:
                return idx
        return None

    async def async_step_select_edit(self, user_input=None):
        if not self.tasks:
            return await self.async_step_init()
        if user_input is not None:
            self._selected_task_id = user_input["task_id"]
            idx = self._find_task_index(self._selected_task_id)
            self._task_in_progress = deepcopy(self.tasks[idx]) if idx is not None else None
            return await self.async_step_task_name()
        return self.async_show_form(
            step_id="select_edit",
            data_schema=vol.Schema({
                vol.Required("task_id"): selector.SelectSelector(
                    selector.SelectSelectorConfig(options=self._task_options(), mode=selector.SelectSelectorMode.DROPDOWN)
                )
            }),
        )

    async def async_step_select_delete(self, user_input=None):
        if not self.tasks:
            return await self.async_step_init()
        if user_input is not None:
            self._selected_task_id = user_input["task_id"]
            return await self.async_step_confirm_delete()
        return self.async_show_form(
            step_id="select_delete",
            data_schema=vol.Schema({
                vol.Required("task_id"): selector.SelectSelector(
                    selector.SelectSelectorConfig(options=self._task_options(), mode=selector.SelectSelectorMode.DROPDOWN)
                )
            }),
        )

    async def async_step_confirm_delete(self, user_input=None):
        if user_input is not None:
            if user_input.get("confirm") and self._selected_task_id:
                self.tasks = [task for task in self.tasks if task["id"] != self._selected_task_id]
            self._selected_task_id = None
            return await self.async_step_init()
        name = next((task.get("name") for task in self.tasks if task["id"] == self._selected_task_id), self._selected_task_id)
        return self.async_show_form(
            step_id="confirm_delete",
            data_schema=vol.Schema({vol.Required("confirm", default=False): bool}),
            description_placeholders={"task_name": str(name)},
        )

    async def async_step_task_name(self, user_input=None):
        errors: dict[str, str] = {}
        existing = self._task_in_progress or {}
        if user_input is not None:
            task_id = existing.get("id") or _slugify(user_input[CONF_NAME])
            base = task_id
            suffix = 2
            while any(task["id"] == task_id and task_id != self._selected_task_id for task in self.tasks):
                task_id = f"{base}_{suffix}"
                suffix += 1
            self._task_in_progress = {
                **existing,
                "id": task_id,
                "name": user_input[CONF_NAME],
                "description": user_input.get("description", ""),
                "category": user_input.get("category", "General"),
                "paused": user_input.get("paused", False),
            }
            return await self.async_step_task_equipment()

        return self.async_show_form(
            step_id="task_name",
            data_schema=vol.Schema({
                vol.Required(CONF_NAME, default=existing.get("name", "")): str,
                vol.Optional("category", default=existing.get("category", "General")): selector.SelectSelector(
                    selector.SelectSelectorConfig(options=CATEGORIES, mode=selector.SelectSelectorMode.DROPDOWN)
                ),
                vol.Optional("description", default=existing.get("description", "")): selector.TextSelector(selector.TextSelectorConfig(multiline=True)),
                vol.Optional("paused", default=existing.get("paused", False)): bool,
            }),
            errors=errors,
        )

    async def async_step_task_equipment(self, user_input=None):
        task = self._task_in_progress or {}
        if user_input is not None:
            if user_input.get("navigation") == "back":
                return await self.async_step_task_name()
            task.update({
                "area": user_input.get("area") or None,
                "linked_device_id": user_input.get("linked_device_id") or None,
                "linked_entities": user_input.get("linked_entities") or [],
            })
            self._task_in_progress = task
            return await self.async_step_task_schedule_type()

        schema = vol.Schema({
            vol.Optional("navigation", default="continue"): selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=[
                        {"value": "continue", "label": "Continue"},
                        {"value": "back", "label": "Back to task name"},
                    ], mode=selector.SelectSelectorMode.DROPDOWN,
                )
            ),
            vol.Optional("area", default=task.get("area") or None): selector.AreaSelector(),
            vol.Optional("linked_device_id", default=task.get("linked_device_id") or None): selector.DeviceSelector(),
            vol.Optional("linked_entities", default=task.get("linked_entities", [])): selector.EntitySelector(selector.EntitySelectorConfig(multiple=True)),
        })
        return self.async_show_form(step_id="task_equipment", data_schema=schema)

    async def async_step_task_schedule_type(self, user_input=None):
        task = self._task_in_progress or {}
        rules = task.get("rules") or []
        has_time = any(r.get("type") == "time" for r in rules)
        has_runtime = any(r.get("type") == "runtime" for r in rules)
        has_service_due = any(r.get("type") == "service_due" for r in rules)
        default_type = "time_or_usage" if has_time and has_runtime and task.get("rule_logic") == "any" else "time_and_usage" if has_time and has_runtime else "service_due" if has_service_due else "usage" if has_runtime else "time"
        if user_input is not None:
            if user_input.get("navigation") == "back":
                return await self.async_step_task_equipment()
            task["_schedule_type"] = user_input["schedule_type"]
            task["warning_percent"] = float(user_input.get("warning_percent", 80)) / 100
            self._task_in_progress = task
            if user_input["schedule_type"] in ("time", "time_or_usage", "time_and_usage"):
                return await self.async_step_task_time_rule()
            if user_input["schedule_type"] == "service_due":
                return await self.async_step_task_service_due_rule()
            return await self.async_step_task_usage_rule()
        return self.async_show_form(
            step_id="task_schedule_type",
            data_schema=vol.Schema({
                vol.Optional("navigation", default="continue"): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": "continue", "label": "Continue"},
                            {"value": "back", "label": "Back to equipment"},
                        ], mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Required("schedule_type", default=default_type): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": "time", "label": "Time based"},
                            {"value": "usage", "label": "Usage/runtime based"},
                            {"value": "service_due", "label": "Service due"},
                            {"value": "time_or_usage", "label": "Time OR usage, whichever comes first"},
                            {"value": "time_and_usage", "label": "Time AND usage"},
                        ], mode=selector.SelectSelectorMode.LIST,
                    )
                ),
                vol.Optional("warning_percent", default=int(float(task.get("warning_percent", 0.8)) * 100)): selector.NumberSelector(
                    selector.NumberSelectorConfig(min=1, max=100, step=1, mode=selector.NumberSelectorMode.SLIDER)
                ),
            })
        )

    async def async_step_task_time_rule(self, user_input=None):
        task = self._task_in_progress or {}
        old = next((r for r in task.get("rules", []) if r.get("type") == "time"), {})
        default_every, default_unit = _time_unit_from_days(float(old.get("days") or 90))
        if user_input is not None:
            if user_input.get("navigation") == "back":
                return await self.async_step_task_schedule_type()
            days = _days_from_time(float(user_input["time_every"]), user_input["time_unit"])
            task["_time_rule"] = {
                "id": "time_1",
                "type": "time",
                "name": f"Every {user_input['time_every']} {user_input['time_unit']}",
                "days": days,
            }
            self._task_in_progress = task
            if task.get("_schedule_type") in ("time_or_usage", "time_and_usage"):
                return await self.async_step_task_usage_rule()
            return await self.async_step_task_last_performed()
        return self.async_show_form(
            step_id="task_time_rule",
            data_schema=vol.Schema({
                vol.Optional("navigation", default="continue"): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": "continue", "label": "Continue"},
                            {"value": "back", "label": "Back to schedule type"},
                        ], mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Required("time_every", default=default_every): selector.NumberSelector(
                    selector.NumberSelectorConfig(min=1, max=10000, step=1, mode=selector.NumberSelectorMode.BOX)
                ),
                vol.Required("time_unit", default=default_unit): selector.SelectSelector(
                    selector.SelectSelectorConfig(options=TIME_UNITS, mode=selector.SelectSelectorMode.DROPDOWN)
                ),
            })
        )

    async def async_step_task_service_due_rule(self, user_input=None):
        task = self._task_in_progress or {}
        old = next((r for r in task.get("rules", []) if r.get("type") == "service_due"), {})
        if user_input is not None:
            if user_input.get("navigation") == "back":
                return await self.async_step_task_schedule_type()
            service_type = user_input["service_due_type"]
            rule: dict[str, Any] = {
                "id": "service_due_1",
                "type": "service_due",
                "name": "Service due",
                "entity": user_input["service_entity"],
                "service_due_type": service_type,
                "unavailable_behavior": user_input.get("unavailable_behavior") or "ignore",
            }
            if service_type == "status":
                rule["due_states"] = _csv_to_list(user_input.get("due_states")) or ["due", "on", "true", "1", "yes"]
                rule["ok_states"] = _csv_to_list(user_input.get("ok_states")) or ["ok", "off", "false", "0", "no"]
            if service_type == "remaining_percent":
                rule["threshold_percent"] = float(user_input.get("threshold_percent") or 10)
            task["_service_due_rule"] = rule
            self._task_in_progress = task
            return await self.async_step_task_last_performed()
        return self.async_show_form(
            step_id="task_service_due_rule",
            data_schema=vol.Schema({
                vol.Optional("navigation", default="continue"): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": "continue", "label": "Continue"},
                            {"value": "back", "label": "Back to schedule type"},
                        ], mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Required("service_entity", default=old.get("entity") or None): selector.EntitySelector(),
                vol.Required("service_due_type", default=old.get("service_due_type") or "binary"): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": "binary", "label": "Binary due entity"},
                            {"value": "status", "label": "Status enum/state entity"},
                            {"value": "remaining_percent", "label": "Remaining percent entity"},
                            {"value": "next_due_timestamp", "label": "Next due timestamp entity"},
                        ], mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Optional("due_states", default=_list_to_csv(old.get("due_states") or ["due", "on", "true", "1", "yes"])): str,
                vol.Optional("ok_states", default=_list_to_csv(old.get("ok_states") or ["ok", "off", "false", "0", "no"])): str,
                vol.Optional("threshold_percent", default=float(old.get("threshold_percent") or 10)): selector.NumberSelector(
                    selector.NumberSelectorConfig(min=0, max=100, step=0.1, mode=selector.NumberSelectorMode.BOX)
                ),
                vol.Optional("unavailable_behavior", default=old.get("unavailable_behavior") or "ignore"): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": "ignore", "label": "Ignore / not due"},
                            {"value": "mark_due", "label": "Mark due"},
                            {"value": "warning", "label": "Warning only"},
                        ], mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
            })
        )

    async def async_step_task_usage_rule(self, user_input=None):
        task = self._task_in_progress or {}
        old = next((r for r in task.get("rules", []) if r.get("type") == "runtime"), {})
        default_method = "above_threshold" if "above" in old else "specific_state" if "states" in old else "entity_on"
        if user_input is not None:
            if user_input.get("navigation") == "back":
                if task.get("_schedule_type") in ("time_or_usage", "time_and_usage"):
                    return await self.async_step_task_time_rule()
                return await self.async_step_task_schedule_type()
            rule: dict[str, Any] = {
                "id": "runtime_1",
                "type": "runtime",
                "name": f"Every {user_input['runtime_hours']} runtime hours",
                "entity": user_input["runtime_entity"],
                "hours": float(user_input["runtime_hours"]),
            }
            method = user_input["runtime_method"]
            if method == "above_threshold":
                rule["above"] = float(user_input.get("above_threshold") or 0)
            elif method == "specific_state":
                rule["states"] = _csv_to_list(user_input.get("specific_states")) or ["on"]
            task["_runtime_rule"] = rule
            self._task_in_progress = task
            return await self.async_step_task_last_performed()
        return self.async_show_form(
            step_id="task_usage_rule",
            data_schema=vol.Schema({
                vol.Optional("navigation", default="continue"): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": "continue", "label": "Continue"},
                            {"value": "back", "label": "Back to previous schedule step"},
                        ], mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Required("runtime_entity", default=old.get("entity") or None): selector.EntitySelector(),
                vol.Required("runtime_hours", default=float(old.get("hours") or 100)): selector.NumberSelector(
                    selector.NumberSelectorConfig(min=0.1, max=100000, step=0.1, mode=selector.NumberSelectorMode.BOX)
                ),
                vol.Required("runtime_method", default=default_method): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": "entity_on", "label": "Count while entity is on/running"},
                            {"value": "above_threshold", "label": "Count while sensor is above a threshold"},
                            {"value": "specific_state", "label": "Count while entity is in specific state(s)"},
                        ], mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Optional("above_threshold", default=old.get("above", 10)): selector.NumberSelector(
                    selector.NumberSelectorConfig(min=-100000, max=100000, step=0.1, mode=selector.NumberSelectorMode.BOX)
                ),
                vol.Optional("specific_states", default=_list_to_csv(old.get("states") or [])): str,
            })
        )

    async def async_step_task_last_performed(self, user_input=None):
        task = self._task_in_progress or {}
        if user_input is not None:
            if user_input.get("navigation") == "back":
                if task.get("_schedule_type") in ("usage", "time_or_usage", "time_and_usage"):
                    return await self.async_step_task_usage_rule()
                if task.get("_schedule_type") == "service_due":
                    return await self.async_step_task_service_due_rule()
                return await self.async_step_task_time_rule()
            # Compose rules from the wizard. Keep manually imported advanced rules only when editing advanced later.
            rules = []
            if task.get("_time_rule"):
                rules.append(task["_time_rule"])
            if task.get("_runtime_rule"):
                rules.append(task["_runtime_rule"])
            if task.get("_service_due_rule"):
                rules.append(task["_service_due_rule"])
            schedule_type = task.get("_schedule_type", "time")
            rule_logic = "all" if schedule_type == "time_and_usage" else "any"
            due_logic = "all_rules_due" if schedule_type == "time_and_usage" else "any_rule_due" if schedule_type == "time_or_usage" else "rule1_only"
            task["rules"] = rules
            task["rule_logic"] = rule_logic
            task["due_logic"] = due_logic
            task["primary_rule_id"] = None
            if not self._selected_task_id and not task.get("last_completed"):
                task["last_completed"] = _baseline_from_input(user_input["last_performed_mode"], user_input.get("days_ago"), user_input.get("specific_date"))
                task["baseline_method"] = user_input["last_performed_mode"]
            self._task_in_progress = task
            return await self.async_step_task_notifications()
        return self.async_show_form(
            step_id="task_last_performed",
            data_schema=vol.Schema({
                vol.Optional("navigation", default="continue"): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": "continue", "label": "Continue"},
                            {"value": "back", "label": "Back to schedule"},
                        ], mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Required("last_performed_mode", default="today"): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": "today", "label": "Today"},
                            {"value": "days_ago", "label": "A number of days ago"},
                            {"value": "specific_date", "label": "A specific date"},
                            {"value": "unknown", "label": "Unknown / start tracking today"},
                        ], mode=selector.SelectSelectorMode.LIST,
                    )
                ),
                vol.Optional("days_ago", default=0): selector.NumberSelector(
                    selector.NumberSelectorConfig(min=0, max=10000, step=1, mode=selector.NumberSelectorMode.BOX)
                ),
                vol.Optional("specific_date", default=""): str,
            })
        )

    async def async_step_task_notifications(self, user_input=None):
        task = self._task_in_progress or {}
        if user_input is not None:
            if user_input.get("navigation") == "back":
                return await self.async_step_task_last_performed()
            task.update({
                "notification_mode": user_input.get("notification_mode", "automation_only"),
                "mobile_notify_service": user_input.get("mobile_notify_service") or None,
                "allow_snooze": user_input.get("allow_snooze", True),
                "max_snooze_days": int(user_input.get("max_snooze_days", 30) or 30),
            })
            self._task_in_progress = task
            if user_input.get("advanced_setup"):
                return await self.async_step_task_advanced()
            return await self._save_task_and_return()
        return self.async_show_form(
            step_id="task_notifications",
            data_schema=vol.Schema({
                vol.Optional("navigation", default="continue"): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": "continue", "label": "Continue"},
                            {"value": "back", "label": "Back to last performed"},
                        ], mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Required("notification_mode", default=task.get("notification_mode", "automation_only")): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": "none", "label": "No built-in notifications"},
                            {"value": "persistent", "label": "Home Assistant persistent notification"},
                            {"value": "mobile", "label": "Mobile app notification"},
                            {"value": "both", "label": "Persistent + mobile"},
                            {"value": "automation_only", "label": "Automation only"},
                        ], mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Optional("mobile_notify_service", default=task.get("mobile_notify_service") or ""): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=_notify_service_options(self.hass),
                        mode=selector.SelectSelectorMode.DROPDOWN,
                        custom_value=True,
                    )
                ),
                vol.Optional("allow_snooze", default=task.get("allow_snooze", True)): bool,
                vol.Optional("max_snooze_days", default=task.get("max_snooze_days", 30)): int,
                vol.Optional("advanced_setup", default=False): bool,
            })
        )

    async def async_step_task_advanced(self, user_input=None):
        task = self._task_in_progress or {}
        if user_input is not None:
            if user_input.get("navigation") == "back":
                return await self.async_step_task_notifications()
            task.update({
                "nfc_tags": _csv_to_list(user_input.get("nfc_tags")),
                "nfc_action": user_input.get("nfc_action", "confirm"),
                "max_snooze_count": int(user_input.get("max_snooze_count", 0) or 0),
            })
            self._task_in_progress = task
            return await self.async_step_task_details()
        return self.async_show_form(
            step_id="task_advanced",
            data_schema=vol.Schema({
                vol.Optional("navigation", default="continue"): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": "continue", "label": "Continue"},
                            {"value": "back", "label": "Back to notifications"},
                        ], mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Optional("nfc_tags", default=_list_to_csv(task.get("nfc_tags"))): str,
                vol.Required("nfc_action", default=task.get("nfc_action", "confirm")): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": "complete", "label": "Scan marks complete immediately"},
                            {"value": "confirm", "label": "Scan requires confirmation"},
                            {"value": "inspection", "label": "Scan logs inspection only"},
                            {"value": "open_dashboard", "label": "Scan opens dashboard/details"},
                            {"value": "disabled", "label": "Disabled"},
                        ], mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Optional("max_snooze_count", default=task.get("max_snooze_count", 0)): int,
            })
        )

    async def async_step_task_details(self, user_input=None):
        errors: dict[str, str] = {}
        task = self._task_in_progress or {}
        if user_input is not None:
            if user_input.get("navigation") == "back":
                return await self.async_step_task_advanced()
            try:
                checklist = _json_loads(user_input.get("checklist_json"), [])
                parts = _json_loads(user_input.get("parts_json"), [])
                tools = _csv_to_list(user_input.get("tools"))
                if not isinstance(checklist, list) or not isinstance(parts, list):
                    errors["checklist_json"] = "invalid_json"
                else:
                    task.update({
                        "instructions": user_input.get("instructions", ""),
                        "checklist": checklist,
                        "parts": parts,
                        "tools": tools,
                    })
                    return await self.async_step_task_rules_advanced()
            except json.JSONDecodeError:
                errors["checklist_json"] = "invalid_json"
        return self.async_show_form(
            step_id="task_details",
            data_schema=vol.Schema({
                vol.Optional("navigation", default="continue"): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": "continue", "label": "Continue"},
                            {"value": "back", "label": "Back to advanced options"},
                        ], mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Optional("instructions", default=task.get("instructions", "")): selector.TextSelector(selector.TextSelectorConfig(multiline=True)),
                vol.Optional("checklist_json", default=_json_dumps(task.get("checklist") or [])): selector.TextSelector(selector.TextSelectorConfig(multiline=True)),
                vol.Optional("parts_json", default=_json_dumps(task.get("parts") or [])): selector.TextSelector(selector.TextSelectorConfig(multiline=True)),
                vol.Optional("tools", default=_list_to_csv(task.get("tools"))): str,
            }),
            errors=errors,
        )

    async def async_step_task_rules_advanced(self, user_input=None):
        """Optional escape hatch for power users who need multiple custom rules."""
        errors: dict[str, str] = {}
        task = self._task_in_progress or {}
        if user_input is not None:
            if user_input.get("navigation") == "back":
                return await self.async_step_task_details()
            try:
                rules = _json_loads(user_input.get("rules_json"), task.get("rules", []))
                if not isinstance(rules, list):
                    errors["rules_json"] = "invalid_json"
                else:
                    rule_logic = user_input.get("rule_logic", task.get("rule_logic", "any"))
                    due_logic = "all_rules_due" if rule_logic == "all" else "rule1_only" if rule_logic == "primary" else "any_rule_due"
                    task.update({
                        "rules": rules,
                        "rule_logic": rule_logic,
                        "due_logic": due_logic,
                        "primary_rule_id": user_input.get("primary_rule_id") or None,
                    })
                    return await self._save_task_and_return()
            except json.JSONDecodeError:
                errors["rules_json"] = "invalid_json"
        return self.async_show_form(
            step_id="task_rules_advanced",
            data_schema=vol.Schema({
                vol.Optional("navigation", default="continue"): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": "continue", "label": "Save task"},
                            {"value": "back", "label": "Back to details"},
                        ], mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Required("rule_logic", default=task.get("rule_logic", "any")): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": "any", "label": "Any rule makes the task due"},
                            {"value": "all", "label": "All rules must be due"},
                            {"value": "primary", "label": "Primary rule controls due state"},
                        ], mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Optional("primary_rule_id", default=task.get("primary_rule_id") or ""): str,
                vol.Required("rules_json", default=_json_dumps(task.get("rules") or [])): selector.TextSelector(selector.TextSelectorConfig(multiline=True)),
            }), errors=errors,
        )

    async def _save_task_and_return(self):
        task = self._task_in_progress
        if not task:
            return await self.async_step_init()
        # Remove temporary wizard fields.
        for key in list(task):
            if key.startswith("_"):
                task.pop(key, None)
        idx = self._find_task_index(self._selected_task_id or task["id"])
        if idx is None:
            self.tasks.append(task)
        else:
            self.tasks[idx] = task
        self._selected_task_id = None
        self._task_in_progress = None
        return await self.async_step_init()

    async def async_step_import_json(self, user_input=None):
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                imported = json.loads(user_input.get("tasks_json", "[]"))
                if not isinstance(imported, list):
                    errors["tasks_json"] = "invalid_json"
                else:
                    self.tasks = imported
                    return await self.async_step_init()
            except json.JSONDecodeError:
                errors["tasks_json"] = "invalid_json"
        return self.async_show_form(
            step_id="import_json",
            data_schema=vol.Schema({
                vol.Required("tasks_json", default=_json_dumps(self.tasks)): selector.TextSelector(selector.TextSelectorConfig(multiline=True))
            }),
            errors=errors,
        )
