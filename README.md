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
