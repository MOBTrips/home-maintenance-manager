# AGENTS.md — Home Maintenance Manager

This repository contains Home Maintenance Manager (HMM), a Home Assistant custom integration and sidebar panel for tracking household maintenance tasks, assets, schedules, history, NFC workflows, import/export, and future task packs.

Use this file as the shared working agreement for Codex, ChatGPT-authored implementation prompts, and human contributors.

## Primary goal

Build HMM as a reliable, HACS-friendly Home Assistant integration that feels native in Home Assistant and protects user data during upgrades, imports, deletions, and migrations.

## Repository map

- `custom_components/home_maintenance_manager/` — Home Assistant integration backend.
- `custom_components/home_maintenance_manager/frontend/home-maintenance-manager-panel.js` — HMM sidebar panel UI.
- `custom_components/home_maintenance_manager/manifest.json` — Home Assistant integration metadata and version.
- `hacs.json` — HACS metadata.
- `brands/` and `custom_components/home_maintenance_manager/brand/` — HACS/Home Assistant brand assets.
- `docs/` — user and developer documentation.
- `.github/workflows/` — validation workflows.
- `.github/ISSUE_TEMPLATE/` — structured work intake for Codex and humans.

## Non-negotiable rules

1. Do not break existing user storage or migrations.
2. Do not resurrect deleted tasks from legacy/config-entry storage.
3. Do not apply import changes until the user confirms the import wizard.
4. Required runtime or meter entities that remain unresolved during import must be imported paused or otherwise prevented from calculating due status from the wrong source.
5. Keep HACS compatibility intact.
6. Keep Home Assistant startup safe: no blocking I/O in the event loop.
7. Keep user-facing errors clear and recoverable.
8. Update docs and changelog for every user-facing change.
9. Update version references consistently for release work.
10. Prefer small, scoped pull requests over broad rewrites.

## Versioning checklist

For release tasks, update all applicable version references:

- `custom_components/home_maintenance_manager/manifest.json`
- Any backend device/software version strings
- `CHANGELOG.md`
- README or docs when behavior changes

Search before finishing:

```bash
grep -R "0\." -n custom_components docs README.md CHANGELOG.md hacs.json
```

## Backend expectations

- Use Home Assistant async patterns.
- Store durable data through Home Assistant storage helpers.
- Keep websocket APIs explicit, validated, and backwards-aware.
- Preserve stable task IDs whenever possible.
- Treat imports as data migrations with preview, validation, user review, and safe apply.
- Avoid broad exception swallowing; log useful context without exposing secrets.
- Diagnostics must redact sensitive or user-private values where appropriate.

## Frontend expectations

- Match Home Assistant visual language and interaction patterns.
- Use modal/dialog patterns for complex review/edit flows.
- Keep mobile layout usable.
- Preserve selected wizard state when moving between steps.
- Provide contextual help where destructive or confusing options exist.
- Do not overload Settings with import decisions that belong in the import wizard.

## Import/export and task-pack rules

- Backup-style import may support Merge and Replace.
- Task Packs must default to Merge and must not delete existing user tasks.
- Replace mode is backup recovery mode and must be clearly labeled as destructive.
- Missing entities should be mapped, cleared, or kept unresolved with task-level context.
- Show the task name, category, schedule type, entity role, required/optional status, and why the entity is needed when mapping missing entities.

## NFC rules

- Disabling or reassigning an NFC tag must remove stale task bindings.
- A tag should never trigger both an old and new task after reassignment.
- NFC actions must honor the selected behavior: disabled, open task, confirm completion, complete trusted task, or log activity.

## HACS and Home Assistant validation

Before proposing a release, run or verify:

```bash
python -m compileall custom_components/home_maintenance_manager
```

GitHub Actions should run:

- HACS validation
- Hassfest validation

## Documentation expectations

Update docs when changing behavior. Prefer short, practical pages with examples. Important docs include:

- `docs/requirements.md`
- `docs/roadmap.md`
- `docs/architecture.md`
- `docs/ui-guidelines.md`
- `docs/release-checklist.md`
- `docs/codex-workflow.md`

## Pull request expectations

Every PR should include:

- Summary of what changed
- Why it changed
- User-facing impact
- Storage/migration impact
- Test notes
- Screenshots or screen recordings for UI changes when possible

## Recommended work split

- ChatGPT: requirements, UX design, edge cases, issue prompts, review notes.
- Codex: code changes, tests, docs updates, pull requests.
- GitHub: source of truth, shared memory, issues, PRs, release history.
