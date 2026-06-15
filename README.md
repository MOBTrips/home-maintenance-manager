# Home Maintenance Manager v0.5.4

Revamps notification configuration so household defaults live in the Maintenance sidebar Settings page instead of every task editor.

## Added

- Global notification settings under **Maintenance → Settings**.
- Global enable/disable for built-in notifications.
- Default notification method: none, persistent, mobile, persistent + mobile, or automation-only.
- Global mobile notify target picker from Home Assistant notify services.
- Event toggles for upcoming, due, overdue, completed, and snoozed.
- Overdue reminder cadence settings.
- Quiet hours fields for future notification scheduling.
- Notification title/body templates.
- Task-level notification behavior: use global default, disable, or override.

## Changed

- The Add/Edit Task screen no longer asks every task for full notification settings by default.
- Most tasks now default to **Use global notification settings** for a cleaner homeowner-friendly workflow.

## Notes

This release adds the configuration model and UI foundation for centralized notifications. Existing task-level notification values are preserved and treated as task overrides where possible.


## v0.5.8 - Metered usage totalizer

Adds first-class support for rate sensors in metered usage tasks.

- Metered usage source can be either a cumulative meter or a rate sensor.
- Rate sensors such as `gal/min`, `L/min`, `m³/h`, `units/s`, and `W` can be totalized internally by Home Maintenance Manager.
- The task editor detects likely rate sensors and suggests `Rate sensor - let HMM totalize it`.
- Rate totalizers are stored per task and exposed through a new `Totalized Usage` sensor.
- Mark Complete resets the maintenance baseline without changing the original source sensor.
- Cumulative meter behavior is unchanged.

Examples:

- `sensor.ro_flow_rate` in `gal/min` -> HMM tracks total gallons.
- `sensor.device_power` in `W` -> HMM can totalize to `kWh`, though Runtime Hours is often still better for maintenance based on operating time.


## v0.5.8
- Fixed rate totalizer sensors returning non-numeric `N/A` with numeric units.
- Rate sources like `gal/min` now expose totalized usage in `gal`, not `gal/min`.


## v0.5.8

- Fixed delete_task failures caused by stale task entities being notified before the config entry reload finished.
- Deleted task entities now become unavailable during the short reload window instead of raising KeyError.


## v0.5.8

- Added a second Close button at the bottom of the task editor.
- Clicking outside the task editor now attempts to close it.
- Unsaved edits now prompt with Keep editing, Discard changes, or Save changes before closing.
