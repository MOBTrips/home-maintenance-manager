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
| `format_version` | Yes | Schema version number. v0.7.3 uses `1`. |
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
  "min_hmm_version": "0.7.3",
  "provenance": {
    "kind": "community",
    "source": "bundled"
  }
}
```

## Entity Requirements

Entity requirements describe Home Assistant entities a template can use. Use placeholder references such as `hmm://entity/hot_tub_pump_runtime` in task rules. Runtime, metered usage, and service due rule entities are treated as required requirements when exported from local tasks.

```json
{
  "id": "hot_tub_pump_runtime",
  "name": "Hot tub pump runtime",
  "description": "Optional runtime or power source.",
  "domain": "sensor",
  "role": "runtime",
  "required": false,
  "device_class": "duration",
  "state_class": "total_increasing",
  "unit_of_measurement": "h",
  "suggested_keywords": ["hot tub", "pump", "runtime"],
  "preferred_entity_id": "sensor.mock_device_hot_tub_pump_runtime",
  "qa_auto_map": true,
  "auto_map_reason": "Using mock_device QA entity found in Home Assistant.",
  "task_ids": ["pack_hot_tub_clean_filter_runtime"]
}
```

When exporting selected local tasks as a Task Pack, HMM converts task entity IDs such as `sensor.pool_pump_power` into placeholders such as `hmm://entity/sensor_pool_pump_power` and adds a matching requirement record.

Recommended entity requirement metadata:

| Field | Description |
|---|---|
| `key` | Stable placeholder key. Defaults to `id` when omitted. |
| `label` | Human-readable name shown in the mapping queue. |
| `description` | Purpose of the entity and why the task uses it. |
| `domain` | Expected Home Assistant domain, such as `sensor`. |
| `device_class` | Expected Home Assistant device class, such as `duration`. |
| `state_class` | Expected state class, such as `total_increasing`. |
| `unit_of_measurement` | Expected unit, such as `h`. |
| `suggested_keywords` | Words used to rank local entity suggestions by name, entity ID, area, or device context. |
| `preferred_entity_id` | Optional exact Home Assistant entity ID hint for QA auto-mapping. |
| `preferred_entity_ids` | Optional ordered list of exact entity ID hints. The first existing entity is used. |
| `qa_auto_map` | Optional boolean. Enables safe QA auto-mapping for this requirement. |
| `auto_map_when_available` | Optional boolean. Enables auto-mapping when a preferred entity exists. |
| `auto_map_reason` | Optional user-facing reason shown in the import wizard when auto-mapped. |

For metered `counter` requirements, `unit_of_measurement` is used as a compatibility contract. HMM rejects final mappings whose source unit belongs to a different family, such as mapping a W power sensor to a gal volume task. Compatible units in the same family can be mapped, and HMM replaces stale task-pack unit metadata with the mapped entity unit during import. Service due requirements do not use unit compatibility, but unresolved required service due placeholders pause affected imported tasks until the user maps or edits the source.

### QA Auto-Mapping

Task Packs may include preferred entity hints for generated QA environments, such as public mock entities from a separate `mock_device` integration. This is intended to make repeatable release testing faster without weakening the privacy-safe placeholder model.

Auto-mapping only happens when all of the following are true:

- The package is a Task Pack.
- The task still references an `hmm://entity/<requirement_id>` placeholder.
- The requirement sets `qa_auto_map: true` or `auto_map_when_available: true`.
- `preferred_entity_id` or one of `preferred_entity_ids` exactly matches an entity currently present in Home Assistant.
- The preferred entity is a real Home Assistant entity ID, not another `hmm://` placeholder.

When multiple `preferred_entity_ids` are provided, HMM uses the first one that exists. The import preview marks the requirement as auto-mapped, counts it as found, shows the mapped entity ID and reason, and still allows the user to override it before import. Explicit user mappings always win over automatic mappings.

Do not use preferred entity hints for private household entities in externally shared packs. Normal Task Packs must continue to use placeholders and let the user choose their own local entities during preview.

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
