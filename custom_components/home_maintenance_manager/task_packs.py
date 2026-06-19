from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from typing import Any

TASK_PACK_FORMAT = "home_maintenance_manager_task_pack"
TASK_PACK_TYPE = "task_pack"
DEFAULT_PROVENANCE_KIND = "community"
ALLOWED_PROVENANCE_KINDS = {"community", "ai_generated", "asset_generated", "manual", "imported"}

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
}


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
    payload = json.dumps(package, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


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
        requirements.append({
            "id": req_id,
            "name": _clean_string(item.get("name"), req_id),
            "description": _clean_string(item.get("description")),
            "domain": _clean_string(item.get("domain")),
            "role": _clean_string(item.get("role"), "entity"),
            "required": bool(item.get("required", False)),
            "suggested_device_class": _clean_string(item.get("suggested_device_class")),
            "unit": _clean_string(item.get("unit")),
            "task_ids": [str(task_id).strip() for task_id in (item.get("task_ids") or []) if str(task_id).strip()],
        })
    return requirements


def _requirement_lookup(requirements: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for requirement in requirements:
        req_id = requirement["id"]
        lookup[req_id] = requirement
        lookup[f"hmm://entity/{req_id}"] = requirement
    return lookup


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
        entity_ref = new_rule.get("entity")
        if entity_ref is not None:
            new_rule["entity"] = str(entity_ref)
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
    tasks = []
    for idx, item in enumerate(raw_tasks):
        if not isinstance(item, dict):
            raise ValueError(f"Task Pack task {idx + 1} must be an object")
        if not item.get("id") or not item.get("name"):
            raise ValueError(f"Task Pack task {idx + 1} requires id and name")
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
