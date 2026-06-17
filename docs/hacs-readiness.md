# HACS Readiness

This document tracks repository readiness for HACS custom repository use and eventual broader publication.

## Current target

HMM is packaged as a Home Assistant custom integration and should be installable as a HACS custom repository in the **Integration** category.

## Required repository structure

Expected structure:

```text
custom_components/home_maintenance_manager/
  __init__.py
  manifest.json
  config_flow.py
  const.py
  coordinator.py
  sensor.py
  binary_sensor.py
  button.py
  services.yaml
  strings.json
  translations/en.json
  frontend/
  brand/
README.md
CHANGELOG.md
hacs.json
.github/workflows/validate.yml
```

## Validation actions

HACS publication guidance requires the repository to pass HACS Action and, for integrations, Hassfest before being submitted for default inclusion. The validation workflow in this repository runs both checks on pull requests, pushes to `main`, a scheduled run, and manual dispatch.

## Release checklist

Before creating a release:

- Update `manifest.json` version.
- Update `CHANGELOG.md`.
- Confirm `hacs.json` has the intended minimum Home Assistant version.
- Confirm brand assets exist in the expected locations.
- Run Python compile checks locally.
- Push to GitHub and confirm the validation workflow passes.
- Create a full GitHub release, not only a tag.
- Install through HACS as a custom repository in a test Home Assistant instance.

## Brand assets

Current brand assets are included at both the repository root and integration package level for compatibility and visibility:

```text
brand/icon.png
brand/logo.png
brand/icon.svg
brand/logo.svg
custom_components/home_maintenance_manager/brand/icon.png
custom_components/home_maintenance_manager/brand/logo.png
custom_components/home_maintenance_manager/brand/icon.svg
custom_components/home_maintenance_manager/brand/logo.svg
```

## Known pre-submission items

- Confirm validation workflow passes on GitHub.
- Confirm HACS installs the latest release correctly.
- Confirm sidebar and integration branding display correctly in Home Assistant.
- Confirm task deletion removes stale devices/entities after reload and restart.
- Confirm NFC reassignment does not leave stale task links.
