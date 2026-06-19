# Home Maintenance Manager Roadmap

This roadmap is a planning guide, not a fixed commitment. Use GitHub issues and milestones for committed release scope.

## Near term: stabilization and development workflow

- Add Codex-ready repository instructions through `AGENTS.md`.
- Maintain issue templates for bugs, features, and scoped Codex tasks.
- Keep HACS and Hassfest validation running through GitHub Actions.
- Continue improving import/export reliability.
- Continue improving deletion cleanup and NFC reassignment cleanup.
- Expand release checklist discipline.

## v0.6.x focus: import/export and safety

- Polish import review wizard.
- Improve missing entity mapping context and selection.
- Keep task selections stable across wizard steps.
- Clarify Merge vs Replace behavior.
- Make Replace mode clearly backup recovery only.
- Strengthen validation around required runtime and meter entities.
- Improve export metadata for future compatibility.

## v0.7.x focus: task packs foundation

- Define task-pack JSON schema.
- Support task-pack metadata: name, author, version, description, compatible HMM version, categories, tags, and source.
- Add task-pack import mode that always merges.
- Add safe defaults for imported task packs.
- Add missing entity mapping for task packs.
- Add example packs, such as HVAC, water softener, pool, hot tub, appliances, vehicles, and seasonal equipment.

## v0.8.x focus: task experience and automation

- Improve task detail and edit layouts.
- Improve dashboard filtering, grouping, and sorting.
- Add better recurring reminder behavior.
- Improve Home Assistant service calls for automations.
- Add richer maintenance history and notes.
- Consider attachments or links for manuals, filters, parts, and procedures.

## v0.9.x focus: readiness for broader HACS use

- Improve diagnostics and repair flows.
- Expand test coverage.
- Harden migrations.
- Finalize documentation and screenshots.
- Validate HACS custom repository and publication readiness.
- Prepare 1.0 criteria.

## Future ideas

- AI-assisted task generation using user-provided home profile data.
- Optional task recommendations based on assets and Home Assistant entities.
- Shared community task packs.
- Local-only safety model for AI-generated suggestions.
- Asset manuals, parts lists, and replacement links.
- More advanced seasonal logic.
- Calendar integration.
