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

    def test_runtime_threshold_helper_hidden_for_entity_on(self) -> None:
        self.assertIn("threshold-helper-fields", self.source)
        self.assertIn("runtimeMethod === 'above_threshold'", self.source)
        self.assertIn('].threshold-helper-fields`).forEach(el => el.classList.toggle(\'hidden\', !(showRuntime && runtimeMethod === \'above_threshold\')))', self.source)

    def test_runtime_threshold_helper_visible_for_numeric_threshold(self) -> None:
        self.assertIn("Numeric value is above threshold", self.source)
        self.assertIn("renderRuntimeThresholdHelper(prefix)", self.source)
        self.assertIn("data-analysis-days-prefix", self.source)

    def test_rule2_uses_same_runtime_threshold_helper(self) -> None:
        self.assertIn("${this.renderRuntimeThresholdHelper(prefix)}", self.source)
        self.assertIn("this.bindRuntimeAnalysisControls('task-rule2')", self.source)
        self.assertIn("this.analyzeRuntimeSource(el.dataset.runtimePrefix || 'task')", self.source)

    def test_import_mapping_selection_preserves_scroll(self) -> None:
        self.assertIn("renderImportWizardPreservingScroll()", self.source)
        self.assertIn("const scrollTop = body ? body.scrollTop : 0", self.source)
        self.assertIn("this.renderImportWizardPreservingScroll()", self.source)

    def test_import_mapping_validates_before_review(self) -> None:
        self.assertIn("mappingIssueForTaskRef(ref)", self.source)
        self.assertIn("Fix incompatible entity mappings before reviewing the import.", self.source)
        self.assertIn("Show issues only", self.source)
        self.assertIn("Jump to first issue", self.source)

    def test_review_import_shows_clear_summary_and_advanced_options(self) -> None:
        self.assertIn("New tasks", self.source)
        self.assertIn("Existing tasks updated", self.source)
        self.assertIn("Previously deleted tasks found", self.source)
        self.assertIn("Advanced Options", self.source)
        self.assertNotIn("Settings and deleted tasks", self.source)

    def test_import_settings_and_deleted_restore_are_conditional(self) -> None:
        self.assertIn("p.settings_present ? `<label class=\"check-row\"><input type=\"checkbox\" id=\"import-settings\"", self.source)
        self.assertIn("hasDeleted ? `<label class=\"check-row\"><input type=\"checkbox\" id=\"restore-deleted\"", self.source)
        self.assertIn("Restore tasks that were previously deleted on this HMM instance", self.source)


if __name__ == "__main__":
    unittest.main()
