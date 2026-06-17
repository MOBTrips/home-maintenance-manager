# FAQ

## Is HMM an add-on?

No. HMM is a Home Assistant custom integration, not a Home Assistant add-on.

## Can I install it with HACS?

Yes, it is intended to be installed as a HACS custom repository under the Integration category.

## Does HMM require cloud services?

No. Core HMM functionality is local to Home Assistant.

## Do I need NFC tags?

No. NFC tags are optional. They are helpful when you want a physical tag on equipment that opens or completes the related task.

## Can tasks use Home Assistant sensors?

Yes. Runtime and metered schedules can use Home Assistant entities as source data.

## Why is my runtime or metered task not accurate?

Runtime and metered tasks depend on source sensor quality. Check that the sensor updates reliably, has the expected unit, and does not reset unexpectedly.

## What happens when I delete a task?

HMM attempts to remove task data and clean up stale task-related entities/devices. If Home Assistant still shows unavailable entries, reload the integration or restart Home Assistant.

## Can I automate task completion?

Yes. HMM is designed to work with Home Assistant automations and services, though exact service names may vary by release.

## Is HMM production ready?

HMM is still pre-1.0. It is usable for testing and personal maintenance tracking, but every release should be validated carefully before broad HACS publication.
