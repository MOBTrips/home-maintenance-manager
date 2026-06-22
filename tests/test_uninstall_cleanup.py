from __future__ import annotations

from pathlib import Path
import asyncio
import importlib.util
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = "hmm_cleanup_test"
MISSING = object()
STUB_MODULES = [
    "voluptuous",
    "homeassistant",
    "homeassistant.config_entries",
    "homeassistant.const",
    "homeassistant.core",
    "homeassistant.helpers",
    "homeassistant.helpers.config_validation",
    "homeassistant.helpers.selector",
    "homeassistant.helpers.storage",
    "homeassistant.helpers.entity_registry",
    "homeassistant.helpers.device_registry",
    "homeassistant.components",
    "homeassistant.components.websocket_api",
    "homeassistant.components.frontend",
    "homeassistant.components.http",
    PACKAGE,
    f"{PACKAGE}.const",
    f"{PACKAGE}.coordinator",
    f"{PACKAGE}.models",
]


class FakeStore:
    removed: list[tuple[int, str]] = []

    def __init__(self, hass, version: int, key: str) -> None:
        self.version = version
        self.key = key

    async def async_remove(self) -> None:
        self.removed.append((self.version, self.key))


class FakeConfigEntries:
    def __init__(self, unload_ok: bool = True) -> None:
        self.unload_ok = unload_ok
        self.entries = [FakeEntry()]
        self.calls: list[tuple[str, str | None]] = []

    async def async_unload_platforms(self, entry, platforms) -> bool:
        return self.unload_ok

    def async_entries(self, domain: str):
        return self.entries

    async def async_unload(self, entry_id: str) -> bool:
        self.calls.append(("unload", entry_id))
        return self.unload_ok

    async def async_setup(self, entry_id: str) -> None:
        self.calls.append(("setup", entry_id))

    async def async_reload(self, entry_id: str) -> None:
        self.calls.append(("reload", entry_id))


class FakeEntry:
    entry_id = "entry-1"
    options = {}


class FakeEntityEntry:
    def __init__(
        self,
        entity_id: str,
        config_entry_id: str,
        unique_id: str = "",
        device_id: str | None = None,
    ) -> None:
        self.entity_id = entity_id
        self.config_entry_id = config_entry_id
        self.unique_id = unique_id
        self.device_id = device_id


class FakeEntityRegistry:
    def __init__(self) -> None:
        self.entries = [
            FakeEntityEntry("sensor.hmm_task_status", "entry-1"),
            FakeEntityEntry("button.hmm_task_complete", "entry-1"),
            FakeEntityEntry("sensor.other_integration", "other-entry"),
        ]
        self.removed: list[str] = []

    def async_remove(self, entity_id: str) -> None:
        self.removed.append(entity_id)


class FakeDevice:
    def __init__(self, device_id: str, identifiers: set[tuple[str, str]]) -> None:
        self.id = device_id
        self.identifiers = identifiers


class FakeDeviceRegistry:
    def __init__(self) -> None:
        self.devices = {
            "task-device": FakeDevice("task-device", {("home_maintenance_manager", "task-1")}),
            "manager-device": FakeDevice("manager-device", {("home_maintenance_manager", "manager")}),
            "other-device": FakeDevice("other-device", {("light", "abc123")}),
        }
        self.removed: list[str] = []

    def async_remove_device(self, device_id: str) -> None:
        self.removed.append(device_id)
        self.devices.pop(device_id, None)

    def async_get_device(self, identifiers: set[tuple[str, str]]):
        for device in self.devices.values():
            if identifiers.intersection(device.identifiers):
                return device
        return None

    def async_get(self, device_id: str):
        return self.devices.get(device_id)


class FakeHass:
    def __init__(self) -> None:
        self.data = {"home_maintenance_manager": {"entry-1": object()}}
        self.config_entries = FakeConfigEntries()
        self.entity_registry = FakeEntityRegistry()
        self.device_registry = FakeDeviceRegistry()


class FakeConnection:
    def __init__(self) -> None:
        self.result = None
        self.error = None

    def send_result(self, msg_id: int, result) -> None:
        self.result = result

    def send_error(self, msg_id: int, code: str, message: str) -> None:
        self.error = (code, message)


class FakeTask:
    def __init__(self, task_id: str, name: str) -> None:
        self.id = task_id
        self.name = name


class FakeCoordinator:
    def __init__(self) -> None:
        self.tasks = {
            "task-1": FakeTask("task-1", "Filter"),
            "task-2": FakeTask("task-2", "Pump"),
        }
        self.deleted: list[str] = []

    async def async_delete_task(self, task_id: str) -> None:
        self.deleted.append(task_id)
        del self.tasks[task_id]


def install_homeassistant_stubs() -> None:
    ha = types.ModuleType("homeassistant")
    config_entries = types.ModuleType("homeassistant.config_entries")
    const = types.ModuleType("homeassistant.const")
    core = types.ModuleType("homeassistant.core")
    helpers = types.ModuleType("homeassistant.helpers")
    config_validation = types.ModuleType("homeassistant.helpers.config_validation")
    selector = types.ModuleType("homeassistant.helpers.selector")
    storage = types.ModuleType("homeassistant.helpers.storage")
    entity_registry = types.ModuleType("homeassistant.helpers.entity_registry")
    device_registry = types.ModuleType("homeassistant.helpers.device_registry")
    components = types.ModuleType("homeassistant.components")
    websocket_api = types.ModuleType("homeassistant.components.websocket_api")
    frontend = types.ModuleType("homeassistant.components.frontend")
    http = types.ModuleType("homeassistant.components.http")

    class HomeAssistant:
        pass

    class ConfigEntry:
        pass

    class StaticPathConfig:
        def __init__(self, *args, **kwargs) -> None:
            pass

    def identity(value):
        return value

    def ensure_list(value):
        return value if isinstance(value, list) else [value]

    def decorator(*args, **kwargs):
        return identity

    def async_entries_for_config_entry(registry: FakeEntityRegistry, entry_id: str):
        return [entry for entry in registry.entries if entry.config_entry_id == entry_id]

    config_entries.ConfigEntry = ConfigEntry
    const.CONF_NAME = "name"
    core.HomeAssistant = HomeAssistant
    core.callback = identity
    config_validation.string = lambda value: str(value)
    config_validation.ensure_list = ensure_list
    config_validation.entity_id = lambda value: str(value)
    config_validation.boolean = lambda value: bool(value)
    selector.__all__ = []
    storage.Store = FakeStore
    entity_registry.async_get = lambda hass: hass.entity_registry
    entity_registry.async_entries_for_config_entry = async_entries_for_config_entry
    device_registry.async_get = lambda hass: hass.device_registry
    websocket_api.websocket_command = decorator
    websocket_api.async_response = identity
    websocket_api.async_register_command = lambda *args, **kwargs: None
    frontend.async_register_built_in_panel = None
    http.StaticPathConfig = StaticPathConfig

    sys.modules["homeassistant"] = ha
    sys.modules["homeassistant.config_entries"] = config_entries
    sys.modules["homeassistant.const"] = const
    sys.modules["homeassistant.core"] = core
    sys.modules["homeassistant.helpers"] = helpers
    sys.modules["homeassistant.helpers.config_validation"] = config_validation
    sys.modules["homeassistant.helpers.selector"] = selector
    sys.modules["homeassistant.helpers.storage"] = storage
    sys.modules["homeassistant.helpers.entity_registry"] = entity_registry
    sys.modules["homeassistant.helpers.device_registry"] = device_registry
    sys.modules["homeassistant.components"] = components
    sys.modules["homeassistant.components.websocket_api"] = websocket_api
    sys.modules["homeassistant.components.frontend"] = frontend
    sys.modules["homeassistant.components.http"] = http


def install_voluptuous_stub() -> None:
    vol = types.ModuleType("voluptuous")

    class Schema:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __call__(self, value):
            return value

    vol.Schema = Schema
    vol.Required = lambda key, *args, **kwargs: key
    vol.Optional = lambda key, *args, **kwargs: key
    vol.All = lambda *args, **kwargs: (lambda value: value)
    vol.Any = lambda *args, **kwargs: (lambda value: value)
    vol.In = lambda *args, **kwargs: (lambda value: value)
    vol.Coerce = lambda fn: fn
    vol.ALLOW_EXTRA = object()
    sys.modules["voluptuous"] = vol


def load_hmm_module():
    original_modules = {name: sys.modules.get(name, MISSING) for name in STUB_MODULES}
    install_voluptuous_stub()
    install_homeassistant_stubs()
    FakeStore.removed = []

    const_module = types.ModuleType(f"{PACKAGE}.const")
    const_module.DOMAIN = "home_maintenance_manager"
    const_module.PLATFORMS = ["sensor", "binary_sensor", "button"]
    const_module.CONF_TASKS = "tasks"
    const_module.STORAGE_VERSION = 2
    const_module.STORAGE_KEY = "home_maintenance_manager"
    const_module.LEGACY_STORAGE_VERSION = 1
    const_module.LEGACY_STORAGE_KEY = "home_maintenance_manager.tasks"
    const_module.SERVICE_MARK_COMPLETE = "mark_complete"
    const_module.SERVICE_SNOOZE = "snooze"
    const_module.SERVICE_ADD_LOG = "add_log"
    const_module.SERVICE_RESET_RUNTIME = "reset_runtime"
    const_module.SERVICE_UPSERT_TASK = "upsert_task"
    const_module.SERVICE_DELETE_TASK = "delete_task"

    coordinator_module = types.ModuleType(f"{PACKAGE}.coordinator")
    coordinator_module.MaintenanceCoordinator = object

    models_module = types.ModuleType(f"{PACKAGE}.models")
    models_module.MaintenanceTask = object

    sys.modules[f"{PACKAGE}.const"] = const_module
    sys.modules[f"{PACKAGE}.coordinator"] = coordinator_module
    sys.modules[f"{PACKAGE}.models"] = models_module

    spec = importlib.util.spec_from_file_location(
        PACKAGE,
        ROOT / "custom_components" / "home_maintenance_manager" / "__init__.py",
        submodule_search_locations=[str(ROOT / "custom_components" / "home_maintenance_manager")],
    )
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[PACKAGE] = module
    spec.loader.exec_module(module)
    return module, original_modules


def restore_modules(original_modules: dict[str, object]) -> None:
    for name, module in original_modules.items():
        if module is MISSING:
            sys.modules.pop(name, None)
        else:
            sys.modules[name] = module


class UninstallCleanupTests(unittest.TestCase):
    def test_bulk_delete_websocket_deletes_existing_tasks_and_cleans_registry(self) -> None:
        module, original_modules = load_hmm_module()
        try:
            coordinator = FakeCoordinator()
            hass = FakeHass()
            hass.data = {"home_maintenance_manager": {"entry-1": coordinator}}
            hass.entity_registry.entries = [
                FakeEntityEntry("sensor.filter_status", "entry-1", "task-1_status", "task-device-1"),
                FakeEntityEntry("button.pump_complete", "entry-1", "task-2_complete", "task-device-2"),
            ]
            hass.device_registry.devices = {
                "task-device-1": FakeDevice("task-device-1", {("home_maintenance_manager", "task-1")}),
                "task-device-2": FakeDevice("task-device-2", {("home_maintenance_manager", "task-2")}),
            }
            connection = FakeConnection()

            asyncio.run(
                module.websocket_bulk_delete_tasks(
                    hass,
                    connection,
                    {"id": 1, "type": "home_maintenance_manager/bulk_delete_tasks", "task_ids": ["task-1", "task-2"]},
                )
            )

            self.assertIsNone(connection.error)
            self.assertEqual(
                connection.result,
                {
                    "deleted": [{"id": "task-1", "name": "Filter"}, {"id": "task-2", "name": "Pump"}],
                    "failed": [],
                },
            )
            self.assertEqual(coordinator.deleted, ["task-1", "task-2"])
            self.assertEqual(hass.entity_registry.removed, ["sensor.filter_status", "button.pump_complete"])
            self.assertEqual(sorted(hass.device_registry.removed), ["task-device-1", "task-device-2"])
            self.assertEqual(hass.config_entries.calls, [("unload", "entry-1"), ("setup", "entry-1")])
        finally:
            restore_modules(original_modules)

    def test_bulk_delete_websocket_reports_missing_tasks_without_deleting_tombstones(self) -> None:
        module, original_modules = load_hmm_module()
        try:
            coordinator = FakeCoordinator()
            hass = FakeHass()
            hass.data = {"home_maintenance_manager": {"entry-1": coordinator}}
            connection = FakeConnection()

            asyncio.run(
                module.websocket_bulk_delete_tasks(
                    hass,
                    connection,
                    {"id": 1, "type": "home_maintenance_manager/bulk_delete_tasks", "task_ids": ["task-1", "missing"]},
                )
            )

            self.assertIsNone(connection.error)
            self.assertEqual(connection.result["deleted"], [{"id": "task-1", "name": "Filter"}])
            self.assertEqual(connection.result["failed"], [{"id": "missing", "name": "missing", "error": "Task was not found"}])
            self.assertEqual(coordinator.deleted, ["task-1"])
            self.assertIn("task-2", coordinator.tasks)
        finally:
            restore_modules(original_modules)

    def test_unload_entry_preserves_storage(self) -> None:
        module, original_modules = load_hmm_module()
        try:
            hass = FakeHass()

            unload_ok = asyncio.run(module.async_unload_entry(hass, FakeEntry()))

            self.assertTrue(unload_ok)
            self.assertEqual(FakeStore.removed, [])
            self.assertNotIn("entry-1", hass.data["home_maintenance_manager"])
        finally:
            restore_modules(original_modules)

    def test_remove_entry_clears_storage_and_hmm_registry_artifacts(self) -> None:
        module, original_modules = load_hmm_module()
        try:
            hass = FakeHass()

            asyncio.run(module.async_remove_entry(hass, FakeEntry()))

            self.assertEqual(
                FakeStore.removed,
                [(2, "home_maintenance_manager"), (1, "home_maintenance_manager.tasks")],
            )
            self.assertEqual(
                hass.entity_registry.removed,
                ["sensor.hmm_task_status", "button.hmm_task_complete"],
            )
            self.assertEqual(
                sorted(hass.device_registry.removed),
                ["manager-device", "task-device"],
            )
            self.assertIn("other-device", hass.device_registry.devices)
        finally:
            restore_modules(original_modules)


if __name__ == "__main__":
    unittest.main()
