import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Contact, Channel, HomeAssistant, PanelConfig } from '../types';
import {
  getContacts, getContactsPaginated, getNodeCounts, clearDiscoveredContacts, importContacts,
} from '../api';
import type {
  PrimaryCategory, TypeCounts, NodeCounts,
} from '../api';
import '../components/contact-card';
import '../components/node-card';
import '../components/node-detail-dialog';

const PAGE_SIZE = 50;

type NodeType = 'clients' | 'repeaters' | 'room_servers' | 'sensors';
const NODE_TYPE_MAP: Record<NodeType, number> = {
  clients: 1,
  repeaters: 2,
  room_servers: 3,
  sensors: 4,
};

// Type / category colours moved into CSS classes (.l1-btn.<category>,
// .l2-btn.<type>) since iter18 -- per-button colour grammar lives in
// the stylesheet, not in inline style attributes.

const TYPE_LABELS: Record<NodeType, string> = {
  clients: 'Clients',
  repeaters: 'Repeaters',
  room_servers: 'Room Servers',
  sensors: 'Sensors',
};

@customElement('meshcore-nodes-page')
export class NodesPage extends LitElement {
  @property({ type: Array }) contacts: Contact[] = [];
  @property({ type: Array }) channels: Channel[] = [];
  // managedDevices removed — devices now live on the Devices tab
  @property({ type: Boolean }) narrow = false;
  @property({ type: Object }) hass?: HomeAssistant;
  @property({ type: Object }) config?: PanelConfig;
  private _mediaQuery?: MediaQueryList;
  @state() private _viewportNarrow = false;
  @state() private _mapReady = customElements.get('ha-map') !== undefined;
  @state() private _mapFocusId = '';
  private _mapMarkerElements = new Map<string, HTMLElement>();

  // ─── Two-level filter state ─────────────────────────────────────────
  @state() private _primaryFilter: PrimaryCategory = 'all';
  @state() private _typeFilter: NodeType | null = null;
  @state() private _searchQuery = '';

  // ─── Results state ──────────────────────────────────────────────────
  @state() private _displayedContacts: Contact[] = [];
  @state() private _totalCount = 0;
  @state() private _typeCounts: TypeCounts = { clients: 0, repeaters: 0, room_servers: 0, sensors: 0 };
  @state() private _l1Counts: NodeCounts = { all: 0, added: 0, discovered: 0 };
  @state() private _loading = false;

  // ─── Node detail dialog state ───────────────────────────────────────
  @state() private _selectedNode?: Contact;
  @state() private _nodeDetailDialogOpen = false;
  // Pending state for in-flight Add/Remove contact actions triggered from
  // the modal. Set when the action is dispatched, cleared by the parent
  // panel's try/finally after the WS call resolves.
  @state() private _pendingAction: 'add-contact' | 'remove-contact' | null = null;

  // ─── Sort state ─────────────────────────────────────────────────────
  @state() private _sortBy: 'last_heard' | 'name' | 'prefix' = 'last_heard';

  private _searchTimer?: ReturnType<typeof setTimeout>;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .nodes-layout {
      display: grid;
      grid-template-columns: minmax(340px, 1fr) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }

    .nodes-list-pane {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      border-right: 1px solid var(--divider-color, #e0e0e0);
    }

    .nodes-header {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: var(--card-background-color, #fff);
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      flex-shrink: 0;
    }

    .nodes-map-pane {
      position: relative;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: var(--card-background-color, #fff);
    }

    .nodes-map-pane ha-map {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 420px;
    }

    .map-note {
      display:flex;
      align-items:center;
      justify-content:center;
      height:100%;
      min-height:320px;
      color:var(--secondary-text-color);
      text-align:center;
      padding:24px;
      box-sizing:border-box;
    }

    .map-count {
      position:absolute;
      top:10px;
      right:10px;
      z-index:30;
      padding:6px 9px;
      border-radius:14px;
      background:color-mix(in srgb, var(--card-background-color) 90%, transparent);
      color:var(--primary-text-color);
      border:1px solid var(--divider-color);
      font-size:11px;
      font-weight:600;
      box-shadow:0 1px 4px rgba(0,0,0,.18);
      pointer-events:none;
    }

    .map-selection {
      position:absolute;
      left:10px;
      bottom:10px;
      z-index:30;
      max-width:calc(100% - 20px);
      padding:6px 9px;
      border-radius:7px;
      background:color-mix(in srgb, var(--card-background-color) 92%, transparent);
      color:var(--primary-text-color);
      border:1px solid var(--divider-color);
      font-size:11px;
      box-shadow:0 1px 4px rgba(0,0,0,.18);
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
      pointer-events:none;
    }

        /* ─── Level 1 filter buttons ────────────────────────────────────── */

    .l1-filters {
      display: flex;
      gap: 6px;
    }

    .l1-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 8px 14px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 20px;
      background: transparent;
      color: var(--secondary-text-color, #727272);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border-left: 3px solid transparent;
    }

    .l1-btn:hover {
      background: rgba(0, 0, 0, 0.03);
      color: var(--primary-text-color);
    }

    /* Inactive left-edge accent — same alpha as the active border
       below, so the active/inactive transition doesn't visibly jump
       in saturation. */
    .l1-btn.added,
    .l1-btn.all         { border-left-color: rgba(3, 169, 244, 0.5); }
    .l1-btn.discovered  { border-left-color: rgba(76, 175, 80, 0.5); }

    /* Active state: translucent category background + saturated text,
       matching the per-card category-badge treatment so the filter
       reads as the same tag concept. Normalize border-left-width back
       to 1px so the filled active button isn't visibly chunkier on the
       left than the other three sides (the 3px accent only makes
       sense as an inactive-state visual cue). */
    .l1-btn.active {
      border-left-width: 1px;
    }
    .l1-btn.active.all,
    .l1-btn.active.added {
      background: rgba(3, 169, 244, 0.15);
      color: #0277bd;
      border-color: rgba(3, 169, 244, 0.5);
      border-left-color: rgba(3, 169, 244, 0.5);
    }
    .l1-btn.active.discovered {
      background: rgba(76, 175, 80, 0.15);
      color: #2e7d32;
      border-color: rgba(76, 175, 80, 0.5);
      border-left-color: rgba(76, 175, 80, 0.5);
    }

    .l1-count {
      font-size: 11px;
      opacity: 0.8;
    }

    /* ─── Level 2 filter buttons ────────────────────────────────────── */

    .l2-bar {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .l2-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 5px 10px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 14px;
      background: transparent;
      color: var(--secondary-text-color, #727272);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .l2-btn:hover {
      background: rgba(0, 0, 0, 0.03);
      color: var(--primary-text-color);
    }

    /* Inactive L2 left-edge accent — same alpha as the active border
       below for a clean active/inactive transition. */
    .l2-btn.clients      { border-left: 2px solid rgba(76, 175, 80, 0.5); }
    .l2-btn.repeaters    { border-left: 2px solid rgba(255, 152, 0, 0.5); }
    .l2-btn.room_servers { border-left: 2px solid rgba(156, 39, 176, 0.5); }
    .l2-btn.sensors      { border-left: 2px solid rgba(96, 125, 139, 0.5); }

    /* When active, normalize the left edge back to 1px so the filled
       button doesn't have a chunkier left border than its other edges. */
    .l2-btn.active {
      border-left-width: 1px;
    }

    /* Active L2: same translucent treatment as L1 active and the
       per-card avatar/category-badge. */
    .l2-btn.active.clients {
      background: rgba(76, 175, 80, 0.15);
      color: #388e3c;
      border-color: rgba(76, 175, 80, 0.5);
    }
    .l2-btn.active.repeaters {
      background: rgba(255, 152, 0, 0.15);
      color: #f57c00;
      border-color: rgba(255, 152, 0, 0.5);
    }
    .l2-btn.active.room_servers {
      background: rgba(156, 39, 176, 0.15);
      color: #7b1fa2;
      border-color: rgba(156, 39, 176, 0.5);
    }
    .l2-btn.active.sensors {
      background: rgba(96, 125, 139, 0.15);
      color: #455a64;
      border-color: rgba(96, 125, 139, 0.5);
    }

    .l2-count {
      font-size: 10px;
      opacity: 0.8;
    }

    .l2-spacer {
      flex: 1;
    }

    /* ─── Search bar ────────────────────────────────────────────────── */

    .search-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--primary-background-color, #fafafa);
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 8px;
      padding: 6px 10px;
    }

    .search-icon {
      flex-shrink: 0;
      color: var(--secondary-text-color, #727272);
      display: flex;
    }

    .search-bar input {
      flex: 1;
      border: none;
      background: transparent;
      font-size: 13px;
      color: var(--primary-text-color);
      outline: none;
    }

    .clear-search {
      border: none;
      background: none;
      cursor: pointer;
      color: var(--secondary-text-color, #727272);
      font-size: 16px;
      padding: 0 2px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .export-btn {
      margin-left: auto;
      white-space: nowrap;
    }

    .sync-btn {
      padding: 6px 12px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px;
      background: transparent;
      color: var(--secondary-text-color, #727272);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .sync-btn:hover {
      background: var(--primary-color, #03a9f4);
      color: #fff;
      border-color: var(--primary-color, #03a9f4);
    }

    .sort-select {
      padding: 4px 8px; border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 4px; background: var(--card-background-color, #fff);
      color: var(--primary-text-color); font-size: 11px; cursor: pointer;
      box-sizing: border-box;
      height: 28px;
      min-height: 28px;
      line-height: normal;
      appearance: menulist;
      -webkit-appearance: menulist;
    }

    /* ─── Content area ──────────────────────────────────────────────── */

    .content-area {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px;
      background: var(--primary-background-color, #fafafa);
    }

    .content-area::-webkit-scrollbar { width: 6px; }
    .content-area::-webkit-scrollbar-track { background: transparent; }
    .content-area::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb, var(--scrollbar-thumb-color, #c1c1c1));
      border-radius: 3px;
    }

    .nodes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 8px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--secondary-text-color, #727272);
      text-align: center;
    }
    .empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }
    .empty-text { font-size: 16px; margin-bottom: 8px; }
    .empty-subtext { font-size: 13px; opacity: 0.7; max-width: 300px; }

    .clear-btn {
      padding: 4px 10px; border: 1px solid rgba(219, 68, 55, 0.3);
      border-radius: 4px; background: transparent;
      color: var(--error-color, #db4437); font-size: 11px;
      font-weight: 500; cursor: pointer; transition: all 0.15s;
    }
    .clear-btn:hover {
      background: var(--error-color, #db4437); color: #fff;
      border-color: var(--error-color, #db4437);
    }

    .confirm-bar {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; background: rgba(219, 68, 55, 0.08);
      border: 1px solid rgba(219, 68, 55, 0.2); border-radius: 6px;
      margin-bottom: 12px; font-size: 12px;
    }
    .confirm-bar button {
      padding: 4px 10px; border: none; border-radius: 4px;
      font-size: 11px; font-weight: 600; cursor: pointer;
    }
    .confirm-bar .yes { background: var(--error-color, #db4437); color: #fff; }
    .confirm-bar .no { background: var(--divider-color, #e0e0e0); color: var(--primary-text-color); }

    .category-badge {
      font-size: 10px; font-weight: 500; padding: 2px 8px;
      border-radius: 10px; white-space: nowrap; flex-shrink: 0; align-self: center;
    }

    .load-more {
      display: flex; justify-content: center; padding: 12px;
    }
    .load-more button {
      padding: 8px 20px; border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px; background: transparent;
      color: var(--primary-text-color); font-size: 12px;
      cursor: pointer; transition: all 0.15s;
    }
    .load-more button:hover {
      background: var(--primary-color, #03a9f4); color: #fff;
      border-color: var(--primary-color, #03a9f4);
    }

    /* ─── Narrow overrides ──────────────────────────────────────────── */

    :host([narrow]) .l1-filters { gap: 4px; flex-wrap: wrap; }
    :host([narrow]) .l1-btn { font-size: 11px; padding: 5px 10px; }
    :host([narrow]) .l2-btn { font-size: 11px; padding: 5px 10px; }
    :host([narrow]) .nodes-grid { grid-template-columns: 1fr; }
    :host([narrow]) .nodes-layout {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(360px, 55%) minmax(300px, 45%);
      overflow-y: auto;
    }
    :host([narrow]) .nodes-list-pane {
      border-right: none;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    // Use matchMedia for reliable viewport-based narrow detection
    // 870px matches HA's own narrow threshold (companion app WebViews report wider CSS viewports)
    this._mediaQuery = window.matchMedia('(max-width: 870px)');
    this._viewportNarrow = this._mediaQuery.matches;
    this._mediaQuery.addEventListener('change', this._onMediaChange);
    this._loadCounts();
    this._loadPage(true);
    void this._ensureMapComponent();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._mediaQuery?.removeEventListener('change', this._onMediaChange);
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
      this._searchTimer = undefined;
    }
  }

  private _onMediaChange = (e: MediaQueryListEvent) => {
    this._viewportNarrow = e.matches;
  };

  private get _isNarrow(): boolean {
    return this.narrow || this._viewportNarrow;
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    // Sync the narrow attribute on the host so :host([narrow]) CSS selectors work
    if (this._isNarrow) {
      this.setAttribute('narrow', '');
    } else {
      this.removeAttribute('narrow');
    }
    // When the panel switches between upstream meshcore entries, the
    // panel rebuilds `config` (new entry_id). Reset the per-page filter
    // results and re-fetch counts + page so the displayed grid reflects
    // the new entry rather than stale data from the previous one.
    if (changedProperties.has('config')) {
      this._displayedContacts = [];
      this._totalCount = 0;
      this._loadCounts();
      this._loadPage(true);
    }
  }

  render() {
    return html`
      <div class="nodes-layout">
        <section class="nodes-list-pane">
          <div class="nodes-header">
            <div class="l1-filters">
              ${this._renderL1Button('all', 'All')}
              ${this._renderL1Button('added', '★ Added')}
              ${this._renderL1Button('discovered', 'Discovered')}
              <button class="l1-btn export-btn" @click=${() => this._exportContacts()}>Exportar</button>
              <button class="l1-btn" @click=${() => this._pickImportFile()}>Importar</button>
              <input id="contact-import-file" hidden type="file" accept=".json,application/json"
                @change=${this._onImportFile}>
            </div>

            ${this._primaryFilter !== 'all' ? html`
              <div class="l2-bar">
                ${this._renderL2Buttons()}
              </div>
            ` : nothing}

            <div class="header-actions">
              <div class="search-bar" style="flex: 1;">
                <span class="search-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></span>
                <input
                  type="text"
                  placeholder=${this._getSearchPlaceholder()}
                  .value=${this._searchQuery}
                  @input=${this._onSearchInput}>
                ${this._searchQuery
                  ? html`<button class="clear-search" @click=${() => { this._searchQuery = ''; this._loadPage(true); }}>✕</button>`
                  : nothing}
              </div>
              <select class="sort-select"
                .value=${this._sortBy}
                @change=${(e: Event) => {
                  this._sortBy = (e.target as HTMLSelectElement).value as 'last_heard' | 'name' | 'prefix';
                  this._loadPage(true);
                }}>
                <option value="last_heard">Last Heard</option>
                <option value="name">Name</option>
                <option value="prefix">Pub Prefix</option>
              </select>
              <button class="clear-btn"
                @click=${() => this._clearStaleContacts()}
                title="Remove discovered contacts older than the configured threshold">
                Clear Stale
              </button>
              <button class="sync-btn" @click=${() => this._syncAll()}>⟳ Sync</button>
            </div>
          </div>

          <div class="content-area">
            ${this._renderContactsContent()}
          </div>
        </section>

        <section class="nodes-map-pane">
          ${this._renderMapPane()}
        </section>
      </div>

      <meshcore-node-detail-dialog
        .hass=${this.hass}
        .node=${this._selectedNode}
        .pendingAction=${this._pendingAction}
        ?open=${this._nodeDetailDialogOpen}
        @node-detail-closed=${() => { this._nodeDetailDialogOpen = false; }}
        @node-message=${() => this._dispatchNodeAction('message')}
        @node-trace=${() => this._dispatchNodeAction('trace')}
        @node-add-contact=${() => this._dispatchNodeAction('add-contact')}
        @node-remove-contact=${() => this._dispatchNodeAction('remove-contact')}>
      </meshcore-node-detail-dialog>
    `;
  }

  private async _ensureMapComponent() {
    if (customElements.get('ha-map')) {
      this._mapReady = true;
      return;
    }
    try {
      const loader = (window as Window & {
        loadCardHelpers?: () => Promise<{ createCardElement?: (config: Record<string, unknown>) => unknown }>;
      }).loadCardHelpers;
      if (loader) {
        const helpers = await loader();
        helpers.createCardElement?.({ type: 'map', entities: [] });
      }
      await Promise.race([
        customElements.whenDefined('ha-map'),
        new Promise((resolve) => window.setTimeout(resolve, 1500)),
      ]);
      this._mapReady = customElements.get('ha-map') !== undefined;
      this.requestUpdate();
    } catch {
      this._mapReady = false;
    }
  }

  private _allMapSourceContacts(): Contact[] {
    return this.contacts.length ? this.contacts : this._displayedContacts;
  }

  private _contactCoords(contact: Contact): [number, number] | null {
    const raw = contact as Contact & {
      latitude?: number; longitude?: number; lat?: number; lon?: number; lng?: number;
      location?: { latitude?: number; longitude?: number; lat?: number; lon?: number; lng?: number };
    };
    const lat = Number(raw.adv_lat ?? raw.latitude ?? raw.lat ?? raw.location?.latitude ?? raw.location?.lat);
    const lon = Number(raw.adv_lon ?? raw.longitude ?? raw.lon ?? raw.lng ?? raw.location?.longitude ?? raw.location?.lon ?? raw.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    if (lat === 0 && lon === 0) return null;
    return [lat, lon];
  }

  private _mapContacts(): Contact[] {
    return this._allMapSourceContacts().filter((c) => this._contactCoords(c) !== null);
  }

  private _contactId(contact: Contact): string {
    return contact.public_key || contact.pubkey_prefix;
  }

  private _styleMapMarker(marker: HTMLElement, selected: boolean) {
    marker.style.width = '30px';
    marker.style.height = '30px';
    marker.style.borderRadius = '50%';
    marker.style.display = 'grid';
    marker.style.placeItems = 'center';
    marker.style.fontSize = '10px';
    marker.style.fontWeight = '700';
    marker.style.background = selected ? 'var(--warning-color, #ff9800)' : 'var(--primary-color, #03a9f4)';
    marker.style.color = 'white';
    marker.style.border = selected ? '3px solid white' : '2px solid white';
    marker.style.boxShadow = selected
      ? '0 0 0 3px rgba(255,152,0,.35), 0 2px 7px rgba(0,0,0,.35)'
      : '0 1px 5px rgba(0,0,0,.35)';
  }

  private _mapEntities(): string[] {
    return this._mapContacts()
      .map((contact) => (contact as Contact & { map_entity_id?: string }).map_entity_id)
      .filter((entityId): entityId is string => Boolean(entityId && this.hass?.states?.[entityId]));
  }

  private _mapLocations() {
    const activeIds = new Set<string>();
    const locations = this._mapContacts()
      .filter((contact) => {
        const entityId = (contact as Contact & { map_entity_id?: string }).map_entity_id;
        return !entityId || !this.hass?.states?.[entityId];
      })
      .map((contact) => {
      const id = this._contactId(contact);
      const coords = this._contactCoords(contact)!;
      activeIds.add(id);
      let marker = this._mapMarkerElements.get(id);
      if (!marker) {
        marker = document.createElement('div');
        this._mapMarkerElements.set(id, marker);
      }
      this._styleMapMarker(marker, id === this._mapFocusId);
      marker.textContent = (contact.adv_name || contact.pubkey_prefix || '?').slice(0, 2).toUpperCase();
      return {
        id,
        location: coords,
        element: marker,
        elementSize: [36, 36] as [number, number],
        title: contact.adv_name || contact.pubkey_prefix,
        locationEditable: false,
        activatable: true,
      };
    });
    for (const id of this._mapMarkerElements.keys()) {
      if (!activeIds.has(id)) this._mapMarkerElements.delete(id);
    }
    return locations;
  }

  private _onMapNodeClicked(e: CustomEvent<{ id: string }>) {
    const contact = this._mapContacts().find((c) => this._contactId(c) === e.detail?.id);
    if (contact) this._selectNode(contact, false);
  }

  private _selectNode(node: Contact, openDetails = true) {
    this._mapFocusId = this._contactId(node);
    const coords = this._contactCoords(node);
    this.requestUpdate();
    void this.updateComplete.then(() => {
      if (coords) {
        const map = this.renderRoot.querySelector('ha-map') as (HTMLElement & {
          setView?: (center: [number, number], zoom?: number) => void;
        }) | null;
        map?.setView?.(coords, 15);
      }
    });
    if (openDetails) {
      this._selectedNode = node;
      this._nodeDetailDialogOpen = true;
    }
  }

  private _renderMapPane() {
    const contacts = this._mapContacts();
    const total = this._allMapSourceContacts().length;
    if (!this._mapReady) {
      return html`<div class="map-note">A carregar o mapa do Home Assistant…</div>`;
    }
    if (!contacts.length) {
      return html`<div class="map-note">0 nós com localização · ${total} nós no total.<br>Os nós sem GPS anunciado permanecem na lista à esquerda.</div>`;
    }
    return html`
      <div class="map-count">${contacts.length} nós com localização - CENTRAR</div>
      <ha-map
        .entities=${this._mapEntities()}
        .editableLocations=${this._mapLocations()}
        .autoFit=${true}
        .clusterMarkers=${true}
        .scaleRuler=${true}
        @editable-location-clicked=${this._onMapNodeClicked}>
      </ha-map>
    `;
  }

    // ─── Level 1 button rendering ─────────────────────────────────────

  private _renderL1Button(category: PrimaryCategory, label: string) {
    const count = this._l1Counts[category];
    const isActive = this._primaryFilter === category;
    const classes = `l1-btn ${category} ${isActive ? 'active' : ''}`;

    return html`
      <button
        class=${classes}
        @click=${() => this._setPrimaryFilter(category)}>
        ${label} <span class="l1-count">(${count})</span>
      </button>
    `;
  }

  // ─── Level 2 button rendering ─────────────────────────────────────

  private _renderL2Buttons() {
    const types: NodeType[] = ['clients', 'repeaters', 'room_servers', 'sensors'];
    return types
      .filter((t) => this._typeCounts[t] > 0)
      .map((t) => {
        const isActive = this._typeFilter === t;
        return html`
          <button
            class=${`l2-btn ${t} ${isActive ? 'active' : ''}`}
            @click=${() => this._setTypeFilter(t)}>
            ${TYPE_LABELS[t]} <span class="l2-count">(${this._typeCounts[t]})</span>
          </button>
        `;
      });
  }

  // ─── Filter actions ───────────────────────────────────────────────

  private _setPrimaryFilter(category: PrimaryCategory) {
    if (this._primaryFilter === category) return;
    this._primaryFilter = category;
    this._typeFilter = null;
    this._displayedContacts = [];
    this._totalCount = 0;
    this._loadPage(true);
  }

  private _setTypeFilter(type: NodeType) {
    if (this._typeFilter === type) {
      // Toggle off
      this._typeFilter = null;
    } else {
      this._typeFilter = type;
    }
    this._displayedContacts = [];
    this._totalCount = 0;
    this._loadPage(true);
  }

  // ─── Search ───────────────────────────────────────────────────────

  private _onSearchInput(e: Event) {
    this._searchQuery = (e.target as HTMLInputElement).value;
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this._loadPage(true), 300);
  }

  private _getSearchPlaceholder(): string {
    const cat = this._primaryFilter;
    const type = this._typeFilter ? TYPE_LABELS[this._typeFilter].toLowerCase() : 'nodes';
    if (cat === 'all') return 'Search all nodes...';
    return `Search ${cat} ${type}...`;
  }

  // ─── Data loading ─────────────────────────────────────────────────

  private async _loadPage(reset = false) {
    if (!this.hass) return;
    this._loading = true;

    try {
      const offset = reset ? 0 : this._displayedContacts.length;
      const nodeType = this._typeFilter ? NODE_TYPE_MAP[this._typeFilter] : undefined;
      const search = this._searchQuery.trim() || undefined;

      const result = await getContactsPaginated(this.hass, this._primaryFilter, {
        nodeType,
        search,
        limit: PAGE_SIZE,
        offset,
        entryId: this.config?.entry_id,
        sortBy: this._sortBy,
      });

      if (reset) {
        this._displayedContacts = result.contacts;
      } else {
        this._displayedContacts = [...this._displayedContacts, ...result.contacts];
      }
      this._totalCount = result.total;
      this._typeCounts = result.counts;
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      this._loading = false;
    }
  }

  private async _loadCounts() {
    if (!this.hass) return;
    try {
      this._l1Counts = await getNodeCounts(this.hass, this.config?.entry_id);
    } catch (err) {
      console.error('Failed to load node counts:', err);
    }
  }

  private async _clearStaleContacts() {
    if (!this.hass) return;
    const days = prompt('Remove discovered contacts older than how many days?', '30');
    if (!days) return;
    const daysNum = parseInt(days, 10);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) return;
    const result = await clearDiscoveredContacts(this.hass, daysNum, this.config?.entry_id);
    if (result.removed > 0) {
      this._loadPage(true);
      this._loadCounts();
      this.dispatchEvent(new CustomEvent('contacts-changed', { bubbles: true, composed: true }));
    }
  }

  private _exportPath(contact: Contact): string {
    const existing = contact.advert_path_list;
    if (Array.isArray(existing)) {
      return existing.map((part) =>
        String(part ?? '').trim().replace(/^0x/i, '').toLowerCase()
      ).filter(Boolean).join(',');
    }
    if (typeof existing === 'string' && existing.includes(',')) {
      return existing.split(',').map((part) =>
        part.trim().replace(/^0x/i, '').toLowerCase()
      ).filter(Boolean).join(',');
    }

    const rawHex = String(contact.out_path ?? contact.path ?? existing ?? '')
      .replace(/[^0-9a-f]/gi, '')
      .toLowerCase();
    const outPathLen = Number(contact.out_path_len);
    if (!rawHex || !Number.isInteger(outPathLen) || outPathLen <= 0) return '';

    const mode = Number(contact.out_path_hash_mode ?? contact.path_hash_mode);
    let hopChars = Number.isInteger(mode) && mode >= 0 && mode <= 2 ? (mode + 1) * 2 : 0;
    if (rawHex.length % outPathLen === 0) {
      const inferred = rawHex.length / outPathLen;
      if ([2, 4, 6].includes(inferred) && (!hopChars || hopChars * outPathLen !== rawHex.length)) {
        hopChars = inferred;
      }
    }
    if (!hopChars || hopChars * outPathLen !== rawHex.length) return '';

    const hops: string[] = [];
    for (let i = 0; i < outPathLen; i++) {
      hops.push(rawHex.slice(i * hopChars, (i + 1) * hopChars));
    }
    return hops.join(',');
  }

  private _exportCoord(value: unknown): string {
    const number = Number(value);
    if (!Number.isFinite(number) || number === 0) return '0.0';
    return String(number);
  }

  private async _exportContacts() {
    if (!this.hass) return;
    const source = await getContacts(this.hass, this.config?.entry_id);
    const byKey = new Map<string, Record<string, unknown>>();

    for (const contact of source) {
      const publicKey = String(contact.public_key || '').trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(publicKey)) continue;
      const row = {
        type: Number(contact.type ?? 0) || 0,
        name: String(contact.adv_name ?? contact.name ?? ''),
        public_key: publicKey,
        flags: Number(contact.flags ?? 0) || 0,
        latitude: this._exportCoord(contact.adv_lat ?? contact.latitude),
        longitude: this._exportCoord(contact.adv_lon ?? contact.longitude),
        last_advert: Math.trunc(Number(contact.last_advert ?? 0)) || 0,
        last_modified: Math.trunc(Number(contact.lastmod ?? contact.last_modified ?? 0)) || 0,
        advert_path_list: this._exportPath(contact),
      };
      const previous = byKey.get(publicKey);
      if (!previous || Number(row.last_modified) >= Number(previous.last_modified ?? 0)) {
        byKey.set(publicKey, row);
      }
    }

    const contacts = [...byKey.values()].sort(
      (a, b) => Number(b.last_modified ?? 0) - Number(a.last_modified ?? 0)
    );
    const blob = new Blob(
      [JSON.stringify({ discovered_contacts: contacts }, null, 2)],
      { type: 'application/json;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hivefw_discovered_contacts.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private _pickImportFile() {
    const input = this.renderRoot.querySelector<HTMLInputElement>('#contact-import-file');
    if (!input) return;
    input.value = '';
    input.click();
  }

  private _onImportFile = async (event: Event) => {
    if (!this.hass) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as {
        discovered_contacts?: Array<Record<string, unknown>>;
      };
      if (!Array.isArray(parsed.discovered_contacts)) {
        window.alert('Ficheiro inválido: falta discovered_contacts.');
        return;
      }

      const result = await importContacts(
        this.hass,
        parsed.discovered_contacts,
        this.config?.entry_id,
      );

      await Promise.all([this._loadPage(true), this._loadCounts()]);
      this.dispatchEvent(new CustomEvent('contacts-changed', { bubbles: true, composed: true }));

      window.alert(
        `Importação concluída: ${result.imported} novos, ${result.skipped_existing} já existentes` +
        (result.invalid ? `, ${result.invalid} inválidos.` : '.')
      );
    } catch (error) {
      console.error('Failed to import contacts:', error);
      window.alert('Não foi possível importar este ficheiro.');
    } finally {
      input.value = '';
    }
  };

  private _syncAll() {
    this._loadPage(true);
    this._loadCounts();
    this.dispatchEvent(new CustomEvent('contacts-changed', { bubbles: true, composed: true }));
  }

  // ─── Contact cards rendering ──────────────────────────────────────

  private _renderContactsContent() {
    if (this._loading && this._displayedContacts.length === 0) {
      return html`
        <div class="empty-state">
          <div class="empty-text">Loading...</div>
        </div>
      `;
    }

    if (this._displayedContacts.length === 0) {
      return this._renderEmptyState();
    }

    // Order comes from the server (see get_contacts_paginated in coordinator.py).
    // Sorting is selected via the sort-select above; @change triggers _loadPage(true)
    // so the visible page always reflects the chosen sort across the entire
    // filtered dataset — not just the first page.
    return html`
      <div class="nodes-grid">
        ${this._displayedContacts.map((c) => html`
          <div @click=${() => this._selectNode(c, false)}>
            <meshcore-contact-card
              .contact=${c as Contact}
              .selected=${this._contactId(c) === this._mapFocusId}>
            </meshcore-contact-card>
          </div>
        `)}
      </div>
      ${this._displayedContacts.length < this._totalCount ? html`
        <div class="load-more">
          <button ?disabled=${this._loading} @click=${() => this._loadPage()}>
            ${this._loading ? 'Loading...' : `Load More (${this._displayedContacts.length} of ${this._totalCount})`}
          </button>
        </div>
      ` : nothing}
    `;
  }

  private _renderEmptyState() {
    const cat = this._primaryFilter;
    const type = this._typeFilter;

    let icon = html`<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.5"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`;
    let text = 'No nodes found';
    let subtext = '';

    if (this._searchQuery) {
      text = 'No matching nodes';
      subtext = `No results for "${this._searchQuery}"`;
    } else if (cat === 'added') {
      text = 'No added contacts';
      subtext = type ? `No added ${TYPE_LABELS[type].toLowerCase()}` : 'Add discovered contacts to see them here';
    } else if (cat === 'discovered') {
      text = 'No discovered nodes';
      subtext = type ? `No discovered ${TYPE_LABELS[type].toLowerCase()}` : 'Nodes seen on the mesh will appear here';
    } else if (cat === 'all') {
      text = 'No nodes';
      subtext = 'No contacts or discovered nodes yet';
    }

    return html`
      <div class="empty-state">
        <div class="empty-icon">${icon}</div>
        <div class="empty-text">${text}</div>
        ${subtext ? html`<div class="empty-subtext">${subtext}</div>` : nothing}
      </div>
    `;
  }

  // ─── Node detail actions ──────────────────────────────────────────

  private _openNodeDetail(node: Contact) {
    this._selectNode(node, true);
  }

  private _dispatchNodeAction(action: string) {
    // Mark the in-flight mutation so the still-visible button can show
    // "Adding…" / "Removing…". The parent panel clears this in try/finally
    // after the WS call + coordinator refresh resolve.
    if (action === 'add-contact' || action === 'remove-contact') {
      this._pendingAction = action;
    }
    this.dispatchEvent(
      new CustomEvent('node-action', {
        detail: { action, node: this._selectedNode },
        bubbles: true,
        composed: true,
      })
    );
    // 'remove-contact' intentionally dropped: the dialog's own _close()
    // (called synchronously from _confirmAction_exec) already fires
    // 'node-detail-closed' which sets _nodeDetailDialogOpen = false.
    if (action === 'message' || action === 'delete') {
      this._nodeDetailDialogOpen = false;
    }
  }

  // ─── Public API for parent panel (called after WS mutation resolves) ─

  /**
   * Clear the pending-action flag. Called by the parent panel's finally
   * block regardless of whether the mutation succeeded or failed, so the
   * button never stays stuck in "Adding…" / "Removing…" state.
   */
  public clearPendingAction() {
    this._pendingAction = null;
  }

  /**
   * Re-fetch the paginated contact list + L1 counts, then re-resolve
   * _selectedNode from the fresh data so a still-open modal reflects
   * the mutation (e.g. Add Contact → Status field flips to "Added").
   */
  public async refreshAfterMutation(pubkey: string) {
    await Promise.all([this._loadPage(true), this._loadCounts()]);
    // Only matters for add-contact, where the modal stays open. Remove-
    // contact closes the modal synchronously via the dialog's _close().
    if (this._nodeDetailDialogOpen && this._selectedNode && pubkey) {
      const match = this._displayedContacts.find((c) => {
        if (c.public_key && c.public_key === pubkey) return true;
        if (c.pubkey_prefix && pubkey.startsWith(c.pubkey_prefix)) return true;
        return false;
      });
      if (match) {
        // Trigger re-render by replacing the reference
        this._selectedNode = { ...match };
      } else {
        // Contact fell outside current filter (e.g. user has "Discovered"
        // filter active and just added the contact). Close the modal.
        this._nodeDetailDialogOpen = false;
      }
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-nodes-page': NodesPage;
  }
}
