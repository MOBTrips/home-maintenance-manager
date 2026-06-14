# Home Maintenance Manager v0.4.9

Patch release after v0.4.8.

## Fixed

- Creating or editing tasks from the Maintenance sidebar now reloads the config entry so Home Assistant creates/updates the corresponding task device and entities.
- Deleting tasks now reloads the config entry so removed task entities/devices are cleaned up.

## Why

The custom sidebar panel was saving tasks to storage, but Home Assistant entity platforms do not automatically create new entities after setup unless the config entry is reloaded or entities are dynamically added. This patch uses a config entry reload after task save/delete.
