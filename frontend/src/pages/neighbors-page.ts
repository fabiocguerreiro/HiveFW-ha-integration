import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, PanelConfig, HiveNeighborInfo, HiveNeighborsResponse } from '../types';
import { getHiveNeighbors } from '../api';

type SortMode = 'recent' | 'signal';

@customElement('meshcore-neighbors-page')
export class NeighborsPage extends LitElement {
  @property({ type: Object }) hass?: HomeAssistant;
  @property({ type: Object }) config?: PanelConfig;
  @property({ type: Boolean }) narrow = false;

  @state() private _data: HiveNeighborsResponse | null = null;
  @state() private _loading = true;
  @state() private _error: string | null = null;
  @state() private _sort: SortMode = 'recent';
  @state() private _refreshedAt: Date | null = null;

  firstUpdated() {
    void this._load();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('config') && this.hasUpdated) {
      void this._load();
    }
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
      color: var(--primary-text-color);
    }

    .page {
      height: 100%;
      overflow-y: auto;
      padding: 20px;
      box-sizing: border-box;
      background:
        radial-gradient(circle at 92% 0%, color-mix(in srgb, var(--primary-color) 10%, transparent), transparent 32%),
        var(--primary-background-color);
    }

    .hero {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 18px;
      margin: 0 auto 18px;
      max-width: 1120px;
      padding: 22px 24px;
      border: 1px solid var(--divider-color);
      border-radius: 18px;
      background: var(--card-background-color);
      box-shadow: 0 8px 28px rgba(0, 0, 0, .06);
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 7px;
      color: var(--primary-color);
      font-size: 11px;
      font-weight: 750;
      letter-spacing: .12em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      font-size: 25px;
      line-height: 1.1;
      font-weight: 700;
    }

    .subtitle {
      margin: 8px 0 0;
      max-width: 630px;
      color: var(--secondary-text-color);
      font-size: 13px;
      line-height: 1.45;
    }

    .refresh {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid var(--divider-color);
      border-radius: 11px;
      padding: 9px 12px;
      color: var(--primary-text-color);
      background: var(--secondary-background-color);
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      font-weight: 650;
      transition: border-color .15s ease, transform .15s ease;
    }

    .refresh:hover {
      border-color: var(--primary-color);
      transform: translateY(-1px);
    }

    .refresh:disabled {
      opacity: .55;
      cursor: default;
      transform: none;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      max-width: 1120px;
      margin: 0 auto 18px;
    }

    .metric {
      min-height: 76px;
      padding: 14px 16px;
      border: 1px solid var(--divider-color);
      border-radius: 15px;
      background: var(--card-background-color);
      box-sizing: border-box;
    }

    .metric-label {
      color: var(--secondary-text-color);
      font-size: 11px;
      margin-bottom: 7px;
      text-transform: uppercase;
      letter-spacing: .06em;
    }

    .metric-value {
      display: flex;
      align-items: baseline;
      gap: 6px;
      font-size: 22px;
      font-weight: 700;
    }

    .metric-unit {
      color: var(--secondary-text-color);
      font-size: 12px;
      font-weight: 500;
    }

    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      max-width: 1120px;
      margin: 0 auto 12px;
    }

    .section-title {
      font-size: 13px;
      font-weight: 700;
    }

    .sort {
      display: inline-flex;
      padding: 3px;
      border: 1px solid var(--divider-color);
      border-radius: 11px;
      background: var(--secondary-background-color);
    }

    .sort button {
      border: 0;
      border-radius: 8px;
      padding: 7px 10px;
      color: var(--secondary-text-color);
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      font-weight: 650;
    }

    .sort button.active {
      color: var(--text-primary-color, #fff);
      background: var(--primary-color);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      max-width: 1120px;
      margin: 0 auto 24px;
    }

    .neighbor {
      position: relative;
      overflow: hidden;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 14px;
      padding: 16px;
      border: 1px solid var(--divider-color);
      border-radius: 16px;
      background: var(--card-background-color);
      transition: border-color .15s ease, transform .15s ease, box-shadow .15s ease;
    }

    .neighbor::before {
      content: '';
      position: absolute;
      inset: 0 auto 0 0;
      width: 3px;
      background: var(--primary-color);
      opacity: .85;
    }

    .neighbor:hover {
      border-color: color-mix(in srgb, var(--primary-color) 40%, var(--divider-color));
      transform: translateY(-1px);
      box-shadow: 0 8px 22px rgba(0, 0, 0, .06);
    }

    .radio-mark {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border-radius: 13px;
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 11%, var(--card-background-color));
    }

    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
      font-weight: 700;
    }

    .prefix {
      margin-top: 4px;
      color: var(--secondary-text-color);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11px;
      letter-spacing: .035em;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 7px;
      margin-top: 8px;
      color: var(--secondary-text-color);
      font-size: 11px;
    }

    .dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--divider-color);
    }

    .known {
      padding: 2px 7px;
      border-radius: 999px;
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 10%, transparent);
      font-weight: 650;
    }

    .signal {
      min-width: 68px;
      text-align: right;
    }

    .snr {
      font-size: 18px;
      font-weight: 750;
      line-height: 1;
    }

    .snr-label {
      margin-top: 4px;
      color: var(--secondary-text-color);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .07em;
    }

    .signal-bars {
      display: flex;
      justify-content: flex-end;
      align-items: end;
      gap: 2px;
      height: 13px;
      margin-top: 7px;
    }

    .signal-bars span {
      width: 3px;
      border-radius: 2px 2px 0 0;
      background: var(--divider-color);
    }

    .signal-bars span:nth-child(1) { height: 4px; }
    .signal-bars span:nth-child(2) { height: 7px; }
    .signal-bars span:nth-child(3) { height: 10px; }
    .signal-bars span:nth-child(4) { height: 13px; }
    .signal-bars span.on { background: var(--primary-color); }

    .state {
      max-width: 1120px;
      margin: 22px auto;
      padding: 34px 24px;
      border: 1px dashed var(--divider-color);
      border-radius: 17px;
      text-align: center;
      background: var(--card-background-color);
    }

    .state-icon {
      width: 48px;
      height: 48px;
      display: grid;
      place-items: center;
      margin: 0 auto 13px;
      border-radius: 15px;
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    }

    .state-title {
      font-size: 15px;
      font-weight: 700;
    }

    .state-text {
      max-width: 540px;
      margin: 7px auto 0;
      color: var(--secondary-text-color);
      font-size: 12px;
      line-height: 1.5;
    }

    .spinner {
      width: 24px;
      height: 24px;
      margin: 0 auto;
      border: 2px solid var(--divider-color);
      border-top-color: var(--primary-color);
      border-radius: 50%;
      animation: spin .8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 720px) {
      .page { padding: 12px; }
      .hero { padding: 18px; border-radius: 15px; }
      .hero { flex-direction: column; }
      .refresh { align-self: stretch; justify-content: center; }
      .summary { grid-template-columns: 1fr 1fr; }
      .summary .metric:last-child { grid-column: 1 / -1; }
      .grid { grid-template-columns: 1fr; }
      .neighbor { grid-template-columns: auto minmax(0, 1fr) auto; padding: 14px; }
    }
  `;

  private async _load() {
    if (!this.hass) return;
    this._loading = true;
    this._error = null;
    try {
      this._data = await getHiveNeighbors(this.hass, this.config?.entry_id);
      this._refreshedAt = new Date();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Não foi possível carregar os vizinhos.';
    } finally {
      this._loading = false;
    }
  }

  private _sortedNeighbors(): HiveNeighborInfo[] {
    const neighbors = [...(this._data?.neighbors || [])];
    if (this._sort === 'signal') {
      neighbors.sort((a, b) => b.snr - a.snr);
    } else {
      neighbors.sort((a, b) => a.secs_ago - b.secs_ago);
    }
    return neighbors;
  }

  private _age(seconds: number): string {
    if (seconds < 10) return 'agora';
    if (seconds < 60) return `há ${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `há ${hours} h`;
    const days = Math.floor(hours / 24);
    return `há ${days} d`;
  }

  private _signalBars(snr: number): number {
    if (snr >= 8) return 4;
    if (snr >= 2) return 3;
    if (snr >= -6) return 2;
    return 1;
  }

  private _strongest(): number | null {
    const list = this._data?.neighbors || [];
    return list.length ? Math.max(...list.map((n) => n.snr)) : null;
  }

  private _latestAge(): number | null {
    const list = this._data?.neighbors || [];
    return list.length ? Math.min(...list.map((n) => n.secs_ago)) : null;
  }

  private _radioIcon(size = 24) {
    return html`<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">
      <path d="M12 3a9 9 0 0 1 6.36 15.36l-1.42-1.42A7 7 0 1 0 7.06 6.06L5.64 4.64A8.97 8.97 0 0 1 12 3Zm0 4a5 5 0 0 1 3.54 8.54l-1.42-1.42A3 3 0 1 0 9.88 9.88L8.46 8.46A4.98 4.98 0 0 1 12 7Zm0 4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/>
    </svg>`;
  }

  render() {
    const data = this._data;
    const strongest = this._strongest();
    const latestAge = this._latestAge();

    return html`
      <div class="page">
        <section class="hero">
          <div>
            <div class="eyebrow">${this._radioIcon(15)} HiveFW · Zero-hop</div>
            <h1>Vizinhos</h1>
            <p class="subtitle">
              Repeaters ouvidos diretamente pelo teu HiveFW. Esta lista vem da memória local
              do repetidor e não gera tráfego adicional na rede MeshCore.
            </p>
          </div>
          <button class="refresh" ?disabled=${this._loading} @click=${() => this._load()}>
            <span>↻</span> ${this._loading ? 'A atualizar…' : 'Atualizar'}
          </button>
        </section>

        ${this._loading && !data
          ? html`<div class="state"><div class="spinner"></div></div>`
          : this._error
            ? this._renderState('Erro ao carregar', this._error)
            : !data?.supported
              ? this._renderState(
                  'HiveFW não detetado',
                  'Esta função requer uma versão HiveFW com suporte à consulta local de vizinhos.',
                )
              : !data.repeater_enabled
                ? this._renderState(
                    'Modo Repeater desligado',
                    'Ativa o modo Repeater no HiveFW para começar a registar Repeaters recebidos diretamente por zero-hop.',
                  )
                : html`
                    <section class="summary">
                      <div class="metric">
                        <div class="metric-label">Vizinhos</div>
                        <div class="metric-value">${data.count}<span class="metric-unit">zero-hop</span></div>
                      </div>
                      <div class="metric">
                        <div class="metric-label">Melhor SNR</div>
                        <div class="metric-value">
                          ${strongest === null ? '—' : strongest.toFixed(1)}
                          <span class="metric-unit">${strongest === null ? '' : 'dB'}</span>
                        </div>
                      </div>
                      <div class="metric">
                        <div class="metric-label">Último contacto</div>
                        <div class="metric-value" style="font-size:16px">
                          ${latestAge === null ? '—' : this._age(latestAge)}
                        </div>
                      </div>
                    </section>

                    <div class="toolbar">
                      <div class="section-title">Repeaters diretos</div>
                      <div class="sort" aria-label="Ordenação">
                        <button
                          class=${this._sort === 'recent' ? 'active' : ''}
                          @click=${() => (this._sort = 'recent')}>Recentes</button>
                        <button
                          class=${this._sort === 'signal' ? 'active' : ''}
                          @click=${() => (this._sort = 'signal')}>Sinal</button>
                      </div>
                    </div>

                    ${data.neighbors.length === 0
                      ? this._renderState(
                          'Ainda sem vizinhos',
                          'Quando o HiveFW ouvir um advert direto de outro Repeater, ele aparecerá aqui automaticamente na próxima atualização.',
                        )
                      : html`<div class="grid">
                          ${this._sortedNeighbors().map((n) => this._renderNeighbor(n))}
                        </div>`}
                  `}
      </div>
    `;
  }

  private _renderState(title: string, text: string) {
    return html`<div class="state">
      <div class="state-icon">${this._radioIcon(25)}</div>
      <div class="state-title">${title}</div>
      <div class="state-text">${text}</div>
    </div>`;
  }

  private _renderNeighbor(n: HiveNeighborInfo) {
    const bars = this._signalBars(n.snr);
    return html`
      <article class="neighbor">
        <div class="radio-mark">${this._radioIcon(24)}</div>
        <div>
          <div class="name">${n.name || n.pubkey_prefix}</div>
          <div class="prefix">${n.pubkey_prefix.toUpperCase()}</div>
          <div class="meta">
            <span>Ouvido ${this._age(n.secs_ago)}</span>
            ${n.known_contact
              ? html`<span class="dot"></span><span class="known">Contacto conhecido</span>`
              : nothing}
          </div>
        </div>
        <div class="signal">
          <div class="snr">${n.snr.toFixed(1)}</div>
          <div class="snr-label">SNR dB</div>
          <div class="signal-bars">
            ${[1, 2, 3, 4].map((i) => html`<span class=${i <= bars ? 'on' : ''}></span>`)}
          </div>
        </div>
      </article>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-neighbors-page': NeighborsPage;
  }
}
