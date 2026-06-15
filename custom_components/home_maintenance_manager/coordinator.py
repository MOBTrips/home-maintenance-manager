from __future__ import annotations

from datetime import timedelta, time
import logging
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DOMAIN, STORAGE_KEY, STORAGE_VERSION, EVENT_ACTIVITY, EVENT_COMPLETION
from .models import MaintenanceTask

_LOGGER = logging.getLogger(__name__)

_NOTIFICATION_DEFAULTS = {
    "enabled": True,
    "default_mode": "automation_only",
    "mobile_notify_services": [],
    "notify_upcoming": True,
    "notify_due": True,
    "notify_overdue": True,
    "notify_completed": False,
    "notify_snoozed": False,
    "repeat_mode": "once",
    "repeat_days": 1,
    "quiet_start": "",
    "quiet_end": "",
    "title_template": "[{category}] {task_name}",
    "body_template": "{task_name} is {status}.",
}

_STATUS_EVENT_MAP = {
    "upcoming": "notify_upcoming",
    "due": "notify_due",
    "overdue": "notify_overdue",
    "completed": "notify_completed",
    "snoozed": "notify_snoozed",
}


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
        self.hass.async_create_task(self.async_check_notifications())

    async def async_upsert_task(self, task_data: dict[str, Any]) -> None:
        if task_data["id"] in self.tasks:
            self.tasks[task_data["id"]].update_config_from_dict(task_data)
        else:
            self.tasks[task_data["id"]] = MaintenanceTask.from_dict(task_data)
        await self.async_save()
        self._setup_tracking()
        self._notify()
        await self.async_check_notifications()

    async def async_delete_task(self, task_id: str) -> None:
        if task_id in self.tasks:
            del self.tasks[task_id]
            await self.async_save()
            self._setup_tracking()
            self._notify()
            await self.async_check_notifications()

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
        await self.async_check_notifications()



    def _notification_settings(self) -> dict[str, Any]:
        """Return global notification settings for the first HMM config entry."""
        settings = dict(_NOTIFICATION_DEFAULTS)
        entries = self.hass.config_entries.async_entries(DOMAIN)
        if entries:
            settings.update(entries[0].options.get("notification_settings", {}) or {})
        return settings

    def _task_notification_mode(self, task: MaintenanceTask, settings: dict[str, Any]) -> str:
        """Resolve task/global notification mode."""
        task_mode = (task.notification_mode or "global").lower()
        if task_mode in ("disabled", "none"):
            return "none"
        if task_mode in ("persistent", "mobile", "both", "automation_only"):
            return task_mode
        # 'global' and 'custom' both use the global mode; custom can override target.
        return str(settings.get("default_mode") or "automation_only").lower()

    def _task_mobile_targets(self, task: MaintenanceTask, settings: dict[str, Any]) -> list[str]:
        """Resolve mobile notification targets for a task."""
        if task.mobile_notify_service:
            return [task.mobile_notify_service]
        targets = settings.get("mobile_notify_services") or []
        return [target for target in targets if isinstance(target, str)]

    def _quiet_time_active(self, settings: dict[str, Any]) -> bool:
        """Return true if global quiet hours are currently active."""
        start = str(settings.get("quiet_start") or "").strip()
        end = str(settings.get("quiet_end") or "").strip()
        if not start or not end:
            return False
        try:
            start_parts = [int(part) for part in start.split(":")[:2]]
            end_parts = [int(part) for part in end.split(":")[:2]]
            start_t = time(start_parts[0], start_parts[1])
            end_t = time(end_parts[0], end_parts[1])
        except (TypeError, ValueError, IndexError):
            return False
        now_t = dt_util.now().time()
        if start_t <= end_t:
            return start_t <= now_t < end_t
        return now_t >= start_t or now_t < end_t

    def _format_notification_text(self, template: str, task: MaintenanceTask, status: str) -> str:
        """Safely format a notification template."""
        values = {
            "task_name": task.name,
            "task_id": task.id,
            "status": status.replace("_", " ").title(),
            "category": task.category or "General",
            "area": task.area or "",
            "equipment_name": task.equipment_name or task.name,
        }
        try:
            return str(template).format(**values)
        except Exception:
            return f"{task.name} is {status.replace('_', ' ')}."

    async def _send_task_notification(self, task: MaintenanceTask, status: str, settings: dict[str, Any]) -> bool:
        """Send one built-in notification for a task status/activity."""
        if not settings.get("enabled", True):
            return False
        if self._quiet_time_active(settings):
            return False
        mode = self._task_notification_mode(task, settings)
        if mode in ("none", "automation_only"):
            return False

        title = self._format_notification_text(settings.get("title_template") or "[{category}] {task_name}", task, status)
        message = self._format_notification_text(settings.get("body_template") or "{task_name} is {status}.", task, status)
        sent = False

        if mode in ("persistent", "both"):
            try:
                await self.hass.services.async_call(
                    "persistent_notification",
                    "create",
                    {
                        "title": title,
                        "message": message,
                        "notification_id": f"home_maintenance_manager_{task.id}_{status}",
                    },
                    blocking=True,
                )
                sent = True
            except Exception:  # pragma: no cover - service failure should not break task updates
                _LOGGER.exception("Failed to create persistent notification for maintenance task %s", task.id)

        if mode in ("mobile", "both"):
            for target in self._task_mobile_targets(task, settings):
                if not isinstance(target, str) or not target.startswith("notify."):
                    continue
                service = target.split(".", 1)[1]
                if not self.hass.services.has_service("notify", service):
                    continue
                try:
                    await self.hass.services.async_call(
                        "notify",
                        service,
                        {"title": title, "message": message},
                        blocking=True,
                    )
                    sent = True
                except Exception:  # pragma: no cover
                    _LOGGER.exception("Failed to send mobile notification %s for maintenance task %s", target, task.id)

        return sent

    async def async_check_notifications(self) -> None:
        """Send notifications when tasks enter upcoming/due/overdue states."""
        settings = self._notification_settings()
        changed = False
        now = dt_util.utcnow()
        for task in self.tasks.values():
            status = task.status(self.hass)
            state = task.last_seen_states.setdefault("notification", {})
            previous = state.get("status")
            sent_by_status = state.setdefault("sent", {})

            should_send = False
            if status in _STATUS_EVENT_MAP and settings.get(_STATUS_EVENT_MAP[status], False):
                if previous != status and status not in ("ok", "paused", "snoozed", "unknown"):
                    should_send = True
                elif status in ("due", "overdue"):
                    repeat_mode = str(settings.get("repeat_mode") or "once")
                    if repeat_mode != "once":
                        last_sent = dt_util.parse_datetime(sent_by_status.get(status)) if sent_by_status.get(status) else None
                        days = 1 if repeat_mode == "daily" else max(int(settings.get("repeat_days") or 1), 1)
                        if last_sent and now - last_sent >= timedelta(days=days):
                            should_send = True

            if should_send and await self._send_task_notification(task, status, settings):
                sent_by_status[status] = now.isoformat()
                changed = True

            if previous != status:
                state["status"] = status
                changed = True

        if changed:
            await self.async_save()

    async def async_notify_activity(self, task: MaintenanceTask, activity: str) -> None:
        """Send optional completed/snoozed notifications."""
        settings = self._notification_settings()
        if settings.get(_STATUS_EVENT_MAP.get(activity, ""), False):
            await self._send_task_notification(task, activity, settings)

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
            await self.async_check_notifications()

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
        await self.async_notify_activity(task, "completed")
        await self.async_save()
        self._notify()
        await self.async_check_notifications()

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
        await self.async_notify_activity(task, "snoozed")
        await self.async_save()
        self._notify()
        await self.async_check_notifications()

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
