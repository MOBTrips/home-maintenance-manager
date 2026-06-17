# Seasonal Tasks

Seasonal tasks are maintenance tasks that only matter during part of the year.

## Common examples

- Pool opening and closing
- Pool filter cleaning
- Hot tub winter checks
- Lawn mower service
- Snowblower service
- Irrigation startup and winterization
- Gutter cleaning

## Preset seasons

HMM supports preset seasonal windows:

- Spring: March 1 through May 31
- Summer: June 1 through August 31
- Fall: September 1 through November 30
- Winter: December 1 through February 28

## Custom windows

Use a custom window when equipment follows your local climate rather than a standard season.

Examples:

- Pool season: May 15 through September 30
- Irrigation season: April 15 through October 15
- Snow equipment season: November 1 through March 31

Custom windows may cross the new year.

## Behavior outside the active window

When a task is outside its active seasonal window, HMM can pause the task status and hold normal due/upcoming behavior until the window becomes active again.

For runtime and metered tasks, you can choose whether usage should accumulate outside the active season.

## Recommended setup

For most seasonal equipment:

1. Create a normal task.
2. Choose the schedule type.
3. Enable seasonal active window.
4. Select one or more preset seasons or a custom date range.
5. Decide whether inactive tasks should remain visible.
