from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import importlib
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]


def install_homeassistant_stubs() -> None:
    ha = types.ModuleType("homeassistant")
    core = types.ModuleType("homeassistant.core")
    helpers = types.ModuleType("homeassistant.helpers")
    event = types.ModuleType("homeassistant.helpers.event")
    storage = types.ModuleType("homeassistant.helpers.storage")
    util = types.ModuleType("homeassistant.util")
    dt = types.ModuleType("homeassistant.util.dt")

    class HomeAssistant:
        pass

    class Store:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def async_load(self):
            return {}

        async def async_save(self, data):
            return None

    core.Event = object
    core.HomeAssistant = HomeAssistant
    core.callback = lambda func: func
    event.async_track_state_change_event = lambda *args, **kwargs: (lambda: None)
    event.async_track_time_interval = lambda *args, **kwargs: (lambda: None)
    storage.Store = Store
    dt.utcnow = lambda: datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    dt.now = lambda: datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    dt.parse_datetime = lambda value: datetime.fromisoformat(value) if value else None

    sys.modules["homeassistant"] = ha
    sys.modules["homeassistant.core"] = core
    sys.modules["homeassistant.helpers"] = helpers
    sys.modules["homeassistant.helpers.event"] = event
    sys.modules["homeassistant.helpers.storage"] = storage
    sys.modules["homeassistant.util"] = util
    sys.modules["homeassistant.util.dt"] = dt

    custom_components = types.ModuleType("custom_components")
    custom_components.__path__ = [str(ROOT / "custom_components")]
    hmm_package = types.ModuleType("custom_components.home_maintenance_manager")
    hmm_package.__path__ = [str(ROOT / "custom_components" / "home_maintenance_manager")]
    sys.modules.setdefault("custom_components", custom_components)
    sys.modules.setdefault("custom_components.home_maintenance_manager", hmm_package)


install_homeassistant_stubs()
coordinator_module = importlib.import_module("custom_components.home_maintenance_manager.coordinator")
task_packs = importlib.import_module("custom_components.home_maintenance_manager.task_packs")


class FakeState:
    def __init__(self, state: str = "0", attrs: dict | None = None) -> None:
        self.state = state
        self.attributes = attrs or {}


class FakeStates:
    def __init__(self, states: dict[str, FakeState]) -> None:
        self._states = states

    def async_entity_ids(self) -> list[str]:
        return list(self._states)

    def get(self, entity_id: str):
        return self._states.get(entity_id)


class FakeHass:
    def __init__(self, states: dict[str, FakeState]) -> None:
        self.states = FakeStates(states)


def qa_pack(requirement_overrides: dict | None = None) -> dict:
    requirement = {
        "id": "runtime_source",
        "key": "runtime_source",
        "name": "Runtime source",
        "label": "Runtime source",
        "description": "Generated QA runtime source.",
        "domain": "sensor",
        "role": "runtime",
        "required": True,
        "preferred_entity_id": "sensor.mock_device_runtime",
        "preferred_entity_ids": ["sensor.missing_runtime", "sensor.mock_device_runtime"],
        "qa_auto_map": True,
        "auto_map_reason": "Using mock_device QA entity found in Home Assistant.",
    }
    requirement.update(requirement_overrides or {})
    return {
        "format": task_packs.TASK_PACK_FORMAT,
        "format_version": 1,
        "type": "task_pack",
        "pack": {"id": "hmm.qa", "name": "QA Pack", "version": "1.0.0"},
        "entity_requirements": [requirement],
        "tasks": [
            {
                "id": "qa_filter",
                "name": "QA Filter",
                "category": "HVAC",
                "rules": [
                    {
                        "id": "runtime",
                        "type": "runtime",
                        "entity": "hmm://entity/runtime_source",
                        "value": 10,
                        "unit": "h",
                    }
                ],
            }
        ],
    }


def make_coordinator(entity_ids: list[str]) -> coordinator_module.MaintenanceCoordinator:
    states = {entity_id: FakeState("0", {"unit_of_measurement": "h"}) for entity_id in entity_ids}
    coordinator = coordinator_module.MaintenanceCoordinator(FakeHass(states))
    coordinator.tasks = {}
    coordinator.deleted_task_ids = set()
    coordinator.storage_settings = {}
    return coordinator


class TaskPackAutoMappingTests(unittest.TestCase):
    def test_validation_preserves_qa_auto_mapping_fields(self) -> None:
        requirement = task_packs.validate_task_pack(qa_pack())["entity_requirements"][0]

        self.assertEqual(requirement["preferred_entity_id"], "sensor.mock_device_runtime")
        self.assertEqual(
            requirement["preferred_entity_ids"],
            ["sensor.mock_device_runtime", "sensor.missing_runtime"],
        )
        self.assertTrue(requirement["qa_auto_map"])
        self.assertFalse(requirement["auto_map_when_available"])
        self.assertEqual(requirement["auto_map_reason"], "Using mock_device QA entity found in Home Assistant.")

    def test_preview_auto_maps_when_preferred_entity_exists(self) -> None:
        coordinator = make_coordinator(["sensor.mock_device_runtime"])

        preview = coordinator.import_preview(qa_pack())
        entity = preview["tasks"][0]["entities"][0]

        self.assertEqual(entity["status"], "found")
        self.assertTrue(entity["auto_mapped"])
        self.assertEqual(entity["mapped_entity_id"], "sensor.mock_device_runtime")
        self.assertEqual(preview["entity_counts"]["found"], 1)
        self.assertEqual(preview["entity_counts"]["missing"], 0)

    def test_preview_does_not_auto_map_when_preferred_entity_is_missing(self) -> None:
        coordinator = make_coordinator([])

        preview = coordinator.import_preview(qa_pack())
        entity = preview["tasks"][0]["entities"][0]

        self.assertEqual(entity["status"], "missing")
        self.assertFalse(entity["auto_mapped"])
        self.assertEqual(preview["entity_counts"]["missing"], 1)
        self.assertEqual(preview["entity_counts"]["required_missing"], 1)

    def test_preview_does_not_auto_map_without_explicit_opt_in(self) -> None:
        coordinator = make_coordinator(["sensor.mock_device_runtime"])
        package = qa_pack({"qa_auto_map": False, "auto_map_when_available": False})

        preview = coordinator.import_preview(package)
        entity = preview["tasks"][0]["entities"][0]

        self.assertEqual(entity["status"], "missing")
        self.assertFalse(entity["auto_mapped"])

    def test_apply_import_replaces_placeholder_with_auto_mapped_entity(self) -> None:
        coordinator = make_coordinator(["sensor.mock_device_runtime"])
        captured = {}

        async def capture_import(package, mode):
            captured["package"] = package
            captured["mode"] = mode
            return {"imported": len(package.get("tasks", []))}

        coordinator.async_import_data = capture_import
        asyncio.run(coordinator.async_apply_import_preview(qa_pack(), selected_ids=["qa_filter"]))

        task = captured["package"]["tasks"][0]
        self.assertEqual(task["rules"][0]["entity"], "sensor.mock_device_runtime")
        self.assertEqual(captured["mode"], "merge")

    def test_explicit_user_mapping_overrides_auto_mapping(self) -> None:
        coordinator = make_coordinator(["sensor.mock_device_runtime", "sensor.user_runtime"])
        captured = {}

        async def capture_import(package, mode):
            captured["package"] = package
            return {"imported": len(package.get("tasks", []))}

        coordinator.async_import_data = capture_import
        asyncio.run(coordinator.async_apply_import_preview(
            qa_pack(),
            selected_ids=["qa_filter"],
            entity_mapping={"hmm://entity/runtime_source": "sensor.user_runtime"},
        ))

        task = captured["package"]["tasks"][0]
        self.assertEqual(task["rules"][0]["entity"], "sensor.user_runtime")

    def test_preferred_entity_hint_does_not_import_raw_task_entity_by_default(self) -> None:
        package = qa_pack()
        package["tasks"][0]["rules"][0]["entity"] = "sensor.private_runtime"

        normalized = task_packs.validate_task_pack(package)

        self.assertEqual(normalized["tasks"][0]["rules"][0]["entity"], "hmm://entity/sensor_private_runtime")

    def test_import_preview_summary_counts_include_updates_deleted_and_settings(self) -> None:
        coordinator = make_coordinator([])
        coordinator.tasks = {
            "existing_task": coordinator_module.MaintenanceTask.from_dict({"id": "existing_task", "name": "Existing task"}),
        }
        coordinator.deleted_task_ids = {"deleted_task"}
        package = {
            "format": "home_maintenance_manager_export",
            "tasks": [
                {"id": "new_task", "name": "New task"},
                {"id": "existing_task", "name": "Existing task"},
                {"id": "deleted_task", "name": "Deleted task"},
            ],
            "settings": {"notification_settings": {"enabled": True}},
        }

        preview = coordinator.import_preview(package)

        self.assertEqual(preview["counts"]["new"], 1)
        self.assertEqual(preview["counts"]["update"], 1)
        self.assertEqual(preview["counts"]["deleted"], 1)
        self.assertTrue(preview["settings_present"])

    def test_restore_deleted_false_blocks_tombstoned_backup_task(self) -> None:
        coordinator = make_coordinator([])
        coordinator.deleted_task_ids = {"deleted_task"}
        captured = {}

        async def capture_import(package, mode):
            captured["package"] = package
            captured["mode"] = mode
            return {"imported": len(package.get("tasks", []))}

        coordinator.async_import_data = capture_import
        package = {
            "format": "home_maintenance_manager_export",
            "tasks": [{"id": "deleted_task", "name": "Deleted task"}],
        }

        asyncio.run(coordinator.async_apply_import_preview(package, selected_ids=["deleted_task"], restore_deleted=False))

        self.assertEqual(captured["package"]["tasks"], [])
        self.assertEqual(captured["mode"], "merge")

    def test_restore_deleted_true_allows_tombstoned_backup_task(self) -> None:
        coordinator = make_coordinator([])
        coordinator.deleted_task_ids = {"deleted_task"}
        captured = {}

        async def capture_import(package, mode):
            captured["package"] = package
            return {"imported": len(package.get("tasks", []))}

        coordinator.async_import_data = capture_import
        package = {
            "format": "home_maintenance_manager_export",
            "tasks": [{"id": "deleted_task", "name": "Deleted task"}],
        }

        asyncio.run(coordinator.async_apply_import_preview(package, selected_ids=["deleted_task"], restore_deleted=True))

        self.assertEqual(captured["package"]["tasks"][0]["id"], "deleted_task")

    def test_restore_deleted_false_blocks_tombstoned_task_pack_task(self) -> None:
        coordinator = make_coordinator(["sensor.mock_device_runtime"])
        coordinator.deleted_task_ids = {"qa_filter"}
        captured = {}

        async def capture_import(package, mode):
            captured["package"] = package
            return {"imported": len(package.get("tasks", []))}

        coordinator.async_import_data = capture_import
        asyncio.run(coordinator.async_apply_import_preview(qa_pack(), selected_ids=["qa_filter"], restore_deleted=False))

        self.assertEqual(captured["package"]["tasks"], [])

    def test_restore_deleted_true_allows_tombstoned_task_pack_task(self) -> None:
        coordinator = make_coordinator(["sensor.mock_device_runtime"])
        coordinator.deleted_task_ids = {"qa_filter"}
        captured = {}

        async def capture_import(package, mode):
            captured["package"] = package
            return {"imported": len(package.get("tasks", []))}

        coordinator.async_import_data = capture_import
        asyncio.run(coordinator.async_apply_import_preview(qa_pack(), selected_ids=["qa_filter"], restore_deleted=True))

        self.assertEqual(captured["package"]["tasks"][0]["id"], "qa_filter")


if __name__ == "__main__":
    unittest.main()
