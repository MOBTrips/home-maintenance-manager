# Home Maintenance Manager

A HACS-ready Home Assistant custom integration for tracking home maintenance by calendar time, runtime/usage, NFC scan workflows, and Home Assistant history.

## v0.3.0 highlights

- Homeowner-friendly task creation wizard
- Auto-generated task IDs; Task ID is no longer shown to normal users
- Area selector populated from Home Assistant areas
- Device selector populated from the Home Assistant device registry
- Entity selectors for linked entities and runtime sources
- Category dropdown
- Time-based, usage-based, Time OR Usage, and Time AND Usage schedules
- Baseline/last-performed step so new tasks start counting immediately
- Runtime Remaining shows `N/A` for time-only tasks instead of `Unknown`
- New `Summary` and `Next Due` task sensors
- Global maintenance dashboard sensors:
  - Maintenance Health Score
  - Maintenance Tasks Upcoming
  - Maintenance Tasks Due
  - Maintenance Tasks Overdue
- Better UI descriptions/help text
- Advanced setup kept optional for NFC, checklists, parts, tools, and custom JSON rules

## Install / update

Copy `custom_components/home_maintenance_manager` into your Home Assistant `custom_components` directory and restart Home Assistant.

If updating from an earlier test build:

1. Replace the existing folder.
2. Restart Home Assistant.
3. Go to **Settings → Devices & Services → Integrations → Home Maintenance Manager → Configure**.
4. Add or edit a task.
5. Select **Save and reload** in the task editor when done.

## Testing suggestion

Create a time-based task:

- Name: Test Maintenance
- Category: General
- Schedule: Time based
- Every: 1 day
- Last performed: Today
- Notifications: Automation only

Expected entities include:

- `sensor.test_maintenance_summary`
- `sensor.test_maintenance_status`
- `sensor.test_maintenance_next_due`
- `sensor.test_maintenance_days_remaining`
- `sensor.test_maintenance_runtime_remaining` = `N/A`
- `button.test_maintenance_mark_complete`



## v0.3.1
- Added navigation controls to wizard pages so users can go back to previous steps.
- Mobile notification target is now populated from available Home Assistant notify services.
- Added translation file so UI labels use friendly names instead of raw field keys.
- Renamed Advanced setup checkbox to make it clear it continues to more pages after submit.
