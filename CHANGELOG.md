
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
