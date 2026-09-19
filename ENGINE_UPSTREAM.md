# Embedded MeshCore engine

HiveFW embeds an adapted snapshot of `meshcore-dev/meshcore-ha` so the Home Assistant
installation only needs the `hivefw_integration` custom integration.

- Upstream repository: https://github.com/meshcore-dev/meshcore-ha
- Upstream commit: `0f99da64be8a0ab6eacd4e87246f2a70e624f2b6`
- Upstream integration version at import: 2.10.0
- License: MIT

Compatibility policy:

- The embedded engine intentionally retains the public `meshcore.*` service/event namespace.
- Existing `sensor.meshcore_*`, `binary_sensor.meshcore_*`, device identifiers and automations
  are treated as compatibility API and should not be renamed without a migration.
- HiveFW-specific APIs use `hivefw_integration/*` WebSocket types and may also expose
  `hivefw_integration.*` service aliases.
- Upstream changes should be synced into `custom_components/hivefw_integration/engine/`
  as a reviewable vendor update, keeping HiveFW UI/storage code outside that directory.
