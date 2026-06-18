# Home Maintenance Manager (HMM)

Home Maintenance Manager is a Home Assistant custom integration for organizing, scheduling, tracking, and documenting maintenance around your home. Use it for HVAC filters, water softeners, appliances, pool and hot tub equipment, vehicles, seasonal equipment, and any recurring household task that is easy to forget.

HMM is designed to feel like a native Home Assistant tool: tasks can be tied to real Home Assistant entities, runtime sensors, meters, NFC tags, devices, and automations.

## Highlights

- **Asset and task tracking** for equipment, rooms, systems, and household maintenance items.
- **Time-based schedules** using minutes, hours, days, weeks, months, or years.
- **Runtime-based schedules** using Home Assistant sensors such as pump runtime, fan runtime, or equipment usage.
- **Metered usage schedules** using cumulative or rate-based sensors such as gallons, miles, kWh, cycles, or other usage meters.
- **Calendar-style schedules** for monthly and weekday-based recurring maintenance.
- **Seasonal active windows** so pool, lawn, snow, and outdoor tasks only appear when relevant.
- **NFC tag workflows** to open, complete, confirm, or log tasks by scanning equipment tags.
- **Maintenance history** for each task.
- **Home Assistant dashboard panel** for day-to-day task management.

## Installation

### HACS custom repository

1. Open **HACS** in Home Assistant.
2. Go to **Integrations**.
3. Open the menu and choose **Custom repositories**.
4. Add this repository URL:

   ```text
   https://github.com/MOBTrips/home-maintenance-manager
   ```

5. Select category **Integration**.
6. Install **Home Maintenance Manager**.
7. Restart Home Assistant.
8. Go to **Settings → Devices & services → Add Integration**.
9. Search for **Home Maintenance Manager** and complete setup.

### Manual install

1. Copy `custom_components/home_maintenance_manager` into your Home Assistant `custom_components` directory.
2. Restart Home Assistant.
3. Add the integration from **Settings → Devices & services**.

## Quick start

1. Open the **Maintenance** panel from the Home Assistant sidebar.
2. Create a task such as `Replace HVAC filter`.
3. Choose a maintenance category and optional asset.
4. Select a schedule type.
5. Set when the task was last done.
6. Save the task.
7. Complete the task from the dashboard, task detail view, NFC scan, or automation.

## Documentation

- [Storage and Backup](docs/storage-and-backup.md)

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Assets & Tasks](docs/assets-and-tasks.md)
- [Scheduling](docs/scheduling.md)
- [Seasonal Tasks](docs/seasonal-tasks.md)
- [NFC Tags](docs/nfc-tags.md)
- [HACS Readiness](docs/hacs-readiness.md)
- [FAQ](docs/faq.md)
- [Changelog](CHANGELOG.md)

## Schedule types

| Type | Use when |
|---|---|
| Time based | Maintenance is due after a fixed amount of time. |
| Runtime based | Maintenance depends on how long equipment has run. |
| Metered usage | Maintenance depends on total usage such as gallons, kWh, miles, cycles, or other counters. |
| Calendar based | Maintenance should happen on a specific recurring calendar pattern. |
| Seasonal | A time, runtime, metered, or calendar task should only be active during part of the year. |

## NFC workflows

HMM can use Home Assistant NFC tags for equipment-level workflows. A tag can be configured to:

- Open the task in the Maintenance panel.
- Ask for confirmation before completion.
- Complete a trusted task immediately.
- Log activity without completing the task.
- Do nothing when NFC is disabled.

See [NFC Tags](docs/nfc-tags.md) for setup guidance and troubleshooting.

## Created Home Assistant resources

Depending on configuration and task state, HMM may create or manage:

- A Home Assistant integration entry.
- A sidebar Maintenance panel.
- Task-related devices/entities.
- Task status sensors.
- Completion/action buttons.
- NFC tag handling through Home Assistant tag scan events.

## Known limitations

- HMM is pre-1.0 software and should be tested carefully before relying on it for critical maintenance.
- Runtime and metered schedules depend on the quality and availability of the selected Home Assistant sensors.
- NFC behavior can vary by phone, Home Assistant mobile app state, and tag registration status.
- HACS validation should be run on every release before publishing.

## Support

Please report bugs and feature requests through the project repository issues page:

https://github.com/MOBTrips/home-maintenance-manager/issues

## Release notes

See [CHANGELOG.md](CHANGELOG.md).


### Import Review Wizard

HMM includes a dedicated JSON import review wizard. Upload a HMM export or task-pack-style JSON file, review new/update/duplicate/deleted/invalid tasks, check missing entity warnings, select only the tasks you want, then confirm the import.
