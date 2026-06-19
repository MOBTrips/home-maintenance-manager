from __future__ import annotations

from typing import Any


METER_SOURCE_CUMULATIVE = "cumulative_total"
METER_SOURCE_RATE = "rate"
METER_SOURCE_SESSION = "session_total"

TIME_FACTORS = {
    "s": 1.0,
    "sec": 1.0,
    "second": 1.0,
    "seconds": 1.0,
    "min": 60.0,
    "minute": 60.0,
    "minutes": 60.0,
    "h": 3600.0,
    "hr": 3600.0,
    "hour": 3600.0,
    "hours": 3600.0,
    "d": 86400.0,
    "day": 86400.0,
    "days": 86400.0,
    "wk": 604800.0,
    "week": 604800.0,
    "weeks": 604800.0,
    "mo": 30.4375 * 86400.0,
    "month": 30.4375 * 86400.0,
    "months": 30.4375 * 86400.0,
    "y": 365.25 * 86400.0,
    "yr": 365.25 * 86400.0,
    "year": 365.25 * 86400.0,
    "years": 365.25 * 86400.0,
}

UNIT_ALIASES = {
    "secs": "s",
    "sec": "s",
    "second": "s",
    "seconds": "s",
    "mins": "min",
    "minute": "min",
    "minutes": "min",
    "hrs": "h",
    "hr": "h",
    "hour": "h",
    "hours": "h",
    "day": "d",
    "days": "d",
    "week": "wk",
    "weeks": "wk",
    "month": "mo",
    "months": "mo",
    "year": "y",
    "years": "y",
    "watt": "W",
    "watts": "W",
    "kilowatt": "kW",
    "kilowatts": "kW",
    "wh": "Wh",
    "kwh": "kWh",
    "mwh": "MWh",
    "gallon": "gal",
    "gallons": "gal",
    "quart": "qt",
    "quarts": "qt",
    "fl oz": "oz",
    "fluid ounce": "oz",
    "fluid ounces": "oz",
    "liter": "L",
    "liters": "L",
    "litre": "L",
    "litres": "L",
    "ml": "mL",
    "milliliter": "mL",
    "milliliters": "mL",
    "mile": "mi",
    "miles": "mi",
    "foot": "ft",
    "feet": "ft",
    "meter": "m",
    "meters": "m",
    "kilometer": "km",
    "kilometers": "km",
    "cycle": "cycles",
}

UNIT_FAMILIES = {
    "s": "time",
    "min": "time",
    "h": "time",
    "d": "time",
    "wk": "time",
    "mo": "time",
    "y": "time",
    "W": "power",
    "kW": "power",
    "Wh": "energy",
    "kWh": "energy",
    "MWh": "energy",
    "gal": "volume",
    "qt": "volume",
    "oz": "volume",
    "L": "volume",
    "mL": "volume",
    "mi": "distance",
    "ft": "distance",
    "m": "distance",
    "km": "distance",
    "cycles": "count",
    "count": "count",
    "units": "count",
}


def canonical_unit(unit: Any) -> str:
    raw = str(unit or "").strip()
    if not raw:
        return ""
    compact = raw.replace(" ", "")
    if compact in UNIT_FAMILIES:
        return compact
    lower = raw.lower().strip()
    return UNIT_ALIASES.get(lower, UNIT_ALIASES.get(compact.lower(), raw))


def normalize_meter_source_mode(mode: Any) -> str:
    value = str(mode or METER_SOURCE_CUMULATIVE).strip().lower()
    if value in {"cumulative", "cumulative_total", "total", "total_increasing"}:
        return METER_SOURCE_CUMULATIVE
    if value in {"rate", "rate_sensor"}:
        return METER_SOURCE_RATE
    if value in {"session", "session_total", "reset_counter", "resetting", "resetting_counter"}:
        return METER_SOURCE_SESSION
    return METER_SOURCE_CUMULATIVE


def unit_family(unit: Any) -> str:
    canonical = canonical_unit(unit)
    if not canonical:
        return ""
    if "/" in canonical or " per " in canonical.lower():
        target = rate_target_unit(canonical)
        return unit_family(target)
    return UNIT_FAMILIES.get(canonical, "custom")


def rate_target_unit(source_unit: Any) -> str:
    unit = str(source_unit or "").strip()
    if not unit:
        return "units"
    lower = unit.lower().replace(" ", "")
    if lower == "w":
        return "kWh"
    for sep in ("/min", "/minute", "/h", "/hr", "/hour", "/s", "/sec", "/second"):
        if sep in lower and "/" in unit:
            return unit.split("/", 1)[0].strip() or "units"
    for sep in ("permin", "perminute", "perhour", "persecond"):
        if sep in lower:
            return unit.split("per", 1)[0].strip() or "units"
    return "units"


def convert_usage_amount(value: Any, from_unit: Any, to_unit: Any) -> float:
    amount = float(value)
    source = canonical_unit(from_unit)
    target = canonical_unit(to_unit)
    if not source or not target or source == target:
        return amount
    if unit_family(source) != unit_family(target):
        raise ValueError(f"Cannot convert {source} to {target}")
    if unit_family(source) == "time":
        return amount * TIME_FACTORS[source] / TIME_FACTORS[target]
    raise ValueError(f"Conversion is not supported for {source} to {target}")


def meter_units_compatible(expected_unit: Any, actual_unit: Any, source_mode: Any = METER_SOURCE_CUMULATIVE) -> bool:
    expected = canonical_unit(expected_unit)
    actual = canonical_unit(actual_unit)
    if not expected or not actual:
        return True
    mode = normalize_meter_source_mode(source_mode)
    actual_total_unit = rate_target_unit(actual) if mode == METER_SOURCE_RATE else actual
    return unit_family(expected) == unit_family(actual_total_unit)


def normalize_counter_rule_units(
    rule: dict[str, Any],
    actual_unit: Any,
    expected_unit: Any | None = None,
) -> dict[str, Any]:
    """Return a counter rule with stale unit metadata replaced by the mapped entity unit."""
    normalized = dict(rule)
    mode = normalize_meter_source_mode(normalized.get("source_mode"))
    normalized["source_mode"] = mode
    source_unit = canonical_unit(actual_unit) or str(actual_unit or "").strip()
    if source_unit:
        normalized["source_unit"] = source_unit
    if mode == METER_SOURCE_RATE:
        target_unit = rate_target_unit(source_unit)
    else:
        target_unit = source_unit or canonical_unit(expected_unit) or str(expected_unit or "").strip()
    if target_unit:
        normalized["target_unit"] = target_unit
        normalized["unit"] = target_unit
    return normalized
