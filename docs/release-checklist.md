# HMM Release Checklist

Use this checklist before every HMM release.

## Scope

- Confirm the release goal.
- Confirm whether the release changes backend behavior, frontend behavior, storage, import/export, NFC, docs, or packaging.
- Keep the release small enough to test.

## Version updates

Update version references where applicable:

- `custom_components/home_maintenance_manager/manifest.json`
- Backend integration/device software version strings
- `CHANGELOG.md`
- Docs mentioning the release version

Then search for stale versions:

```bash
grep -R "0\.6\." -n custom_components docs README.md CHANGELOG.md hacs.json
```

## Validation

Run local validation when possible:

```bash
python -m compileall custom_components/home_maintenance_manager
```

Verify GitHub Actions:

- HACS validation passes.
- Hassfest validation passes.

## Manual Home Assistant testing

At minimum test:

- Fresh install or reload.
- Existing install upgrade.
- Open Maintenance sidebar panel.
- Create task.
- Edit task.
- Complete task.
- Delete task.
- Restart Home Assistant and confirm deleted task does not return.
- Export JSON.
- Import JSON in Merge mode.
- Import JSON preview without applying.
- Import selected tasks only.
- Entity mapping with missing entities.
- Replace mode only with a backup test file.
- NFC disabled, assigned, reassigned, and removed behavior when the release touches NFC.

## Documentation

Update as needed:

- README
- CHANGELOG
- Requirements
- Roadmap
- Architecture
- UI guidelines
- HACS readiness
- Storage and backup
- NFC docs

## Pull request checklist

PR description should include:

- Summary
- Why this change is needed
- User-facing impact
- Storage/migration impact
- Test notes
- Screenshots for UI changes

## Release packaging

- Confirm HACS repository files exist.
- Confirm `hacs.json` exists at repo root.
- Confirm `manifest.json` version is correct.
- Confirm brand assets exist.
- Create GitHub release with matching tag.
- Include short upgrade notes and any known limitations.
