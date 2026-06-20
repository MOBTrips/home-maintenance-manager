from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import importlib.util
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


units = load_module("hmm_units_test", ROOT / "custom_components" / "home_maintenance_manager" / "units.py")
task_packs = load_module("hmm_task_packs_meter_test", ROOT / "custom_components" / "home_maintenance_manager" / "task_packs.py")


def install_homeassistant_stubs() -> None:
    ha = types.ModuleType("homeassistant")
    core = types.ModuleType("homeassistant.core")
    helpers = types.ModuleType("homeassistant.helpers")
    entity_registry = types.ModuleType("homeassistant.helpers.entity_registry")
    util = types.ModuleType("homeassistant.util")
    dt = types.ModuleType("homeassistant.util.dt")

    class HomeAssistant:
        pass

    core.HomeAssistant = HomeAssistant
    entity_registry.async_get = lambda hass: None
    dt.utcnow = lambda: datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    dt.parse_datetime = lambda value: datetime.fromisoformat(value) if value else None

    sys.modules.setdefault("homeassistant", ha)
    sys.modules.setdefault("homeassistant.core", core)
    sys.modules.setdefault("homeassistant.helpers", helpers)
    sys.modules.setdefault("homeassistant.helpers.entity_registry", entity_registry)
    sys.modules.setdefault("homeassistant.util", util)
    sys.modules.setdefault("homeassistant.util.dt", dt)


install_homeassistant_stubs()
models = load_module("hmm_models_meter_test", ROOT / "custom_components" / "home_maintenance_manager" / "models.py")


class FakeState:
    def __init__(self, state: str, unit: str | None = None) -> None:
        self.state = state
        self.attributes = {}
        if unit is not None:
            self.attributes["unit_of_measurement"] = unit


class FakeStates:
    def __init__(self, states: dict[str, FakeState]) -> None:
        self._states = states

    def get(self, entity_id: str):
        return self._states.get(entity_id)


class FakeHass:
    def __init__(self, states: dict[str, FakeState]) -> None:
        self.states = FakeStates(states)


class MeteredUsageTests(unittest.TestCase):
    def test_incompatible_meter_units_are_rejected_for_mapping(self) -> None:
        task = {
            "id": "meter",
            "name": "Meter",
            "rules": [{"id": "counter_1", "type": "counter", "entity": "hmm://entity/water_meter", "unit": "gal", "amount": 500}],
        }
        with self.assertRaisesRegex(ValueError, "not compatible"):
            task_packs.apply_task_pack_entity_mapping(
                task,
                {"hmm://entity/water_meter": "sensor.office_ups_power"},
                [{"id": "water_meter", "unit_of_measurement": "gal", "required": True}],
                {"sensor.office_ups_power": {"unit_of_measurement": "W"}},
                strict=True,
            )

    def test_compatible_meter_mapping_replaces_stale_unit_metadata(self) -> None:
        mapped = task_packs.apply_task_pack_entity_mapping(
            {
                "id": "meter",
                "name": "Meter",
                "rules": [{"id": "counter_1", "type": "counter", "entity": "hmm://entity/water_meter", "unit": "gal", "source_unit": "gal", "amount": 500}],
            },
            {"hmm://entity/water_meter": "sensor.water_liters"},
            [{"id": "water_meter", "unit_of_measurement": "gal", "required": True}],
            {"sensor.water_liters": {"unit_of_measurement": "L"}},
            strict=True,
        )
        rule = mapped["rules"][0]
        self.assertEqual(rule["entity"], "sensor.water_liters")
        self.assertEqual(rule["source_unit"], "L")
        self.assertEqual(rule["target_unit"], "L")
        self.assertEqual(rule["unit"], "L")

    def test_runtime_not_due_when_invalid_meter_is_ignored(self) -> None:
        task = models.MaintenanceTask(
            id="combined",
            name="Combined",
            last_completed="2026-01-01T12:00:00+00:00",
            runtime_seconds={"sensor.always_on": 60 * 60},
            rules=[
                {"id": "runtime_1", "type": "runtime", "entity": "sensor.always_on", "value": 2, "unit": "days"},
                {"id": "counter_1", "type": "counter", "entity": "sensor.office_ups_power", "amount": 500, "unit": "gal", "target_unit": "gal"},
            ],
            rule_logic="any",
        )
        hass = FakeHass({"sensor.office_ups_power": FakeState("1568.5", "W")})
        progress = task.rule_progress(hass)
        self.assertFalse(next(p for p in progress if p.rule_id == "counter_1").valid)
        self.assertEqual(task.status(hass), "ok")
        self.assertLess(task.runtime_remaining(hass), 48)
        self.assertGreater(task.runtime_remaining(hass), 46)

    def test_session_counter_uses_internal_totalized_positive_deltas(self) -> None:
        task = models.MaintenanceTask(
            id="session",
            name="Session",
            totalized_usage={"counter_1": 300},
            rules=[
                {
                    "id": "counter_1",
                    "type": "counter",
                    "entity": "sensor.toothbrush_duration",
                    "amount": 3600,
                    "baseline": 0,
                    "unit": "s",
                    "target_unit": "s",
                    "source_mode": "session_total",
                }
            ],
        )
        hass = FakeHass({"sensor.toothbrush_duration": FakeState("0", "s")})
        self.assertEqual(task.counter_used(hass), 300)
        progress = task.rule_progress(hass)[0]
        self.assertEqual(progress.detail, "300.0/3600.0 s")
        self.assertFalse(progress.due)

    def test_meter_source_mode_is_preserved_in_task_storage(self) -> None:
        task = models.MaintenanceTask.from_dict({
            "id": "session",
            "name": "Session",
            "rules": [
                {
                    "id": "counter_1",
                    "type": "counter",
                    "entity": "sensor.toothbrush_duration",
                    "amount": 3600,
                    "unit": "s",
                    "source_mode": "session_total",
                }
            ],
        })

        self.assertEqual(task.as_dict()["rules"][0]["source_mode"], "session_total")
        self.assertEqual(units.normalize_meter_source_mode("reset_counter"), "session_total")

    def test_session_counter_delta_ignores_resets_and_accumulates_cycles(self) -> None:
        readings = [0, 15, 30, 75, 150, 0, 10, 40, 0, 5]
        total = 0
        for previous, current in zip(readings, readings[1:]):
            total += units.session_counter_delta(previous, current)

        self.assertEqual(total, 195)
        self.assertEqual(units.session_counter_delta(150, 0), 0)

    def test_metered_display_units_match_configured_editor_unit(self) -> None:
        task = models.MaintenanceTask(
            id="session",
            name="Session",
            totalized_usage={"counter_1": 7200},
            rules=[
                {
                    "id": "counter_1",
                    "type": "counter",
                    "entity": "sensor.toothbrush_duration",
                    "amount": 21600,
                    "baseline": 0,
                    "unit": "s",
                    "source_unit": "s",
                    "target_unit": "s",
                    "target_display_value": 6,
                    "target_display_unit": "h",
                    "source_mode": "session_total",
                }
            ],
        )
        hass = FakeHass({"sensor.toothbrush_duration": FakeState("0", "s")})

        self.assertEqual(task.counter_unit(hass), "h")
        self.assertEqual(task.counter_used(hass), 2)
        self.assertEqual(task.counter_remaining(hass), 4)
        self.assertEqual(task.rule_progress(hass)[0].detail, "2.0/6.0 h")

    def test_time_unit_conversion_for_meter_targets(self) -> None:
        self.assertEqual(units.convert_usage_amount(60, "minutes", "s"), 3600)
        self.assertEqual(units.convert_usage_amount(2, "hours", "s"), 7200)
        self.assertEqual(units.convert_usage_amount(7, "days", "s"), 604800)

    def test_unit_compatibility(self) -> None:
        self.assertFalse(units.meter_units_compatible("gal", "W", "cumulative_total"))
        self.assertTrue(units.meter_units_compatible("gal", "L", "cumulative_total"))
        self.assertTrue(units.meter_units_compatible("kWh", "W", "rate"))


if __name__ == "__main__":
    unittest.main()
