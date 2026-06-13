from __future__ import annotations

import json
import re
from copy import deepcopy
from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.const import CONF_NAME
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import CONF_TASKS, DOMAIN


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


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle the Home Maintenance Manager config flow."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry):
        # Home Assistant injects the current config entry into the options flow.
        # Passing/storing config_entry manually causes a 500 error on newer HA versions.
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
    """UI task editor for Home Maintenance Manager."""

    def _ensure_state(self) -> None:
        """Initialize per-flow editor state after HA has attached config_entry."""
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
                return await self.async_step_task_basic()
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
        return [{"value": task["id"], "label": f"{task.get('name', task['id'])} ({task['id']})"} for task in self.tasks]

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
            return await self.async_step_task_basic()
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

    async def async_step_task_basic(self, user_input=None):
        errors: dict[str, str] = {}
        existing = self._task_in_progress or {}
        if user_input is not None:
            task_id = user_input.get("id") or _slugify(user_input[CONF_NAME])
            task_id = _slugify(task_id)
            duplicate = any(task["id"] == task_id and task_id != self._selected_task_id for task in self.tasks)
            if duplicate:
                errors["id"] = "duplicate_task_id"
            else:
                self._task_in_progress = {
                    **existing,
                    "id": task_id,
                    "name": user_input[CONF_NAME],
                    "description": user_input.get("description", ""),
                    "category": user_input.get("category", "General"),
                    "area": user_input.get("area") or None,
                    "linked_entities": user_input.get("linked_entities") or [],
                    "paused": user_input.get("paused", False),
                    "warning_percent": float(user_input.get("warning_percent", 80)) / 100,
                }
                return await self.async_step_task_rules()

        schema = vol.Schema({
            vol.Optional("id", default=existing.get("id", "")): str,
            vol.Required(CONF_NAME, default=existing.get("name", "")): str,
            vol.Optional("description", default=existing.get("description", "")): selector.TextSelector(selector.TextSelectorConfig(multiline=True)),
            vol.Optional("category", default=existing.get("category", "General")): str,
            vol.Optional("area", default=existing.get("area", "")): str,
            vol.Optional("linked_entities", default=existing.get("linked_entities", [])): selector.EntitySelector(selector.EntitySelectorConfig(multiple=True)),
            vol.Optional("warning_percent", default=int(float(existing.get("warning_percent", 0.8)) * 100)): selector.NumberSelector(
                selector.NumberSelectorConfig(min=1, max=100, step=1, mode=selector.NumberSelectorMode.SLIDER)
            ),
            vol.Optional("paused", default=existing.get("paused", False)): bool,
        })
        return self.async_show_form(step_id="task_basic", data_schema=schema, errors=errors)

    async def async_step_task_rules(self, user_input=None):
        errors: dict[str, str] = {}
        task = self._task_in_progress or {}
        if user_input is not None:
            try:
                rules = _json_loads(user_input.get("rules_json"), [])
                if not isinstance(rules, list):
                    errors["rules_json"] = "invalid_json"
                else:
                    task.update({
                        "rules": rules,
                        "rule_logic": user_input.get("rule_logic", "any"),
                        "primary_rule_id": user_input.get("primary_rule_id") or None,
                    })
                    self._task_in_progress = task
                    return await self.async_step_task_nfc_notifications()
            except json.JSONDecodeError:
                errors["rules_json"] = "invalid_json"

        return self.async_show_form(
            step_id="task_rules",
            data_schema=vol.Schema({
                vol.Required("rule_logic", default=task.get("rule_logic", "any")): selector.SelectSelector(
                    selector.SelectSelectorConfig(options=["any", "all", "primary"], mode=selector.SelectSelectorMode.DROPDOWN)
                ),
                vol.Optional("primary_rule_id", default=task.get("primary_rule_id") or ""): str,
                vol.Required("rules_json", default=_json_dumps(task.get("rules") or [{"id": "time_1", "type": "time", "name": "Every 90 days", "days": 90}])): selector.TextSelector(selector.TextSelectorConfig(multiline=True)),
            }),
            errors=errors,
        )

    async def async_step_task_nfc_notifications(self, user_input=None):
        task = self._task_in_progress or {}
        if user_input is not None:
            task.update({
                "nfc_tags": _csv_to_list(user_input.get("nfc_tags")),
                "nfc_action": user_input.get("nfc_action", "confirm"),
                "notification_mode": user_input.get("notification_mode", "automation_only"),
                "mobile_notify_service": user_input.get("mobile_notify_service") or None,
                "allow_snooze": user_input.get("allow_snooze", True),
                "max_snooze_count": int(user_input.get("max_snooze_count", 0) or 0),
                "max_snooze_days": int(user_input.get("max_snooze_days", 30) or 30),
            })
            self._task_in_progress = task
            return await self.async_step_task_details()

        return self.async_show_form(
            step_id="task_nfc_notifications",
            data_schema=vol.Schema({
                vol.Optional("nfc_tags", default=_list_to_csv(task.get("nfc_tags"))): str,
                vol.Required("nfc_action", default=task.get("nfc_action", "confirm")): selector.SelectSelector(
                    selector.SelectSelectorConfig(options=["complete", "confirm", "inspection", "open_dashboard", "disabled"], mode=selector.SelectSelectorMode.DROPDOWN)
                ),
                vol.Required("notification_mode", default=task.get("notification_mode", "automation_only")): selector.SelectSelector(
                    selector.SelectSelectorConfig(options=["none", "persistent", "mobile", "both", "automation_only"], mode=selector.SelectSelectorMode.DROPDOWN)
                ),
                vol.Optional("mobile_notify_service", default=task.get("mobile_notify_service") or ""): str,
                vol.Optional("allow_snooze", default=task.get("allow_snooze", True)): bool,
                vol.Optional("max_snooze_count", default=task.get("max_snooze_count", 0)): int,
                vol.Optional("max_snooze_days", default=task.get("max_snooze_days", 30)): int,
            }),
        )

    async def async_step_task_details(self, user_input=None):
        errors: dict[str, str] = {}
        task = self._task_in_progress or {}
        if user_input is not None:
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
                    return await self._save_task_and_return()
            except json.JSONDecodeError:
                errors["checklist_json"] = "invalid_json"

        return self.async_show_form(
            step_id="task_details",
            data_schema=vol.Schema({
                vol.Optional("instructions", default=task.get("instructions", "")): selector.TextSelector(selector.TextSelectorConfig(multiline=True)),
                vol.Optional("checklist_json", default=_json_dumps(task.get("checklist") or [])): selector.TextSelector(selector.TextSelectorConfig(multiline=True)),
                vol.Optional("parts_json", default=_json_dumps(task.get("parts") or [])): selector.TextSelector(selector.TextSelectorConfig(multiline=True)),
                vol.Optional("tools", default=_list_to_csv(task.get("tools"))): str,
            }),
            errors=errors,
        )

    async def _save_task_and_return(self):
        task = self._task_in_progress
        if not task:
            return await self.async_step_init()
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
