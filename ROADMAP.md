# HiveFW Unified Integration Roadmap

This roadmap is the source of truth for the standalone HiveFW Home Assistant integration.
Do not remove completed items; mark them complete and link the implementing commit.

## Goal

One Home Assistant integration only: **HiveFW**.

- HiveFW owns the TCP / BLE / USB connection to the radio.
- No installed `meshcore-ha` integration is required.
- All user-facing services, entities, events, config flows and UI use the HiveFW name/domain.
- The MeshCore Python protocol/library remains an implementation dependency only.
- Existing HiveFW UI/features must not regress during the migration.
- `main-stable` is the rollback point created before the standalone migration.

## Phase 0 — Safety

- [x] Freeze pre-migration build in `main-stable` at `abea27f18f638c4edc1c5f29a931838b3e15feca`.
- [x] Start embedded radio-engine migration on `main` (`0ca722415146540ee85d98b16f04eaf32d61f9b6`).
- [ ] Keep this roadmap and `MIGRATION_STATUS.md` updated after every functional commit.
- [ ] Add upstream attribution / embedded engine SHA.

## Phase 1 — Standalone HiveFW engine

- [x] Vendor the radio engine used by the current upstream MeshCore HA integration.
- [x] Remove manifest dependency on an installed `meshcore` integration.
- [x] Add runtime requirements directly to HiveFW.
- [x] Make HiveFW config flow configure TCP / BLE / USB directly.
- [x] Start / stop the embedded engine from the HiveFW config entry.
- [ ] Remove remaining assumptions that an external `meshcore` domain/config entry exists.
- [ ] Ensure all engine imports are internal to `hivefw_integration.engine`.
- [ ] Forward HA platforms from HiveFW: sensor, binary_sensor, device_tracker, button, select, text.
- [ ] Verify map uploader, MQTT uploader, telemetry, neighbors, diagnostics and repeater subscriptions under the HiveFW config entry.
- [ ] Verify clean unload/reload and reconnect behavior.

## Phase 2 — HiveFW public surface

Everything user-facing must be HiveFW; do not keep legacy service naming just for compatibility.

- [ ] Services use `hivefw_integration.*`.
- [ ] Events use `hivefw_integration_*`.
- [ ] Helper entities use HiveFW names / IDs.
- [ ] Device names/manufacturer/model wording use HiveFW where appropriate.
- [ ] Static resource paths use `/api/hivefw/...`.
- [ ] Service YAML descriptions use HiveFW wording.
- [ ] Remove stale UI/help text that says the external MeshCore integration must be installed.
- [ ] Keep “MeshCore” only where it identifies the protocol/ecosystem/SDK rather than the installed HA integration.

## Phase 3 — Preserve current HiveFW functionality

Regression checklist:

- [ ] Chat & Channels.
- [ ] Message persistence/search/unread state.
- [ ] Nodes split view and map.
- [ ] Dynamic local repeater matching.
- [ ] Contact add/remove from map popup.
- [ ] Contact import/export.
- [ ] Favorites and local tags.
- [ ] Persistent node popup.
- [ ] Trace dialog and last Trace route on map.
- [ ] Trace Monitor with persistent route-health history.
- [ ] RX Log viewer/export.
- [ ] Neighbors page.
- [ ] Device metrics and editable metric menu.
- [ ] HA entity More Info deep links.
- [ ] Local/Flood advert, Sync Clock, Trace, Reboot.
- [ ] Repeater scopes/regions/settings.
- [ ] Device/repeater/client management.
- [ ] Self telemetry/diagnostics.
- [ ] MQTT/map upload options.
- [ ] Existing HiveFW message-retention settings.

## Phase 4 — Console tab

- [ ] Add top-level **Console** tab.
- [ ] Move console/CLI controls out of Device.
- [ ] Free-form command input.
- [ ] Run command button and Enter-to-submit.
- [ ] Transcript with command, response, timestamp and errors.
- [ ] Clear transcript.
- [ ] Command history (Up/Down).
- [ ] Useful command shortcuts / command palette.
- [ ] Per-selected-device execution.
- [ ] Explicit warning for commands that can modify persistent node settings.

## Phase 5 — Map / topology / route intelligence

- [ ] Node-age colors: <1h, <6h, <24h, <7d, stale.
- [ ] Filters: all, active 24h, repeaters, clients, favorites, GPS, stale.
- [ ] Route History, not only latest Trace.
- [ ] Path history per message and “Show on map”.
- [ ] Peer RX/TX counts and link volume.
- [ ] Hop-to-hop distance and cumulative route distance.
- [ ] Topology graph with SNR/activity-driven links.
- [ ] Activity heatmap (clearly label source: RX/message/trace/contact activity).
- [ ] Preserve conservative hash resolution: never guess ambiguous path hashes.
- [ ] Optional LOS tool with elevation/Fresnel profile once a suitable data source is selected.

## Phase 6 — Contacts / channels / sharing

- [ ] Complete channel manager: create/edit/remove.
- [ ] Channel QR.
- [ ] Contact QR / share URI.
- [ ] Contact bulk cleanup by stale age.
- [ ] Cleanup protections for favorites, added contacts, configured repeaters and protected tags.
- [ ] Bulk selection/actions.
- [ ] Search by name/public key/tag.

## Phase 7 — Repeater administration

- [ ] Remote repeater login.
- [ ] Remote status / telemetry / neighbors.
- [ ] Path discovery.
- [ ] Trace and Route Health.
- [ ] Repeater admin CLI/console.
- [ ] Firmware/version status.
- [ ] Password stored only in HA config data and never exposed in frontend payloads.

## Phase 8 — Observability

Already implemented before standalone migration and must be preserved/enhanced:

- [x] RF Health.
- [x] Airtime.
- [x] Reliability.
- [x] Integrity / duplicate / error metrics.
- [x] Current traffic rates.
- [x] Network activity / first-seen.
- [x] Health alerts.
- [x] 48h HA Recorder mini-history.
- [x] RX Log.
- [x] Trace Monitor / Route Health samples.
- [ ] Per-peer long-term health trends.
- [ ] Configurable alert thresholds.
- [ ] Optional HA notifications/automations for meaningful health transitions.

## Phase 9 — Validation / release

- [ ] Python import/compile checks.
- [ ] Frontend build/typecheck.
- [ ] Home Assistant integration validation.
- [ ] Fresh install test with no `meshcore-ha` installed.
- [ ] TCP/Wi-Fi test.
- [ ] BLE test.
- [ ] USB test where available.
- [ ] Multi-entry/device switching test.
- [ ] Restart/reload test.
- [ ] Verify no duplicate radio connections.
- [ ] Verify no external MeshCore HA integration is required.
- [ ] Update README/install/upgrade instructions.
- [ ] Release standalone HiveFW integration.
