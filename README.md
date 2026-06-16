# Home Maintenance Manager v0.5.18

Patch release focused on maintenance schedule cleanup.

## Changes

- Time interval tasks now support minutes, hours, days, weeks, months, and years.
- Runtime interval tasks now support minutes, hours, days, weeks, months, and years.
- The task editor now has a richer “When was it last done?” baseline section:
  - Today / now
  - Specific date and time
  - X minutes/hours/days/weeks/months/years ago
  - Unknown / start today
- Added a basic Calendar schedule type:
  - Monthly weekday pattern, such as every 2nd Tuesday
  - Specific month/day pattern, such as every month on day 1 or every January 1
- Backend supports new interval rule fields while remaining compatible with older `days` and `hours` rules.

