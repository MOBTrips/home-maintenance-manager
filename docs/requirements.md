# Home Maintenance Manager Requirements

This document is the shared requirements baseline for HMM development. Keep it current as the product evolves.

## Product purpose

Home Maintenance Manager helps Home Assistant users organize, schedule, track, and document recurring home maintenance tasks across assets, rooms, systems, equipment, and seasonal workflows.

## Core user outcomes

Users should be able to:

1. Create and manage home maintenance tasks.
2. Group tasks by category, asset, room, system, or equipment.
3. See what is due, upcoming, paused, seasonal, or completed.
4. Schedule tasks by time, runtime, metered usage, calendar recurrence, or seasonal active windows.
5. Complete tasks from the dashboard, task detail view, NFC scans, buttons, or automations.
6. Preserve task history.
7. Export their data for backup.
8. Import backups safely with review before applying changes.
9. Import future task packs without accidentally deleting existing user data.
10. Recover cleanly from deleted tasks, missing entities, and Home Assistant restarts.

## Functional requirements

### Tasks

- Tasks have stable IDs.
- Tasks support name, description, category, optional asset/entity links, schedule, reminders, NFC behavior, status, and history.
- Tasks can be created, edited, completed, paused, snoozed, deleted, exported, and imported.
- Deleting a task must remove related entities/devices or prevent stale unavailable entities from remaining visible when possible within Home Assistant constraints.
- Deleted tasks must not be resurrected by legacy storage or config-entry data.

### Scheduling

HMM supports these schedule types:

- Time based: minutes, hours, days, weeks, months, years.
- Runtime based: minutes, hours, days, months, years from a Home Assistant runtime source.
- Metered usage: cumulative or rate-based sources such as gallons, kWh, miles, cycles, starts, or other counters.
- Calendar based: recurring date/day patterns such as a specific weekday of a month.
- Seasonal active windows: tasks only appear or become actionable during configured months/dates.

### Import/export

- Export must produce a portable JSON file.
- Import must include preview before applying changes.
- Import preview must classify tasks as new, update, duplicate, deleted, invalid, or equivalent clear states.
- Import wizard must allow selecting which tasks to import.
- Backup import may support Merge and Replace modes.
- Replace mode must be clearly marked as destructive and intended for backup recovery.
- Task-pack import must merge and must not delete existing user tasks.
- Task packs must use the formal `home_maintenance_manager_task_pack` schema and be sanitized as templates before saving.
- Missing entities must be reviewed with task context.
- Required runtime/meter entities unresolved during import must be imported safely, usually paused.

### NFC

- Users can assign a Home Assistant NFC tag to a task.
- Supported actions include disabled, open task, confirm completion, complete trusted task, and log activity.
- Changing a task to no NFC tag must remove stale scan behavior.
- Reassigning a tag must not leave the old task linked to that tag.

### Home Assistant integration

- HMM must expose useful task status through Home Assistant entities.
- HMM should use native Home Assistant storage, config flow, services, diagnostics, and websocket APIs.
- HMM must remain compatible with HACS custom repository installation.

## Non-functional requirements

- Reliability: task data must survive restarts, upgrades, imports, and reloads.
- Safety: destructive actions need clear user confirmation.
- Usability: complex workflows should use dedicated dialogs/wizards, not crowded settings pages.
- Accessibility: UI should be readable on desktop and mobile.
- Maintainability: changes should be scoped, documented, and reviewed through GitHub issues/PRs.
- Compatibility: follow Home Assistant and HACS expectations for custom integrations.

## Current product priorities

1. Stabilize task lifecycle, deletion, import/export, and NFC cleanup.
2. Improve the import wizard and entity mapping experience.
3. Expand the v0.7.0 task-pack foundation with repository/update workflows and more curated packs.
4. Improve documentation and release discipline.
5. Add automated validation in GitHub Actions.
