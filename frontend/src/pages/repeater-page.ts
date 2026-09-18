import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, LocalRepeaterStatus, PanelConfig } from '../types';
import { executeLocal, getLocalRepeaterStatus, setDeviceConfig } from '../api';

@customElement('meshcore-repeater-page')
export class RepeaterPage extends LitElement {
  @property({ type: Object }) hass?: HomeAssistant;
  @property({ type: Object }) config?: PanelConfig;
  @property({ type: Boolean }) narrow = false;

  @state() private _status: LocalRepeaterStatus | null = null;
  @state() private _loading = true;
  @state() private _error: string | null = null;
  @state() private _message: string | null = null;
  @state() private _edit: Record<string, number | boolean> = {};

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
    .badge { display:inline-flex; align-items:center; gap:7px; margin-top:12px; border-radius:999px; padding:5px 10px; font-size:11px; font-weight:700; }
    .badge.on { color:#2e7d32; background:rgba(76,175,80,.13); }
    .badge.off { color:var(--secondary-text-color); background:var(--secondary-background-color); }
    button {
      border:1px solid var(--divider-color); border-radius:11px; padding:9px 12px;
      background:var(--secondary-background-color); color:var(--primary-text-color);
      cursor:pointer; font:inherit; font-size:12px; font-weight:650;
    }
    button.primary { border-color:var(--primary-color); background:var(--primary-color); color:var(--text-primary-color,#fff); }
    button.danger { border-color:rgba(244,67,54,.45); color:var(--error-color,#db4437); background:transparent; }
    button:disabled { opacity:.55; cursor:default; }
    .summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:11px; margin-top:13px; }
    .metric { min-height:82px; box-sizing:border-box; padding:14px 15px; border:1px solid var(--divider-color); border-radius:15px; background:var(--card-background-color); }
    .metric-label { margin-bottom:7px; color:var(--secondary-text-color); font-size:10px; font-weight:700; letter-spacing:.075em; text-transform:uppercase; }
    .metric-value { font-size:20px; font-weight:730; }
    .metric-sub { margin-top:5px; color:var(--secondary-text-color); font-size:10px; }
    .columns { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:13px; margin-top:13px; padding-bottom:22px; }
    .card { padding:18px; border:1px solid var(--divider-color); border-radius:17px; background:var(--card-background-color); }
    .card.wide { grid-column:1/-1; }
    .card-title { margin-bottom:4px; font-size:14px; font-weight:720; }
    .card-desc { margin-bottom:15px; color:var(--secondary-text-color); font-size:11px; line-height:1.45; }
    .form-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:11px; }
    label { display:flex; flex-direction:column; gap:5px; color:var(--secondary-text-color); font-size:10px; font-weight:650; }
    input, select {
      box-sizing:border-box; width:100%; min-height:39px; border:1px solid var(--divider-color);
      border-radius:10px; padding:8px 10px; background:var(--primary-background-color);
      color:var(--primary-text-color); font:inherit; font-size:12px;
    }
    .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:13px; }
    .stats { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
    .stat { padding:10px 11px; border-radius:11px; background:var(--secondary-background-color); }
    .stat-name { color:var(--secondary-text-color); font-size:9px; letter-spacing:.065em; text-transform:uppercase; }
    .stat-value { margin-top:4px; font-size:13px; font-weight:680; }
    .note { margin-top:12px; padding:11px 12px; border-radius:11px; background:var(--secondary-background-color); color:var(--secondary-text-color); font-size:10px; line-height:1.5; }
    .message { margin-top:12px; padding:10px 12px; border-radius:11px; font-size:11px; }
    .message.ok { color:#2e7d32; background:rgba(76,175,80,.12); }
    .message.error { color:var(--error-color,#db4437); background:rgba(244,67,54,.1); }
    .state { margin-top:14px; padding:34px 24px; border:1px dashed var(--divider-color); border-radius:17px; background:var(--card-background-color); text-align:center; }
    @media (max-width:820px) { .page{padding:12px}.hero{flex-direction:column;padding:18px}.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.columns{grid-template-columns:1fr}.card.wide{grid-column:auto} }
  `;

  private async _load() {
    if (!this.hass) return;
    this._loading = true;
    this._error = null;
    try {
      this._status = await getLocalRepeaterStatus(this.hass, this.config?.entry_id);
      const r = this._status.radio || {};
      const l = this._status.location || {};
      const t = this._status.tuning || {};
      this._edit = {
        repeat: !!this._status.repeat,
        frequency: r.frequency ?? 0,
        bandwidth: r.bandwidth ?? 0,
        spreading_factor: r.spreading_factor ?? 0,
        coding_rate: r.coding_rate ?? 0,
        tx_power: r.tx_power ?? 0,
        path_hash_mode: r.path_hash_mode ?? 0,
        multi_acks: r.multi_acks ?? 0,
        rx_delay: t.rx_delay ?? 0,
        airtime_factor: t.airtime_factor ?? 0,
        latitude: l.latitude ?? 0,
        longitude: l.longitude ?? 0,
      };
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Não foi possível carregar o Repeater.';
    } finally {
      this._loading = false;
    }
  }

  private async _save(settings: Record<string, unknown>, message: string) {
    if (!this.hass) return;
    this._loading = true;
    this._error = null;
    this._message = null;
    try {
      const result = await setDeviceConfig(this.hass, settings, this.config?.entry_id);
      if (!result.success) throw new Error('O rádio rejeitou a alteração.');
      this._message = message;
      await this._load();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Não foi possível aplicar a configuração.';
      this._loading = false;
    }
  }

  private async _command(command: string, args: Record<string, unknown> | undefined, message: string) {
    if (!this.hass) return;
    this._loading = true;
    this._error = null;
    this._message = null;
    try {
      await executeLocal(this.hass, command, args, this.config?.entry_id);
      this._message = message;
    } catch (err) {
      this._error = err instanceof Error ? err.message : `Falha ao executar ${command}.`;
    } finally {
      this._loading = false;
    }
  }

  private _duration(seconds: number): string {
    let value = Math.max(0, Math.floor(seconds || 0));
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

  render() {
    const s = this._status;
    const core = s?.stats.core || {};
    const radioStats = s?.stats.radio || {};
    const packets = s?.stats.packets || {};
    const batteryMv = (core.battery_mv ?? s?.battery.level) as number | undefined;

    return html`
      <div class="page">
        <div class="wrap">
          <section class="hero">
            <div>
              <div class="eyebrow">◉ HiveFW · Repeater</div>
              <h1>Repeater</h1>
              <p class="subtitle">
                Estado e configuração do Repeater integrado no Companion.
                Estas operações usam a ligação local ao rádio e não consomem airtime LoRa.
              </p>
              ${s ? html`<div class="badge ${s.repeat ? 'on' : 'off'}">${s.repeat ? '● Repeater ativo' : '● Repeater desligado'}</div>` : nothing}
            </div>
            <button ?disabled=${this._loading} @click=${() => this._load()}>${this._loading ? 'A atualizar…' : '↻ Atualizar'}</button>
          </section>

          ${this._error ? html`<div class="message error">${this._error}</div>` : nothing}
          ${this._message ? html`<div class="message ok">${this._message}</div>` : nothing}

          ${this._loading && !s
            ? html`<div class="state">A consultar o Companion e as estatísticas do rádio…</div>`
            : !s
              ? nothing
              : !s.supported
                ? html`<div class="state">O Companion respondeu, mas não anuncia suporte ao modo Repeater integrado.</div>`
                : html`
                    <section class="summary">
                      ${this._metric('Bateria', batteryMv == null ? '—' : `${(batteryMv / 1000).toFixed(2)} V`, s.firmware ? `FW ${s.firmware}` : '')}
                      ${this._metric('Uptime', core.uptime_secs == null ? '—' : this._duration(Number(core.uptime_secs)), core.queue_len == null ? '' : `Fila: ${core.queue_len}`)}
                      ${this._metric('Último sinal', radioStats.last_rssi == null ? '—' : `${radioStats.last_rssi} dBm`, radioStats.last_snr == null ? '' : `SNR ${Number(radioStats.last_snr).toFixed(1)} dB`)}
                      ${this._metric('Noise floor', radioStats.noise_floor == null ? '—' : `${radioStats.noise_floor} dBm`, s.model || '')}
                    </section>

                    <div class="columns">
                      ${this._modeCard()}
                      ${this._radioCard()}
                      ${this._routingCard()}
                      ${this._statsCard(packets, radioStats)}
                      ${this._locationCard()}
                      ${this._actionsCard()}
                      <section class="card wide">
                        <div class="card-title">Repeater Setup · cobertura atual</div>
                        <div class="card-desc">Funcionalidades disponíveis sem alterar o firmware do rádio.</div>
                        <div class="note">
                          Disponível agora: modo Repeater, RF, TX power, Path Hash, Multi ACKs, tuning,
                          localização, adverts, reboot e estatísticas. Regions, advert intervals, flood.max,
                          loop detection, owner info, duty cycle e passwords de servidor não são expostos
                          pelo Companion Protocol atual do HiveFW e não são alterados por esta página.
                        </div>
                      </section>
                    </div>
                  `}
        </div>
      </div>
    `;
  }

  private _modeCard() {
    return html`<section class="card">
      <div class="card-title">Modo Repeater</div>
      <div class="card-desc">Mantém o equipamento como Companion e ativa/desativa a função integrada de repetição.</div>
      <label>
        Estado
        <select .value=${String(this._edit.repeat ? 1 : 0)}
          @change=${(e: Event) => (this._edit = { ...this._edit, repeat: (e.target as HTMLSelectElement).value === '1' })}>
          <option value="1">Ativo</option>
          <option value="0">Desligado</option>
        </select>
      </label>
      <div class="actions">
        <button class="primary" ?disabled=${this._loading}
          @click=${() => this._save({ repeat: !!this._edit.repeat }, this._edit.repeat ? 'Modo Repeater ativado.' : 'Modo Repeater desligado.')}>
          Aplicar modo
        </button>
      </div>
    </section>`;
  }

  private _radioCard() {
    return html`<section class="card">
      <div class="card-title">Rádio</div>
      <div class="card-desc">Parâmetros RF equivalentes à parte principal do Repeater Setup.</div>
      <div class="form-grid">
        ${this._number('Frequência (MHz)', 'frequency', '0.001')}
        ${this._select('Bandwidth (kHz)', 'bandwidth', [7.8,10.4,15.6,20.8,31.25,41.7,62.5,125,250,500])}
        ${this._select('Spreading Factor', 'spreading_factor', [7,8,9,10,11,12])}
        ${this._select('Coding Rate', 'coding_rate', [5,6,7,8])}
        ${this._number('TX Power (dBm)', 'tx_power', '1')}
        ${this._select('Path Hash', 'path_hash_mode', [0,1,2], ['0 · 1 byte','1 · 2 bytes','2 · 3 bytes'])}
      </div>
      <div class="actions">
        <button class="primary" ?disabled=${this._loading}
          @click=${() => this._save({
            frequency: Number(this._edit.frequency),
            bandwidth: Number(this._edit.bandwidth),
            spreading_factor: Number(this._edit.spreading_factor),
            coding_rate: Number(this._edit.coding_rate),
            tx_power: Number(this._edit.tx_power),
            path_hash_mode: Number(this._edit.path_hash_mode),
          }, 'Configuração de rádio aplicada.')}>Guardar rádio</button>
      </div>
      <div class="note">Confirma sempre que frequência e potência correspondem à tua rede e aos limites regulamentares aplicáveis.</div>
    </section>`;
  }

  private _routingCard() {
    return html`<section class="card">
      <div class="card-title">Routing & Tuning</div>
      <div class="card-desc">Opções expostas pelo Companion Protocol atual.</div>
      <div class="form-grid">
        ${this._select('Multi ACKs', 'multi_acks', [0,1], ['Desligado','Ligado'])}
        ${this._number('RX delay', 'rx_delay', '0.001')}
        ${this._number('Airtime factor', 'airtime_factor', '0.001')}
      </div>
      <div class="actions">
        <button class="primary" ?disabled=${this._loading}
          @click=${() => this._save({
            multi_acks: Number(this._edit.multi_acks),
            rx_delay: Number(this._edit.rx_delay),
            airtime_factor: Number(this._edit.airtime_factor),
          }, 'Routing e tuning atualizados.')}>Guardar tuning</button>
      </div>
    </section>`;
  }

  private _statsCard(packets: Record<string, number | null>, radio: Record<string, number | null>) {
    const rows: Array<[string, string]> = [];
    for (const [label, key] of [
      ['Pacotes RX','recv'], ['Pacotes TX','sent'], ['Flood RX','flood_rx'],
      ['Flood TX','flood_tx'], ['Direct RX','direct_rx'], ['Direct TX','direct_tx'],
      ['Erros RX','recv_errors'],
    ] as Array<[string,string]>) {
      const value = packets[key];
      if (value != null) rows.push([label, String(value)]);
    }
    if (radio.tx_air_secs != null) rows.push(['Airtime TX', this._duration(Number(radio.tx_air_secs))]);
    if (radio.rx_air_secs != null) rows.push(['Airtime RX', this._duration(Number(radio.rx_air_secs))]);

    return html`<section class="card">
      <div class="card-title">Tráfego & RF</div>
      <div class="card-desc">Estatísticas locais; a leitura não usa airtime LoRa.</div>
      <div class="stats">
        ${rows.map(([label,value]) => html`<div class="stat"><div class="stat-name">${label}</div><div class="stat-value">${value}</div></div>`)}
      </div>
    </section>`;
  }

  private _locationCard() {
    return html`<section class="card">
      <div class="card-title">Localização</div>
      <div class="card-desc">Coordenadas anunciadas pelo Companion.</div>
      <div class="form-grid">
        ${this._number('Latitude', 'latitude', '0.000001')}
        ${this._number('Longitude', 'longitude', '0.000001')}
      </div>
      <div class="actions">
        <button class="primary" ?disabled=${this._loading}
          @click=${() => this._save({
            latitude: Number(this._edit.latitude),
            longitude: Number(this._edit.longitude),
          }, 'Localização atualizada.')}>Guardar localização</button>
      </div>
    </section>`;
  }

  private _actionsCard() {
    return html`<section class="card">
      <div class="card-title">Ações</div>
      <div class="card-desc">Ações rápidas do Companion/Repeater.</div>
      <div class="actions">
        <button ?disabled=${this._loading} @click=${() => this._command('send_advert', undefined, 'Local Advert enviado.')}>Local Advert</button>
        <button ?disabled=${this._loading} @click=${() => this._command('send_advert', { flood: true }, 'Flood Advert enviado.')}>Flood Advert</button>
        <button ?disabled=${this._loading} @click=${() => this._command('set_time', { val: Math.floor(Date.now() / 1000) }, 'Relógio sincronizado.')}>Sincronizar relógio</button>
        <button class="danger" ?disabled=${this._loading}
          @click=${() => window.confirm('Reiniciar agora o Companion/Repeater?') && this._command('reboot', undefined, 'Comando de reinício enviado.')}>
          Reiniciar rádio
        </button>
      </div>
    </section>`;
  }

  private _number(label: string, key: string, step: string) {
    return html`<label>${label}<input type="number" step=${step}
      .value=${String(this._edit[key] ?? '')}
      @input=${(e: Event) => (this._edit = { ...this._edit, [key]: Number((e.target as HTMLInputElement).value) })}></label>`;
  }

  private _select(label: string, key: string, values: number[], labels?: string[]) {
    return html`<label>${label}<select
      .value=${String(this._edit[key] ?? '')}
      @change=${(e: Event) => (this._edit = { ...this._edit, [key]: Number((e.target as HTMLSelectElement).value) })}>
      ${values.map((value, i) => html`<option value=${String(value)}>${labels?.[i] ?? value}</option>`)}
    </select></label>`;
  }

  private _metric(label: string, value: string, sub: string) {
    return html`<div class="metric"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-sub">${sub}</div></div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-repeater-page': RepeaterPage;
  }
}
