import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, PanelConfig, HiveNeighborInfo, HiveNeighborsResponse } from '../types';
import { getHiveNeighbors } from '../api';

type SortMode = 'recent' | 'name';

@customElement('meshcore-neighbors-page')
export class NeighborsPage extends LitElement {
  @property({ type: Object }) hass?: HomeAssistant;
  @property({ type: Object }) config?: PanelConfig;
  @property({ type: Boolean }) narrow = false;

  @state() private _data: HiveNeighborsResponse | null = null;
  @state() private _loading = true;
  @state() private _error: string | null = null;
  @state() private _sort: SortMode = 'recent';

  firstUpdated() {
    void this._load();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('config') && this.hasUpdated) void this._load();
  }

  static styles = css`
    :host { display:block; height:100%; overflow:hidden; color:var(--primary-text-color); }
    .page {
      height:100%; overflow-y:auto; box-sizing:border-box; padding:18px;
      background:radial-gradient(circle at 96% 0%, color-mix(in srgb,var(--primary-color) 10%,transparent), transparent 34%),var(--primary-background-color);
    }
    .wrap { width:min(1160px,100%); margin:0 auto; }
    .hero {
      display:flex; justify-content:space-between; align-items:flex-start; gap:20px;
      padding:22px 24px; border:1px solid var(--divider-color); border-radius:18px;
      background:var(--card-background-color); box-shadow:0 8px 28px rgba(0,0,0,.055);
    }
    .eyebrow { margin-bottom:7px; color:var(--primary-color); font-size:11px; font-weight:760; letter-spacing:.12em; text-transform:uppercase; }
    h1 { margin:0; font-size:25px; line-height:1.1; font-weight:720; }
    .subtitle { max-width:700px; margin:8px 0 0; color:var(--secondary-text-color); font-size:13px; line-height:1.48; }
    button {
      border:1px solid var(--divider-color); border-radius:11px; padding:9px 12px;
      background:var(--secondary-background-color); color:var(--primary-text-color);
      cursor:pointer; font:inherit; font-size:12px; font-weight:650;
    }
    button:hover { border-color:var(--primary-color); }
    button:disabled { opacity:.55; cursor:default; }
    .summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:11px; margin-top:13px; }
    .metric { min-height:82px; box-sizing:border-box; padding:14px 15px; border:1px solid var(--divider-color); border-radius:15px; background:var(--card-background-color); }
    .metric-label { margin-bottom:7px; color:var(--secondary-text-color); font-size:10px; font-weight:700; letter-spacing:.075em; text-transform:uppercase; }
    .metric-value { font-size:20px; font-weight:730; }
    .metric-sub { margin-top:5px; color:var(--secondary-text-color); font-size:10px; }
    .toolbar { display:flex; justify-content:space-between; align-items:center; gap:12px; margin:18px 0 10px; }
    .section-title { font-size:14px; font-weight:720; }
    .sort { display:inline-flex; gap:3px; padding:3px; border:1px solid var(--divider-color); border-radius:11px; background:var(--secondary-background-color); }
    .sort button { border:0; padding:7px 10px; background:transparent; color:var(--secondary-text-color); font-size:11px; }
    .sort button.active { background:var(--primary-color); color:var(--text-primary-color,#fff); }
    .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; padding-bottom:22px; }
    .card {
      position:relative; overflow:hidden; display:grid; grid-template-columns:42px minmax(0,1fr) auto;
      align-items:center; gap:14px; padding:16px; border:1px solid var(--divider-color);
      border-radius:16px; background:var(--card-background-color);
    }
    .card::before { content:''; position:absolute; inset:0 auto 0 0; width:3px; background:var(--primary-color); }
    .icon { width:42px; height:42px; display:grid; place-items:center; border-radius:13px; background:color-mix(in srgb,var(--primary-color) 10%,var(--card-background-color)); color:var(--primary-color); font-size:20px; }
    .name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; font-weight:700; }
    .prefix { margin-top:4px; color:var(--secondary-text-color); font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; letter-spacing:.035em; }
    .meta { display:flex; flex-wrap:wrap; align-items:center; gap:7px; margin-top:8px; color:var(--secondary-text-color); font-size:11px; }
    .pill { border-radius:999px; padding:3px 8px; background:color-mix(in srgb,var(--primary-color) 10%,transparent); color:var(--primary-color); font-size:10px; font-weight:700; }
    .side { text-align:right; min-width:64px; }
    .age { font-size:13px; font-weight:700; }
    .side-label { margin-top:4px; color:var(--secondary-text-color); font-size:9px; letter-spacing:.07em; text-transform:uppercase; }
    .state { margin-top:14px; padding:34px 24px; border:1px dashed var(--divider-color); border-radius:17px; background:var(--card-background-color); text-align:center; }
    .state-title { font-size:15px; font-weight:700; }
    .state-text { max-width:590px; margin:7px auto 0; color:var(--secondary-text-color); font-size:12px; line-height:1.5; }
    @media (max-width:820px) { .page{padding:12px}.hero{flex-direction:column;padding:18px}.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.grid{grid-template-columns:1fr} }
  `;

  private async _load() {
    if (!this.hass) return;
    this._loading = true;
    this._error = null;
    try {
      this._data = await getHiveNeighbors(this.hass, this.config?.entry_id);
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Não foi possível carregar os vizinhos.';
    } finally {
      this._loading = false;
    }
  }

  private _age(seconds: number): string {
    const value = Math.max(0, Math.floor(seconds || 0));
    if (value < 10) return 'agora';
    if (value < 60) return `${value}s`;
    const minutes = Math.floor(value / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h`;
    return `${Math.floor(hours / 24)} d`;
  }

  private _sorted(): HiveNeighborInfo[] {
    const list = [...(this._data?.neighbors || [])];
    if (this._sort === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => a.secs_ago - b.secs_ago);
    }
    return list;
  }

  render() {
    const data = this._data;
    const latest = data?.neighbors.length
      ? Math.min(...data.neighbors.map((n) => n.secs_ago))
      : null;

    return html`
      <div class="page">
        <div class="wrap">
          <section class="hero">
            <div>
              <div class="eyebrow">◉ Repeater · Zero-hop</div>
              <h1>Vizinhos</h1>
              <p class="subtitle">
                Repeaters cujo último advert guardado pelo Companion foi recebido diretamente,
                com zero hops. A consulta usa a cache Advert Path existente no firmware e
                não gera tráfego LoRa.
              </p>
            </div>
            <button ?disabled=${this._loading} @click=${() => this._load()}>
              ${this._loading ? 'A atualizar…' : '↻ Atualizar'}
            </button>
          </section>

          ${this._error
            ? this._state('Erro ao carregar', this._error)
            : this._loading && !data
              ? this._state('A carregar', 'A consultar os caminhos dos adverts guardados pelo Companion.')
              : !data?.supported
                ? this._state('Consulta indisponível', 'O Companion não disponibiliza os dados necessários.')
                : !data.repeater_enabled
                  ? this._state('Modo Repeater desligado', 'O Companion está ligado, mas o modo Repeater encontra-se desligado.')
                  : html`
                      <section class="summary">
                        ${this._metric('Vizinhos', String(data.count), 'Repeaters diretos')}
                        ${this._metric('Método', 'Zero-hop', 'Advert Path')}
                        ${this._metric('Último advert', latest == null ? '—' : this._age(latest), 'mais recente')}
                        ${this._metric('Modo', 'Ativo', 'HiveFW')}
                      </section>

                      <div class="toolbar">
                        <div class="section-title">Repeaters diretos</div>
                        <div class="sort">
                          <button class=${this._sort === 'recent' ? 'active' : ''} @click=${() => (this._sort = 'recent')}>Recentes</button>
                          <button class=${this._sort === 'name' ? 'active' : ''} @click=${() => (this._sort = 'name')}>Nome</button>
                        </div>
                      </div>

                      ${data.neighbors.length === 0
                        ? this._state('Ainda sem vizinhos zero-hop', 'Nenhum contacto Repeater tem neste momento um Advert Path direto guardado no Companion.')
                        : html`<div class="grid">${this._sorted().map((n) => this._neighbor(n))}</div>`}
                    `}
        </div>
      </div>
    `;
  }

  private _metric(label: string, value: string, sub: string) {
    return html`<div class="metric">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      <div class="metric-sub">${sub}</div>
    </div>`;
  }

  private _state(title: string, text: string) {
    return html`<div class="state">
      <div class="state-title">${title}</div>
      <div class="state-text">${text}</div>
    </div>`;
  }

  private _neighbor(n: HiveNeighborInfo) {
    return html`<article class="card">
      <div class="icon">⌁</div>
      <div>
        <div class="name">${n.name || n.pubkey_prefix}</div>
        <div class="prefix">${n.pubkey_prefix.toUpperCase()}</div>
        <div class="meta">
          <span class="pill">ZERO-HOP</span>
          <span>${n.known_contact ? 'Contacto adicionado' : 'Descoberto'}</span>
        </div>
      </div>
      <div class="side">
        <div class="age">${this._age(n.secs_ago)}</div>
        <div class="side-label">último advert</div>
      </div>
    </article>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-neighbors-page': NeighborsPage;
  }
}
