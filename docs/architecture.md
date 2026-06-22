# Architecture

Home Maintenance Manager is a Home Assistant custom integration with a backend integration and a frontend dashboard panel.

## Main components

```text
Home Assistant
  └─ Home Maintenance Manager integration
       ├─ Config flow
       ├─ Coordinator and storage
       ├─ Task/device/entity management
       ├─ Services and event handling
       ├─ NFC tag scan handling
       └─ Frontend Maintenance panel
```

## Backend responsibilities

The backend integration is responsible for:

- Loading and saving HMM data.
- Coordinating task state.
- Calculating due, upcoming, paused, and overdue status.
- Handling task completion and activity history.
- Listening for Home Assistant tag scan events.
- Creating task-related devices and entities.
- Cleaning stale task/device registry entries when tasks are removed.

## Frontend responsibilities

The frontend panel is responsible for:

- Displaying maintenance dashboards.
- Creating and editing tasks.
- Showing task detail views.
- Presenting schedule configuration.
- Surfacing NFC, reminder, seasonal, and history information in a homeowner-friendly way.

## Data model

At a high level:

```text
Asset → Task → Schedule → Status → Notification / Action → Completion History
```

A task may optionally be associated with an asset, Home Assistant entity, NFC tag, schedule rule, seasonal rule, reminder behavior, and history records.

## Storage

HMM uses Home Assistant storage for integration-owned data. The storage version is managed by the integration and may require migrations as the project moves toward 1.0.

`data.tasks` is the task source of truth. Startup loads active tasks from that list only; installed Task Pack metadata, deleted-task metadata, and Home Assistant registry artifacts are not task authorities and must not recreate tasks. Task Pack origin lives on each task in `task.source`, while `installed_task_packs` is informational metadata for display, future update review, filtering, and reporting.

Task-specific Home Assistant entities and devices are generated artifacts. Deleting a task permanently removes it from HMM storage and cleans up task-specific registry entries through Home Assistant registry APIs. Integration-level entities and devices are preserved.

## Home Assistant integration points

HMM uses several Home Assistant platform capabilities:

- Config entries for setup.
- Frontend panel registration.
- WebSocket/API support for dashboard actions.
- Home Assistant tag integration for NFC scans.
- Device and entity registries for task-related resources.
- Sensors/buttons/binary sensors for task status and actions.
