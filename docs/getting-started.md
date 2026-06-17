# Getting Started

This guide walks through the first setup after installing Home Maintenance Manager.

## 1. Install the integration

Install through HACS as a custom integration or copy `custom_components/home_maintenance_manager` into your Home Assistant `custom_components` directory. Restart Home Assistant after installation.

After restart, add the integration from **Settings → Devices & services → Add Integration → Home Maintenance Manager**.

## 2. Open the Maintenance panel

HMM adds a Maintenance panel to the Home Assistant sidebar. This is the main dashboard for viewing due, upcoming, completed, and paused maintenance work.

## 3. Create your first task

Good first tasks include:

- Replace HVAC filter every 3 months.
- Clean dryer vent every 6 months.
- Test sump pump every month.
- Clean refrigerator coils every year.
- Check water softener salt every 30 days.

Open the Maintenance panel, create a task, enter a name, choose a maintenance category, and select a schedule.

## 4. Choose a schedule

Start simple with a time-based schedule. Once that works, add runtime or metered usage tasks tied to Home Assistant sensors.

Examples:

- HVAC filter: every 3 months.
- Pool filter clean: every 40 pump runtime hours.
- Water filter: every 1,000 gallons.
- Snowblower inspection: seasonal winter task.

## 5. Set the baseline

The “When was it last done?” field controls the first due date. You can choose now, an exact date/time, or an amount of time ago.

## 6. Complete a task

Tasks can be completed from the dashboard, task detail view, NFC scan workflow, or Home Assistant automation.

When a task is completed, HMM records a history entry and recalculates the next due date or usage threshold.

## Next steps

- Read [Assets & Tasks](assets-and-tasks.md) to organize tasks around equipment.
- Read [Scheduling](scheduling.md) for time, runtime, metered, and calendar schedules.
- Read [NFC Tags](nfc-tags.md) to attach physical tags to equipment.
