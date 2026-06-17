# HACS Readiness

This project includes the basic files HACS expects for a custom integration repository.

## Included

- `hacs.json` at the repository root.
- `custom_components/home_maintenance_manager/manifest.json` with required integration metadata.
- `custom_components/home_maintenance_manager/brand/icon.png` for Home Assistant and HACS brand validation.
- `.github/workflows/validate.yml` using the official `hacs/action@main` validation action.

## Repository settings still required in GitHub

These cannot be packaged into the ZIP and must be configured on the GitHub repository:

- Public repository.
- Repository description.
- Repository topics.
- Issues enabled.
- GitHub releases published for versioned releases, recommended by HACS.

## Release process recommendation

1. Update `manifest.json` version.
2. Append `CHANGELOG.md`.
3. Create a GitHub release with the same version tag, for example `v0.5.31`.
4. Let the HACS validation workflow pass before publishing broadly.
