# NFC Tags

HMM can connect Home Assistant NFC tags to maintenance tasks. This is useful when the best reminder is physically attached to the equipment.

## Example uses

- Scan the HVAC tag when replacing a filter.
- Scan the pool pump tag after cleaning the filter.
- Scan the hot tub tag after testing water or replacing a filter.
- Scan the water softener tag after adding salt.

## Setup

1. Create or register a tag in Home Assistant.
2. Open the HMM task editor.
3. Choose the tag in the **NFC Tag** section.
4. Choose what should happen when the tag is scanned.
5. Save the task.

## Supported actions

Depending on the current HMM build, tag actions may include:

- Disabled / no action
- Open task in the Maintenance panel
- Ask for confirmation
- Complete immediately
- Log activity

Use confirmation for tasks where accidental completion would be a problem. Use immediate completion only for trusted, low-risk workflows.

## Reassigning tags

A tag should normally belong to one task at a time. HMM includes cleanup logic to remove a reassigned NFC tag from older tasks so one scan does not trigger multiple task workflows.

## Removing a tag from a task

To remove a tag:

1. Edit the task.
2. Choose **No NFC Tag**.
3. Set the scan action to **Disabled**.
4. Save the task.

After saving, scan the tag to confirm it no longer opens or completes the old task.

## Troubleshooting

If an old task still appears after a tag is reassigned:

1. Reload the HMM integration.
2. Confirm the old task is set to **No NFC Tag** and **Disabled**.
3. Confirm the new task owns the tag.
4. Restart Home Assistant if registry state appears stale.
5. Check Home Assistant logs for tag scan handling errors.

## Regression test checklist

Before each release, test these scenarios:

- Assign a tag to a task and scan it.
- Change the task action to disabled and scan again.
- Remove the tag from the task and scan again.
- Assign the same tag to a different task and scan again.
- Confirm the old task does not receive a notification, deep link, or completion event.
