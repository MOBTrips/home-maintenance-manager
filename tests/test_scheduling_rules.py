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
models = load_module("hmm_models_scheduling_test", ROOT / "custom_components" / "home_maintenance_manager" / "models.py")
task_packs = load_module("hmm_task_packs_scheduling_test", ROOT / "custom_components" / "home_maintenance_manager" / "task_packs.py")


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


def service_task(rule: dict) -> models.MaintenanceTask:
    return models.MaintenanceTask(
        id="service",
        name="Service",
        last_completed="2026-01-01T12:00:00+00:00",
        rules=[{"id": "service_due_1", "type": "service_due", "entity": "sensor.service", **rule}],
        due_logic="rule1_only",
    )


class ServiceDueRuleTests(unittest.TestCase):
    def test_service_due_binary_entity_due_and_not_due(self) -> None:
        rule = {"service_due_type": "binary"}

        self.assertEqual(service_task(rule).status(FakeHass({"sensor.service": FakeState("on")})), "due")
        self.assertEqual(service_task(rule).status(FakeHass({"sensor.service": FakeState("off")})), "ok")

    def test_service_due_status_enum_due_and_not_due(self) -> None:
        rule = {"service_due_type": "status", "due_states": ["replace", "service"], "ok_states": ["ok", "normal"]}

        self.assertEqual(service_task(rule).status(FakeHass({"sensor.service": FakeState("replace")})), "due")
        self.assertEqual(service_task(rule).status(FakeHass({"sensor.service": FakeState("normal")})), "ok")

    def test_service_due_remaining_percent_threshold(self) -> None:
        rule = {"service_due_type": "remaining_percent", "threshold_percent": 10}

        self.assertEqual(service_task(rule).status(FakeHass({"sensor.service": FakeState("9.5", "%")})), "due")
        self.assertEqual(service_task(rule).status(FakeHass({"sensor.service": FakeState("35", "%")})), "ok")

    def test_service_due_next_due_timestamp(self) -> None:
        rule = {"service_due_type": "next_due_timestamp"}

        self.assertEqual(service_task(rule).status(FakeHass({"sensor.service": FakeState("2026-01-01T11:59:00+00:00")})), "due")
        self.assertEqual(service_task(rule).status(FakeHass({"sensor.service": FakeState("2026-01-02T12:00:00+00:00")})), "ok")

    def test_service_due_unavailable_behavior(self) -> None:
        self.assertEqual(
            service_task({"service_due_type": "binary"}).status(FakeHass({"sensor.service": FakeState("unavailable")})),
            "ok",
        )
        self.assertEqual(
            service_task({"service_due_type": "binary", "unavailable_behavior": "mark_due"}).status(FakeHass({"sensor.service": FakeState("unavailable")})),
            "due",
        )


class DueLogicTests(unittest.TestCase):
    def combined_task(self, due_logic: str) -> models.MaintenanceTask:
        return models.MaintenanceTask(
            id="combined",
            name="Combined",
            last_completed="2026-01-01T11:58:00+00:00",
            rules=[
                {"id": "service_due_1", "type": "service_due", "entity": "sensor.service", "service_due_type": "binary"},
                {"id": "time_2", "type": "time", "value": 1, "unit": "minutes"},
            ],
            due_logic=due_logic,
        )

    def test_rule1_only_ignores_rule2(self) -> None:
        task = self.combined_task("rule1_only")
        self.assertEqual(task.status(FakeHass({"sensor.service": FakeState("off")})), "ok")

    def test_any_rule_due(self) -> None:
        task = self.combined_task("any_rule_due")
        self.assertEqual(task.status(FakeHass({"sensor.service": FakeState("off")})), "due")

    def test_all_rules_due(self) -> None:
        task = self.combined_task("all_rules_due")
        self.assertNotEqual(task.status(FakeHass({"sensor.service": FakeState("off")})), "due")
        self.assertEqual(task.status(FakeHass({"sensor.service": FakeState("on")})), "due")

    def test_migration_from_combined_schedule_type(self) -> None:
        task = models.MaintenanceTask.from_dict({
            "id": "legacy",
            "name": "Legacy",
            "schedule_type": "time_and_runtime",
            "rules": [
                {"id": "time_1", "type": "time", "value": 1, "unit": "months"},
                {"id": "runtime_2", "type": "runtime", "entity": "sensor.runtime", "value": 100, "unit": "hours"},
            ],
        })

        self.assertEqual(task.due_logic, "all_rules_due")
        self.assertEqual(task.rule_logic, "all")

    def test_task_pack_templates_service_due_entity(self) -> None:
        package = task_packs.build_task_pack_package(
            {"id": "service", "name": "Service", "version": "1.0"},
            [{
                "id": "service",
                "name": "Service",
                "rules": [{"id": "service_due_1", "type": "service_due", "entity": "binary_sensor.filter_due", "service_due_type": "binary"}],
            }],
        )

        rule = package["tasks"][0]["rules"][0]
        requirement = package["entity_requirements"][0]
        self.assertEqual(rule["entity"], "hmm://entity/binary_sensor_filter_due")
        self.assertEqual(requirement["role"], "service_due")
        self.assertTrue(requirement["required"])


if __name__ == "__main__":
    unittest.main()
