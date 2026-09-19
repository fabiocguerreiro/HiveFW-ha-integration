# Embedded MeshCore engine

HiveFW embeds an adapted snapshot of `meshcore-dev/meshcore-ha` so Home Assistant
only needs the `hivefw_integration` custom integration.

- Upstream repository: https://github.com/meshcore-dev/meshcore-ha
- Upstream commit: `0f99da64be8a0ab6eacd4e87246f2a70e624f2b6`
- Upstream integration version at import: 2.10.0
- License: MIT

## Integration policy

- The MeshCore Python SDK/protocol remains an internal implementation detail.
- The public Home Assistant domain is `hivefw_integration`.
- No compatibility layer for a previously installed `meshcore` Home Assistant
  integration is required: HiveFW is installed cleanly as the only integration.
- Services, events, entities, config flow, coordinator ownership, message storage,
  WebSocket APIs and frontend all belong to the same HiveFW config entry.
- Upstream changes should be synced into
  `custom_components/hivefw_integration/engine/` as reviewable vendor updates,
  preserving HiveFW-specific adaptations and attribution.
