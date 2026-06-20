# Home Maintenance Manager (HMM) UI Design Specification v3.1

Target release: v0.7.4 UI Refresh

## 1. Product vision

HMM should answer three questions within five seconds:

1. What needs attention?
2. How healthy is my home?
3. What should I do next?

The experience should feel native to Home Assistant, visual before textual, easy for homeowners, powerful for Home Assistant enthusiasts, and scalable from 20 to 500+ maintenance tasks.

## 2. Core design principles

### Visual first

Users should understand maintenance status from color, icons, progress indicators, and then text. Text should confirm information rather than introduce it.

### Progressive disclosure

Default views show status, task name, category, and progress. Expanded views show maintenance rules, seasonal restrictions, runtime details, NFC configuration, entity tracking, and history.

### High information density

HMM must support casual homeowners, large homes, property managers, and Home Assistant power users without becoming difficult to navigate.

### Mobile first

All workflows must function well on phone, tablet, and desktop. No desktop-only experiences.

### Home Assistant native

Visual styling should align with Home Assistant device pages, areas, energy dashboard, settings pages, dialogs, chips, and entity pickers. Avoid enterprise CMMS aesthetics.

## 3. Visual language

### Status colors

| Status | Meaning | Visual treatment |
| --- | --- | --- |
| Healthy | Not close to due | Green |
| Due Soon | Approaching due threshold | Amber |
| Due Now | Due today or at threshold | Orange |
| Overdue | Past due | Red |
| Critical | Severely overdue or high-priority overdue | Dark red |
| Season Paused | Inactive due to seasonal restriction | Muted/neutral with seasonal icon |

Color is never the sole indicator. Pair color with icon, label, or progress state.

### Category icons

Use MDI icons where possible:

| Category | Icon |
| --- | --- |
| HVAC | `mdi:hvac` |
| Electrical | `mdi:lightning-bolt` |
| Plumbing | `mdi:pipe` |
| Pool | `mdi:pool` |
| Safety | `mdi:shield-check` |
| Exterior | `mdi:home-roof` |
| Appliances | `mdi:wrench` |
| Landscaping | `mdi:tree` |
| General | `mdi:clipboard-check` |

### Progress bar rules

Progress bars communicate maintenance lifecycle:

| Progress | State |
| --- | --- |
| 0-70% | Healthy / green |
| 70-90% | Due soon / amber |
| 90-100% | Due now / orange |
| 100%+ | Overdue / red |

Percentages should be visually available but not required as primary text. Use progress indicators wherever possible instead of long due-date text.

## 4. View density modes

### Comfortable mode

Default mode for new users, casual homeowners, and mobile users.

Characteristics:

- Card-based layout
- More spacing
- More descriptive information
- Approximately 5-8 visible tasks per screen

### Compact mode

Mode for advanced users and large task collections.

Characteristics:

- Reduced whitespace
- Single-row task summaries when possible
- Fast scanning
- Approximately 15-25 visible tasks per screen
- User preference remembered

Compact examples:

```text
🟡 🌡 Furnace Filter     T ████████░░  R █████░░░░░
🔴 ⚡ GFCI Test          T ██████████
🟢 🏊 Pool Basket        R ██░░░░░░░░
```

Where `T` means Time Rule and `R` means Runtime Rule. Only active rule progress indicators are shown.

## 5. Dashboard

The dashboard must simultaneously provide Home Health and Things Requiring Attention.

### Section 1: Home Health

Primary dashboard card.

Displays:

- Overall Home Health Score
- Category Health Scores
- Circular gauge or equivalent visual score
- Category mini progress bars
- Category status colors

Purpose: answer “How healthy is my home?”

Example:

```text
Home Health

92%

HVAC ........ 95%
Pool ........ 88%
Safety ..... 100%
Exterior .... 84%
```

### Section 2: Attention Summary

Displays counts for:

- Overdue
- Due Today
- Due Soon
- Upcoming

Purpose: answer “What needs attention now?”

Example:

```text
🔴 Overdue: 4
🟠 Due Today: 2
🟡 Due Soon: 12
🟢 Upcoming: 28
```

### Section 3: Quick filters

Filters should be easy to scan and sticky while scrolling when practical:

- All
- Overdue
- Due Today
- Due Soon
- HVAC
- Pool
- Safety
- Exterior

### Section 4: Task feed

The dashboard task feed supports Comfortable and Compact views. Preference must be remembered.

## 6. Maintenance rule model

Use the term “Maintenance Rule” instead of “Maintenance Trigger.” Rule is more future-proof as HMM adds runtime, date, seasonality, weather, entity thresholds, and AI-assisted logic.

Each task supports:

- Maintenance Rule #1, required
- Maintenance Rule #2, optional

Structure:

```text
Task
├─ Maintenance Rule #1
└─ Maintenance Rule #2 optional
```

### Supported rule types for v0.7.4

- Time Based
- Runtime Based
- Metered Usage
- Date / Calendar Based

### Future rule types

- Entity Threshold
- Weather Based
- AI Recommended

### Due logic

Earliest Rule Wins.

A task becomes due when any active maintenance rule becomes due.

Example:

```text
Rule #1: Every 90 days
Rule #2: Every 300 runtime hours
```

If runtime reaches threshold first, the task becomes due.

### Completion logic

Completing a task resets Rule #1 and Rule #2 simultaneously. One maintenance activity equals one completion event.

### Backend compatibility note

The current backend already stores multiple rules in `task.rules` and supports rule logic. For v0.7.4, avoid unnecessary storage migration. Prefer adapting the editor UI to write the existing compatible `rules` structure, with the default equivalent of “any / earliest wins.”

## 7. Seasonal restrictions

Seasonality is independent of scheduling. A seasonal restriction controls when a task is active. It does not create due events.

In the Task Editor, Seasonal Restrictions must appear directly below the Maintenance Rules section.

### Seasonal modes

- Active Year Round, default
- Active During Selected Months
- Active During Selected Seasons
- Custom Date Window where already supported

### Inactive season behavior

When a task is outside its active season:

- Hidden or muted from due calculations depending on existing task visibility settings
- Hidden or excluded from overdue calculations
- Excluded from Home Health calculations unless explicitly shown as inactive
- Normal due/upcoming notifications are held

Runtime and metered usage accumulation should continue to respect existing settings such as whether to pause usage while inactive.

Example:

```text
Pool Opening
Rule: Every 1 year
Seasonal Restriction: Spring
```

The task remains inactive outside spring.

## 8. Task list

### Grouping modes

Default: By Urgency

Groups:

- Overdue
- Due Today
- Due Soon
- Upcoming
- On Track
- Season Paused, when visible

Optional: By Category

Groups:

- HVAC
- Pool
- Electrical
- Exterior
- Safety
- etc.

### Comfortable view

Displays:

- Status
- Category icon
- Task name
- Progress indicators
- Due information
- Complete button
- Secondary actions grouped or minimized

### Compact view

Single-row focus where possible:

```text
🟡 🌡 Furnace Filter     T ████████░░  R █████░░░░░
```

Only active rules are shown. Do not show long explanatory text in compact rows. Use title/tooltips/details dialog for deeper information.

## 9. Task detail dialog

Purpose: view information, not edit.

Sections:

- Summary
- Maintenance Rules
- Seasonal Restrictions
- Runtime / Meter Tracking
- Reminders
- NFC
- Notes
- History

Primary action: Complete Task. It must remain highly visible.

## 10. Task editor

Purpose: create and modify tasks.

Recommended section order:

1. Basics
2. Asset being maintained
3. Maintenance Rule #1
4. Maintenance Rule #2 optional
5. Seasonal Restrictions
6. Reminders
7. NFC
8. Entity Tracking
9. Advanced

### Basics

Fields:

- Task Name
- Category
- Priority, if supported
- Description

### Maintenance Rule #1

Required. User selects one rule type and configures it.

Supported rule choices:

- Time interval
- Runtime hours
- Metered usage
- Calendar schedule

### Maintenance Rule #2

Optional. Collapsed or hidden until user clicks “Add second maintenance rule.”

Only available compatible rule types should be shown. Avoid presenting legacy combo labels such as “Time or runtime, whichever comes first” as the main UX. The two-rule UI naturally expresses this.

Example:

```text
Rule #1: Time interval, every 90 days
Rule #2: Runtime hours, every 300 hours from sensor.furnace_runtime
```

### Seasonal Restrictions

Placed directly below maintenance rules.

Supports:

- Year round
- Selected months
- Selected seasons
- Existing custom date range support

### Collapsible sections

Reminders, NFC, Entity Tracking, and Advanced should be collapsible to reduce form density.

## 11. History screen

Purpose: review maintenance completion history.

Display style: timeline.

Example:

```text
Today
✓ Replaced Furnace Filter
✓ Added Water Softener Salt

Yesterday
✓ Cleaned Pool Skimmer

June 12
✓ Tested GFCI Outlets
```

Filters:

- Date Range
- Category
- Task Name

## 12. Import wizard

Purpose: install task packs safely and intuitively.

### Wizard steps

1. Select Tasks
2. Configure Tasks
3. Review Import
4. Import

Persistent stepper remains visible throughout.

### Major design change

Entity mapping is task-by-task. There is no grouped/shared entity resolution screen, no bulk mapping screen, and no suggested entity list.

This means the user walks through each selected task that requires configuration and chooses that task’s entities in context.

### Configure Tasks workflow

Each task is reviewed independently.

Configuration screen displays:

- Task number and progress, such as “Task 4 of 12”
- Task name
- Category
- Description
- Required entities
- Optional entities
- Native Home Assistant entity picker for each entity
- Previous / Next / Save & Continue controls
- Skip control for optional entities only

Example:

```text
Task 4 of 12
Office UPS Battery Check
Category: Electrical

Description:
Verify UPS operation and battery condition.

Required Entity
UPS Power Sensor
[Home Assistant Entity Picker]

Optional Entity
UPS Runtime Sensor
[Home Assistant Entity Picker]
[Skip]
```

### Entity selection

Use native Home Assistant Entity Picker. Do not build custom suggestion controls. Do not show recommended/suggested entity lists.

Entity picker should be filtered by supported domains from the requirement definition where possible.

Examples:

- `sensor.*`
- `number.*`
- `binary_sensor.*`
- `switch.*`

### Important import behavior

- Task context must be visible while selecting entities.
- Required entity fields block progress unless the design intentionally allows import-paused behavior.
- Optional entity fields may be skipped.
- Mapping decisions are stored per selected task, not as a shared grouped requirement queue.
- If the same entity is needed by multiple tasks, the user may choose the same HA entity multiple times in each task context. The UI should not force grouping.

## 13. Import review screen

Displays:

- Tasks Added
- Tasks Updated
- Tasks Skipped
- Entity Assignments
- Potential Conflicts
- Merge/replace choice where applicable

User confirms before import.

## 14. Import complete screen

Displays:

- Tasks Installed
- Entities Assigned
- Warnings
- Errors

Example:

```text
38 Tasks Installed
27 Entities Assigned
0 Errors
```

## 15. Empty states

All screens require intentional empty states.

Example:

```text
🎉 Everything is up to date.
```

Avoid blank screens.

## 16. Loading states

Use skeleton loading components where possible. Avoid generic spinners when a skeleton row/card would be clearer.

## 17. Accessibility

- Color is never the sole indicator
- Icons accompany status colors
- Minimum touch target: 44px
- Keyboard navigation supported
- Screen reader labels required for icon-only controls
- Native Home Assistant controls preferred when available

## 18. v0.7.4 scope

Included:

- Dashboard refresh
- Home Health dashboard card
- Attention Summary
- Comfortable/Compact mode
- Task card refresh
- Task editor refresh using Maintenance Rule terminology
- Seasonal Restrictions placed under Maintenance Rules
- History timeline
- Import wizard refresh
- Task-by-task Configure Tasks workflow
- Native HA entity picker for import entities

Deferred:

- Full analytics engine
- Table view
- Saved filters
- Category dashboards
- Predictive maintenance
- AI task recommendations
- Weather-based scheduling
- Major backend storage migration unless required

## 19. Success criteria

A homeowner should be able to open HMM and immediately understand:

1. What needs attention
2. How healthy the property is
3. What maintenance should happen next

without opening a task or reading detailed schedules.
