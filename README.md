
## v0.2.0 UI Task Editor

This release adds a full Home Assistant Options Flow task editor.

After adding the integration, go to:

**Settings → Devices & services → Home Maintenance Manager → Configure**

From there you can:

- Add a maintenance task
- Edit an existing UI-created maintenance task
- Delete a UI-created maintenance task
- Import/replace UI tasks using JSON
- Save and reload the integration

Each UI task can configure:

- Task ID and name
- Description, category, and area text
- Linked Home Assistant entities
- Upcoming threshold percent
- Pause state
- Multiple due rules
- Rule logic: `any`, `all`, or `primary`
- NFC tag IDs
- NFC behavior
- Notification mode
- Mobile notify service name
- Snooze limits
- Markdown instructions
- Checklist JSON
- Parts JSON
- Tools list

### Rule JSON examples

Time rule:

```json
[
  {"id": "time_1", "type": "time", "name": "Every 90 days", "days": 90}
]
```

Runtime rule:

```json
[
  {"id": "pump_hours", "type": "runtime", "name": "100 pump hours", "entity": "switch.pool_pump_run", "hours": 100}
]
```

Runtime threshold rule:

```json
[
  {"id": "power_hours", "type": "runtime", "name": "Power above 10 W", "entity": "sensor.pool_pump_power", "above": 10, "hours": 100}
]
```

Counter rule:

```json
[
  {"id": "gallons", "type": "counter", "name": "Every 10000 gallons", "entity": "sensor.pool_gallons_total", "baseline": 0, "amount": 10000}
]
```

Hybrid rule:

```json
[
  {"id": "time_1", "type": "time", "name": "Every 6 months", "months": 6},
  {"id": "runtime_1", "type": "runtime", "name": "Every 500 hours", "entity": "switch.pool_pump_run", "hours": 500}
]
```

Set `rule_logic` to:

- `any` — due when any rule is due
- `all` — due when all rules are due
- `primary` — due state follows `primary_rule_id`; other rules still show progress

### Checklist JSON example

```json
[
  "Turn off equipment",
  "Remove filter",
  "Clean or replace filter",
  "Restart equipment",
  "Check for leaks"
]
```

### Parts JSON example

```json
[
  {"name": "Filter cartridge", "qty": 1},
  {"name": "O-ring", "qty": 1}
]
```
