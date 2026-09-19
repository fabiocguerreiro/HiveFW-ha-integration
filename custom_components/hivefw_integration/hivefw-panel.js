import "./hivefw-integration-panel.js";

/*
 * HiveFW panel wrapper.
 *
 * The committed production bundle still comes from the upstream Chat panel.
 * This wrapper keeps that bundle intact and adds the Repeater-oriented pages
 * that are specific to this fork. Every status/configuration request uses the
 * existing Companion protocol exposed by the currently flashed radio.
 */
const BasePanel = customElements.get("hivefw-integration-panel");

if (!BasePanel) {
  throw new Error("hivefw-integration-panel failed to register");
}

class HiveFWPanel extends BasePanel {
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
    this.__nodesMapPane = null;
    this.__nodesMapElement = null;
    this.__nodesMapContacts = null;
    this.__nodesMapLoading = false;
    this.__nodesMapLoadedEntry = null;
    this.__nodesMapMarkerElements = new Map();
    this.__nodesLeafletMarkers = new Map();
    this.__nodesMapSignature = "";
    this.__nodesMapFocusId = "";
    this.__nodesPopupId = "";
    this.__nodesPersistentPopup = null;
    this.__nodesInitialViewport = null;
    this.__nodesMapInitialViewEntry = null;
    this.__mapLoadStarted = false;

    this.__diagHistory = null;
    this.__diagHistoryKey = "";
    this.__diagHistoryLoading = false;
    this.__diagHistoryAt = 0;
    this.__rxLogOverlay = null;
    this.__rxLogRows = [];
    this.__rxLogLoading = false;
    this.__rxLogLoadedEntry = null;
    this.__rxLogFilter = "";

    this.__lastSeenTraceResult = null;
    this.__lastTrace = null;
    this.__lastTraceLoadedEntry = null;
    this.__traceRouteLayer = null;
    this.__traceHistory = [];
    this.__traceHistoryLoadedEntry = null;
    this.__traceHistoryLoading = false;
    this.__traceHistoryPanel = null;
    this.__peerActivity = { peers: {}, links: {} };
    this.__peerActivityLoadedEntry = null;
    this.__peerActivityLoading = false;
    this.__traceMonitorOverlay = null;
    this.__traceMonitorTimer = null;
    this.__traceMonitorRunning = false;
    this.__traceMonitorBusy = false;
    this.__traceMonitorContact = null;
    this.__traceMonitorSamples = [];
    this.__traceMonitorInterval = 300;

    this.__hiveNeighbors = null;
    this.__hiveNeighborsLoading = false;
    this.__hiveNeighborsError = null;
    this.__hiveNeighborsSort = "recent";
    this.__hiveNeighborsLoadedEntry = null;
    this.__neighborsOverlay = null;

    this.__consoleHistory = [];
    this.__consoleCommandHistory = [];
    this.__consoleHistoryIndex = -1;
    this.__consolePresetName = "";
    this.__consolePresetValues = {};
    this.__consoleBusy = false;
    this.__consoleError = null;
    this.__consoleLoadedEntry = null;
    this.__consoleOverlay = null;

    this.__chatObservedRoot = null;
    this.__chatObserver = null;
  }

  updated(changedProperties) {
    if (super.updated) {
      super.updated(changedProperties);
    }
    this.__captureTraceResult();
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
      const radioName = this._selectedDevice?.name
        || this.__repeaterStatus?.name
        || this._config?.name
        || "HiveFW";
      title.replaceChildren();
      const product = document.createElement("span");
      product.className = "hivefw-header-product";
      product.textContent = radioName;
      title.appendChild(product);
      title.setAttribute("aria-label", radioName);
    }

    // The HiveFW radio is the integration's primary device. Keep the right
    // side of the header deliberately minimal: connection state + battery +
    // the white HiveFW wordmark requested for the product identity.
    root.querySelectorAll(".header-right .device-info-wrap").forEach((el) => el.remove());
    const connectionStatus = root.querySelector(".connection-status");
    if (connectionStatus) {
      const online = connectionStatus.classList.contains("online");
      let label = connectionStatus.querySelector(".hivefw-connection-label");
      if (!label) {
        for (const node of [...connectionStatus.childNodes]) {
          if (node.nodeType === Node.TEXT_NODE) node.remove();
        }
        label = document.createElement("span");
        label.className = "hivefw-connection-label";
        connectionStatus.appendChild(label);
      }
      label.textContent = online ? "Conectado" : "Desconectado";
    }

    const headerRight = root.querySelector(".header-right");
    if (headerRight && !headerRight.querySelector(".hivefw-header-brand-white")) {
      const brand = document.createElement("span");
      brand.className = "hivefw-header-brand-white";
      brand.setAttribute("aria-label", "HiveFW");
      brand.title = "HiveFW";
      headerRight.appendChild(brand);
    }

    this.__ensureRepeaterStyles(root);
    this.__ensureTabs(root);

    const entryId = this.__entryId() || null;
    if (this.__nodesMapLoadedEntry !== null && this.__nodesMapLoadedEntry !== entryId) {
      this.__nodesMapContacts = null;
      this.__nodesMapLoadedEntry = null;
      this.__nodesMapSignature = "";
      this.__nodesMapFocusId = "";
      this.__nodesPopupId = "";
      this.__nodesPersistentPopup = null;
      this.__nodesInitialViewport = null;
      this.__nodesMapInitialViewEntry = null;
    }

    if (this._activeTab !== "neighbors") {
      this.__removeNeighborsOverlay();
    }
    if (this._activeTab !== "console") {
      this.__removeConsoleOverlay();
    }
    if (this._activeTab !== "settings") {
      this.__closeMetricEditor();
      this.__closeRxLog();
    }

    if (this._activeTab === "chat") {
      this.__enhanceChatUi();
    } else if (this.__chatObserver) {
      this.__chatObserver.disconnect();
      this.__chatObserver = null;
      this.__chatObservedRoot = null;
    }

    if (this._activeTab === "nodes") {
      this.__enhanceNodesPage();
      return;
    }

    this.__cleanupNodesSplit();

    if (this._activeTab === "console") {
      if (entryId !== this.__consoleLoadedEntry) {
        this.__consoleHistory = [];
        this.__consoleError = null;
        this.__consoleLoadedEntry = entryId;
        void this.__loadConsoleHistory();
      }
      const container = root.querySelector(".page-container");
      if (!container) return;
      const overlay = this.__ensureConsoleOverlay(container);
      if (!overlay.querySelector(".hivefw-console-page")) {
        this.__renderConsole(overlay);
      }
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

  __enhanceChatUi() {
    const chat = this.shadowRoot?.querySelector("hivefw-integration-page");
    const croot = chat?.shadowRoot;
    if (!croot) return;

    if (!chat.__hiveMessageRouteBound) {
      chat.__hiveMessageRouteBound = true;
      chat.addEventListener("show-message-route", (event) => {
        const message = event?.detail?.message;
        if (message) void this.__showMessageRouteOnMap(message);
      });
    }

    if (this.__chatObservedRoot !== croot) {
      this.__chatObserver?.disconnect();
      this.__chatObservedRoot = croot;
      this.__chatObserver = new MutationObserver(() => {
        queueMicrotask(() => {
          if (this._activeTab === "chat") this.__enhanceChatUi();
        });
      });
      this.__chatObserver.observe(croot, { childList: true, subtree: true });
    }

    if (!croot.querySelector("#hivefw-chat-layout-style")) {
      const style = document.createElement("style");
      style.id = "hivefw-chat-layout-style";
      style.textContent = `
        .conversation-sidebar {
          width: 330px !important;
          min-width: 330px !important;
        }
        @media (max-width: 900px) {
          .conversation-sidebar {
            width: 300px !important;
            min-width: 300px !important;
          }
        }
        :host([narrow]) .conversation-sidebar {
          width: 100% !important;
          min-width: 0 !important;
        }
      `;
      croot.appendChild(style);
    }

    for (const bubbleHost of croot.querySelectorAll("meshcore-message-bubble")) {
      const broot = bubbleHost.shadowRoot;
      const group = bubbleHost.group;
      if (!broot || !group?.messages) continue;

      for (const msg of group.messages) {
        const bubble = broot.querySelector(`.bubble[data-msg-id="${CSS.escape(String(msg.id))}"]`);
        if (!bubble) continue;

        let meta = bubble.querySelector(".hivefw-rx-meta");
        const observations = Array.isArray(msg.rxLogData) ? msg.rxLogData : [];
        if (!observations.length || msg.isOutgoing || msg.isSystem) {
          meta?.remove();
          continue;
        }

        const best = observations[observations.length - 1] || {};
        const nodes = Array.isArray(best.path_nodes) ? best.path_nodes : [];
        const rawHops = Number(best.hop_count);
        const hops = Number.isFinite(rawHops)
          ? rawHops
          : (nodes.length ? nodes.length : 0);
        const rssi = Number(best.rssi);
        const snr = Number(best.snr);
        const parts = [hops + " hop" + (hops === 1 ? "" : "s")];
        if (Number.isFinite(rssi)) parts.push("RSSI " + Math.round(rssi) + " dBm");
        if (Number.isFinite(snr)) parts.push("SNR " + snr.toFixed(1) + " dB");

        if (!meta) {
          meta = document.createElement("div");
          meta.className = "hivefw-rx-meta";
          meta.style.cssText =
            "margin-top:3px;padding-top:3px;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent);" +
            "font:10px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;" +
            "opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
          bubble.appendChild(meta);
        }
        const nextText = parts.join(" · ");
        if (meta.textContent !== nextText) meta.textContent = nextText;
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
    let consoleTab = byLabel("Console");

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

    if (!consoleTab) {
      consoleTab = document.createElement("button");
      consoleTab.dataset.hiveConsoleTab = "1";
      consoleTab.textContent = "Console";
      consoleTab.addEventListener("click", () => {
        this._activeTab = "console";
        this.requestUpdate();
      });
      tabBar.appendChild(consoleTab);
    }
    consoleTab.style.order = "5";
    consoleTab.classList.toggle("active", this._activeTab === "console");

    const iconize = (button, iconName) => {
      if (!button) return;
      let icon = button.querySelector(".hivefw-tab-icon");
      if (!icon) {
        icon = document.createElement("ha-icon");
        icon.className = "hivefw-tab-icon";
        button.prepend(icon);
      }
      icon.setAttribute("icon", iconName);
    };

    iconize(settings, "mdi:tune-variant");
    iconize(chat, "mdi:message-text-outline");
    iconize(nodes, "mdi:map-marker-multiple-outline");
    iconize(neighbors, "mdi:access-point-network");
    iconize(consoleTab, "mdi:console-line");
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
        -webkit-mask:url('/hivefw_integration_panel/hivefw-wordmark.png') center/contain no-repeat;
        mask:url('/hivefw_integration_panel/hivefw-wordmark.png') center/contain no-repeat;
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
      .tab-bar button {
        display:flex !important;
        align-items:center;
        justify-content:center;
        gap:7px;
      }
      .hivefw-tab-icon {
        width:18px;
        height:18px;
        flex:0 0 auto;
        --mdc-icon-size:18px;
      }
      .header-right {
        display:flex !important;
        align-items:center;
        gap:10px;
      }
      .hivefw-header-brand-white {
        display:inline-block;
        width:112px;
        height:28px;
        flex:0 0 auto;
        border-radius:8px;
        background:rgba(17,17,17,.92);
        position:relative;
        box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);
      }
      .hivefw-header-brand-white::before {
        content:"";
        position:absolute;
        inset:6px 9px;
        background:#fff;
        -webkit-mask:url('/hivefw_integration_panel/hivefw-wordmark.png') center/contain no-repeat;
        mask:url('/hivefw_integration_panel/hivefw-wordmark.png') center/contain no-repeat;
      }
      :host([narrow]) .hivefw-header-brand-white {
        width:82px;
        height:26px;
      }

      .hivefw-console-page {
        width:100%;
        height:100%;
        overflow:auto;
        box-sizing:border-box;
        padding:18px;
        color:var(--primary-text-color);
        background:var(--primary-background-color);
      }
      .hivefw-console-wrap {
        width:min(1160px,100%);
        margin:0 auto;
        display:flex;
        flex-direction:column;
        gap:14px;
      }
      .hivefw-console-toolbar,
      .hivefw-console-input-row,
      .hivefw-console-quick {
        display:flex;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
      }
      .hivefw-console-card {
        border:1px solid var(--divider-color);
        border-radius:16px;
        background:var(--card-background-color);
        padding:16px;
      }
      .hivefw-console-output {
        min-height:260px;
        max-height:52vh;
        overflow:auto;
        border-radius:12px;
        background:#101418;
        color:#d9e2e8;
        padding:14px;
        font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace;
        font-size:12px;
        line-height:1.55;
      }
      .hivefw-console-entry {
        padding:9px 0;
        border-bottom:1px solid rgba(255,255,255,.08);
      }
      .hivefw-console-entry:last-child { border-bottom:none; }
      .hivefw-console-command { color:#7dd3fc; white-space:pre-wrap; }
      .hivefw-console-response { color:#e5e7eb; white-space:pre-wrap; margin-top:4px; }
      .hivefw-console-entry.error .hivefw-console-response { color:#fca5a5; }
      .hivefw-console-time { color:#7b8794; margin-right:7px; }
      .hivefw-console-input {
        flex:1 1 420px;
        min-width:180px;
        box-sizing:border-box;
        border:1px solid var(--divider-color);
        border-radius:11px;
        padding:11px 12px;
        background:var(--secondary-background-color);
        color:var(--primary-text-color);
        font:13px ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
        outline:none;
      }
      .hivefw-console-input:focus { border-color:var(--primary-color); }
      .hivefw-console-hint {
        color:var(--secondary-text-color);
        font-size:11px;
        line-height:1.45;
        margin-top:8px;
      }
      .hivefw-console-error {
        color:var(--error-color,#db4437);
        font-size:12px;
        margin-top:8px;
      }
      .hivefw-console-empty {
        color:#7b8794;
        padding:28px 8px;
        text-align:center;
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

  __metricLayoutStorageKey() {
    const entry=String(this.__entryId()||"default").replace(/[^a-zA-Z0-9_.-]/g,"_");
    return `hivefw.metric_layout.v1.${entry}`;
  }

  __loadMetricLayout() {
    try{
      const raw=localStorage.getItem(this.__metricLayoutStorageKey());
      if(!raw)return {order:[],hidden:[]};
      const parsed=JSON.parse(raw);
      return {
        order:Array.isArray(parsed?.order)?parsed.order.map(String):[],
        hidden:Array.isArray(parsed?.hidden)?parsed.hidden.map(String):[],
      };
    }catch{
      return {order:[],hidden:[]};
    }
  }

  __saveMetricLayout(layout) {
    try{
      localStorage.setItem(this.__metricLayoutStorageKey(),JSON.stringify({
        order:Array.isArray(layout?.order)?layout.order:[],
        hidden:Array.isArray(layout?.hidden)?layout.hidden:[],
      }));
    }catch{}
  }

  __metricTileInfo(hero) {
    const seen=new Map();
    return [...hero.querySelectorAll(":scope > .hero-tile")].map((tile,index)=>{
      let id=tile.dataset.hiveMetricId;
      const head=tile.querySelector(".hero-tile-head");
      const title=(head?.textContent||`Métrica ${index+1}`).trim().replace(/\s+/g," ");
      if(!id){
        if(tile.dataset.repeaterExtra){
          id=`hive:${tile.dataset.repeaterExtra}`;
        }else{
          const base=title.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
            .replace(/[^a-z0-9]+/g,"-")
            .replace(/^-|-$/g,"") || `metric-${index+1}`;
          const count=(seen.get(base)||0)+1;
          seen.set(base,count);
          id=`native:${base}${count>1?`-${count}`:""}`;
        }
        tile.dataset.hiveMetricId=id;
      }
      return {id,title,tile,index};
    });
  }

  __applyMetricLayout(hero) {
    const items=this.__metricTileInfo(hero);
    if(!items.length)return;
    const saved=this.__loadMetricLayout();
    const knownIds=new Set(items.map((item)=>item.id));
    const storedOrder=saved.order.filter((id)=>knownIds.has(id));
    const missing=items.map((item)=>item.id).filter((id)=>!storedOrder.includes(id));
    const order=[...storedOrder,...missing];
    const hidden=new Set(saved.hidden.filter((id)=>knownIds.has(id)));

    items.forEach(({id,tile})=>{
      const position=order.indexOf(id);
      tile.style.order=String(position<0?999:position);
      tile.style.display=hidden.has(id)?"none":"";
    });
  }

  __closeMetricEditor() {
    this.shadowRoot?.querySelector("#hive-metric-editor-overlay")?.remove();
  }

  __openMetricEditor(summary,nroot,hero) {
    this.__closeMetricEditor();
    const items=this.__metricTileInfo(hero);
    if(!items.length)return;

    const saved=this.__loadMetricLayout();
    const byId=new Map(items.map((item)=>[item.id,item]));
    const stored=saved.order.filter((id)=>byId.has(id));
    const order=[...stored,...items.map((item)=>item.id).filter((id)=>!stored.includes(id))];
    const hidden=new Set(saved.hidden.filter((id)=>byId.has(id)));

    const overlay=document.createElement("div");
    overlay.id="hive-metric-editor-overlay";
    overlay.style.cssText="position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.48);display:grid;place-items:center;padding:18px;box-sizing:border-box;";

    const dialog=document.createElement("div");
    dialog.style.cssText="width:min(520px,100%);max-height:min(78vh,720px);display:flex;flex-direction:column;background:var(--card-background-color,#fff);color:var(--primary-text-color,#222);border-radius:12px;box-shadow:0 10px 34px rgba(0,0,0,.28);overflow:hidden;";

    const header=document.createElement("div");
    header.style.cssText="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--divider-color,#ddd);";
    const title=document.createElement("div");
    title.textContent="Editar métricas";
    title.style.cssText="flex:1;font-size:16px;font-weight:700;";
    const close=document.createElement("button");
    close.type="button";
    close.textContent="✕";
    close.title="Fechar";
    close.style.cssText="width:32px;height:32px;border:0;border-radius:50%;background:transparent;color:inherit;font-size:17px;cursor:pointer;";
    close.addEventListener("click",()=>this.__closeMetricEditor());
    header.append(title,close);

    const help=document.createElement("div");
    help.textContent="Arrasta para ordenar. Usa o olho para mostrar ou ocultar cartões.";
    help.style.cssText="padding:10px 16px 5px;font-size:11px;color:var(--secondary-text-color,#777);";

    const list=document.createElement("div");
    list.style.cssText="overflow:auto;padding:7px 12px 12px;display:flex;flex-direction:column;gap:6px;";

    const persist=()=>{
      const ids=[...list.querySelectorAll("[data-metric-editor-id]")].map((row)=>row.dataset.metricEditorId);
      const hiddenIds=[...list.querySelectorAll("[data-metric-editor-id]")]
        .filter((row)=>row.dataset.hidden==="1")
        .map((row)=>row.dataset.metricEditorId);
      this.__saveMetricLayout({order:ids,hidden:hiddenIds});
      this.__applyMetricLayout(hero);
    };

    const buildRow=(id)=>{
      const info=byId.get(id);
      if(!info)return null;
      const row=document.createElement("div");
      row.dataset.metricEditorId=id;
      row.dataset.hidden=hidden.has(id)?"1":"0";
      row.draggable=true;
      row.style.cssText="display:grid;grid-template-columns:28px minmax(0,1fr) 30px 30px 38px;align-items:center;gap:6px;min-height:42px;padding:6px 8px;border:1px solid var(--divider-color,#ddd);border-radius:8px;background:var(--secondary-background-color,#f5f5f5);";

      const drag=document.createElement("span");
      drag.textContent="☰";
      drag.title="Arrastar";
      drag.style.cssText="cursor:grab;text-align:center;opacity:.65;font-size:17px;user-select:none;";

      const label=document.createElement("span");
      label.textContent=info.title;
      label.style.cssText="min-width:0;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

      const up=document.createElement("button");
      up.type="button"; up.textContent="↑"; up.title="Subir";
      const down=document.createElement("button");
      down.type="button"; down.textContent="↓"; down.title="Descer";
      for(const btn of [up,down]){
        btn.style.cssText="width:28px;height:28px;padding:0;border:1px solid var(--divider-color,#ccc);border-radius:6px;background:var(--card-background-color,#fff);color:inherit;cursor:pointer;";
      }

      const eye=document.createElement("button");
      eye.type="button";
      const refreshEye=()=>{
        const isHidden=row.dataset.hidden==="1";
        eye.textContent=isHidden?"◉":"👁";
        eye.title=isHidden?"Mostrar":"Ocultar";
        eye.style.opacity=isHidden?".48":"1";
        label.style.opacity=isHidden?".48":"1";
      };
      eye.style.cssText="width:36px;height:28px;padding:0;border:1px solid var(--divider-color,#ccc);border-radius:6px;background:var(--card-background-color,#fff);color:inherit;cursor:pointer;font-size:14px;";
      refreshEye();

      eye.addEventListener("click",()=>{
        row.dataset.hidden=row.dataset.hidden==="1"?"0":"1";
        refreshEye();
        persist();
      });
      up.addEventListener("click",()=>{
        const prev=row.previousElementSibling;
        if(prev){list.insertBefore(row,prev);persist();}
      });
      down.addEventListener("click",()=>{
        const next=row.nextElementSibling;
        if(next){list.insertBefore(next,row);persist();}
      });

      row.addEventListener("dragstart",(event)=>{
        event.dataTransfer?.setData("text/plain",id);
        if(event.dataTransfer)event.dataTransfer.effectAllowed="move";
        row.style.opacity=".55";
      });
      row.addEventListener("dragend",()=>{row.style.opacity="1";});
      row.addEventListener("dragover",(event)=>{
        event.preventDefault();
        if(event.dataTransfer)event.dataTransfer.dropEffect="move";
      });
      row.addEventListener("drop",(event)=>{
        event.preventDefault();
        const draggedId=event.dataTransfer?.getData("text/plain");
        if(!draggedId||draggedId===id)return;
        const dragged=list.querySelector(`[data-metric-editor-id="${CSS.escape(draggedId)}"]`);
        if(!dragged)return;
        const box=row.getBoundingClientRect();
        const before=event.clientY<box.top+box.height/2;
        list.insertBefore(dragged,before?row:row.nextElementSibling);
        persist();
      });

      row.append(drag,label,up,down,eye);
      return row;
    };

    order.forEach((id)=>{
      const row=buildRow(id);
      if(row)list.appendChild(row);
    });

    const footer=document.createElement("div");
    footer.style.cssText="display:flex;justify-content:space-between;gap:8px;padding:12px 16px;border-top:1px solid var(--divider-color,#ddd);";
    const reset=document.createElement("button");
    reset.type="button";
    reset.textContent="Repor padrão";
    reset.style.cssText="padding:7px 11px;border:1px solid var(--divider-color,#ccc);border-radius:7px;background:var(--card-background-color,#fff);color:inherit;font-size:12px;font-weight:600;cursor:pointer;";
    reset.addEventListener("click",()=>{
      try{localStorage.removeItem(this.__metricLayoutStorageKey());}catch{}
      this.__applyMetricLayout(hero);
      this.__closeMetricEditor();
      this.__openMetricEditor(summary,nroot,hero);
    });
    const done=document.createElement("button");
    done.type="button";
    done.textContent="Concluído";
    done.style.cssText="padding:7px 13px;border:1px solid var(--primary-color,#03a9f4);border-radius:7px;background:var(--primary-color,#03a9f4);color:#fff;font-size:12px;font-weight:700;cursor:pointer;";
    done.addEventListener("click",()=>this.__closeMetricEditor());
    footer.append(reset,done);

    dialog.append(header,help,list,footer);
    overlay.appendChild(dialog);
    overlay.addEventListener("click",(event)=>{
      if(event.target===overlay)this.__closeMetricEditor();
    });
    this.shadowRoot?.appendChild(overlay);
  }

  __ensureMetricEditor(summary,nroot,hero) {
    // Layout is always applied here. The editor itself is opened from the
    // existing Companion gear menu via "Editar Menu".
    nroot.querySelector(".hive-metric-toolbar")?.remove();
    nroot.querySelector("#hive-metric-editor-style")?.remove();
    this.__applyMetricLayout(hero);
  }

  __closeRxLog() {
    this.__rxLogOverlay?.remove();
    this.__rxLogOverlay=null;
  }

  __rxLogTime(value) {
    if(value==null||value==="")return "—";
    let date=new Date(value);
    if(Number.isNaN(date.getTime())){
      const numeric=Number(value);
      if(Number.isFinite(numeric))date=new Date(numeric*(numeric<1e12?1000:1));
    }
    return Number.isNaN(date.getTime())?String(value):date.toLocaleString();
  }

  async __loadRxLogRows() {
    if(!this.hass||this.__rxLogLoading)return;
    this.__rxLogLoading=true;
    try{
      const msg={type:"hivefw_integration/get_rx_log",limit:150,incoming_only:true};
      const entryId=this.__entryId();
      if(entryId)msg.entry_id=entryId;
      const result=await this.hass.callWS(msg);
      this.__rxLogRows=Array.isArray(result?.rows)?result.rows:[];
      this.__rxLogLoadedEntry=this.__entryId()||null;
    }catch(error){
      console.error("HiveFW RX Log failed:",error);
      this.__rxLogRows=[];
    }finally{
      this.__rxLogLoading=false;
      if(this.__rxLogOverlay?.isConnected)this.__renderRxLogOverlay();
      if(this._activeTab==="settings")this.__enhanceSettingsPage();
    }
  }

  __renderRxLogOverlay() {
    const overlay=this.__rxLogOverlay;
    if(!overlay)return;
    const dialog=overlay.querySelector(".hive-rxlog-dialog");
    if(!dialog)return;
    const oldFilter=dialog.querySelector(".hive-rxlog-filter")?.value||"";
    dialog.replaceChildren();

    const header=document.createElement("div");
    header.style.cssText="display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--divider-color,#ddd);";
    const title=document.createElement("div");
    title.textContent="RX Log";
    title.style.cssText="flex:1;font-size:16px;font-weight:700;";
    const refresh=document.createElement("button");
    refresh.type="button";refresh.textContent="Atualizar";
    refresh.style.cssText="padding:6px 9px;border:1px solid var(--divider-color,#ccc);border-radius:7px;background:var(--card-background-color,#fff);color:inherit;font-size:11px;cursor:pointer;";
    refresh.disabled=this.__rxLogLoading;
    refresh.addEventListener("click",()=>void this.__loadRxLogRows());
    const exportBtn=document.createElement("button");
    exportBtn.type="button";exportBtn.textContent="Exportar JSON";
    exportBtn.style.cssText=refresh.style.cssText;
    exportBtn.addEventListener("click",()=>{
      const blob=new Blob([JSON.stringify({rx_log:this.__rxLogRows},null,2)],{type:"application/json;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;link.download="hivefw_rx_log.json";document.body.appendChild(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    const close=document.createElement("button");
    close.type="button";close.textContent="✕";close.title="Fechar";
    close.style.cssText="width:30px;height:30px;border:0;border-radius:50%;background:transparent;color:inherit;font-size:17px;cursor:pointer;";
    close.addEventListener("click",()=>this.__closeRxLog());
    header.append(title,refresh,exportBtn,close);
    dialog.appendChild(header);

    const note=document.createElement("div");
    note.textContent="Observações de receção já guardadas no Home Assistant · sem tráfego RF adicional · máximo 150 linhas";
    note.style.cssText="padding:9px 16px 5px;font-size:10px;color:var(--secondary-text-color,#777);";
    dialog.appendChild(note);

    const filter=document.createElement("input");
    filter.className="hive-rxlog-filter";
    filter.type="search";filter.placeholder="Filtrar por nó, conversa, path ou texto…";filter.value=oldFilter;
    filter.style.cssText="box-sizing:border-box;margin:7px 16px 9px;width:calc(100% - 32px);padding:8px 10px;border:1px solid var(--divider-color,#ccc);border-radius:8px;background:var(--primary-background-color,#fff);color:var(--primary-text-color,#222);font:inherit;font-size:12px;";
    dialog.appendChild(filter);

    const body=document.createElement("div");
    body.style.cssText="overflow:auto;padding:0 12px 12px;";
    dialog.appendChild(body);

    const renderRows=()=>{
      body.replaceChildren();
      const q=filter.value.trim().toLowerCase();
      const rows=this.__rxLogRows.filter((row)=>{
        if(!q)return true;
        const hay=[row.sender,row.conversation_name,row.pubkey_prefix,row.text,row.path,Array.isArray(row.path_nodes)?row.path_nodes.join(","):""].join(" ").toLowerCase();
        return hay.includes(q);
      });
      if(this.__rxLogLoading&&!rows.length){
        const loading=document.createElement("div");loading.textContent="A carregar…";loading.style.cssText="padding:24px;text-align:center;color:var(--secondary-text-color,#777);";body.appendChild(loading);return;
      }
      if(!rows.length){
        const empty=document.createElement("div");empty.textContent="Sem observações RX guardadas para este filtro.";empty.style.cssText="padding:24px;text-align:center;color:var(--secondary-text-color,#777);";body.appendChild(empty);return;
      }
      for(const row of rows){
        const item=document.createElement("div");
        item.style.cssText="display:grid;grid-template-columns:145px minmax(130px,1fr) minmax(180px,1.5fr) auto;gap:9px;align-items:start;padding:8px 6px;border-top:1px solid var(--divider-color,#e5e5e5);font-size:11px;";
        const time=document.createElement("div");time.textContent=this.__rxLogTime(row.timestamp);time.style.color="var(--secondary-text-color,#777)";
        const who=document.createElement("div");
        const sender=document.createElement("div");sender.textContent=row.sender||row.conversation_name||"—";sender.style.fontWeight="650";
        const conv=document.createElement("div");conv.textContent=row.conversation_name||"";conv.style.cssText="margin-top:2px;font-size:9px;color:var(--secondary-text-color,#777);";who.append(sender,conv);
        const route=document.createElement("div");
        const pathNodes=Array.isArray(row.path_nodes)?row.path_nodes.join(" → "):String(row.path||"");
        route.textContent=pathNodes||row.text||"—";
        route.style.cssText="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow-wrap:anywhere;";
        const radio=document.createElement("div");
        const stats=[];
        if(Number.isFinite(Number(row.rssi)))stats.push("RSSI "+Number(row.rssi).toFixed(0));
        if(Number.isFinite(Number(row.snr)))stats.push("SNR "+Number(row.snr).toFixed(1));
        if(Number.isFinite(Number(row.hop_count)))stats.push(Number(row.hop_count)+" hops");
        radio.textContent=stats.join(" · ")||"—";radio.style.whiteSpace="nowrap";
        item.append(time,who,route,radio);body.appendChild(item);
      }
    };
    filter.addEventListener("input",renderRows);
    renderRows();
  }

  __openRxLog(settingsPage) {
    this.__closeRxLog();
    settingsPage._settingsModalOpen=false;
    settingsPage.requestUpdate?.();
    const overlay=document.createElement("div");
    overlay.id="hive-rxlog-overlay";
    overlay.style.cssText="position:fixed;inset:0;z-index:10060;background:rgba(0,0,0,.48);display:grid;place-items:center;padding:18px;box-sizing:border-box;";
    const dialog=document.createElement("div");
    dialog.className="hive-rxlog-dialog";
    dialog.style.cssText="width:min(980px,100%);max-height:min(84vh,780px);display:flex;flex-direction:column;background:var(--card-background-color,#fff);color:var(--primary-text-color,#222);border-radius:12px;box-shadow:0 10px 34px rgba(0,0,0,.28);overflow:hidden;";
    overlay.appendChild(dialog);
    overlay.addEventListener("click",(event)=>{if(event.target===overlay)this.__closeRxLog();});
    this.shadowRoot?.appendChild(overlay);
    this.__rxLogOverlay=overlay;
    this.__renderRxLogOverlay();
    void this.__loadRxLogRows();
  }

  __ensureMetricSettingsMenu(settingsPage,sroot) {
    const modal=sroot.querySelector('.modal-card[data-a11y="companion-settings"]');
    const body=modal?.querySelector(".modal-body");
    if(!body)return;

    // Command execution now lives in the dedicated top-level Console tab.
    // Remove the old modal launcher so Device contains device settings only.
    for (const button of body.querySelectorAll(".modal-action")) {
      if (button.textContent?.trim() === "Issue Command") button.remove();
    }

    let edit=body.querySelector(".hive-edit-menu-action");
    if(!edit){
      edit=document.createElement("button");
      edit.type="button";
      edit.className="modal-action hive-edit-menu-action";
      edit.innerHTML='<span class="modal-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25M20.71 7.04c.39-.39.39-1.03 0-1.42l-2.34-2.34a.995.995 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.82z"/></svg></span>Editar Menu';
      edit.addEventListener("click",(event)=>{
        event.preventDefault();event.stopPropagation();
        settingsPage._settingsModalOpen=false;settingsPage.requestUpdate?.();
        window.setTimeout(()=>{
          const summary=sroot.querySelector("meshcore-node-summary");
          const nroot=summary?.shadowRoot;const hero=nroot?.querySelector(".hero-row");
          if(summary&&nroot&&hero)this.__openMetricEditor(summary,nroot,hero);
        },40);
      });
      body.prepend(edit);
    }

    body.querySelector(".hive-rxlog-action")?.remove();
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
    this.__renderRxLogCard(sroot, grid);
    this.__renderManagedDevicesCard(sroot, grid);
    this.__enhanceCompanionMeta(sroot);
    this.__enhanceCompanionHero(sroot);
    this.__ensureMetricSettingsMenu(settingsPage,sroot);
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

  __findDeviceMetricEntity(summary, needle) {
    const wanted=String(needle||"").toLowerCase();
    const entities=Array.isArray(summary?.entities)?summary.entities:[];
    const direct=entities.find((entity)=>
      String(entity?.entity_id||"").toLowerCase().includes(wanted) ||
      String(entity?.label||"").toLowerCase().includes(wanted)
    );
    if(direct?.entity_id && this.hass?.states?.[direct.entity_id])return direct.entity_id;

    const prefix=String(this._selectedDevice?.pubkey_prefix||this._selectedDevice?.pubkey||"")
      .slice(0,6).toLowerCase();
    const name=String(this._selectedDevice?.name||"").toLowerCase()
      .replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
    const ids=Object.keys(this.hass?.states||{});
    return ids.find((id)=>{
      const lower=id.toLowerCase();
      if(!lower.includes(wanted))return false;
      if(prefix && lower.includes(prefix))return true;
      return !!name && lower.includes(name);
    })||null;
  }

  __readMetricState(summary, needle) {
    const entityId=this.__findDeviceMetricEntity(summary,needle);
    if(!entityId)return {entityId:null,value:NaN,state:null};
    const state=this.hass?.states?.[entityId]||null;
    const value=Number.parseFloat(state?.state);
    return {entityId,value:Number.isFinite(value)?value:NaN,state};
  }

  async __loadDiagnosticHistory(summary) {
    if(!this.hass||!summary)return;
    const entry=String(this.__entryId()||"default");
    const wanted=[
      ["Noise floor","noise_floor","dBm"],
      ["RSSI","last_rssi","dBm"],
      ["SNR","last_snr","dB"],
      ["RX rate","nb_recv_rate","msg/min"],
      ["TX rate","nb_sent_rate","msg/min"],
      ["RX errors","recv_errors_rate","msg/min"],
      ["TX airtime","airtime_utilization","%"],
      ["RX airtime","rx_airtime_utilization","%"],
    ];
    const metrics=wanted.map(([label,key,unit])=>{
      const entityId=this.__findDeviceMetricEntity(summary,key);
      return entityId?{label,key,unit,entityId}:null;
    }).filter(Boolean);
    const key=entry+"|"+metrics.map((metric)=>metric.entityId).join("|");
    const fresh=this.__diagHistoryKey===key && Date.now()-this.__diagHistoryAt<5*60*1000;
    if(fresh||this.__diagHistoryLoading)return;
    if(!metrics.length){
      this.__diagHistory={metrics:[],series:{}};
      this.__diagHistoryKey=key;
      this.__diagHistoryAt=Date.now();
      return;
    }

    this.__diagHistoryLoading=true;
    try{
      const end=new Date();
      const start=new Date(end.getTime()-48*60*60*1000);
      const statistics=await this.hass.callWS({
        type:"recorder/statistics_during_period",
        start_time:start.toISOString(),
        end_time:end.toISOString(),
        statistic_ids:metrics.map((metric)=>metric.entityId),
        period:"hour",
      });
      const series={};
      for(const metric of metrics){
        const rows=Array.isArray(statistics?.[metric.entityId])?statistics[metric.entityId]:[];
        const values=rows.map((row)=>({
          t:new Date(row?.start??row?.start_time??0).getTime(),
          v:Number(row?.mean??row?.state??row?.sum),
        })).filter((point)=>Number.isFinite(point.t)&&Number.isFinite(point.v));
        series[metric.entityId]=values;
      }
      this.__diagHistory={metrics,series};
      this.__diagHistoryKey=key;
      this.__diagHistoryAt=Date.now();
    }catch(error){
      console.debug("HiveFW diagnostics history unavailable:",error);
      this.__diagHistory={metrics:[],series:{}};
      this.__diagHistoryKey=key;
      this.__diagHistoryAt=Date.now();
    }finally{
      this.__diagHistoryLoading=false;
      if(this._activeTab==="settings")queueMicrotask(()=>this.__enhanceSettingsPage());
    }
  }

  __sparklineSvg(values) {
    const NS="http://www.w3.org/2000/svg";
    const svg=document.createElementNS(NS,"svg");
    svg.setAttribute("viewBox","0 0 220 54");
    svg.setAttribute("preserveAspectRatio","none");
    svg.style.cssText="display:block;width:100%;height:54px;overflow:visible;";
    if(!Array.isArray(values)||values.length<2)return svg;
    const nums=values.map((point)=>Number(point.v)).filter(Number.isFinite);
    if(nums.length<2)return svg;
    let min=Math.min(...nums),max=Math.max(...nums);
    if(min===max){min-=1;max+=1;}
    const points=values.map((point,index)=>{
      const x=(index/(values.length-1))*218+1;
      const y=52-((Number(point.v)-min)/(max-min))*48;
      return x.toFixed(2)+","+y.toFixed(2);
    }).join(" ");
    const grid=document.createElementNS(NS,"line");
    grid.setAttribute("x1","0");grid.setAttribute("x2","220");
    grid.setAttribute("y1","52");grid.setAttribute("y2","52");
    grid.setAttribute("stroke","var(--divider-color,#ddd)");
    grid.setAttribute("stroke-width","1");
    const line=document.createElementNS(NS,"polyline");
    line.setAttribute("points",points);
    line.setAttribute("fill","none");
    line.setAttribute("stroke","var(--primary-color,#03a9f4)");
    line.setAttribute("stroke-width","2");
    line.setAttribute("vector-effect","non-scaling-stroke");
    svg.append(grid,line);
    return svg;
  }

  __renderDiagnosticHistory(summary,nroot,hero) {
    let panel=nroot.querySelector(".hive-diagnostics-history");
    if(!panel){
      panel=document.createElement("section");
      panel.className="hive-diagnostics-history";
      panel.style.cssText="margin:4px 0 14px;padding:11px 12px;border:1px solid var(--divider-color,#ddd);border-radius:10px;background:var(--card-background-color,#fff);";
      hero.insertAdjacentElement("afterend",panel);
    }
    panel.replaceChildren();
    const title=document.createElement("div");
    title.style.cssText="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px;";
    const heading=document.createElement("strong");
    heading.textContent="Histórico RF / tráfego · 48h";
    heading.style.cssText="font-size:11px;text-transform:uppercase;letter-spacing:.45px;";
    const source=document.createElement("span");
    source.textContent="Recorder do Home Assistant";
    source.style.cssText="font-size:9px;color:var(--secondary-text-color,#777);";
    title.append(heading,source);
    panel.appendChild(title);

    const history=this.__diagHistory;
    if(this.__diagHistoryLoading && !history){
      const loading=document.createElement("div");
      loading.textContent="A carregar histórico…";
      loading.style.cssText="padding:8px 0;font-size:11px;color:var(--secondary-text-color,#777);";
      panel.appendChild(loading);
      return;
    }
    const metrics=(history?.metrics||[]).filter((metric)=>
      Array.isArray(history?.series?.[metric.entityId]) && history.series[metric.entityId].length>1
    );
    if(!metrics.length){panel.style.display="none";return;}
    panel.style.display="block";
    const grid=document.createElement("div");
    grid.style.cssText="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:8px;";
    for(const metric of metrics){
      const values=history.series[metric.entityId];
      const nums=values.map((point)=>Number(point.v)).filter(Number.isFinite);
      const last=nums[nums.length-1];
      const min=Math.min(...nums),max=Math.max(...nums);
      const card=document.createElement("div");
      card.style.cssText="min-width:0;padding:8px;border:1px solid transparent;border-radius:8px;background:var(--secondary-background-color,#f5f5f5);cursor:pointer;";
      card.title="Abrir entidade "+metric.entityId;
      card.addEventListener("click",()=>summary?._fireMoreInfo?.(metric.entityId));
      const top=document.createElement("div");
      top.style.cssText="display:flex;justify-content:space-between;gap:6px;font-size:10px;";
      const label=document.createElement("span");label.textContent=metric.label;label.style.fontWeight="650";
      const value=document.createElement("span");
      value.textContent=Number(last).toFixed(metric.unit==="msg/min"?1:0)+" "+metric.unit;
      value.style.fontVariantNumeric="tabular-nums";
      top.append(label,value);
      card.append(top,this.__sparklineSvg(values));
      const range=document.createElement("div");
      range.textContent="mín "+min.toFixed(1)+" · máx "+max.toFixed(1);
      range.style.cssText="font-size:9px;color:var(--secondary-text-color,#777);text-align:right;";
      card.appendChild(range);grid.appendChild(card);
    }
    panel.appendChild(grid);
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
        .hero-row{
          grid-template-columns:repeat(6,minmax(0,1fr))!important;
          grid-auto-flow:dense;
          gap:7px!important;
          align-items:stretch;
        }
        .hero-row > .hero-tile,
        .hero-row > .hero-tile.hive-metric-compact{
          grid-column:span 1;
          min-width:0;
        }
        .hero-row > .hero-tile[data-repeater-extra="repeat-frequencies"]{
          grid-column:span 2;
        }
        .hero-tile{
          min-height:70px!important;
          height:100%;
          box-sizing:border-box;
          padding:8px 9px!important;
          gap:4px!important;
          border-radius:10px!important;
        }
        .hero-tile-head{
          font-size:8px!important;
          letter-spacing:.035em!important;
          line-height:1.12!important;
          white-space:normal!important;
        }
        .hero-tile-value{
          gap:3px!important;
          min-width:0;
        }
        .hero-tile-value .primary{
          font-size:15px!important;
          line-height:1.05!important;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .hero-tile-value .secondary{
          font-size:8px!important;
          line-height:1.15!important;
          opacity:.8;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .hero-tile.hive-metric-compact{
          padding:8px 9px!important;
        }
        .hero-tile.hive-metric-compact .hero-tile-head{
          font-size:8px!important;
        }
        .hero-tile.hive-metric-compact .hero-tile-value .primary{
          font-size:15px!important;
        }
        .hero-tile meshcore-stat-bar{
          margin-top:auto!important;
        }
        @container(max-width:1050px){
          .hero-row{grid-template-columns:repeat(4,minmax(0,1fr))!important}
        }
        @container(max-width:650px){
          .hero-row{grid-template-columns:repeat(2,minmax(0,1fr))!important}
          .hero-row > .hero-tile[data-repeater-extra="repeat-frequencies"]{grid-column:span 2}
        }
        @container(max-width:390px){
          .hero-row{grid-template-columns:1fr!important}
          .hero-row > .hero-tile,
          .hero-row > .hero-tile.hive-metric-compact,
          .hero-row > .hero-tile[data-repeater-extra="repeat-frequencies"]{grid-column:1!important}
        }
      `;
      nroot.appendChild(style);
    }

    nroot.querySelectorAll(".hive-repeater-extra").forEach((el) => el.remove());

    const entities = Array.isArray(summary.entities) ? summary.entities : [];
    const findEntity = (needle) => entities.find((e) =>
      String(e.entity_id || "").includes(needle) ||
      String(e.label || "").toLowerCase().includes(needle.toLowerCase())
    );
    const entityFor = (...needles) => {
      for (const needle of needles) {
        const info=findEntity(needle);
        if(info?.entity_id && this.hass?.states?.[info.entity_id])return info;
      }
      return null;
    };
    const clickEntityId = (entityId) => entityId && this.hass?.states?.[entityId]
      ? ()=>summary._fireMoreInfo?.(entityId)
      : null;
    const clickEntity = (...needles) => {
      const info=entityFor(...needles);
      return info?clickEntityId(info.entity_id):null;
    };
    const stateFor = (info) => info ? this.hass?.states?.[info.entity_id] : null;
    const num = (info) => {
      const raw = stateFor(info)?.state;
      const v = Number.parseFloat(raw);
      return Number.isFinite(v) ? v : NaN;
    };
    const bandForTemp = (c) => c >= 0 && c <= 50 ? "good" : c > -10 && c <= 60 ? "warn" : "bad";
    const makeTile = (title, primary, secondary, value, min, max, band, marker, click, size="normal") => {
      const tile = document.createElement("div");
      tile.className = `hero-tile hive-repeater-extra${size==="compact"?" hive-metric-compact":""}`;
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
    hero.appendChild(makeTile("Repeater mode",active?"Active":"Off","· Companion always on",active?100:0,0,100,active?"good":"info","state",clickEntity("repeater_mode")));

    const uptimeSecs=Number(status.stats?.core?.uptime_secs);
    if(Number.isFinite(uptimeSecs)){
      const h=Math.max(0,uptimeSecs/3600);
      const d=h>=48?`${Math.floor(h/24)}d ${Math.floor(h%24)}h`:h>=1?`${Math.floor(h)}h ${Math.floor((h%1)*60)}m`:`${Math.floor(h*60)}m`;
      hero.appendChild(makeTile("Uptime",d,"",Math.min(h,168),0,168,h<1?"bad":h<24?"warn":"good","uptime",clickEntity("uptime"),"compact"));
    }

    const clock=Number(status.clock?.timestamp);
    if(Number.isFinite(clock)&&clock>0){
      const drift=Number(status.clock?.drift_seconds||0), abs=Math.abs(drift);
      const t=new Date(clock*1000).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});
      hero.appendChild(makeTile("Device clock",t,abs<=2?"· synchronized":`· drift ${drift>0?"+":""}${drift}s`,Math.min(abs,120),0,120,abs<=2?"good":abs<=30?"warn":"bad","clock",clickEntity("device_clock","clock")));
    }

    const noise=Number(status.stats?.radio?.noise_floor);
    if(Number.isFinite(noise)) hero.appendChild(makeTile("Noise floor",`${Math.round(noise)} dBm`,"",noise,-130,-90,noise>-105?"bad":noise>-115?"warn":"good","noise",clickEntity("noise_floor"),"compact"));

    const queue=Number(status.stats?.core?.queue_len);
    if(Number.isFinite(queue)) hero.appendChild(makeTile("TX queue",String(Math.round(queue)),"queued",Math.min(Math.max(queue,0),30),0,30,queue>10?"bad":queue>5?"warn":"good","queue",clickEntity("tx_queue_len"),"compact"));

    const tempInfo=findEntity("temperature");
    const temp=num(tempInfo);
    if(Number.isFinite(temp)){
      const unit=stateFor(tempInfo)?.attributes?.unit_of_measurement||"°C";
      const c=String(unit).includes("F")?(temp-32)*5/9:temp;
      hero.appendChild(makeTile("Temperature",`${c.toFixed(1)} °C`,"",c,-20,60,bandForTemp(c),"temperature",()=>summary._fireMoreInfo?.(tempInfo.entity_id),"compact"));
    }

    let tokensInfo=findEntity("request_rate_limiter");
    if(!tokensInfo){
      const key=Object.keys(this.hass?.states||{}).find((id)=>id.includes("request_rate_limiter"));
      if(key) tokensInfo={entity_id:key,label:"Request Tokens"};
    }
    const tokens=num(tokensInfo);
    if(Number.isFinite(tokens)) hero.appendChild(makeTile("Request tokens",tokens.toFixed(1),"available",tokens,0,20,tokens<5?"bad":tokens<10?"warn":"good","request-tokens",()=>summary._fireMoreInfo?.(tokensInfo.entity_id),"compact"));

    const dcInfo=findEntity("discovered_contacts");
    const discovered=num(dcInfo);
    if(Number.isFinite(discovered)) hero.appendChild(makeTile("Discovered contacts",String(Math.round(discovered)),"seen",Math.min(discovered,1000),0,1000,"info","contacts",()=>summary._fireMoreInfo?.(dcInfo.entity_id),"compact"));

    const used=Number(status.battery?.used_kb), total=Number(status.battery?.total_kb);
    if(Number.isFinite(used)&&Number.isFinite(total)&&total>0){
      const pct=Math.max(0,Math.min(100,used/total*100));
      hero.appendChild(makeTile("Storage",`${pct.toFixed(0)}%`,`· ${used} / ${total} KB`,pct,0,100,pct>=90?"bad":pct>=70?"warn":"good","storage",clickEntity("storage")));
    }

    const info=status.device_info||{};
    const model=info.model||status.model;
    if(model){
      hero.appendChild(makeTile("Hardware",String(model),info.firmware_build?`· ${info.firmware_build}`:"",100,0,100,"info","hardware",clickEntity("firmware","model")));
    }

    if(info.protocol_version!=null || info.path_hash_mode!=null){
      const pathLabels=["1 byte","2 bytes","3 bytes"];
      const protocol=info.protocol_version!=null?`v${info.protocol_version}`:"—";
      const path=info.path_hash_mode==null?"—":(pathLabels[Number(info.path_hash_mode)]||String(info.path_hash_mode));
      hero.appendChild(makeTile("Protocol / Path",protocol,`· ${path}`,100,0,100,"info","protocol",clickEntity("path_hash_mode","protocol_version"),"compact"));
    }

    if(info.max_contacts!=null || info.max_channels!=null){
      hero.appendChild(makeTile(
        "Capacity",
        `${info.max_contacts??"—"} / ${info.max_channels??"—"}`,
        "contacts / channels",
        100,0,100,"info","capacity",clickEntity("max_contacts","max_channels"),"compact"
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
        100,0,100,"info","repeat-frequencies",clickEntity("frequency")
      ));
    }

    // Aggregated operational diagnostics. All inputs are already local in
    // Home Assistant / Companion status; rendering these cards adds no RF.
    const metric=(key)=>this.__readMetricState(summary,key);
    const finite=(...values)=>values.find((value)=>Number.isFinite(value));

    const noiseMetric=metric("noise_floor");
    const rssiMetric=metric("last_rssi");
    const snrMetric=metric("last_snr");
    const noiseValue=finite(Number(status.stats?.radio?.noise_floor),noiseMetric.value);
    const rssiValue=finite(Number(status.stats?.radio?.last_rssi),rssiMetric.value);
    const snrValue=finite(Number(status.stats?.radio?.last_snr),snrMetric.value);
    if(Number.isFinite(noiseValue)||Number.isFinite(rssiValue)||Number.isFinite(snrValue)){
      const rfBand=Number.isFinite(noiseValue)
        ? (noiseValue>-105?"bad":noiseValue>-115?"warn":"good")
        : (Number.isFinite(snrValue)&&snrValue<-10?"warn":"good");
      const primary=Number.isFinite(noiseValue)
        ? Math.round(noiseValue)+" dBm"
        : Number.isFinite(rssiValue)
          ? Math.round(rssiValue)+" dBm"
          : snrValue.toFixed(1)+" dB";
      const details=[
        Number.isFinite(rssiValue)?"RSSI "+Math.round(rssiValue):null,
        Number.isFinite(snrValue)?"SNR "+snrValue.toFixed(1):null,
      ].filter(Boolean).join(" · ");
      const rfEntityId=noiseMetric.entityId||rssiMetric.entityId||snrMetric.entityId;
      hero.appendChild(makeTile(
        "RF Health",primary,details?"· "+details:"",100,0,100,rfBand,"rf-health",
        clickEntityId(rfEntityId)
      ));
    }

    const airtimeUtil=metric("airtime_utilization");
    const rxAirtimeUtil=metric("rx_airtime_utilization");
    const txAirtime=metric("tx_airtime");
    const rxAirtime=metric("rx_airtime");
    if(
      Number.isFinite(airtimeUtil.value)||Number.isFinite(rxAirtimeUtil.value)||
      Number.isFinite(txAirtime.value)||Number.isFinite(rxAirtime.value)
    ){
      const utilParts=[
        Number.isFinite(airtimeUtil.value)?"TX "+airtimeUtil.value.toFixed(1)+"%":null,
        Number.isFinite(rxAirtimeUtil.value)?"RX "+rxAirtimeUtil.value.toFixed(1)+"%":null,
      ].filter(Boolean);
      const timeParts=[
        Number.isFinite(txAirtime.value)?"TX "+txAirtime.value.toFixed(1)+" min":null,
        Number.isFinite(rxAirtime.value)?"RX "+rxAirtime.value.toFixed(1)+" min":null,
      ].filter(Boolean);
      const primary=utilParts.length?utilParts.join(" · "):(timeParts[0]||"—");
      const secondary=timeParts.length?"· "+timeParts.join(" · "):"";
      const maxUtil=Math.max(
        Number.isFinite(airtimeUtil.value)?airtimeUtil.value:0,
        Number.isFinite(rxAirtimeUtil.value)?rxAirtimeUtil.value:0
      );
      const airtimeEntityId=airtimeUtil.entityId||rxAirtimeUtil.entityId||txAirtime.entityId||rxAirtime.entityId;
      hero.appendChild(makeTile(
        "Airtime",primary,secondary,Math.min(maxUtil,100),0,100,
        maxUtil>=50?"warn":"info","airtime-health",clickEntityId(airtimeEntityId)
      ));
    }

    const successMetric=metric("request_successes");
    const failMetric=metric("request_failures");
    if(Number.isFinite(successMetric.value)||Number.isFinite(failMetric.value)){
      const successes=Number.isFinite(successMetric.value)?successMetric.value:0;
      const failures=Number.isFinite(failMetric.value)?failMetric.value:0;
      const attempts=successes+failures;
      const pct=attempts>0?successes/attempts*100:NaN;
      const band=attempts<20?"info":pct>=90?"good":pct>=70?"warn":"bad";
      hero.appendChild(makeTile(
        "Fiabilidade",
        Number.isFinite(pct)?pct.toFixed(0)+"%":"—",
        "· "+Math.round(successes)+" OK / "+Math.round(failures)+" falhas",
        Number.isFinite(pct)?pct:0,0,100,band,"reliability",
        clickEntityId(successMetric.entityId||failMetric.entityId)
      ));
    }

    const packetStats=status.stats?.packets||{};
    const errorsMetric=metric("recv_errors");
    const directDupsMetric=metric("direct_dups");
    const floodDupsMetric=metric("flood_dups");
    const fullMetric=metric("full_evts");
    const errors=finite(Number(packetStats.recv_errors),errorsMetric.value);
    const directDups=finite(Number(packetStats.direct_dups),directDupsMetric.value);
    const floodDups=finite(Number(packetStats.flood_dups),floodDupsMetric.value);
    const fullEvents=finite(Number(packetStats.full_evts),fullMetric.value);
    if([errors,directDups,floodDups,fullEvents].some(Number.isFinite)){
      const e=Number.isFinite(errors)?errors:0;
      const d=(Number.isFinite(directDups)?directDups:0)+(Number.isFinite(floodDups)?floodDups:0);
      const f=Number.isFinite(fullEvents)?fullEvents:0;
      const integrityEntityId=errorsMetric.entityId||directDupsMetric.entityId||floodDupsMetric.entityId||fullMetric.entityId;
      hero.appendChild(makeTile(
        "Integridade",
        Math.round(e)+" erros",
        "· "+Math.round(d)+" dup · "+Math.round(f)+" full",
        Math.min(e+f,100),0,100,e>0||f>0?"warn":"info","integrity",
        clickEntityId(integrityEntityId)
      ));
    }

    const rxRate=metric("nb_recv_rate");
    const txRate=metric("nb_sent_rate");
    const recvErrorRate=metric("recv_errors_rate");
    const rxDirectRate=metric("recv_direct_rate");
    const rxFloodRate=metric("recv_flood_rate");
    const txDirectRate=metric("sent_direct_rate");
    const txFloodRate=metric("sent_flood_rate");
    if(Number.isFinite(rxRate.value)||Number.isFinite(txRate.value)){
      const rx=Number.isFinite(rxRate.value)?rxRate.value:0;
      const tx=Number.isFinite(txRate.value)?txRate.value:0;
      const detailParts=[
        Number.isFinite(rxDirectRate.value)?"RD "+rxDirectRate.value.toFixed(1):null,
        Number.isFinite(rxFloodRate.value)?"RF "+rxFloodRate.value.toFixed(1):null,
        Number.isFinite(txDirectRate.value)?"TD "+txDirectRate.value.toFixed(1):null,
        Number.isFinite(txFloodRate.value)?"TF "+txFloodRate.value.toFixed(1):null,
      ].filter(Boolean);
      const secondary="· RX "+rx.toFixed(1)+" · TX "+tx.toFixed(1)+(detailParts.length?" · "+detailParts.join(" · "):"");
      hero.appendChild(makeTile(
        "Tráfego atual",(rx+tx).toFixed(1)+" msg/min",secondary,
        Math.min(rx+tx,50),0,50,"info","traffic-now",
        clickEntityId(rxRate.entityId||txRate.entityId)
      ));
    }

    const contacts=Array.isArray(this._contacts)?this._contacts:[];
    const nowSec=Date.now()/1000;
    const activeAt=(contact)=>Math.max(Number(contact?.lastmod||0),Number(contact?.last_advert||0));
    const active24=contacts.filter((contact)=>activeAt(contact)>0&&nowSec-activeAt(contact)<=86400).length;
    const active7d=contacts.filter((contact)=>activeAt(contact)>0&&nowSec-activeAt(contact)<=7*86400).length;
    const gps=contacts.filter((contact)=>this.__nodeCoords(contact)).length;
    const favorites=contacts.filter((contact)=>this.__nodeMeta(contact).favorite).length;
    const firstSeen=this.__touchFirstSeen(contacts);
    if(contacts.length){
      hero.appendChild(makeTile(
        "Atividade da rede",active24+" / "+contacts.length,
        "· 24h · "+active7d+" em 7d · +"+firstSeen.new24+" novos 24h · +"+firstSeen.new7d+" em 7d · "+gps+" GPS · "+favorites+" ★",
        Math.min(100,contacts.length?active24/contacts.length*100:0),0,100,"info","network-activity",
        clickEntity("discovered_contacts","node_count")
      ));
    }

    const alerts=[];
    let healthEntityId=null;
    if(Number.isFinite(noiseValue)&&noiseValue>-105){
      alerts.push("noise floor alto");
      healthEntityId=noiseMetric.entityId||healthEntityId;
    }

    // meshcore-ha exposes STATS_CORE radio faults as latching problem
    // binary sensors when Self Diagnostics is enabled. "on" means the
    // fault has occurred at least once since the radio last booted.
    for(const [key,label] of [
      ["err_pool_full","packet pool esgotado"],
      ["err_cad_timeout","CAD timeout"],
      ["err_rx_timeout","RX timeout"],
    ]){
      const entityId=this.__findDeviceMetricEntity(summary,key);
      const state=entityId?this.hass?.states?.[entityId]:null;
      if(state?.state==="on"){alerts.push(label);healthEntityId=healthEntityId||entityId;}
    }
    const queueValue=Number(status.stats?.core?.queue_len);
    if(Number.isFinite(queueValue)&&queueValue>5){
      alerts.push("TX queue "+Math.round(queueValue));
      healthEntityId=healthEntityId||metric("tx_queue_len").entityId;
    }
    const driftAbs=Math.abs(Number(status.clock?.drift_seconds||0));
    if(Number.isFinite(driftAbs)&&driftAbs>30)alerts.push("clock drift "+Math.round(driftAbs)+"s");
    if(Number.isFinite(recvErrorRate.value)&&recvErrorRate.value>0.5){
      alerts.push("RX errors "+recvErrorRate.value.toFixed(1)+"/min");
      healthEntityId=healthEntityId||recvErrorRate.entityId;
    }
    if(Number.isFinite(successMetric.value)&&Number.isFinite(failMetric.value)){
      const totalRequests=successMetric.value+failMetric.value;
      const reliability=totalRequests>0?successMetric.value/totalRequests*100:100;
      if(totalRequests>=20&&reliability<70){
        alerts.push("fiabilidade "+reliability.toFixed(0)+"%");
        healthEntityId=healthEntityId||successMetric.entityId||failMetric.entityId;
      }
    }
    if(!healthEntityId)healthEntityId=noiseMetric.entityId||recvErrorRate.entityId||successMetric.entityId||null;
    hero.appendChild(makeTile(
      "Saúde",
      alerts.length?alerts.length+" alerta"+(alerts.length===1?"":"s"):"OK",
      alerts.length?"· "+alerts.slice(0,2).join(" · "):"· sem alertas locais",
      alerts.length?Math.min(alerts.length,5):0,0,5,alerts.length?"warn":"good","health-alerts",
      clickEntityId(healthEntityId)
    ));

        for(const row of nroot.querySelectorAll(".sensor-item")){
      const label=(row.querySelector(".si-label")?.textContent||"").trim().toLowerCase();
      row.style.display = label.includes("temperature") ? "none" : "";
    }
    for(const label of nroot.querySelectorAll(".subsection-label")){
      if((label.textContent||"").trim().toLowerCase().startsWith("sensors")){
        label.style.display="none";
      }
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

    void this.__loadDiagnosticHistory(summary);
    this.__renderDiagnosticHistory(summary,nroot,hero);
    this.__ensureMetricEditor(summary,nroot,hero);
  }

  async __loadManagedDevices() {
    if (!this.hass || this.__managedDevicesLoading) return;
    this.__managedDevicesLoading = true;
    try {
      const msg = { type: "hivefw_integration/get_managed_devices" };
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
        const msg = { type: "hivefw_integration/execute_local", command: "reboot" };
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
    title.textContent = "Equipamentos HiveFW geridos";
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
      name.textContent = device.name || "HiveFW";
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
      const msg = { type: "hivefw_integration/get_flood_scopes" };
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

  __renderRxLogCard(sroot, grid) {
    let card=sroot.querySelector("#hive-rxlog-card");
    if(!card){
      card=document.createElement("div");
      card.id="hive-rxlog-card";
      card.className="device-section";
      grid.appendChild(card);
    }
    card.replaceChildren();

    const entryId=this.__entryId()||null;
    if(this.__rxLogLoadedEntry!==entryId && !this.__rxLogLoading){
      queueMicrotask(()=>void this.__loadRxLogRows());
    }

    const header=document.createElement("div");
    header.style.cssText="display:flex;align-items:center;gap:8px;flex-wrap:wrap;";
    const title=document.createElement("div");
    title.className="card-title";
    title.textContent="RX Log";
    title.style.marginRight="auto";

    const refresh=document.createElement("button");
    refresh.type="button";
    refresh.className="action-btn";
    refresh.textContent=this.__rxLogLoading?"A carregar…":"Atualizar";
    refresh.disabled=this.__rxLogLoading;
    refresh.addEventListener("click",()=>void this.__loadRxLogRows());

    const exportBtn=document.createElement("button");
    exportBtn.type="button";
    exportBtn.className="action-btn";
    exportBtn.textContent="Exportar JSON";
    exportBtn.disabled=!this.__rxLogRows.length;
    exportBtn.addEventListener("click",()=>{
      const blob=new Blob([JSON.stringify({rx_log:this.__rxLogRows},null,2)],{type:"application/json;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;
      link.download="hivefw_rx_log.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    header.append(title,refresh,exportBtn);
    card.appendChild(header);

    const note=document.createElement("div");
    note.className="hive-settings-note";
    note.textContent="Observações RX já guardadas no Home Assistant · sem tráfego RF adicional · máximo 150 linhas";
    card.appendChild(note);

    const filter=document.createElement("input");
    filter.type="search";
    filter.placeholder="Filtrar por nó, conversa, path ou texto…";
    filter.value=this.__rxLogFilter||"";
    filter.style.cssText="box-sizing:border-box;width:100%;margin:9px 0;padding:8px 10px;border:1px solid var(--divider-color);border-radius:8px;background:var(--primary-background-color);color:var(--primary-text-color);font:inherit;font-size:12px;";
    card.appendChild(filter);

    const body=document.createElement("div");
    body.style.cssText="max-height:340px;overflow:auto;border:1px solid var(--divider-color);border-radius:9px;";
    card.appendChild(body);

    const renderRows=()=>{
      body.replaceChildren();
      const q=(this.__rxLogFilter||"").trim().toLowerCase();
      const rows=this.__rxLogRows.filter((row)=>{
        if(!q)return true;
        const hay=[row.sender,row.conversation_name,row.pubkey_prefix,row.text,row.path,Array.isArray(row.path_nodes)?row.path_nodes.join(","):""].join(" ").toLowerCase();
        return hay.includes(q);
      });

      if(this.__rxLogLoading&&!rows.length){
        const msg=document.createElement("div");
        msg.textContent="A carregar…";
        msg.style.cssText="padding:24px;text-align:center;color:var(--secondary-text-color);";
        body.appendChild(msg);
        return;
      }
      if(!rows.length){
        const msg=document.createElement("div");
        msg.textContent="Sem observações RX guardadas para este filtro.";
        msg.style.cssText="padding:24px;text-align:center;color:var(--secondary-text-color);";
        body.appendChild(msg);
        return;
      }

      for(const row of rows){
        const item=document.createElement("div");
        item.style.cssText="display:grid;grid-template-columns:132px minmax(120px,1fr) minmax(170px,1.5fr) auto;gap:8px;align-items:start;padding:8px;border-top:1px solid var(--divider-color);font-size:11px;";
        const time=document.createElement("div");
        time.textContent=this.__rxLogTime(row.timestamp);
        time.style.color="var(--secondary-text-color)";

        const who=document.createElement("div");
        const sender=document.createElement("div");
        sender.textContent=row.sender||row.conversation_name||"—";
        sender.style.fontWeight="650";
        const conv=document.createElement("div");
        conv.textContent=row.conversation_name||"";
        conv.style.cssText="margin-top:2px;font-size:9px;color:var(--secondary-text-color);";
        who.append(sender,conv);

        const route=document.createElement("div");
        const pathNodes=Array.isArray(row.path_nodes)?row.path_nodes.join(" → "):String(row.path||"");
        route.textContent=pathNodes||row.text||"—";
        route.style.cssText="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow-wrap:anywhere;";

        const radio=document.createElement("div");
        const stats=[];
        if(Number.isFinite(Number(row.rssi)))stats.push("RSSI "+Number(row.rssi).toFixed(0));
        if(Number.isFinite(Number(row.snr)))stats.push("SNR "+Number(row.snr).toFixed(1));
        if(Number.isFinite(Number(row.hop_count)))stats.push(Number(row.hop_count)+" hops");
        radio.textContent=stats.join(" · ")||"—";
        radio.style.whiteSpace="nowrap";

        item.append(time,who,route,radio);
        body.appendChild(item);
      }
    };

    filter.addEventListener("input",()=>{
      this.__rxLogFilter=filter.value;
      renderRows();
    });
    renderRows();
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
        type: "hivefw_integration/set_flood_scopes",
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
      const msg={type:"hivefw_integration/get_remote_regions",target_prefix:this.__regionTarget};
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
      const msg={type:"hivefw_integration/execute_remote",target_prefix:this.__regionTarget,command};
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

  async __loadPeerActivity() {
    const entryId=this.__entryId()||null;
    if(this.__peerActivityLoading)return;
    if(this.__peerActivityLoadedEntry===entryId)return;
    this.__peerActivityLoading=true;
    try{
      const msg={type:"hivefw_integration/get_peer_activity"};
      if(entryId)msg.entry_id=entryId;
      const result=await this.hass.callWS(msg);
      this.__peerActivity={
        peers:result?.peers&&typeof result.peers==="object"?result.peers:{},
        links:result?.links&&typeof result.links==="object"?result.links:{},
      };
      this.__peerActivityLoadedEntry=entryId;
      const page=this.shadowRoot?.querySelector("meshcore-nodes-page");
      const nroot=page?.shadowRoot;
      if(nroot)this.__decorateNodeCards(nroot);
      if(this.__nodesPersistentPopup){
        const source=Array.isArray(this.__nodesMapContacts)?this.__nodesMapContacts:[];
        const selected=source.find((c)=>this.__nodeId(c)===this.__nodesPopupId);
        if(selected)this.__openPersistentNodePopup(selected);
      }
    }catch(error){
      console.warn("HiveFW peer activity load failed",error);
      this.__peerActivity={peers:{},links:{}};
      this.__peerActivityLoadedEntry=entryId;
    }finally{
      this.__peerActivityLoading=false;
    }
  }

  __peerActivityFor(contact) {
    const peers=this.__peerActivity?.peers||{};
    const links=this.__peerActivity?.links||{};
    const key=String(contact?.public_key||"").trim().toLowerCase();
    const prefix=String(contact?.pubkey_prefix||key.slice(0,12)).trim().toLowerCase();
    let peer=null;
    for(const [candidate,value] of Object.entries(peers)){
      const c=String(candidate||"").toLowerCase();
      if((key&&key.startsWith(c))||(prefix&&prefix.startsWith(c))||(c&&c.startsWith(prefix))){
        if(peer!==null){peer=null;break;}
        peer=value;
      }
    }
    let linkVolume=0;
    let weightedRssi=0;
    let weightedSnr=0;
    let rssiN=0;
    let snrN=0;
    const source=Array.isArray(this.__nodesMapContacts)?this.__nodesMapContacts:(Array.isArray(this._contacts)?this._contacts:[]);
    for(const [hash,value] of Object.entries(links)){
      const wanted=String(hash||"").trim().toLowerCase();
      const matches=source.filter((candidate)=>{
        const ckey=String(candidate?.public_key||"").toLowerCase();
        const cp=String(candidate?.pubkey_prefix||ckey.slice(0,12)).toLowerCase();
        return wanted&&(ckey.startsWith(wanted)||cp.startsWith(wanted));
      });
      if(matches.length!==1||this.__nodeId(matches[0])!==this.__nodeId(contact))continue;
      const count=Number(value?.observations)||0;
      linkVolume+=count;
      if(Number.isFinite(Number(value?.avg_rssi))){weightedRssi+=Number(value.avg_rssi)*count;rssiN+=count;}
      if(Number.isFinite(Number(value?.avg_snr))){weightedSnr+=Number(value.avg_snr)*count;snrN+=count;}
    }
    return {
      rx:Number(peer?.rx)||0,
      tx:Number(peer?.tx)||0,
      messages:Number(peer?.messages)||0,
      linkVolume,
      avgRssi:rssiN?weightedRssi/rssiN:null,
      avgSnr:snrN?weightedSnr/snrN:null,
    };
  }

  async __loadTraceHistory(force=false) {
    const entryId=this.__entryId()||null;
    if(this.__traceHistoryLoading)return;
    if(!force&&this.__traceHistoryLoadedEntry===entryId)return;
    this.__traceHistoryLoading=true;
    try{
      const msg={type:"hivefw_integration/get_trace_history",limit:100};
      if(entryId)msg.entry_id=entryId;
      const result=await this.hass.callWS(msg);
      this.__traceHistory=Array.isArray(result?.traces)?result.traces:[];
      this.__traceHistoryLoadedEntry=entryId;
    }catch(error){
      console.warn("HiveFW trace history load failed",error);
      this.__traceHistory=[];
      this.__traceHistoryLoadedEntry=entryId;
    }finally{
      this.__traceHistoryLoading=false;
    }
  }

  async __clearTraceHistory() {
    const msg={type:"hivefw_integration/clear_trace_history"};
    const entryId=this.__entryId();
    if(entryId)msg.entry_id=entryId;
    try{await this.hass.callWS(msg);}catch(error){console.warn("HiveFW trace history clear failed",error);}
    this.__traceHistory=[];
    this.__traceHistoryPanel?.remove();
    this.__traceHistoryPanel=null;
  }

  async __toggleTraceHistory() {
    if(this.__traceHistoryPanel?.isConnected){
      this.__traceHistoryPanel.remove();
      this.__traceHistoryPanel=null;
      return;
    }
    await this.__loadTraceHistory(true);
    const pane=this.__nodesMapPane;
    if(!pane)return;
    const panel=document.createElement("div");
    panel.className="hive-trace-history";
    panel.style.cssText="position:absolute;left:10px;top:68px;z-index:36;width:min(390px,calc(100% - 20px));max-height:55%;overflow:auto;padding:9px;border:1px solid var(--divider-color,#ccc);border-radius:10px;background:color-mix(in srgb,var(--card-background-color,#fff) 96%,transparent);box-shadow:0 2px 8px rgba(0,0,0,.22);font-size:10px;color:var(--primary-text-color,#222);";
    const head=document.createElement("div");
    head.style.cssText="display:flex;align-items:center;gap:8px;margin-bottom:7px;";
    const title=document.createElement("strong");title.textContent="Histórico de Trace";title.style.flex="1";
    const clear=document.createElement("button");clear.type="button";clear.textContent="Limpar";clear.style.cssText="border:0;background:transparent;color:var(--error-color,#db4437);font:inherit;font-weight:700;cursor:pointer;";
    clear.addEventListener("click",()=>void this.__clearTraceHistory());
    const close=document.createElement("button");close.type="button";close.textContent="✕";close.style.cssText="border:0;background:transparent;color:var(--secondary-text-color);cursor:pointer;";
    close.addEventListener("click",()=>{panel.remove();this.__traceHistoryPanel=null;});
    head.append(title,clear,close);panel.appendChild(head);
    if(!this.__traceHistory.length){
      const empty=document.createElement("div");empty.textContent="Ainda não existem traces guardados.";empty.style.color="var(--secondary-text-color)";panel.appendChild(empty);
    }else{
      for(const record of this.__traceHistory){
        const row=document.createElement("button");
        row.type="button";
        row.style.cssText="display:block;width:100%;padding:7px 8px;margin:0 0 5px;text-align:left;border:1px solid var(--divider-color,#ddd);border-radius:7px;background:transparent;color:inherit;cursor:pointer;font:inherit;";
        const when=document.createElement("div");
        const dt=new Date(record.timestamp);
        when.textContent=(Number.isNaN(dt.getTime())?String(record.timestamp||""):dt.toLocaleString())+" · "+String(record.target_prefix||"");
        when.style.fontWeight="700";
        const details=document.createElement("div");
        const parts=[String(record.round_trip_ms||0)+" ms",String(record.hops||0)+" hops",String(record.source||"manual")];
        if(Number.isFinite(Number(record.final_snr)))parts.push("SNR "+Number(record.final_snr).toFixed(1)+" dB");
        details.textContent=parts.join(" · ");details.style.cssText="margin-top:2px;color:var(--secondary-text-color);";
        row.append(when,details);
        row.addEventListener("click",()=>{
          this.__lastTrace={
            timestamp:record.timestamp,
            source:"history",
            target:{pubkey_prefix:String(record.target_prefix||""),adv_name:String(record.target_prefix||"Nó")},
            result:{
              round_trip_ms:Number(record.round_trip_ms)||0,
              response_time:String(Number(record.round_trip_ms)||0)+"ms",
              hops:Number(record.hops)||0,
              final_snr:record.final_snr,
              path:Array.isArray(record.path)?record.path:[],
            },
          };
          this.__lastTraceLoadedEntry=String(this.__entryId()||"default");
          panel.remove();this.__traceHistoryPanel=null;
          this.__drawLastTraceRoute();
        });
        panel.appendChild(row);
      }
    }
    pane.appendChild(panel);
    this.__traceHistoryPanel=panel;
  }

  async __showMessageRouteOnMap(message) {
    const observations=Array.isArray(message?.rxLogData)?message.rxLogData:[];
    if(!observations.length)return;
    const best=observations[observations.length-1]||{};
    const nodes=Array.isArray(best.path_nodes)?best.path_nodes.map(String).filter(Boolean):[];
    const path=nodes.map((hash)=>({hash,snr:null}));
    this.__lastTrace={
      timestamp:message?.timestamp instanceof Date?message.timestamp.toISOString():new Date().toISOString(),
      source:"message",
      target:{pubkey_prefix:"",adv_name:String(message?.sender||"Mensagem")},
      result:{
        round_trip_ms:0,
        response_time:"mensagem",
        hops:Number(best.hop_count)||nodes.length,
        final_snr:Number.isFinite(Number(best.snr))?Number(best.snr):null,
        path,
      },
    };
    this.__lastTraceLoadedEntry=String(this.__entryId()||"default");
    this._activeTab="nodes";
    this.requestUpdate?.();
    try{await this.updateComplete;}catch{}
    this.__enhanceRepeaterUi();
    window.setTimeout(()=>{
      this.__drawLastTraceRoute();
      const data=this.__traceRouteData();
      if(data?.points?.length){
        const map=this.__nodesMapElement?.leafletMap;
        try{map?.fitBounds?.(data.points,{padding:[40,40],maxZoom:12});}catch{}
      }
    },120);
  }

  async __restoreLatestTraceFromHistory() {
    const entry=String(this.__entryId()||"default");
    this.__lastTraceLoadedEntry=entry;
    await this.__loadTraceHistory();
    if(this.__lastTrace || !this.__traceHistory.length)return;
    const record=this.__traceHistory[0];
    this.__lastTrace={
      timestamp:record.timestamp,
      source:"history",
      target:{
        pubkey_prefix:String(record.target_prefix||""),
        adv_name:String(record.target_prefix||"Nó"),
      },
      result:{
        round_trip_ms:Number(record.round_trip_ms)||0,
        response_time:String(Number(record.round_trip_ms)||0)+"ms",
        hops:Number(record.hops)||0,
        final_snr:record.final_snr,
        path:Array.isArray(record.path)?record.path:[],
      },
    };
    if(this._activeTab==="nodes")this.__drawLastTraceRoute();
  }

  __loadLastTrace() {
    const entry=String(this.__entryId()||"default");
    if(this.__lastTraceLoadedEntry!==entry){
      this.__lastTraceLoadedEntry=entry;
      this.__lastTrace=null;
    }
    return this.__lastTrace;
  }

  __recordTraceResult(result,target,source="manual") {
    if(!result||!target)return;
    const trace={
      timestamp:Date.now(),
      source,
      target:{
        public_key:String(target.public_key||""),
        pubkey_prefix:String(target.pubkey_prefix||""),
        adv_name:String(target.adv_name||target.name||target.pubkey_prefix||"Nó"),
        adv_lat:Number(target.adv_lat??target.latitude),
        adv_lon:Number(target.adv_lon??target.longitude),
      },
      result:{
        round_trip_ms:Number(result.round_trip_ms||0),
        response_time:String(result.response_time||((Number(result.round_trip_ms)||0)+"ms")),
        hops:Number(result.hops||0),
        final_snr:result.final_snr==null?null:Number(result.final_snr),
        path:Array.isArray(result.path)?result.path.map((hop)=>({
          hash:hop?.hash==null?undefined:String(hop.hash),
          snr:Number(hop?.snr),
        })):[],
      },
    };
    this.__lastTrace=trace;
    this.__lastTraceLoadedEntry=String(this.__entryId()||"default");
    this.__traceHistoryLoadedEntry=null;
    this.__drawLastTraceRoute();
  }

  __captureTraceResult() {
    const result=this._traceDialogResult;
    if(!result||result===this.__lastSeenTraceResult)return;
    this.__lastSeenTraceResult=result;
    const target=this._traceDialogTargetContact;
    if(target)this.__recordTraceResult(result,target,"manual");
  }

  __clearLastTrace() {
    this.__lastTrace=null;
    this.__removeTraceRouteLayer();
    this.__nodesMapPane?.querySelector(".hive-trace-summary")?.remove();
  }

  __removeTraceRouteLayer() {
    const map=this.__nodesMapElement?.leafletMap;
    if(this.__traceRouteLayer&&map){try{map.removeLayer(this.__traceRouteLayer);}catch{}}
    this.__traceRouteLayer=null;
  }

  __resolveTraceHash(hash) {
    const wanted=String(hash||"").trim().replace(/^0x/i,"").toLowerCase();
    if(!wanted)return null;
    const source=Array.isArray(this.__nodesMapContacts)?this.__nodesMapContacts:(Array.isArray(this._contacts)?this._contacts:[]);
    const matches=source.filter((contact)=>{
      if(!this.__nodeCoords(contact))return false;
      const key=String(contact?.public_key||"").toLowerCase();
      const prefix=String(contact?.pubkey_prefix||key.slice(0,12)).toLowerCase();
      return key.startsWith(wanted)||prefix.startsWith(wanted);
    });
    if(matches.length!==1)return null;
    return matches[0];
  }

  __traceTargetContact(trace) {
    if(!trace?.target)return null;
    const source=Array.isArray(this.__nodesMapContacts)?this.__nodesMapContacts:(Array.isArray(this._contacts)?this._contacts:[]);
    const key=String(trace.target.public_key||"").toLowerCase();
    const prefix=String(trace.target.pubkey_prefix||"").toLowerCase();
    let found=source.find((contact)=>{
      const ckey=String(contact?.public_key||"").toLowerCase();
      const cp=String(contact?.pubkey_prefix||ckey.slice(0,12)).toLowerCase();
      return (key&&ckey===key)||(prefix&&cp===prefix);
    });
    if(!found&&trace.target.adv_name){
      const wanted=this.__normalizeNodeName(trace.target.adv_name);
      const matches=source.filter((contact)=>this.__normalizeNodeName(contact?.adv_name)===wanted);
      if(matches.length===1)found=matches[0];
    }
    return found||trace.target;
  }

  __traceRouteData() {
    const trace=this.__loadLastTrace();
    if(!trace?.result)return null;
    const target=this.__traceTargetContact(trace);
    const local=this.__localRepeaterMapContact();
    const points=[];
    const resolved=[];
    const unresolved=[];
    const push=(contact,label,hash,snr)=>{
      const coords=this.__nodeCoords(contact);
      if(!coords)return;
      const previous=points[points.length-1];
      if(!previous||previous[0]!==coords[0]||previous[1]!==coords[1])points.push(coords);
      resolved.push({contact,label,hash,snr,coords});
    };
    if(target&&this.__nodeCoords(target))push(target,String(target.adv_name||target.pubkey_prefix||"Destino"),null,null);
    for(const hop of (trace.result.path||[])){
      if(!hop?.hash)continue;
      const contact=this.__resolveTraceHash(hop.hash);
      if(contact)push(contact,String(contact.adv_name||contact.pubkey_prefix||hop.hash),String(hop.hash),hop.snr);
      else unresolved.push(String(hop.hash));
    }
    if(local&&this.__nodeCoords(local))push(local,String(local.adv_name||"Local"),null,trace.result.final_snr);
    return {trace,points,resolved,unresolved};
  }

  __drawLastTraceRoute() {
    const pane=this.__nodesMapPane;
    const mapEl=this.__nodesMapElement;
    const map=mapEl?.leafletMap;
    const L=mapEl?.Leaflet;
    if(!pane||!map||!L)return;
    this.__removeTraceRouteLayer();
    pane.querySelector(".hive-trace-summary")?.remove();
    const data=this.__traceRouteData();
    if(!data)return;

    if(data.points.length>=2){
      const line=L.polyline(data.points,{weight:4,opacity:.78,dashArray:"9 6",interactive:false});
      line.addTo(map);
      this.__traceRouteLayer=line;
    }

    const summary=document.createElement("div");
    summary.className="hive-trace-summary";
    summary.style.cssText="position:absolute;left:10px;top:10px;z-index:35;max-width:min(360px,calc(100% - 20px));padding:8px 10px;border:1px solid var(--divider-color,#ccc);border-radius:10px;background:color-mix(in srgb,var(--card-background-color,#fff) 93%,transparent);box-shadow:0 1px 5px rgba(0,0,0,.18);font-size:10px;color:var(--primary-text-color,#222);pointer-events:auto;";
    const top=document.createElement("div");
    top.style.cssText="display:flex;align-items:center;gap:8px;";
    const label=document.createElement("strong");
    label.style.flex="1";
    const sourceLabel=data.trace.source==="message"?"Rota da mensagem":data.trace.source==="history"?"Trace histórico":"Último Trace";
    label.textContent=sourceLabel+" · "+String(data.trace.target?.adv_name||data.trace.target?.pubkey_prefix||"Nó");
    const history=document.createElement("button");
    history.type="button";history.textContent="Histórico";
    history.style.cssText="border:0;background:transparent;color:var(--primary-color,#03a9f4);font:inherit;font-weight:700;cursor:pointer;";
    history.addEventListener("click",()=>void this.__toggleTraceHistory());
    const clear=document.createElement("button");
    clear.type="button";clear.textContent="Limpar";
    clear.style.cssText="border:0;background:transparent;color:var(--primary-color,#03a9f4);font:inherit;font-weight:700;cursor:pointer;";
    clear.addEventListener("click",()=>this.__clearLastTrace());
    top.append(label,history,clear);
    const detail=document.createElement("div");
    const parts=[data.trace.result.response_time||((data.trace.result.round_trip_ms||0)+"ms"),String(data.trace.result.hops||0)+" hops"];
    if(Number.isFinite(Number(data.trace.result.final_snr)))parts.push("SNR "+Number(data.trace.result.final_snr).toFixed(1)+" dB");
    if(data.unresolved.length)parts.push(data.unresolved.length+" hash não resolvido"+(data.unresolved.length===1?"":"s"));
    detail.textContent=parts.join(" · ");
    detail.style.cssText="margin-top:3px;color:var(--secondary-text-color,#666);";
    summary.append(top,detail);
    if(data.unresolved.length){
      const hashes=document.createElement("div");
      hashes.textContent="Sem GPS/ambíguos: "+data.unresolved.join(", ");
      hashes.style.cssText="margin-top:3px;font:9px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--secondary-text-color,#777);overflow-wrap:anywhere;";
      summary.appendChild(hashes);
    }
    pane.appendChild(summary);
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

  __nodeCoords(contact) {
    if(!contact)return null;
    const loc=contact.location||{};
    const lat=Number(contact.adv_lat ?? contact.latitude ?? contact.lat ?? loc.latitude ?? loc.lat);
    const lon=Number(contact.adv_lon ?? contact.longitude ?? contact.lon ?? contact.lng ?? loc.longitude ?? loc.lon ?? loc.lng);
    if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
    if(lat < -90 || lat > 90 || lon < -180 || lon > 180)return null;
    if(lat===0&&lon===0)return null;
    return [lat,lon];
  }

  __nodeId(contact) {
    return contact?.public_key || contact?.pubkey_prefix || "";
  }

  __meshcoreExportPath(contact) {
    const existing=contact?.advert_path_list;
    if(Array.isArray(existing)){
      return existing.map((part)=>
        String(part??"").trim().replace(/^0x/i,"").toLowerCase()
      ).filter(Boolean).join(",");
    }
    if(typeof existing==="string" && existing.includes(",")){
      return existing.split(",").map((part)=>
        part.trim().replace(/^0x/i,"").toLowerCase()
      ).filter(Boolean).join(",");
    }

    const rawHex=String(contact?.out_path ?? contact?.path ?? existing ?? "")
      .replace(/[^0-9a-f]/gi,"")
      .toLowerCase();
    const outPathLen=Number(contact?.out_path_len);
    if(!rawHex || !Number.isInteger(outPathLen) || outPathLen<=0)return "";

    const modeRaw=contact?.out_path_hash_mode ?? contact?.path_hash_mode;
    const mode=Number(modeRaw);
    let hopChars=Number.isInteger(mode) && mode>=0 && mode<=2
      ? (mode+1)*2
      : 0;

    // Old stored contacts can have a missing/defaulted hash mode. The wire
    // path length lets us recover the real width exactly: 1/2/3-byte hashes
    // are 2/4/6 hex chars per hop.
    if(rawHex.length % outPathLen===0){
      const inferred=rawHex.length/outPathLen;
      if([2,4,6].includes(inferred) && (!hopChars || hopChars*outPathLen!==rawHex.length)){
        hopChars=inferred;
      }
    }
    if(!hopChars || hopChars*outPathLen!==rawHex.length)return "";

    const hops=[];
    for(let i=0;i<outPathLen;i++){
      hops.push(rawHex.slice(i*hopChars,(i+1)*hopChars));
    }
    return hops.join(",");
  }

  __meshcoreExportCoord(value) {
    const number=Number(value);
    if(!Number.isFinite(number) || number===0)return "0.0";
    return String(number);
  }

  async __exportHiveFWContacts(button) {
    if(!this.hass)return;
    const original=button?.textContent||"Exportar";
    if(button){
      button.disabled=true;
      button.textContent="A exportar…";
    }
    try{
      const msg={type:"hivefw_integration/get_contacts"};
      const entryId=this.__entryId();
      if(entryId)msg.entry_id=entryId;
      const result=await this.hass.callWS(msg);
      const source=Array.isArray(result?.contacts)?result.contacts:[];
      const byKey=new Map();

      for(const contact of source){
        const publicKey=String(contact?.public_key||"").trim().toLowerCase();
        if(!/^[0-9a-f]{64}$/.test(publicKey))continue;
        const row={
          type:Number(contact?.type??0) || 0,
          name:String(contact?.adv_name ?? contact?.name ?? ""),
          public_key:publicKey,
          flags:Number(contact?.flags??0) || 0,
          latitude:this.__meshcoreExportCoord(contact?.adv_lat ?? contact?.latitude),
          longitude:this.__meshcoreExportCoord(contact?.adv_lon ?? contact?.longitude),
          last_advert:Math.trunc(Number(contact?.last_advert ?? 0)) || 0,
          last_modified:Math.trunc(Number(contact?.lastmod ?? contact?.last_modified ?? 0)) || 0,
          advert_path_list:this.__meshcoreExportPath(contact),
        };
        const previous=byKey.get(publicKey);
        if(!previous || row.last_modified>=previous.last_modified)byKey.set(publicKey,row);
      }

      const contacts=[...byKey.values()].sort((a,b)=>b.last_modified-a.last_modified);
      const json=JSON.stringify({discovered_contacts:contacts},null,2);
      const blob=new Blob([json],{type:"application/json;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;
      link.download="hivefw_discovered_contacts.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);

      if(button){
        button.textContent=`Exportados: ${contacts.length}`;
        window.setTimeout(()=>{
          if(button.isConnected)button.textContent=original;
        },1800);
      }
    }catch(error){
      console.error("HiveFW contact export failed:",error);
      if(button){
        button.textContent="Erro ao exportar";
        window.setTimeout(()=>{
          if(button.isConnected)button.textContent=original;
        },1800);
      }
    }finally{
      if(button)button.disabled=false;
    }
  }

  async __importHiveFWContacts(file,button,page) {
    if(!this.hass||!file)return;
    const original=button?.textContent||"Importar";
    if(button){
      button.disabled=true;
      button.textContent="A importar…";
    }

    try{
      const text=await file.text();
      const parsed=JSON.parse(text);
      const contacts=parsed?.discovered_contacts;
      if(!Array.isArray(contacts)){
        throw new Error("Ficheiro inválido: falta discovered_contacts");
      }

      const msg={
        type:"hivefw_integration/import_contacts",
        contacts,
      };
      const entryId=this.__entryId();
      if(entryId)msg.entry_id=entryId;

      const result=await this.hass.callWS(msg);

      // Force a fresh list + map snapshot after an additive import.
      this.__nodesMapContacts=null;
      this.__nodesMapLoadedEntry=null;
      this.__nodesMapSignature="";
      page?._syncAll?.();
      if(this.__nodesMapPane?.isConnected){
        await this.__loadNodesMapContacts();
        void this.__ensureSplitMap(page,this.__nodesMapPane);
      }

      if(button){
        const imported=Number(result?.imported||0);
        const skipped=Number(result?.skipped_existing||0);
        const invalid=Number(result?.invalid||0);
        button.textContent=invalid
          ? `+${imported} · ${skipped} iguais · ${invalid} inválidos`
          : `+${imported} · ${skipped} iguais`;
        window.setTimeout(()=>{
          if(button.isConnected)button.textContent=original;
        },2600);
      }
    }catch(error){
      console.error("HiveFW contact import failed:",error);
      if(button){
        button.textContent="Ficheiro inválido";
        window.setTimeout(()=>{
          if(button.isConnected)button.textContent=original;
        },2200);
      }
    }finally{
      if(button)button.disabled=false;
    }
  }

  __ensureNodeExportControls(nroot,page) {
    const filters=nroot?.querySelector(".l1-filters");
    const actions=nroot?.querySelector(".header-actions");
    if(!filters||!actions)return;

    // Clean up the 0.10.5 stacked layout if this page survived a hot reload.
    actions.querySelector(".hive-sync-stack")?.remove();
    const originalSync=actions.querySelector(":scope > .sync-btn:not(.hive-export-btn):not(.hive-sync-proxy)");
    if(originalSync)originalSync.style.display="";

    let style=nroot.querySelector("#hive-node-export-style");
    if(!style){
      style=document.createElement("style");
      style.id="hive-node-export-style";
      style.textContent=`
        .l1-filters .hive-export-btn{
          margin-left:auto;
        }
        .l1-filters .hive-export-btn,
        .l1-filters .hive-import-btn{
          white-space:nowrap;
        }
        .map-selection{
          display:none!important;
        }
      `;
      nroot.appendChild(style);
    }

    if(filters.querySelector(".hive-export-btn"))return;

    const exportButton=document.createElement("button");
    exportButton.className="l1-btn hive-export-btn";
    exportButton.textContent="Exportar";
    exportButton.title="Exportar contactos no formato discovered_contacts compatível com MeshCore";
    exportButton.addEventListener("click",()=>void this.__exportHiveFWContacts(exportButton));

    const importButton=document.createElement("button");
    importButton.className="l1-btn hive-import-btn";
    importButton.textContent="Importar";
    importButton.title="Importar apenas contactos novos; contactos existentes nunca são alterados";

    const input=document.createElement("input");
    input.type="file";
    input.accept=".json,application/json";
    input.hidden=true;
    input.addEventListener("change",()=>{
      const file=input.files?.[0];
      if(file)void this.__importHiveFWContacts(file,importButton,page);
      input.value="";
    });
    importButton.addEventListener("click",()=>{
      input.value="";
      input.click();
    });

    filters.append(exportButton,importButton,input);
  }

  async __refreshNodeMapAfterMutation(pubkey,page) {
    const openId=this.__nodesPopupId;
    this.__nodesMapContacts=null;
    this.__nodesMapLoadedEntry=null;
    this.__nodesMapSignature="";

    await this.__loadNodesMapContacts();
    if(this.__nodesMapPane?.isConnected){
      await this.__ensureSplitMap(page,this.__nodesMapPane);
    }

    if(openId){
      const source=Array.isArray(this.__nodesMapContacts)?this.__nodesMapContacts:[];
      const fresh=source.find((contact)=>{
        if(pubkey && contact?.public_key===pubkey)return true;
        return this.__nodeId(contact)===openId;
      });
      if(fresh && this.__nodeCoords(fresh)){
        this.__openPersistentNodePopup(fresh);
      }
    }
  }

  __enhanceNodesPage() {
    const root=this.shadowRoot;
    const page=root?.querySelector("meshcore-nodes-page");
    const container=root?.querySelector(".page-container");
    const nroot=page?.shadowRoot;
    const content=nroot?.querySelector(".content-area");
    if(!root||!page||!container||!nroot||!content)return;

    // Remove all previous experimental controls/overlays from inside the
    // Lit-managed Nodes component. The map now lives beside that component,
    // outside its render range, so a Nodes rerender cannot destroy it.
    nroot.querySelector(".hive-view-switch")?.remove();
    nroot.querySelector(".hive-map-overlay")?.remove();
    this.__ensureNodeExportControls(nroot,page);

    if(!page.__hiveMapMutationRefreshBound && typeof page.refreshAfterMutation==="function"){
      page.__hiveMapMutationRefreshBound=true;
      const originalRefreshAfterMutation=page.refreshAfterMutation.bind(page);
      page.refreshAfterMutation=async(pubkey)=>{
        await originalRefreshAfterMutation(pubkey);
        await this.__refreshNodeMapAfterMutation(pubkey,page);
      };
    }

    let style=root.querySelector("#hive-node-split-style");
    if(!style){
      style=document.createElement("style");
      style.id="hive-node-split-style";
      style.textContent=`
        .page-container.hive-nodes-split{
          display:grid!important;
          grid-template-columns:minmax(360px,1fr) minmax(0,1fr)!important;
          grid-template-rows:minmax(0,1fr)!important;
          overflow:hidden!important;
          min-height:0!important;
        }
        .page-container.hive-nodes-split > meshcore-nodes-page{
          grid-column:1;
          grid-row:1;
          min-width:0;
          min-height:0;
          width:100%;
          height:100%;
          overflow:hidden;
        }
        .page-container.hive-nodes-split > .hive-nodes-map-pane{
          grid-column:2;
          grid-row:1;
          position:relative;
          min-width:0;
          min-height:0;
          width:100%;
          height:100%;
          overflow:hidden;
          background:var(--card-background-color,#fff);
          border-left:1px solid var(--divider-color,#e0e0e0);
        }
        .hive-nodes-map-pane ha-map{
          display:block;
          width:100%;
          height:100%;
          min-height:420px;
        }
        .hive-map-note{
          display:grid;
          place-items:center;
          height:100%;
          padding:24px;
          box-sizing:border-box;
          color:var(--secondary-text-color);
          text-align:center;
        }
        .hive-map-count{
          position:absolute;top:10px;right:10px;z-index:30;
          padding:6px 9px;border-radius:14px;
          background:color-mix(in srgb,var(--card-background-color) 90%,transparent);
          color:var(--primary-text-color);border:1px solid var(--divider-color);
          font-size:11px;font-weight:600;box-shadow:0 1px 4px rgba(0,0,0,.18);
          pointer-events:auto
        }
        .hive-map-count button{
          border:0;
          padding:0;
          background:transparent;
          color:var(--primary-color,#03a9f4);
          font:inherit;
          font-weight:700;
          cursor:pointer;
          text-decoration:underline;
          text-underline-offset:2px;
        }
        @media(max-width:870px){
          .page-container.hive-nodes-split{
            grid-template-columns:1fr!important;
            grid-template-rows:minmax(360px,55%) minmax(300px,45%)!important;
            overflow-y:auto!important;
          }
          .page-container.hive-nodes-split > meshcore-nodes-page{
            grid-column:1;grid-row:1
          }
          .page-container.hive-nodes-split > .hive-nodes-map-pane{
            grid-column:1;grid-row:2;border-left:0;
            border-top:1px solid var(--divider-color,#e0e0e0)
          }
        }
      `;
      root.appendChild(style);
    }

    container.classList.add("hive-nodes-split");

    let pane=container.querySelector(":scope > .hive-nodes-map-pane");
    if(!pane){
      pane=document.createElement("section");
      pane.className="hive-nodes-map-pane";
      // Appended after Lit's child-part markers: this node is not owned by
      // the Nodes template and therefore survives its frequent rerenders.
      container.appendChild(pane);
    }
    this.__nodesMapPane=pane;
    pane.querySelector(".hive-map-selection")?.remove();
    nroot.querySelectorAll(".map-selection").forEach((el)=>{
      el.remove();
    });
    if(this.__peerActivityLoadedEntry!==this.__entryId()&&!this.__peerActivityLoading){
      void this.__loadPeerActivity();
    }
    if(this.__lastTraceLoadedEntry!==String(this.__entryId()||"default")){
      void this.__restoreLatestTraceFromHistory();
    }
    this.__decorateNodeCards(nroot);
    window.setTimeout(()=>this.__decorateNodeCards(nroot),120);

    if(!content.dataset.hiveMapFocusBound){
      content.dataset.hiveMapFocusBound="1";
      content.addEventListener("click",(event)=>{
        const path=event.composedPath?.()||[];
        const card=path.find((el)=>el?.tagName==="MESHCORE-CONTACT-CARD");
        const contact=card?.contact;
        if(contact){
          event.preventDefault?.();
          event.stopPropagation();
          event.stopImmediatePropagation?.();
          this.__focusNodeOnMap(contact);
        }
      },true);
    }

    void this.__ensureSplitMap(page,pane);
  }

  __cleanupNodesSplit() {
    this.__closeTraceMonitor();
    const root=this.shadowRoot;
    const container=root?.querySelector(".page-container");
    container?.classList.remove("hive-nodes-split");
    if(this.__nodesMapPane?.isConnected)this.__nodesMapPane.remove();
    this.__removeTraceRouteLayer();
    this.__traceHistoryPanel?.remove();
    this.__traceHistoryPanel=null;
    this.__nodesMapPane=null;
    this.__closePersistentNodePopup();
    this.__nodesMapElement=null;
    this.__nodesMapSignature="";
    this.__nodesPopupId="";
    this.__nodesInitialViewport=null;
  }

  __firstSeenStorageKey() {
    const entry=String(this.__entryId()||"default").replace(/[^a-zA-Z0-9_.-]/g,"_");
    return "hivefw.first_seen.v1."+entry;
  }

  __touchFirstSeen(contacts) {
    if(!Array.isArray(contacts))return {new24:0,new7d:0};
    let state;
    try{state=JSON.parse(localStorage.getItem(this.__firstSeenStorageKey())||"null");}catch{state=null;}
    const initialized=!!state?.initialized;
    if(!state||typeof state!=="object")state={initialized:false,nodes:{}};
    if(!state.nodes||typeof state.nodes!=="object")state.nodes={};
    const now=Date.now();
    let changed=false;
    for(const contact of contacts){
      const key=String(contact?.public_key||"").trim().toLowerCase();
      if(!/^[0-9a-f]{64}$/.test(key)||Object.prototype.hasOwnProperty.call(state.nodes,key))continue;
      // First run is a baseline, not a claim that every old contact is new.
      state.nodes[key]=initialized?now:0;
      changed=true;
    }
    if(!state.initialized){state.initialized=true;changed=true;}
    if(changed){try{localStorage.setItem(this.__firstSeenStorageKey(),JSON.stringify(state));}catch{}}
    const stamps=Object.values(state.nodes).map(Number).filter((value)=>Number.isFinite(value)&&value>0);
    return {
      new24:stamps.filter((value)=>now-value<=24*60*60*1000).length,
      new7d:stamps.filter((value)=>now-value<=7*24*60*60*1000).length,
    };
  }

  __nodeMetaStorageKey() {
    const entry=String(this.__entryId()||"default").replace(/[^a-zA-Z0-9_.-]/g,"_");
    return "hivefw.node_meta.v1."+entry;
  }

  __loadNodeMetaMap() {
    try{
      const parsed=JSON.parse(localStorage.getItem(this.__nodeMetaStorageKey())||"{}");
      return parsed&&typeof parsed==="object"?parsed:{};
    }catch{return {};}
  }

  __saveNodeMetaMap(map) {
    try{localStorage.setItem(this.__nodeMetaStorageKey(),JSON.stringify(map||{}));}catch{}
  }

  __nodeMeta(contact) {
    const directTags=Array.isArray(contact?.tags)
      ? contact.tags.map(String).filter(Boolean).slice(0,8)
      : [];
    if(contact?.favorite!==undefined || directTags.length){
      return {favorite:!!contact?.favorite,tags:directTags};
    }

    // One-release fallback for metadata created before it moved from browser
    // localStorage into Home Assistant storage.
    const key=String(contact?.public_key||"").trim().toLowerCase();
    if(!/^[0-9a-f]{64}$/.test(key))return {favorite:false,tags:[]};
    const value=this.__loadNodeMetaMap()[key]||{};
    return {
      favorite:!!value.favorite,
      tags:Array.isArray(value.tags)?value.tags.map(String).filter(Boolean).slice(0,8):[],
    };
  }

  async __setNodeMeta(contact,patch) {
    const key=String(contact?.public_key||"").trim().toLowerCase();
    if(!/^[0-9a-f]{6,64}$/.test(key))return;

    const previous=this.__nodeMeta(contact);
    const next={
      favorite:patch.favorite!==undefined?!!patch.favorite:!!previous.favorite,
      tags:Array.isArray(patch.tags)
        ? patch.tags.map(String).filter(Boolean).slice(0,8)
        : previous.tags,
    };

    // Optimistic local update keeps popup/map interactions instant.
    contact.favorite=next.favorite;
    contact.tags=next.tags;
    this.__nodesMapSignature="";

    try{
      const msg={
        type:"hivefw_integration/set_node_meta",
        public_key:key,
        favorite:next.favorite,
        tags:next.tags,
      };
      const entryId=this.__entryId();
      if(entryId)msg.entry_id=entryId;
      const saved=await this.hass.callWS(msg);
      contact.favorite=!!saved?.favorite;
      contact.tags=Array.isArray(saved?.tags)?saved.tags:next.tags;

      // Retire any pre-backend localStorage copy after a successful save.
      const map=this.__loadNodeMetaMap();
      if(map[key]){
        delete map[key];
        this.__saveNodeMetaMap(map);
      }
    }catch(error){
      // Preserve the change locally if the backend is temporarily unavailable.
      const map=this.__loadNodeMetaMap();
      map[key]=next;
      this.__saveNodeMetaMap(map);
      console.warn("HiveFW node metadata save failed",error);
    }

    const page=this.shadowRoot?.querySelector("meshcore-nodes-page");
    if(page?._loadPage)void page._loadPage(true);
    const nroot=page?.shadowRoot;
    if(nroot)this.__decorateNodeCards(nroot);
    if(this.__nodesMapPane?.isConnected){
      this.__nodesMapLoadedEntry=null;
      void this.__loadNodesMapContacts().then(()=>this.__ensureSplitMap(page,this.__nodesMapPane));
    }
    if(this.__nodesPersistentPopup){
      this.__openPersistentNodePopup(contact);
    }
    if(this._activeTab==="settings")this.__enhanceSettingsPage();
  }

  __decorateNodeCards(nroot) {
    if(!nroot)return;
    for(const card of nroot.querySelectorAll("meshcore-contact-card")){
      const root=card.shadowRoot;
      const name=root?.querySelector(".contact-name");
      if(!name)continue;
      let badge=root.querySelector(".hive-node-meta-inline");
      if(!badge){
        badge=document.createElement("span");
        badge.className="hive-node-meta-inline";
        badge.style.cssText="margin-left:5px;font-size:10px;color:var(--primary-color,#03a9f4);font-weight:650;";
        name.appendChild(badge);
      }
      const meta=this.__nodeMeta(card.contact);
      const parts=[];
      if(meta.favorite)parts.push("★");
      parts.push(...meta.tags.slice(0,2).map((tag)=>"#"+tag));
      badge.textContent=parts.length?" "+parts.join(" "):"";
      badge.hidden=!parts.length;

      const activity=this.__peerActivityFor(card.contact);
      let activityBadge=root.querySelector(".hive-node-activity-inline");
      if(!activityBadge){
        activityBadge=document.createElement("span");
        activityBadge.className="hive-node-activity-inline";
        activityBadge.style.cssText="display:block;margin-top:3px;font:9px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--secondary-text-color,#777);";
        const info=root.querySelector(".contact-info");
        info?.appendChild(activityBadge);
      }
      const activityParts=[];
      if(activity.rx||activity.tx)activityParts.push("RX "+activity.rx+" · TX "+activity.tx);
      if(activity.linkVolume)activityParts.push("link "+activity.linkVolume);
      activityBadge.textContent=activityParts.join(" · ");
      activityBadge.hidden=!activityParts.length;
    }
  }

  async __loadNodesMapContacts() {
    const entryId=this.__entryId()||null;
    if(this.__nodesMapLoading)return;
    if(this.__nodesMapLoadedEntry===entryId && Array.isArray(this.__nodesMapContacts))return;
    this.__nodesMapLoading=true;
    try{
      const msg={type:"hivefw_integration/get_contacts"};
      if(entryId)msg.entry_id=entryId;
      const result=await this.hass.callWS(msg);
      this.__nodesMapContacts=Array.isArray(result?.contacts)?result.contacts:[];
    }catch{
      this.__nodesMapContacts=Array.isArray(this._contacts)?this._contacts:[];
    }finally{
      this.__nodesMapLoadedEntry=entryId;
      this.__nodesMapLoading=false;
    }
  }

  __validMapContacts() {
    const source=Array.isArray(this.__nodesMapContacts)
      ? this.__nodesMapContacts
      : (Array.isArray(this._contacts)?this._contacts:[]);
    return source.filter((c)=>this.__nodeCoords(c)!==null);
  }

  __normalizeNodeName(value) {
    return String(value||"")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g," ")
      .toLocaleLowerCase();
  }

  __localRepeaterMapContact() {
    const status=this.__repeaterStatus||{};
    const device=this._selectedDevice||{};
    const source=Array.isArray(this.__nodesMapContacts)
      ? this.__nodesMapContacts
      : (Array.isArray(this._contacts)?this._contacts:[]);

    const fullKey=String(device.pubkey||"").trim().toLowerCase();
    const prefixes=[
      String(device.pubkey_prefix||"").trim().toLowerCase(),
      fullKey.slice(0,12),
    ].filter(Boolean);

    let matched=null;

    // Strongest identity: the connected Companion public key.
    if(fullKey){
      matched=source.find((contact)=>
        String(contact?.public_key||"").trim().toLowerCase()===fullKey
      )||null;
    }

    // Next best: stable pubkey prefix.
    if(!matched && prefixes.length){
      matched=source.find((contact)=>{
        const key=String(contact?.public_key||"").trim().toLowerCase();
        const prefix=String(contact?.pubkey_prefix||key.slice(0,12)).trim().toLowerCase();
        return prefixes.some((wanted)=>
          prefix===wanted || key.startsWith(wanted) || wanted.startsWith(prefix)
        );
      })||null;
    }

    // Fallback requested for HiveFW: cross the currently connected radio
    // name with the discovered-contact advert name. If duplicate names ever
    // exist, keep the most recently updated contact.
    if(!matched){
      const names=[
        device.name,
        status.name,
        this._config?.node_name,
        this._config?.name,
      ].map((name)=>this.__normalizeNodeName(name)).filter(Boolean);
      if(names.length){
        matched=source
          .filter((contact)=>{
            const contactName=this.__normalizeNodeName(contact?.adv_name ?? contact?.name);
            return contactName && names.includes(contactName);
          })
          .sort((a,b)=>Number(b?.lastmod||0)-Number(a?.lastmod||0))[0]||null;
      }
    }

    const currentName=String(
      device.name || status.name || this._config?.node_name || this._config?.name || matched?.adv_name || "HiveFW"
    ).trim();

    const location=status?.location||{};
    const fallbackLat=Number(location.latitude);
    const fallbackLon=Number(location.longitude);
    const fallbackCoordsValid=
      Number.isFinite(fallbackLat) && Number.isFinite(fallbackLon) &&
      fallbackLat>=-90 && fallbackLat<=90 &&
      fallbackLon>=-180 && fallbackLon<=180 &&
      !(fallbackLat===0&&fallbackLon===0);

    if(matched){
      const merged={...matched,__hivefw_local:true,__hivefw_local_match:true};
      // The map label always follows the currently connected device name,
      // even before a fresh advert updates the discovered-contact name.
      if(currentName)merged.adv_name=currentName;

      // Preserve the real contact GPS first; use SELF_INFO location only
      // when that contact currently has no valid advertised coordinates.
      if(!this.__nodeCoords(merged) && fallbackCoordsValid){
        merged.adv_lat=fallbackLat;
        merged.adv_lon=fallbackLon;
        merged.latitude=fallbackLat;
        merged.longitude=fallbackLon;
      }
      return merged;
    }

    // Last-resort compatibility for a local node not yet present in
    // discoveries. This disappears automatically once a real contact matches.
    if(!fallbackCoordsValid)return null;
    return {
      public_key:"__hivefw_local__",
      pubkey_prefix:"LOCAL",
      adv_name:currentName||"HiveFW",
      adv_lat:fallbackLat,
      adv_lon:fallbackLon,
      latitude:fallbackLat,
      longitude:fallbackLon,
      __hivefw_local:true,
      __hivefw_local_match:false,
    };
  }

  __mapEntities(contacts) {
    return contacts
      .filter((c)=>c?.map_entity_id && this.hass?.states?.[c.map_entity_id])
      .map((c)=>c.map_entity_id);
  }

  __mapLocations(contacts) {
    const fallback=contacts.filter((c)=>!c?.map_entity_id || !this.hass?.states?.[c.map_entity_id]);
    const active=new Set();
    const selectedId=this.__nodesMapFocusId||"";
    const locations=fallback.map((c)=>{
      const id=this.__nodeId(c);
      const coords=this.__nodeCoords(c);
      active.add(id);
      let marker=this.__nodesMapMarkerElements.get(id);
      if(!marker){
        marker=document.createElement("div");
        this.__nodesMapMarkerElements.set(id,marker);
      }
      const selected=id===selectedId;
      marker.textContent=String(c.adv_name||c.pubkey_prefix||"?").slice(0,2).toUpperCase();
      marker.style.cssText=`width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:10px;font-weight:700;background:${selected?"var(--warning-color,#ff9800)":"var(--primary-color,#03a9f4)"};color:#fff;border:${selected?"3px":"2px"} solid #fff;box-shadow:${selected?"0 0 0 3px rgba(255,152,0,.35),0 2px 7px rgba(0,0,0,.35)":"0 1px 5px rgba(0,0,0,.35)"}`;
      return {id,location:coords,element:marker,elementSize:[36,36],title:c.adv_name||c.pubkey_prefix,locationEditable:false,activatable:true};
    });
    for(const id of this.__nodesMapMarkerElements.keys()){
      if(!active.has(id))this.__nodesMapMarkerElements.delete(id);
    }
    return locations;
  }

  async __waitForLegacyLeaflet(map) {
    if(!map || !("layers" in map))return false;
    for(let i=0;i<40;i++){
      if(map.leafletMap && map.Leaflet)return true;
      await new Promise((resolve)=>setTimeout(resolve,75));
      if(!map.isConnected)return false;
    }
    return !!(map.leafletMap && map.Leaflet);
  }

  __traceMonitorStorageKey(contact=this.__traceMonitorContact) {
    const entry=String(this.__entryId()||"default").replace(/[^a-zA-Z0-9_.-]/g,"_");
    const key=String(contact?.public_key||contact?.pubkey_prefix||"unknown").toLowerCase().replace(/[^a-z0-9]/g,"");
    return "hivefw.trace_monitor.v1."+entry+"."+key;
  }

  __loadTraceMonitorSamples(contact) {
    try{
      const parsed=JSON.parse(localStorage.getItem(this.__traceMonitorStorageKey(contact))||"[]");
      return Array.isArray(parsed)?parsed.slice(-100):[];
    }catch{return [];}
  }

  __saveTraceMonitorSamples() {
    try{
      localStorage.setItem(
        this.__traceMonitorStorageKey(),
        JSON.stringify(this.__traceMonitorSamples.slice(-100))
      );
    }catch{}
  }

  __clearTraceMonitorSamples() {
    this.__traceMonitorSamples=[];
    try{localStorage.removeItem(this.__traceMonitorStorageKey());}catch{}
    this.__renderTraceMonitorOverlay();
  }

  __stopTraceMonitor() {
    if(this.__traceMonitorTimer){
      window.clearInterval(this.__traceMonitorTimer);
      this.__traceMonitorTimer=null;
    }
    this.__traceMonitorRunning=false;
    this.__traceMonitorBusy=false;
  }

  __closeTraceMonitor() {
    this.__stopTraceMonitor();
    this.__traceMonitorOverlay?.remove();
    this.__traceMonitorOverlay=null;
  }

  async __runTraceMonitorSample() {
    const contact=this.__traceMonitorContact;
    if(!this.hass||!contact||this.__traceMonitorBusy)return;
    if(!contact.added_to_node){
      this.__traceMonitorSamples.push({timestamp:Date.now(),error:"Contacto não adicionado"});
      this.__renderTraceMonitorOverlay();
      return;
    }
    const prefix=String(contact.pubkey_prefix||String(contact.public_key||"").slice(0,12));
    if(!prefix)return;
    this.__traceMonitorBusy=true;
    this.__renderTraceMonitorOverlay();
    try{
      const msg={type:"hivefw_integration/trace",pubkey_prefix:prefix,source:"monitor"};
      const entryId=this.__entryId();
      if(entryId)msg.entry_id=entryId;
      const result=await this.hass.callWS(msg);
      this.__traceMonitorSamples.push({
        timestamp:Date.now(),
        round_trip_ms:Number(result?.round_trip_ms||0),
        hops:Number(result?.hops||0),
        final_snr:result?.final_snr==null?null:Number(result.final_snr),
        result,
      });
      if(this.__traceMonitorSamples.length>100)this.__traceMonitorSamples=this.__traceMonitorSamples.slice(-100);
      this.__saveTraceMonitorSamples();
      this.__recordTraceResult(result,contact,"monitor");
    }catch(error){
      this.__traceMonitorSamples.push({
        timestamp:Date.now(),
        error:error?.message||error?.code||String(error),
      });
      if(this.__traceMonitorSamples.length>100)this.__traceMonitorSamples=this.__traceMonitorSamples.slice(-100);
      this.__saveTraceMonitorSamples();
    }finally{
      this.__traceMonitorBusy=false;
      this.__renderTraceMonitorOverlay();
    }
  }

  __startTraceMonitor() {
    if(this.__traceMonitorRunning||!this.__traceMonitorContact)return;
    this.__traceMonitorRunning=true;
    void this.__runTraceMonitorSample();
    const ms=Math.max(120,Number(this.__traceMonitorInterval)||300)*1000;
    this.__traceMonitorTimer=window.setInterval(()=>void this.__runTraceMonitorSample(),ms);
    this.__renderTraceMonitorOverlay();
  }

  __traceMonitorChart(samples,key) {
    const values=samples
      .filter((sample)=>!sample.error&&sample?.[key]!=null&&Number.isFinite(Number(sample[key])))
      .map((sample)=>({t:sample.timestamp,v:Number(sample[key])}));
    return this.__sparklineSvg(values);
  }

  __renderTraceMonitorOverlay() {
    const overlay=this.__traceMonitorOverlay;
    if(!overlay)return;
    const dialog=overlay.querySelector(".hive-trace-monitor-dialog");
    if(!dialog)return;
    dialog.replaceChildren();
    const contact=this.__traceMonitorContact;

    const header=document.createElement("div");
    header.style.cssText="display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--divider-color,#ddd);";
    const title=document.createElement("div");
    title.textContent="Trace Monitor · "+String(contact?.adv_name||contact?.pubkey_prefix||"Nó");
    title.style.cssText="flex:1;font-size:16px;font-weight:700;";
    const close=document.createElement("button");
    close.type="button";close.textContent="✕";close.title="Fechar";
    close.style.cssText="width:30px;height:30px;border:0;border-radius:50%;background:transparent;color:inherit;font-size:17px;cursor:pointer;";
    close.addEventListener("click",()=>this.__closeTraceMonitor());
    header.append(title,close);dialog.appendChild(header);

    const note=document.createElement("div");
    note.style.cssText="padding:10px 16px 4px;font-size:10px;line-height:1.45;color:var(--secondary-text-color,#777);";
    note.textContent="On-demand: cada amostra executa um Trace HiveFW e pode usar path discovery/flood. O monitor só corre enquanto esta janela estiver aberta; mínimo 2 minutos.";
    dialog.appendChild(note);

    const controls=document.createElement("div");
    controls.style.cssText="display:flex;align-items:center;gap:8px;padding:8px 16px 11px;";
    const select=document.createElement("select");
    select.style.cssText="padding:7px 9px;border:1px solid var(--divider-color,#ccc);border-radius:7px;background:var(--card-background-color,#fff);color:inherit;font:inherit;font-size:12px;";
    for(const [seconds,label] of [[120,"2 min"],[300,"5 min"],[600,"10 min"],[1800,"30 min"]]){
      const option=document.createElement("option");option.value=String(seconds);option.textContent=label;option.selected=Number(seconds)===Number(this.__traceMonitorInterval);select.appendChild(option);
    }
    select.disabled=this.__traceMonitorRunning;
    select.addEventListener("change",()=>{this.__traceMonitorInterval=Number(select.value)||300;});
    const toggle=document.createElement("button");
    toggle.type="button";toggle.textContent=this.__traceMonitorRunning?"Parar":"Iniciar";
    toggle.style.cssText="padding:7px 12px;border:1px solid var(--primary-color,#03a9f4);border-radius:7px;background:var(--primary-color,#03a9f4);color:#fff;font-size:12px;font-weight:700;cursor:pointer;";
    toggle.addEventListener("click",()=>{
      if(this.__traceMonitorRunning){this.__stopTraceMonitor();this.__renderTraceMonitorOverlay();}
      else this.__startTraceMonitor();
    });
    const one=document.createElement("button");
    one.type="button";one.textContent=this.__traceMonitorBusy?"A medir…":"Medir agora";one.disabled=this.__traceMonitorBusy;
    one.style.cssText="padding:7px 12px;border:1px solid var(--divider-color,#ccc);border-radius:7px;background:var(--card-background-color,#fff);color:inherit;font-size:12px;font-weight:600;cursor:pointer;";
    one.addEventListener("click",()=>void this.__runTraceMonitorSample());
    const clearHistory=document.createElement("button");
    clearHistory.type="button";clearHistory.textContent="Limpar histórico";
    clearHistory.style.cssText="padding:7px 9px;border:1px solid var(--divider-color,#ccc);border-radius:7px;background:var(--card-background-color,#fff);color:inherit;font-size:10px;cursor:pointer;";
    clearHistory.addEventListener("click",()=>this.__clearTraceMonitorSamples());
    const count=document.createElement("span");
    count.textContent=this.__traceMonitorSamples.length+" amostras";
    count.style.cssText="margin-left:auto;font-size:10px;color:var(--secondary-text-color,#777);";
    controls.append(select,toggle,one,clearHistory,count);dialog.appendChild(controls);

    if(!contact?.added_to_node){
      const warning=document.createElement("div");
      warning.textContent="Este nó precisa de estar Adicionado antes de poder executar Trace Monitor.";
      warning.style.cssText="margin:0 16px 10px;padding:9px;border-radius:7px;background:rgba(255,152,0,.12);font-size:11px;";
      dialog.appendChild(warning);
      toggle.disabled=true;one.disabled=true;
    }

    const good=this.__traceMonitorSamples.filter((sample)=>!sample.error);
    if(good.length){
      const charts=document.createElement("div");
      charts.style.cssText="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:0 16px 10px;";
      for(const [label,key,unit] of [["RTT","round_trip_ms","ms"],["SNR final","final_snr","dB"]]){
        const valid=good.filter((sample)=>sample[key]!=null&&Number.isFinite(Number(sample[key])));
        if(!valid.length)continue;
        const card=document.createElement("div");card.style.cssText="padding:9px;border-radius:8px;background:var(--secondary-background-color,#f5f5f5);";
        const latest=Number(valid[valid.length-1][key]);
        const head=document.createElement("div");head.textContent=label+" · "+latest.toFixed(key==="round_trip_ms"?0:1)+" "+unit;head.style.cssText="font-size:11px;font-weight:650;";
        card.append(head,this.__traceMonitorChart(valid,key));charts.appendChild(card);
      }
      dialog.appendChild(charts);
    }

    const list=document.createElement("div");
    list.style.cssText="overflow:auto;max-height:330px;padding:0 16px 14px;";
    for(const sample of [...this.__traceMonitorSamples].reverse()){
      const row=document.createElement("div");
      row.style.cssText="display:grid;grid-template-columns:145px 1fr;gap:8px;padding:7px 4px;border-top:1px solid var(--divider-color,#e5e5e5);font-size:11px;";
      const when=document.createElement("span");when.textContent=new Date(sample.timestamp).toLocaleString();when.style.color="var(--secondary-text-color,#777)";
      const value=document.createElement("span");
      value.textContent=sample.error
        ? "Erro: "+sample.error
        : String(sample.round_trip_ms)+" ms · "+String(sample.hops)+" hops"+(sample.final_snr!=null&&Number.isFinite(Number(sample.final_snr))?" · SNR "+Number(sample.final_snr).toFixed(1)+" dB":"");
      if(sample.error)value.style.color="var(--error-color,#db4437)";
      row.append(when,value);list.appendChild(row);
    }
    if(!this.__traceMonitorSamples.length){
      const empty=document.createElement("div");empty.textContent="Ainda sem amostras.";empty.style.cssText="padding:18px;text-align:center;color:var(--secondary-text-color,#777);font-size:11px;";list.appendChild(empty);
    }
    dialog.appendChild(list);
  }

  __openTraceMonitor(contact) {
    this.__closeTraceMonitor();
    this.__traceMonitorContact=contact;
    this.__traceMonitorSamples=this.__loadTraceMonitorSamples(contact);
    this.__traceMonitorInterval=300;
    const overlay=document.createElement("div");
    overlay.id="hive-trace-monitor-overlay";
    overlay.style.cssText="position:fixed;inset:0;z-index:10070;background:rgba(0,0,0,.48);display:grid;place-items:center;padding:18px;box-sizing:border-box;";
    const dialog=document.createElement("div");
    dialog.className="hive-trace-monitor-dialog";
    dialog.style.cssText="width:min(720px,100%);max-height:min(86vh,800px);display:flex;flex-direction:column;background:var(--card-background-color,#fff);color:var(--primary-text-color,#222);border-radius:12px;box-shadow:0 10px 34px rgba(0,0,0,.28);overflow:hidden;";
    overlay.appendChild(dialog);
    overlay.addEventListener("click",(event)=>{if(event.target===overlay)this.__closeTraceMonitor();});
    this.shadowRoot?.appendChild(overlay);
    this.__traceMonitorOverlay=overlay;
    this.__renderTraceMonitorOverlay();
  }

  __nodeMapPopup(contact) {
    const root=document.createElement("div");
    root.style.minWidth="300px";
    root.style.maxWidth="410px";
    root.style.fontFamily="var(--paper-font-body1_-_font-family, sans-serif)";

    const header=document.createElement("div");
    header.style.cssText="display:flex;align-items:center;gap:10px;padding-top:14px;margin-bottom:8px;";

    const title=document.createElement("div");
    title.textContent=String(contact.adv_name||contact.pubkey_prefix||"Nó");
    title.style.cssText="flex:1;min-width:0;font-weight:700;font-size:15px;line-height:1.25;overflow-wrap:anywhere;";
    header.appendChild(title);

    const publicKeyForAction=String(contact.public_key||"").trim();
    const hasRealKey=/^[0-9a-fA-F]{64}$/.test(publicKeyForAction);
    if(hasRealKey){
      const meta=this.__nodeMeta(contact);
      const favorite=document.createElement("button");
      favorite.type="button";
      favorite.textContent=meta.favorite?"★":"☆";
      favorite.title=meta.favorite?"Remover dos favoritos":"Adicionar aos favoritos";
      favorite.setAttribute("aria-label",favorite.title);
      favorite.style.cssText="flex:0 0 auto;width:30px;height:30px;padding:0;border:1px solid var(--divider-color,#ccc);border-radius:7px;background:var(--card-background-color,#fff);color:var(--warning-color,#ff9800);font-size:18px;line-height:1;cursor:pointer;";
      favorite.addEventListener("click",(event)=>{
        event.preventDefault();event.stopPropagation();
        this.__setNodeMeta(contact,{favorite:!meta.favorite});
      });
      header.appendChild(favorite);
    }
    if(!contact.__hivefw_local__ && hasRealKey){
      const added=!!contact.added_to_node;
      const contactAction=document.createElement("button");
      contactAction.type="button";
      contactAction.textContent=added?"👤 Remover":"👤 Adicionar";
      contactAction.title=added?"Remover dos contactos adicionados":"Adicionar aos contactos";
      contactAction.style.cssText=added
        ?"flex:0 0 auto;padding:6px 9px;border:1px solid var(--error-color,#db4437);border-radius:7px;background:var(--card-background-color,#fff);color:var(--error-color,#db4437);font-size:11px;font-weight:650;white-space:nowrap;cursor:pointer;"
        :"flex:0 0 auto;padding:6px 9px;border:1px solid var(--primary-color,#03a9f4);border-radius:7px;background:var(--card-background-color,#fff);color:var(--primary-color,#03a9f4);font-size:11px;font-weight:650;white-space:nowrap;cursor:pointer;";
      contactAction.addEventListener("click",(event)=>{
        event.preventDefault();
        event.stopPropagation();
        if(contactAction.disabled)return;
        contactAction.disabled=true;
        contactAction.style.opacity=".65";
        contactAction.textContent=added?"A remover…":"A adicionar…";
        const page=this.shadowRoot?.querySelector("meshcore-nodes-page");
        page?.dispatchEvent(new CustomEvent("node-action",{
          detail:{action:added?"remove-contact":"add-contact",node:contact},
          bubbles:true,
          composed:true,
        }));
      });
      header.appendChild(contactAction);
    }

    root.appendChild(header);

    if(hasRealKey){
      const meta=this.__nodeMeta(contact);
      const tagRow=document.createElement("div");
      tagRow.style.cssText="display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin:-2px 0 8px;";
      for(const tag of meta.tags){
        const chip=document.createElement("button");
        chip.type="button";
        chip.textContent="#"+tag+" ×";
        chip.title="Remover tag "+tag;
        chip.style.cssText="padding:3px 6px;border:1px solid var(--divider-color,#ccc);border-radius:999px;background:var(--secondary-background-color,#f5f5f5);color:var(--secondary-text-color,#666);font-size:10px;cursor:pointer;";
        chip.addEventListener("click",(event)=>{
          event.preventDefault();event.stopPropagation();
          this.__setNodeMeta(contact,{tags:meta.tags.filter((value)=>value!==tag)});
        });
        tagRow.appendChild(chip);
      }
      const addTag=document.createElement("button");
      addTag.type="button";addTag.textContent="+ Tag";addTag.title="Adicionar tag local";
      addTag.style.cssText="padding:3px 7px;border:1px dashed var(--divider-color,#aaa);border-radius:999px;background:transparent;color:var(--primary-color,#03a9f4);font-size:10px;font-weight:650;cursor:pointer;";
      addTag.addEventListener("click",(event)=>{
        event.preventDefault();event.stopPropagation();
        const raw=window.prompt("Nova tag para este nó:","");
        if(raw==null)return;
        const tag=raw.trim().replace(/^#+/,"").replace(/\s+/g," ").slice(0,24);
        if(!tag)return;
        const next=[...new Set([...meta.tags,tag])].slice(0,8);
        this.__setNodeMeta(contact,{tags:next});
      });
      tagRow.appendChild(addTag);
      root.appendChild(tagRow);
    }

    const typeLabels={0:"Client/Unknown",1:"Client",2:"Repeater",3:"Room Server",4:"Sensor"};
    const rows=[];
    if(contact.__hivefw_local){
      rows.push(["Tipo","Repeater local"]);
    }else{
      rows.push(["Tipo",typeLabels[Number(contact.type)]||`Tipo ${Number(contact.type)||0}`]);
      rows.push(["Estado",contact.added_to_node?"Adicionado":"Descoberto"]);
    }

    const publicKey=String(contact.public_key||"").trim();
    const prefix=String(contact.pubkey_prefix||publicKey.slice(0,12)||"").trim();
    if(prefix && prefix!=="LOCAL")rows.push(["Prefixo",prefix]);

    const rssi=Number(contact.last_rssi ?? contact.rssi);
    const snr=Number(contact.last_snr ?? contact.snr);
    if(Number.isFinite(rssi))rows.push(["RSSI",`${rssi} dBm`]);
    if(Number.isFinite(snr))rows.push(["SNR",`${snr} dB`]);

    const activity=this.__peerActivityFor(contact);
    if(activity.rx||activity.tx){
      rows.push(["Mensagens",`RX ${activity.rx} · TX ${activity.tx}`]);
    }
    if(activity.linkVolume){
      let linkText=String(activity.linkVolume)+" observações";
      if(Number.isFinite(activity.avgRssi))linkText+=" · RSSI "+activity.avgRssi.toFixed(1)+" dBm";
      if(Number.isFinite(activity.avgSnr))linkText+=" · SNR "+activity.avgSnr.toFixed(1)+" dB";
      rows.push(["Volume link",linkText]);
    }

    const lastAdvert=Number(contact.last_advert||0);
    if(lastAdvert>0){
      const date=new Date(lastAdvert*1000);
      if(!Number.isNaN(date.getTime()))rows.push(["Último advert",date.toLocaleString()]);
    }

    const lastmod=Number(contact.lastmod ?? contact.last_modified ?? 0);
    if(lastmod>0){
      const date=new Date(lastmod*1000);
      if(!Number.isNaN(date.getTime()))rows.push(["Atualizado localmente",date.toLocaleString()]);
    }

    const lat=Number(contact.adv_lat ?? contact.latitude);
    const lon=Number(contact.adv_lon ?? contact.longitude);
    if(Number.isFinite(lat)&&Number.isFinite(lon)&&!(lat===0&&lon===0)){
      rows.push(["Localização",`${lat.toFixed(6)}, ${lon.toFixed(6)}`]);
    }

    const flags=Number(contact.flags);
    if(Number.isFinite(flags)){
      rows.push(["Flags",`0x${Math.trunc(flags).toString(16).padStart(2,"0").toUpperCase()} (${Math.trunc(flags)})`]);
    }

    const storedPath=this.__meshcoreExportPath(contact);
    let pathHops=Number(contact.out_path_len);
    if(!Number.isInteger(pathHops)||pathHops<0){
      pathHops=storedPath?storedPath.split(",").filter(Boolean).length:0;
    }

    let hashMode=Number(contact.out_path_hash_mode ?? contact.path_hash_mode);
    if(!Number.isInteger(hashMode)||hashMode<0||hashMode>2){
      const first=storedPath.split(",").find(Boolean)||"";
      hashMode=first.length===2?0:first.length===4?1:first.length===6?2:-1;
    }

    if(storedPath){
      rows.push(["Path guardado",storedPath]);
      rows.push(["Hops",String(pathHops)]);
      if(hashMode>=0){
        rows.push(["Path Hash",`${hashMode+1} byte${hashMode===0?"":"s"}`]);
      }
    }

    const makeRow=(label,value,mono=false)=>{
      const row=document.createElement("div");
      row.style.display="grid";
      row.style.gridTemplateColumns="112px minmax(0,1fr)";
      row.style.gap="9px";
      row.style.fontSize="12px";
      row.style.lineHeight="1.45";
      row.style.padding="2px 0";

      const key=document.createElement("span");
      key.textContent=label;
      key.style.color="var(--secondary-text-color,#666)";

      const val=document.createElement("span");
      val.textContent=String(value);
      val.style.fontWeight="500";
      val.style.minWidth="0";
      val.style.overflowWrap="anywhere";
      if(mono)val.style.fontFamily="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

      row.append(key,val);
      return row;
    };

    for(const [label,value] of rows){
      root.appendChild(makeRow(label,value,label==="Path guardado"||label==="Prefixo"));
    }

    if(publicKey && publicKey!=="__hivefw_local__"){
      const details=document.createElement("details");
      details.style.marginTop="5px";
      const summary=document.createElement("summary");
      summary.textContent="Chave pública";
      summary.style.cssText="cursor:pointer;font-size:11px;color:var(--secondary-text-color,#666);";
      const key=document.createElement("div");
      key.textContent=publicKey;
      key.style.cssText="margin-top:5px;padding:6px 7px;border-radius:6px;background:var(--secondary-background-color,#f3f3f3);font:10px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow-wrap:anywhere;";
      details.append(summary,key);
      root.appendChild(details);
    }

    const copyText=[
      String(contact.adv_name||contact.pubkey_prefix||"Nó"),
      ...rows.map(([label,value])=>`${label}: ${value}`),
      ...(publicKey&&publicKey!=="__hivefw_local__"?[`Chave pública: ${publicKey}`]:[])
    ].join("\n");

    const actions=document.createElement("div");
    actions.style.cssText="display:flex;gap:7px;margin-top:11px;";

    if(!contact.__hivefw_local__ && prefix && Number(contact.type)!==1){
      const trace=document.createElement("button");
      trace.type="button";
      trace.textContent="Trace";
      trace.style.cssText="flex:1;padding:7px 9px;border:1px solid var(--primary-color,#03a9f4);border-radius:6px;background:var(--primary-color,#03a9f4);color:#fff;font-size:12px;font-weight:650;cursor:pointer;";
      trace.addEventListener("click",(event)=>{
        event.preventDefault();
        event.stopPropagation();
        const page=this.shadowRoot?.querySelector("meshcore-nodes-page");
        page?.dispatchEvent(new CustomEvent("node-action",{
          detail:{action:"trace",node:contact},
          bubbles:true,
          composed:true,
        }));
      });
      actions.appendChild(trace);

      if(contact.added_to_node){
        const monitor=document.createElement("button");
        monitor.type="button";monitor.textContent="Monitor";monitor.title="Trace Monitor on-demand";
        monitor.style.cssText="flex:1;padding:7px 9px;border:1px solid var(--divider-color,#bbb);border-radius:6px;background:var(--card-background-color,#fff);color:var(--primary-color,#03a9f4);font-size:12px;font-weight:650;cursor:pointer;";
        monitor.addEventListener("click",(event)=>{event.preventDefault();event.stopPropagation();this.__openTraceMonitor(contact);});
        actions.appendChild(monitor);
      }
    }

    const copy=document.createElement("button");
    copy.type="button";
    copy.textContent="Copiar texto";
    copy.style.cssText="flex:1;padding:7px 9px;border:1px solid var(--divider-color,#bbb);border-radius:6px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#333);font-size:12px;font-weight:600;cursor:pointer;";
    copy.addEventListener("click",async(event)=>{
      event.preventDefault();
      event.stopPropagation();
      const original=copy.textContent;
      try{
        if(navigator.clipboard?.writeText){
          await navigator.clipboard.writeText(copyText);
        }else{
          const area=document.createElement("textarea");
          area.value=copyText;
          area.style.position="fixed";
          area.style.opacity="0";
          document.body.appendChild(area);
          area.focus();
          area.select();
          document.execCommand("copy");
          area.remove();
        }
        copy.textContent="Copiado";
      }catch{
        copy.textContent="Não foi possível copiar";
      }
      window.setTimeout(()=>{
        if(copy.isConnected)copy.textContent=original;
      },1200);
    });
    actions.appendChild(copy);
    root.appendChild(actions);

    return root;
  }

  __legacyLeafletLayers(map,contacts,page) {
    const L=map?.Leaflet;
    if(!L)return [];
    this.__nodesLeafletMarkers.clear();
    return contacts.map((contact)=>{
      const coords=this.__nodeCoords(contact);
      if(!coords)return null;
      const isLocal=!!contact.__hivefw_local;
      const id=this.__nodeId(contact);
      const name=String(contact.adv_name||contact.pubkey_prefix||"Nó");
      const age=String(contact?.age_bucket|| (isLocal?"lt1h":"stale"));
      const ageColors={
        lt1h:"#2e7d32",
        lt6h:"#66a832",
        lt24h:"#f9a825",
        lt7d:"#ef6c00",
        stale:"#757575",
      };
      const markerColor=ageColors[age]||ageColors.stale;
      const markerIcon=L.divIcon?.({
        className:"hivefw-node-age-marker",
        html:'<span style="display:block;width:14px;height:14px;border-radius:50%;background:'+markerColor+';border:'+(isLocal?'3px solid var(--primary-color,#03a9f4)':'2px solid white')+';box-shadow:0 1px 4px rgba(0,0,0,.5)"></span>',
        iconSize:[18,18],
        iconAnchor:[9,9],
      });
      const marker=L.marker(coords,{title:name,keyboard:true,riseOnHover:true,zIndexOffset:isLocal?1000:0,...(markerIcon?{icon:markerIcon}:{})});
      const meta=this.__nodeMeta(contact);
      const tagText=meta.tags.length?" · "+meta.tags.map((tag)=>"#"+tag).join(" "):"";
      const tooltipName=(meta.favorite?"★ ":"")+name+(isLocal?" · local":"")+tagText;
      marker.bindTooltip?.(tooltipName,{
        direction:"top",
        offset:[0,-12],
        permanent:isLocal,
      });
      marker.on?.("click",()=>{
        this.__focusNodeOnMap(contact,true);
      });
      if(id)this.__nodesLeafletMarkers.set(id,marker);
      return marker;
    }).filter(Boolean);
  }

  __closePersistentNodePopup() {
    const popup=this.__nodesPersistentPopup;
    const map=this.__nodesMapElement?.leafletMap;
    if(popup && map){
      try{ map.removeLayer(popup); }catch{}
    }
    this.__nodesPersistentPopup=null;
    this.__nodesPopupId="";
  }

  __openPersistentNodePopup(contact) {
    const mapEl=this.__nodesMapElement;
    const map=mapEl?.leafletMap;
    const L=mapEl?.Leaflet;
    const coords=this.__nodeCoords(contact);
    if(!map||!L||!coords)return false;

    this.__closePersistentNodePopup();

    const id=this.__nodeId(contact);
    const popup=L.popup({
      autoPan:true,
      autoClose:false,
      closeOnClick:false,
      closeButton:true,
      minWidth:320,
      maxWidth:440,
      className:"hivefw-node-popup",
      offset:[0,-10],
    })
      .setLatLng(coords)
      .setContent(this.__nodeMapPopup(contact));

    popup.on?.("remove",()=>{
      if(this.__nodesPersistentPopup===popup){
        this.__nodesPersistentPopup=null;
        this.__nodesPopupId="";
      }
    });

    popup.addTo(map);
    this.__nodesPersistentPopup=popup;
    this.__nodesPopupId=id;
    return true;
  }

  __resetNodesMapView() {
    const map=this.__nodesMapElement?.leafletMap;
    const saved=this.__nodesInitialViewport;
    if(!map||!saved)return false;
    this.__closePersistentNodePopup();
    map.setView([saved.lat,saved.lng],saved.zoom,{animate:true});
    return true;
  }

  async __applyInitialNodesMapView(localRepeater) {
    const mapEl=this.__nodesMapElement;
    if(!mapEl||!localRepeater)return false;
    if(!await this.__waitForLegacyLeaflet(mapEl))return false;

    const coords=this.__nodeCoords(localRepeater);
    if(!coords)return false;

    const bounds=mapEl.Leaflet.circle(coords,{radius:100000}).getBounds();
    mapEl.leafletMap.fitBounds(bounds,{animate:false});

    const center=mapEl.leafletMap.getCenter?.();
    const zoom=mapEl.leafletMap.getZoom?.();
    if(center && Number.isFinite(center.lat) && Number.isFinite(center.lng) && Number.isFinite(zoom)){
      this.__nodesInitialViewport={lat:center.lat,lng:center.lng,zoom};
    }
    return true;
  }

  async __ensureSplitMap(page,pane) {
    if(!pane?.isConnected)return;
    const entryId=this.__entryId()||null;
    if(!this.__repeaterStatus && !this.__repeaterLoading){
      await this.__loadRepeaterStatus();
    }
    if(!Array.isArray(this.__nodesMapContacts)||this.__nodesMapLoadedEntry!==entryId){
      if(!pane.querySelector(".hive-map-note")){
        const note=document.createElement("div");
        note.className="hive-map-note";
        note.textContent="A carregar nós…";
        pane.appendChild(note);
      }
      await this.__loadNodesMapContacts();
    }

    const ready=await this.__ensureMapLoaded();
    if(!pane.isConnected)return;

    const source=Array.isArray(this.__nodesMapContacts)?this.__nodesMapContacts:[];
    const contacts=this.__validMapContacts();
    const localRepeater=this.__localRepeaterMapContact();
    const localId=localRepeater?this.__nodeId(localRepeater):"";
    const mapContacts=localRepeater
      ? [localRepeater,...contacts.filter((contact)=>this.__nodeId(contact)!==localId)]
      : contacts;

    if(!ready){
      if(!this.__nodesMapElement?.isConnected){
        pane.replaceChildren();
        const note=document.createElement("div");
        note.className="hive-map-note";
        note.textContent="Não foi possível carregar o mapa do Home Assistant.";
        pane.appendChild(note);
      }
      return;
    }

    if(!contacts.length){
      if(!this.__nodesMapElement?.isConnected){
        pane.replaceChildren();
        const note=document.createElement("div");
        note.className="hive-map-note";
        note.textContent=`0 nós com localização · ${source.length} nós no total. Os nós sem GPS anunciado permanecem na lista.`;
        pane.appendChild(note);
      }
      return;
    }

    if(!this.__nodesMapElement?.isConnected){
      pane.replaceChildren();

      const count=document.createElement("div");
      count.className="hive-map-count";
      pane.appendChild(count);

      const map=document.createElement("ha-map");
      map.autoFit=false;
      map.clusterMarkers=true;
      map.scaleRuler=true;
      map.themeMode="light";
      map.addEventListener("editable-location-clicked",(e)=>{
        const id=e.detail?.id;
        const contact=this.__validMapContacts().find((c)=>this.__nodeId(c)===id);
        if(contact){
          this.__focusNodeOnMap(contact);
        }
      });
      pane.appendChild(map);
      this.__nodesMapElement=map;
      this.__nodesMapSignature="";
    }

    const signature=mapContacts.map((c)=>{
      const p=this.__nodeCoords(c);
      const meta=this.__nodeMeta(c); return `${this.__nodeId(c)}:${p?.[0]}:${p?.[1]}:${c?.map_entity_id||""}:${String(c?.adv_name||"")}:${c?.__hivefw_local?1:0}:${meta.favorite?1:0}:${meta.tags.join(",")}`;
    }).join("|");

    const count=pane.querySelector(".hive-map-count");
    if(count){
      count.replaceChildren();
      const label=document.createElement("span");
      label.textContent=`${contacts.length} nós com localização - `;
      const center=document.createElement("button");
      center.type="button";
      center.textContent="CENTRAR";
      center.title="Centrar no repetidor local";
      center.addEventListener("click",(event)=>{
        event.preventDefault();
        event.stopPropagation();

        const local=this.__localRepeaterMapContact();
        if(!local)return;

        const id=this.__nodeId(local);
        const marker=this.__nodesLeafletMarkers.get(id);

        // This is intentionally the same operation as clicking the actual
        // local contact marker. Because "local" is now the real discovered
        // contact, its marker id/coordinates are the same ones shown on map.
        if(marker?.fire){
          marker.fire("click");
          return;
        }
        this.__focusNodeOnMap(local,true);
      });
      const routes=document.createElement("button");
      routes.type="button";
      routes.textContent="ROTAS";
      routes.title="Abrir histórico de Trace";
      routes.style.marginLeft="8px";
      routes.addEventListener("click",(event)=>{
        event.preventDefault();
        event.stopPropagation();
        void this.__toggleTraceHistory();
      });
      count.append(label,center,routes);
    }

    // Home Assistant 2026.9's ha-map has no editableLocations API yet.
    // It does expose Leaflet layers, so use real Leaflet markers there.
    // Newer HA builds are feature-detected and use editableLocations/entities.
    if(this.__nodesMapSignature!==signature){
      const map=this.__nodesMapElement;
      if("layers" in map && await this.__waitForLegacyLeaflet(map)){
        map.entities=[];
        map.layers=this.__legacyLeafletLayers(map,mapContacts,page);
      }else{
        map.entities=this.__mapEntities(mapContacts);
        if("editableLocations" in map){
          map.editableLocations=this.__mapLocations(mapContacts);
        }
      }
      this.__nodesMapSignature=signature;
    }

    if(localRepeater && this.__nodesMapInitialViewEntry!==entryId){
      if(await this.__applyInitialNodesMapView(localRepeater)){
        this.__nodesMapInitialViewEntry=entryId;
      }
    }
    this.__drawLastTraceRoute();
  }

  __focusNodeOnMap(contact,openPopup=true) {
    const coords=this.__nodeCoords(contact);
    const pane=this.__nodesMapPane;
    if(!coords||!pane||!this.__nodesMapElement)return;

    const id=this.__nodeId(contact);
    this.__nodesMapFocusId=id;

    const selected=pane.querySelector(".hive-map-selection");
    if(selected)selected.hidden=true;

    const contacts=this.__validMapContacts();
    const map=this.__nodesMapElement;
    if(map.leafletMap){
      map.leafletMap.setView(coords,12,{animate:true});
      if(openPopup){
        const marker=this.__nodesLeafletMarkers.get(id);
        marker?.setZIndexOffset?.(2000);
        window.setTimeout(()=>{
          this.__openPersistentNodePopup(contact);
        },180);
      }
    }else if(!("layers" in map)){
      map.entities=this.__mapEntities(contacts);
      if("editableLocations" in map)map.editableLocations=this.__mapLocations(contacts);
      map.setView?.(coords,12);
    }
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
      const msg = { type: "hivefw_integration/get_local_repeater_status" };
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
        type: "hivefw_integration/set_device_config",
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

  __ensureConsoleOverlay(container) {
    let overlay = container.querySelector(".hivefw-console-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "hivefw-console-overlay";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      container.appendChild(overlay);
    }
    this.__consoleOverlay = overlay;
    return overlay;
  }

  __removeConsoleOverlay() {
    if (this.__consoleOverlay?.isConnected) this.__consoleOverlay.remove();
    this.__consoleOverlay = null;
  }

  __formatConsoleResponse(value) {
    if (value == null) return "(sem resposta)";
    if (typeof value === "string") return value;
    try { return JSON.stringify(value, null, 2); }
    catch (_) { return String(value); }
  }

  async __loadConsoleHistory() {
    if (!this.hass) return;
    try {
      const msg = { type: "hivefw_integration/console_get" };
      const entryId = this.__entryId();
      if (entryId) msg.entry_id = entryId;
      const result = await this.hass.callWS(msg);
      this.__consoleHistory = Array.isArray(result?.history) ? result.history : [];
      this.__consoleCommandHistory = this.__consoleHistory
        .map((item) => String(item?.command || "").trim())
        .filter(Boolean)
        .slice(-50);
      this.__consoleHistoryIndex = this.__consoleCommandHistory.length;
      this.__consoleError = null;
    } catch (error) {
      this.__consoleError = error?.message || "Não foi possível carregar o histórico da Console.";
    }
    if (this._activeTab === "console" && this.__consoleOverlay) {
      this.__renderConsole(this.__consoleOverlay);
    }
  }

  async __runConsoleCommand(command) {
    const raw = String(command || "").trim();
    if (!raw || !this.hass || this.__consoleBusy) return;
    this.__consoleBusy = true;
    this.__consoleError = null;
    if (this.__consoleOverlay) this.__renderConsole(this.__consoleOverlay);

    try {
      const msg = {
        type: "hivefw_integration/console_execute",
        command: raw,
      };
      const entryId = this.__entryId();
      if (entryId) msg.entry_id = entryId;
      const result = await this.hass.callWS(msg);
      if (!result?.success && result?.response) {
        this.__consoleError = this.__formatConsoleResponse(result.response);
      }
      await this.__loadConsoleHistory();
    } catch (error) {
      this.__consoleError = error?.message || "Falha ao executar o comando.";
    } finally {
      this.__consoleBusy = false;
      if (this._activeTab === "console" && this.__consoleOverlay) {
        this.__renderConsole(this.__consoleOverlay);
      }
    }
  }

  async __clearConsole() {
    if (!this.hass || this.__consoleBusy) return;
    this.__consoleBusy = true;
    try {
      const msg = { type: "hivefw_integration/console_clear" };
      const entryId = this.__entryId();
      if (entryId) msg.entry_id = entryId;
      await this.hass.callWS(msg);
      this.__consoleHistory = [];
      this.__consoleError = null;
    } catch (error) {
      this.__consoleError = error?.message || "Não foi possível limpar a Console.";
    } finally {
      this.__consoleBusy = false;
      if (this._activeTab === "console" && this.__consoleOverlay) {
        this.__renderConsole(this.__consoleOverlay);
      }
    }
  }

  __renderConsole(container) {
    container.replaceChildren();

    const page = document.createElement("div");
    page.className = "hivefw-console-page";
    const wrap = document.createElement("div");
    wrap.className = "hivefw-console-wrap";
    page.appendChild(wrap);
    container.appendChild(page);

    const hero = document.createElement("section");
    hero.className = "mcr-hero";
    const heading = document.createElement("div");
    const eyebrow = document.createElement("div");
    eyebrow.className = "mcr-eyebrow";
    eyebrow.textContent = "⌨  HIVEFW · CONSOLE";
    const title = document.createElement("h1");
    title.className = "mcr-title";
    title.textContent = "Console";
    const subtitle = document.createElement("p");
    subtitle.className = "mcr-subtitle";
    subtitle.textContent =
      "Executa comandos diretamente no rádio ligado ao Home Assistant. Os comandos locais não geram tráfego LoRa, exceto quando o próprio comando envia dados para a mesh.";
    heading.append(eyebrow, title, subtitle);
    hero.appendChild(heading);
    wrap.appendChild(hero);

    const quickCard = document.createElement("section");
    quickCard.className = "hivefw-console-card";
    const quickTitle = document.createElement("div");
    quickTitle.className = "mcr-card-title";
    quickTitle.textContent = "Comandos rápidos";
    const quick = document.createElement("div");
    quick.className = "hivefw-console-quick";
    const commands = [
      ["Info", "send_appstart"],
      ["Bateria", "get_bat"],
      ["Hora", "get_time"],
      ["Stats Core", "get_stats_core"],
      ["Stats Rádio", "get_stats_radio"],
      ["Stats Pacotes", "get_stats_packets"],
      ["Path Hash", "get_path_hash_mode"],
      ["Frequências", "get_allowed_repeat_freq"],
    ];
    for (const [label, command] of commands) {
      const button = document.createElement("button");
      button.className = "mcr-btn";
      button.type = "button";
      button.textContent = label;
      button.title = command;
      button.disabled = this.__consoleBusy;
      button.addEventListener("click", () => void this.__runConsoleCommand(command));
      quick.appendChild(button);
    }
    quickCard.append(quickTitle, quick);
    wrap.appendChild(quickCard);

    // Reuse the exact command catalogue that powered the former Device
    // "Issue Command" dialog. This keeps one source of truth for command
    // names, categories, parameters and danger flags.
    const presetCard = document.createElement("section");
    presetCard.className = "hivefw-console-card";
    const presetTitle = document.createElement("div");
    presetTitle.className = "mcr-card-title";
    presetTitle.textContent = "Comandos pré-definidos";

    const commandElement = document.createElement("meshcore-command-dialog");
    commandElement.isLocal = true;
    const definitions = typeof commandElement._getCommands === "function"
      ? commandElement._getCommands()
      : [];

    const presetSelect = document.createElement("select");
    presetSelect.className = "hivefw-console-input";
    presetSelect.style.flex = "1 1 100%";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecionar comando…";
    presetSelect.appendChild(placeholder);

    const groups = new Map();
    for (const def of definitions) {
      const category = String(def?.category || "Outros");
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(def);
    }
    for (const [category, defs] of groups) {
      const group = document.createElement("optgroup");
      group.label = category;
      for (const def of defs) {
        const option = document.createElement("option");
        option.value = def.name;
        option.textContent = def.name + " — " + (def.description || "");
        option.selected = def.name === this.__consolePresetName;
        group.appendChild(option);
      }
      presetSelect.appendChild(group);
    }

    const presetBody = document.createElement("div");
    presetBody.style.marginTop = "10px";

    const renderPreset = () => {
      presetBody.replaceChildren();
      const selected = definitions.find((def) => def.name === this.__consolePresetName);
      if (!selected) return;

      const desc = document.createElement("div");
      desc.className = "hivefw-console-hint";
      desc.textContent = selected.description || "";
      desc.style.marginBottom = "10px";
      presetBody.appendChild(desc);

      if (selected.dangerous) {
        const warning = document.createElement("div");
        warning.className = "hivefw-console-error";
        warning.style.cssText += "padding:8px 10px;border:1px solid currentColor;border-radius:8px;margin:0 0 10px;";
        warning.textContent = "⚠ " + (selected.dangerMessage || "Este comando pode alterar permanentemente a configuração do rádio.");
        presetBody.appendChild(warning);
      }

      const params = Array.isArray(selected.params) ? selected.params : [];
      const fields = document.createElement("div");
      fields.className = "hive-settings-controls";

      for (const param of params) {
        const field = document.createElement("label");
        field.className = "hive-settings-field";
        const label = document.createElement("span");
        label.textContent = (param.label || param.name) + (param.required ? " *" : "");
        field.appendChild(label);

        let input;
        if (param.type === "boolean") {
          input = document.createElement("select");
          for (const [value, text] of [["false","False"],["true","True"]]) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = text;
            input.appendChild(option);
          }
          const existing = this.__consolePresetValues[param.name];
          input.value = String(existing ?? param.default ?? false);
        } else if (param.type === "select") {
          input = document.createElement("select");
          const opts = Array.isArray(param.selectOptions) && param.selectOptions.length
            ? param.selectOptions
            : (param.options || []).map((value) => ({ label: String(value), value }));
          for (const opt of opts) {
            const option = document.createElement("option");
            option.value = String(opt.value);
            option.textContent = String(opt.label);
            input.appendChild(option);
          }
          const existing = this.__consolePresetValues[param.name];
          input.value = String(existing ?? param.default ?? (opts[0]?.value ?? ""));
        } else if (param.type === "bitmask") {
          input = document.createElement("input");
          input.type = "number";
          input.min = "0";
          input.value = String(this.__consolePresetValues[param.name] ?? param.default ?? 0);
        } else {
          input = document.createElement("input");
          input.type = param.type === "number" ? "number" : "text";
          if (param.min != null) input.min = String(param.min);
          if (param.max != null) input.max = String(param.max);
          input.value = String(this.__consolePresetValues[param.name] ?? param.default ?? "");
        }

        input.style.cssText = "box-sizing:border-box;width:100%;min-height:38px;border:1px solid var(--divider-color);border-radius:8px;padding:8px;background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;font-size:12px;";
        if (param.description) input.title = param.description;
        input.addEventListener("input", () => {
          let value = input.value;
          if (param.type === "number" || param.type === "bitmask") {
            value = value === "" ? "" : Number(value);
          } else if (param.type === "boolean") {
            value = value === "true";
          } else if (param.type === "select" && Array.isArray(param.selectOptions)) {
            const found = param.selectOptions.find((opt) => String(opt.value) === input.value);
            value = found ? found.value : input.value;
          }
          this.__consolePresetValues[param.name] = value;
        });
        field.appendChild(input);

        if (param.description) {
          const help = document.createElement("span");
          help.className = "hivefw-console-hint";
          help.textContent = param.description;
          field.appendChild(help);
        }
        fields.appendChild(field);
      }

      if (params.length) presetBody.appendChild(fields);

      const runPreset = document.createElement("button");
      runPreset.type = "button";
      runPreset.className = "mcr-btn primary";
      runPreset.style.marginTop = "10px";
      runPreset.textContent = "Executar comando";
      runPreset.disabled = this.__consoleBusy;
      runPreset.addEventListener("click", () => {
        const parts = [selected.name];
        for (const param of params) {
          let value = this.__consolePresetValues[param.name];
          if (value === undefined) value = param.default;
          if ((value === undefined || value === "") && param.required) {
            this.__consoleError = "Preenche o parâmetro obrigatório: " + (param.label || param.name);
            this.__renderConsole(container);
            return;
          }
          if (value === undefined || value === "") continue;
          if (typeof value === "string") {
            const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
            parts.push(/[\s"']/u.test(value) ? '"' + escaped + '"' : escaped);
          } else if (typeof value === "boolean") {
            parts.push(value ? "true" : "false");
          } else {
            parts.push(String(value));
          }
        }
        void this.__runConsoleCommand(parts.join(" "));
      });
      presetBody.appendChild(runPreset);
    };

    presetSelect.addEventListener("change", () => {
      this.__consolePresetName = presetSelect.value;
      this.__consolePresetValues = {};
      const selected = definitions.find((def) => def.name === this.__consolePresetName);
      for (const param of selected?.params || []) {
        if (param.default !== undefined) this.__consolePresetValues[param.name] = param.default;
      }
      renderPreset();
    });

    presetCard.append(presetTitle, presetSelect, presetBody);
    wrap.appendChild(presetCard);
    renderPreset();

    const commandCard = document.createElement("section");
    commandCard.className = "hivefw-console-card";
    const inputTitle = document.createElement("div");
    inputTitle.className = "mcr-card-title";
    inputTitle.textContent = "Comando livre";
    const row = document.createElement("div");
    row.className = "hivefw-console-input-row";
    const input = document.createElement("input");
    input.className = "hivefw-console-input";
    input.type = "text";
    input.placeholder = 'Ex.: get_bat   ·   set_tx_power 20   ·   set_name "HiveFW"';
    input.autocomplete = "off";
    input.spellcheck = false;
    input.disabled = this.__consoleBusy;
    const run = document.createElement("button");
    run.className = "mcr-btn primary";
    run.type = "button";
    run.textContent = this.__consoleBusy ? "A executar…" : "Executar";
    run.disabled = this.__consoleBusy;
    const execute = () => {
      const command = input.value.trim();
      if (!command) return;
      input.value = "";
      void this.__runConsoleCommand(command);
    };
    run.addEventListener("click", execute);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        execute();
        return;
      }
      if (event.key === "ArrowUp" && this.__consoleCommandHistory.length) {
        event.preventDefault();
        this.__consoleHistoryIndex = Math.max(
          0,
          Math.min(this.__consoleHistoryIndex - 1, this.__consoleCommandHistory.length - 1),
        );
        input.value = this.__consoleCommandHistory[this.__consoleHistoryIndex] || "";
        input.setSelectionRange(input.value.length, input.value.length);
        return;
      }
      if (event.key === "ArrowDown" && this.__consoleCommandHistory.length) {
        event.preventDefault();
        this.__consoleHistoryIndex = Math.min(
          this.__consoleCommandHistory.length,
          this.__consoleHistoryIndex + 1,
        );
        input.value = this.__consoleHistoryIndex >= this.__consoleCommandHistory.length
          ? ""
          : (this.__consoleCommandHistory[this.__consoleHistoryIndex] || "");
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });
    row.append(input, run);
    const hint = document.createElement("div");
    hint.className = "hivefw-console-hint";
    hint.textContent =
      "A Console usa o parser nativo do HiveFW. Comandos destrutivos ou de configuração são executados exatamente como escritos; usa-os apenas quando pretendes alterar o rádio.";
    commandCard.append(inputTitle, row, hint);
    if (this.__consoleError) {
      const error = document.createElement("div");
      error.className = "hivefw-console-error";
      error.textContent = this.__consoleError;
      commandCard.appendChild(error);
    }
    wrap.appendChild(commandCard);

    const outputCard = document.createElement("section");
    outputCard.className = "hivefw-console-card";
    const toolbar = document.createElement("div");
    toolbar.className = "hivefw-console-toolbar";
    const outputTitle = document.createElement("div");
    outputTitle.className = "mcr-card-title";
    outputTitle.textContent = "Histórico";
    outputTitle.style.marginRight = "auto";
    const refresh = document.createElement("button");
    refresh.className = "mcr-btn";
    refresh.type = "button";
    refresh.textContent = "Atualizar";
    refresh.disabled = this.__consoleBusy;
    refresh.addEventListener("click", () => void this.__loadConsoleHistory());
    const clear = document.createElement("button");
    clear.className = "mcr-btn danger";
    clear.type = "button";
    clear.textContent = "Limpar";
    clear.disabled = this.__consoleBusy || this.__consoleHistory.length === 0;
    clear.addEventListener("click", () => void this.__clearConsole());
    toolbar.append(outputTitle, refresh, clear);

    const output = document.createElement("div");
    output.className = "hivefw-console-output";
    if (!this.__consoleHistory.length) {
      const empty = document.createElement("div");
      empty.className = "hivefw-console-empty";
      empty.textContent = "Ainda não existem comandos nesta sessão do rádio.";
      output.appendChild(empty);
    } else {
      for (const item of this.__consoleHistory) {
        const entry = document.createElement("div");
        entry.className = "hivefw-console-entry" + (item?.is_error ? " error" : "");
        const cmd = document.createElement("div");
        cmd.className = "hivefw-console-command";
        const stamp = document.createElement("span");
        stamp.className = "hivefw-console-time";
        const ts = Number(item?.timestamp || 0);
        stamp.textContent = ts
          ? new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
          : "--:--:--";
        cmd.append(stamp, document.createTextNode("> " + String(item?.command || "")));
        const response = document.createElement("div");
        response.className = "hivefw-console-response";
        response.textContent = this.__formatConsoleResponse(item?.response);
        entry.append(cmd, response);
        output.appendChild(entry);
      }
    }

    outputCard.append(toolbar, output);
    wrap.appendChild(outputCard);
    requestAnimationFrame(() => { output.scrollTop = output.scrollHeight; });
  }

    async __executeLocal(command, args, successText) {
    if (!this.hass) return;

    this.__repeaterMessage = null;
    this.__repeaterError = null;
    this.__repeaterLoading = true;
    this.__rerenderRepeater();

    try {
      const msg = {
        type: "hivefw_integration/execute_local",
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
      const msg = { type: "hivefw_integration/get_hive_neighbors" };
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
        "HiveFW"
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

customElements.define("hivefw-panel", HiveFWPanel);
