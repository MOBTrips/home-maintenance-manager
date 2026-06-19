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
installed_pack_record = task_packs.installed_pack_record
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
                    "runtime_seconds": {"sensor.test": 100},
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
        self.assertNotIn("runtime_seconds", task)
        self.assertNotIn("completion_history", task)
        self.assertNotIn("activity_history", task)
        self.assertEqual(task["provenance"]["origin"], "task_pack")
        self.assertEqual(task["provenance"]["pack_id"], "hmm.test")

    def test_installed_pack_record(self) -> None:
        record = installed_pack_record(
            {"id": "hmm.test", "name": "Test Pack", "version": "1.0.0", "source": "bundled"},
            ["task_b", "task_a", "task_a"],
            "abc123",
        )
        self.assertEqual(record["id"], "hmm.test")
        self.assertEqual(record["imported_task_ids"], ["task_a", "task_b"])
        self.assertEqual(record["package_hash"], "abc123")
        self.assertTrue(record["installed_at"])


if __name__ == "__main__":
    unittest.main()
