# HMM UI Guidelines

HMM should feel like it belongs inside Home Assistant. Use this guide when changing the frontend.

## General principles

- Keep everyday actions obvious: view, edit, complete, pause, snooze, delete.
- Put complex or risky flows in dedicated dialogs or wizards.
- Preserve user selections and wizard state when moving between steps.
- Make destructive choices visually and textually clear.
- Prefer task-level context over generic warnings.
- Design for desktop and mobile from the start.

## Layout

- Use sections with clear headings.
- Group related fields together.
- Keep Task Basics, Schedule, Reminders, NFC, Import, and Advanced options separated.
- Use horizontal value/unit alignment for interval inputs when space allows.
- Avoid burying important warnings inside dense text blocks.

## Dialogs and wizards

Use dedicated modal/dialog flows for:

- Task view
- Task edit
- Import preview
- Entity mapping
- Replace confirmation
- Future task-pack review

A wizard step should include:

- Clear title
- Short explanation
- Primary action
- Back/cancel path
- Summary of impact
- Any warnings before destructive actions

## Import wizard expectations

- Show summary tiles for counts and risk states.
- Show task rows with name, category, status, schedule, and warnings.
- Allow filtering by new, update, duplicate, deleted, invalid, and missing entities.
- Preserve task selection across all steps.
- Entity mapping rows should show the task that needs the entity and why.
- Merge and Replace choices belong in the import wizard, not global settings.

## Missing entity mapping expectations

Each missing entity row should show:

- Missing entity ID
- Affected task name
- Category or asset when available
- Entity role, such as linked entity, runtime source, meter source, or NFC tag
- Required vs optional status
- Schedule context
- Choices: map to another entity, clear, or keep unresolved

## NFC UI expectations

- NFC should have its own section.
- Disabled state should be clear.
- Reassignment should warn if a tag is already linked to another task.
- Removing NFC from a task should explain that old scan behavior will be cleared.

## Language

Use plain language. Prefer:

- “Merge selected tasks” instead of “upsert.”
- “Replace all current HMM data” only when it truly replaces all data.
- “Backup recovery mode” for Replace.
- “Task Pack” only for curated/imported packs that must not delete existing data.
