import "./meshcore-chat-panel.js";

/*
 * MeshCore Repeater / HiveFW compatibility layer.
 *
 * The committed production bundle still comes from the upstream Chat panel.
 * This wrapper keeps that bundle intact and adds the Repeater-oriented pages
 * that are specific to this fork. Every status/configuration request uses the
 * existing Companion protocol exposed by the currently flashed radio.
 */
const BasePanel = customElements.get("meshcore-chat-panel");

if (!BasePanel) {
  throw new Error("meshcore-chat-panel failed to register");
}

class MeshCoreRepeaterPanel extends BasePanel {
  constructor() {
    super();

    this.__repeaterStatus = null;
    this.__repeaterLoading = false;
    this.__repeaterError = null;
    this.__repeaterMessage = null;
    this.__repeaterLoadedEntry = null;
    this.__repeaterEdit = {};

    this.__hiveNeighbors = null;
    this.__hiveNeighborsLoading = false;
    this.__hiveNeighborsError = null;
    this.__hiveNeighborsSort = "recent";
    this.__hiveNeighborsLoadedEntry = null;
  }

  updated(changedProperties) {
    if (super.updated) {
      super.updated(changedProperties);
    }
    this.__enhanceRepeaterUi();
  }

  __entryId() {
    return this._selectedEntryId || this._config?.entry_id || undefined;
  }

  __enhanceRepeaterUi() {
    const root = this.shadowRoot;
    if (!root) return;

    const title = root.querySelector(".panel-title");
    if (title) title.textContent = "MeshCore Repeater";

    this.__ensureRepeaterStyles(root);
    this.__ensureTabs(root);

    const entryId = this.__entryId() || null;

    if (this._activeTab === "repeater") {
      if (entryId !== this.__repeaterLoadedEntry) {
        this.__repeaterStatus = null;
        this.__repeaterError = null;
        this.__repeaterMessage = null;
        this.__repeaterEdit = {};
        this.__repeaterLoadedEntry = entryId;
      }

      const container = root.querySelector(".page-container");
      if (!container) return;
      this.__renderRepeater(container);

      if (!this.__repeaterStatus && !this.__repeaterLoading) {
        void this.__loadRepeaterStatus();
      }
      return;
    }

    if (this._activeTab === "neighbors") {
      if (entryId !== this.__hiveNeighborsLoadedEntry) {
        this.__hiveNeighbors = null;
        this.__hiveNeighborsError = null;
        this.__hiveNeighborsLoadedEntry = entryId;
      }

      const container = root.querySelector(".page-container");
      if (!container) return;
      this.__renderHiveNeighbors(container);

      if (!this.__hiveNeighbors && !this.__hiveNeighborsLoading) {
        void this.__loadHiveNeighbors();
      }
    }
  }

  __ensureTabs(root) {
    const tabBar = root.querySelector(".tab-bar");
    if (!tabBar) return;

    const settings = [...tabBar.querySelectorAll("button")]
      .find((item) => item.textContent?.trim() === "Settings");

    let repeater = tabBar.querySelector("[data-hive-repeater-tab]");
    if (!repeater) {
      repeater = document.createElement("button");
      repeater.dataset.hiveRepeaterTab = "1";
      repeater.textContent = "Repeater";
      repeater.addEventListener("click", () => {
        this._activeTab = "repeater";
        this.requestUpdate();
      });
      tabBar.insertBefore(repeater, settings || null);
    }

    let neighbors = tabBar.querySelector("[data-hive-neighbors-tab]");
    if (!neighbors) {
      neighbors = document.createElement("button");
      neighbors.dataset.hiveNeighborsTab = "1";
      neighbors.textContent = "Vizinhos";
      neighbors.addEventListener("click", () => {
        this._activeTab = "neighbors";
        this.requestUpdate();
      });
      tabBar.insertBefore(neighbors, settings || null);
    }

    repeater.classList.toggle("active", this._activeTab === "repeater");
    neighbors.classList.toggle("active", this._activeTab === "neighbors");
  }

  __ensureRepeaterStyles(root) {
    if (root.querySelector("#meshcore-repeater-fork-styles")) return;

    const style = document.createElement("style");
    style.id = "meshcore-repeater-fork-styles";
    style.textContent = `
      .tab-bar {
        overflow-x: auto !important;
        scrollbar-width: none;
      }
      .tab-bar::-webkit-scrollbar { display: none; }
      :host([narrow]) .tab-bar button {
        flex: 0 0 auto !important;
        min-width: 88px;
      }

      .mcr-page {
        height: 100%;
        overflow-y: auto;
        box-sizing: border-box;
        padding: 18px;
        color: var(--primary-text-color);
        background:
          radial-gradient(circle at 96% 0%, color-mix(in srgb, var(--primary-color) 10%, transparent), transparent 34%),
          var(--primary-background-color);
      }
      .mcr-wrap {
        width: min(1160px, 100%);
        margin: 0 auto;
      }
      .mcr-hero {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 20px;
        padding: 22px 24px;
        border: 1px solid var(--divider-color);
        border-radius: 18px;
        background: var(--card-background-color);
        box-shadow: 0 8px 28px rgba(0,0,0,.055);
      }
      .mcr-eyebrow {
        display: flex;
        align-items: center;
        gap: 7px;
        margin-bottom: 7px;
        color: var(--primary-color);
        font-size: 11px;
        font-weight: 760;
        letter-spacing: .12em;
        text-transform: uppercase;
      }
      .mcr-title {
        margin: 0;
        font-size: 25px;
        line-height: 1.1;
        font-weight: 720;
      }
      .mcr-subtitle {
        max-width: 700px;
        margin: 8px 0 0;
        color: var(--secondary-text-color);
        font-size: 13px;
        line-height: 1.48;
      }
      .mcr-badge {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        margin-top: 12px;
        border-radius: 999px;
        padding: 5px 10px;
        font-size: 11px;
        font-weight: 700;
      }
      .mcr-badge.on {
        color: #2e7d32;
        background: rgba(76,175,80,.13);
      }
      .mcr-badge.off {
        color: var(--secondary-text-color);
        background: var(--secondary-background-color);
      }
      .mcr-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: currentColor;
      }
      .mcr-btn {
        border: 1px solid var(--divider-color);
        border-radius: 11px;
        padding: 9px 12px;
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        font-weight: 650;
      }
      .mcr-btn:hover { border-color: var(--primary-color); }
      .mcr-btn:disabled { opacity: .55; cursor: default; }
      .mcr-btn.primary {
        border-color: var(--primary-color);
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
      }
      .mcr-btn.danger {
        border-color: rgba(244,67,54,.45);
        color: var(--error-color, #db4437);
        background: transparent;
      }
      .mcr-grid {
        display: grid;
        grid-template-columns: repeat(4,minmax(0,1fr));
        gap: 11px;
        margin-top: 13px;
      }
      .mcr-metric {
        min-height: 82px;
        box-sizing: border-box;
        padding: 14px 15px;
        border: 1px solid var(--divider-color);
        border-radius: 15px;
        background: var(--card-background-color);
      }
      .mcr-metric-label {
        margin-bottom: 7px;
        color: var(--secondary-text-color);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .075em;
        text-transform: uppercase;
      }
      .mcr-metric-value {
        font-size: 20px;
        font-weight: 730;
        line-height: 1.1;
      }
      .mcr-metric-sub {
        margin-top: 5px;
        color: var(--secondary-text-color);
        font-size: 10px;
      }
      .mcr-columns {
        display: grid;
        grid-template-columns: repeat(2,minmax(0,1fr));
        gap: 13px;
        margin-top: 13px;
        padding-bottom: 22px;
      }
      .mcr-card {
        padding: 18px;
        border: 1px solid var(--divider-color);
        border-radius: 17px;
        background: var(--card-background-color);
      }
      .mcr-card.wide { grid-column: 1 / -1; }
      .mcr-card-title {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
        font-size: 14px;
        font-weight: 720;
      }
      .mcr-card-desc {
        margin-bottom: 15px;
        color: var(--secondary-text-color);
        font-size: 11px;
        line-height: 1.45;
      }
      .mcr-form-grid {
        display: grid;
        grid-template-columns: repeat(2,minmax(0,1fr));
        gap: 11px;
      }
      .mcr-field {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .mcr-field label {
        color: var(--secondary-text-color);
        font-size: 10px;
        font-weight: 650;
        letter-spacing: .035em;
      }
      .mcr-input,
      .mcr-select {
        box-sizing: border-box;
        width: 100%;
        min-height: 39px;
        border: 1px solid var(--divider-color);
        border-radius: 10px;
        padding: 8px 10px;
        background: var(--primary-background-color);
        color: var(--primary-text-color);
        font: inherit;
        font-size: 12px;
      }
      .mcr-input:focus,
      .mcr-select:focus {
        outline: none;
        border-color: var(--primary-color);
      }
      .mcr-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 13px;
      }
      .mcr-mode-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 13px 14px;
        border: 1px solid var(--divider-color);
        border-radius: 13px;
        background: var(--secondary-background-color);
      }
      .mcr-mode-name {
        font-size: 13px;
        font-weight: 700;
      }
      .mcr-mode-help {
        margin-top: 3px;
        color: var(--secondary-text-color);
        font-size: 10px;
      }
      .mcr-switch {
        position: relative;
        display: inline-block;
        width: 42px;
        height: 24px;
        flex: 0 0 auto;
      }
      .mcr-switch input { display: none; }
      .mcr-switch span {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        background: var(--divider-color);
        cursor: pointer;
        transition: .18s ease;
      }
      .mcr-switch span::after {
        content: "";
        position: absolute;
        top: 3px;
        left: 3px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: white;
        box-shadow: 0 1px 4px rgba(0,0,0,.25);
        transition: .18s ease;
      }
      .mcr-switch input:checked + span {
        background: var(--primary-color);
      }
      .mcr-switch input:checked + span::after {
        transform: translateX(18px);
      }
      .mcr-stat-list {
        display: grid;
        grid-template-columns: repeat(2,minmax(0,1fr));
        gap: 8px;
      }
      .mcr-stat {
        padding: 10px 11px;
        border-radius: 11px;
        background: var(--secondary-background-color);
      }
      .mcr-stat-name {
        color: var(--secondary-text-color);
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: .065em;
      }
      .mcr-stat-value {
        margin-top: 4px;
        font-size: 13px;
        font-weight: 680;
      }
      .mcr-note {
        margin-top: 12px;
        padding: 11px 12px;
        border-radius: 11px;
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
        font-size: 10px;
        line-height: 1.5;
      }
      .mcr-message {
        margin-top: 12px;
        padding: 10px 12px;
        border-radius: 11px;
        font-size: 11px;
      }
      .mcr-message.ok {
        color: #2e7d32;
        background: rgba(76,175,80,.12);
      }
      .mcr-message.error {
        color: var(--error-color, #db4437);
        background: rgba(244,67,54,.1);
      }
      .mcr-state {
        margin-top: 14px;
        padding: 34px 24px;
        border: 1px dashed var(--divider-color);
        border-radius: 17px;
        background: var(--card-background-color);
        text-align: center;
      }
      .mcr-state-icon {
        width: 48px;
        height: 48px;
        display: grid;
        place-items: center;
        margin: 0 auto 13px;
        border-radius: 15px;
        background: var(--secondary-background-color);
        color: var(--primary-color);
        font-size: 22px;
      }
      .mcr-state-title { font-size: 15px; font-weight: 700; }
      .mcr-state-text {
        max-width: 590px;
        margin: 7px auto 0;
        color: var(--secondary-text-color);
        font-size: 12px;
        line-height: 1.5;
      }

      .hive-neighbors-toolbar {
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        margin:18px 0 10px;
      }
      .hive-neighbors-sort {
        display:inline-flex;
        gap:3px;
        padding:3px;
        border:1px solid var(--divider-color);
        border-radius:11px;
        background:var(--secondary-background-color);
      }
      .hive-neighbors-sort button {
        border:0;
        border-radius:8px;
        padding:7px 10px;
        background:transparent;
        color:var(--secondary-text-color);
        font:inherit;
        font-size:11px;
        font-weight:650;
        cursor:pointer;
      }
      .hive-neighbors-sort button.active {
        background:var(--primary-color);
        color:var(--text-primary-color,#fff);
      }
      .hive-neighbors-grid {
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:12px;
        padding-bottom:22px;
      }
      .hive-neighbor-card {
        position:relative;
        overflow:hidden;
        display:grid;
        grid-template-columns:42px minmax(0,1fr) auto;
        align-items:center;
        gap:14px;
        padding:16px;
        border:1px solid var(--divider-color);
        border-radius:16px;
        background:var(--card-background-color);
      }
      .hive-neighbor-card::before {
        content:"";
        position:absolute;
        inset:0 auto 0 0;
        width:3px;
        background:var(--primary-color);
      }
      .hive-neighbor-icon {
        width:42px;
        height:42px;
        display:grid;
        place-items:center;
        border-radius:13px;
        background:color-mix(in srgb,var(--primary-color) 10%,var(--card-background-color));
        color:var(--primary-color);
        font-size:20px;
      }
      .hive-neighbor-name {
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        font-size:14px;
        font-weight:700;
      }
      .hive-neighbor-prefix {
        margin-top:4px;
        color:var(--secondary-text-color);
        font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
        letter-spacing:.035em;
      }
      .hive-neighbor-meta {
        display:flex;
        flex-wrap:wrap;
        align-items:center;
        gap:7px;
        margin-top:8px;
        color:var(--secondary-text-color);
        font-size:11px;
      }
      .hive-neighbor-pill {
        border-radius:999px;
        padding:3px 8px;
        background:color-mix(in srgb,var(--primary-color) 10%,transparent);
        color:var(--primary-color);
        font-size:10px;
        font-weight:700;
      }
      .hive-neighbor-side { text-align:right; min-width:64px; }
      .hive-neighbor-age { font-size:13px; font-weight:700; }
      .hive-neighbor-side-label {
        margin-top:4px;
        color:var(--secondary-text-color);
        font-size:9px;
        letter-spacing:.07em;
        text-transform:uppercase;
      }

      @media (max-width: 820px) {
        .mcr-page { padding: 12px; }
        .mcr-hero { flex-direction: column; padding: 18px; }
        .mcr-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
        .mcr-columns { grid-template-columns: 1fr; }
        .mcr-card.wide { grid-column: auto; }
        .hive-neighbors-grid { grid-template-columns:1fr; }
      }
      @media (max-width: 520px) {
        .mcr-grid { grid-template-columns: 1fr 1fr; }
        .mcr-form-grid { grid-template-columns: 1fr; }
        .mcr-stat-list { grid-template-columns: 1fr 1fr; }
      }
    `;

    root.appendChild(style);
  }

  async __loadRepeaterStatus() {
    if (!this.hass || this.__repeaterLoading) return;

    this.__repeaterLoading = true;
    this.__repeaterError = null;
    this.__rerenderRepeater();

    try {
      const msg = { type: "meshcore_chat/get_local_repeater_status" };
      const entryId = this.__entryId();
      if (entryId) msg.entry_id = entryId;

      this.__repeaterStatus = await this.hass.callWS(msg);
      this.__seedRepeaterEdit(this.__repeaterStatus);
    } catch (error) {
      this.__repeaterError =
        error?.message || "Não foi possível carregar o estado do Repeater.";
    } finally {
      this.__repeaterLoading = false;
      this.__rerenderRepeater();
    }
  }

  __seedRepeaterEdit(status) {
    if (!status) return;
    const radio = status.radio || {};
    const location = status.location || {};
    const tuning = status.tuning || {};

    this.__repeaterEdit = {
      repeat: !!status.repeat,
      frequency: radio.frequency,
      bandwidth: radio.bandwidth,
      spreading_factor: radio.spreading_factor,
      coding_rate: radio.coding_rate,
      tx_power: radio.tx_power,
      path_hash_mode: radio.path_hash_mode ?? 0,
      multi_acks: Number(radio.multi_acks ?? 0),
      rx_delay: tuning.rx_delay ?? 0,
      airtime_factor: tuning.airtime_factor ?? 0,
      latitude: location.latitude ?? 0,
      longitude: location.longitude ?? 0,
    };
  }

  async __saveRepeaterSettings(settings, successText) {
    if (!this.hass) return;
    this.__repeaterMessage = null;
    this.__repeaterError = null;
    this.__repeaterLoading = true;
    this.__rerenderRepeater();

    try {
      const msg = {
        type: "meshcore_chat/set_device_config",
        settings,
      };
      const entryId = this.__entryId();
      if (entryId) msg.entry_id = entryId;
      await this.hass.callWS(msg);

      this.__repeaterMessage = successText;
      this.__repeaterStatus = null;
    } catch (error) {
      this.__repeaterError = error?.message || "Não foi possível aplicar a configuração.";
    } finally {
      this.__repeaterLoading = false;
      this.__rerenderRepeater();
      if (!this.__repeaterError) {
        await this.__loadRepeaterStatus();
      }
    }
  }

  async __executeLocal(command, args, successText) {
    if (!this.hass) return;

    this.__repeaterMessage = null;
    this.__repeaterError = null;
    this.__repeaterLoading = true;
    this.__rerenderRepeater();

    try {
      const msg = {
        type: "meshcore_chat/execute_local",
        command,
      };
      if (args) msg.args = args;
      const entryId = this.__entryId();
      if (entryId) msg.entry_id = entryId;

      await this.hass.callWS(msg);
      this.__repeaterMessage = successText;
    } catch (error) {
      this.__repeaterError = error?.message || `Falha ao executar ${command}.`;
    } finally {
      this.__repeaterLoading = false;
      this.__rerenderRepeater();
    }
  }

  __rerenderRepeater() {
    if (this._activeTab !== "repeater") return;
    const container = this.shadowRoot?.querySelector(".page-container");
    if (container) this.__renderRepeater(container);
  }

  __renderRepeater(container) {
    container.replaceChildren();

    const page = document.createElement("div");
    page.className = "mcr-page";
    const wrap = document.createElement("div");
    wrap.className = "mcr-wrap";
    page.appendChild(wrap);
    container.appendChild(page);

    const hero = document.createElement("section");
    hero.className = "mcr-hero";

    const heading = document.createElement("div");
    const eyebrow = document.createElement("div");
    eyebrow.className = "mcr-eyebrow";
    eyebrow.textContent = "◉  HIVEFW · REPEATER";
    const title = document.createElement("h1");
    title.className = "mcr-title";
    title.textContent = "Repeater";
    const subtitle = document.createElement("p");
    subtitle.className = "mcr-subtitle";
    subtitle.textContent =
      "Estado e configuração do Repeater integrado no Companion. Todas as leituras e alterações desta página usam a ligação local ao rádio — não geram tráfego LoRa na mesh.";

    heading.append(eyebrow, title, subtitle);

    if (this.__repeaterStatus) {
      const badge = document.createElement("div");
      badge.className = `mcr-badge ${this.__repeaterStatus.repeat ? "on" : "off"}`;
      const dot = document.createElement("span");
      dot.className = "mcr-dot";
      const label = document.createElement("span");
      label.textContent = this.__repeaterStatus.repeat
        ? "Repeater ativo"
        : "Repeater desligado";
      badge.append(dot, label);
      heading.appendChild(badge);
    }

    const refresh = document.createElement("button");
    refresh.className = "mcr-btn";
    refresh.disabled = this.__repeaterLoading;
    refresh.textContent = this.__repeaterLoading ? "A atualizar…" : "↻ Atualizar";
    refresh.addEventListener("click", () => void this.__loadRepeaterStatus());

    hero.append(heading, refresh);
    wrap.appendChild(hero);

    if (this.__repeaterError) {
      const msg = document.createElement("div");
      msg.className = "mcr-message error";
      msg.textContent = this.__repeaterError;
      wrap.appendChild(msg);
    } else if (this.__repeaterMessage) {
      const msg = document.createElement("div");
      msg.className = "mcr-message ok";
      msg.textContent = this.__repeaterMessage;
      wrap.appendChild(msg);
    }

    if (this.__repeaterLoading && !this.__repeaterStatus) {
      wrap.appendChild(this.__state(
        "A carregar",
        "A consultar o Companion e as estatísticas locais do rádio."
      ));
      return;
    }

    const status = this.__repeaterStatus;
    if (!status) return;

    if (!status.supported) {
      wrap.appendChild(this.__state(
        "Modo Repeater não exposto",
        "O rádio respondeu, mas esta versão do Companion Protocol não anuncia suporte ao modo Repeater integrado."
      ));
      return;
    }

    const core = status.stats?.core || {};
    const radioStats = status.stats?.radio || {};
    const packets = status.stats?.packets || {};
    const batteryMv = core.battery_mv ?? status.battery?.level;

    const metrics = document.createElement("section");
    metrics.className = "mcr-grid";
    metrics.append(
      this.__metric(
        "Bateria",
        batteryMv != null ? `${(Number(batteryMv) / 1000).toFixed(2)} V` : "—",
        status.battery?.total_kb
          ? `Storage ${status.battery.used_kb ?? 0}/${status.battery.total_kb} KB`
          : ""
      ),
      this.__metric(
        "Uptime",
        core.uptime_secs != null ? this.__duration(core.uptime_secs) : "—",
        core.queue_len != null ? `Fila: ${core.queue_len}` : ""
      ),
      this.__metric(
        "Último sinal",
        radioStats.last_rssi != null ? `${radioStats.last_rssi} dBm` : "—",
        radioStats.last_snr != null ? `SNR ${Number(radioStats.last_snr).toFixed(1)} dB` : ""
      ),
      this.__metric(
        "Noise floor",
        radioStats.noise_floor != null ? `${radioStats.noise_floor} dBm` : "—",
        status.firmware ? `FW ${status.firmware}` : ""
      )
    );
    wrap.appendChild(metrics);

    const columns = document.createElement("div");
    columns.className = "mcr-columns";

    columns.append(
      this.__renderModeCard(status),
      this.__renderRadioCard(status),
      this.__renderRoutingCard(status),
      this.__renderStatsCard(status),
      this.__renderLocationCard(status),
      this.__renderActionsCard(status),
      this.__renderLimitationsCard()
    );

    wrap.appendChild(columns);
  }

  __renderModeCard(status) {
    const card = this.__card(
      "Modo Repeater",
      "Ativa ou desativa a função de repetição mantendo o equipamento como Companion."
    );

    const row = document.createElement("div");
    row.className = "mcr-mode-row";

    const info = document.createElement("div");
    const name = document.createElement("div");
    name.className = "mcr-mode-name";
    name.textContent = status.repeat ? "Ativo" : "Desligado";
    const help = document.createElement("div");
    help.className = "mcr-mode-help";
    help.textContent = status.repeat
      ? "O Companion anuncia-se também como Repeater."
      : "O Companion funciona apenas no modo normal.";
    info.append(name, help);

    const toggle = document.createElement("label");
    toggle.className = "mcr-switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!this.__repeaterEdit.repeat;
    input.disabled = this.__repeaterLoading;
    input.addEventListener("change", () => {
      this.__repeaterEdit.repeat = input.checked;
    });
    const slider = document.createElement("span");
    toggle.append(input, slider);

    row.append(info, toggle);
    card.appendChild(row);

    const actions = document.createElement("div");
    actions.className = "mcr-actions";
    const save = this.__button("Aplicar modo", "primary");
    save.disabled = this.__repeaterLoading;
    save.addEventListener("click", () => {
      void this.__saveRepeaterSettings(
        { repeat: !!this.__repeaterEdit.repeat },
        this.__repeaterEdit.repeat
          ? "Modo Repeater ativado."
          : "Modo Repeater desligado."
      );
    });
    actions.appendChild(save);
    card.appendChild(actions);

    return card;
  }

  __renderRadioCard(status) {
    const card = this.__card(
      "Rádio",
      "Parâmetros RF equivalentes à parte principal do Repeater Setup."
    );

    const grid = document.createElement("div");
    grid.className = "mcr-form-grid";

    const freq = this.__numberField(
      "Frequência (MHz)",
      this.__repeaterEdit.frequency,
      "0.001",
      (v) => this.__repeaterEdit.frequency = v
    );
    const bw = this.__selectField(
      "Bandwidth (kHz)",
      [7.8,10.4,15.6,20.8,31.25,41.7,62.5,125,250,500],
      this.__repeaterEdit.bandwidth,
      (v) => this.__repeaterEdit.bandwidth = Number(v)
    );
    const sf = this.__selectField(
      "Spreading Factor",
      [7,8,9,10,11,12],
      this.__repeaterEdit.spreading_factor,
      (v) => this.__repeaterEdit.spreading_factor = Number(v)
    );
    const cr = this.__selectField(
      "Coding Rate",
      [5,6,7,8],
      this.__repeaterEdit.coding_rate,
      (v) => this.__repeaterEdit.coding_rate = Number(v)
    );
    const tx = this.__numberField(
      "TX Power (dBm)",
      this.__repeaterEdit.tx_power,
      "1",
      (v) => this.__repeaterEdit.tx_power = v
    );
    const path = this.__selectField(
      "Path Hash",
      [
        { value: 0, label: "0 · 1 byte" },
        { value: 1, label: "1 · 2 bytes" },
        { value: 2, label: "2 · 3 bytes" },
      ],
      this.__repeaterEdit.path_hash_mode,
      (v) => this.__repeaterEdit.path_hash_mode = Number(v)
    );

    grid.append(freq, bw, sf, cr, tx, path);
    card.appendChild(grid);

    const actions = document.createElement("div");
    actions.className = "mcr-actions";
    const save = this.__button("Guardar rádio", "primary");
    save.disabled = this.__repeaterLoading;
    save.addEventListener("click", () => {
      void this.__saveRepeaterSettings(
        {
          frequency: Number(this.__repeaterEdit.frequency),
          bandwidth: Number(this.__repeaterEdit.bandwidth),
          spreading_factor: Number(this.__repeaterEdit.spreading_factor),
          coding_rate: Number(this.__repeaterEdit.coding_rate),
          tx_power: Number(this.__repeaterEdit.tx_power),
          path_hash_mode: Number(this.__repeaterEdit.path_hash_mode),
        },
        "Configuração de rádio aplicada."
      );
    });
    actions.appendChild(save);
    card.appendChild(actions);

    const note = document.createElement("div");
    note.className = "mcr-note";
    note.textContent =
      "Confirma sempre que frequência e potência respeitam a configuração da tua rede e os limites regulamentares aplicáveis.";
    card.appendChild(note);

    return card;
  }

  __renderRoutingCard(status) {
    const card = this.__card(
      "Routing & Tuning",
      "Opções que o Companion Protocol atual permite ajustar diretamente."
    );

    const grid = document.createElement("div");
    grid.className = "mcr-form-grid";

    grid.append(
      this.__selectField(
        "Multi ACKs",
        [
          { value: 0, label: "Desligado" },
          { value: 1, label: "Ligado" },
        ],
        this.__repeaterEdit.multi_acks,
        (v) => this.__repeaterEdit.multi_acks = Number(v)
      ),
      this.__numberField(
        "RX delay",
        this.__repeaterEdit.rx_delay,
        "0.001",
        (v) => this.__repeaterEdit.rx_delay = v
      ),
      this.__numberField(
        "Airtime factor",
        this.__repeaterEdit.airtime_factor,
        "0.001",
        (v) => this.__repeaterEdit.airtime_factor = v
      )
    );

    card.appendChild(grid);

    const actions = document.createElement("div");
    actions.className = "mcr-actions";
    const save = this.__button("Guardar tuning", "primary");
    save.disabled = this.__repeaterLoading;
    save.addEventListener("click", () => {
      void this.__saveRepeaterSettings(
        {
          multi_acks: Number(this.__repeaterEdit.multi_acks),
          rx_delay: Number(this.__repeaterEdit.rx_delay),
          airtime_factor: Number(this.__repeaterEdit.airtime_factor),
        },
        "Routing e tuning atualizados."
      );
    });
    actions.appendChild(save);
    card.appendChild(actions);

    return card;
  }

  __renderStatsCard(status) {
    const card = this.__card(
      "Tráfego & RF",
      "Estatísticas locais do rádio; consultar esta secção não usa airtime LoRa."
    );

    const radio = status.stats?.radio || {};
    const packets = status.stats?.packets || {};
    const list = document.createElement("div");
    list.className = "mcr-stat-list";

    const values = [
      ["Pacotes RX", packets.recv],
      ["Pacotes TX", packets.sent],
      ["Flood RX", packets.flood_rx],
      ["Flood TX", packets.flood_tx],
      ["Direct RX", packets.direct_rx],
      ["Direct TX", packets.direct_tx],
      ["Erros RX", packets.recv_errors],
      ["Airtime TX", radio.tx_air_secs != null ? this.__duration(radio.tx_air_secs) : null],
      ["Airtime RX", radio.rx_air_secs != null ? this.__duration(radio.rx_air_secs) : null],
    ];

    for (const [label, value] of values) {
      if (value == null) continue;
      const row = document.createElement("div");
      row.className = "mcr-stat";
      const n = document.createElement("div");
      n.className = "mcr-stat-name";
      n.textContent = label;
      const v = document.createElement("div");
      v.className = "mcr-stat-value";
      v.textContent = String(value);
      row.append(n, v);
      list.appendChild(row);
    }

    card.appendChild(list);
    return card;
  }

  __renderLocationCard(status) {
    const card = this.__card(
      "Localização",
      "Coordenadas anunciadas pelo Companion. A alteração é local ao equipamento."
    );

    const grid = document.createElement("div");
    grid.className = "mcr-form-grid";
    grid.append(
      this.__numberField(
        "Latitude",
        this.__repeaterEdit.latitude,
        "0.000001",
        (v) => this.__repeaterEdit.latitude = v
      ),
      this.__numberField(
        "Longitude",
        this.__repeaterEdit.longitude,
        "0.000001",
        (v) => this.__repeaterEdit.longitude = v
      )
    );
    card.appendChild(grid);

    const actions = document.createElement("div");
    actions.className = "mcr-actions";
    const save = this.__button("Guardar localização", "primary");
    save.disabled = this.__repeaterLoading;
    save.addEventListener("click", () => {
      void this.__saveRepeaterSettings(
        {
          latitude: Number(this.__repeaterEdit.latitude),
          longitude: Number(this.__repeaterEdit.longitude),
        },
        "Localização atualizada."
      );
    });
    actions.appendChild(save);
    card.appendChild(actions);

    return card;
  }

  __renderActionsCard(status) {
    const card = this.__card(
      "Ações",
      "Ações rápidas do Companion/Repeater."
    );

    const actions = document.createElement("div");
    actions.className = "mcr-actions";

    const localAdvert = this.__button("Local Advert");
    localAdvert.addEventListener("click", () => {
      void this.__executeLocal("send_advert", undefined, "Local Advert enviado.");
    });

    const floodAdvert = this.__button("Flood Advert");
    floodAdvert.addEventListener("click", () => {
      void this.__executeLocal("send_advert", { flood: true }, "Flood Advert enviado.");
    });

    const clock = this.__button("Sincronizar relógio");
    clock.addEventListener("click", () => {
      void this.__executeLocal(
        "set_time",
        { val: Math.floor(Date.now() / 1000) },
        "Relógio sincronizado."
      );
    });

    const reboot = this.__button("Reiniciar rádio", "danger");
    reboot.addEventListener("click", () => {
      if (window.confirm("Reiniciar agora o Companion/Repeater?")) {
        void this.__executeLocal("reboot", undefined, "Comando de reinício enviado.");
      }
    });

    for (const button of [localAdvert, floodAdvert, clock, reboot]) {
      button.disabled = this.__repeaterLoading;
      actions.appendChild(button);
    }

    card.appendChild(actions);
    return card;
  }

  __renderLimitationsCard() {
    const card = this.__card(
      "Repeater Setup · cobertura atual",
      "Funcionalidades disponíveis sem alterar o firmware do rádio."
    );
    card.classList.add("wide");

    const note = document.createElement("div");
    note.className = "mcr-note";
    note.textContent =
      "Disponível agora: modo Repeater, RF, TX power, Path Hash, Multi ACKs, tuning, localização, adverts, reboot e estatísticas. O Repeater Setup oficial também possui opções como Regions, advert intervals, flood.max, loop detection, owner info, duty cycle e passwords de servidor; essas opções não são expostas pelo Companion Protocol do HiveFW atualmente e por isso não são alteradas por esta página.";
    card.appendChild(note);
    return card;
  }

  __card(title, description) {
    const card = document.createElement("section");
    card.className = "mcr-card";

    const h = document.createElement("div");
    h.className = "mcr-card-title";
    h.textContent = title;
    card.appendChild(h);

    if (description) {
      const p = document.createElement("div");
      p.className = "mcr-card-desc";
      p.textContent = description;
      card.appendChild(p);
    }

    return card;
  }

  __button(label, variant = "") {
    const button = document.createElement("button");
    button.className = `mcr-btn ${variant}`.trim();
    button.textContent = label;
    return button;
  }

  __numberField(label, value, step, onChange) {
    const field = document.createElement("div");
    field.className = "mcr-field";

    const l = document.createElement("label");
    l.textContent = label;

    const input = document.createElement("input");
    input.className = "mcr-input";
    input.type = "number";
    input.step = step;
    input.value = value == null ? "" : String(value);
    input.addEventListener("input", () => {
      const n = Number(input.value);
      if (Number.isFinite(n)) onChange(n);
    });

    field.append(l, input);
    return field;
  }

  __selectField(label, options, value, onChange) {
    const field = document.createElement("div");
    field.className = "mcr-field";

    const l = document.createElement("label");
    l.textContent = label;

    const select = document.createElement("select");
    select.className = "mcr-select";

    for (const option of options) {
      const spec = typeof option === "object"
        ? option
        : { value: option, label: String(option) };
      const el = document.createElement("option");
      el.value = String(spec.value);
      el.textContent = spec.label;
      el.selected = String(spec.value) === String(value);
      select.appendChild(el);
    }

    select.addEventListener("change", () => onChange(select.value));
    field.append(l, select);
    return field;
  }

  __metric(label, value, sub = "") {
    const el = document.createElement("div");
    el.className = "mcr-metric";

    const l = document.createElement("div");
    l.className = "mcr-metric-label";
    l.textContent = label;

    const v = document.createElement("div");
    v.className = "mcr-metric-value";
    v.textContent = value;

    el.append(l, v);

    if (sub) {
      const s = document.createElement("div");
      s.className = "mcr-metric-sub";
      s.textContent = sub;
      el.appendChild(s);
    }

    return el;
  }

  __state(title, text) {
    const el = document.createElement("div");
    el.className = "mcr-state";

    const icon = document.createElement("div");
    icon.className = "mcr-state-icon";
    icon.textContent = "⌁";

    const h = document.createElement("div");
    h.className = "mcr-state-title";
    h.textContent = title;

    const p = document.createElement("div");
    p.className = "mcr-state-text";
    p.textContent = text;

    el.append(icon, h, p);
    return el;
  }

  __duration(seconds) {
    let value = Math.max(0, Math.floor(Number(seconds) || 0));
    const days = Math.floor(value / 86400);
    value %= 86400;
    const hours = Math.floor(value / 3600);
    value %= 3600;
    const minutes = Math.floor(value / 60);

    if (days) return `${days}d ${hours}h`;
    if (hours) return `${hours}h ${minutes}m`;
    if (minutes) return `${minutes}m`;
    return `${value}s`;
  }

  async __loadHiveNeighbors() {
    if (!this.hass || this.__hiveNeighborsLoading) return;

    this.__hiveNeighborsLoading = true;
    this.__hiveNeighborsError = null;
    this.__rerenderHivePage();

    try {
      const msg = { type: "meshcore_chat/get_hive_neighbors" };
      const entryId = this.__entryId();
      if (entryId) msg.entry_id = entryId;
      this.__hiveNeighbors = await this.hass.callWS(msg);
    } catch (error) {
      this.__hiveNeighborsError =
        error?.message || "Não foi possível carregar os vizinhos.";
    } finally {
      this.__hiveNeighborsLoading = false;
      this.__rerenderHivePage();
    }
  }

  __rerenderHivePage() {
    if (this._activeTab !== "neighbors") return;
    const container = this.shadowRoot?.querySelector(".page-container");
    if (container) this.__renderHiveNeighbors(container);
  }

  __renderHiveNeighbors(container) {
    container.replaceChildren();

    const page = document.createElement("div");
    page.className = "mcr-page";
    const wrap = document.createElement("div");
    wrap.className = "mcr-wrap";
    page.appendChild(wrap);
    container.appendChild(page);

    const hero = document.createElement("section");
    hero.className = "mcr-hero";

    const heading = document.createElement("div");
    const eyebrow = document.createElement("div");
    eyebrow.className = "mcr-eyebrow";
    eyebrow.textContent = "◉  REPEATER · ZERO-HOP";
    const title = document.createElement("h1");
    title.className = "mcr-title";
    title.textContent = "Vizinhos";
    const subtitle = document.createElement("p");
    subtitle.className = "mcr-subtitle";
    subtitle.textContent =
      "Repeaters cujo último advert guardado pelo Companion foi recebido diretamente, com zero hops. A consulta usa a cache Advert Path já existente no firmware e não gera tráfego LoRa.";
    heading.append(eyebrow, title, subtitle);

    const refresh = document.createElement("button");
    refresh.className = "mcr-btn";
    refresh.disabled = this.__hiveNeighborsLoading;
    refresh.textContent = this.__hiveNeighborsLoading ? "A atualizar…" : "↻ Atualizar";
    refresh.addEventListener("click", () => void this.__loadHiveNeighbors());

    hero.append(heading, refresh);
    wrap.appendChild(hero);

    if (this.__hiveNeighborsLoading && !this.__hiveNeighbors) {
      wrap.appendChild(this.__state(
        "A carregar",
        "A consultar os caminhos dos adverts guardados pelo Companion."
      ));
      return;
    }

    if (this.__hiveNeighborsError) {
      wrap.appendChild(this.__state("Erro ao carregar", this.__hiveNeighborsError));
      return;
    }

    const data = this.__hiveNeighbors;
    if (!data?.supported) {
      wrap.appendChild(this.__state(
        "Consulta indisponível",
        "Esta versão do Companion não disponibiliza os dados necessários para determinar vizinhos zero-hop."
      ));
      return;
    }

    if (!data.repeater_enabled) {
      wrap.appendChild(this.__state(
        "Modo Repeater desligado",
        "O rádio está ligado como Companion, mas o modo Repeater encontra-se desligado."
      ));
      return;
    }

    const neighbors = Array.isArray(data.neighbors) ? [...data.neighbors] : [];
    const latest = neighbors.length
      ? Math.min(...neighbors.map((n) => Number(n.secs_ago || 0)))
      : null;

    const summary = document.createElement("section");
    summary.className = "mcr-grid";
    summary.append(
      this.__metric("Vizinhos", String(data.count ?? neighbors.length), "Repeaters diretos"),
      this.__metric("Método", "Zero-hop", "Advert Path"),
      this.__metric(
        "Último advert",
        latest == null ? "—" : this.__age(latest),
        "mais recente"
      ),
      this.__metric(
        "Modo",
        data.repeater_enabled ? "Ativo" : "Desligado",
        "HiveFW Repeater"
      )
    );
    wrap.appendChild(summary);

    const toolbar = document.createElement("div");
    toolbar.className = "hive-neighbors-toolbar";

    const sectionTitle = document.createElement("div");
    sectionTitle.className = "mcr-card-title";
    sectionTitle.textContent = "Repeaters diretos";

    const sort = document.createElement("div");
    sort.className = "hive-neighbors-sort";

    for (const [value, label] of [["recent", "Recentes"], ["name", "Nome"]]) {
      const button = document.createElement("button");
      button.textContent = label;
      button.classList.toggle("active", this.__hiveNeighborsSort === value);
      button.addEventListener("click", () => {
        this.__hiveNeighborsSort = value;
        this.__rerenderHivePage();
      });
      sort.appendChild(button);
    }

    toolbar.append(sectionTitle, sort);
    wrap.appendChild(toolbar);

    if (!neighbors.length) {
      wrap.appendChild(this.__state(
        "Ainda sem vizinhos zero-hop",
        "Nenhum contacto Repeater tem neste momento um Advert Path direto guardado no Companion."
      ));
      return;
    }

    neighbors.sort(
      this.__hiveNeighborsSort === "name"
        ? (a, b) => String(a.name || "").localeCompare(String(b.name || ""))
        : (a, b) => Number(a.secs_ago || 0) - Number(b.secs_ago || 0)
    );

    const grid = document.createElement("div");
    grid.className = "hive-neighbors-grid";
    for (const neighbor of neighbors) {
      grid.appendChild(this.__neighborCard(neighbor));
    }
    wrap.appendChild(grid);
  }

  __neighborCard(neighbor) {
    const card = document.createElement("article");
    card.className = "hive-neighbor-card";

    const icon = document.createElement("div");
    icon.className = "hive-neighbor-icon";
    icon.textContent = "⌁";

    const info = document.createElement("div");

    const name = document.createElement("div");
    name.className = "hive-neighbor-name";
    name.textContent = neighbor.name || neighbor.pubkey_prefix || "Repeater";

    const prefix = document.createElement("div");
    prefix.className = "hive-neighbor-prefix";
    prefix.textContent = String(neighbor.pubkey_prefix || "").toUpperCase();

    const meta = document.createElement("div");
    meta.className = "hive-neighbor-meta";

    const direct = document.createElement("span");
    direct.className = "hive-neighbor-pill";
    direct.textContent = "ZERO-HOP";
    meta.appendChild(direct);

    if (neighbor.known_contact) {
      const known = document.createElement("span");
      known.textContent = "Contacto adicionado";
      meta.appendChild(known);
    } else {
      const discovered = document.createElement("span");
      discovered.textContent = "Descoberto";
      meta.appendChild(discovered);
    }

    info.append(name, prefix, meta);

    const side = document.createElement("div");
    side.className = "hive-neighbor-side";

    const age = document.createElement("div");
    age.className = "hive-neighbor-age";
    age.textContent = this.__age(Number(neighbor.secs_ago || 0));

    const label = document.createElement("div");
    label.className = "hive-neighbor-side-label";
    label.textContent = "último advert";

    side.append(age, label);
    card.append(icon, info, side);
    return card;
  }

  __age(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    if (value < 10) return "agora";
    if (value < 60) return `${value}s`;
    const minutes = Math.floor(value / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h`;
    return `${Math.floor(hours / 24)} d`;
  }
}

customElements.define("meshcore-repeater-panel", MeshCoreRepeaterPanel);
