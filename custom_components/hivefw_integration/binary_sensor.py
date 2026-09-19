"""HiveFW binary sensor platform backed by the integrated MeshCore engine."""
from .engine.binary_sensor import async_setup_entry

__all__ = ["async_setup_entry"]
