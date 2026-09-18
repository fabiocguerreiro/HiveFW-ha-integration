import "./meshcore-chat-panel.js";

/*
 * HiveFW compatibility wrapper.
 *
 * The repository keeps the canonical TypeScript implementation of the
 * Vizinhos page in frontend/src/pages/neighbors-page.ts. This wrapper makes
 * the feature immediately usable with the already-committed production
 * bundle: it subclasses the existing panel and injects the tab only when the
 * native compiled page is not present yet.
 *
 * Once meshcore-neighbors-page exists in the compiled bundle, this wrapper
 * becomes effectively a no-op apart from enforcing the HiveFW panel title.
 */
const BasePanel = customElements.get("meshcore-chat-panel");

if (!BasePanel) {
  throw new Error("meshcore-chat-panel failed to register");
}

class MeshCoreRepeaterPanel extends BasePanel {
  constructor() {
    super();
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
    this.__enhanceHiveUi();
  }

  __enhanceHiveUi() {
    const root = this.shadowRoot;
    if (!root) return;

    const title = root.querySelector(".panel-title");
    if (title) title.textContent = "MeshCore Repeater";

    // A future production bundle built from the TypeScript sources already
    // contains the page/tab. Do not duplicate or override that implementation.
    if (customElements.get("meshcore-neighbors-page")) {
      return;
    }

    this.__ensureHiveStyles(root);

    const tabBar = root.querySelector(".tab-bar");
    if (tabBar) {
      let button = tabBar.querySelector("[data-hive-neighbors-tab]");
      if (!button) {
        button = document.createElement("button");
        button.dataset.hiveNeighborsTab = "1";
        button.textContent = "Vizinhos";
        button.addEventListener("click", () => {
          this._activeTab = "neighbors";
          this.requestUpdate();
        });

        const settings = [...tabBar.querySelectorAll("button")]
          .find((item) => item.textContent?.trim() === "Settings");
        tabBar.insertBefore(button, settings || null);
      }
      button.classList.toggle("active", this._activeTab === "neighbors");
    }

    if (this._activeTab !== "neighbors") return;

    const pageContainer = root.querySelector(".page-container");
    if (!pageContainer) return;

    const entryId = this._config?.entry_id || this._selectedEntryId || null;
    if (entryId !== this.__hiveNeighborsLoadedEntry) {
      this.__hiveNeighbors = null;
      this.__hiveNeighborsError = null;
      this.__hiveNeighborsLoadedEntry = entryId;
    }

    this.__renderHiveNeighbors(pageContainer);

    if (!this.__hiveNeighbors && !this.__hiveNeighborsLoading) {
      void this.__loadHiveNeighbors();
    }
  }

  __ensureHiveStyles(root) {
    if (root.querySelector("#hive-neighbors-styles")) return;
    const style = document.createElement("style");
    style.id = "hive-neighbors-styles";
    style.textContent = `
      .hive-neighbors-page {
        height: 100%;
        overflow-y: auto;
        box-sizing: border-box;
        padding: 20px;
        color: var(--primary-text-color);
        background: var(--primary-background-color);
      }
      .hive-neighbors-wrap {
        width: min(1120px, 100%);
        margin: 0 auto;
      }
      .hive-neighbors-hero {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 18px;
        padding: 22px 24px;
        border: 1px solid var(--divider-color);
        border-radius: 18px;
        background: var(--card-background-color);
        box-shadow: 0 8px 28px rgba(0,0,0,.06);
      }
      .hive-neighbors-eyebrow {
        margin-bottom: 7px;
        color: var(--primary-color);
        font-size: 11px;
        font-weight: 750;
        letter-spacing: .12em;
        text-transform: uppercase;
      }
      .hive-neighbors-title {
        margin: 0;
        font-size: 25px;
        line-height: 1.1;
        font-weight: 700;
      }
      .hive-neighbors-subtitle {
        max-width: 650px;
        margin: 8px 0 0;
        color: var(--secondary-text-color);
        font-size: 13px;
        line-height: 1.45;
      }
      .hive-neighbors-refresh {
        border: 1px solid var(--divider-color);
        border-radius: 11px;
        padding: 9px 12px;
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
        font: inherit;
        font-size: 12px;
        font-weight: 650;
        cursor: pointer;
      }
      .hive-neighbors-refresh:hover { border-color: var(--primary-color); }
      .hive-neighbors-refresh:disabled { opacity: .55; cursor: default; }
      .hive-neighbors-summary {
        display: grid;
        grid-template-columns: repeat(3,minmax(0,1fr));
        gap: 12px;
        margin-top: 14px;
      }
      .hive-neighbors-metric {
        min-height: 76px;
        box-sizing: border-box;
        padding: 14px 16px;
        border: 1px solid var(--divider-color);
        border-radius: 15px;
        background: var(--card-background-color);
      }
      .hive-neighbors-metric-label {
        margin-bottom: 7px;
        color: var(--secondary-text-color);
        font-size: 10px;
        font-weight: 650;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .hive-neighbors-metric-value {
        font-size: 21px;
        font-weight: 720;
      }
      .hive-neighbors-unit {
        margin-left: 5px;
        color: var(--secondary-text-color);
        font-size: 11px;
        font-weight: 500;
      }
      .hive-neighbors-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 18px 0 10px;
      }
      .hive-neighbors-section-title { font-size: 13px; font-weight: 700; }
      .hive-neighbors-sort {
        display: inline-flex;
        gap: 3px;
        padding: 3px;
        border: 1px solid var(--divider-color);
        border-radius: 11px;
        background: var(--secondary-background-color);
      }
      .hive-neighbors-sort button {
        border: 0;
        border-radius: 8px;
        padding: 7px 10px;
        background: transparent;
        color: var(--secondary-text-color);
        font: inherit;
        font-size: 11px;
        font-weight: 650;
        cursor: pointer;
      }
      .hive-neighbors-sort button.active {
        background: var(--primary-color);
        color: var(--text-primary-color, white);
      }
      .hive-neighbors-grid {
        display: grid;
        grid-template-columns: repeat(2,minmax(0,1fr));
        gap: 12px;
        padding-bottom: 22px;
      }
      .hive-neighbor-card {
        position: relative;
        overflow: hidden;
        display: grid;
        grid-template-columns: 42px minmax(0,1fr) auto;
        align-items: center;
        gap: 14px;
        padding: 16px;
        border: 1px solid var(--divider-color);
        border-radius: 16px;
        background: var(--card-background-color);
      }
      .hive-neighbor-card::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 3px;
        background: var(--primary-color);
      }
      .hive-neighbor-icon {
        width: 42px;
        height: 42px;
        display: grid;
        place-items: center;
        border-radius: 13px;
        background: var(--secondary-background-color);
        color: var(--primary-color);
        font-size: 21px;
      }
      .hive-neighbor-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 14px;
        font-weight: 700;
      }
      .hive-neighbor-prefix {
        margin-top: 4px;
        color: var(--secondary-text-color);
        font: 11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
        letter-spacing: .035em;
      }
      .hive-neighbor-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 7px;
        margin-top: 8px;
        color: var(--secondary-text-color);
        font-size: 11px;
      }
      .hive-neighbor-known {
        border-radius: 999px;
        padding: 2px 7px;
        background: var(--secondary-background-color);
        color: var(--primary-color);
        font-weight: 650;
      }
      .hive-neighbor-signal { min-width: 65px; text-align: right; }
      .hive-neighbor-snr { font-size: 18px; font-weight: 750; line-height: 1; }
      .hive-neighbor-snr-label {
        margin-top: 4px;
        color: var(--secondary-text-color);
        font-size: 9px;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .hive-neighbor-bars {
        display: flex;
        justify-content: flex-end;
        align-items: end;
        gap: 2px;
        height: 13px;
        margin-top: 7px;
      }
      .hive-neighbor-bars i {
        display: block;
        width: 3px;
        border-radius: 2px 2px 0 0;
        background: var(--divider-color);
      }
      .hive-neighbor-bars i:nth-child(1){height:4px}
      .hive-neighbor-bars i:nth-child(2){height:7px}
      .hive-neighbor-bars i:nth-child(3){height:10px}
      .hive-neighbor-bars i:nth-child(4){height:13px}
      .hive-neighbor-bars i.on{background:var(--primary-color)}
      .hive-neighbors-state {
        margin-top: 14px;
        padding: 34px 24px;
        border: 1px dashed var(--divider-color);
        border-radius: 17px;
        background: var(--card-background-color);
        text-align: center;
      }
      .hive-neighbors-state-icon {
        width: 48px;
        height: 48px;
        display: grid;
        place-items: center;
        margin: 0 auto 13px;
        border-radius: 15px;
        background: var(--secondary-background-color);
        color: var(--primary-color);
        font-size: 23px;
      }
      .hive-neighbors-state-title { font-size: 15px; font-weight: 700; }
      .hive-neighbors-state-text {
        max-width: 560px;
        margin: 7px auto 0;
        color: var(--secondary-text-color);
        font-size: 12px;
        line-height: 1.5;
      }
      @media (max-width:720px) {
        .hive-neighbors-page{padding:12px}
        .hive-neighbors-hero{flex-direction:column;padding:18px;border-radius:15px}
        .hive-neighbors-refresh{width:100%}
        .hive-neighbors-summary{grid-template-columns:1fr 1fr}
        .hive-neighbors-summary .hive-neighbors-metric:last-child{grid-column:1/-1}
        .hive-neighbors-grid{grid-template-columns:1fr}
      }
    `;
    root.appendChild(style);
  }

  async __loadHiveNeighbors() {
    if (!this.hass || this.__hiveNeighborsLoading) return;
    this.__hiveNeighborsLoading = true;
    this.__hiveNeighborsError = null;
    this.__rerenderHivePage();

    try {
      const entryId = this._config?.entry_id || this._selectedEntryId || undefined;
      const message = { type: "meshcore_chat/get_hive_neighbors" };
      if (entryId) message.entry_id = entryId;
      this.__hiveNeighbors = await this.hass.callWS(message);
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
    page.className = "hive-neighbors-page";
    const wrap = document.createElement("div");
    wrap.className = "hive-neighbors-wrap";
    page.appendChild(wrap);
    container.appendChild(page);

    const hero = document.createElement("section");
    hero.className = "hive-neighbors-hero";

    const heading = document.createElement("div");
    const eyebrow = document.createElement("div");
    eyebrow.className = "hive-neighbors-eyebrow";
    eyebrow.textContent = "◉  HiveFW · ZERO-HOP";
    const title = document.createElement("h1");
    title.className = "hive-neighbors-title";
    title.textContent = "Vizinhos";
    const subtitle = document.createElement("p");
    subtitle.className = "hive-neighbors-subtitle";
    subtitle.textContent =
      "Repeaters ouvidos diretamente pelo teu HiveFW. A consulta lê a memória local do equipamento e não gera tráfego adicional na rede MeshCore.";
    heading.append(eyebrow, title, subtitle);

    const refresh = document.createElement("button");
    refresh.className = "hive-neighbors-refresh";
    refresh.disabled = this.__hiveNeighborsLoading;
    refresh.textContent = this.__hiveNeighborsLoading ? "A atualizar…" : "↻  Atualizar";
    refresh.addEventListener("click", () => void this.__loadHiveNeighbors());
    hero.append(heading, refresh);
    wrap.appendChild(hero);

    if (this.__hiveNeighborsLoading && !this.__hiveNeighbors) {
      wrap.appendChild(this.__state("A carregar", "A ler a tabela local de vizinhos do HiveFW."));
      return;
    }
    if (this.__hiveNeighborsError) {
      wrap.appendChild(this.__state("Erro ao carregar", this.__hiveNeighborsError));
      return;
    }

    const data = this.__hiveNeighbors;
    if (!data?.supported) {
      wrap.appendChild(this.__state(
        "HiveFW não detetado",
        "Esta função requer uma versão HiveFW com suporte à consulta local de vizinhos."
      ));
      return;
    }
    if (!data.repeater_enabled) {
      wrap.appendChild(this.__state(
        "Modo Repeater desligado",
        "Ativa o modo Repeater no HiveFW para começar a registar Repeaters recebidos diretamente por zero-hop."
      ));
      return;
    }

    const neighbors = Array.isArray(data.neighbors) ? [...data.neighbors] : [];
    const strongest = neighbors.length ? Math.max(...neighbors.map((n) => Number(n.snr))) : null;
    const latest = neighbors.length ? Math.min(...neighbors.map((n) => Number(n.secs_ago))) : null;

    const summary = document.createElement("section");
    summary.className = "hive-neighbors-summary";
    summary.append(
      this.__metric("Vizinhos", String(data.count ?? neighbors.length), "zero-hop"),
      this.__metric("Melhor SNR", strongest == null ? "—" : strongest.toFixed(1), strongest == null ? "" : "dB"),
      this.__metric("Último contacto", latest == null ? "—" : this.__age(latest), "")
    );
    wrap.appendChild(summary);

    const toolbar = document.createElement("div");
    toolbar.className = "hive-neighbors-toolbar";
    const sectionTitle = document.createElement("div");
    sectionTitle.className = "hive-neighbors-section-title";
    sectionTitle.textContent = "Repeaters diretos";

    const sort = document.createElement("div");
    sort.className = "hive-neighbors-sort";
    for (const [value, label] of [["recent", "Recentes"], ["signal", "Sinal"]]) {
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
        "Ainda sem vizinhos",
        "Quando o HiveFW ouvir um advert direto de outro Repeater, ele aparecerá aqui na próxima atualização."
      ));
      return;
    }

    neighbors.sort(this.__hiveNeighborsSort === "signal"
      ? (a, b) => Number(b.snr) - Number(a.snr)
      : (a, b) => Number(a.secs_ago) - Number(b.secs_ago));

    const grid = document.createElement("div");
    grid.className = "hive-neighbors-grid";
    for (const neighbor of neighbors) {
      grid.appendChild(this.__neighborCard(neighbor));
    }
    wrap.appendChild(grid);
  }

  __metric(label, value, unit) {
    const el = document.createElement("div");
    el.className = "hive-neighbors-metric";
    const l = document.createElement("div");
    l.className = "hive-neighbors-metric-label";
    l.textContent = label;
    const v = document.createElement("div");
    v.className = "hive-neighbors-metric-value";
    v.textContent = value;
    if (unit) {
      const u = document.createElement("span");
      u.className = "hive-neighbors-unit";
      u.textContent = unit;
      v.appendChild(u);
    }
    el.append(l, v);
    return el;
  }

  __state(title, text) {
    const el = document.createElement("div");
    el.className = "hive-neighbors-state";
    const icon = document.createElement("div");
    icon.className = "hive-neighbors-state-icon";
    icon.textContent = "⌁";
    const h = document.createElement("div");
    h.className = "hive-neighbors-state-title";
    h.textContent = title;
    const p = document.createElement("div");
    p.className = "hive-neighbors-state-text";
    p.textContent = text;
    el.append(icon, h, p);
    return el;
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
    const heard = document.createElement("span");
    heard.textContent = "Ouvido " + this.__age(Number(neighbor.secs_ago || 0));
    meta.appendChild(heard);
    if (neighbor.known_contact) {
      const known = document.createElement("span");
      known.className = "hive-neighbor-known";
      known.textContent = "Contacto conhecido";
      meta.appendChild(known);
    }
    info.append(name, prefix, meta);

    const signal = document.createElement("div");
    signal.className = "hive-neighbor-signal";
    const snr = Number(neighbor.snr || 0);
    const snrValue = document.createElement("div");
    snrValue.className = "hive-neighbor-snr";
    snrValue.textContent = snr.toFixed(1);
    const snrLabel = document.createElement("div");
    snrLabel.className = "hive-neighbor-snr-label";
    snrLabel.textContent = "SNR dB";
    const bars = document.createElement("div");
    bars.className = "hive-neighbor-bars";
    const activeBars = snr >= 8 ? 4 : snr >= 2 ? 3 : snr >= -6 ? 2 : 1;
    for (let i = 1; i <= 4; i++) {
      const bar = document.createElement("i");
      if (i <= activeBars) bar.className = "on";
      bars.appendChild(bar);
    }
    signal.append(snrValue, snrLabel, bars);

    card.append(icon, info, signal);
    return card;
  }

  __age(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    if (value < 10) return "agora";
    if (value < 60) return `há ${value}s`;
    const minutes = Math.floor(value / 60);
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `há ${hours} h`;
    return `há ${Math.floor(hours / 24)} d`;
  }
}

customElements.define("meshcore-repeater-panel", MeshCoreRepeaterPanel);
