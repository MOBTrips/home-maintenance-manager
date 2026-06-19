# Task Pack Schema

Task Packs use JSON and must declare this top-level shape:

```json
{
  "format": "home_maintenance_manager_task_pack",
  "format_version": 1,
  "type": "task_pack",
  "pack": {},
  "entity_requirements": [],
  "tasks": [],
  "package_hash": "optional sha256 hash"
}
```

## Top-Level Fields

| Field | Required | Description |
|---|---:|---|
| `format` | Yes | Must be `home_maintenance_manager_task_pack`. |
| `format_version` | Yes | Schema version number. v0.7.1 uses `1`. |
| `type` | Yes | Must be `task_pack`. |
| `pack` | Yes | Metadata about the pack. |
| `entity_requirements` | Yes | Entity requirements used by task templates. May be empty. |
| `tasks` | Yes | HMM task templates. |
| `package_hash` | No | Stable hash added by HMM exports/import normalization when practical. |

## Pack Metadata

Required fields:

- `id`
- `name`
- `version`

Recommended fields:

- `description`
- `author`
- `license`
- `source`
- `source_url`
- `min_hmm_version`
- `categories`
- `tags`
- `provenance`

Example:

```json
{
  "id": "hmm.hot_tub_maintenance",
  "name": "Hot Tub Maintenance",
  "version": "1.0.0",
  "description": "Recurring hot tub care tasks.",
  "author": "Home Maintenance Manager",
  "source": "bundled",
  "min_hmm_version": "0.7.1",
  "provenance": {
    "kind": "community",
    "source": "bundled"
  }
}
```

## Entity Requirements

Entity requirements describe Home Assistant entities a template can use. Use placeholder references such as `hmm://entity/hot_tub_pump_runtime` in task rules.

```json
{
  "id": "hot_tub_pump_runtime",
  "name": "Hot tub pump runtime",
  "description": "Optional runtime or power source.",
  "domain": "sensor",
  "role": "runtime",
  "required": false,
  "task_ids": ["pack_hot_tub_clean_filter_runtime"]
}
```

When exporting selected local tasks as a Task Pack, HMM converts task entity IDs such as `sensor.pool_pump_power` into placeholders such as `hmm://entity/sensor_pool_pump_power` and adds a matching requirement record.

## Task Templates

Tasks use the normal HMM task shape, but packs should omit private or runtime fields. During import, HMM strips:

- `runtime_seconds`
- `totalized_usage`
- `last_seen_states`
- `last_completed`
- `last_completed_by`
- `last_completion_method`
- `completion_history`
- `activity_history`
- `snoozed_until`
- `nfc_tags`
- `linked_device_id`
- `mobile_notify_service`

HMM also sets imported Task Pack task provenance so the task can be traced back to its pack.

## Exported Task Packs

Task Packs exported from Settings use the same schema and include user-entered metadata. They are templates, not backups, so exported task bodies do not keep runtime history, completion history, activity history, NFC tag IDs, Home Assistant device IDs, private notification targets, or local entity IDs.
