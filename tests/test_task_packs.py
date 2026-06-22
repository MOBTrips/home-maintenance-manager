from __future__ import annotations

import json
from pathlib import Path
import importlib.util
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "hmm_task_packs",
    ROOT / "custom_components" / "home_maintenance_manager" / "task_packs.py",
)
task_packs = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(task_packs)
TASK_PACK_FORMAT = task_packs.TASK_PACK_FORMAT
apply_task_pack_entity_mapping = task_packs.apply_task_pack_entity_mapping
build_task_pack_package = task_packs.build_task_pack_package
enforce_task_pack_merge_mode = task_packs.enforce_task_pack_merge_mode
entity_mapping_for_task = task_packs.entity_mapping_for_task
installed_pack_record = task_packs.installed_pack_record
is_task_pack_package = task_packs.is_task_pack_package
list_built_in_task_pack_metadata = task_packs.list_built_in_task_pack_metadata
load_built_in_task_pack = task_packs.load_built_in_task_pack
merge_installed_pack_record = task_packs.merge_installed_pack_record
normalize_entity_requirements = task_packs.normalize_entity_requirements
validate_task_pack = task_packs.validate_task_pack


class TaskPackTests(unittest.TestCase):
    def test_example_packs_validate(self) -> None:
        for path in (ROOT / "task_packs").glob("*.json"):
            with self.subTest(path=path.name):
                package = json.loads(path.read_text())
                normalized = validate_task_pack(package)
                self.assertEqual(normalized["format"], TASK_PACK_FORMAT)
                self.assertEqual(normalized["package_type"], "task_pack")
                self.assertGreater(len(normalized["tasks"]), 0)
                self.assertTrue(normalized["package_hash"])

    def test_built_in_task_pack_library_lists_all_local_packs(self) -> None:
        packs = list_built_in_task_pack_metadata({"hmm.hot_tub_maintenance"})
        self.assertGreaterEqual(len(packs), 10)
        ids = {pack["id"] for pack in packs}
        self.assertIn("hmm.hvac_maintenance", ids)
        self.assertIn("hmm.water_heater_maintenance", ids)
        self.assertIn("hmm.refrigerator_maintenance", ids)
        self.assertIn("hmm.dryer_vent_maintenance", ids)
        self.assertIn("hmm.sump_pump_maintenance", ids)
        self.assertIn("hmm.pool_maintenance", ids)
        self.assertIn("hmm.generator_maintenance", ids)
        self.assertIn("hmm.home_exterior_seasonal_maintenance", ids)
        hot_tub = next(pack for pack in packs if pack["id"] == "hmm.hot_tub_maintenance")
        self.assertTrue(hot_tub["installed"])
        self.assertGreater(hot_tub["task_count"], 0)
        self.assertIn("package_hash", hot_tub)

    def test_load_built_in_task_pack_returns_valid_package(self) -> None:
        library_pack = next(pack for pack in list_built_in_task_pack_metadata() if pack["id"] == "hmm.hvac_maintenance")
        package = load_built_in_task_pack("hmm.hvac_maintenance")
        normalized = validate_task_pack(package)
        self.assertEqual(normalized["pack"]["id"], "hmm.hvac_maintenance")
        self.assertEqual(package["package_hash"], library_pack["package_hash"])
        self.assertGreater(len(package["tasks"]), 0)
        runtime_requirement = next(req for req in normalized["entity_requirements"] if req["id"] == "hvac_runtime")
        self.assertEqual(runtime_requirement["label"], "HVAC runtime")
        self.assertEqual(runtime_requirement["device_class"], "duration")
        self.assertEqual(runtime_requirement["state_class"], "total_increasing")
        self.assertEqual(runtime_requirement["unit_of_measurement"], "h")
        self.assertIn("blower", runtime_requirement["suggested_keywords"])

    def test_load_built_in_task_pack_rejects_unknown_id(self) -> None:
        with self.assertRaisesRegex(ValueError, "not found"):
            load_built_in_task_pack("hmm.missing_pack")

    def test_task_pack_sanitizes_private_fields(self) -> None:
        package = {
            "format": TASK_PACK_FORMAT,
            "format_version": 1,
            "type": "task_pack",
            "pack": {"id": "hmm.test", "name": "Test Pack", "version": "1.0.0"},
            "entity_requirements": [],
            "tasks": [
                {
                    "id": "test_task",
                    "name": "Test task",
                    "linked_device_id": "device-1",
                    "nfc_tags": ["tag-1"],
                    "nfc_action": "complete",
                    "mobile_notify_service": "notify.private_phone",
                    "mobile_notify_services": ["notify.private_phone"],
                    "notification_targets": ["notify.private_phone"],
                    "deleted": True,
                    "deleted_at": "2026-01-01T00:00:00+00:00",
                    "runtime_seconds": {"sensor.test": 100},
                    "totalized_usage": {"counter": 10},
                    "last_seen_states": {"sensor.test": {"state": "on"}},
                    "last_completed": "2026-01-01T00:00:00+00:00",
                    "last_completed_by": "private-user",
                    "last_completion_method": "panel",
                    "baseline_method": "specific_date",
                    "baseline_ago_value": 2,
                    "baseline_ago_unit": "weeks",
                    "late_count": 3,
                    "snoozed_until": "2026-01-02T00:00:00+00:00",
                    "completion_history": [{"completed_at": "2026-01-01T00:00:00+00:00"}],
                    "activity_history": [{"at": "2026-01-01T00:00:00+00:00"}],
                    "rules": [{"id": "time_1", "type": "time", "value": 1, "unit": "months"}],
                }
            ],
        }
        task = validate_task_pack(package)["tasks"][0]
        self.assertIsNone(task["linked_device_id"])
        self.assertEqual(task["nfc_tags"], [])
        self.assertEqual(task["nfc_action"], "disabled")
        self.assertIsNone(task["mobile_notify_service"])
        self.assertNotIn("mobile_notify_services", task)
        self.assertNotIn("notification_targets", task)
        self.assertNotIn("deleted", task)
        self.assertNotIn("deleted_at", task)
        self.assertNotIn("runtime_seconds", task)
        self.assertNotIn("totalized_usage", task)
        self.assertNotIn("last_seen_states", task)
        self.assertNotIn("last_completed", task)
        self.assertNotIn("last_completed_by", task)
        self.assertNotIn("last_completion_method", task)
        self.assertNotIn("baseline_method", task)
        self.assertNotIn("baseline_ago_value", task)
        self.assertNotIn("baseline_ago_unit", task)
        self.assertNotIn("late_count", task)
        self.assertNotIn("snoozed_until", task)
        self.assertNotIn("completion_history", task)
        self.assertNotIn("activity_history", task)
        self.assertEqual(task["source"]["type"], "task_pack")
        self.assertEqual(task["source"]["pack_id"], "hmm.test")
        self.assertEqual(task["source"]["template_task_id"], "test_task")
        self.assertTrue(task["source"]["imported_at"])
        self.assertEqual(task["provenance"]["origin"], "task_pack")
        self.assertEqual(task["provenance"]["pack_id"], "hmm.test")

    def test_entity_requirement_metadata_preserved_and_hardened(self) -> None:
        requirements = normalize_entity_requirements({
            "entity_requirements": [
                {
                    "id": "furnace_runtime",
                    "key": "furnace_runtime_sensor",
                    "name": "Legacy name",
                    "label": "Furnace Runtime Sensor",
                    "description": "Runtime sensor used to calculate furnace filter due status.",
                    "required": True,
                    "domain": "sensor",
                    "device_class": "duration",
                    "state_class": "total_increasing",
                    "unit_of_measurement": "h",
                    "suggested_keywords": "furnace",
                    "extra_future_field": "ignored",
                }
            ]
        })
        requirement = requirements[0]
        self.assertEqual(requirement["id"], "furnace_runtime")
        self.assertEqual(requirement["key"], "furnace_runtime_sensor")
        self.assertEqual(requirement["label"], "Furnace Runtime Sensor")
        self.assertEqual(requirement["description"], "Runtime sensor used to calculate furnace filter due status.")
        self.assertTrue(requirement["required"])
        self.assertEqual(requirement["domain"], "sensor")
        self.assertEqual(requirement["device_class"], "duration")
        self.assertEqual(requirement["state_class"], "total_increasing")
        self.assertEqual(requirement["unit_of_measurement"], "h")
        self.assertEqual(requirement["suggested_keywords"], ["furnace"])
        self.assertNotIn("extra_future_field", requirement)

    def test_older_entity_requirement_metadata_defaults_safely(self) -> None:
        requirements = normalize_entity_requirements({
            "entity_requirements": [
                {
                    "id": "legacy_runtime",
                    "name": "Legacy runtime",
                    "domain": "sensor",
                    "role": "runtime",
                    "required": True,
                }
            ]
        })
        requirement = requirements[0]
        self.assertEqual(requirement["key"], "legacy_runtime")
        self.assertEqual(requirement["label"], "Legacy runtime")
        self.assertEqual(requirement["description"], "")
        self.assertEqual(requirement["device_class"], "")
        self.assertEqual(requirement["state_class"], "")
        self.assertEqual(requirement["unit_of_measurement"], "")
        self.assertEqual(requirement["suggested_keywords"], [])

    def test_installed_pack_record(self) -> None:
        record = installed_pack_record(
            {"id": "hmm.test", "name": "Test Pack", "version": "1.0.0", "source": "bundled"},
            2,
            "abc123",
        )
        self.assertEqual(record["pack_id"], "hmm.test")
        self.assertEqual(record["pack_name"], "Test Pack")
        self.assertEqual(record["task_count"], 2)
        self.assertNotIn("imported_task_ids", record)
        self.assertEqual(record["package_hash"], "abc123")
        self.assertTrue(record["installed_at"])
        self.assertTrue(record["last_imported_at"])

    def test_installed_pack_record_repeat_import_updates_without_duplicate(self) -> None:
        existing = {
            "pack_id": "hmm.test",
            "pack_name": "Test Pack",
            "version": "1.0.0",
            "installed_at": "2026-01-01T00:00:00+00:00",
            "package_hash": "old",
        }
        record = merge_installed_pack_record(
            existing,
            {"id": "hmm.test", "name": "Test Pack", "version": "1.0.1", "source": "bundled"},
            3,
            "new",
        )
        self.assertEqual(record["pack_id"], "hmm.test")
        self.assertEqual(record["version"], "1.0.1")
        self.assertEqual(record["installed_at"], "2026-01-01T00:00:00+00:00")
        self.assertEqual(record["task_count"], 3)
        self.assertNotIn("imported_task_ids", record)
        self.assertEqual(record["package_hash"], "new")

    def test_build_task_pack_package_templates_local_entities(self) -> None:
        package = build_task_pack_package(
            {
                "id": "hmm.custom",
                "name": "Custom Pack",
                "version": "1.0.0",
                "author": "Tester",
                "tags": ["hvac", "homeowner"],
            },
            [
                {
                    "id": "filter",
                    "name": "Replace HVAC filter",
                    "linked_entities": ["sensor.hvac_runtime"],
                    "linked_device_id": "device-1",
                    "nfc_tags": ["tag-1"],
                    "mobile_notify_service": "notify.private_phone",
                    "completion_history": [{"completed_at": "2026-01-01T00:00:00+00:00"}],
                    "rules": [
                        {"id": "runtime", "type": "runtime", "entity": "sensor.hvac_runtime", "value": 200, "unit": "hours"}
                    ],
                }
            ],
        )
        self.assertEqual(package["format"], TASK_PACK_FORMAT)
        self.assertEqual(package["type"], "task_pack")
        self.assertEqual(package["pack"]["id"], "hmm.custom")
        self.assertEqual(package["pack"]["tags"], ["hvac", "homeowner"])
        self.assertTrue(package["package_hash"])
        self.assertEqual(len(package["entity_requirements"]), 1)
        requirement = package["entity_requirements"][0]
        self.assertEqual(requirement["id"], "sensor_hvac_runtime")
        self.assertEqual(requirement["name"], "Sensor Hvac Runtime")
        self.assertTrue(requirement["required"])
        self.assertEqual(requirement["role"], "runtime")
        task = package["tasks"][0]
        self.assertEqual(task["linked_entities"], ["hmm://entity/sensor_hvac_runtime"])
        self.assertEqual(task["rules"][0]["entity"], "hmm://entity/sensor_hvac_runtime")
        self.assertIsNone(task["linked_device_id"])
        self.assertEqual(task["nfc_tags"], [])
        self.assertIsNone(task["mobile_notify_service"])
        self.assertNotIn("completion_history", task)
        self.assertNotIn("sensor.hvac_runtime", json.dumps(package))

    def test_selected_task_export_rejects_empty_selection(self) -> None:
        with self.assertRaisesRegex(ValueError, "Select at least one task"):
            build_task_pack_package(
                {"id": "hmm.empty", "name": "Empty", "version": "1.0.0"},
                [],
            )

    def test_validate_task_pack_templates_raw_local_entity_ids(self) -> None:
        package = {
            "format": TASK_PACK_FORMAT,
            "format_version": 1,
            "type": "task_pack",
            "pack": {"id": "hmm.raw", "name": "Raw Pack", "version": "1.0.0"},
            "entity_requirements": [],
            "tasks": [
                {
                    "id": "runtime_task",
                    "name": "Runtime task",
                    "linked_entities": ["sensor.local_runtime"],
                    "rules": [
                        {"id": "runtime", "type": "runtime", "entity": "sensor.local_runtime", "value": 10, "unit": "hours"}
                    ],
                }
            ],
        }
        normalized = validate_task_pack(package)
        self.assertEqual(len(normalized["entity_requirements"]), 1)
        requirement = normalized["entity_requirements"][0]
        self.assertEqual(requirement["id"], "sensor_local_runtime")
        self.assertEqual(requirement["name"], "Sensor Local Runtime")
        self.assertEqual(requirement["role"], "runtime")
        self.assertEqual(requirement["task_ids"], ["runtime_task"])
        task = normalized["tasks"][0]
        self.assertEqual(task["linked_entities"], ["hmm://entity/sensor_local_runtime"])
        self.assertEqual(task["rules"][0]["entity"], "hmm://entity/sensor_local_runtime")
        self.assertNotIn("sensor.local_runtime", json.dumps(normalized))

    def test_validate_task_pack_accepts_key_based_placeholders(self) -> None:
        package = {
            "format": TASK_PACK_FORMAT,
            "format_version": 1,
            "type": "task_pack",
            "pack": {"id": "hmm.keyed", "name": "Keyed Pack", "version": "1.0.0"},
            "entity_requirements": [
                {
                    "id": "furnace_runtime",
                    "key": "furnace_runtime_sensor",
                    "label": "Furnace Runtime Sensor",
                    "domain": "sensor",
                    "role": "runtime",
                    "required": True,
                }
            ],
            "tasks": [
                {
                    "id": "runtime_task",
                    "name": "Runtime task",
                    "rules": [
                        {"id": "runtime", "type": "runtime", "entity": "hmm://entity/furnace_runtime_sensor", "value": 10, "unit": "hours"}
                    ],
                }
            ],
        }
        normalized = validate_task_pack(package)
        self.assertEqual(normalized["entity_requirements"][0]["key"], "furnace_runtime_sensor")
        self.assertEqual(normalized["tasks"][0]["rules"][0]["entity"], "hmm://entity/furnace_runtime_sensor")

    def test_entity_mapping_replaces_meter_runtime_and_linked_placeholders(self) -> None:
        requirements = [
            {"id": "sensor_office_ups_power", "key": "office_ups_power", "required": True},
            {"id": "hvac_runtime", "key": "furnace_runtime_sensor", "required": True},
            {"id": "linked_context", "required": False},
        ]
        task = {
            "id": "mapped_task",
            "name": "Mapped task",
            "linked_entities": ["hmm://entity/linked_context"],
            "rules": [
                {"id": "meter", "type": "counter", "entity": "hmm://entity/sensor_office_ups_power"},
                {"id": "runtime", "type": "runtime", "entity": "hmm://entity/hvac_runtime"},
            ],
        }
        mapped = apply_task_pack_entity_mapping(
            task,
            {
                "hmm://entity/sensor_office_ups_power": "sensor.office_ups_power",
                "hmm://entity/hvac_runtime": "sensor.furnace_runtime",
                "hmm://entity/linked_context": "sensor.office_temperature",
            },
            requirements,
        )
        self.assertEqual(mapped["rules"][0]["entity"], "sensor.office_ups_power")
        self.assertEqual(mapped["rules"][1]["entity"], "sensor.furnace_runtime")
        self.assertEqual(mapped["linked_entities"], ["sensor.office_temperature"])
        self.assertNotIn("hmm://entity/", json.dumps(mapped))

    def test_entity_mapping_matches_requirement_id_and_key_aliases(self) -> None:
        requirements = [{"id": "sensor_office_ups_power", "key": "office_ups_power", "required": True}]
        by_id = apply_task_pack_entity_mapping(
            {"id": "meter", "name": "Meter", "rules": [{"id": "meter", "type": "counter", "entity": "hmm://entity/sensor_office_ups_power"}]},
            {"office_ups_power": "sensor.office_ups_power"},
            requirements,
        )
        by_key = apply_task_pack_entity_mapping(
            {"id": "meter", "name": "Meter", "rules": [{"id": "meter", "type": "counter", "entity": "hmm://entity/office_ups_power"}]},
            {"sensor_office_ups_power": "sensor.office_ups_power"},
            requirements,
        )
        self.assertEqual(by_id["rules"][0]["entity"], "sensor.office_ups_power")
        self.assertEqual(by_key["rules"][0]["entity"], "sensor.office_ups_power")

    def test_required_unresolved_placeholder_imports_paused_with_reason(self) -> None:
        mapped = apply_task_pack_entity_mapping(
            {"id": "runtime", "name": "Runtime", "rules": [{"id": "runtime", "type": "runtime", "entity": "hmm://entity/hvac_runtime"}]},
            {},
            [{"id": "hvac_runtime", "required": True}],
        )
        self.assertTrue(mapped["paused"])
        self.assertEqual(mapped["provenance"]["pause_reason"], "unresolved_required_entity")
        self.assertEqual(mapped["rules"][0]["entity"], "hmm://entity/hvac_runtime")

    def test_optional_cleared_placeholder_is_removed(self) -> None:
        mapped = apply_task_pack_entity_mapping(
            {
                "id": "linked",
                "name": "Linked",
                "linked_entities": ["hmm://entity/linked_context"],
                "rules": [{"id": "time", "type": "time", "value": 1, "unit": "months"}],
            },
            {"hmm://entity/linked_context": "__clear__"},
            [{"id": "linked_context", "required": False}],
        )
        self.assertEqual(mapped["linked_entities"], [])
        self.assertNotIn("hmm://entity/", json.dumps(mapped))

    def test_task_specific_mapping_allows_shared_placeholder_to_map_differently(self) -> None:
        requirements = [{"id": "runtime_source", "required": True}]
        first_task = {
            "id": "air_filter",
            "name": "Air filter",
            "rules": [{"id": "runtime", "type": "runtime", "entity": "hmm://entity/runtime_source"}],
        }
        second_task = {
            "id": "humidifier_pad",
            "name": "Humidifier pad",
            "rules": [{"id": "runtime", "type": "runtime", "entity": "hmm://entity/runtime_source"}],
        }
        task_entity_mapping = {
            "air_filter": {"hmm://entity/runtime_source": "sensor.air_handler_runtime"},
            "humidifier_pad": {"hmm://entity/runtime_source": "sensor.humidifier_runtime"},
        }

        first_mapping = entity_mapping_for_task(first_task["id"], {}, task_entity_mapping)
        second_mapping = entity_mapping_for_task(second_task["id"], {}, task_entity_mapping)
        first_mapped = apply_task_pack_entity_mapping(first_task, first_mapping, requirements)
        second_mapped = apply_task_pack_entity_mapping(second_task, second_mapping, requirements)

        self.assertEqual(first_mapped["rules"][0]["entity"], "sensor.air_handler_runtime")
        self.assertEqual(second_mapped["rules"][0]["entity"], "sensor.humidifier_runtime")

    def test_task_specific_mapping_overrides_global_mapping_for_one_task(self) -> None:
        global_mapping = {"hmm://entity/runtime_source": "sensor.default_runtime"}
        task_entity_mapping = {
            "air_filter": {"hmm://entity/runtime_source": "sensor.air_handler_runtime"},
        }

        first_mapping = entity_mapping_for_task("air_filter", global_mapping, task_entity_mapping)
        fallback_mapping = entity_mapping_for_task("water_heater", global_mapping, task_entity_mapping)

        self.assertEqual(first_mapping["hmm://entity/runtime_source"], "sensor.air_handler_runtime")
        self.assertEqual(fallback_mapping["hmm://entity/runtime_source"], "sensor.default_runtime")

    def test_task_specific_flat_key_mapping_is_supported(self) -> None:
        mapping = entity_mapping_for_task(
            "air_filter",
            {},
            {"air_filter::hmm://entity/runtime_source": "sensor.air_handler_runtime"},
        )
        self.assertEqual(mapping["hmm://entity/runtime_source"], "sensor.air_handler_runtime")

    def test_task_pack_import_mode_rejects_replace(self) -> None:
        self.assertEqual(enforce_task_pack_merge_mode("merge"), "merge")
        with self.assertRaisesRegex(ValueError, "Replace is only available"):
            enforce_task_pack_merge_mode("replace")
        with self.assertRaisesRegex(ValueError, "must be merge"):
            enforce_task_pack_merge_mode("invalid")

    def test_normal_backup_export_is_not_task_pack(self) -> None:
        backup = {
            "format": "home_maintenance_manager_export",
            "format_version": 1,
            "tasks": [{"id": "backup_task", "name": "Backup task"}],
            "settings": {"notification_settings": {"mobile_notify_services": ["notify.phone"]}},
        }
        self.assertFalse(is_task_pack_package(backup))


if __name__ == "__main__":
    unittest.main()
