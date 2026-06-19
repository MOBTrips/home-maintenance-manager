from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
from typing import Any

TASK_PACK_FORMAT = "home_maintenance_manager_task_pack"
TASK_PACK_TYPE = "task_pack"
DEFAULT_PROVENANCE_KIND = "community"
ALLOWED_PROVENANCE_KINDS = {"community", "ai_generated", "asset_generated", "manual", "imported"}
BUILT_IN_PACK_DIRS = (
    Path(__file__).resolve().parents[2] / "task_packs",
    Path(__file__).resolve().parent / "task_packs",
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
                "name": req_id.replace("_", " ").title(),
                "description": "",
                "domain": domain,
                "role": role or "entity",
                "required": bool(required),
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
            if new_rule.get("entity"):
                role = str(new_rule.get("type") or "rule_entity")
                required = role in {"runtime", "counter"}
                new_rule["entity"] = requirement_for(new_rule.get("entity"), task_id, role, required)
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
            "min_hmm_version": pack_metadata.get("min_hmm_version", "0.7.2"),
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
