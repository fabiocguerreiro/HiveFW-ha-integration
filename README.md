<p align="center">
  <img src="custom_components/hivefw_integration/brand/hivefw-wordmark.png" alt="HiveFW" width="420">
</p>

# HiveFW

**HiveFW** is a Home Assistant interface designed specifically for
[HiveFW Companion-Repeater](https://github.com/fabiocguerreiro/HiveFW-Companion-Repeater).

HiveFW is unusual by MeshCore standards: it is a **Companion first**, with an integrated
**Repeater mode** that can be enabled while the device continues to provide the Companion
connection used by Home Assistant. Because of that Client-Repeater architecture, the
normal MeshCore Repeater management interfaces do not expose everything that is useful
for a HiveFW node.

This integration turns Home Assistant into the management and monitoring point for that
device while keeping the MeshCore functions that still matter: **chat, channels, nodes,
contacts, traces and direct neighbours**.

## Main interface

The sidebar panel is organised around four practical areas:

### Dispositivo

The default view and HiveFW control centre.

It includes a compact cockpit with live information from both `meshcore-ha` entities and
the Companion protocol, including, when available:

- battery percentage and voltage
- temperature
- RSSI and SNR
- integrated Repeater state
- uptime
- HiveFW internal clock and clock drift
- noise floor
- TX queue
- TX/RX airtime
- sent/received message counters
- request-rate tokens
- discovered contacts
- storage usage
- radio fault health
- location
- hardware model and firmware build
- Companion protocol version
- Path Hash mode
- contact/channel capacity
- allowed Repeater frequencies

The same page contains the configuration that is meaningful for HiveFW:

- Repeater mode on/off
- frequency, bandwidth, spreading factor and coding rate
- TX power
- Path Hash mode
- Multi ACKs
- RX delay and airtime factor
- advertised location
- managed MeshCore devices exposed by the upstream integration

Operational actions are intentionally limited to real actions rather than information
queries:

- **Local Advert**
- **Flood Advert**
- **Sync Clock**
- **Trace**
- **Reboot**

Device information, telemetry, battery/storage and supported Repeater frequencies are
loaded automatically and do not need separate query buttons.

### Chat & Canais

Keeps the original practical reason for using a Companion with Home Assistant:

- channel conversations
- direct messages
- persistent message history
- unread state
- delivery information
- message search
- route metadata
- channel/contact management

### Nós

Network contact/discovery view for the nodes known by the Companion.

It remains useful for:

- Added vs discovered contacts
- Clients vs Repeaters
- last-heard information
- search and filtering
- node details
- path traces
- contact management

### Vizinhos

HiveFW-oriented direct-neighbour view.

The integration queries the existing Companion **Advert Path** cache and treats a
Repeater as a direct neighbour when its last advert has `path_len == 0`.

This provides a useful zero-hop view **without requiring a custom HiveFW protocol
extension and without transmitting a LoRa packet just to refresh the page**.

The current firmware/API does not expose per-neighbour SNR through this query, so the UI
does not invent one.

## Why this integration exists

The upstream [meshcore-ha](https://github.com/meshcore-dev/meshcore-ha) integration is
still the component that connects Home Assistant to MeshCore and provides the core
entities/services.

HiveFW builds on top of it and adds a UI/workflow specifically for a
HiveFW Companion-Repeater:

```text
Home Assistant
      │
      ├── meshcore-ha
      │      │
      │      └── Wi-Fi Companion connection
      │
      └── HiveFW
             │
             ├── HiveFW device cockpit
             ├── Repeater configuration
             ├── Chat & channels
             ├── Nodes / contacts
             └── Zero-hop neighbours

                    │
                    ▼
            HiveFW Companion-Repeater
```

The intended primary connection for this project is **Wi-Fi**. BLE-specific information
such as the BLE PIN is deliberately not presented in the HiveFW management UI.

## Requirements

- Home Assistant 2024.12 or newer
- [meshcore-ha](https://github.com/meshcore-dev/meshcore-ha) installed and configured
- a MeshCore Companion reachable by Home Assistant
- for the full intended feature set: **HiveFW Companion-Repeater**

The integration can still display ordinary MeshCore data exposed by `meshcore-ha`, but
the device-management workflow and terminology are designed around HiveFW.

## Installation with HACS

Add this repository as a custom HACS integration:

```text
https://github.com/fabiocguerreiro/HiveFW-ha-integration
```

Then:

1. HACS → Integrations → Custom repositories.
2. Add the URL above as **Integration**.
3. Install **HiveFW**.
4. Restart Home Assistant when the update includes Python/backend changes.
5. Settings → Devices & Services → Add Integration → **HiveFW**.
6. Open **HiveFW** from the Home Assistant sidebar.

For frontend-only releases, a browser hard refresh is normally sufficient after HACS has
updated the files.

## Existing installations

The repository and visible integration were renamed, but the internal domain remains:

```text
hivefw_integration
```

This is intentional. Changing the domain would make Home Assistant treat it as a new
integration and could break existing config entries, stored chat history and settings.

The panel URL also remains compatible with existing installations.

## Path Hash accuracy

HiveFW does not include `path_hash_mode` in `SELF_INFO`.

The integration therefore reads Path Hash from `DEVICE_QUERY / DEVICE_INFO`, which is
the protocol response where HiveFW actually reports `_prefs.path_hash_mode`.

This avoids the previous behaviour where the UI could incorrectly display **1 byte**
while the radio was configured for **2 bytes**.

## Regions and Scopes

The integration exposes the parts of MeshCore Regions/Scopes that are safe and
available through the current APIs:

- **Flood Scopes** are editable in **Dispositivo → Regions & Scopes**. They are
  stored in the selected `meshcore-ha` config entry and are available to the
  per-channel scope picker in **Chat & Canais**.
- **Remote Repeater Regions** can be read on demand and changed with structured
  Region commands. These operations use RF and are never polled automatically.
- The **local HiveFW Region tree is not editable through the current Companion
  Protocol**. HiveFW can manage Regions on-device, but exposing that tree to HA
  would require a firmware/protocol extension; this integration does not fake it.

## Nodes map

The **Nós** page is a permanent split view: the filtered/searchable node list
stays on the left and Home Assistant's own `ha-map` stays mounted on the
right. Nodes whose adverts contain valid coordinates are plotted automatically.
Clicking a node in the list centres that node on the map; clicking a marker
opens the same node details used by the list. The backend also backfills
contact coordinates from existing Home Assistant MeshCore contact/GPS
entities when the raw coordinator contact record does not retain
`adv_lat/adv_lon`. Nodes with no coordinates on either data surface remain
visible in the list and are simply omitted from the map.

## Network etiquette

MeshCore is a shared radio network. HiveFW and this Home Assistant integration should be
used with that in mind.

Automations and bots should preferably be **on-demand**. Avoid unnecessary periodic
traffic, aggressive polling that results in RF transmissions, or message flooding.

Most diagnostic reads used by the HiveFW cockpit are local Companion-protocol queries
between Home Assistant and the radio and do not themselves consume LoRa airtime.

## Repository layout

```text
custom_components/hivefw_integration/
    Home Assistant backend, WebSocket API, panel wrapper and HiveFW branding

frontend/
    Lit/TypeScript source for the sidebar interface

tests/
    backend tests

frontend/tests/
    frontend tests
```

The production frontend bundle is served from:

```text
custom_components/hivefw_integration/hivefw-integration-panel.js
```

The HiveFW compatibility wrapper is:

```text
custom_components/hivefw_integration/meshcore-repeater-panel.js
```

## Development

Frontend:

```bash
cd frontend
npm install
npm run build
npm test
npm run lint
```

Backend tests:

```bash
pytest tests/
```

Frontend-only changes normally require only a browser hard refresh after deployment.
Changes to Python modules loaded by Home Assistant can require an integration reload or,
for setup-time code, a Home Assistant restart.

## Related projects

- [HiveFW Companion-Repeater](https://github.com/fabiocguerreiro/HiveFW-Companion-Repeater)
- [MeshCore](https://github.com/meshcore-dev/MeshCore)
- [meshcore-ha](https://github.com/meshcore-dev/meshcore-ha)
- [meshcore_py](https://github.com/meshcore-dev/meshcore_py)

## Disclaimer

This project is provided as an experimental/custom integration. Use it at your own risk.

Radio configuration remains the responsibility of the user. Ensure that frequency,
power and operating mode comply with local regulations and with the configuration of the
MeshCore network you are participating in.

## License

MIT — see [LICENSE](LICENSE).
