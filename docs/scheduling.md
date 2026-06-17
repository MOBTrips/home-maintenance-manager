# Scheduling

HMM supports several schedule types so maintenance can be based on time, runtime, usage, calendar patterns, or seasonal windows.

## Time-based schedules

Use this when a task is due after a fixed amount of elapsed time.

Supported units include minutes, hours, days, weeks, months, and years.

Examples:

- Replace HVAC filter every 3 months.
- Test smoke alarms every 6 months.
- Clean dryer vent every 1 year.

## Runtime-based schedules

Use this when maintenance depends on how long equipment has actually run.

Examples:

- Clean pool filter every 40 pump runtime hours.
- Replace fan filter every 500 fan runtime hours.
- Service generator every 100 runtime hours.

Runtime schedules require a Home Assistant source entity that can indicate running/not running or provide a numeric runtime/usage signal.

## Metered usage schedules

Use this when maintenance is due after a measured amount of usage.

Examples:

- Replace water filter every 1,000 gallons.
- Service equipment every 500 cycles.
- Replace vehicle cabin filter every 12,000 miles.
- Inspect equipment every 250 kWh.

HMM can work with cumulative meters. For rate sensors, HMM can totalize usage over time when configured.

## Calendar-based schedules

Use this when a task belongs on a recurring calendar pattern rather than a simple interval.

Examples:

- Inspect equipment on the first Saturday of each month.
- Check supplies on the 15th of every month.
- Perform a quarterly checklist on a specific weekday pattern.

## Baseline: when was it last done?

The baseline sets the starting point for the next due calculation. You can set:

- Today / now
- A specific date and time
- A relative amount of time ago
- Unknown / start today

## Seasonal windows

Seasonal windows can be combined with other schedule types. For example, a pool task can be due every 30 runtime hours but only during summer.

See [Seasonal Tasks](seasonal-tasks.md) for details.
