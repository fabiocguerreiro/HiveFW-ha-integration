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
2. User-facing calls must be HiveFW, e.g. `hivefw_integration.send_channel_message`; do **not** keep `meshcore.send_channel_message` just for legacy compatibility.
3. It is fine to use the MeshCore Python SDK/protocol internally.
4. Do not lose any current HiveFW frontend or message/map functionality.
5. New top-level **Console** tab:
   - remove/move console controls from Device;
   - free-form command entry;
   - transcript;
   - command history and shortcuts.
6. All previously proposed enhancements are retained in `ROADMAP.md`.

## Known incomplete areas after 0ca7224

- Embedded engine still needs a full audit for stale imports and user-visible “MeshCore integration” naming.
- HA platform modules are inside `engine/`, but the HiveFW integration still needs explicit forwarding/wrappers so HA loads them under the HiveFW config entry.
- `services.yaml` must be copied/adapted to HiveFW and all services must be registered under `hivefw_integration`.
- Strings/translations must be merged with the embedded config/options flow.
- Existing HiveFW code that previously looked for external coordinators must be simplified to use its own embedded coordinator.
- Attribution/upstream SHA has not yet been committed.
- Console tab has not yet been implemented.
- End-to-end compile/build validation is not yet complete.

## NEXT STEP

**Commit 2: finish embedded engine wiring.**

Specifically:

1. Audit every file in `custom_components/hivefw_integration/engine/` for:
   - `custom_components.meshcore` imports;
   - stale external-domain assumptions;
   - services/events/entity IDs that still expose the old integration name.
2. Add top-level HiveFW platform wrappers for:
   - `sensor.py`
   - `binary_sensor.py`
   - `device_tracker.py`
   - `button.py`
   - `select.py`
   - `text.py`
3. Forward those platforms from the HiveFW engine setup.
4. Commit.
5. Update this status with the new commit SHA and next step.

After that:

- Commit 3: services + service YAML + HiveFW naming.
- Commit 4: config/options strings/translations + attribution.
- Commit 5: remove external-integration assumptions from HiveFW backend/WS.
- Commit 6: Console tab.
- Commit 7+: roadmap features in small functional commits.
