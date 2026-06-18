from __future__ import annotations

from datetime import timedelta, time
import logging
from typing import Any
from urllib.parse import quote

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DOMAIN, STORAGE_KEY, STORAGE_VERSION, LEGACY_STORAGE_KEY, LEGACY_STORAGE_VERSION, EVENT_ACTIVITY, EVENT_COMPLETION, EVENT_NFC_SCAN
from .models import MaintenanceTask

_LOGGER = logging.getLogger(__name__)

_NOTIFICATION_DEFAULTS = {
    "enabled": True,
    "default_mode": "automation_only",
    "mobile_notify_services": [],
    "notify_upcoming": True,
    "notify_due": True,
    "notify_overdue": True,
    "notify_completed": False,
    "notify_snoozed": False,
    "repeat_mode": "once",
    "repeat_days": 1,
    "quiet_start": "",
    "quiet_end": "",
    "title_template": "[{category}] {task_name}",
    "body_template": "{task_name} is {status}.",
}

_STATUS_EVENT_MAP = {
    "upcoming": "notify_upcoming",
    "due": "notify_due",
    "overdue": "notify_overdue",
    "completed": "notify_completed",
    "snoozed": "notify_snoozed",
}


class MaintenanceCoordinator:
    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.legacy_store = Store(hass, LEGACY_STORAGE_VERSION, LEGACY_STORAGE_KEY)
        self.tasks: dict[str, MaintenanceTask] = {}
        self.listeners: list[callable] = []
        self._unsub: list[callable] = []
        self.storage_settings: dict[str, Any] = {}
        self.migration_info: dict[str, Any] = {}
        self.deleted_task_ids: set[str] = set()
        self.loaded_data: dict[str, Any] = {}

    async def async_load(self, config_entry_options: dict[str, Any] | None = None, yaml_tasks: list[dict[str, Any]] | None = None) -> None:
        """Load the v0.6 unified storage file and migrate older HMM data.

        v0.6 uses one HA Store file named ``home_maintenance_manager`` as the
        authoritative database for tasks, runtime/history, NFC assignments, and
        HMM-owned settings. Older releases used ``home_maintenance_manager.tasks``
        plus config-entry options. This loader imports both without overwriting
        richer runtime/history already present in storage.
        """
        config_entry_options = dict(config_entry_options or {})
        yaml_tasks = list(yaml_tasks or [])
        data = await self.store.async_load() or {}
        legacy_data = await self.legacy_store.async_load() or {}

        tasks_by_id: dict[str, dict[str, Any]] = {}
        migrated_from: list[str] = []
        self.migration_info = dict(data.get("migration", {}) or {})
        completed_sources = set(self.migration_info.get("migrated_from", []) or [])
        self.deleted_task_ids = {str(task_id) for task_id in (data.get("deleted_task_ids", []) or [])}

        for item in data.get("tasks", []) or []:
            if isinstance(item, dict) and item.get("id"):
                tasks_by_id[str(item["id"])] = dict(item)

        legacy_tasks = legacy_data.get("tasks", []) if isinstance(legacy_data, dict) else []
        if legacy_tasks and LEGACY_STORAGE_KEY not in completed_sources:
            migrated_from.append(LEGACY_STORAGE_KEY)
            for item in legacy_tasks:
                if not isinstance(item, dict) or not item.get("id"):
                    continue
                task_id = str(item["id"])
                if task_id in self.deleted_task_ids:
                    continue
                if task_id not in tasks_by_id:
                    tasks_by_id[task_id] = dict(item)

        option_tasks = config_entry_options.get("tasks", []) or []
        if option_tasks and "config_entry.options.tasks" not in completed_sources:
            migrated_from.append("config_entry.options.tasks")
            for item in option_tasks:
                if not isinstance(item, dict) or not item.get("id"):
                    continue
                task_id = str(item["id"])
                if task_id in self.deleted_task_ids:
                    continue
                if task_id in tasks_by_id:
                    # Preserve runtime/history from storage, but refresh editable
                    # task configuration from the config entry record.
                    existing = dict(tasks_by_id[task_id])
                    runtime_keys = {
                        "last_completed", "last_completed_by", "last_completion_method",
                        "runtime_seconds", "completion_history", "activity_history",
                        "snoozed_until", "snooze_count", "totalized_usage",
                    }
                    preserved = {k: existing[k] for k in runtime_keys if k in existing}
                    merged = dict(item)
                    merged.update(preserved)
                    tasks_by_id[task_id] = merged
                else:
                    tasks_by_id[task_id] = dict(item)

        if yaml_tasks:
            # YAML remains a declarative compatibility source. Do not resurrect
            # tasks the user explicitly deleted from HMM storage.
            migrated_from.append("configuration.yaml")
            for item in yaml_tasks:
                if isinstance(item, dict) and item.get("id"):
                    task_id = str(item["id"])
                    if task_id not in self.deleted_task_ids:
                        tasks_by_id.setdefault(task_id, dict(item))

        self.storage_settings = dict(data.get("settings", {}) or {})
        option_notification_settings = config_entry_options.get("notification_settings")
        if option_notification_settings and "notification_settings" not in self.storage_settings:
            self.storage_settings["notification_settings"] = dict(option_notification_settings)
            migrated_from.append("config_entry.options.notification_settings")

        if migrated_from:
            self.migration_info.update({
                "storage_version": STORAGE_VERSION,
                "migrated_from": sorted(completed_sources | set(migrated_from)),
                "migrated_at": dt_util.utcnow().isoformat(),
            })

        self.tasks = {task_id: MaintenanceTask.from_dict(item) for task_id, item in tasks_by_id.items()}
        await self.async_save()
        self._setup_tracking()

    def data_for_storage(self) -> dict[str, Any]:
        return {
            "version": STORAGE_VERSION,
            "tasks": [task.as_dict() for task in self.tasks.values()],
            "settings": self.storage_settings,
            "migration": self.migration_info,
            "deleted_task_ids": sorted(self.deleted_task_ids),
        }

    def get_notification_settings(self) -> dict[str, Any]:
        settings = dict(_NOTIFICATION_DEFAULTS)
        settings.update(self.storage_settings.get("notification_settings", {}) or {})
        return settings

    async def async_update_notification_settings(self, settings: dict[str, Any]) -> dict[str, Any]:
        merged = dict(_NOTIFICATION_DEFAULTS)
        merged.update(settings or {})
        self.storage_settings["notification_settings"] = merged
        await self.async_save()
        return merged

    def backup_status(self) -> dict[str, Any]:
        history_count = sum(len(task.completion_history or []) for task in self.tasks.values())
        activity_count = sum(len(task.activity_history or []) for task in self.tasks.values())
        return {
            "storage_key": STORAGE_KEY,
            "storage_version": STORAGE_VERSION,
            "storage_path": f"/config/.storage/{STORAGE_KEY}",
            "legacy_storage_path": f"/config/.storage/{LEGACY_STORAGE_KEY}",
            "tasks": len(self.tasks),
            "completion_history_records": history_count,
            "activity_history_records": activity_count,
            "settings_in_storage": bool(self.storage_settings),
            "included_in_ha_backup": True,
            "migration": self.migration_info,
            "deleted_task_ids": sorted(self.deleted_task_ids),
        }

    def _normalize_nfc_config(self, task_data: dict[str, Any]) -> dict[str, Any]:
        """Return task data with NFC disabled state represented consistently.

        The frontend can send either an empty tag list, an explicit disabled
        action, or both. Treat any disabled action as no assigned tags so a
        stale tag cannot continue to match this task after editing.
        """
        normalized = dict(task_data)
        action = str(normalized.get("nfc_action") or "disabled").lower()
        tags = [str(tag).strip() for tag in (normalized.get("nfc_tags") or []) if str(tag).strip()]
        if action == "disabled" or not tags:
            normalized["nfc_tags"] = []
            normalized["nfc_action"] = "disabled"
        else:
            normalized["nfc_tags"] = tags
            normalized["nfc_action"] = action
        return normalized

    def _remove_nfc_tags_from_other_tasks(self, owner_task_id: str, tags: list[str]) -> list[str]:
        """Ensure one NFC tag maps to only one maintenance task."""
        removed_from: list[str] = []
        tag_set = set(tags or [])
        if not tag_set:
            return removed_from
        for task_id, task in self.tasks.items():
            if task_id == owner_task_id:
                continue
            existing = list(task.nfc_tags or [])
            cleaned = [tag for tag in existing if tag not in tag_set]
            if cleaned != existing:
                task.nfc_tags = cleaned
                removed_from.append(task_id)
                if not cleaned:
                    task.nfc_action = "disabled"
        return removed_from

    async def _cleanup_nfc_notifications(self, task_ids: list[str]) -> None:
        """Dismiss stale NFC persistent/mobile notifications for changed assignments."""
        settings = self._notification_settings()
        targets = settings.get("mobile_notify_services") or []
        for task_id in set(task_ids):
            await self._dismiss_persistent_notification(f"home_maintenance_manager_nfc_confirm_{task_id}")
            for target in targets:
                if not isinstance(target, str) or not target.startswith("notify."):
                    continue
                service = target.split(".", 1)[1]
                if not self.hass.services.has_service("notify", service):
                    continue
                try:
                    await self.hass.services.async_call(
                        "notify",
                        service,
                        {"message": "clear_notification", "data": {"tag": f"hmm_nfc_{task_id}"}},
                        blocking=True,
                    )
                except Exception:  # pragma: no cover
                    _LOGGER.debug("Failed to clear stale NFC mobile notification for task %s", task_id, exc_info=True)

    async def async_sync_configured_tasks(self, configured_tasks: list[dict[str, Any]]) -> None:
        """Compatibility shim for YAML task definitions.

        The unified storage file is now the source of truth. YAML tasks are
        imported/updated when present, but missing YAML/config-entry tasks no
        longer delete stored tasks.
        """
        configured_tasks = [self._normalize_nfc_config(task) for task in configured_tasks]
        changed_nfc_task_ids: list[str] = []
        for task_data in configured_tasks:
            task_id = task_data["id"]
            old_tags = list(self.tasks.get(task_id).nfc_tags or []) if task_id in self.tasks else []
            old_action = self.tasks.get(task_id).nfc_action if task_id in self.tasks else None
            if task_id in self.tasks:
                self.tasks[task_id].update_config_from_dict(task_data)
            else:
                self.tasks[task_id] = MaintenanceTask.from_dict(task_data)
            changed_nfc_task_ids.extend(self._remove_nfc_tags_from_other_tasks(task_id, task_data.get("nfc_tags") or []))
            if old_tags != list(self.tasks[task_id].nfc_tags or []) or old_action != self.tasks[task_id].nfc_action:
                changed_nfc_task_ids.append(task_id)
        await self.async_save()
        if changed_nfc_task_ids:
            await self._cleanup_nfc_notifications(changed_nfc_task_ids)
        self._setup_tracking()
        self._notify()
        self.hass.async_create_task(self.async_check_notifications())

    async def async_upsert_task(self, task_data: dict[str, Any]) -> None:
        task_data = self._normalize_nfc_config(task_data)
        task_id = str(task_data["id"])
        task_data["id"] = task_id
        # If a user intentionally recreates/imports a task with the same ID,
        # clear the tombstone that prevented legacy migration resurrection.
        self.deleted_task_ids.discard(task_id)
        old_tags = list(self.tasks.get(task_id).nfc_tags or []) if task_id in self.tasks else []
        old_action = self.tasks.get(task_id).nfc_action if task_id in self.tasks else None
        changed_nfc_task_ids: list[str] = []
        if task_id in self.tasks:
            self.tasks[task_id].update_config_from_dict(task_data)
        else:
            self.tasks[task_id] = MaintenanceTask.from_dict(task_data)
        changed_nfc_task_ids.extend(self._remove_nfc_tags_from_other_tasks(task_id, task_data.get("nfc_tags") or []))
        if old_tags != list(self.tasks[task_id].nfc_tags or []) or old_action != self.tasks[task_id].nfc_action:
            changed_nfc_task_ids.append(task_id)
        await self.async_save()
        if changed_nfc_task_ids:
            await self._cleanup_nfc_notifications(changed_nfc_task_ids)
        self._setup_tracking()
        self._notify()
        await self.async_check_notifications()

    async def async_delete_task(self, task_id: str) -> None:
        task_id = str(task_id)
        # Persist a deletion tombstone so legacy/config-entry migration sources
        # cannot resurrect the task on reload, reinstall, or integration re-add.
        self.deleted_task_ids.add(task_id)
        if task_id in self.tasks:
            del self.tasks[task_id]
        await self.async_save()
        await self._cleanup_nfc_notifications([task_id])
        self._setup_tracking()
        self._notify()
        await self.async_check_notifications()


    def export_data(self) -> dict[str, Any]:
        """Return a portable JSON export package.

        The export format is intentionally separate from the raw HA Store file so
        future releases can import/export task packs, support snapshots, and
        keep Home Assistant-specific storage metadata out of shared packages.
        """
        return {
            "format": "home_maintenance_manager_export",
            "format_version": 1,
            "integration_version": "0.6.7",
            "exported_at": dt_util.utcnow().isoformat(),
            "storage_version": STORAGE_VERSION,
            "tasks": [task.as_dict() for task in self.tasks.values()],
            "settings": self.storage_settings,
            "migration": self.migration_info,
        }

    async def async_import_data(self, package: dict[str, Any], mode: str = "merge") -> dict[str, Any]:
        """Import a portable JSON export package.

        ``merge`` adds new tasks and updates matching task IDs while preserving
        runtime/history for existing tasks unless the import includes those fields.
        ``replace`` makes the imported package the full task database and records
        tombstones for tasks removed by the replace so legacy migration sources
        cannot resurrect them later.
        """
        if not isinstance(package, dict):
            raise ValueError("Import data must be a JSON object")
        mode = str(mode or "merge").lower()
        if mode not in {"merge", "replace"}:
            raise ValueError("Import mode must be merge or replace")

        raw_tasks = package.get("tasks")
        if raw_tasks is None and isinstance(package.get("data"), dict):
            raw_tasks = package["data"].get("tasks")
        if not isinstance(raw_tasks, list):
            raise ValueError("Import file does not contain a tasks list")

        imported: dict[str, MaintenanceTask] = {}
        skipped = 0
        for item in raw_tasks:
            if not isinstance(item, dict) or not item.get("id") or not item.get("name"):
                skipped += 1
                continue
            task_data = self._normalize_nfc_config(dict(item))
            task_id = str(task_data["id"])
            task_data["id"] = task_id
            imported[task_id] = MaintenanceTask.from_dict(task_data)

        before_ids = set(self.tasks)
        changed_nfc_task_ids: list[str] = []

        if mode == "replace":
            removed_ids = before_ids - set(imported)
            self.deleted_task_ids.update(removed_ids)
            self.tasks = imported
            self.deleted_task_ids.difference_update(imported.keys())
            changed_nfc_task_ids.extend(list(before_ids | set(imported)))
        else:
            for task_id, imported_task in imported.items():
                self.deleted_task_ids.discard(task_id)
                old_tags = list(self.tasks.get(task_id).nfc_tags or []) if task_id in self.tasks else []
                old_action = self.tasks.get(task_id).nfc_action if task_id in self.tasks else None
                self.tasks[task_id] = imported_task
                if old_tags != list(imported_task.nfc_tags or []) or old_action != imported_task.nfc_action:
                    changed_nfc_task_ids.append(task_id)

        # Enforce one owner per NFC tag after import. Later tasks win so a user
        # can intentionally resolve collisions by editing/exporting order.
        seen_tags: dict[str, str] = {}
        for task_id, task in list(self.tasks.items()):
            clean_tags = []
            for tag in list(task.nfc_tags or []):
                previous_owner = seen_tags.get(tag)
                if previous_owner and previous_owner in self.tasks:
                    previous = self.tasks[previous_owner]
                    previous.nfc_tags = [t for t in (previous.nfc_tags or []) if t != tag]
                    if not previous.nfc_tags:
                        previous.nfc_action = "disabled"
                    changed_nfc_task_ids.append(previous_owner)
                seen_tags[tag] = task_id
                clean_tags.append(tag)
            task.nfc_tags = clean_tags

        if isinstance(package.get("settings"), dict):
            if mode == "replace":
                self.storage_settings = dict(package.get("settings") or {})
            else:
                self.storage_settings.update(dict(package.get("settings") or {}))

        await self.async_save()
        if changed_nfc_task_ids:
            await self._cleanup_nfc_notifications(sorted(set(changed_nfc_task_ids)))
        self._setup_tracking()
        self._notify()
        await self.async_check_notifications()
        return {
            "mode": mode,
            "imported": len(imported),
            "skipped": skipped,
            "before_tasks": len(before_ids),
            "after_tasks": len(self.tasks),
            "replaced_removed": len(before_ids - set(imported)) if mode == "replace" else 0,
        }

    def _task_entity_references(self, task_data: dict[str, Any]) -> list[dict[str, Any]]:
        """Return entity references used by a task for import preview/mapping."""
        refs: list[dict[str, Any]] = []
        for entity_id in task_data.get("linked_entities") or []:
            if entity_id:
                refs.append({"field": "linked_entities", "entity_id": str(entity_id), "required": False, "role": "linked_entity"})
        for idx, rule in enumerate(task_data.get("rules") or []):
            if isinstance(rule, dict) and rule.get("entity"):
                refs.append({
                    "field": f"rules[{idx}].entity",
                    "entity_id": str(rule.get("entity")),
                    "required": str(rule.get("type") or "") in {"runtime", "counter"},
                    "role": str(rule.get("type") or "rule_entity"),
                    "rule_id": str(rule.get("id") or idx),
                })
        return refs

    def _apply_entity_mapping_to_task_data(self, task_data: dict[str, Any], entity_mapping: dict[str, Any] | None = None) -> dict[str, Any]:
        mapping = entity_mapping or {}
        data = dict(task_data)
        linked = []
        for entity_id in data.get("linked_entities") or []:
            original = str(entity_id)
            action = mapping.get(original, original)
            if action in (None, "", "__clear__"):
                continue
            if action == "__unresolved__":
                linked.append(original)
            else:
                linked.append(str(action))
        data["linked_entities"] = linked
        rules = []
        for rule in data.get("rules") or []:
            if not isinstance(rule, dict):
                continue
            new_rule = dict(rule)
            if new_rule.get("entity"):
                original = str(new_rule.get("entity"))
                action = mapping.get(original, original)
                if action in (None, "", "__clear__"):
                    new_rule.pop("entity", None)
                    if new_rule.get("type") in ("runtime", "counter"):
                        data["paused"] = True
                elif action == "__unresolved__":
                    new_rule["entity"] = original
                    if new_rule.get("type") in ("runtime", "counter"):
                        data["paused"] = True
                else:
                    new_rule["entity"] = str(action)
            rules.append(new_rule)
        data["rules"] = rules
        return data

    def _package_tasks(self, package: dict[str, Any]) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
        """Parse a backup export or task-pack shaped package."""
        if not isinstance(package, dict):
            raise ValueError("Import data must be a JSON object")
        package_type = str(package.get("type") or package.get("format") or "backup")
        if package_type == "home_maintenance_manager_export":
            package_type = "backup"
        raw_tasks = package.get("tasks")
        if raw_tasks is None and isinstance(package.get("data"), dict):
            raw_tasks = package["data"].get("tasks")
        if not isinstance(raw_tasks, list):
            raise ValueError("Import file does not contain a tasks list")
        return package_type, raw_tasks, package

    def import_preview(self, package: dict[str, Any], mode: str = "merge") -> dict[str, Any]:
        """Preview an import without changing HMM storage."""
        package_type, raw_tasks, parsed = self._package_tasks(package)
        mode = str(mode or "merge").lower()
        existing_by_name = {((t.name or "").strip().lower(), (t.category or "General").strip().lower()): tid for tid, t in self.tasks.items()}
        entity_ids = set(self.hass.states.async_entity_ids())
        preview_tasks = []
        counts = {"new": 0, "update": 0, "duplicate": 0, "deleted": 0, "invalid": 0, "conflict": 0}
        entity_counts = {"found": 0, "missing": 0, "required_missing": 0}
        for idx, item in enumerate(raw_tasks):
            if not isinstance(item, dict) or not item.get("id") or not item.get("name"):
                row = {"index": idx, "id": str(item.get("id") if isinstance(item, dict) else idx), "name": "Invalid task", "category": "", "status": "invalid", "selected": False, "reason": "Missing required id or name", "entities": []}
                preview_tasks.append(row); counts["invalid"] += 1; continue
            task_id = str(item["id"])
            key = ((item.get("name") or "").strip().lower(), (item.get("category") or "General").strip().lower())
            if task_id in self.tasks:
                status = "update"
            elif task_id in self.deleted_task_ids:
                status = "deleted"
            elif key in existing_by_name:
                status = "duplicate"
            else:
                status = "new"
            counts[status] += 1
            refs = []
            required_missing = False
            for ref in self._task_entity_references(item):
                found = ref["entity_id"] in entity_ids
                ref = dict(ref)
                ref["status"] = "found" if found else "missing"
                ref["suggestions"] = []
                if not found:
                    domain = ref["entity_id"].split('.',1)[0] if '.' in ref["entity_id"] else ''
                    suffix = ref["entity_id"].split('.',1)[-1].replace('_',' ')[:30].lower()
                    suggestions = [e for e in sorted(entity_ids) if (not domain or e.startswith(domain+'.'))][:8]
                    ref["suggestions"] = suggestions
                    entity_counts["missing"] += 1
                    if ref.get("required"):
                        required_missing = True
                        entity_counts["required_missing"] += 1
                else:
                    entity_counts["found"] += 1
                refs.append(ref)
            selected = status in {"new", "update"} and not required_missing
            if package_type == "task_pack" and status == "deleted":
                selected = False
            preview_tasks.append({"index": idx, "id": task_id, "name": item.get("name"), "category": item.get("category", "General"), "status": status, "selected": selected, "required_entity_missing": required_missing, "entities": refs})
        return {
            "package_type": package_type,
            "pack_name": parsed.get("pack_name") or parsed.get("name") or parsed.get("format") or "HMM Import",
            "format_version": parsed.get("format_version") or parsed.get("version"),
            "exported_at": parsed.get("exported_at"),
            "mode": mode,
            "counts": counts,
            "entity_counts": entity_counts,
            "tasks": preview_tasks,
            "settings_present": isinstance(parsed.get("settings"), dict),
            "warnings": ["Required missing entities will pause affected runtime/counter tasks unless remapped."] if entity_counts["required_missing"] else [],
        }

    async def async_apply_import_preview(self, package: dict[str, Any], selected_ids: list[str] | None = None, mode: str = "merge", entity_mapping: dict[str, Any] | None = None, import_settings: bool = True, restore_deleted: bool = False) -> dict[str, Any]:
        """Apply a reviewed import selection."""
        package_type, raw_tasks, parsed = self._package_tasks(package)
        selected = {str(x) for x in (selected_ids or [])}
        if selected_ids is None:
            preview = self.import_preview(package, mode)
            selected = {str(t["id"]) for t in preview.get("tasks", []) if t.get("selected")}
        filtered_package = dict(parsed)
        tasks = []
        for item in raw_tasks:
            if isinstance(item, dict) and str(item.get("id")) in selected:
                data = self._apply_entity_mapping_to_task_data(dict(item), entity_mapping)
                if str(data.get("id")) in self.deleted_task_ids and not restore_deleted and package_type != "backup":
                    continue
                tasks.append(data)
        filtered_package["tasks"] = tasks
        if not import_settings or package_type == "task_pack":
            filtered_package.pop("settings", None)
        return await self.async_import_data(filtered_package, mode)

    async def async_save(self) -> None:
        await self.store.async_save(self.data_for_storage())

    def async_add_listener(self, listener: callable) -> callable:
        self.listeners.append(listener)
        def remove() -> None:
            if listener in self.listeners:
                self.listeners.remove(listener)
        return remove

    @callback
    def _notify(self) -> None:
        """Notify entity listeners without letting stale entities break services.

        When a task is deleted, Home Assistant may still have the old entities
        loaded until the config entry reload finishes. Those stale entities can
        raise KeyError while trying to read the deleted task. Ignore that
        transient condition so delete_task can complete cleanly.
        """
        for listener in list(self.listeners):
            try:
                listener()
            except KeyError:
                continue

    def _setup_tracking(self) -> None:
        for unsub in self._unsub:
            unsub()
        self._unsub.clear()
        entity_ids = set()
        for task in self.tasks.values():
            for rule in task.rules:
                if rule.get("type") in ("runtime", "counter") and rule.get("entity"):
                    entity_ids.add(rule["entity"])
        for entity_id in entity_ids:
            self._unsub.append(async_track_state_change_event(self.hass, entity_id, self._state_changed))
        self._unsub.append(self.hass.bus.async_listen("tag_scanned", self._tag_scanned))
        self._unsub.append(self.hass.bus.async_listen("mobile_app_notification_action", self._mobile_notification_action))
        self._unsub.append(async_track_time_interval(self.hass, self._tick, timedelta(minutes=1)))

    @callback
    def _state_changed(self, event) -> None:
        self.hass.async_create_task(self._update_runtime())

    @callback
    def _tag_scanned(self, event: Event) -> None:
        """Handle Home Assistant NFC tag scans."""
        payload = dict(event.data or {})
        if event.context and event.context.user_id:
            payload.setdefault("user_id", event.context.user_id)
        self.hass.async_create_task(self.async_handle_tag_scan(payload))

    @callback
    def _mobile_notification_action(self, event: Event) -> None:
        """Handle Home Assistant Companion App notification actions."""
        payload = dict(event.data or {})
        if event.context and event.context.user_id:
            payload.setdefault("user_id", event.context.user_id)
        self.hass.async_create_task(self.async_handle_notification_action(payload))

    async def _tick(self, now) -> None:
        await self._update_runtime()
        await self.async_check_notifications()



    def _notification_settings(self) -> dict[str, Any]:
        """Return global notification settings for the first HMM config entry."""
        return self.get_notification_settings()

    def _task_notification_mode(self, task: MaintenanceTask, settings: dict[str, Any]) -> str:
        """Resolve task/global notification mode."""
        task_mode = (task.notification_mode or "global").lower()
        if task_mode in ("disabled", "none"):
            return "none"
        if task_mode in ("persistent", "mobile", "both", "automation_only"):
            return task_mode
        # 'global' and 'custom' both use the global mode; custom can override target.
        return str(settings.get("default_mode") or "automation_only").lower()

    def _task_mobile_targets(self, task: MaintenanceTask, settings: dict[str, Any]) -> list[str]:
        """Resolve mobile notification targets for a task."""
        if task.mobile_notify_service:
            return [task.mobile_notify_service]
        targets = settings.get("mobile_notify_services") or []
        return [target for target in targets if isinstance(target, str)]

    def _quiet_time_active(self, settings: dict[str, Any]) -> bool:
        """Return true if global quiet hours are currently active."""
        start = str(settings.get("quiet_start") or "").strip()
        end = str(settings.get("quiet_end") or "").strip()
        if not start or not end:
            return False
        try:
            start_parts = [int(part) for part in start.split(":")[:2]]
            end_parts = [int(part) for part in end.split(":")[:2]]
            start_t = time(start_parts[0], start_parts[1])
            end_t = time(end_parts[0], end_parts[1])
        except (TypeError, ValueError, IndexError):
            return False
        now_t = dt_util.now().time()
        if start_t <= end_t:
            return start_t <= now_t < end_t
        return now_t >= start_t or now_t < end_t

    def _format_notification_text(self, template: str, task: MaintenanceTask, status: str) -> str:
        """Safely format a notification template."""
        values = {
            "task_name": task.name,
            "task_id": task.id,
            "status": status.replace("_", " ").title(),
            "category": task.category or "General",
            "area": task.area or "",
            "equipment_name": task.equipment_name or task.name,
        }
        try:
            return str(template).format(**values)
        except Exception:
            return f"{task.name} is {status.replace('_', ' ')}."

    async def _send_task_notification(self, task: MaintenanceTask, status: str, settings: dict[str, Any]) -> bool:
        """Send one built-in notification for a task status/activity."""
        if not settings.get("enabled", True):
            return False
        if self._quiet_time_active(settings):
            return False
        mode = self._task_notification_mode(task, settings)
        if mode in ("none", "automation_only"):
            return False

        title = self._format_notification_text(settings.get("title_template") or "[{category}] {task_name}", task, status)
        message = self._format_notification_text(settings.get("body_template") or "{task_name} is {status}.", task, status)
        sent = False

        if mode in ("persistent", "both"):
            try:
                await self.hass.services.async_call(
                    "persistent_notification",
                    "create",
                    {
                        "title": title,
                        "message": message,
                        "notification_id": f"home_maintenance_manager_{task.id}_{status}",
                    },
                    blocking=True,
                )
                sent = True
            except Exception:  # pragma: no cover - service failure should not break task updates
                _LOGGER.exception("Failed to create persistent notification for maintenance task %s", task.id)

        if mode in ("mobile", "both"):
            for target in self._task_mobile_targets(task, settings):
                if not isinstance(target, str) or not target.startswith("notify."):
                    continue
                service = target.split(".", 1)[1]
                if not self.hass.services.has_service("notify", service):
                    continue
                try:
                    await self.hass.services.async_call(
                        "notify",
                        service,
                        {"title": title, "message": message},
                        blocking=True,
                    )
                    sent = True
                except Exception:  # pragma: no cover
                    _LOGGER.exception("Failed to send mobile notification %s for maintenance task %s", target, task.id)

        return sent

    async def async_check_notifications(self) -> None:
        """Send notifications when tasks enter upcoming/due/overdue states."""
        settings = self._notification_settings()
        changed = False
        now = dt_util.utcnow()
        for task in self.tasks.values():
            status = task.status(self.hass)
            state = task.last_seen_states.setdefault("notification", {})
            previous = state.get("status")
            sent_by_status = state.setdefault("sent", {})

            should_send = False
            if status in _STATUS_EVENT_MAP and settings.get(_STATUS_EVENT_MAP[status], False):
                if previous != status and status not in ("ok", "paused", "snoozed", "unknown"):
                    should_send = True
                elif status in ("due", "overdue"):
                    repeat_mode = str(settings.get("repeat_mode") or "once")
                    if repeat_mode != "once":
                        last_sent = dt_util.parse_datetime(sent_by_status.get(status)) if sent_by_status.get(status) else None
                        days = 1 if repeat_mode == "daily" else max(int(settings.get("repeat_days") or 1), 1)
                        if last_sent and now - last_sent >= timedelta(days=days):
                            should_send = True

            if should_send and await self._send_task_notification(task, status, settings):
                sent_by_status[status] = now.isoformat()
                changed = True

            if previous != status:
                state["status"] = status
                changed = True

        if changed:
            await self.async_save()

    async def async_notify_activity(self, task: MaintenanceTask, activity: str) -> None:
        """Send optional completed/snoozed notifications."""
        settings = self._notification_settings()
        if settings.get(_STATUS_EVENT_MAP.get(activity, ""), False):
            await self._send_task_notification(task, activity, settings)

    def _rate_target_unit(self, unit: str | None) -> str:
        """Return the accumulated target unit for a rate sensor unit."""
        if not unit:
            return "units"
        u = unit.strip()
        lower = u.lower().replace(" ", "")
        for sep in ("/min", "permin", "/minute", "perminute"):
            if lower.endswith(sep):
                return u[: -len(sep.replace("per", "/"))] if sep.startswith("/") else u.split("per", 1)[0]
        for sep in ("/h", "/hr", "/hour", "perhour"):
            if lower.endswith(sep):
                return u.split("/", 1)[0] if "/" in u else u.split("per", 1)[0]
        for sep in ("/s", "/sec", "/second", "persecond"):
            if lower.endswith(sep):
                return u.split("/", 1)[0] if "/" in u else u.split("per", 1)[0]
        if lower == "w":
            return "kWh"
        return "units"

    def _integrate_rate(self, value: float, source_unit: str | None, elapsed_seconds: float) -> tuple[float, str]:
        """Convert a rate value over elapsed seconds into accumulated usage."""
        unit = (source_unit or "").strip()
        lower = unit.lower().replace(" ", "")
        if lower == "w":
            return (value * elapsed_seconds / 3600 / 1000, "kWh")
        if "/min" in lower or "permin" in lower or "/minute" in lower:
            return (value * elapsed_seconds / 60, self._rate_target_unit(unit))
        if "/h" in lower or "/hr" in lower or "/hour" in lower or "perhour" in lower:
            return (value * elapsed_seconds / 3600, self._rate_target_unit(unit))
        if "/s" in lower or "/sec" in lower or "/second" in lower or "persecond" in lower:
            return (value * elapsed_seconds, self._rate_target_unit(unit))
        # Fallback: treat as units per hour so we never silently fail, but label as units.
        return (value * elapsed_seconds / 3600, "units")

    async def _update_runtime(self) -> None:
        now = dt_util.utcnow()
        changed = False
        for task in self.tasks.values():
            for rule in task.rules:
                if not rule.get("entity"):
                    continue
                entity_id = rule["entity"]
                if getattr(task, "seasonal", None) and task.seasonal.get("enabled") and task.seasonal.get("pause_usage_when_inactive", True) and not task.season_active():
                    key = f"counter_rate:{str(rule.get('id') or entity_id)}" if rule.get("type") == "counter" else entity_id
                    task.last_seen_states[key] = {"seen_at": now.isoformat(), "running": False}
                    continue
                state = self.hass.states.get(entity_id)
                if rule.get("type") == "runtime":
                    last = task.last_seen_states.get(entity_id, {})
                    last_seen = dt_util.parse_datetime(last.get("seen_at")) if last.get("seen_at") else now
                    was_running = bool(last.get("running", False))
                    if was_running and last_seen:
                        task.runtime_seconds[entity_id] = task.runtime_seconds.get(entity_id, 0) + max((now - last_seen).total_seconds(), 0)
                        changed = True
                    running = self._is_rule_running(rule, state.state if state else None)
                    task.last_seen_states[entity_id] = {"seen_at": now.isoformat(), "running": running}
                elif rule.get("type") == "counter" and rule.get("source_mode") == "rate":
                    rule_id = str(rule.get("id") or entity_id)
                    key = f"counter_rate:{rule_id}"
                    last = task.last_seen_states.get(key, {})
                    last_seen = dt_util.parse_datetime(last.get("seen_at")) if last.get("seen_at") else None
                    try:
                        rate_value = float(state.state) if state else None
                    except (TypeError, ValueError):
                        rate_value = None
                    if last_seen and rate_value is not None:
                        elapsed = max((now - last_seen).total_seconds(), 0)
                        # Use the previous rate over the elapsed interval. If no previous
                        # numeric rate exists, initialize without adding usage.
                        prev_rate = last.get("rate")
                        try:
                            prev_rate = float(prev_rate)
                        except (TypeError, ValueError):
                            prev_rate = None
                        if prev_rate is not None and elapsed > 0:
                            source_unit = rule.get("source_unit") or (state.attributes.get("unit_of_measurement") if state else None)
                            added, target_unit = self._integrate_rate(prev_rate, source_unit, elapsed)
                            if added > 0:
                                task.totalized_usage[rule_id] = task.totalized_usage.get(rule_id, 0) + added
                                rule["target_unit"] = rule.get("target_unit") or target_unit
                                changed = True
                    task.last_seen_states[key] = {"seen_at": now.isoformat(), "rate": rate_value}
        if changed:
            await self.async_save()
            self._notify()
            await self.async_check_notifications()

    def _is_rule_running(self, rule: dict[str, Any], state_value: str | None) -> bool:
        if state_value is None or state_value in ("unknown", "unavailable"):
            return False
        if "states" in rule:
            return state_value in rule["states"]
        if "above" in rule:
            try:
                return float(state_value) > float(rule["above"])
            except (TypeError, ValueError):
                return False
        return state_value.lower() in ("on", "running", "heating", "cooling", "open")


    def _panel_task_url(self, task_id: str) -> str:
        """Return a relative URL to the Maintenance panel for a task.

        Include the task ID in both query string and hash form. Some Home Assistant
        Companion App/webview launches preserve one better than the other.
        """
        encoded = quote(str(task_id), safe="")
        return f"/home-maintenance-manager?task={encoded}#task={encoded}"

    def _scanner_label(self, event_data: dict[str, Any]) -> str | None:
        """Best-effort friendly label for the phone/device that scanned a tag."""
        if event_data.get("device_name"):
            return str(event_data.get("device_name"))
        device_id = event_data.get("device_id")
        if device_id:
            try:
                from homeassistant.helpers import device_registry as dr
                device = dr.async_get(self.hass).async_get(str(device_id))
                if device:
                    return device.name_by_user or device.name or device.model or str(device_id)
            except Exception:  # pragma: no cover - friendly label only
                return str(device_id)
        return None

    def _task_last_completed_label(self, task: MaintenanceTask) -> str:
        if not task.last_completed:
            return "Never"
        dt = dt_util.parse_datetime(task.last_completed)
        if not dt:
            return str(task.last_completed)
        delta = dt_util.utcnow() - dt
        if delta.days <= 0:
            return "Today"
        if delta.days == 1:
            return "Yesterday"
        return f"{delta.days} days ago"

    async def _dismiss_persistent_notification(self, notification_id: str) -> None:
        try:
            if self.hass.services.has_service("persistent_notification", "dismiss"):
                await self.hass.services.async_call(
                    "persistent_notification",
                    "dismiss",
                    {"notification_id": notification_id},
                    blocking=True,
                )
        except Exception:  # pragma: no cover
            _LOGGER.debug("Failed to dismiss persistent notification %s", notification_id, exc_info=True)

    async def _send_nfc_mobile_notification(self, task: MaintenanceTask, title: str, message: str, tag_id: str | None) -> bool:
        """Send actionable NFC confirmation to selected mobile notify targets."""
        settings = self._notification_settings()
        mode = self._task_notification_mode(task, settings)
        # NFC confirmation is intentionally more helpful than normal task notifications:
        # send mobile actions when mobile targets exist, even if the global mode is persistent,
        # but never send to mobile if the task explicitly disables notifications.
        if mode == "none":
            return False
        targets = self._task_mobile_targets(task, settings)
        if not targets and mode in ("mobile", "both"):
            return False
        sent = False
        url = self._panel_task_url(task.id)
        actions = [
            {"action": f"HMM_NFC_COMPLETE_{task.id}", "title": "Mark Complete"},
            {"action": f"HMM_NFC_INSPECTION_{task.id}", "title": "Inspection Only"},
            {"action": "URI", "title": "Open Task", "uri": url},
            {"action": f"HMM_NFC_DISMISS_{task.id}", "title": "Dismiss"},
        ]
        for target in targets:
            if not isinstance(target, str) or not target.startswith("notify."):
                continue
            service = target.split(".", 1)[1]
            if not self.hass.services.has_service("notify", service):
                continue
            try:
                await self.hass.services.async_call(
                    "notify",
                    service,
                    {
                        "title": title,
                        "message": message,
                        "data": {
                            "tag": f"hmm_nfc_{task.id}",
                            "url": url,
                            "clickAction": url,
                            "actions": actions,
                        },
                    },
                    blocking=True,
                )
                sent = True
            except Exception:  # pragma: no cover
                _LOGGER.exception("Failed to send NFC mobile notification %s for maintenance task %s", target, task.id)
        return sent

    async def _create_nfc_persistent_notification(self, task: MaintenanceTask, title: str, message: str, notification_id: str) -> None:
        """Create a persistent NFC notification with a panel link."""
        url = self._panel_task_url(task.id)
        try:
            await self.hass.services.async_call(
                "persistent_notification",
                "create",
                {
                    "title": title,
                    "message": f"{message}\n\nOpen **Maintenance** and select **{task.name}**. Panel link: `{url}`",
                    "notification_id": notification_id,
                },
                blocking=True,
            )
        except Exception:  # pragma: no cover
            _LOGGER.exception("Failed to create NFC persistent notification for maintenance task %s", task.id)

    async def _log_nfc_activity(self, task: MaintenanceTask, activity: str, event_data: dict[str, Any] | None = None, notes: str | None = None) -> None:
        now = dt_util.utcnow().isoformat()
        event_data = event_data or {}
        entry = {
            "at": now,
            "activity": activity,
            "method": "nfc",
            "tag_id": event_data.get("tag_id") or event_data.get("id"),
            "scanner_device_id": event_data.get("device_id"),
            "scanner_name": self._scanner_label(event_data),
            "user_id": event_data.get("user_id"),
            "notes": notes,
        }
        task.activity_history.append(entry)
        self.hass.bus.async_fire(EVENT_ACTIVITY, {"task_id": task.id, "task_name": task.name, **entry})
        await self.async_save()
        self._notify()

    async def async_handle_notification_action(self, event_data: dict[str, Any]) -> None:
        """Process action buttons from NFC mobile notifications."""
        action = str(event_data.get("action") or event_data.get("actionName") or "")
        prefixes = {
            "HMM_NFC_COMPLETE_": "complete",
            "HMM_NFC_INSPECTION_": "inspection",
            "HMM_NFC_DISMISS_": "dismissed",
        }
        matched: tuple[str, str] | None = None
        for prefix, activity in prefixes.items():
            if action.startswith(prefix):
                matched = (activity, action[len(prefix):])
                break
        if not matched:
            return
        activity, task_id = matched
        task = self.tasks.get(task_id)
        if task is None:
            return
        notification_id = f"home_maintenance_manager_nfc_confirm_{task.id}"
        if activity == "complete":
            await self.async_mark_complete(task.id, method="nfc_notification", user=event_data.get("user_id"), notes="Completed from NFC confirmation notification.")
            await self._dismiss_persistent_notification(notification_id)
            return
        if activity == "inspection":
            await self._log_nfc_activity(task, "inspection", event_data, "Inspection logged from NFC confirmation notification.")
            await self._dismiss_persistent_notification(notification_id)
            return
        if activity == "dismissed":
            await self._log_nfc_activity(task, "nfc_dismissed", event_data, "NFC confirmation dismissed from mobile notification.")
            await self._dismiss_persistent_notification(notification_id)
            return


    def _find_task_for_tag(self, tag_id: str | None) -> MaintenanceTask | None:
        if not tag_id:
            return None
        for task in self.tasks.values():
            if tag_id in (task.nfc_tags or []):
                return task
        return None

    async def async_handle_tag_scan(self, event_data: dict[str, Any]) -> None:
        """Process a Home Assistant tag_scanned event for linked maintenance tasks."""
        tag_id = event_data.get("tag_id") or event_data.get("id")
        task = self._find_task_for_tag(tag_id)
        if task is None:
            return

        action = (task.nfc_action or "confirm").lower()
        if action == "disabled":
            return

        now = dt_util.utcnow().isoformat()
        scanner_name = self._scanner_label(event_data)
        scan_entry = {
            "at": now,
            "activity": "nfc_scanned",
            "tag_id": tag_id,
            "scanner_device_id": event_data.get("device_id"),
            "scanner_name": scanner_name,
            "user_id": event_data.get("user_id"),
            "nfc_action": action,
        }
        task.activity_history.append(scan_entry)
        self.hass.bus.async_fire(EVENT_NFC_SCAN, {"task_id": task.id, "task_name": task.name, **scan_entry})
        self.hass.bus.async_fire(EVENT_ACTIVITY, {"task_id": task.id, "task_name": task.name, **scan_entry})

        if action == "complete":
            await self.async_mark_complete(task.id, method="nfc", user=event_data.get("user_id"), notes=f"Completed by NFC tag {tag_id}.")
            return

        if action == "inspection":
            task.activity_history.append({"at": now, "activity": "inspection", "method": "nfc", "tag_id": tag_id, "scanner_name": scanner_name, "user_id": event_data.get("user_id"), "notes": "Inspection logged from NFC scan."})
            await self.async_save()
            self._notify()
            return

        status = task.status(self.hass).replace("_", " ").title()
        last_completed = self._task_last_completed_label(task)
        title = f"Confirm maintenance: {task.name}" if action == "confirm" else f"Maintenance tag scanned: {task.name}"
        message = (
            f"NFC tag scanned for {task.name}.\n"
            f"Status: {status}.\n"
            f"Last completed: {last_completed}."
        )
        if scanner_name:
            message += f"\nScanned by: {scanner_name}."

        notification_id = f"home_maintenance_manager_nfc_confirm_{task.id}"

        # For Open Task, create a helpful deep-link notification instead of completing/logging only.
        if action == "open_dashboard":
            task.activity_history.append({"at": now, "activity": "nfc_open_task", "method": "nfc", "tag_id": tag_id, "scanner_name": scanner_name, "user_id": event_data.get("user_id"), "notes": "NFC scan requested opening the task."})
            await self._create_nfc_persistent_notification(task, title, message, notification_id)
            await self._send_nfc_mobile_notification(task, title, message, tag_id)
            await self.async_save()
            self._notify()
            return

        # Default/safe behavior: actionable confirmation. Persistent notifications cannot
        # render buttons, so they contain clear instructions and a panel path. Mobile app
        # notifications receive action buttons when mobile notify services are configured.
        await self._create_nfc_persistent_notification(task, title, message, notification_id)
        await self._send_nfc_mobile_notification(task, title, message, tag_id)
        await self.async_save()
        self._notify()

    async def async_mark_complete(self, task_id: str, method: str = "manual", user: str | None = None, notes: str | None = None) -> None:
        task = self.tasks[task_id]
        now = dt_util.utcnow().isoformat()
        task.last_completed = now
        task.last_completed_by = user
        task.last_completion_method = method
        task.runtime_seconds = {}
        # Reset metered-usage baselines to the current source values so usage-based
        # rules start counting from the completed maintenance event.
        for rule in task.rules:
            if rule.get("type") == "counter" and rule.get("entity"):
                state = self.hass.states.get(rule["entity"])
                if rule.get("source_mode") == "rate":
                    rule_id = str(rule.get("id") or rule.get("entity"))
                    rule["baseline"] = float(task.totalized_usage.get(rule_id, 0))
                    if state:
                        source_unit = state.attributes.get("unit_of_measurement")
                        if source_unit:
                            rule["source_unit"] = source_unit
                            rule["target_unit"] = rule.get("target_unit") or self._rate_target_unit(source_unit)
                else:
                    try:
                        rule["baseline"] = float(state.state) if state else float(rule.get("baseline") or 0)
                    except (TypeError, ValueError):
                        rule["baseline"] = float(rule.get("baseline") or 0)
                    if state and not rule.get("unit"):
                        unit = state.attributes.get("unit_of_measurement")
                        if unit:
                            rule["unit"] = unit
        entry = {"at": now, "method": method, "user": user, "notes": notes}
        task.completion_history.append(entry)
        task.activity_history.append({"type": "completed", **entry})
        self.hass.bus.async_fire(EVENT_COMPLETION, {"task_id": task.id, "task_name": task.name, **entry})
        self.hass.bus.async_fire(EVENT_ACTIVITY, {"task_id": task.id, "task_name": task.name, "activity": "completed", **entry})
        await self.async_notify_activity(task, "completed")
        await self.async_save()
        self._notify()
        await self.async_check_notifications()

    async def async_snooze(self, task_id: str, days: int) -> None:
        task = self.tasks[task_id]
        if not task.allow_snooze:
            return
        if task.max_snooze_days and days > task.max_snooze_days:
            days = task.max_snooze_days
        until = dt_util.utcnow() + timedelta(days=days)
        task.snoozed_until = until.isoformat()
        entry = {"at": dt_util.utcnow().isoformat(), "activity": "snoozed", "days": days, "until": task.snoozed_until}
        task.activity_history.append(entry)
        self.hass.bus.async_fire(EVENT_ACTIVITY, {"task_id": task.id, "task_name": task.name, **entry})
        await self.async_notify_activity(task, "snoozed")
        await self.async_save()
        self._notify()
        await self.async_check_notifications()

    async def async_add_log(self, task_id: str, activity: str, notes: str | None = None) -> None:
        task = self.tasks[task_id]
        entry = {"at": dt_util.utcnow().isoformat(), "activity": activity, "notes": notes}
        task.activity_history.append(entry)
        self.hass.bus.async_fire(EVENT_ACTIVITY, {"task_id": task.id, "task_name": task.name, **entry})
        await self.async_save()
        self._notify()

    async def async_reset_runtime(self, task_id: str) -> None:
        task = self.tasks[task_id]
        task.runtime_seconds = {}
        await self.async_add_log(task_id, "runtime_reset")
