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
        """Notify entity listeners without letting stale entities break services.

        When a task is deleted, Home Assistant may still have the old entities
        loaded until the config entry reload finishes. Those stale entities can
        raise KeyError while trying to read the deleted task. Ignore that
        transient condition so delete_task can complete cleanly.
        """
        for listener in list(self.listeners):
            try:
                listener()
            except KeyError:
                continue

    def _setup_tracking(self) -> None:
        for unsub in self._unsub:
            unsub()
        self._unsub.clear()
        entity_ids = set()
        for task in self.tasks.values():
            for rule in task.rules:
                if rule.get("type") in ("runtime", "counter") and rule.get("entity"):
                    entity_ids.add(rule["entity"])
        for entity_id in entity_ids:
            self._unsub.append(async_track_state_change_event(self.hass, entity_id, self._state_changed))
        self._unsub.append(async_track_time_interval(self.hass, self._tick, timedelta(minutes=1)))

    @callback
    def _state_changed(self, event) -> None:
        self.hass.async_create_task(self._update_runtime())

    async def _tick(self, now) -> None:
        await self._update_runtime()


    def _rate_target_unit(self, unit: str | None) -> str:
        """Return the accumulated target unit for a rate sensor unit."""
        if not unit:
            return "units"
        u = unit.strip()
        lower = u.lower().replace(" ", "")
        for sep in ("/min", "permin", "/minute", "perminute"):
            if lower.endswith(sep):
                return u[: -len(sep.replace("per", "/"))] if sep.startswith("/") else u.split("per", 1)[0]
        for sep in ("/h", "/hr", "/hour", "perhour"):
            if lower.endswith(sep):
                return u.split("/", 1)[0] if "/" in u else u.split("per", 1)[0]
        for sep in ("/s", "/sec", "/second", "persecond"):
            if lower.endswith(sep):
                return u.split("/", 1)[0] if "/" in u else u.split("per", 1)[0]
        if lower == "w":
            return "kWh"
        return "units"

    def _integrate_rate(self, value: float, source_unit: str | None, elapsed_seconds: float) -> tuple[float, str]:
        """Convert a rate value over elapsed seconds into accumulated usage."""
        unit = (source_unit or "").strip()
        lower = unit.lower().replace(" ", "")
        if lower == "w":
            return (value * elapsed_seconds / 3600 / 1000, "kWh")
        if "/min" in lower or "permin" in lower or "/minute" in lower:
            return (value * elapsed_seconds / 60, self._rate_target_unit(unit))
        if "/h" in lower or "/hr" in lower or "/hour" in lower or "perhour" in lower:
            return (value * elapsed_seconds / 3600, self._rate_target_unit(unit))
        if "/s" in lower or "/sec" in lower or "/second" in lower or "persecond" in lower:
            return (value * elapsed_seconds, self._rate_target_unit(unit))
        # Fallback: treat as units per hour so we never silently fail, but label as units.
        return (value * elapsed_seconds / 3600, "units")

    async def _update_runtime(self) -> None:
        now = dt_util.utcnow()
        changed = False
        for task in self.tasks.values():
            for rule in task.rules:
                if not rule.get("entity"):
                    continue
                entity_id = rule["entity"]
                state = self.hass.states.get(entity_id)
                if rule.get("type") == "runtime":
                    last = task.last_seen_states.get(entity_id, {})
                    last_seen = dt_util.parse_datetime(last.get("seen_at")) if last.get("seen_at") else now
                    was_running = bool(last.get("running", False))
                    if was_running and last_seen:
                        task.runtime_seconds[entity_id] = task.runtime_seconds.get(entity_id, 0) + max((now - last_seen).total_seconds(), 0)
                        changed = True
                    running = self._is_rule_running(rule, state.state if state else None)
                    task.last_seen_states[entity_id] = {"seen_at": now.isoformat(), "running": running}
                elif rule.get("type") == "counter" and rule.get("source_mode") == "rate":
                    rule_id = str(rule.get("id") or entity_id)
                    key = f"counter_rate:{rule_id}"
                    last = task.last_seen_states.get(key, {})
                    last_seen = dt_util.parse_datetime(last.get("seen_at")) if last.get("seen_at") else None
                    try:
                        rate_value = float(state.state) if state else None
                    except (TypeError, ValueError):
                        rate_value = None
                    if last_seen and rate_value is not None:
                        elapsed = max((now - last_seen).total_seconds(), 0)
                        # Use the previous rate over the elapsed interval. If no previous
                        # numeric rate exists, initialize without adding usage.
                        prev_rate = last.get("rate")
                        try:
                            prev_rate = float(prev_rate)
                        except (TypeError, ValueError):
                            prev_rate = None
                        if prev_rate is not None and elapsed > 0:
                            source_unit = rule.get("source_unit") or (state.attributes.get("unit_of_measurement") if state else None)
                            added, target_unit = self._integrate_rate(prev_rate, source_unit, elapsed)
                            if added > 0:
                                task.totalized_usage[rule_id] = task.totalized_usage.get(rule_id, 0) + added
                                rule["target_unit"] = rule.get("target_unit") or target_unit
                                changed = True
                    task.last_seen_states[key] = {"seen_at": now.isoformat(), "rate": rate_value}
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
        # Reset metered-usage baselines to the current source values so usage-based
        # rules start counting from the completed maintenance event.
        for rule in task.rules:
            if rule.get("type") == "counter" and rule.get("entity"):
                state = self.hass.states.get(rule["entity"])
                if rule.get("source_mode") == "rate":
                    rule_id = str(rule.get("id") or rule.get("entity"))
                    rule["baseline"] = float(task.totalized_usage.get(rule_id, 0))
                    if state:
                        source_unit = state.attributes.get("unit_of_measurement")
                        if source_unit:
                            rule["source_unit"] = source_unit
                            rule["target_unit"] = rule.get("target_unit") or self._rate_target_unit(source_unit)
                else:
                    try:
                        rule["baseline"] = float(state.state) if state else float(rule.get("baseline") or 0)
                    except (TypeError, ValueError):
                        rule["baseline"] = float(rule.get("baseline") or 0)
                    if state and not rule.get("unit"):
                        unit = state.attributes.get("unit_of_measurement")
                        if unit:
                            rule["unit"] = unit
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
