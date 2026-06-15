from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

RULE_TIME = "time"
RULE_RUNTIME = "runtime"
RULE_COUNTER = "counter"
LOGIC_ANY = "any"
LOGIC_ALL = "all"
LOGIC_PRIMARY = "primary"


@dataclass
class RuleProgress:
    rule_id: str
    rule_type: str
    name: str
    percent_used: float
    remaining: float | None
    due: bool
    detail: str


@dataclass
class MaintenanceTask:
    id: str
    name: str
    description: str = ""
    category: str = "General"
    area: str | None = None
    linked_entities: list[str] = field(default_factory=list)
    linked_device_id: str | None = None
    equipment_name: str = ""
    rules: list[dict[str, Any]] = field(default_factory=list)
    rule_logic: str = LOGIC_ANY
    primary_rule_id: str | None = None
    nfc_tags: list[str] = field(default_factory=list)
    nfc_action: str = "confirm"
    instructions: str = ""
    checklist: list[str] = field(default_factory=list)
    parts: list[dict[str, Any]] = field(default_factory=list)
    tools: list[str] = field(default_factory=list)
    notification_mode: str = "automation_only"
    mobile_notify_service: str | None = None
    allow_snooze: bool = True
    max_snooze_count: int = 0
    max_snooze_days: int = 30
    warning_percent: float = 0.8
    snoozed_until: str | None = None
    paused: bool = False
    runtime_seconds: dict[str, float] = field(default_factory=dict)
    # Internal totalizers for rate-based metered usage rules. Keyed by rule id.
    totalized_usage: dict[str, float] = field(default_factory=dict)
    last_seen_states: dict[str, dict[str, Any]] = field(default_factory=dict)
    last_completed: str | None = None
    last_completed_by: str | None = None
    last_completion_method: str | None = None
    late_count: int = 0
    completion_history: list[dict[str, Any]] = field(default_factory=list)
    activity_history: list[dict[str, Any]] = field(default_factory=list)

    @staticmethod
    def from_dict(data: dict[str, Any]) -> "MaintenanceTask":
        # Keep old storage forward-compatible if fields are added/removed between releases.
        valid = set(MaintenanceTask.__dataclass_fields__.keys())
        filtered = {key: value for key, value in data.items() if key in valid}
        return MaintenanceTask(**filtered)

    def as_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()

    def update_config_from_dict(self, data: dict[str, Any]) -> None:
        """Update user-editable config while preserving runtime and history fields."""
        preserve = {
            "runtime_seconds",
            "totalized_usage",
            "last_seen_states",
            "last_completed",
            "last_completed_by",
            "last_completion_method",
            "late_count",
            "completion_history",
            "activity_history",
            "snoozed_until",
        }
        valid = set(MaintenanceTask.__dataclass_fields__.keys()) - preserve
        for key, value in data.items():
            if key in valid:
                setattr(self, key, value)

    @property
    def device_identifier(self) -> tuple[str, str]:
        return ("home_maintenance_manager", self.id)

    def _last_completed_dt(self) -> datetime:
        if self.last_completed:
            return dt_util.parse_datetime(self.last_completed) or dt_util.utcnow()
        # New tasks should start tracking immediately instead of staying unknown until
        # the user presses Mark Complete for the first time.
        self.last_completed = dt_util.utcnow().isoformat()
        return dt_util.parse_datetime(self.last_completed) or dt_util.utcnow()

    def rule_progress(self, hass: HomeAssistant) -> list[RuleProgress]:
        progress: list[RuleProgress] = []
        now = dt_util.utcnow()
        last = self._last_completed_dt()
        for idx, rule in enumerate(self.rules):
            rule_id = str(rule.get("id") or f"rule_{idx}")
            rule_type = rule.get("type")
            name = str(rule.get("name") or rule_type or rule_id)
            if rule_type == RULE_TIME:
                days = float(rule.get("days") or 0)
                if "months" in rule:
                    days = float(rule["months"]) * 30.4375
                if "years" in rule:
                    days = float(rule["years"]) * 365.25
                if days <= 0:
                    continue
                elapsed = max((now - last).total_seconds() / 86400, 0)
                pct = min(elapsed / days, 999)
                progress.append(RuleProgress(rule_id, rule_type, name, pct, days - elapsed, pct >= 1, f"{elapsed:.1f}/{days:.1f} days"))
            elif rule_type == RULE_RUNTIME:
                entity_id = rule.get("entity")
                hours = float(rule.get("hours") or 0)
                if not entity_id or hours <= 0:
                    continue
                used_hours = self.runtime_seconds.get(entity_id, 0) / 3600
                pct = min(used_hours / hours, 999)
                progress.append(RuleProgress(rule_id, rule_type, name, pct, hours - used_hours, pct >= 1, f"{used_hours:.1f}/{hours:.1f} hours"))
            elif rule_type == RULE_COUNTER:
                entity_id = rule.get("entity")
                amount = float(rule.get("amount") or 0)
                baseline = float(rule.get("baseline") or 0)
                if rule.get("source_mode") == "rate":
                    current = float(self.totalized_usage.get(rule_id, 0))
                else:
                    state = hass.states.get(entity_id) if entity_id else None
                    try:
                        current = float(state.state) if state else baseline
                    except (TypeError, ValueError):
                        current = baseline
                used = max(current - baseline, 0)
                pct = min(used / amount, 999) if amount else 0
                unit = rule.get("target_unit") or rule.get("unit") or "units"
                progress.append(RuleProgress(rule_id, rule_type, name, pct, amount - used, pct >= 1, f"{used:.1f}/{amount:.1f} {unit}"))
        return progress

    def status(self, hass: HomeAssistant) -> str:
        if self.paused:
            return "paused"
        if self.snoozed_until:
            until = dt_util.parse_datetime(self.snoozed_until)
            if until and until > dt_util.utcnow():
                return "snoozed"
        progress = self.rule_progress(hass)
        if not progress:
            return "unknown"
        due_flags = [p.due for p in progress]
        if self.rule_logic == LOGIC_ALL:
            is_due = all(due_flags)
        elif self.rule_logic == LOGIC_PRIMARY and self.primary_rule_id:
            is_due = next((p.due for p in progress if p.rule_id == self.primary_rule_id), False)
        else:
            is_due = any(due_flags)
        if is_due:
            return "due"
        if any(p.percent_used >= self.warning_percent for p in progress):
            return "upcoming"
        return "ok"

    def percent_used(self, hass: HomeAssistant) -> float | None:
        progress = self.rule_progress(hass)
        if not progress:
            return None
        if self.rule_logic == LOGIC_ALL:
            return min(p.percent_used for p in progress) * 100
        if self.rule_logic == LOGIC_PRIMARY and self.primary_rule_id:
            primary = next((p for p in progress if p.rule_id == self.primary_rule_id), progress[0])
            return primary.percent_used * 100
        return max(p.percent_used for p in progress) * 100

    def days_remaining(self, hass: HomeAssistant) -> float | None:
        values = [p.remaining for p in self.rule_progress(hass) if p.rule_type == RULE_TIME and p.remaining is not None]
        return min(values) if values else None

    def runtime_remaining(self, hass: HomeAssistant) -> float | None:
        values = [p.remaining for p in self.rule_progress(hass) if p.rule_type == RULE_RUNTIME and p.remaining is not None]
        return min(values) if values else None

    def has_runtime_rule(self) -> bool:
        return any(rule.get("type") == RULE_RUNTIME for rule in self.rules)

    def has_counter_rule(self) -> bool:
        return any(rule.get("type") == RULE_COUNTER for rule in self.rules)

    def counter_remaining(self, hass: HomeAssistant) -> float | None:
        values = [p.remaining for p in self.rule_progress(hass) if p.rule_type == RULE_COUNTER and p.remaining is not None]
        return min(values) if values else None

    def counter_used(self, hass: HomeAssistant) -> float | None:
        values: list[float] = []
        for rule in self.rules:
            if rule.get("type") != RULE_COUNTER:
                continue
            entity_id = rule.get("entity")
            baseline = float(rule.get("baseline") or 0)
            if rule.get("source_mode") == "rate":
                current = float(self.totalized_usage.get(str(rule.get("id") or "counter_1"), 0))
            else:
                state = hass.states.get(entity_id) if entity_id else None
                try:
                    current = float(state.state) if state else baseline
                except (TypeError, ValueError):
                    current = baseline
            values.append(max(current - baseline, 0))
        return max(values) if values else None

    def counter_unit(self, hass: HomeAssistant) -> str | None:
        for rule in self.rules:
            if rule.get("type") == RULE_COUNTER:
                if rule.get("target_unit"):
                    return str(rule.get("target_unit"))
                if rule.get("unit"):
                    return str(rule.get("unit"))
                entity_id = rule.get("entity")
                state = hass.states.get(entity_id) if entity_id else None
                if state:
                    return state.attributes.get("unit_of_measurement")
        return None

    def next_due_datetime(self, hass: HomeAssistant) -> datetime | None:
        last = self._last_completed_dt()
        due_dates: list[datetime] = []
        for rule in self.rules:
            if rule.get("type") == RULE_TIME:
                days = float(rule.get("days") or 0)
                if "months" in rule:
                    days = float(rule["months"]) * 30.4375
                if "years" in rule:
                    days = float(rule["years"]) * 365.25
                if days > 0:
                    due_dates.append(last + timedelta(days=days))
        return min(due_dates) if due_dates else None

    def summary_attributes(self, hass: HomeAssistant) -> dict[str, Any]:
        progress = self.rule_progress(hass)
        next_due = self.next_due_datetime(hass)
        return {
            "task_id": self.id,
            "category": self.category,
            "area": self.area,
            "linked_device_id": self.linked_device_id,
            "linked_entities": self.linked_entities,
            "status": self.status(hass),
            "percent_used": self.percent_used(hass),
            "days_remaining": self.days_remaining(hass),
            "runtime_remaining": self.runtime_remaining(hass) if self.has_runtime_rule() else "N/A",
            "usage_used": self.counter_used(hass) if self.has_counter_rule() else "N/A",
            "usage_remaining": self.counter_remaining(hass) if self.has_counter_rule() else "N/A",
            "usage_unit": self.counter_unit(hass),
            "totalized_usage": self.totalized_usage,
            "next_due": next_due.isoformat() if next_due else None,
            "last_completed": self.last_completed,
            "completion_count": len(self.completion_history),
            "late_count": self.late_count,
            "rule_progress": [p.__dict__ for p in progress],
        }

    def linked_device_entry(self, hass: HomeAssistant):
        from homeassistant.helpers import device_registry as dr
        device_registry = dr.async_get(hass)
        if self.linked_device_id:
            dev = device_registry.async_get(self.linked_device_id)
            if dev:
                return dev
        registry = er.async_get(hass)
        for entity_id in self.linked_entities:
            entity_entry = registry.async_get(entity_id)
            if entity_entry and entity_entry.device_id:
                return device_registry.async_get(entity_entry.device_id)
        return None
