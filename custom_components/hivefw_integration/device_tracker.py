"""HiveFW device tracker platform backed by the integrated MeshCore engine."""
from .engine.device_tracker import async_setup_entry

__all__ = ["async_setup_entry"]
