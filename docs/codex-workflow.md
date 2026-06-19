# ChatGPT + Codex Workflow for HMM

This document explains how to use ChatGPT, Codex, and GitHub together for HMM development.

## Recommended roles

- ChatGPT: product manager, solution architect, UX reviewer, issue writer, test planner.
- Codex: implementation engineer, refactor assistant, documentation patcher, PR creator.
- GitHub: source of truth and shared memory.

## Standard workflow

1. Discuss the goal in ChatGPT.
2. Convert the goal into a scoped GitHub issue.
3. Let Codex implement against the issue and `AGENTS.md`.
4. Review the PR.
5. Test in Home Assistant.
6. Bring screenshots, errors, and follow-up notes back to ChatGPT.
7. Open follow-up issues as needed.

## Good Codex task shape

A good task includes:

- Current version
- Problem statement
- Desired user behavior
- Files or areas likely involved
- Acceptance criteria
- Test plan
- Out-of-scope items

## Example Codex prompt

```md
Implement HMM v0.6.x fix: Import wizard selection persistence.

Problem:
When moving from Entity Mapping to Import Options, selected tasks become unselected.

Expected behavior:
Selected tasks remain selected across all import wizard steps unless the user changes them.

Acceptance criteria:
- Selection state persists across Preview, Entity Mapping, Import Options, and Summary.
- Bulk select/unselect still works.
- Invalid tasks remain unselectable.
- Docs/changelog updated.
- No storage changes occur until final confirmation.

Test plan:
- Import a file with new, update, duplicate, invalid, and missing-entity tasks.
- Select a subset.
- Move forward/back through every wizard step.
- Confirm selected count remains stable.
```

## Issue labels

Recommended labels:

- `bug`
- `enhancement`
- `documentation`
- `frontend`
- `backend`
- `import-export`
- `nfc`
- `hacs`
- `codex-ready`
- `needs-testing`

## Pull request review focus

For every PR, review:

- Does it solve the actual user problem?
- Does it preserve storage compatibility?
- Does it avoid regressions in import/export, deletion, and NFC?
- Does it keep UI state stable?
- Are docs and changelog updated?
- Can the change be tested in Home Assistant?
