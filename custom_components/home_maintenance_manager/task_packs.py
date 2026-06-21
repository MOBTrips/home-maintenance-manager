from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import re
from typing import Any

try:
    from .units import (
        METER_SOURCE_RATE,
        canonical_unit,
        meter_units_compatible,
        normalize_counter_rule_units,
        normalize_meter_source_mode,
        rate_target_unit,
        unit_family,
    )
except ImportError:  # pragma: no cover - allows direct import in lightweight tests
    _UNITS_SPEC = importlib.util.spec_from_file_location("hmm_units", Path(__file__).with_name("units.py"))
    if _UNITS_SPEC is None or _UNITS_SPEC.loader is None:
        raise
    _units = importlib.util.module_from_spec(_UNITS_SPEC)
    _UNITS_SPEC.loader.exec_module(_units)
    METER_SOURCE_RATE = _units.METER_SOURCE_RATE
    canonical_unit = _units.canonical_unit
    meter_units_compatible = _units.meter_units_compatible
    normalize_counter_rule_units = _units.normalize_counter_rule_units
    normalize_meter_source_mode = _units.normalize_meter_source_mode
    rate_target_unit = _units.rate_target_unit
    unit_family = _units.unit_family

TASK_PACK_FORMAT = "home_maintenance_manager_task_pack"
TASK_PACK_TYPE = "task_pack"
DEFAULT_PROVENANCE_KIND = "community"
ALLOWED_PROVENANCE_KINDS = {"community", "ai_generated", "asset_generated", "manual", "imported"}
BUILT_IN_PACK_DIRS = (
    Path(__file__).resolve().parents[2] / "task_packs",
    Path(__file__).resolve().parent / "task_packs",
)
SERVICE_DUE_ENTITY_FIELDS = (
    "entity",
    "binary_due_entity",
    "status_entity",
    "remaining_percent_entity",
    "next_due_timestamp_entity",
)

RUNTIME_HISTORY_FIELDS = {
    "runtime_seconds",
    "totalized_usage",
    "last_seen_states",
    "last_completed",
    "last_completed_by",
    "last_completion_method",
    "baseline_method",
    "baseline_ago_value",
    "baseline_ago_unit",
    "late_count",
    "completion_history",
    "activity_history",
    "snoozed_until",
}

TASK_PACK_STRIPPED_FIELDS = RUNTIME_HISTORY_FIELDS | {
    "nfc_tags",
    "linked_device_id",
    "mobile_notify_service",
    "mobile_notify_services",
    "notification_targets",
    "deleted",
    "deleted_at",
}


def enforce_task_pack_merge_mode(mode: str | None) -> str:
    """Return merge mode for Task Packs or reject destructive modes."""
    normalized = str(mode or "merge").lower()
    if normalized == "replace":
        raise ValueError("Task Packs always use merge mode. Replace is only available for full HMM backup exports.")
    if normalized != "merge":
        raise ValueError("Task Pack import mode must be merge")
    return "merge"


def is_task_pack_package(package: dict[str, Any]) -> bool:
    """Return true when a package declares the formal task-pack shape."""
    return (
        isinstance(package, dict)
        and (
            package.get("format") == TASK_PACK_FORMAT
            or package.get("type") == TASK_PACK_TYPE
        )
    )


def package_hash(package: dict[str, Any]) -> str:
    """Return a stable hash for installed pack tracking."""
    package_for_hash = dict(package)
    package_for_hash.pop("package_hash", None)
    payload = json.dumps(package_for_hash, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _built_in_pack_files() -> list[Path]:
    """Return bundled Task Pack JSON files from local package/repo paths."""
    files: dict[str, Path] = {}
    for directory in BUILT_IN_PACK_DIRS:
        if not directory.exists():
            continue
        for path in sorted(directory.glob("*.json")):
            files.setdefault(path.name, path)
    return list(files.values())


def load_built_in_task_pack(pack_id: str) -> dict[str, Any]:
    """Load and validate one bundled Task Pack by pack id."""
    requested = str(pack_id or "").strip()
    if not requested:
        raise ValueError("Built-in Task Pack id is required")
    for path in _built_in_pack_files():
        try:
            package = json.loads(path.read_text(encoding="utf-8"))
            normalized = validate_task_pack(package)
        except Exception as err:
            raise ValueError(f"Built-in Task Pack {path.name} is invalid: {err}") from err
        if normalized["pack"].get("id") == requested:
            package = {
                **package,
                "pack": normalized["pack"],
                "entity_requirements": normalized["entity_requirements"],
                "tasks": normalized["tasks"],
                "package_hash": normalized["package_hash"],
            }
            return package
    raise ValueError(f"Built-in Task Pack not found: {requested}")


def list_built_in_task_pack_metadata(installed_pack_ids: set[str] | None = None) -> list[dict[str, Any]]:
    """Return metadata for bundled Task Packs without exposing full task bodies."""
    installed_pack_ids = installed_pack_ids or set()
    packs = []
    for path in _built_in_pack_files():
        try:
            package = json.loads(path.read_text(encoding="utf-8"))
            normalized = validate_task_pack(package)
        except Exception as err:
            raise ValueError(f"Built-in Task Pack {path.name} is invalid: {err}") from err
        pack = normalized["pack"]
        packs.append({
            "id": pack.get("id"),
            "name": pack.get("name"),
            "version": pack.get("version"),
            "description": pack.get("description"),
            "author": pack.get("author"),
            "categories": pack.get("categories") or [],
            "tags": pack.get("tags") or [],
            "task_count": len(normalized["tasks"]),
            "entity_requirement_count": len(normalized["entity_requirements"]),
            "installed": str(pack.get("id")) in installed_pack_ids,
            "source": "bundled",
            "package_hash": normalized["package_hash"],
        })
    return sorted(packs, key=lambda item: (item.get("name") or "").lower())


def _clean_string(value: Any, default: str = "") -> str:
    value = str(value or "").strip()
    return value or default


def _normalize_provenance(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        value = {}
    kind = _clean_string(value.get("kind"), DEFAULT_PROVENANCE_KIND)
    if kind not in ALLOWED_PROVENANCE_KINDS:
        kind = DEFAULT_PROVENANCE_KIND
    result = {"kind": kind}
    for key in ("source", "source_url", "generator", "generated_at", "asset_id", "notes"):
        if value.get(key) not in (None, ""):
            result[key] = value.get(key)
    return result


def normalize_pack_metadata(package: dict[str, Any]) -> dict[str, Any]:
    """Validate and normalize task-pack metadata."""
    pack = package.get("pack")
    if not isinstance(pack, dict):
        raise ValueError("Task Pack is missing pack metadata")
    pack_id = _clean_string(pack.get("id"))
    name = _clean_string(pack.get("name"))
    version = _clean_string(pack.get("version"))
    if not pack_id:
        raise ValueError("Task Pack metadata requires pack.id")
    if not name:
        raise ValueError("Task Pack metadata requires pack.name")
    if not version:
        raise ValueError("Task Pack metadata requires pack.version")

    metadata = {
        "id": pack_id,
        "name": name,
        "version": version,
        "description": _clean_string(pack.get("description")),
        "author": _clean_string(pack.get("author")),
        "license": _clean_string(pack.get("license")),
        "source": _clean_string(pack.get("source") or pack.get("source_url")),
        "source_url": _clean_string(pack.get("source_url") or pack.get("source")),
        "min_hmm_version": _clean_string(pack.get("min_hmm_version")),
        "tags": [str(tag).strip() for tag in (pack.get("tags") or []) if str(tag).strip()],
        "categories": [str(category).strip() for category in (pack.get("categories") or []) if str(category).strip()],
        "provenance": _normalize_provenance(pack.get("provenance")),
    }
    return metadata


def normalize_entity_requirements(package: dict[str, Any]) -> list[dict[str, Any]]:
    """Return validated task-pack entity requirements."""
    raw = package.get("entity_requirements", [])
    if raw in (None, ""):
        raw = []
    if not isinstance(raw, list):
        raise ValueError("Task Pack entity_requirements must be a list")
    requirements: list[dict[str, Any]] = []
    for idx, item in enumerate(raw):
        if not isinstance(item, dict):
            raise ValueError(f"Task Pack entity requirement {idx + 1} must be an object")
        req_id = _clean_string(item.get("id"))
        if not req_id:
            raise ValueError(f"Task Pack entity requirement {idx + 1} requires id")
        raw_keywords = item.get("suggested_keywords") or []
        if isinstance(raw_keywords, str):
            raw_keywords = [raw_keywords]
        elif not isinstance(raw_keywords, list):
            raw_keywords = []
        raw_preferred_ids = item.get("preferred_entity_ids") or []
        if isinstance(raw_preferred_ids, str):
            raw_preferred_ids = [raw_preferred_ids]
        elif not isinstance(raw_preferred_ids, list):
            raw_preferred_ids = []
        preferred_entity_id = _clean_string(item.get("preferred_entity_id"))
        preferred_entity_ids = []
        if preferred_entity_id:
            preferred_entity_ids.append(preferred_entity_id)
        preferred_entity_ids.extend(str(entity_id).strip() for entity_id in raw_preferred_ids if str(entity_id).strip())
        requirements.append({
            "id": req_id,
            "key": _clean_string(item.get("key"), req_id),
            "name": _clean_string(item.get("name"), req_id),
            "label": _clean_string(item.get("label") or item.get("name"), req_id),
            "description": _clean_string(item.get("description")),
            "domain": _clean_string(item.get("domain")),
            "role": _clean_string(item.get("role"), "entity"),
            "required": bool(item.get("required", False)),
            "device_class": _clean_string(item.get("device_class") or item.get("suggested_device_class")),
            "state_class": _clean_string(item.get("state_class")),
            "unit_of_measurement": _clean_string(item.get("unit_of_measurement") or item.get("unit")),
            "suggested_device_class": _clean_string(item.get("suggested_device_class")),
            "unit": _clean_string(item.get("unit")),
            "suggested_keywords": [str(keyword).strip().lower() for keyword in raw_keywords if str(keyword).strip()],
            "task_ids": [str(task_id).strip() for task_id in (item.get("task_ids") or []) if str(task_id).strip()],
            "preferred_entity_id": preferred_entity_id,
            "preferred_entity_ids": list(dict.fromkeys(preferred_entity_ids)),
            "qa_auto_map": bool(item.get("qa_auto_map", False)),
            "auto_map_when_available": bool(item.get("auto_map_when_available", False)),
            "auto_map_reason": _clean_string(item.get("auto_map_reason")),
        })
    return requirements


def _requirement_lookup(requirements: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for requirement in requirements:
        req_id = requirement["id"]
        lookup[req_id] = requirement
        lookup[f"hmm://entity/{req_id}"] = requirement
        req_key = str(requirement.get("key") or "").strip()
        if req_key:
            lookup[req_key] = requirement
            lookup[f"hmm://entity/{req_key}"] = requirement
    return lookup


def _requirement_for_ref(entity_ref: str, requirements: list[dict[str, Any]]) -> dict[str, Any] | None:
    return _requirement_lookup(requirements).get(entity_ref)


def _entity_mapping_aliases(entity_ref: str, requirements: list[dict[str, Any]] | None = None) -> set[str]:
    aliases = {entity_ref}
    if entity_ref.startswith("hmm://entity/"):
        aliases.add(entity_ref.removeprefix("hmm://entity/"))
    for requirement in requirements or []:
        req_id = str(requirement.get("id") or "").strip()
        req_key = str(requirement.get("key") or "").strip()
        req_refs = {ref for ref in (req_id, req_key, f"hmm://entity/{req_id}" if req_id else "", f"hmm://entity/{req_key}" if req_key else "") if ref}
        if entity_ref in req_refs:
            aliases.update(req_refs)
    return aliases


def _entity_mapping_action(entity_ref: str, entity_mapping: dict[str, Any], requirements: list[dict[str, Any]] | None = None) -> Any:
    if entity_ref in entity_mapping:
        return entity_mapping[entity_ref]
    for alias in _entity_mapping_aliases(entity_ref, requirements):
        if alias in entity_mapping:
            return entity_mapping[alias]
    if entity_ref.startswith("hmm://entity/"):
        return "__unresolved__"
    return entity_ref


def entity_mapping_for_task(
    task_id: str,
    entity_mapping: dict[str, Any] | None = None,
    task_entity_mapping: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return global entity mapping with task-specific choices applied."""
    task_id = str(task_id)
    merged = dict(entity_mapping or {})
    scoped = task_entity_mapping or {}
    nested = scoped.get(task_id)
    if isinstance(nested, dict):
        merged.update(nested)
    prefix = f"{task_id}::"
    for key, value in scoped.items():
        if isinstance(value, dict):
            continue
        key_text = str(key)
        if key_text.startswith(prefix):
            merged[key_text.removeprefix(prefix)] = value
    return merged


def _mark_unresolved_entity_pause(task_data: dict[str, Any]) -> None:
    task_data["paused"] = True
    provenance = dict(task_data.get("provenance") or {})
    provenance["pause_reason"] = "unresolved_required_entity"
    task_data["provenance"] = provenance


def _counter_mapping_issue(
    task_data: dict[str, Any],
    rule: dict[str, Any],
    rule_index: int,
    field: str,
    mapped_entity: str,
    requirement: dict[str, Any] | None,
    entity_meta: dict[str, Any],
) -> dict[str, Any] | None:
    if field != "entity" or rule.get("type") != "counter" or not entity_meta:
        return None
    actual_unit = entity_meta.get("unit_of_measurement") or entity_meta.get("unit")
    expected_unit = (
        requirement.get("unit_of_measurement")
        if requirement
        else None
    ) or rule.get("target_unit") or rule.get("unit") or rule.get("source_unit")
    source_mode = normalize_meter_source_mode(rule.get("source_mode"))
    if meter_units_compatible(expected_unit, actual_unit, source_mode):
        return None
    expected_canonical = canonical_unit(expected_unit) or str(expected_unit or "").strip()
    actual_canonical = canonical_unit(actual_unit) or str(actual_unit or "").strip()
    actual_total_unit = rate_target_unit(actual_canonical) if source_mode == METER_SOURCE_RATE else actual_canonical
    expected_family = unit_family(expected_canonical)
    actual_family = unit_family(actual_total_unit)
    if source_mode == METER_SOURCE_RATE:
        reason = (
            f"selected entity reports {actual_canonical or 'no unit'} as a rate, "
            f"which totalizes to {actual_total_unit or 'units'} ({actual_family or 'unknown family'}); "
            f"expected {expected_canonical or 'a unit'} ({expected_family or 'unknown family'})"
        )
    else:
        reason = (
            f"selected entity reports {actual_canonical or 'no unit'} ({actual_family or 'unknown family'}); "
            f"expected {expected_canonical or 'a unit'} ({expected_family or 'unknown family'})"
        )
    return {
        "task_name": task_data.get("name") or "Unnamed task",
        "rule_number": rule_index + 1,
        "field": f"rules[{rule_index}].{field}",
        "selected_entity": mapped_entity,
        "expected_domain": (requirement or {}).get("domain") or "",
        "expected_device_class": (requirement or {}).get("device_class") or (requirement or {}).get("suggested_device_class") or "",
        "expected_state_class": (requirement or {}).get("state_class") or "",
        "expected_unit": expected_canonical,
        "actual_domain": entity_meta.get("domain") or (mapped_entity.split(".", 1)[0] if "." in mapped_entity else ""),
        "actual_device_class": entity_meta.get("device_class") or "",
        "actual_state_class": entity_meta.get("state_class") or "",
        "actual_unit": actual_canonical,
        "reason": reason,
    }


def format_mapping_issue(issue: dict[str, Any]) -> str:
    """Return a user-facing mapping error with task and field context."""
    expected_bits = []
    actual_bits = []
    for label, key in (("domain", "expected_domain"), ("device class", "expected_device_class"), ("state class", "expected_state_class"), ("unit", "expected_unit")):
        if issue.get(key):
            expected_bits.append(f"{label} {issue[key]}")
    for label, key in (("domain", "actual_domain"), ("device class", "actual_device_class"), ("state class", "actual_state_class"), ("unit", "actual_unit")):
        if issue.get(key):
            actual_bits.append(f"{label} {issue[key]}")
    return (
        f"Task '{issue.get('task_name') or 'Unnamed task'}', Rule {issue.get('rule_number')}, "
        f"field {issue.get('field')}, selected {issue.get('selected_entity')} is not compatible. "
        f"Expected {', '.join(expected_bits) or 'no specific metadata'}; "
        f"actual {', '.join(actual_bits) or 'no metadata'}. "
        f"Reason: {issue.get('reason') or 'mapping metadata is incompatible'}. "
        "Choose a compatible entity or clear/remap this task before importing."
    )


def apply_task_pack_entity_mapping(
    task_data: dict[str, Any],
    entity_mapping: dict[str, Any] | None = None,
    requirements: list[dict[str, Any]] | None = None,
    entity_metadata: dict[str, dict[str, Any]] | None = None,
    strict: bool = False,
) -> dict[str, Any]:
    """Apply reviewed entity mapping choices to a Task Pack task."""
    mapping = entity_mapping or {}
    metadata = entity_metadata or {}
    data = deepcopy(task_data)
    linked = []
    for entity_id in data.get("linked_entities") or []:
        original = str(entity_id)
        action = _entity_mapping_action(original, mapping, requirements)
        if action in (None, "", "__clear__"):
            continue
        if action == "__unresolved__":
            linked.append(original)
        else:
            linked.append(str(action))
    data["linked_entities"] = linked

    rules = []
    for rule_index, rule in enumerate(data.get("rules") or []):
        if not isinstance(rule, dict):
            continue
        new_rule = dict(rule)
        entity_fields = SERVICE_DUE_ENTITY_FIELDS if new_rule.get("type") == "service_due" else ("entity",)
        for field in entity_fields:
            if not new_rule.get(field):
                continue
            original = str(new_rule.get(field))
            action = _entity_mapping_action(original, mapping, requirements)
            if action in (None, "", "__clear__"):
                new_rule.pop(field, None)
                if new_rule.get("type") in ("runtime", "counter", "service_due"):
                    _mark_unresolved_entity_pause(data)
            elif action == "__unresolved__":
                new_rule[field] = original
                if new_rule.get("type") in ("runtime", "counter", "service_due"):
                    _mark_unresolved_entity_pause(data)
            else:
                mapped_entity = str(action)
                new_rule[field] = mapped_entity
                requirement = _requirement_for_ref(original, requirements or [])
                entity_meta = metadata.get(mapped_entity, {})
                issue = _counter_mapping_issue(data, new_rule, rule_index, field, mapped_entity, requirement, entity_meta)
                if issue:
                    message = format_mapping_issue(issue)
                    if strict:
                        raise ValueError(message)
                    _mark_unresolved_entity_pause(data)
                    provenance = dict(data.get("provenance") or {})
                    warnings = list(provenance.get("mapping_warnings") or [])
                    warnings.append(message)
                    provenance["mapping_warnings"] = warnings
                    data["provenance"] = provenance
                elif field == "entity" and new_rule.get("type") == "counter" and entity_meta:
                    actual_unit = entity_meta.get("unit_of_measurement") or entity_meta.get("unit")
                    expected_unit = (
                        requirement.get("unit_of_measurement")
                        if requirement
                        else None
                    ) or new_rule.get("target_unit") or new_rule.get("unit") or new_rule.get("source_unit")
                    new_rule = normalize_counter_rule_units(new_rule, actual_unit, expected_unit)
        rules.append(new_rule)
    data["rules"] = rules
    return data


def _requirement_id_for_entity(entity_id: str, used_ids: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", entity_id.lower()).strip("_") or "entity"
    candidate = base
    idx = 2
    while candidate in used_ids:
        candidate = f"{base}_{idx}"
        idx += 1
    used_ids.add(candidate)
    return candidate


def _template_tasks_with_entity_requirements(
    tasks: list[dict[str, Any]],
    existing_requirements: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Replace local HA entity IDs with Task Pack requirement placeholders."""
    requirements = [dict(req) for req in (existing_requirements or []) if isinstance(req, dict)]
    by_entity: dict[str, dict[str, Any]] = {}
    used_ids = {str(req.get("id")) for req in requirements if req.get("id")}

    def requirement_for(entity_id: Any, task_id: str, role: str, required: bool) -> str:
        entity = str(entity_id or "").strip()
        if not entity or entity.startswith("hmm://entity/"):
            return entity
        if entity not in by_entity:
            req_id = _requirement_id_for_entity(entity, used_ids)
            domain = entity.split(".", 1)[0] if "." in entity else ""
            by_entity[entity] = {
                "id": req_id,
                "key": req_id,
                "name": req_id.replace("_", " ").title(),
                "label": req_id.replace("_", " ").title(),
                "description": "",
                "domain": domain,
                "role": role or "entity",
                "required": bool(required),
                "device_class": "",
                "state_class": "",
                "unit_of_measurement": "",
                "suggested_device_class": "",
                "unit": "",
                "suggested_keywords": [word for word in req_id.split("_") if word],
                "task_ids": [],
            }
            requirements.append(by_entity[entity])
        req = by_entity[entity]
        req["required"] = bool(req.get("required") or required)
        if role and (req.get("role") in {"entity", "linked_entity"} or required):
            req["role"] = role
        if task_id and task_id not in req["task_ids"]:
            req["task_ids"].append(task_id)
        return f"hmm://entity/{req['id']}"

    templated_tasks: list[dict[str, Any]] = []
    for item in tasks:
        task = deepcopy(item)
        task_id = str(task.get("id") or "")
        task["linked_entities"] = [
            requirement_for(entity_id, task_id, "linked_entity", False)
            for entity_id in (task.get("linked_entities") or [])
            if str(entity_id or "").strip()
        ]
        rules = []
        for rule in task.get("rules") or []:
            if not isinstance(rule, dict):
                continue
            new_rule = dict(rule)
            entity_fields = SERVICE_DUE_ENTITY_FIELDS if new_rule.get("type") == "service_due" else ("entity",)
            for field in entity_fields:
                if new_rule.get(field):
                    role = str(new_rule.get("type") or "rule_entity")
                    required = role in {"runtime", "counter", "service_due"}
                    new_rule[field] = requirement_for(new_rule.get(field), task_id, role, required)
            rules.append(new_rule)
        task["rules"] = rules
        templated_tasks.append(task)
    return templated_tasks, requirements


def sanitize_task_pack_task(
    task_data: dict[str, Any],
    pack_metadata: dict[str, Any],
    requirements: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Return a task-pack task as a safe template import task."""
    data = deepcopy(task_data)
    for field in TASK_PACK_STRIPPED_FIELDS:
        data.pop(field, None)
    data["linked_device_id"] = None
    data["nfc_tags"] = []
    data["nfc_action"] = "disabled"
    data["mobile_notify_service"] = None
    data.setdefault("notification_mode", "automation_only")
    data["provenance"] = {
        "origin": "task_pack",
        "kind": pack_metadata.get("provenance", {}).get("kind", DEFAULT_PROVENANCE_KIND),
        "pack_id": pack_metadata.get("id"),
        "pack_name": pack_metadata.get("name"),
        "pack_version": pack_metadata.get("version"),
        "source": pack_metadata.get("source") or pack_metadata.get("source_url"),
    }

    requirement_by_ref = _requirement_lookup(requirements or [])
    linked = []
    for entity_id in data.get("linked_entities") or []:
        ref = str(entity_id)
        if ref in requirement_by_ref:
            linked.append(ref)
        elif ref.startswith("hmm://entity/"):
            linked.append(ref)
        else:
            linked.append(ref)
    data["linked_entities"] = linked

    rules = []
    for rule in data.get("rules") or []:
        if not isinstance(rule, dict):
            continue
        new_rule = dict(rule)
        entity_fields = SERVICE_DUE_ENTITY_FIELDS if new_rule.get("type") == "service_due" else ("entity",)
        for field in entity_fields:
            entity_ref = new_rule.get(field)
            if entity_ref is not None:
                new_rule[field] = str(entity_ref)
        rules.append(new_rule)
    data["rules"] = rules
    return data


def validate_task_pack(package: dict[str, Any]) -> dict[str, Any]:
    """Validate a formal Task Pack package and return normalized pieces."""
    if not isinstance(package, dict):
        raise ValueError("Task Pack must be a JSON object")
    if package.get("format") != TASK_PACK_FORMAT:
        raise ValueError(f"Task Pack format must be {TASK_PACK_FORMAT}")
    if package.get("type") != TASK_PACK_TYPE:
        raise ValueError("Task Pack type must be task_pack")
    if package.get("format_version") in (None, ""):
        raise ValueError("Task Pack requires format_version")
    raw_tasks = package.get("tasks")
    if not isinstance(raw_tasks, list):
        raise ValueError("Task Pack requires a tasks list")
    metadata = normalize_pack_metadata(package)
    requirements = normalize_entity_requirements(package)
    for idx, item in enumerate(raw_tasks):
        if not isinstance(item, dict):
            raise ValueError(f"Task Pack task {idx + 1} must be an object")
        if not item.get("id") or not item.get("name"):
            raise ValueError(f"Task Pack task {idx + 1} requires id and name")
    templated_tasks, requirements = _template_tasks_with_entity_requirements(raw_tasks, requirements)
    tasks = []
    for idx, item in enumerate(templated_tasks):
        tasks.append(sanitize_task_pack_task(item, metadata, requirements))
    return {
        "package_type": TASK_PACK_TYPE,
        "format": TASK_PACK_FORMAT,
        "format_version": package.get("format_version"),
        "pack": metadata,
        "entity_requirements": requirements,
        "tasks": tasks,
        "package_hash": package_hash(package),
    }


def build_task_pack_package(
    pack_metadata: dict[str, Any],
    tasks: list[dict[str, Any]],
    entity_requirements: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build and validate a formal Task Pack package from selected tasks."""
    if not tasks:
        raise ValueError("Select at least one task to export as a Task Pack")
    templated_tasks, requirements = _template_tasks_with_entity_requirements(tasks, entity_requirements)
    package = {
        "format": TASK_PACK_FORMAT,
        "format_version": 1,
        "type": TASK_PACK_TYPE,
        "pack": {
            "id": pack_metadata.get("id"),
            "name": pack_metadata.get("name"),
            "version": pack_metadata.get("version"),
            "description": pack_metadata.get("description", ""),
            "author": pack_metadata.get("author", ""),
            "license": pack_metadata.get("license", ""),
            "source": pack_metadata.get("source", "manual_export"),
            "source_url": pack_metadata.get("source_url", ""),
            "min_hmm_version": pack_metadata.get("min_hmm_version", "0.7.3"),
            "categories": pack_metadata.get("categories", []),
            "tags": pack_metadata.get("tags", []),
            "provenance": pack_metadata.get("provenance", {"kind": "manual", "source": "export"}),
        },
        "entity_requirements": requirements,
        "tasks": templated_tasks,
    }
    normalized = validate_task_pack(package)
    package["pack"] = normalized["pack"]
    package["entity_requirements"] = normalized["entity_requirements"]
    package["tasks"] = normalized["tasks"]
    package["package_hash"] = normalized["package_hash"]
    return package


def installed_pack_record(
    pack_metadata: dict[str, Any],
    imported_task_ids: list[str],
    package_hash_value: str,
) -> dict[str, Any]:
    """Return the persisted installed-pack metadata record."""
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": pack_metadata.get("id"),
        "name": pack_metadata.get("name"),
        "version": pack_metadata.get("version"),
        "source": pack_metadata.get("source") or pack_metadata.get("source_url"),
        "provenance": pack_metadata.get("provenance", {}),
        "installed_at": now,
        "imported_task_ids": sorted(set(str(task_id) for task_id in imported_task_ids)),
        "package_hash": package_hash_value,
    }


def merge_installed_pack_record(
    existing_record: dict[str, Any] | None,
    pack_metadata: dict[str, Any],
    imported_task_ids: list[str],
    package_hash_value: str,
) -> dict[str, Any]:
    """Return an installed-pack record updated without duplicating repeat imports."""
    existing_record = existing_record if isinstance(existing_record, dict) else {}
    merged_task_ids = sorted(set((existing_record.get("imported_task_ids") or []) + list(imported_task_ids or [])))
    record = installed_pack_record(pack_metadata, merged_task_ids, package_hash_value)
    if existing_record.get("installed_at"):
        record["installed_at"] = existing_record["installed_at"]
    return record
