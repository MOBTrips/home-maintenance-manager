## 0.7.4

- Refreshed the dashboard with a Phase 2 Home Health card, Attention Summary, clearer section hierarchy, and a dashboard-specific test plan.
- Added Phase 1 UI foundation components for shared status colors, task status chips, compact task rows, section headers, dialog layout, and dashboard metric cards.
- Updated README documentation links and added a v0.7.4 Phase 1 UI Foundation test plan.

## 0.7.3

- Reworked Task Pack missing-entity mapping into a queue workflow with progress counts, Required/Optional/All filters, and per-requirement review cards.
- Added richer entity requirement metadata display in the import wizard, including placeholder key, purpose, expected domain, device class, state class, unit, and affected task context.
- Added ranked local entity suggestions using requirement metadata, friendly names, entity IDs, and available area/device context instead of generic recent sensor chips.
- Added final import summary counts for mapped entities, cleared references, skipped optional references, unresolved requirements, and tasks that will import paused.
- Extended bundled Task Pack entity requirements with metadata used by the improved mapper.
- Hardened Task Pack entity imports so required unresolved tasks stay selected for review, key-based placeholders are recognized, sparse suggestions avoid domain-only noise, and pause reasons are persisted in task provenance.
- Validated metered task entity mappings by unit family, rejected incompatible mappings, and normalized stale Task Pack meter units to the mapped entity unit.
- Added reset/session metered source mode for sensors that rise during a use and reset to zero between uses.
- Added friendly metered target unit scaling for time units while storing normalized source-unit amounts.
- Added an Open HA Device shortcut from task cards, task details, and the task editor for inspecting generated Maintenance Task devices.
- Fixed integration removal so uninstalling HMM clears HMM-owned storage and generated registry devices/entities; normal reloads and restarts still preserve tasks.

## 0.7.2

- Added a local built-in Task Pack library in Settings with pack name, description, task count, tags/categories, and installed status.
- Added bundled Task Packs for HVAC, water heater, refrigerator, dryer vent, sump pump, pool, generator, and home exterior seasonal maintenance.
- Added backend websocket APIs for listing built-in packs and loading one pack into the existing import review wizard.
- Built-in pack installation remains local-only, preview-first, merge-only, and uses the existing entity mapping and completion summary flow.

## 0.7.1

- Added a Settings workflow to export selected tasks as a formal Task Pack with user-entered pack metadata.
- Task Pack exports now convert local Home Assistant entity IDs into template placeholders with `entity_requirements`.
- Added an installed Task Packs view in Settings showing pack name, version, install date, and imported task count.
- Improved import completion summaries with new tasks, updated tasks, skipped tasks, and tasks paused due to unresolved entities.
- Clarified entity placeholder mapping labels and help text in the import wizard.

## 0.7.0

- Added formal Task Pack JSON schema support using `home_maintenance_manager_task_pack`.
- Enforced Task Pack safety in the backend: Task Packs always merge, never import settings, never replace full storage, and never delete existing tasks.
- Added Task Pack template sanitization for runtime/history, NFC tag IDs, Home Assistant device IDs, deleted tombstones, and private notification targets.
- Added installed Task Pack metadata tracking with pack ID, version, source, installed time, imported task IDs, provenance, and package hash.
- Added task provenance metadata for Task Pack imports.
- Added bundled example Task Packs for Basic Homeowner Maintenance and Hot Tub Maintenance.
- Updated the import wizard to show Task Pack metadata, entity requirements, task counts, and merge-only behavior.
- Added Task Pack documentation and schema reference.

## 0.6.8

- Added `AGENTS.md` as shared repository guidance for Codex, ChatGPT-authored prompts, and human contributors.
- Added development foundation docs for requirements, roadmap, UI guidelines, release checklist, and ChatGPT + Codex workflow.
- Added GitHub issue templates for bug reports, feature requests, and scoped Codex implementation tasks.
- Added pull request template with storage, testing, documentation, and release checks.
- Added GitHub Actions validation workflow for Python compile, HACS validation, and Hassfest validation.
- Updated README documentation links and development workflow overview.
- Normalized documentation references to the current v0.6.8 development baseline.

## 0.6.7

- Fixed import wizard task selections being cleared when moving from Entity Mapping to Import Options.
- Improved Import Options guidance with safer merge/replace explanations.
- Clarified that Task Packs always merge and that Replace is backup recovery mode.

## 0.6.6

- Improved import wizard entity mapping context.
- Missing entity rows now show the affected task name, category, import status, role, required/optional status, schedule context, and a short task description.
- Fixed duplicate mapped-entities line in import summary.

## 0.6.5

- Moved Merge/Replace import behavior out of Settings and into the import wizard.
- Added a dedicated Entity Mapping wizard step for missing entities.
- Added entity picker support, suggestion chips, unresolved mapping, and clear mapping actions.
- Added a final import summary showing selected tasks, mode, mapped, cleared, and unresolved entities.
- Required runtime/counter entities left unresolved are imported paused for safety.

## 0.6.4

### Improved
- Rebuilt JSON import review into a dedicated full-screen/modal wizard, matching the task view/edit experience.
- Added summary tiles, stepper, status filters, bulk selection controls, and clearer missing-entity warnings.
- Improved mobile layout for import review so task names, categories, statuses, and entity issues are readable.
- Import still previews only until the user confirms; no storage changes are made during review.

## 0.6.3

- Added import preview/review workflow before saving JSON imports.
- Added backup vs task-pack import foundation.
- Added backend `import_preview` and `import_apply` websocket APIs.
- Added selected-task import support for merge and replace modes.
- Added entity reference detection for linked entities and runtime/counter rules.
- Added missing required entity warnings and safe pausing behavior when required runtime/counter entities are cleared.

## 0.6.2

- Added portable JSON export from the HMM Settings page.
- Added portable JSON import from the HMM Settings page.
- Added Merge import mode to add/update imported tasks while keeping existing tasks.
- Added Replace import mode to replace all HMM tasks/settings and tombstone removed task IDs.
- Added backend websocket APIs for export/import so future Task Packs can reuse the same foundation.


## 0.6.1

- Fixed task deletion after the v0.6 unified-storage migration.
- Added persistent deletion tombstones so legacy storage/config-entry data cannot resurrect deleted tasks on reload or reinstall.
- Added clean storage removal when the Home Maintenance Manager integration config entry is intentionally removed.

# Changelog

## [0.6.0] - 2026-06-17

### Added
- Added `.github/workflows/validate.yml` with HACS Action and Hassfest validation for pull requests, pushes to `main`, scheduled runs, and manual dispatch.
- Expanded reference documentation for getting started, architecture, assets/tasks, scheduling, seasonal tasks, NFC tags, FAQ, and HACS readiness.
- Added README links to every reference document.

### Changed
- Updated the integration manifest version to `0.6.0`.
- Added `integration_type: hub` to the Home Assistant manifest.
- Updated `hacs.json` minimum Home Assistant version from `2025.12.0` to `2025.6.0` as a more practical tested baseline target.
- Split the task editor Reminders and NFC controls into separate sections in the edit workflow.
- Expanded the README with HACS install instructions, manual install instructions, quick start, schedule overview, NFC workflow summary, created resources, known limitations, and support links.

## [0.5.31] - 2026-06-17

### Added
- Added HACS/Home Assistant brand assets in `custom_components/home_maintenance_manager/brand/`.
- Added PNG brand files required for HACS validation: `icon.png` and `logo.png`.
- Added the official HACS validation GitHub Action workflow at `.github/workflows/validate.yml`.
- Added HACS readiness documentation under `docs/hacs-readiness.md`.

### Changed
- Updated the integration manifest version to `0.5.31`.
- Kept the sidebar panel icon as an MDI icon while adding proper integration branding for HACS/Home Assistant.

## [0.5.30] - 2026-06-17

### Changed
- Cleaned up the task editor layout for better field alignment.
- Reworked Task Basics so task name and maintenance category align consistently.
- Improved the Maintenance Schedule section with horizontal value/unit controls for time, runtime, and metered schedules.
- Split Reminders and NFC into separate task editor sections.
- Added root-level icon and logo assets for HACS/GitHub visibility while keeping the Home Assistant sidebar icon configured.

## [0.5.29] - 2026-06-17
### Added
- Documentation overhaul
- Professional README
- Dedicated CHANGELOG
- Documentation structure under /docs
- Architecture documentation

## [0.5.28]
### Added
- Task detail visual cards
- Seasonal badges and timeline
- HMM branding assets

## [0.5.27]
### Added
- Progress cards
- Tracking source cards
- Friendly status labels

## [0.5.26]
### Changed
- Asset/task setup cleanup

## [0.5.25]
### Fixed
- Runtime and metered schedule save issues

## [0.5.24]
### Added
- Multi-season support
- Custom seasonal ranges

## [0.5.23]
### Added
- Seasonal configuration UI

## [0.5.22]
### Fixed
- Seasonal editor visibility

## [0.5.21]
### Added
- Seasonal active windows

## 0.6.0

### Storage & backup foundation
- Moved HMM task data to a single Home Assistant storage file: `/config/.storage/home_maintenance_manager`.
- Added storage versioning with v0.6 unified storage schema.
- Added full migration from legacy `/config/.storage/home_maintenance_manager.tasks`.
- Added migration from legacy config-entry task options and notification settings.
- Stopped using config-entry options as the task source of truth.
- Preserved runtime data, completion history, activity history, NFC assignments, snooze state, and notification settings during migration.
- Added Home Assistant diagnostics support for downloaded integration diagnostics.
- Added Backup & Restore status to the HMM Settings page.

### Notes
- Full Home Assistant backups include `/config/.storage/home_maintenance_manager` automatically.
- The old legacy storage file is left in place as a safety fallback but is no longer the active database after migration.
