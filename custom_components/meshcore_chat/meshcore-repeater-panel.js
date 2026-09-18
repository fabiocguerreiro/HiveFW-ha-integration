import "./meshcore-chat-panel.js";

/*
 * HiveFW Repeater compatibility layer.
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

    this._activeTab = "settings";

    this.__repeaterStatus = null;
    this.__repeaterLoading = false;
    this.__repeaterError = null;
    this.__repeaterMessage = null;
    this.__repeaterLoadedEntry = null;
    this.__repeaterEdit = {};
    this.__settingsObserver = null;
    this.__settingsObservedRoot = null;
    this.__managedDevices = { repeaters: [], clients: [] };
    this.__managedDevicesLoading = false;
    this.__managedDevicesLoadedEntry = null;
    this.__scopesLoadedEntry = null;
    this.__scopeState = { scopes: [], global: false };
    this.__scopeDraft = "";
    this.__scopeGlobal = false;
    this.__regionTarget = "";
    this.__regionText = "";
    this.__regionAction = "allowf";
    this.__regionName = "";
    this.__regionsBusy = false;
    this.__nodesView = "list";
    this.__nodesMapOverlay = null;
    this.__nodesMapElement = null;
    this.__nodesMapContacts = null;
    this.__nodesMapLoading = false;
    this.__nodesMapLoadedEntry = null;
    this.__nodesMapMarkerElements = new Map();
    this.__nodesMapSignature = "";
    this.__mapLoadStarted = false;

    this.__hiveNeighbors = null;
    this.__hiveNeighborsLoading = false;
    this.__hiveNeighborsError = null;
    this.__hiveNeighborsSort = "recent";
    this.__hiveNeighborsLoadedEntry = null;
    this.__neighborsOverlay = null;
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
    if (title) {
      let logo = title.querySelector(".hivefw-header-logo");
      let product = title.querySelector(".hivefw-header-product");
      if (!logo || !product) {
        title.textContent = "";
        logo = document.createElement("span");
        logo.className = "hivefw-header-logo";
        logo.setAttribute("aria-hidden", "true");
        product = document.createElement("span");
        product.className = "hivefw-header-product";
        title.append(logo, product);
      }
      const radioName = this._selectedDevice?.name
        || this.__repeaterStatus?.name
        || this._config?.name
        || "HiveFW";
      product.textContent = `– ${radioName}`;
      title.setAttribute("aria-label", `HiveFW – ${radioName}`);
    }

    // The HiveFW radio is the integration's primary device. Keep the right
    // side of the header deliberately minimal: connection state + battery.
    root.querySelectorAll(".header-right .device-info-wrap").forEach((el) => el.remove());

    this.__ensureRepeaterStyles(root);
    this.__ensureTabs(root);

    const entryId = this.__entryId() || null;

    if (this._activeTab !== "neighbors") {
      this.__removeNeighborsOverlay();
    }

    if (this._activeTab === "nodes") {
      this.__enhanceNodesPage();
      return;
    }

        if (this._activeTab === "settings") {
      if (entryId !== this.__repeaterLoadedEntry) {
        this.__repeaterStatus = null;
        this.__repeaterError = null;
        this.__repeaterMessage = null;
        this.__repeaterEdit = {};
        this.__repeaterLoadedEntry = entryId;
      }
      this.__enhanceSettingsPage();
      if (!this.__repeaterStatus && !this.__repeaterLoading) {
        void this.__loadRepeaterStatus();
      }
      if (this.__managedDevicesLoadedEntry !== entryId && !this.__managedDevicesLoading) {
        void this.__loadManagedDevices();
      }
      if (this.__scopesLoadedEntry !== entryId) {
        void this.__loadScopes();
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
      const overlay = this.__ensureNeighborsOverlay(container);
      this.__renderHiveNeighbors(overlay);

      if (!this.__hiveNeighbors && !this.__hiveNeighborsLoading) {
        void this.__loadHiveNeighbors();
      }
    }
  }

  __ensureTabs(root) {
    const tabBar = root.querySelector(".tab-bar");
    if (!tabBar) return;

    // Never move/remove Lit-managed tab buttons. Moving them with appendChild()
    // breaks Lit's internal child-part bookkeeping after the injected Vizinhos
    // page renders, which can leave the original tabs visually present but
    // no longer navigable.
    const buttons = [...tabBar.querySelectorAll("button")];
    const byLabel = (...labels) => buttons.find((button) =>
      labels.includes(button.textContent?.trim())
    );

    const settings = byLabel("Settings", "Dispositivo");
    const chat = byLabel("Chat", "Chat & Canais");
    const nodes = byLabel("Nodes", "Nós");
    const devices = byLabel("Devices");
    let neighbors = byLabel("Vizinhos");

    if (settings) {
      settings.textContent = "Dispositivo";
      settings.style.order = "1";
    }
    if (chat) {
      chat.textContent = "Chat & Canais";
      chat.style.order = "2";
    }
    if (nodes) {
      nodes.textContent = "Nós";
      nodes.style.order = "3";
    }

    // The committed production bundle still contains the old Devices tab.
    // Reuse that existing Lit-managed button as Vizinhos instead of deleting
    // it and inserting/moving DOM nodes. Its original click sets "devices";
    // this listener runs immediately afterwards and changes the final state
    // to "neighbors" before Lit performs the batched update.
    if (!neighbors && devices) {
      neighbors = devices;
      neighbors.textContent = "Vizinhos";
      neighbors.dataset.hiveNeighborsTab = "1";

      if (!neighbors.dataset.hiveNeighborsBound) {
        neighbors.dataset.hiveNeighborsBound = "1";
        neighbors.addEventListener("click", () => {
          this._activeTab = "neighbors";
          this.requestUpdate();
        });
      }
    }

    // Fallback for a future bundle that has neither the legacy Devices button
    // nor the canonical Vizinhos button. Normally this branch is never used.
    if (!neighbors) {
      neighbors = document.createElement("button");
      neighbors.dataset.hiveNeighborsTab = "1";
      neighbors.textContent = "Vizinhos";
      neighbors.addEventListener("click", () => {
        this._activeTab = "neighbors";
        this.requestUpdate();
      });
      tabBar.appendChild(neighbors);
    }

    neighbors.style.order = "4";
    neighbors.classList.toggle("active", this._activeTab === "neighbors");

    // If the legacy Devices handler ran first, make sure its active class
    // cannot survive once this button is acting as Vizinhos.
    if (this._activeTab !== "neighbors") {
      neighbors.classList.remove("active");
    }
  }

  __ensureRepeaterStyles(root) {
    if (root.querySelector("#meshcore-repeater-fork-styles")) return;

    const style = document.createElement("style");
    style.id = "meshcore-repeater-fork-styles";
    style.textContent = `
      .hivefw-header-logo {
        display:inline-block;
        width:128px;
        height:13px;
        flex:0 0 auto;
        background:var(--primary-text-color);
        -webkit-mask:url('/meshcore_chat_panel/hivefw-wordmark.png') center/contain no-repeat;
        mask:url('/meshcore_chat_panel/hivefw-wordmark.png') center/contain no-repeat;
      }
      .hivefw-header-product {
        font-weight:600;
        white-space:nowrap;
      }
      .panel-title {
        display:flex !important;
        align-items:center;
        gap:10px;
      }

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

      .page-container {
        position: relative;
      }
      .hive-neighbors-overlay {
        position: absolute;
        inset: 0;
        z-index: 20;
        overflow: auto;
        background: var(--primary-background-color);
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

  __enhanceSettingsPage() {
    const settingsPage = this.shadowRoot?.querySelector("meshcore-settings-page");
    const sroot = settingsPage?.shadowRoot;
    if (!sroot) return;

    if (this.__settingsObservedRoot !== sroot) {
      this.__settingsObserver?.disconnect();
      this.__settingsObservedRoot = sroot;
      this.__settingsObserver = new MutationObserver(() => {
        queueMicrotask(() => {
          if (this._activeTab === "settings") this.__enhanceSettingsPage();
        });
      });
    }

    // Ignore mutations caused by our own injected cards. Reconnect the
    // observer only after rendering so it reacts to Lit replacing Settings,
    // not to replaceChildren()/appendChild() below.
    this.__settingsObserver?.disconnect();

    if (!sroot.querySelector("#hive-settings-extension-style")) {
      const style = document.createElement("style");
      style.id = "hive-settings-extension-style";
      style.textContent = `
        .hive-settings-pill {
          display:inline-flex;align-items:center;gap:6px;padding:4px 8px;
          border-radius:999px;font-size:11px;font-weight:650;
          background:var(--secondary-background-color);color:var(--secondary-text-color);
        }
        .hive-settings-pill.on { color:#2e7d32;background:rgba(76,175,80,.13); }
        .hive-settings-controls { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px; }
        .hive-settings-field { display:flex;flex-direction:column;gap:5px; }
        .hive-settings-field label { font-size:11px;color:var(--secondary-text-color); }
        .hive-settings-field input,.hive-settings-field select {
          box-sizing:border-box;width:100%;min-height:38px;border:1px solid var(--divider-color);
          border-radius:8px;padding:8px;background:var(--primary-background-color);
          color:var(--primary-text-color);font:inherit;font-size:12px;
        }
        .hive-settings-note { margin-top:10px;font-size:11px;line-height:1.45;color:var(--secondary-text-color); }
        @media(max-width:600px){.hive-settings-controls{grid-template-columns:1fr}}
      `;
      sroot.appendChild(style);
    }

    const grid = sroot.querySelector(".settings-grid");
    if (!grid) return;

    this.__renderSettingsRepeaterCard(sroot, grid);
    this.__renderRegionsScopesCard(sroot, grid);
    this.__renderManagedDevicesCard(sroot, grid);
    this.__enhanceCompanionMeta(sroot);
    this.__enhanceCompanionHero(sroot);
    this.__ensureRebootAction(sroot);

    this.__settingsObserver?.takeRecords();
    this.__settingsObserver?.observe(sroot, { childList: true, subtree: true });
  }

  __renderSettingsRepeaterCard(sroot, grid) {
    let card = sroot.querySelector("#hive-repeater-settings-card");
    if (!card) {
      card = document.createElement("div");
      card.id = "hive-repeater-settings-card";
      card.className = "device-section";
      grid.appendChild(card);
    }
    card.replaceChildren();

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = "Repeater";
    card.appendChild(title);

    if (this.__repeaterLoading && !this.__repeaterStatus) {
      card.append("A consultar o rádio…");
      return;
    }
    if (this.__repeaterError) {
      const error = document.createElement("div");
      error.style.color = "var(--error-color)";
      error.style.fontSize = "12px";
      error.textContent = this.__repeaterError;
      card.appendChild(error);
      return;
    }

    const status = this.__repeaterStatus;
    if (!status?.supported) {
      const note = document.createElement("div");
      note.className = "hive-settings-note";
      note.textContent = "Esta versão do Companion não anuncia suporte ao modo Repeater integrado.";
      card.appendChild(note);
      return;
    }

    const pill = document.createElement("div");
    pill.className = `hive-settings-pill ${status.repeat ? "on" : ""}`;
    pill.textContent = status.repeat ? "● Repeater ativo" : "● Repeater desligado";
    card.appendChild(pill);

    const controls = document.createElement("div");
    controls.className = "hive-settings-controls";
    controls.style.marginTop = "12px";

    const repeat = this.__settingsSelect(
      "Modo Repeater",
      [["1", "Ativo"], ["0", "Desligado"]],
      this.__repeaterEdit.repeat ? "1" : "0"
    );
    repeat.select.addEventListener("change", () => {
      this.__repeaterEdit.repeat = repeat.select.value === "1";
    });

    const multi = this.__settingsSelect(
      "Multi ACKs",
      [["1", "Ligado"], ["0", "Desligado"]],
      String(Number(this.__repeaterEdit.multi_acks ?? 0))
    );
    multi.select.addEventListener("change", () => {
      this.__repeaterEdit.multi_acks = Number(multi.select.value);
    });

    const rx = this.__settingsNumber("RX Delay", this.__repeaterEdit.rx_delay ?? 0, "0.001");
    rx.input.addEventListener("input", () => {
      this.__repeaterEdit.rx_delay = Number(rx.input.value);
    });

    const af = this.__settingsNumber("Airtime Factor", this.__repeaterEdit.airtime_factor ?? 0, "0.001");
    af.input.addEventListener("input", () => {
      this.__repeaterEdit.airtime_factor = Number(af.input.value);
    });

    controls.append(repeat.field, multi.field, rx.field, af.field);
    card.appendChild(controls);

    const actions = document.createElement("div");
    actions.className = "actions-row";
    actions.style.marginTop = "12px";
    const save = document.createElement("button");
    save.className = "action-btn";
    save.textContent = this.__repeaterLoading ? "Applying…" : "Apply Repeater Settings";
    save.disabled = this.__repeaterLoading;
    save.addEventListener("click", () => {
      void this.__saveRepeaterSettings({
        repeat: !!this.__repeaterEdit.repeat,
        multi_acks: Number(this.__repeaterEdit.multi_acks ?? 0),
        rx_delay: Number(this.__repeaterEdit.rx_delay ?? 0),
        airtime_factor: Number(this.__repeaterEdit.airtime_factor ?? 0),
      }, "Repeater settings applied.");
    });
    actions.appendChild(save);
    card.appendChild(actions);

    const note = document.createElement("div");
    note.className = "hive-settings-note";
    note.textContent =
      "RF, TX Power e Path Hash permanecem no cartão Radio; adverts, sync e reboot permanecem no cartão do Companion.";
    card.appendChild(note);
  }

  __enhanceCompanionHero(sroot) {
    const summary = sroot.querySelector("meshcore-node-summary");
    const nroot = summary?.shadowRoot;
    const hero = nroot?.querySelector(".hero-row");
    const status = this.__repeaterStatus;
    if (!hero || !status?.supported) return;

    let style = nroot.querySelector("#hivefw-cockpit-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "hivefw-cockpit-style";
      style.textContent = `
        .hero-row{grid-template-columns:repeat(5,minmax(0,1fr))!important;grid-auto-rows:1fr;gap:8px!important;align-items:stretch}
        .hero-tile{min-height:82px!important;height:100%;box-sizing:border-box;padding:9px 10px!important;gap:5px!important}
        .hero-tile-head{font-size:10px!important}
        .hero-tile-value .primary{font-size:18px!important}
        .hero-tile-value .secondary{font-size:11px!important}
        @container(max-width:1050px){.hero-row{grid-template-columns:repeat(4,minmax(0,1fr))!important}}
        @container(max-width:780px){.hero-row{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
        @container(max-width:560px){.hero-row{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
        @container(max-width:340px){.hero-row{grid-template-columns:1fr!important}}
      `;
      nroot.appendChild(style);
    }

    nroot.querySelectorAll(".hive-repeater-extra").forEach((el) => el.remove());

    const entities = Array.isArray(summary.entities) ? summary.entities : [];
    const findEntity = (needle) => entities.find((e) =>
      String(e.entity_id || "").includes(needle) ||
      String(e.label || "").toLowerCase().includes(needle.toLowerCase())
    );
    const stateFor = (info) => info ? this.hass?.states?.[info.entity_id] : null;
    const num = (info) => {
      const raw = stateFor(info)?.state;
      const v = Number.parseFloat(raw);
      return Number.isFinite(v) ? v : NaN;
    };
    const bandForTemp = (c) => c >= 0 && c <= 50 ? "good" : c > -10 && c <= 60 ? "warn" : "bad";
    const makeTile = (title, primary, secondary, value, min, max, band, marker, click) => {
      const tile = document.createElement("div");
      tile.className = "hero-tile hive-repeater-extra";
      tile.dataset.repeaterExtra = marker;
      if (click) { tile.style.cursor = "pointer"; tile.addEventListener("click", click); }
      const head = document.createElement("div");
      head.className = "hero-tile-head";
      const label = document.createElement("span"); label.textContent = title;
      const dot = document.createElement("span"); dot.className = `status-dot ${band}`;
      head.append(label,dot);
      const vr = document.createElement("div"); vr.className = "hero-tile-value";
      const main = document.createElement("span"); main.className = "primary"; main.textContent = primary; vr.appendChild(main);
      if (secondary) { const sub=document.createElement("span"); sub.className="secondary"; sub.textContent=secondary; vr.appendChild(sub); }
      const bar=document.createElement("meshcore-stat-bar"); bar.value=value; bar.min=min; bar.max=max; bar.band=band;
      tile.append(head,vr,bar); return tile;
    };

    const active=!!status.repeat;
    hero.appendChild(makeTile("Repeater mode",active?"Active":"Off","· Companion always on",active?100:0,0,100,active?"good":"info","state"));

    const uptimeSecs=Number(status.stats?.core?.uptime_secs);
    if(Number.isFinite(uptimeSecs)){
      const h=Math.max(0,uptimeSecs/3600);
      const d=h>=48?`${Math.floor(h/24)}d ${Math.floor(h%24)}h`:h>=1?`${Math.floor(h)}h ${Math.floor((h%1)*60)}m`:`${Math.floor(h*60)}m`;
      hero.appendChild(makeTile("Uptime",d,"",Math.min(h,168),0,168,h<1?"bad":h<24?"warn":"good","uptime"));
    }

    const clock=Number(status.clock?.timestamp);
    if(Number.isFinite(clock)&&clock>0){
      const drift=Number(status.clock?.drift_seconds||0), abs=Math.abs(drift);
      const t=new Date(clock*1000).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});
      hero.appendChild(makeTile("Device clock",t,abs<=2?"· synchronized":`· drift ${drift>0?"+":""}${drift}s`,Math.min(abs,120),0,120,abs<=2?"good":abs<=30?"warn":"bad","clock"));
    }

    const noise=Number(status.stats?.radio?.noise_floor);
    if(Number.isFinite(noise)) hero.appendChild(makeTile("Noise floor",`${Math.round(noise)} dBm`,"",noise,-130,-90,noise>-105?"bad":noise>-115?"warn":"good","noise"));

    const queue=Number(status.stats?.core?.queue_len);
    if(Number.isFinite(queue)) hero.appendChild(makeTile("TX queue",String(Math.round(queue)),"queued",Math.min(Math.max(queue,0),30),0,30,queue>10?"bad":queue>5?"warn":"good","queue"));

    const tempInfo=findEntity("temperature");
    const temp=num(tempInfo);
    if(Number.isFinite(temp)){
      const unit=stateFor(tempInfo)?.attributes?.unit_of_measurement||"°C";
      const c=String(unit).includes("F")?(temp-32)*5/9:temp;
      hero.appendChild(makeTile("Temperature",`${c.toFixed(1)} °C`,"",c,-20,60,bandForTemp(c),"temperature",()=>summary._fireMoreInfo?.(tempInfo.entity_id)));
    }

    let tokensInfo=findEntity("request_rate_limiter");
    if(!tokensInfo){
      const key=Object.keys(this.hass?.states||{}).find((id)=>id.includes("request_rate_limiter"));
      if(key) tokensInfo={entity_id:key,label:"Request Tokens"};
    }
    const tokens=num(tokensInfo);
    if(Number.isFinite(tokens)) hero.appendChild(makeTile("Request tokens",tokens.toFixed(1),"available",tokens,0,20,tokens<5?"bad":tokens<10?"warn":"good","request-tokens",()=>summary._fireMoreInfo?.(tokensInfo.entity_id)));

    const dcInfo=findEntity("discovered_contacts");
    const discovered=num(dcInfo);
    if(Number.isFinite(discovered)) hero.appendChild(makeTile("Discovered contacts",String(Math.round(discovered)),"seen",Math.min(discovered,1000),0,1000,"info","contacts",()=>summary._fireMoreInfo?.(dcInfo.entity_id)));

    const used=Number(status.battery?.used_kb), total=Number(status.battery?.total_kb);
    if(Number.isFinite(used)&&Number.isFinite(total)&&total>0){
      const pct=Math.max(0,Math.min(100,used/total*100));
      hero.appendChild(makeTile("Storage",`${pct.toFixed(0)}%`,`· ${used} / ${total} KB`,pct,0,100,pct>=90?"bad":pct>=70?"warn":"good","storage"));
    }

    const info=status.device_info||{};
    const model=info.model||status.model;
    if(model){
      hero.appendChild(makeTile("Hardware",String(model),info.firmware_build?`· ${info.firmware_build}`:"",100,0,100,"info","hardware"));
    }

    if(info.protocol_version!=null || info.path_hash_mode!=null){
      const pathLabels=["1 byte","2 bytes","3 bytes"];
      const protocol=info.protocol_version!=null?`v${info.protocol_version}`:"—";
      const path=info.path_hash_mode==null?"—":(pathLabels[Number(info.path_hash_mode)]||String(info.path_hash_mode));
      hero.appendChild(makeTile("Protocol / Path",protocol,`· ${path}`,100,0,100,"info","protocol"));
    }

    if(info.max_contacts!=null || info.max_channels!=null){
      hero.appendChild(makeTile(
        "Capacity",
        `${info.max_contacts??"—"} / ${info.max_channels??"—"}`,
        "contacts / channels",
        100,0,100,"info","capacity"
      ));
    }

    const repeatRanges=Array.isArray(status.allowed_repeat_frequencies)?status.allowed_repeat_frequencies:[];
    if(repeatRanges.length){
      const values=repeatRanges.map((r)=>{
        const lo=Number(r.min)/1000, hi=Number(r.max)/1000;
        return lo===hi?lo.toFixed(3):`${lo.toFixed(3)}–${hi.toFixed(3)}`;
      });
      hero.appendChild(makeTile(
        "Repeater frequencies",
        `${values[0]} MHz`,
        values.length>1?`· ${values.slice(1).join(" · ")} MHz`:"",
        100,0,100,"info","repeat-frequencies"
      ));
    }

        for(const row of nroot.querySelectorAll(".sensor-item")){
      const label=(row.querySelector(".si-label")?.textContent||"").trim().toLowerCase();
      row.style.display = label.includes("temperature") ? "none" : "";
    }
    for(const group of nroot.querySelectorAll(".group-label")){
      const name=(group.textContent||"").trim();
      if(name==="Radio · live"||name==="Radio · configuration"||name==="Identity"){
        group.style.display="none";
        let next=group.nextElementSibling;
        while(next && !next.classList.contains("group-label")){
          next.style.display="none";
          next=next.nextElementSibling;
        }
      }
    }
  }

  async __loadManagedDevices() {
    if (!this.hass || this.__managedDevicesLoading) return;
    this.__managedDevicesLoading = true;
    try {
      const msg = { type: "meshcore_chat/get_managed_devices" };
      const entryId = this.__entryId();
      if (entryId) msg.entry_id = entryId;
      const result = await this.hass.callWS(msg);
      this.__managedDevices = {
        repeaters: Array.isArray(result?.repeaters) ? result.repeaters : [],
        clients: Array.isArray(result?.clients) ? result.clients : [],
      };
      this.__managedDevicesLoadedEntry = entryId || null;
    } catch {
      this.__managedDevices = { repeaters: [], clients: [] };
      this.__managedDevicesLoadedEntry = this.__entryId() || null;
    } finally {
      this.__managedDevicesLoading = false;
      if (this._activeTab === "settings") this.__enhanceSettingsPage();
    }
  }

  __enhanceCompanionMeta(sroot) {
    const meta = sroot.querySelector(".device-meta");
    if (!meta) return;

    meta.querySelectorAll("[data-hive-meta]").forEach((node) => node.remove());

    const role = document.createElement("span");
    role.dataset.hiveMeta = "role";
    role.textContent = "HiveFW Companion-Repeater";

    const nodes = document.createElement("span");
    nodes.dataset.hiveMeta = "nodes";
    nodes.textContent = `Nós conhecidos: ${Array.isArray(this._contacts) ? this._contacts.length : 0}`;

    const channels = document.createElement("span");
    channels.dataset.hiveMeta = "channels";
    channels.textContent = `Canais: ${Array.isArray(this._channels) ? this._channels.length : 0}`;

    const existingCompanion = [...meta.querySelectorAll("span")]
      .find((span) => span.textContent?.trim() === "Companion");
    existingCompanion?.remove();

    meta.prepend(role);
    meta.append(nodes, channels);
  }

  __ensureRebootAction(sroot) {
    const deviceSection = sroot.querySelector(".device-section");
    if (!deviceSection) return;

    const actionRows = [...deviceSection.querySelectorAll(".actions-row")];
    const row = actionRows.find((el) =>
      [...el.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Trace")
    );
    if (!row) return;
    if ([...row.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Reboot")) return;

    const reboot = document.createElement("button");
    reboot.className = "action-btn danger";
    reboot.textContent = "Reboot";
    reboot.addEventListener("click", async () => {
      if (!window.confirm("Reiniciar agora o HiveFW?")) return;
      try {
        const msg = { type: "meshcore_chat/execute_local", command: "reboot" };
        const entryId = this.__entryId();
        if (entryId) msg.entry_id = entryId;
        await this.hass.callWS(msg);
      } catch (error) {
        const page = sroot.host;
        page?._showStatusMessage?.(`HiveFW: Reboot failed — ${String(error)}`, "error");
      }
    });
    row.appendChild(reboot);
  }

  __renderManagedDevicesCard(sroot, grid) {
    let card = sroot.querySelector("#hive-managed-devices-card");
    if (!card) {
      card = document.createElement("div");
      card.id = "hive-managed-devices-card";
      card.className = "device-section";
      card.style.gridColumn = "1 / -1";
      grid.appendChild(card);
    }
    card.replaceChildren();

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = "Equipamentos MeshCore geridos";
    card.appendChild(title);

    if (this.__managedDevicesLoading) {
      const loading = document.createElement("div");
      loading.className = "hive-settings-note";
      loading.textContent = "A carregar equipamentos remotos…";
      card.appendChild(loading);
      return;
    }

    const repeaters = this.__managedDevices.repeaters || [];
    const clients = this.__managedDevices.clients || [];
    const devices = [...repeaters, ...clients];

    if (!devices.length) {
      const empty = document.createElement("div");
      empty.className = "hive-settings-note";
      empty.textContent =
        "Nenhum equipamento remoto está configurado. O HiveFW local acima é o equipamento principal desta integração.";
      card.appendChild(empty);
      return;
    }

    const summary = document.createElement("div");
    summary.style.cssText = "display:flex;flex-wrap:wrap;gap:7px;margin-bottom:11px;";
    const online = devices.filter((d) => d.connected || d.status === "online").length;
    for (const text of [
      `${devices.length} equipamentos`,
      `${repeaters.length} repeaters`,
      `${clients.length} clients`,
      `${online} online`,
    ]) {
      const chip = document.createElement("span");
      chip.className = "hive-settings-pill";
      chip.textContent = text;
      summary.appendChild(chip);
    }
    card.appendChild(summary);

    const list = document.createElement("div");
    list.style.cssText =
      "display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:9px;";

    for (const device of devices) {
      const isOnline = device.connected || device.status === "online";
      const row = document.createElement("div");
      row.style.cssText =
        "display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:10px;padding:11px 12px;border:1px solid var(--divider-color);border-radius:10px;background:var(--primary-background-color);";

      const icon = document.createElement("div");
      icon.style.cssText =
        "width:34px;height:34px;display:grid;place-items:center;border-radius:9px;background:var(--secondary-background-color);color:var(--primary-color);font-weight:700;";
      icon.textContent = device.type === "repeater" ? "R" : "C";

      const info = document.createElement("div");
      const name = document.createElement("div");
      name.style.cssText =
        "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;";
      name.textContent = device.name || "MeshCore";
      const meta = document.createElement("div");
      meta.style.cssText =
        "margin-top:3px;color:var(--secondary-text-color);font-size:10px;";
      meta.textContent =
        `${device.type === "repeater" ? "Repeater" : "Client"} · ${String(device.pubkey_prefix || "").toUpperCase()}${device.firmware_version ? ` · FW ${device.firmware_version}` : ""}`;
      info.append(name, meta);

      const state = document.createElement("div");
      state.style.cssText =
        `font-size:10px;font-weight:650;white-space:nowrap;color:${isOnline ? "#2e7d32" : "var(--secondary-text-color)"};`;
      state.textContent = isOnline ? "● Online" : "● Offline";

      row.append(icon, info, state);
      list.appendChild(row);
    }

    card.appendChild(list);
  }

  async __loadScopes() {
    try {
      const msg = { type: "meshcore_chat/get_flood_scopes" };
      const entryId = this.__entryId();
      if (entryId) msg.entry_id = entryId;
      const result = await this.hass.callWS(msg);
      this.__scopeState = { scopes: result?.scopes || [], global: !!result?.global };
      this.__scopeDraft = this.__scopeState.scopes.join(", ");
      this.__scopeGlobal = this.__scopeState.global;
      this.__scopesLoadedEntry = entryId || null;
      if (!this.__regionTarget && this.__managedDevices.repeaters?.length) {
        this.__regionTarget = this.__managedDevices.repeaters[0].pubkey_prefix;
      }
      if (this._activeTab === "settings") this.__enhanceSettingsPage();
    } catch {
      this.__scopesLoadedEntry = this.__entryId() || null;
    }
  }

  __renderRegionsScopesCard(sroot, grid) {
    let card = sroot.querySelector("#hive-regions-scopes-card");
    if (!card) {
      card = document.createElement("div");
      card.id = "hive-regions-scopes-card";
      card.className = "device-section";
      grid.appendChild(card);
    }
    card.replaceChildren();

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = "Regions & Scopes";
    card.appendChild(title);

    const note = document.createElement("div");
    note.className = "hive-settings-note";
    note.textContent = "Scopes são locais ao HA/Companion. Regions remotas usam RF apenas quando pedires.";
    card.appendChild(note);

    const scopes = this.__settingsNumber("Flood scopes (comma separated)", this.__scopeDraft, "any");
    scopes.input.type = "text";
    scopes.input.value = this.__scopeDraft;
    scopes.input.addEventListener("input", () => { this.__scopeDraft = scopes.input.value; });
    card.appendChild(scopes.field);

    const global = document.createElement("label");
    global.style.cssText = "display:flex;align-items:center;gap:7px;font-size:12px;margin:9px 0;";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = this.__scopeGlobal;
    check.addEventListener("change", () => { this.__scopeGlobal = check.checked; });
    global.append(check, document.createTextNode("Permitir scope global (*)"));
    card.appendChild(global);

    const save = document.createElement("button");
    save.className = "action-btn";
    save.style.width = "100%";
    save.textContent = "Guardar Scopes";
    save.addEventListener("click", async () => {
      const msg = {
        type: "meshcore_chat/set_flood_scopes",
        scopes: this.__scopeDraft.split(",").map((s) => s.trim()).filter(Boolean),
        global: this.__scopeGlobal,
      };
      const entryId = this.__entryId(); if (entryId) msg.entry_id = entryId;
      try {
        const result = await this.hass.callWS(msg);
        this.__scopeDraft = (result?.scopes || []).join(", ");
        this.__scopeGlobal = !!result?.global;
        sroot.host?._showStatusMessage?.("Scopes guardados", "success");
      } catch (error) {
        sroot.host?._showStatusMessage?.(`Scopes: ${String(error)}`, "error");
      }
    });
    card.appendChild(save);

    const repeaters = this.__managedDevices.repeaters || [];
    if (!repeaters.length) {
      const local = document.createElement("div");
      local.className = "hive-settings-note";
      local.style.marginTop = "12px";
      local.textContent = "O HiveFW local não expõe edição da árvore de Regions pelo Companion Protocol atual.";
      card.appendChild(local);
      return;
    }

    const hr = document.createElement("div");
    hr.style.cssText = "height:1px;background:var(--divider-color);margin:14px 0;";
    card.appendChild(hr);

    const select = document.createElement("select");
    select.className = "form-select";
    for (const r of repeaters) {
      const o = document.createElement("option");
      o.value = r.pubkey_prefix;
      o.textContent = r.name;
      o.selected = r.pubkey_prefix === this.__regionTarget;
      select.appendChild(o);
    }
    select.addEventListener("change", () => { this.__regionTarget = select.value; this.__regionText = ""; });
    card.appendChild(select);

    const read = document.createElement("button");
    read.className = "action-btn";
    read.style.cssText = "width:100%;margin:8px 0;";
    read.textContent = this.__regionsBusy ? "A consultar…" : "Ler Regions (RF)";
    read.disabled = this.__regionsBusy;
    read.addEventListener("click", () => void this.__readRemoteRegions(sroot));
    card.appendChild(read);

    if (this.__regionText) {
      const pre = document.createElement("pre");
      pre.style.cssText = "white-space:pre-wrap;max-height:170px;overflow:auto;padding:9px;border-radius:7px;background:var(--secondary-background-color);font-size:11px;";
      pre.textContent = this.__regionText;
      card.appendChild(pre);
    }

    const op = document.createElement("select");
    op.className = "form-select";
    for (const [v, label] of [["allowf","Allow flood"],["denyf","Deny flood"],["home","Home region"],["default","Default scope"],["put","Create region"],["remove","Remove region"]]) {
      const o = document.createElement("option"); o.value=v; o.textContent=label; o.selected=v===this.__regionAction; op.appendChild(o);
    }
    op.addEventListener("change",()=>{this.__regionAction=op.value;});
    const name = document.createElement("input");
    name.className = "form-input";
    name.placeholder = "Region";
    name.value = this.__regionName;
    name.style.marginTop = "7px";
    name.addEventListener("input",()=>{this.__regionName=name.value;});
    card.append(op,name);

    const actions=document.createElement("div");
    actions.style.cssText="display:flex;gap:8px;margin-top:8px;";
    const apply=document.createElement("button"); apply.className="action-btn"; apply.style.flex="1"; apply.textContent="Aplicar Region";
    apply.addEventListener("click",()=>void this.__applyRemoteRegion(sroot));
    const persist=document.createElement("button"); persist.className="action-btn"; persist.style.flex="1"; persist.textContent="Guardar Regions";
    persist.addEventListener("click",()=>void this.__sendRemoteRegionCommand("region save",sroot));
    actions.append(apply,persist); card.appendChild(actions);
  }

  async __readRemoteRegions(sroot) {
    if (!this.__regionTarget || this.__regionsBusy) return;
    this.__regionsBusy = true; this.__renderRegionsScopesCard(sroot, sroot.querySelector(".settings-grid"));
    try {
      const msg={type:"meshcore_chat/get_remote_regions",target_prefix:this.__regionTarget};
      const entryId=this.__entryId(); if(entryId) msg.entry_id=entryId;
      const result=await this.hass.callWS(msg);
      this.__regionText=result?.regions||"";
    } catch(error) {
      sroot.host?._showStatusMessage?.(`Regions: ${String(error)}`,"error");
    } finally {
      this.__regionsBusy=false; this.__renderRegionsScopesCard(sroot,sroot.querySelector(".settings-grid"));
    }
  }

  async __sendRemoteRegionCommand(command,sroot) {
    if(!this.__regionTarget||this.__regionsBusy)return;
    this.__regionsBusy=true;
    try{
      const msg={type:"meshcore_chat/execute_remote",target_prefix:this.__regionTarget,command};
      const entryId=this.__entryId(); if(entryId) msg.entry_id=entryId;
      const result=await this.hass.callWS(msg);
      sroot.host?._showStatusMessage?.(result?.response||"Region command sent",result?.success?"success":"error");
      if(result?.success){
        this.__regionsBusy=false;
        await this.__readRemoteRegions(sroot);
      }
    }finally{this.__regionsBusy=false;}
  }

  async __applyRemoteRegion(sroot){
    let name=(this.__regionName||"").trim();
    if(this.__regionAction==="default"&&!name)name="<null>";
    if(!name)return;
    await this.__sendRemoteRegionCommand(`region ${this.__regionAction} ${name}`,sroot);
  }

  async __ensureMapLoaded() {
    if (customElements.get("ha-map")) return true;
    if (this.__mapLoadStarted) return false;
    this.__mapLoadStarted = true;
    try {
      if (window.loadCardHelpers) {
        const helpers = await window.loadCardHelpers();
        helpers.createCardElement?.({type:"map",entities:[]});
      }
      await Promise.race([customElements.whenDefined("ha-map"),new Promise((r)=>setTimeout(r,1500))]);
    } catch {}
    return !!customElements.get("ha-map");
  }

  __enhanceNodesPage() {
    const page=this.shadowRoot?.querySelector("meshcore-nodes-page");
    const nroot=page?.shadowRoot;
    if(!nroot)return;
    const header=nroot.querySelector(".nodes-header");
    const content=nroot.querySelector(".content-area");
    if(!header||!content)return;

    let style=nroot.querySelector("#hive-node-map-style");
    if(!style){
      style=document.createElement("style"); style.id="hive-node-map-style";
      style.textContent=`
        .hive-view-switch{display:flex;justify-content:center;gap:6px;padding:2px 0 4px}
        .hive-view-btn{min-width:92px;padding:7px 16px;border:1px solid var(--divider-color);border-radius:20px;background:transparent;color:var(--secondary-text-color);font-size:13px;font-weight:600;cursor:pointer}
        .hive-view-btn.active{color:#0277bd;border-color:rgba(3,169,244,.5);background:rgba(3,169,244,.15)}
        .hive-map-overlay{position:absolute;inset:0;z-index:10;background:var(--primary-background-color);overflow:hidden}
        .hive-map-overlay ha-map{display:block;width:100%;height:100%;min-height:420px}
        .hive-map-note{display:grid;place-items:center;height:100%;padding:24px;color:var(--secondary-text-color);text-align:center}
        .hive-map-count{position:absolute;top:10px;right:10px;z-index:30;padding:6px 9px;border-radius:14px;background:color-mix(in srgb,var(--card-background-color) 90%,transparent);color:var(--primary-text-color);border:1px solid var(--divider-color);font-size:11px;font-weight:600;box-shadow:0 1px 4px rgba(0,0,0,.18);pointer-events:none}
      `; nroot.appendChild(style);
    }

    let sw=nroot.querySelector(".hive-view-switch");
    if(!sw){
      sw=document.createElement("div"); sw.className="hive-view-switch";
      const list=document.createElement("button"); list.className="hive-view-btn"; list.textContent="Lista";
      const map=document.createElement("button"); map.className="hive-view-btn"; map.textContent="Mapa";
      list.addEventListener("click",()=>{
        this.__nodesView="list";
        this.__nodesMapOverlay?.remove();
        this.__nodesMapOverlay=null;
        this.__nodesMapElement=null;
        this.__enhanceNodesPage();
      });
      map.addEventListener("click",()=>{
        this.__nodesView="map";
        void this.__showNodesMap(page,nroot,content);
        this.__enhanceNodesPage();
      });
      sw.append(list,map); header.prepend(sw);
    }
    [...sw.querySelectorAll("button")].forEach((b,i)=>b.classList.toggle("active",(i===0&&this.__nodesView==="list")||(i===1&&this.__nodesView==="map")));
    for(const el of header.children){
      if(el===sw)continue;
      el.style.display=this.__nodesView==="map"?"none":"";
    }
    content.style.position="relative";
    if(this.__nodesView==="map") void this.__showNodesMap(page,nroot,content);
    else {
      this.__nodesMapOverlay?.remove();
      this.__nodesMapOverlay=null;
      this.__nodesMapElement=null;
    }
  }

  async __loadNodesMapContacts() {
    const entryId=this.__entryId()||null;
    if(this.__nodesMapLoading)return;
    if(this.__nodesMapLoadedEntry===entryId && Array.isArray(this.__nodesMapContacts))return;
    this.__nodesMapLoading=true;
    try{
      const msg={type:"meshcore_chat/get_contacts"};
      if(entryId)msg.entry_id=entryId;
      const result=await this.hass.callWS(msg);
      this.__nodesMapContacts=Array.isArray(result?.contacts)?result.contacts:[];
      this.__nodesMapLoadedEntry=entryId;
    }catch{
      // Fallback to the parent panel's full contact list.
      this.__nodesMapContacts=Array.isArray(this._contacts)?this._contacts:[];
      this.__nodesMapLoadedEntry=entryId;
    }finally{
      this.__nodesMapLoading=false;
    }
  }

  __validMapContacts() {
    const source=Array.isArray(this.__nodesMapContacts)
      ? this.__nodesMapContacts
      : (Array.isArray(this._contacts)?this._contacts:[]);
    return source.filter((c)=>{
      const lat=Number(c.adv_lat),lon=Number(c.adv_lon);
      return Number.isFinite(lat)&&Number.isFinite(lon)&&!(lat===0&&lon===0)
        &&lat>=-90&&lat<=90&&lon>=-180&&lon<=180;
    });
  }

  __mapLocations(contacts) {
    const active=new Set();
    const locations=contacts.map((c)=>{
      const id=c.public_key||c.pubkey_prefix;
      active.add(id);
      let marker=this.__nodesMapMarkerElements.get(id);
      if(!marker){
        marker=document.createElement("div");
        marker.style.cssText="width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:10px;font-weight:700;background:var(--primary-color,#03a9f4);color:#fff;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.35)";
        this.__nodesMapMarkerElements.set(id,marker);
      }
      marker.textContent=String(c.adv_name||c.pubkey_prefix||"?").slice(0,2).toUpperCase();
      return {id,location:[Number(c.adv_lat),Number(c.adv_lon)],element:marker,elementSize:[34,34],title:c.adv_name||c.pubkey_prefix,locationEditable:false,activatable:true};
    });
    for(const id of this.__nodesMapMarkerElements.keys()){
      if(!active.has(id))this.__nodesMapMarkerElements.delete(id);
    }
    return locations;
  }

  async __showNodesMap(page,nroot,content) {
    if(this.__nodesView!=="map")return;
    if(!this.__nodesMapOverlay?.isConnected){
      const overlay=document.createElement("div");
      overlay.className="hive-map-overlay";
      content.appendChild(overlay);
      this.__nodesMapOverlay=overlay;
    }
    const overlay=this.__nodesMapOverlay;

    if(!Array.isArray(this.__nodesMapContacts) || this.__nodesMapLoadedEntry!==(this.__entryId()||null)){
      if(!overlay.querySelector(".hive-map-note")){
        const note=document.createElement("div");note.className="hive-map-note";note.textContent="A carregar nós…";overlay.appendChild(note);
      }
      await this.__loadNodesMapContacts();
    }

    const ready=await this.__ensureMapLoaded();
    if(this.__nodesView!=="map"||!overlay.isConnected)return;

    const source=Array.isArray(this.__nodesMapContacts)?this.__nodesMapContacts:[];
    const contacts=this.__validMapContacts();

    if(!ready){
      overlay.replaceChildren();
      const note=document.createElement("div");note.className="hive-map-note";note.textContent="Não foi possível carregar o mapa do Home Assistant.";overlay.appendChild(note);
      return;
    }
    if(!contacts.length){
      overlay.replaceChildren();
      const note=document.createElement("div");note.className="hive-map-note";
      note.textContent=`0 nós com localização · ${source.length} nós no total. Os nós sem GPS anunciado continuam disponíveis em Lista.`;
      overlay.appendChild(note);
      return;
    }

    const signature=contacts.map((c)=>`${c.public_key||c.pubkey_prefix}:${c.adv_lat}:${c.adv_lon}`).join("|");
    if(this.__nodesMapElement?.isConnected && this.__nodesMapSignature===signature){
      return; // Important: do not tear down a live HA map on every Lit update.
    }

    if(!this.__nodesMapElement?.isConnected){
      overlay.replaceChildren();
      const count=document.createElement("div");count.className="hive-map-count";overlay.appendChild(count);
      const map=document.createElement("ha-map");
      map.autoFit=true;map.clusterMarkers=true;map.scaleRuler=true;
      map.addEventListener("editable-location-clicked",(e)=>{
        const id=e.detail?.id;
        const contact=this.__validMapContacts().find((c)=>(c.public_key||c.pubkey_prefix)===id);
        if(contact)page._openNodeDetail?.(contact);
      });
      overlay.appendChild(map);
      this.__nodesMapElement=map;
    }

    const count=overlay.querySelector(".hive-map-count");
    if(count)count.textContent=`${contacts.length} com localização · ${source.length} nós`;
    this.__nodesMapElement.editableLocations=this.__mapLocations(contacts);
    this.__nodesMapSignature=signature;
  }

    __settingsSelect(label, options, value) {
    const field = document.createElement("div");
    field.className = "hive-settings-field";
    const l = document.createElement("label");
    l.textContent = label;
    const select = document.createElement("select");
    for (const [v, text] of options) {
      const option = document.createElement("option");
      option.value = v;
      option.textContent = text;
      option.selected = v === value;
      select.appendChild(option);
    }
    field.append(l, select);
    return { field, select };
  }

  __settingsNumber(label, value, step) {
    const field = document.createElement("div");
    field.className = "hive-settings-field";
    const l = document.createElement("label");
    l.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
    input.step = step;
    input.value = String(value ?? "");
    field.append(l, input);
    return { field, input };
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
    if (this._activeTab === "settings") this.__enhanceSettingsPage();
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

  __ensureNeighborsOverlay(container) {
    if (this.__neighborsOverlay?.isConnected) return this.__neighborsOverlay;

    const overlay = document.createElement("div");
    overlay.className = "hive-neighbors-overlay";
    container.appendChild(overlay);
    this.__neighborsOverlay = overlay;
    return overlay;
  }

  __removeNeighborsOverlay() {
    if (this.__neighborsOverlay?.isConnected) {
      this.__neighborsOverlay.remove();
    }
    this.__neighborsOverlay = null;
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
    if (!container) return;
    const overlay = this.__ensureNeighborsOverlay(container);
    this.__renderHiveNeighbors(overlay);
  }

  __renderHiveNeighbors(container) {
    // 'container' is our private overlay, never Lit's .page-container.
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
