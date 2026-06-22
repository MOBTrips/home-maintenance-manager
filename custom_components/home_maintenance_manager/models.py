from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from calendar import monthrange
import importlib.util
from pathlib import Path
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

try:
    from .units import (
        METER_SOURCE_RATE,
        METER_SOURCE_SESSION,
        convert_usage_amount,
        meter_units_compatible,
        normalize_meter_source_mode,
    )
except ImportError:  # pragma: no cover - allows direct import in lightweight tests
    _UNITS_SPEC = importlib.util.spec_from_file_location("hmm_units", Path(__file__).with_name("units.py"))
    if _UNITS_SPEC is None or _UNITS_SPEC.loader is None:
        raise
    _units = importlib.util.module_from_spec(_UNITS_SPEC)
    _UNITS_SPEC.loader.exec_module(_units)
    METER_SOURCE_RATE = _units.METER_SOURCE_RATE
    METER_SOURCE_SESSION = _units.METER_SOURCE_SESSION
    convert_usage_amount = _units.convert_usage_amount
    meter_units_compatible = _units.meter_units_compatible
    normalize_meter_source_mode = _units.normalize_meter_source_mode

RULE_TIME = "time"
RULE_RUNTIME = "runtime"
RULE_COUNTER = "counter"
RULE_CALENDAR = "calendar"
RULE_SERVICE_DUE = "service_due"
SERVICE_DUE_ENTITY_FIELDS = (
    "entity",
    "binary_due_entity",
    "status_entity",
    "remaining_percent_entity",
    "next_due_timestamp_entity",
)
LOGIC_ANY = "any"
LOGIC_ALL = "all"
LOGIC_PRIMARY = "primary"
DUE_LOGIC_RULE1_ONLY = "rule1_only"
DUE_LOGIC_ANY = "any_rule_due"
DUE_LOGIC_ALL = "all_rules_due"
VALID_DUE_LOGIC = {DUE_LOGIC_RULE1_ONLY, DUE_LOGIC_ANY, DUE_LOGIC_ALL}
_UNAVAILABLE_STATES = {"unknown", "unavailable", ""}




def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [str(value).strip()] if str(value).strip() else []


def _truthy_state(value: Any) -> bool:
    return str(value or "").strip().lower() in {"on", "true", "1", "yes"}


def _falsey_state(value: Any) -> bool:
    return str(value or "").strip().lower() in {"off", "false", "0", "no"}


def _normalize_due_logic(data: dict[str, Any]) -> str:
    value = str(data.get("due_logic") or "").strip()
    if value in VALID_DUE_LOGIC:
        return value
    rule_logic = str(data.get("rule_logic") or "").strip()
    rules = data.get("rules") if isinstance(data.get("rules"), list) else []
    if rule_logic == LOGIC_ALL and len(rules) > 1:
        return DUE_LOGIC_ALL
    if rule_logic == LOGIC_PRIMARY or len(rules) <= 1:
        return DUE_LOGIC_RULE1_ONLY
    return DUE_LOGIC_ANY


def _legacy_schedule_due_logic(schedule_type: str | None) -> str | None:
    mapping = {
        "time_or_runtime": DUE_LOGIC_ANY,
        "time_and_runtime": DUE_LOGIC_ALL,
        "time_or_meter": DUE_LOGIC_ANY,
        "time_and_meter": DUE_LOGIC_ALL,
        "time_or_metered": DUE_LOGIC_ANY,
        "time_and_metered": DUE_LOGIC_ALL,
        "time_or_usage": DUE_LOGIC_ANY,
        "time_and_usage": DUE_LOGIC_ALL,
    }
    return mapping.get(str(schedule_type or ""))


def _service_due_entity_field(rule: dict[str, Any]) -> str:
    service_type = str(rule.get("service_due_type") or rule.get("service_type") or rule.get("subtype") or rule.get("mode") or "binary").lower()
    if service_type in {"status", "enum", "state"}:
        return "status_entity"
    if service_type in {"remaining_percent", "percent", "remaining"}:
        return "remaining_percent_entity"
    if service_type in {"next_due_timestamp", "timestamp", "next_due"}:
        return "next_due_timestamp_entity"
    return "binary_due_entity"


def _service_due_entity(rule: dict[str, Any]) -> str | None:
    entity_id = rule.get("entity")
    if entity_id:
        return str(entity_id)
    field = _service_due_entity_field(rule)
    if rule.get(field):
        return str(rule.get(field))
    for candidate in SERVICE_DUE_ENTITY_FIELDS[1:]:
        if rule.get(candidate):
            return str(rule.get(candidate))
    return None


def normalize_task_data(data: dict[str, Any]) -> dict[str, Any]:
    """Normalize old schedule editor shapes into the durable rules contract."""
    normalized = dict(data)
    rules = normalized.get("rules")
    if isinstance(rules, list):
        normalized["rules"] = [dict(rule) if isinstance(rule, dict) else rule for rule in rules]
    else:
        normalized["rules"] = []

    legacy_due_logic = _legacy_schedule_due_logic(normalized.get("schedule_type") or normalized.get("_schedule_type"))
    if legacy_due_logic and not normalized.get("due_logic"):
        normalized["due_logic"] = legacy_due_logic
    normalized["due_logic"] = _normalize_due_logic(normalized)

    if normalized["due_logic"] == DUE_LOGIC_ALL:
        normalized["rule_logic"] = LOGIC_ALL
    elif normalized["due_logic"] == DUE_LOGIC_RULE1_ONLY:
        normalized["rule_logic"] = LOGIC_PRIMARY if len(normalized["rules"]) > 1 else LOGIC_ANY
        if normalized["rules"] and not normalized.get("primary_rule_id"):
            normalized["primary_rule_id"] = str(normalized["rules"][0].get("id") or "rule_0")
    elif normalized["due_logic"] == DUE_LOGIC_ANY:
        normalized["rule_logic"] = LOGIC_ANY
    return normalized


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


def _parse_due_timestamp(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc)
        except (TypeError, ValueError, OSError):
            return None
    parsed = dt_util.parse_datetime(str(value))
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed

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
    valid: bool = True
    error: str | None = None


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
    due_logic: str | None = None
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
    source: dict[str, Any] = field(default_factory=dict)
    provenance: dict[str, Any] = field(default_factory=dict)
    late_count: int = 0
    completion_history: list[dict[str, Any]] = field(default_factory=list)
    activity_history: list[dict[str, Any]] = field(default_factory=list)

    @staticmethod
    def from_dict(data: dict[str, Any]) -> "MaintenanceTask":
        # Keep old storage forward-compatible if fields are added/removed between releases.
        data = normalize_task_data(data)
        valid = set(MaintenanceTask.__dataclass_fields__.keys())
        filtered = {key: value for key, value in data.items() if key in valid}
        return MaintenanceTask(**filtered)

    def as_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()

    def update_config_from_dict(self, data: dict[str, Any]) -> None:
        """Update user-editable config while preserving runtime and history fields."""
        data = normalize_task_data(data)
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

    def resolved_due_logic(self) -> str:
        return _normalize_due_logic(self.as_dict())

    def _progress_for_due_logic(self, progress: list[RuleProgress]) -> list[RuleProgress]:
        if self.resolved_due_logic() == DUE_LOGIC_RULE1_ONLY and progress:
            return progress[:1]
        if self.due_logic in VALID_DUE_LOGIC:
            return progress[:2]
        return progress

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
                source_mode = normalize_meter_source_mode(rule.get("source_mode"))
                state = hass.states.get(entity_id) if entity_id else None
                state_unit = state.attributes.get("unit_of_measurement") if state else None
                expected_unit = rule.get("target_unit") or rule.get("unit") or rule.get("source_unit")
                if not meter_units_compatible(expected_unit, state_unit, source_mode):
                    detail = f"Invalid meter mapping: expected {expected_unit}, got {state_unit}"
                    progress.append(RuleProgress(rule_id, rule_type, name, 0, None, False, detail, False, detail))
                    continue
                if source_mode in {METER_SOURCE_RATE, METER_SOURCE_SESSION}:
                    current = float(self.totalized_usage.get(rule_id, 0))
                else:
                    try:
                        current = float(state.state) if state else baseline
                    except (TypeError, ValueError):
                        current = baseline
                used = max(current - baseline, 0)
                pct = min(used / amount, 999) if amount else 0
                display_unit = rule.get("target_display_unit") or rule.get("target_unit") or rule.get("unit") or "units"
                display_used = self._display_usage_value(used, rule)
                display_amount = self._display_usage_value(amount, rule)
                progress.append(RuleProgress(rule_id, rule_type, name, pct, display_amount - display_used, pct >= 1, f"{display_used:.1f}/{display_amount:.1f} {display_unit}"))
            elif rule_type == RULE_SERVICE_DUE:
                service_progress = self._service_due_progress(hass, rule_id, name, rule)
                if service_progress:
                    progress.append(service_progress)
        return progress

    def _service_due_progress(self, hass: HomeAssistant, rule_id: str, name: str, rule: dict[str, Any]) -> RuleProgress | None:
        entity_id = _service_due_entity(rule)
        if not entity_id:
            return RuleProgress(rule_id, RULE_SERVICE_DUE, name, 0, None, False, "Service source not configured", False, "missing_entity")
        state = hass.states.get(entity_id)
        state_value = str(state.state).strip() if state else ""
        unavailable_behavior = str(rule.get("unavailable_behavior") or "ignore").lower()
        if not state or state_value.lower() in _UNAVAILABLE_STATES:
            if unavailable_behavior in {"mark_due", "due"}:
                return RuleProgress(rule_id, RULE_SERVICE_DUE, name, 1, 0, True, "Service source unavailable; configured as due")
            return RuleProgress(rule_id, RULE_SERVICE_DUE, name, 0, None, False, "Service source unavailable", True, "service_unavailable")

        service_type = str(rule.get("service_due_type") or rule.get("service_type") or rule.get("subtype") or rule.get("mode") or "binary").lower()
        if service_type == "binary":
            if _truthy_state(state_value):
                return RuleProgress(rule_id, RULE_SERVICE_DUE, name, 1, 0, True, f"{entity_id} is due")
            if _falsey_state(state_value):
                return RuleProgress(rule_id, RULE_SERVICE_DUE, name, 0, None, False, f"{entity_id} is not due")
            return RuleProgress(rule_id, RULE_SERVICE_DUE, name, 0, None, False, f"{entity_id} state is {state_value}")

        if service_type in {"status", "enum", "state"}:
            due_states = _as_list(rule.get("due_states")) or ["due", "on", "true", "replace", "service", "service_due"]
            ok_states = _as_list(rule.get("ok_states")) or ["ok", "normal", "off", "false", "good", "none"]
            if state_value in due_states:
                return RuleProgress(rule_id, RULE_SERVICE_DUE, name, 1, 0, True, f"{entity_id} state {state_value} is due")
            if state_value in ok_states:
                return RuleProgress(rule_id, RULE_SERVICE_DUE, name, 0, None, False, f"{entity_id} state {state_value} is ok")
            return RuleProgress(rule_id, RULE_SERVICE_DUE, name, 0, None, False, f"{entity_id} state {state_value} is not in configured due states")

        if service_type in {"remaining_percent", "percent", "remaining"}:
            threshold = _as_float(rule.get("threshold_percent") if rule.get("threshold_percent") is not None else rule.get("threshold"), 10)
            try:
                remaining = float(state_value)
            except (TypeError, ValueError):
                return RuleProgress(rule_id, RULE_SERVICE_DUE, name, 0, None, False, f"{entity_id} value is not numeric", False, "invalid_numeric_state")
            due = remaining <= threshold
            denominator = max(100 - threshold, 1)
            pct = min(max((100 - remaining) / denominator, 0), 999)
            return RuleProgress(rule_id, RULE_SERVICE_DUE, name, pct, remaining - threshold, due, f"{remaining:.1f}% remaining; due at {threshold:.1f}%")

        if service_type in {"next_due_timestamp", "timestamp", "next_due"}:
            due_at = _parse_due_timestamp(state_value)
            if not due_at:
                return RuleProgress(rule_id, RULE_SERVICE_DUE, name, 0, None, False, f"{entity_id} timestamp is invalid", False, "invalid_timestamp_state")
            now = dt_util.utcnow()
            if now.tzinfo is None:
                now = now.replace(tzinfo=timezone.utc)
            remaining_days = (due_at - now).total_seconds() / 86400
            due = now >= due_at
            pct = 1 if due else 0
            return RuleProgress(rule_id, RULE_SERVICE_DUE, name, pct, remaining_days, due, f"Service due {due_at.isoformat()}")

        return RuleProgress(rule_id, RULE_SERVICE_DUE, name, 0, None, False, f"Unknown service due type: {service_type}", False, "invalid_service_due_type")

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
        valid_progress = [p for p in self._progress_for_due_logic(progress) if p.valid]
        if not valid_progress:
            return "unknown"
        due_flags = [p.due for p in valid_progress]
        due_logic = self.resolved_due_logic()
        if due_logic == DUE_LOGIC_ALL:
            is_due = all(due_flags)
        elif due_logic == DUE_LOGIC_RULE1_ONLY:
            is_due = bool(due_flags[0]) if due_flags else False
        else:
            is_due = any(due_flags)
        if is_due:
            return "due"
        if any(p.percent_used >= self.warning_percent for p in valid_progress):
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
        valid_progress = [p for p in self._progress_for_due_logic(progress) if p.valid]
        if not valid_progress:
            return None
        due_logic = self.resolved_due_logic()
        if due_logic == DUE_LOGIC_ALL:
            return min(p.percent_used for p in valid_progress) * 100
        if due_logic == DUE_LOGIC_RULE1_ONLY:
            return valid_progress[0].percent_used * 100
        return max(p.percent_used for p in valid_progress) * 100

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

    def has_service_due_rule(self) -> bool:
        return any(rule.get("type") == RULE_SERVICE_DUE for rule in self.rules)

    def counter_remaining(self, hass: HomeAssistant) -> float | None:
        values = [p.remaining for p in self.rule_progress(hass) if p.rule_type == RULE_COUNTER and p.remaining is not None]
        return min(values) if values else None

    def _display_usage_value(self, value: float, rule: dict[str, Any]) -> float:
        source_unit = rule.get("target_unit") or rule.get("unit") or rule.get("source_unit")
        display_unit = rule.get("target_display_unit") or source_unit
        try:
            return convert_usage_amount(value, source_unit, display_unit)
        except (TypeError, ValueError):
            return value

    def counter_used(self, hass: HomeAssistant) -> float | None:
        values: list[float] = []
        for rule in self.rules:
            if rule.get("type") != RULE_COUNTER:
                continue
            entity_id = rule.get("entity")
            baseline = float(rule.get("baseline") or 0)
            source_mode = normalize_meter_source_mode(rule.get("source_mode"))
            state = hass.states.get(entity_id) if entity_id else None
            state_unit = state.attributes.get("unit_of_measurement") if state else None
            expected_unit = rule.get("target_unit") or rule.get("unit") or rule.get("source_unit")
            if not meter_units_compatible(expected_unit, state_unit, source_mode):
                continue
            if source_mode in {METER_SOURCE_RATE, METER_SOURCE_SESSION}:
                current = float(self.totalized_usage.get(str(rule.get("id") or "counter_1"), 0))
            else:
                try:
                    current = float(state.state) if state else baseline
                except (TypeError, ValueError):
                    current = baseline
            values.append(self._display_usage_value(max(current - baseline, 0), rule))
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
                source_mode = normalize_meter_source_mode(rule.get("source_mode"))
                if source_mode == METER_SOURCE_RATE:
                    if rule.get("target_unit"):
                        return str(rule.get("target_display_unit") or rule.get("target_unit"))
                    source_unit = rule.get("source_unit") or rule.get("unit")
                    entity_id = rule.get("entity")
                    if not source_unit and entity_id:
                        state = hass.states.get(entity_id)
                        if state:
                            source_unit = state.attributes.get("unit_of_measurement")
                    return self._rate_target_unit(source_unit)
                if rule.get("target_unit"):
                    return str(rule.get("target_display_unit") or rule.get("target_unit"))
                if rule.get("unit"):
                    return str(rule.get("target_display_unit") or rule.get("unit"))
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
            elif rule.get("type") == RULE_SERVICE_DUE:
                service_type = str(rule.get("service_due_type") or rule.get("service_type") or rule.get("subtype") or rule.get("mode") or "").lower()
                entity_id = _service_due_entity(rule)
                if service_type in {"next_due_timestamp", "timestamp", "next_due"} and entity_id:
                    state = hass.states.get(entity_id)
                    next_due = _parse_due_timestamp(state.state) if state else None
                    if next_due:
                        due_dates.append(next_due)
        return min(due_dates) if due_dates else None

    def summary_attributes(self, hass: HomeAssistant) -> dict[str, Any]:
        progress = self.rule_progress(hass)
        next_due = self.next_due_datetime(hass)
        generated_device_id = None
        try:
            from homeassistant.helpers import device_registry as dr
            device = dr.async_get(hass).async_get_device({self.device_identifier})
            generated_device_id = device.id if device else None
        except Exception:
            generated_device_id = None
        return {
            "task_id": self.id,
            "category": self.category,
            "area": self.area,
            "linked_device_id": self.linked_device_id,
            "generated_device_id": generated_device_id,
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
