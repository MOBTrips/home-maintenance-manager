# Storage and Backup

Home Maintenance Manager v0.7.3 uses Home Assistant's storage framework as the system of record.

## Primary storage file

```text
/config/.storage/home_maintenance_manager
```

This file contains:

- task definitions
- schedule/rule configuration
- runtime counters
- completion history
- activity history
- NFC tag assignments
- snooze state
- HMM-owned settings, including notification settings
- installed Task Pack metadata
- storage migration metadata

## Home Assistant backups

Full Home Assistant backups include the `.storage` directory automatically, so HMM data is included in normal HA backup and restore workflows.

Recommended backup path:

```text
Settings → System → Backups → Create backup
```

For full recovery, restore the Home Assistant backup that contains:

```text
/config/.storage/home_maintenance_manager
/config/custom_components/home_maintenance_manager/
```

## Uninstall behavior

Removing the Home Maintenance Manager integration from Home Assistant deletes HMM-owned storage and generated HMM devices/entities. Re-adding the integration after removal starts with no previous HMM tasks.

Normal Home Assistant restarts, integration reloads, HACS updates, and custom component reinstalls do not clear task storage. Use a Home Assistant backup or HMM JSON export before removing the integration if you want to keep the tasks for later restore.

## Migration from older versions

v0.6.0 migrates data from:

```text
/config/.storage/home_maintenance_manager.tasks
```

and from legacy config-entry options that stored task definitions and notification settings.

The migration preserves:

- existing tasks
- runtime progress
- last completed values
- completion history
- activity history
- NFC tag mappings
- snooze state
- notification settings

The legacy file is not deleted automatically. It remains as a safety fallback, but HMM writes new data to:

```text
/config/.storage/home_maintenance_manager
```

## Diagnostics

Home Assistant diagnostics are available from the integration page. Diagnostics redact user/device identifiers where appropriate and include storage status, counts, migration metadata, and task summaries useful for support.

## Backup status page

The HMM panel includes a Backup & Restore section under Settings showing:

- active storage file
- storage version
- task count
- history counts
- whether settings are stored in the unified file
- migration source and time

## JSON export and import

v0.7.3 includes a portable JSON export/import workflow under:

```text
Maintenance panel → Settings → Export / Import JSON
```

The JSON export includes:

- task definitions
- schedule rules
- runtime counters and totalized usage
- completion history
- activity history
- NFC tag assignments
- HMM-owned settings

Import supports two modes:

| Mode | Behavior |
|---|---|
| Merge | Adds imported tasks and updates matching task IDs while keeping existing tasks. |
| Replace | Replaces all HMM tasks/settings with the import file and records deletion tombstones for removed task IDs. |

Use Home Assistant full backups for complete recovery of a Home Assistant instance. Use HMM JSON export/import for task sharing, moving HMM data between instances, support troubleshooting, and future Task Packs.

Settings also includes **Export selected tasks as Task Pack**. That workflow creates a template package instead of a backup: it asks for pack metadata, includes only the selected tasks, strips runtime/private fields, and converts local Home Assistant entity IDs into `entity_requirements` placeholders for mapping during import.

Settings also includes a local **Browse built-in packs** library. Built-in packs are bundled JSON templates and open in the same preview-first import wizard. They do not use remote downloads or update checks.


## Import Review and Task Pack Foundation

v0.7.3 includes a reviewed import flow. HMM previews backup-style exports and Task Pack JSON before changing storage. The preview classifies tasks as new, update, duplicate, deleted, or invalid and reports entity references as found or missing. Task Pack missing entities are reviewed in a queue with required/optional filters, ranked suggestions, and a final summary of mapped, cleared, skipped, unresolved, and paused-task outcomes. Runtime and counter rule entities are treated as required references; when they cannot be resolved, the task is imported safely instead of silently running against a bad entity.

Task Packs are templates, not system backups. HMM strips Home Assistant-specific device IDs, NFC tag IDs, completion history, runtime history, deleted tombstones, settings, and private notification targets during Task Pack import. Task Packs always merge and cannot replace full storage or delete existing user tasks.
