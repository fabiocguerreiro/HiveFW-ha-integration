# HiveFW Standalone Migration Status

**Rule:** after every functional commit, update this file in a follow-up progress commit or as part of the next atomic commit. If work is interrupted, resume from **NEXT STEP** below; do not restart completed work.

## Safety / branches

- Stable rollback branch: `main-stable`
- Stable rollback commit: `abea27f18f638c4edc1c5f29a931838b3e15feca`
- Active development branch: `main`

## Current completed migration commit

`0ca722415146540ee85d98b16f04eaf32d61f9b6` — **Make HiveFW own the MeshCore radio engine**

What it already did:

- Embedded the upstream radio-engine modules under `custom_components/hivefw_integration/engine/`.
- Removed the external `meshcore` manifest dependency.
- Added the MeshCore SDK/runtime Python requirements directly to HiveFW.
- Changed HiveFW to a device/local-polling integration.
- Changed embedded engine `DOMAIN` to `hivefw_integration`.
- Started/stopped the embedded engine from HiveFW's own config entry.
- Replaced the old “external MeshCore integration required” config flow with the embedded engine config flow.
- Added HiveFW message-storage settings to the embedded options flow.
- Began renaming engine storage/static paths/events from MeshCore-integration naming to HiveFW naming.

## Important user requirements

1. Only **HiveFW** remains installed/configured in Home Assistant.
2. This is a **clean install** migration. No backward compatibility with old
   `meshcore` / prior HiveFW installations is required.
3. User-facing calls must be HiveFW, e.g. `hivefw_integration.send_channel_message`;
   do not retain `meshcore.*` public aliases or legacy IDs.
4. It is fine to use the MeshCore Python SDK/protocol internally.
5. Do not lose any current HiveFW frontend or message/map functionality.
6. New top-level **Console** tab:
   - remove/move console controls from Device;
   - free-form command entry;
   - transcript;
   - command history and shortcuts.
7. All previously proposed enhancements are retained in `ROADMAP.md`.

## Known incomplete areas after 0ca7224

- [x] Embedded engine audited: no stale `custom_components.meshcore` imports or old public service/helper/event IDs remain.
- [x] HA platform wrappers exist at the HiveFW top level for sensor, binary_sensor, device_tracker, button, select and text.
- [x] `services.yaml` and runtime service registration use `hivefw_integration`.
- [x] Public strings/translations no longer require or advertise a second integration.
- Existing HiveFW code that previously looked for external coordinators must be simplified to use its own embedded coordinator.
- [x] Attribution is in `THIRD_PARTY_LICENSES.md`; upstream SHA is pinned in `engine/UPSTREAM_SHA`.
- Console tab has not yet been implemented.
- End-to-end compile/build validation is not yet complete.

## Latest completed step

Public surface naming converted to HiveFW: services domain, service descriptions, helper names/IDs, config/help strings and coordinator-facing errors.

## Latest completed step

Removed the remaining external-integration assumption from the backend/WS
readiness path. HiveFW now treats the embedded radio engine as its own
coordinator source, and the repair surface uses a HiveFW-native
`radio_engine_unavailable` issue. The project policy explicitly targets clean
installs only; no old `meshcore.*` public compatibility surface is required.

## NEXT STEP

**Next commit: remove obsolete install-migration/legacy-compatibility code from the embedded engine and top-level backend.**

Specifically:

1. Remove config-entry migrations that only exist for old meshcore-ha installs.
2. Remove legacy service/version fallback branches that cannot occur in a clean HiveFW install.
3. Audit public service/event/entity identifiers so only HiveFW names remain.
4. Validate the fresh config-flow -> coordinator -> platforms -> services path.

After that:

- Next commit: Console tab.
- Following commits: roadmap features in small functional commits.
