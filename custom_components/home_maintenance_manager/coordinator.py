from __future__ import annotations

from datetime import timedelta
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DOMAIN, STORAGE_KEY, STORAGE_VERSION, EVENT_ACTIVITY, EVENT_COMPLETION
from .models import MaintenanceTask


class MaintenanceCoordinator:
    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.tasks: dict[str, MaintenanceTask] = {}
        self.listeners: list[callable] = []
        self._unsub: list[callable] = []

    async def async_load(self) -> None:
        data = await self.store.async_load() or {"tasks": []}
        self.tasks = {item["id"]: MaintenanceTask.from_dict(item) for item in data.get("tasks", [])}
        await self.async_save()
        self._setup_tracking()

    async def async_sync_configured_tasks(self, configured_tasks: list[dict[str, Any]]) -> None:
        """Sync UI/YAML task definitions into storage while preserving runtime/history."""
        configured_ids = {task["id"] for task in configured_tasks}
        for task_data in configured_tasks:
            task_id = task_data["id"]
            if task_id in self.tasks:
                self.tasks[task_id].update_config_from_dict(task_data)
            else:
                self.tasks[task_id] = MaintenanceTask.from_dict(task_data)
        # UI/YAML are the source of task definitions. Runtime/history is kept for configured tasks only.
        for task_id in list(self.tasks):
            if task_id not in configured_ids:
                del self.tasks[task_id]
        await self.async_save()
        self._setup_tracking()
        self._notify()

    async def async_upsert_task(self, task_data: dict[str, Any]) -> None:
        if task_data["id"] in self.tasks:
            self.tasks[task_data["id"]].update_config_from_dict(task_data)
        else:
            self.tasks[task_data["id"]] = MaintenanceTask.from_dict(task_data)
        await self.async_save()
        self._setup_tracking()
        self._notify()

    async def async_delete_task(self, task_id: str) -> None:
        if task_id in self.tasks:
            del self.tasks[task_id]
            await self.async_save()
            self._setup_tracking()
            self._notify()

    async def async_save(self) -> None:
        await self.store.async_save({"tasks": [task.as_dict() for task in self.tasks.values()]})

    def async_add_listener(self, listener: callable) -> callable:
        self.listeners.append(listener)
        def remove() -> None:
            if listener in self.listeners:
                self.listeners.remove(listener)
        return remove

    @callback
    def _notify(self) -> None:
        for listener in list(self.listeners):
            listener()

    def _setup_tracking(self) -> None:
        for unsub in self._unsub:
            unsub()
        self._unsub.clear()
        entity_ids = set()
        for task in self.tasks.values():
            for rule in task.rules:
                if rule.get("type") == "runtime" and rule.get("entity"):
                    entity_ids.add(rule["entity"])
        for entity_id in entity_ids:
            self._unsub.append(async_track_state_change_event(self.hass, entity_id, self._state_changed))
        self._unsub.append(async_track_time_interval(self.hass, self._tick, timedelta(minutes=1)))

    @callback
    def _state_changed(self, event) -> None:
        self.hass.async_create_task(self._update_runtime())

    async def _tick(self, now) -> None:
        await self._update_runtime()

    async def _update_runtime(self) -> None:
        now = dt_util.utcnow()
        changed = False
        for task in self.tasks.values():
            for rule in task.rules:
                if rule.get("type") != "runtime" or not rule.get("entity"):
                    continue
                entity_id = rule["entity"]
                state = self.hass.states.get(entity_id)
                last = task.last_seen_states.get(entity_id, {})
                last_seen = dt_util.parse_datetime(last.get("seen_at")) if last.get("seen_at") else now
                was_running = bool(last.get("running", False))
                if was_running and last_seen:
                    task.runtime_seconds[entity_id] = task.runtime_seconds.get(entity_id, 0) + max((now - last_seen).total_seconds(), 0)
                    changed = True
                running = self._is_rule_running(rule, state.state if state else None)
                task.last_seen_states[entity_id] = {"seen_at": now.isoformat(), "running": running}
        if changed:
            await self.async_save()
            self._notify()

    def _is_rule_running(self, rule: dict[str, Any], state_value: str | None) -> bool:
        if state_value is None or state_value in ("unknown", "unavailable"):
            return False
        if "states" in rule:
            return state_value in rule["states"]
        if "above" in rule:
            try:
                return float(state_value) > float(rule["above"])
            except (TypeError, ValueError):
                return False
        return state_value.lower() in ("on", "running", "heating", "cooling", "open")

    async def async_mark_complete(self, task_id: str, method: str = "manual", user: str | None = None, notes: str | None = None) -> None:
        task = self.tasks[task_id]
        now = dt_util.utcnow().isoformat()
        task.last_completed = now
        task.last_completed_by = user
        task.last_completion_method = method
        task.runtime_seconds = {}
        entry = {"at": now, "method": method, "user": user, "notes": notes}
        task.completion_history.append(entry)
        task.activity_history.append({"type": "completed", **entry})
        self.hass.bus.async_fire(EVENT_COMPLETION, {"task_id": task.id, "task_name": task.name, **entry})
        self.hass.bus.async_fire(EVENT_ACTIVITY, {"task_id": task.id, "task_name": task.name, "activity": "completed", **entry})
        await self.async_save()
        self._notify()

    async def async_snooze(self, task_id: str, days: int) -> None:
        task = self.tasks[task_id]
        if not task.allow_snooze:
            return
        if task.max_snooze_days and days > task.max_snooze_days:
            days = task.max_snooze_days
        until = dt_util.utcnow() + timedelta(days=days)
        task.snoozed_until = until.isoformat()
        entry = {"at": dt_util.utcnow().isoformat(), "activity": "snoozed", "days": days, "until": task.snoozed_until}
        task.activity_history.append(entry)
        self.hass.bus.async_fire(EVENT_ACTIVITY, {"task_id": task.id, "task_name": task.name, **entry})
        await self.async_save()
        self._notify()

    async def async_add_log(self, task_id: str, activity: str, notes: str | None = None) -> None:
        task = self.tasks[task_id]
        entry = {"at": dt_util.utcnow().isoformat(), "activity": activity, "notes": notes}
        task.activity_history.append(entry)
        self.hass.bus.async_fire(EVENT_ACTIVITY, {"task_id": task.id, "task_name": task.name, **entry})
        await self.async_save()
        self._notify()

    async def async_reset_runtime(self, task_id: str) -> None:
        task = self.tasks[task_id]
        task.runtime_seconds = {}
        await self.async_add_log(task_id, "runtime_reset")
