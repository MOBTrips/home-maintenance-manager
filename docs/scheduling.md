# Scheduling

HMM supports several schedule types so maintenance can be based on time, runtime, usage, calendar patterns, service indicators, or seasonal windows.

## Maintenance rules and Due Logic

Each task has Maintenance Rule #1 and can optionally use Maintenance Rule #2. Each rule uses one schedule type:

- Time interval
- Runtime hours
- Metered usage
- Calendar schedule
- Service due

Due Logic controls how the rules combine:

- **Maintenance Rule #1 only**: only Rule #1 controls due state.
- **Any maintenance rule is due**: the task is due when Rule #1 or Rule #2 is due.
- **All maintenance rules are due**: the task is due only when Rule #1 and Rule #2 are both due.

Older combined schedule choices, such as time-or-runtime and time-and-metered-usage, load as two maintenance rules with the matching Due Logic.

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

HMM supports three metered source modes:

- **Cumulative total**: the source only increases over time, such as lifetime gallons, kWh, miles, or cycles.
- **Rate**: the source reports a current rate, such as W or gallons/minute, and HMM totalizes it over elapsed time.
- **Reset/session counter**: the source increases during one use and then resets to zero. HMM adds positive deltas and ignores reset drops.

The source entity unit must be compatible with the task target. For example, a watts sensor cannot satisfy a gallons-based meter task. For time-based duration sensors, the editor can show friendly target units such as minutes, hours, or days while HMM stores the normalized value in the source unit.

## Calendar-based schedules

Use this when a task belongs on a recurring calendar pattern rather than a simple interval.

Examples:

- Inspect equipment on the first Saturday of each month.
- Check supplies on the 15th of every month.
- Perform a quarterly checklist on a specific weekday pattern.

## Service due schedules

Use this when another Home Assistant entity already reports maintenance state.

Supported service due signals:

- **Binary due entity**: due when the entity state is `on`, `true`, `1`, or `yes`; not due when `off`, `false`, `0`, or `no`.
- **Status enum/state entity**: due when the entity state matches the configured due states; not due when it matches configured OK states.
- **Remaining percent entity**: due when the numeric value is at or below the configured threshold, such as 10%.
- **Next due timestamp entity**: due when the timestamp is now or in the past.

Unavailable or unknown service source states default to safe not-due behavior. A task can instead be configured to mark due when the service source is unavailable.

## Baseline: when was it last done?

The baseline sets the starting point for the next due calculation. You can set:

- Today / now
- A specific date and time
- A relative amount of time ago
- Unknown / start today

## Seasonal windows

Seasonal windows can be combined with other schedule types. For example, a pool task can be due every 30 runtime hours but only during summer.

See [Seasonal Tasks](seasonal-tasks.md) for details.
