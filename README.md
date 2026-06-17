# Home Maintenance Manager (HMM)

Home Maintenance Manager is a Home Assistant integration that helps you organize, schedule, track, and document maintenance for your home, equipment, vehicles, pool, hot tub, HVAC systems, appliances, and more.

## Why HMM?

Unlike simple reminder systems, HMM can trigger maintenance from real Home Assistant data.

### Supported Scheduling
- Time Based
- Runtime Based
- Metered Usage
- Calendar Based
- Seasonal Windows

### Completion Methods
- Dashboard
- Mobile Devices
- NFC Tags
- Home Assistant Automations

## Features

### Asset & Task Management
Track maintenance tasks against real-world assets and equipment.

### Flexible Scheduling
Create maintenance plans based on elapsed time, runtime hours, usage meters, calendar schedules, or seasonal activity windows.

### Seasonal Maintenance
Pause maintenance automatically when equipment is out of season.

Examples:
- Pool Equipment (Summer)
- Snowblower (Winter)
- Lawn Equipment (Spring/Summer/Fall)

### NFC Support
Attach NFC tags to equipment and instantly open the correct maintenance task from a phone.

### Maintenance History
Maintain a complete audit trail of completed maintenance activities.

## Documentation

- HACS Readiness: docs/hacs-readiness.md
- Getting Started: docs/getting-started.md
- Assets & Tasks: docs/assets-and-tasks.md
- Scheduling: docs/scheduling.md
- Seasonal Tasks: docs/seasonal-tasks.md
- NFC Tags: docs/nfc-tags.md
- FAQ: docs/faq.md

## Release Notes

See CHANGELOG.md

## Quick Start

1. Install HMM via HACS.
2. Add the integration.
3. Create an asset or select Home Assistant equipment.
4. Create maintenance tasks.
5. Select a schedule type.
6. Complete tasks from the dashboard or NFC tags.

## Architecture

Asset
→ Task
→ Schedule
→ Notification
→ Completion
→ History

## Support

Please report issues and feature requests through the project repository.
