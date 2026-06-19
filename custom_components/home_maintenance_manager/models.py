from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from calendar import monthrange
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

RULE_TIME = "time"
RULE_RUNTIME = "runtime"
RULE_COUNTER = "counter"
RULE_CALENDAR = "calendar"
LOGIC_ANY = "any"
LOGIC_ALL = "all"
LOGIC_PRIMARY = "primary"




def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _interval_seconds(value: float, unit: str) -> float:
    unit = (unit or "days").lower()
    if unit.startswith("minute"):
        return value * 60
    if unit.startswith("hour"):
        return value * 3600
    if unit.startswith("day"):
        return value * 86400
    if unit.startswith("week"):
        return value * 7 * 86400
    if unit.startswith("month"):
        return value * 30.4375 * 86400
    if unit.startswith("year"):
        return value * 365.25 * 86400
    return value * 86400


def _add_interval(dt: datetime, value: float, unit: str) -> datetime:
    """Add a user interval. Months/years are approximate enough for due display."""
    return dt + timedelta(seconds=_interval_seconds(value, unit))


def _interval_from_rule(rule: dict[str, Any], default_unit: str = "days") -> tuple[float, str]:
    """Return interval value/unit from new or legacy rule fields."""
    if "value" in rule or "unit" in rule:
        return _as_float(rule.get("value"), 0), str(rule.get("unit") or default_unit)
    if "minutes" in rule:
        return _as_float(rule.get("minutes"), 0), "minutes"
    if "hours" in rule:
        return _as_float(rule.get("hours"), 0), "hours"
    if "days" in rule:
        return _as_float(rule.get("days"), 0), "days"
    if "weeks" in rule:
        return _as_float(rule.get("weeks"), 0), "weeks"
    if "months" in rule:
        return _as_float(rule.get("months"), 0), "months"
    if "years" in rule:
        return _as_float(rule.get("years"), 0), "years"
    return 0, default_unit


def _ordinal(n: int) -> str:
    if 10 <= n % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _next_nth_weekday_after(after: datetime, nth: int, weekday: int, hour: int, minute: int) -> datetime:
    """Return next nth weekday-of-month occurrence after the given datetime."""
    year, month = after.year, after.month
    tzinfo = after.tzinfo
    for _ in range(36):
        first = datetime(year, month, 1, hour, minute, tzinfo=tzinfo)
        days_to_weekday = (weekday - first.weekday()) % 7
        if nth == -1:
            last_day = monthrange(year, month)[1]
            last = datetime(year, month, last_day, hour, minute, tzinfo=tzinfo)
            days_back = (last.weekday() - weekday) % 7
            candidate = last - timedelta(days=days_back)
        else:
            candidate = first + timedelta(days=days_to_weekday + (max(nth, 1) - 1) * 7)
            if candidate.month != month:
                candidate = None
        if candidate and candidate > after:
            return candidate
        month += 1
        if month > 12:
            month = 1
            year += 1
    return after + timedelta(days=365)


def _next_month_day_after(after: datetime, month: int | None, day: int, hour: int, minute: int) -> datetime:
    tzinfo = after.tzinfo
    start_year = after.year
    months = [month] if month else list(range(1, 13))
    for y in range(start_year, start_year + 5):
        for m in months:
            last_day = monthrange(y, m)[1]
            d = min(max(day, 1), last_day)
            candidate = datetime(y, m, d, hour, minute, tzinfo=tzinfo)
            if candidate > after:
                return candidate
    return after + timedelta(days=365)


def _calendar_next_due_after(last: datetime, rule: dict[str, Any]) -> datetime | None:
    schedule_kind = str(rule.get("calendar_kind") or rule.get("calendar_type") or "nth_weekday")
    hour = int(_as_float(rule.get("hour"), 9))
    minute = int(_as_float(rule.get("minute"), 0))
    if schedule_kind == "month_day":
        month_raw = rule.get("month")
        month = int(month_raw) if month_raw not in (None, "", 0, "0") else None
        day = int(_as_float(rule.get("day"), 1))
        return _next_month_day_after(last, month, day, hour, minute)
    nth = int(_as_float(rule.get("nth"), 2))
    weekday = int(_as_float(rule.get("weekday"), 1))  # Monday=0, Tuesday=1
    return _next_nth_weekday_after(last, nth, weekday, hour, minute)

SEASON_PRESETS = {
    "spring": (3, 1, 5, 31),
    "summer": (6, 1, 8, 31),
    "fall": (9, 1, 11, 30),
    "winter": (12, 1, 2, 28),
}


def _safe_month_day(month: Any, day: Any, default_month: int, default_day: int) -> tuple[int, int]:
    try:
        m = int(month)
    except (TypeError, ValueError):
        m = default_month
    try:
        d = int(day)
    except (TypeError, ValueError):
        d = default_day
    m = min(max(m, 1), 12)
    d = min(max(d, 1), 31)
    return m, d


def _date_for_month_day(year: int, month: int, day: int, tzinfo) -> datetime:
    return datetime(year, month, min(day, monthrange(year, month)[1]), 0, 0, tzinfo=tzinfo)


def _season_bounds_for_month_day(sm: int, sd: int, em: int, ed: int, now: datetime) -> tuple[datetime, datetime]:
    start = _date_for_month_day(now.year, sm, sd, now.tzinfo)
    end = _date_for_month_day(now.year, em, ed, now.tzinfo) + timedelta(days=1)
    if (em, ed) < (sm, sd):
        if now < end:
            start = _date_for_month_day(now.year - 1, sm, sd, now.tzinfo)
        else:
            end = _date_for_month_day(now.year + 1, em, ed, now.tzinfo) + timedelta(days=1)
    return start, end


def _season_windows(seasonal: dict[str, Any], now: datetime) -> list[tuple[datetime, datetime]]:
    if not seasonal or not seasonal.get("enabled"):
        return []
    windows: list[tuple[datetime, datetime]] = []

    # v0.5.23 supports multiple preset seasons. Keep v0.5.22 single-season
    # tasks working by translating the old ``season`` value when ``seasons``
    # has not been saved yet.
    seasons = seasonal.get("seasons")
    if not isinstance(seasons, list):
        old_season = str(seasonal.get("season") or "").lower()
        seasons = [old_season] if old_season in SEASON_PRESETS and old_season != "custom" else []
    for season in seasons:
        preset = SEASON_PRESETS.get(str(season or "").lower())
        if preset:
            windows.append(_season_bounds_for_month_day(*preset, now))

    custom_enabled = seasonal.get("custom_enabled")
    if custom_enabled is None:
        custom_enabled = str(seasonal.get("season") or "custom").lower() == "custom" or not windows
    if custom_enabled:
        sm, sd = _safe_month_day(seasonal.get("start_month"), seasonal.get("start_day"), 1, 1)
        em, ed = _safe_month_day(seasonal.get("end_month"), seasonal.get("end_day"), 12, 31)
        windows.append(_season_bounds_for_month_day(sm, sd, em, ed, now))

    return windows


def _season_bounds(seasonal: dict[str, Any], now: datetime) -> tuple[datetime, datetime] | None:
    windows = _season_windows(seasonal, now)
    if not windows:
        return None
    active = [w for w in windows if w[0] <= now < w[1]]
    if active:
        return min(active, key=lambda w: w[0])
    upcoming = [w for w in windows if now < w[0]]
    if upcoming:
        return min(upcoming, key=lambda w: w[0])
    future = now + timedelta(days=370)
    future_windows = _season_windows(seasonal, future)
    return min(future_windows, key=lambda w: w[0]) if future_windows else None


def _season_is_active(seasonal: dict[str, Any], now: datetime) -> bool:
    windows = _season_windows(seasonal, now)
    if not windows:
        return True
    return any(start <= now < end for start, end in windows)


def _next_season_start(seasonal: dict[str, Any], now: datetime) -> datetime | None:
    windows = _season_windows(seasonal, now)
    if not windows:
        return None
    upcoming = [start for start, end in windows if now < start]
    if upcoming:
        return min(upcoming)
    future = now + timedelta(days=370)
    future_windows = _season_windows(seasonal, future)
    return min((start for start, _end in future_windows), default=None)


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
    seasonal: dict[str, Any] = field(default_factory=dict)
    snoozed_until: str | None = None
    paused: bool = False
    runtime_seconds: dict[str, float] = field(default_factory=dict)
    # Internal totalizers for rate-based metered usage rules. Keyed by rule id.
    totalized_usage: dict[str, float] = field(default_factory=dict)
    last_seen_states: dict[str, dict[str, Any]] = field(default_factory=dict)
    last_completed: str | None = None
    last_completed_by: str | None = None
    last_completion_method: str | None = None
    baseline_method: str | None = None
    baseline_ago_value: float | str | None = None
    baseline_ago_unit: str | None = None
    provenance: dict[str, Any] = field(default_factory=dict)
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
                value, unit = _interval_from_rule(rule, "days")
                total_seconds = _interval_seconds(value, unit)
                if total_seconds <= 0:
                    continue
                elapsed_seconds = max((now - last).total_seconds(), 0)
                pct = min(elapsed_seconds / total_seconds, 999)
                remaining_days = (total_seconds - elapsed_seconds) / 86400
                elapsed_value = elapsed_seconds / _interval_seconds(1, unit)
                progress.append(RuleProgress(rule_id, rule_type, name, pct, remaining_days, pct >= 1, f"{elapsed_value:.1f}/{value:.1f} {unit}"))
            elif rule_type == RULE_RUNTIME:
                entity_id = rule.get("entity")
                value, unit = _interval_from_rule(rule, "hours")
                total_seconds = _interval_seconds(value, unit)
                if not entity_id or total_seconds <= 0:
                    continue
                used_seconds = self.runtime_seconds.get(entity_id, 0)
                pct = min(used_seconds / total_seconds, 999)
                remaining_hours = (total_seconds - used_seconds) / 3600
                used_value = used_seconds / _interval_seconds(1, unit)
                progress.append(RuleProgress(rule_id, rule_type, name, pct, remaining_hours, pct >= 1, f"{used_value:.1f}/{value:.1f} {unit}"))
            elif rule_type == RULE_CALENDAR:
                next_due = _calendar_next_due_after(last, rule)
                if not next_due:
                    continue
                total_seconds = max((next_due - last).total_seconds(), 1)
                elapsed_seconds = max((now - last).total_seconds(), 0)
                pct = min(elapsed_seconds / total_seconds, 999)
                remaining_days = (next_due - now).total_seconds() / 86400
                detail = f"Due {next_due.isoformat()}"
                progress.append(RuleProgress(rule_id, rule_type, name, pct, remaining_days, now >= next_due, detail))
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
        if not self.season_active():
            return "season_paused"
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

    def season_active(self) -> bool:
        return _season_is_active(self.seasonal, dt_util.utcnow())

    def next_season_start(self) -> datetime | None:
        return _next_season_start(self.seasonal, dt_util.utcnow())

    def percent_used(self, hass: HomeAssistant) -> float | None:
        if not self.season_active():
            return 0
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

    def counter_unit(self, hass: HomeAssistant) -> str | None:
        for rule in self.rules:
            if rule.get("type") == RULE_COUNTER:
                if rule.get("source_mode") == "rate":
                    if rule.get("target_unit"):
                        return str(rule.get("target_unit"))
                    source_unit = rule.get("source_unit") or rule.get("unit")
                    entity_id = rule.get("entity")
                    if not source_unit and entity_id:
                        state = hass.states.get(entity_id)
                        if state:
                            source_unit = state.attributes.get("unit_of_measurement")
                    return self._rate_target_unit(source_unit)
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
        if not self.season_active():
            return self.next_season_start()
        last = self._last_completed_dt()
        due_dates: list[datetime] = []
        for rule in self.rules:
            if rule.get("type") == RULE_TIME:
                value, unit = _interval_from_rule(rule, "days")
                if value > 0:
                    due_dates.append(_add_interval(last, value, unit))
            elif rule.get("type") == RULE_CALENDAR:
                next_due = _calendar_next_due_after(last, rule)
                if next_due:
                    due_dates.append(next_due)
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
            "seasonal": self.seasonal,
            "season_active": self.season_active(),
            "next_season_start": self.next_season_start().isoformat() if self.next_season_start() else None,
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
