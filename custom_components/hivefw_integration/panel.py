"""HiveFW sidebar panel registration.

Adapted from the upstream meshcore integration's panel registration.

Differences vs. upstream:
- All HTTP/sidebar URLs are scoped under `hivefw_integration` so the companion
  panel co-exists with upstream's panel if both are installed.
- Sidebar title is "HiveFW" for the HiveFW Companion+Repeater UI.
- A small wrapper loads the existing production bundle and adds HiveFW-specific UI
  until the canonical TypeScript bundle is rebuilt.
"""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.frontend import (
    add_extra_js_url,
    async_register_built_in_panel,
    async_remove_panel as frontend_async_remove_panel,
)
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

# Module-level: whether the bundle's GET route has been registered with
# aiohttp's router for THIS HA process. The static path is owned by
# `hass.http` (process-lifetime) — there is no public unregister API, and
# aiohttp raises `RuntimeError: Added route will never be executed,
# method GET is already registered` on a duplicate registration. The
# sidebar entry, by contrast, is owned by `hass.frontend` and removed on
# last-entry unload. We therefore track the two registrations on
# different lifecycles: this module-level flag persists across config-
# entry reloads (the module is imported once per process), while the
# sidebar entry is registered per `async_register_panel` call as before.
# The flag resets to False naturally on HA restart (fresh import).
_static_path_registered = False

# HTTP URL the bundle is served at; module_url below points at this path.
PANEL_URL = "/hivefw_integration_panel/hivefw-integration-panel.js"
PANEL_WRAPPER_URL = "/hivefw_integration_panel/hivefw-panel.js"
PANEL_LOGO_URL = "/hivefw_integration_panel/hivefw-wordmark.png"
PANEL_BRAND_ICON_URL = "/hivefw_integration_panel/hivefw-icon.png"
PANEL_SIDEBAR_BRAND_URL = "/hivefw_integration_panel/sidebar-brand.js"
# Filesystem paths to the production bundle, HiveFW panel wrapper and shared brand.
PANEL_FRONTEND_PATH = str(Path(__file__).parent / "hivefw-integration-panel.js")
PANEL_WRAPPER_PATH = str(Path(__file__).parent / "hivefw-panel.js")
PANEL_LOGO_PATH = str(Path(__file__).parent / "brand" / "hivefw-wordmark.png")
PANEL_BRAND_ICON_PATH = str(Path(__file__).parent / "brand" / "icon.png")
PANEL_SIDEBAR_BRAND_PATH = str(Path(__file__).parent / "sidebar-brand.js")

# Home Assistant's panel API requires an MDI identifier here. The global
# sidebar-brand module replaces this fallback with the real HiveFW brand icon
# once the frontend sidebar is mounted.
PANEL_ICON = "mdi:hexagon-multiple"
PANEL_TITLE = "HiveFW"

# Sidebar URL slug — the panel will be reachable at /hivefw in the HA UI.
PANEL_URL_PATH = "hivefw"


async def async_register_panel(hass: HomeAssistant) -> None:
    """Register the HiveFW sidebar panel.

    Static-path registration is gated on the module-level
    `_static_path_registered` flag — it runs exactly once per HA process
    lifetime, regardless of how many times the config entry is reloaded.
    The sidebar entry, by contrast, is registered per call here and torn
    down by `async_remove_panel` on last-entry unload, matching HA's
    `frontend` panel-lifecycle convention.
    """
    global _static_path_registered
    if not _static_path_registered:
        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(PANEL_URL, PANEL_FRONTEND_PATH, cache_headers=False),
                StaticPathConfig(
                    PANEL_WRAPPER_URL,
                    PANEL_WRAPPER_PATH,
                    cache_headers=False,
                ),
                StaticPathConfig(
                    PANEL_LOGO_URL,
                    PANEL_LOGO_PATH,
                    cache_headers=True,
                ),
                StaticPathConfig(
                    PANEL_BRAND_ICON_URL,
                    PANEL_BRAND_ICON_PATH,
                    cache_headers=True,
                ),
                StaticPathConfig(
                    PANEL_SIDEBAR_BRAND_URL,
                    PANEL_SIDEBAR_BRAND_PATH,
                    cache_headers=False,
                ),
            ]
        )
        add_extra_js_url(hass, PANEL_SIDEBAR_BRAND_URL)
        _static_path_registered = True
        _LOGGER.debug("Registered HiveFW panel static paths and sidebar branding")
    async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        frontend_url_path=PANEL_URL_PATH,
        config={
            "_panel_custom": {
                "name": "hivefw-panel",
                "module_url": PANEL_WRAPPER_URL,
            }
        },
        require_admin=False,
    )
    _LOGGER.debug("Registered HiveFW sidebar panel")


async def async_remove_panel(hass: HomeAssistant) -> None:
    """Remove the HiveFW sidebar panel.

    The static path registered in `async_register_panel` is intentionally
    NOT torn down — `hass.http` has no public unregister API, and aiohttp
    will reject re-registration on the next setup. The bundle URL stays
    served for the lifetime of the HA process; only the sidebar entry is
    removed. This matches HA's documented panel/static-path contract:
    static paths are process-lifetime, sidebar entries are entry-lifetime.
    """
    frontend_async_remove_panel(hass, PANEL_URL_PATH)
    _LOGGER.debug("Removed HiveFW sidebar panel")
