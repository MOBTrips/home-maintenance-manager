# Storage and Backup

Home Maintenance Manager v0.6.2 uses Home Assistant's storage framework as the system of record.

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

v0.6.2 adds a portable JSON export/import workflow under:

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
