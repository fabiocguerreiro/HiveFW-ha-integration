"""Internal MeshCore engine vendored for the unified HiveFW integration.

The engine intentionally retains the public MeshCore service/event/entity
namespace while the Home Assistant config-entry domain is hivefw_integration.
This preserves existing dashboards and automations.
"""

from .coordinator import MeshCoreDataUpdateCoordinator
from .meshcore_api import MeshCoreAPI

__all__ = ["MeshCoreDataUpdateCoordinator", "MeshCoreAPI"]
