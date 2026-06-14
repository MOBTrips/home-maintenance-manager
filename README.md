# Home Maintenance Manager

A HACS-ready Home Assistant custom integration for tracking home maintenance tasks by time, runtime, NFC tags, history, and notifications.

## v0.4.3 highlights

- Adds a custom Home Assistant sidebar panel: **Maintenance**
- Beginner-friendly dashboard with health score, next-up tasks, task cards, and history
- In-panel add/edit/delete task workflow
- Area, device, entity, mobile notify service, and NFC tag lookups
- Uses Home Assistant websocket/service APIs from the panel
- Keeps the existing Options Flow editor for advanced configuration

## Install

Copy `custom_components/home_maintenance_manager` into your Home Assistant `custom_components` folder, restart Home Assistant, then add the integration from **Settings → Devices & Services**.

After restart, you should see a new sidebar item named **Maintenance**.

## Notes

The custom panel is an early UI-centric preview. If the NFC tag list does not populate, the panel will still allow tasks without NFC tags and the advanced Options Flow can still accept manual tag IDs.


## v0.4.3

- Reworked the panel task editor into clear one-page sections.
- Added field help/tooltips for the add/edit maintenance task screen.
- Improved friendly labels and placeholder guidance for beginner users.


## v0.4.4
- Renamed Device/Linked Entities in the panel to homeowner-friendly equipment/data-source language.
- Added Equipment Name for tasks with no Home Assistant device or entity, like RO water filters.
- Added conditional show/hide for time, usage, and mobile notification fields based on parent selections.
