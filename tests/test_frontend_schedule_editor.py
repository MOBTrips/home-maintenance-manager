from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / "custom_components" / "home_maintenance_manager" / "frontend" / "home-maintenance-manager-panel.js"


class FrontendScheduleEditorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = PANEL.read_text(encoding="utf-8")

    def test_schedule_dropdown_contains_only_single_rule_types(self) -> None:
        for label in (
            "Time or runtime, whichever comes first",
            "Time and runtime",
            "Time or metered usage, whichever comes first",
            "Time and metered usage",
        ):
            self.assertNotIn(label, self.source)
        self.assertIn("['service_due', 'Service due']", self.source)

    def test_frontend_saves_service_due_and_rule2(self) -> None:
        self.assertIn("collectScheduleRule('task-rule2', 2, existing)", self.source)
        self.assertIn("type:'service_due'", self.source)
        self.assertIn("due_logic: dueLogic", self.source)
        self.assertIn("task-rule2-service-entity", self.source)

    def test_frontend_loads_due_logic_and_rule2_fields(self) -> None:
        self.assertIn("resolveDueLogic(task)", self.source)
        self.assertIn("this.renderScheduleRuleEditor(rule2, 'task-rule2', 2)", self.source)
        self.assertIn("id=\"task-due-logic\"", self.source)


if __name__ == "__main__":
    unittest.main()
