class HomeMaintenanceManagerPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this.tasks = [];
    this.metadata = { areas: [], devices: [], entities: [], notify_services: [], notification_settings: null };
    this.notificationSettings = { enabled: true, default_mode: "automation_only", mobile_notify_services: [], notify_upcoming: true, notify_due: true, notify_overdue: true, notify_completed: false, notify_snoozed: false, repeat_mode: "once", repeat_days: 1, quiet_start: "", quiet_end: "", title_template: "[{category}] {task_name}", body_template: "{task_name} is {status}." };
    this.tags = [];
    this.tab = "dashboard";
    this.modal = null;
    this.loading = true;
    this.error = null;
    this.categoryFilter = "All";
    this.statusFilter = "All";
    this.sortMode = "urgent";
    this.runtimeAnalysis = null;
    this.runtimeAnalysisLoading = false;
    this.analysisDays = 30;
    this._modalSnapshot = null;
    this.mobileMenuOpen = false;
    this._routeTaskId = null;
    this._boundRouteChanged = () => this.handleRouteChanged();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this.loadData();
  }

  connectedCallback() {
    window.addEventListener('popstate', this._boundRouteChanged);
    window.addEventListener('hashchange', this._boundRouteChanged);
    this.render();
    this.handleRouteChanged();
  }

  disconnectedCallback() {
    window.removeEventListener('popstate', this._boundRouteChanged);
    window.removeEventListener('hashchange', this._boundRouteChanged);
  }

  async loadData() {
    if (!this._hass) return;
    this.loading = true;
    this.error = null;
    try {
      const [taskData, meta] = await Promise.all([
        this._hass.callWS({ type: "home_maintenance_manager/get_tasks" }),
        this._hass.callWS({ type: "home_maintenance_manager/get_metadata" })
      ]);
      this.tasks = taskData.tasks || [];
      this.metadata = meta || this.metadata;
      this.applyRouteTask();
      if (meta?.notification_settings) this.notificationSettings = {...this.notificationSettings, ...meta.notification_settings};
      try {
        const tagResult = await this._hass.callWS({ type: "tag/list" });
        this.tags = Array.isArray(tagResult) ? tagResult : (tagResult.tags || []);
      } catch (err) {
        this.tags = [];
      }
    } catch (err) {
      this.error = err?.message || String(err);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  css() {
    return `
      :host { display:block; font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif); color: var(--primary-text-color); }
      .page { padding: 24px; max-width: 1280px; margin: 0 auto; }
      .ha-mobile-appbar { display:none; position:sticky; top:0; z-index:6; margin:-24px -24px 24px; padding-top:env(safe-area-inset-top, 0px); background:var(--app-header-background-color, var(--primary-background-color)); color:var(--app-header-text-color, var(--primary-text-color)); border-bottom:1px solid var(--divider-color); box-shadow:0 1px 3px rgba(0,0,0,.10); }
      .ha-mobile-appbar .bar-row { height:56px; display:flex; align-items:center; gap:16px; padding:0 12px; }
      .ha-mobile-appbar .app-title { flex:1; min-width:0; font-size:20px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .ha-icon-button { width:44px; height:44px; border:0; border-radius:50%; background:transparent; color:inherit; cursor:pointer; font-size:28px; display:inline-flex; align-items:center; justify-content:center; line-height:1; }
      .ha-icon-button:hover { background:rgba(0,0,0,.06); }
      .ha-menu-popover { position:absolute; top:calc(env(safe-area-inset-top, 0px) + 50px); right:8px; min-width:190px; background:var(--card-background-color); color:var(--primary-text-color); border:1px solid var(--divider-color); border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,.24); padding:6px; }
      .ha-menu-popover button { width:100%; text-align:left; border:0; background:transparent; color:inherit; padding:12px; border-radius:8px; cursor:pointer; }
      .ha-menu-popover button:hover { background:var(--secondary-background-color); }
      .hero { display:flex; gap:16px; align-items:center; justify-content:space-between; margin-bottom:20px; }
      h1 { margin:0; font-size:32px; font-weight:700; }
      h2 { margin:22px 0 12px; }
      .subtitle { color: var(--secondary-text-color); margin-top:6px; font-size:16px; }
      .tabs, .filters, .task-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .tabs { margin:18px 0; }
      .filters { margin:0 0 16px; }
      button, select, input, textarea { font: inherit; }
      .tab, .btn { border:0; border-radius:999px; padding:10px 16px; cursor:pointer; background: var(--secondary-background-color); color: var(--primary-text-color); }
      .tab.active, .btn.primary { background: var(--primary-color); color: var(--text-primary-color); }
      .btn.danger { background:#b00020; color:white; }
      .btn.small { padding:7px 11px; font-size:13px; }
      .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:16px; }
      .card { background: var(--card-background-color); border-radius:18px; padding:18px; box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0,0,0,.12)); border: 1px solid var(--divider-color); }
      .metric { font-size:34px; font-weight:700; }
      .muted { color: var(--secondary-text-color); }
      .pill { display:inline-block; border-radius:999px; padding:5px 10px; font-size:12px; font-weight:700; text-transform:uppercase; background: var(--secondary-background-color); }
      .pill.ok { background:#e4f7e7; color:#0b6b20; }
      .pill.upcoming { background:#fff4d6; color:#7a5600; }
      .pill.due, .pill.overdue { background:#fde7e7; color:#9b1c1c; }
      .pill.paused, .pill.snoozed, .pill.season_paused { background:#e8e8e8; color:#555; }
      .category-pill { display:inline-block; border-radius:999px; padding:4px 9px; font-size:12px; background: var(--secondary-background-color); color: var(--secondary-text-color); margin:4px 6px 4px 0; }
      .progress { height:12px; background: var(--secondary-background-color); border-radius:999px; overflow:hidden; margin:12px 0; }
      .bar { height:100%; background: var(--primary-color); width:0%; }
      .task-title { font-size:20px; font-weight:700; margin:0 0 6px; }
      .list { display:flex; flex-direction:column; gap:12px; }
      .two { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
      .three { display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; }
      @media(max-width: 800px){ .two, .three { grid-template-columns: 1fr; } .hero { align-items:flex-start; flex-direction:column;} .page { padding:16px; } .ha-mobile-appbar { display:block; margin:-16px -16px 24px; } }
      label { display:block; font-weight:600; margin:12px 0 6px; }
      .help { font-size:13px; color: var(--secondary-text-color); margin-bottom:6px; }
      input, select, textarea { box-sizing:border-box; width:100%; padding:12px; border-radius:10px; border:1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); }
      ha-entity-picker, ha-selector { display:block; width:100%; --mdc-theme-surface: var(--card-background-color); --mdc-theme-on-surface: var(--primary-text-color); }
      textarea { min-height:80px; }
      .modal-scrim { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:flex-start; justify-content:center; padding:40px 16px; z-index:10; overflow:auto; }
      .modal { width:min(940px, 100%); background:var(--card-background-color); border-radius:22px; padding:22px; box-shadow:0 16px 50px rgba(0,0,0,.35); }
      .modal-actions-bottom { display:flex; gap:8px; justify-content:space-between; align-items:center; margin-top:18px; padding-top:16px; border-top:1px solid var(--divider-color); }
      .modal-actions-bottom .right { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
      .unsaved-dialog { position:fixed; inset:0; background:rgba(0,0,0,.52); z-index:30; display:flex; align-items:center; justify-content:center; padding:20px; }
      .unsaved-card { width:min(460px, 100%); background:var(--card-background-color); border-radius:18px; padding:20px; box-shadow:0 16px 50px rgba(0,0,0,.4); border:1px solid var(--divider-color); }
      .unsaved-card h3 { margin:0 0 8px; }
      .modal-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px; }
      .empty { text-align:center; padding:40px 16px; }
      .history-item { border-left:4px solid var(--primary-color); padding-left:12px; }
      .tag-row { display:flex; justify-content:space-between; gap:12px; align-items:center; border-bottom:1px solid var(--divider-color); padding:10px 0; }
      .detail-list { display:grid; grid-template-columns: 180px 1fr; gap:8px 12px; margin:12px 0; }
      .detail-list .key { color: var(--secondary-text-color); }
      .form-section { border:1px solid var(--divider-color); border-radius:18px; padding:16px; margin:16px 0; background: var(--secondary-background-color); }
      .form-section h3 { margin:0 0 4px; font-size:18px; }
      .section-note { color: var(--secondary-text-color); font-size:13px; margin:0 0 12px; }
      .field-label { display:flex; align-items:center; gap:6px; }
      .tip { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; border-radius:50%; background: var(--primary-color); color: var(--text-primary-color); font-size:12px; font-weight:700; cursor:help; }
      .hidden { display:none !important; }
      .info-box { border-left:4px solid var(--primary-color); background: var(--card-background-color); padding:10px 12px; border-radius:10px; margin:10px 0; color: var(--secondary-text-color); }
      .toolbar-card { margin-bottom:16px; }
      .category-header { display:flex; justify-content:space-between; gap:12px; align-items:baseline; margin:24px 0 10px; }
      .category-header h2 { margin:0; }
      .status-dot { width:10px; height:10px; border-radius:50%; background: var(--primary-color); display:inline-block; margin-right:6px; }
      .field-error { color:#b00020; font-size:13px; margin-top:4px; display:none; }
      .field-error.active { display:block; }
      .analysis-box { border:1px dashed var(--divider-color); border-radius:14px; padding:12px; margin-top:10px; background: var(--card-background-color); }
      .analysis-controls { display:grid; grid-template-columns: 220px 1fr; gap:12px; align-items:end; margin:10px 0; }
      .histogram-workbench { display:grid; grid-template-columns: 1fr 58px; gap:12px; align-items:start; margin:12px 0 8px; }
      .histogram-wrap { position:relative; margin:0; }
      .chart-area { position:relative; height:170px; margin:6px 0 0; border-left:1px solid var(--divider-color); border-bottom:1px solid var(--divider-color); overflow:hidden; }
      .histogram { position:absolute; inset:0 0 0 6px; display:flex; align-items:flex-end; gap:3px; height:100%; }
      .history-svg { position:absolute; inset:0 0 0 6px; width:calc(100% - 6px); height:100%; overflow:visible; }
      .histobar { flex:1; min-width:4px; background: var(--primary-color); border-radius:4px 4px 0 0; opacity:.75; cursor:crosshair; }
      .histobar:hover { opacity:1; filter:brightness(1.1); }
      .threshold-marker { position:absolute; left:6px; right:0; height:2px; background: var(--accent-color, #03a9f4); box-shadow:0 0 0 2px rgba(3,169,244,.2); pointer-events:none; }
      .threshold-marker.recommended { background:#2e7d32; box-shadow:0 0 0 2px rgba(46,125,50,.2); }
      .threshold-label { position:absolute; right:4px; transform:translateY(-120%); font-size:12px; background:var(--card-background-color); color:var(--primary-text-color); padding:2px 6px; border:1px solid var(--divider-color); border-radius:999px; pointer-events:none; }
      .threshold-label.recommended { color:#2e7d32; }
      .vertical-slider-wrap { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; min-width:48px; }
      .threshold-slider.vertical { writing-mode: bt-lr; -webkit-appearance: slider-vertical; appearance: slider-vertical; width:34px; height:170px; padding:0; margin:0; }
      .slider-caption { writing-mode:vertical-rl; transform:rotate(180deg); font-size:12px; color:var(--secondary-text-color); }
      .axis-row { display:flex; justify-content:space-between; gap:8px; font-size:12px; color: var(--secondary-text-color); }
      .value-axis { display:flex; justify-content:space-between; font-size:12px; color: var(--secondary-text-color); margin-left:6px; }
      .view-tabs { display:flex; gap:8px; margin:10px 0 6px; flex-wrap:wrap; }
      .view-tabs button.active { background: var(--primary-color); color: var(--text-primary-color); }
      .recommendation { font-size:18px; font-weight:700; margin:8px 0; }
      .simulation-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:8px; margin:10px 0; }
      .sim-tile { border:1px solid var(--divider-color); border-radius:12px; padding:10px; background: var(--secondary-background-color); }
      .sim-value { font-size:20px; font-weight:700; }
      .threshold-slider { width:100%; }
      .manual-threshold-row { display:grid; grid-template-columns: 1fr 170px; gap:12px; align-items:end; }
      @media(max-width: 800px){ .manual-threshold-row { grid-template-columns: 1fr; } }
      @media(max-width: 800px){ .analysis-controls { grid-template-columns: 1fr; } }
      .tooltip-note { font-size:12px; color: var(--secondary-text-color); }
    `;
  }

  taskStatus(t) { return (t.status || t.summary?.status || "unknown").toLowerCase(); }
  percent(t) { return Math.max(0, Math.min(100, Math.round(t.summary?.percent_used ?? 0))); }
  category(t) { return t.category || "General"; }
  dateShort(iso) { if (!iso) return "Not recorded"; try { return new Date(iso).toLocaleDateString(); } catch { return iso; } }
  slug(value) { return (value || "maintenance_task").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "maintenance_task"; }
  escape(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
  label(text, tip) { return `<span class="field-label"><span>${text}</span><span class="tip" title="${this.escape(tip)}">?</span></span>`; }

  entityState(entityId) { return entityId ? this._hass?.states?.[entityId] : null; }
  entityUnit(entityId) { return this.entityState(entityId)?.attributes?.unit_of_measurement || ''; }
  entityDomain(entityId) { return (entityId || '').split('.')[0] || ''; }
  runtimeUnitLabel(entityId) {
    const domain = this.entityDomain(entityId);
    const unit = this.entityUnit(entityId);
    if (['switch','binary_sensor','fan','light','input_boolean'].includes(domain)) return 'hours while ON';
    if (unit) return `hours while ${unit} condition is true`;
    return 'runtime hours';
  }
  runtimeMethodLabel(entityId) {
    const domain = this.entityDomain(entityId);
    const unit = this.entityUnit(entityId);
    if (['switch','binary_sensor','fan','light','input_boolean'].includes(domain)) return 'Entity is ON';
    if (unit) return 'Above threshold';
    return 'Specific running state';
  }


  isRateUnit(unit) {
    const u = String(unit || '').toLowerCase().replace(/\s+/g, '');
    return u.includes('/min') || u.includes('/minute') || u.includes('/h') || u.includes('/hr') || u.includes('/hour') || u.includes('/s') || u.includes('/sec') || u.includes('/second') || u.includes('permin') || u.includes('perhour') || u.includes('persecond') || u === 'w';
  }
  isLikelyInstantUnit(unit) {
    const u = String(unit || '').toLowerCase().replace(/\s+/g, '');
    return ['w','a','v','%','°f','°c','rpm','hz'].includes(u);
  }
  totalizedTargetUnit(unit) {
    const raw = String(unit || '').trim();
    const u = raw.toLowerCase().replace(/\s+/g, '');
    if (u === 'w') return 'kWh';
    if (raw.includes('/')) return raw.split('/')[0].trim() || 'units';
    if (u.includes('per')) return raw.split(/per/i)[0].trim() || 'units';
    return 'units';
  }


  intervalUnits() { return [['minutes','Minutes'],['hours','Hours'],['days','Days'],['weeks','Weeks'],['months','Months'],['years','Years']]; }
  unitOptions(selected, allowed=null) {
    const units = allowed || this.intervalUnits();
    return units.map(([v,l]) => `<option value="${v}" ${selected===v?'selected':''}>${l}</option>`).join('');
  }
  intervalFromRule(rule, defaultValue, defaultUnit) {
    if (!rule) return {value: defaultValue, unit: defaultUnit};
    if (rule.value !== undefined || rule.unit !== undefined) return {value: Number(rule.value ?? defaultValue), unit: rule.unit || defaultUnit};
    for (const key of ['minutes','hours','days','weeks','months','years']) if (rule[key] !== undefined) return {value: Number(rule[key] || defaultValue), unit: key};
    return {value: defaultValue, unit: defaultUnit};
  }

  monthOptions(selected) {
    return Array.from({length:12},(_,i)=>`<option value="${i+1}" ${String(selected)===String(i+1)?'selected':''}>${new Date(2020,i,1).toLocaleString(undefined,{month:'long'})}</option>`).join('');
  }

  seasonalPreset(season) {
    const presets = {spring:[3,1,5,31], summer:[6,1,8,31], fall:[9,1,11,30], winter:[12,1,2,28]};
    return presets[String(season || '').toLowerCase()] || null;
  }
  intervalToDays(value, unit) {
    const n = Number(value || 0);
    const u = String(unit || 'days');
    if (u === 'minutes') return n / 1440;
    if (u === 'hours') return n / 24;
    if (u === 'weeks') return n * 7;
    if (u === 'months') return n * 30.4375;
    if (u === 'years') return n * 365.25;
    return n;
  }
  intervalToHours(value, unit) {
    const n = Number(value || 0);
    const u = String(unit || 'hours');
    if (u === 'minutes') return n / 60;
    if (u === 'days') return n * 24;
    if (u === 'weeks') return n * 24 * 7;
    if (u === 'months') return n * 24 * 30.4375;
    if (u === 'years') return n * 24 * 365.25;
    return n;
  }
  subtractIntervalFromNow(value, unit) {
    const d = new Date();
    const n = Number(value || 0);
    const u = String(unit || 'days');
    if (u === 'minutes') d.setMinutes(d.getMinutes() - n);
    else if (u === 'hours') d.setHours(d.getHours() - n);
    else if (u === 'days') d.setDate(d.getDate() - n);
    else if (u === 'weeks') d.setDate(d.getDate() - n * 7);
    else if (u === 'months') d.setMonth(d.getMonth() - n);
    else if (u === 'years') d.setFullYear(d.getFullYear() - n);
    return d.toISOString();
  }
  isoForDatetimeLocal(value) {
    if (!value) return new Date().toISOString();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  localDatetimeValue(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  weekdayOptions(selected=1) {
    return [['0','Monday'],['1','Tuesday'],['2','Wednesday'],['3','Thursday'],['4','Friday'],['5','Saturday'],['6','Sunday']].map(([v,l])=>`<option value="${v}" ${String(selected)===v?'selected':''}>${l}</option>`).join('');
  }

  categories() {
    const builtIn = ["General","HVAC","Pool","Hot Tub","Water Filtration","Appliance","Plumbing","Electrical","Yard","Vehicle","3D Printer","Seasonal","Safety","Other"];
    const seen = new Set(builtIn);
    for (const task of this.tasks) if (task.category && !seen.has(task.category)) seen.add(task.category);
    return Array.from(seen);
  }

  categoryStats(category) {
    const tasks = this.tasks.filter(t => this.category(t) === category);
    const due = tasks.filter(t => ["due","overdue"].includes(this.taskStatus(t))).length;
    const upcoming = tasks.filter(t => this.taskStatus(t) === "upcoming").length;
    const ok = tasks.filter(t => this.taskStatus(t) === "ok").length;
    const score = tasks.length ? Math.max(0, Math.round(100 - due * 25 - upcoming * 8)) : 100;
    return { tasks, due, upcoming, ok, score };
  }

  healthScore() {
    if (!this.tasks.length) return 100;
    const overdue = this.tasks.filter(t => ["due", "overdue"].includes(this.taskStatus(t))).length;
    const upcoming = this.tasks.filter(t => this.taskStatus(t) === "upcoming").length;
    return Math.max(0, Math.round(100 - overdue * 25 - upcoming * 8));
  }

  filteredTasks() {
    let tasks = [...this.tasks];
    if (this.categoryFilter !== "All") tasks = tasks.filter(t => this.category(t) === this.categoryFilter);
    tasks = tasks.filter(t => this.statusFilter === "season_paused" || t.summary?.season_active !== false || t.seasonal?.show_when_inactive !== false);
    if (this.statusFilter !== "All") {
      if (this.statusFilter === "needs_attention") tasks = tasks.filter(t => ["due","overdue"].includes(this.taskStatus(t)));
      else tasks = tasks.filter(t => this.taskStatus(t) === this.statusFilter);
    }
    const score = t => ({overdue:5,due:4,upcoming:3,snoozed:2,paused:1,season_paused:1,ok:0}[this.taskStatus(t)] ?? 0);
    if (this.sortMode === "urgent") tasks.sort((a,b) => score(b) - score(a) || this.percent(b) - this.percent(a));
    if (this.sortMode === "category") tasks.sort((a,b) => this.category(a).localeCompare(this.category(b)) || (a.name||"").localeCompare(b.name||""));
    if (this.sortMode === "name") tasks.sort((a,b) => (a.name||"").localeCompare(b.name||""));
    return tasks;
  }

  render() {
    this.shadowRoot.innerHTML = `<style>${this.css()}</style><div class="page">${this.renderBody()}</div>${this.renderModal()}`;
    this.bind();
  }

  renderBody() {
    if (this.loading) return `<div class="card empty">Loading Home Maintenance Manager...</div>`;
    if (this.error) return `<div class="card empty"><h2>Could not load maintenance data</h2><p>${this.escape(this.error)}</p><button class="btn primary" data-action="refresh">Try again</button></div>`;
    return `
      <div class="ha-mobile-appbar" role="navigation" aria-label="Home Assistant navigation">
        <div class="bar-row">
          <button class="ha-icon-button" data-action="ha-menu" title="Open Home Assistant menu" aria-label="Open Home Assistant menu">☰</button>
          <div class="app-title">Maintenance</div>
          <button class="ha-icon-button" data-action="ha-overflow" title="More options" aria-label="More options">⋮</button>
        </div>
        ${this.mobileMenuOpen ? `<div class="ha-menu-popover"><button data-action="ha-back">Back</button><button data-action="ha-home">Home Assistant home</button></div>` : ``}
      </div>
      <div class="hero"><div><h1>Home Maintenance Manager</h1><div class="subtitle">A simple place to see what needs attention around the house.</div></div><button class="btn primary" data-action="new-task">Add maintenance task</button></div>
      <div class="tabs">
        ${[["dashboard","Dashboard"],["tasks","Tasks"],["history","History"],["nfc","NFC Tags"],["notifications","Notifications"],["settings","Settings"]].map(([id,label]) => `<button class="tab ${this.tab===id?'active':''}" data-tab="${id}">${label}</button>`).join("")}
      </div>
      ${this.tab === "dashboard" ? this.renderDashboard() : this.tab === "tasks" ? this.renderTasks() : this.tab === "history" ? this.renderHistory() : this.tab === "nfc" ? this.renderNfc() : this.tab === "notifications" ? this.renderNotifications() : this.renderSettings()}
    `;
  }

  renderDashboard() {
    const due = this.tasks.filter(t => ["due", "overdue"].includes(this.taskStatus(t))).length;
    const upcoming = this.tasks.filter(t => this.taskStatus(t) === "upcoming").length;
    const ok = this.tasks.filter(t => this.taskStatus(t) === "ok").length;
    const activeCategories = this.categories().filter(c => this.tasks.some(t => this.category(t) === c));
    return `
      <div class="grid">
        <div class="card"><div class="muted">Maintenance health</div><div class="metric">${this.healthScore()}%</div><div class="progress"><div class="bar" style="width:${this.healthScore()}%"></div></div><div class="muted">Overall score based on due and upcoming tasks.</div></div>
        <div class="card"><div class="muted">Needs attention</div><div class="metric">${due}</div><div class="muted">Due or overdue tasks</div></div>
        <div class="card"><div class="muted">Coming soon</div><div class="metric">${upcoming}</div><div class="muted">Upcoming tasks</div></div>
        <div class="card"><div class="muted">On track</div><div class="metric">${ok}</div><div class="muted">OK tasks</div></div>
      </div>
      <h2>Categories</h2>
      <div class="grid">${activeCategories.length ? activeCategories.map(c => this.renderCategoryCard(c)).join("") : this.renderEmptyTasks()}</div>
      <h2>Next up</h2>
      <div class="grid">${this.tasks.length ? this.tasks.slice().sort((a,b)=>this.percent(b)-this.percent(a)).slice(0,6).map(t=>this.renderTaskCard(t)).join("") : this.renderEmptyTasks()}</div>`;
  }

  renderCategoryCard(category) {
    const s = this.categoryStats(category);
    return `<div class="card" data-category-card="${this.escape(category)}">
      <div class="task-title">${this.escape(category)}</div>
      <div class="metric">${s.score}%</div>
      <div class="progress"><div class="bar" style="width:${s.score}%"></div></div>
      <div class="muted">${s.tasks.length} task${s.tasks.length === 1 ? "" : "s"} • ${s.due} due • ${s.upcoming} upcoming</div>
      <div class="task-actions"><button class="btn small" data-category-filter="${this.escape(category)}">View ${this.escape(category)}</button></div>
    </div>`;
  }

  renderFilters() {
    const catOptions = ["All", ...this.categories()].map(c => `<option value="${this.escape(c)}" ${this.categoryFilter===c?'selected':''}>${this.escape(c)}</option>`).join("");
    const statusOptions = [["All","All statuses"],["needs_attention","Needs attention"],["upcoming","Upcoming"],["ok","OK"],["snoozed","Snoozed"],["paused","Paused"],["season_paused","Season paused"]].map(([v,l]) => `<option value="${v}" ${this.statusFilter===v?'selected':''}>${l}</option>`).join("");
    return `<div class="card toolbar-card">
      <div class="three">
        <div><label>Filter by category</label><select id="category-filter">${catOptions}</select></div>
        <div><label>Filter by status</label><select id="status-filter">${statusOptions}</select></div>
        <div><label>Sort tasks</label><select id="sort-mode"><option value="urgent" ${this.sortMode==='urgent'?'selected':''}>Most urgent first</option><option value="category" ${this.sortMode==='category'?'selected':''}>Category</option><option value="name" ${this.sortMode==='name'?'selected':''}>Name</option></select></div>
      </div>
      <div class="help">Categories now organize the dashboard, task list, health score, and notification context.</div>
    </div>`;
  }

  renderTasks() {
    const tasks = this.filteredTasks();
    if (!this.tasks.length) return this.renderEmptyTasks();
    if (this.sortMode === "category" || this.categoryFilter === "All") {
      const groups = new Map();
      for (const task of tasks) {
        const c = this.category(task);
        if (!groups.has(c)) groups.set(c, []);
        groups.get(c).push(task);
      }
      return `${this.renderFilters()}${Array.from(groups.entries()).map(([category, group]) => `<div class="category-header"><h2>${this.escape(category)}</h2><span class="muted">${group.length} task${group.length === 1 ? "" : "s"}</span></div><div class="grid">${group.map(t => this.renderTaskCard(t)).join("")}</div>`).join("") || `<div class="card empty">No tasks match the current filters.</div>`}`;
    }
    return `${this.renderFilters()}<div class="grid">${tasks.length ? tasks.map(t => this.renderTaskCard(t)).join("") : `<div class="card empty">No tasks match the current filters.</div>`}</div>`;
  }

  renderEmptyTasks() { return `<div class="card empty"><h2>No maintenance tasks yet</h2><p>Create your first task, like HVAC filter replacement, RO filter replacement, or pool filter cleaning.</p><button class="btn primary" data-action="new-task">Add maintenance task</button></div>`; }

  renderTaskCard(t) {
    const status = this.taskStatus(t);
    const category = this.category(t);
    return `<div class="card">
      <div class="task-title">${this.escape(t.name || t.id)}</div>
      <span class="category-pill">${this.escape(category)}</span>
      <span class="pill ${status}">${this.escape(status)}</span>
      ${t.equipment_name ? `<div class="muted">Equipment: ${this.escape(t.equipment_name)}</div>` : ""}
      <div class="progress"><div class="bar" style="width:${this.percent(t)}%"></div></div>
      <div><b>${this.percent(t)}%</b> used</div>
      <div class="muted">Next due: ${this.dateShort(t.summary?.next_due)}</div>
      <div class="muted">Last completed: ${this.dateShort(t.last_completed || t.summary?.last_completed)}</div>
      <div class="task-actions">
        <button class="btn small primary" data-complete="${this.escape(t.id)}">Mark complete</button>
        <button class="btn small" data-snooze="${this.escape(t.id)}">Snooze 7 days</button>
        <button class="btn small" data-view-task="${this.escape(t.id)}">View</button><button class="btn small" data-edit="${this.escape(t.id)}">Edit</button>
      </div>
    </div>`;
  }

  renderHistory() {
    const items = this.tasks.flatMap(t => (t.activity_history || []).map(i => ({...i, task:t.name, category:this.category(t)}))).sort((a,b)=>String(b.at||"").localeCompare(String(a.at||""))).slice(0,100);
    return `<div class="list">${items.length ? items.map(i => `<div class="card history-item"><b>${this.escape(i.task)}</b> <span class="category-pill">${this.escape(i.category)}</span><div class="muted">${this.escape(i.activity || i.type || 'activity')} • ${this.dateShort(i.at)} ${i.notes ? ' - '+this.escape(i.notes) : ''}</div></div>`).join("") : `<div class="card empty">No maintenance history yet.</div>`}</div>`;
  }

  nfcActionLabel(action) {
    return ({
      complete: 'Complete immediately',
      confirm: 'Ask for confirmation',
      inspection: 'Log inspection only',
      open_dashboard: 'Open task in Maintenance panel',
      disabled: 'Disabled'
    })[action || 'disabled'] || action || 'Disabled';
  }

  taskForTag(tagId) {
    if (!tagId) return null;
    return this.tasks.find(t => (t.nfc_tags || []).includes(tagId)) || null;
  }

  lastNfcScan(t) {
    const scans = (t.activity_history || []).filter(i => i.activity === 'nfc_scanned');
    return scans.length ? scans.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')))[0] : null;
  }

  renderNfc() {
    const assigned = this.tasks.filter(t => (t.nfc_tags || []).length);
    return `<div class="grid">
      <div class="card"><h2>NFC Tags</h2><p class="muted">Registered Home Assistant NFC tags and their Home Maintenance Manager assignments.</p>${this.tags.length ? this.tags.map(tag => {
        const tagId = tag.tag_id || tag.id;
        const task = this.taskForTag(tagId);
        const lastScan = task ? this.lastNfcScan(task) : null;
        return `<div class="tag-row"><div><b>${this.escape(tag.name || tagId)}</b><div class="muted">${this.escape(tagId || '')}</div>${task ? `<div>Assigned to: <b>${this.escape(task.name)}</b></div><div class="muted">Action: ${this.escape(this.nfcActionLabel(task.nfc_action))}${lastScan ? ` • Last scan: ${this.dateShort(lastScan.at)}` : ''}</div>` : `<div class="muted">Not assigned to a maintenance task</div>`}</div>${task ? `<button class="btn small" data-edit="${this.escape(task.id)}">Edit task</button>` : ''}</div>`;
      }).join("") : `<p>No registered NFC tags were found, or this HA version does not expose the tag list to custom panels.</p>`}</div>
      <div class="card"><h2>How NFC works</h2><p>Assign a tag to a maintenance task, then choose what should happen when the tag is scanned.</p><ul><li><b>Ask for confirmation</b>: safest default; creates a confirmation notification.</li><li><b>Complete immediately</b>: resets the task cycle as soon as the tag is scanned.</li><li><b>Log inspection only</b>: records that someone checked the item without resetting due dates.</li><li><b>Open task</b>: sends a notification with a link back to this task in the Maintenance panel.</li></ul><p class="muted">If scanning opens Home Assistant, that is normal. HMM handles the HA <code>tag_scanned</code> event in the background. Confirmation scans can also send mobile action buttons when a mobile notify target is configured.</p></div>
      <div class="card"><h2>Assigned tasks</h2>${assigned.length ? assigned.map(t => `<div class="tag-row"><div><b>${this.escape(t.name)}</b><div class="muted">${this.escape((t.nfc_tags || []).join(', '))}</div><div>Action: ${this.escape(this.nfcActionLabel(t.nfc_action))}</div></div><button class="btn small" data-view-task="${this.escape(t.id)}">View</button><button class="btn small" data-edit="${this.escape(t.id)}">Edit</button></div>`).join('') : `<p>No maintenance tasks have NFC tags assigned yet.</p>`}</div>
    </div>`;
  }

  renderNotifications() {
    const n = this.notificationSettings || {};
    const modeOptions = [["none","No built-in notifications"],["persistent","Home Assistant persistent notifications"],["mobile","Mobile app notifications"],["both","Persistent + mobile"],["automation_only","Automation only"]].map(([v,l])=>`<option value="${v}" ${n.default_mode===v?'selected':''}>${l}</option>`).join("");
    const repeatOptions = [["once","Notify once"],["daily","Daily while overdue"],["custom","Every X days while overdue"]].map(([v,l])=>`<option value="${v}" ${n.repeat_mode===v?'selected':''}>${l}</option>`).join("");
    const mobileOptions = this.metadata.notify_services.map(s=>`<option value="${this.escape(s.value)}" ${(n.mobile_notify_services||[]).includes(s.value)?'selected':''}>${this.escape(s.label)}</option>`).join("");
    return `<div class="grid"><div class="card"><h2>Notifications</h2><p class="muted">Configure household defaults once. Individual tasks can use these defaults, disable notifications, or override them only when needed.</p>
      <label><input id="notify-enabled" type="checkbox" ${n.enabled!==false?'checked':''} style="width:auto"> Enable built-in notifications</label>
      <div class="two">
        <div><label>${this.label('Default notification method','Used by tasks set to Use global default.')}</label><select id="global-notify-mode">${modeOptions}</select></div>
        <div><label>${this.label('Mobile notification targets','Select one or more mobile notify services. Hold Ctrl/Cmd to select multiple if your browser requires it.')}</label><select id="global-mobile-targets" multiple size="5">${mobileOptions}</select><div class="help">Discovered from Home Assistant notify services.</div></div>
      </div>
      <h3>Notify when</h3>
      <div class="two">
        <label><input id="notify-upcoming" type="checkbox" ${n.notify_upcoming!==false?'checked':''} style="width:auto"> Upcoming</label>
        <label><input id="notify-due" type="checkbox" ${n.notify_due!==false?'checked':''} style="width:auto"> Due</label>
        <label><input id="notify-overdue" type="checkbox" ${n.notify_overdue!==false?'checked':''} style="width:auto"> Overdue</label>
        <label><input id="notify-completed" type="checkbox" ${n.notify_completed?'checked':''} style="width:auto"> Completed</label>
        <label><input id="notify-snoozed" type="checkbox" ${n.notify_snoozed?'checked':''} style="width:auto"> Snoozed</label>
      </div>
      <div class="two">
        <div><label>${this.label('Repeat overdue reminders','Controls repeated reminders after a task becomes overdue.')}</label><select id="global-repeat-mode">${repeatOptions}</select></div>
        <div><label>${this.label('Repeat every X days','Used when repeat mode is Every X days.')}</label><input id="global-repeat-days" type="number" min="1" value="${Number(n.repeat_days||1)}"></div>
      </div>
      <div class="two">
        <div><label>${this.label('Quiet hours start','Optional local time. Leave blank to disable quiet hours.')}</label><input id="quiet-start" type="time" value="${this.escape(n.quiet_start || '')}"></div>
        <div><label>${this.label('Quiet hours end','Optional local time. Notifications are held during quiet hours in a future notification engine update.')}</label><input id="quiet-end" type="time" value="${this.escape(n.quiet_end || '')}"></div>
      </div>
      <label>${this.label('Notification title template','Available placeholders: {category}, {task_name}, {status}.')}</label><input id="notify-title-template" value="${this.escape(n.title_template || '[{category}] {task_name}')}" data-preview-title>
      <label>${this.label('Notification body template','Available placeholders: {category}, {task_name}, {status}, {days_remaining}.')}</label><textarea id="notify-body-template" data-preview-body>${this.escape(n.body_template || '{task_name} is {status}.')}</textarea>
      <div class="info-box"><b>Preview</b><br><span id="notification-preview-title">${this.escape(this.previewNotificationTitle())}</span><br><span class="muted" id="notification-preview-body">${this.escape(this.previewNotificationBody())}</span></div>
      <div class="task-actions"><button class="btn primary" data-action="save-notification-settings">Save notification settings</button><button class="btn" data-action="test-notification">Test notification</button><button class="btn" data-action="refresh">Refresh data</button></div>
    </div><div class="card"><h2>How notification testing works</h2><p>The test uses the settings currently shown on this page. Save first if you want these settings stored permanently.</p><p class="muted">Persistent notifications appear in Home Assistant. Mobile notifications use the selected notify services.</p><p><b>Notify services found:</b> ${this.metadata.notify_services.length}</p></div></div>`;
  }

  renderSettings() {
    return `<div class="grid"><div class="card"><h2>Settings</h2><p class="muted">General Home Maintenance Manager information and lookups.</p><p>Notification settings have moved to the <b>Notifications</b> tab.</p></div><div class="card"><h2>Lookups</h2><p>Areas: ${this.metadata.areas.length}</p><p>Devices: ${this.metadata.devices.length}</p><p>Entities: ${this.metadata.entities.length}</p><p>Notify services: ${this.metadata.notify_services.length}</p><p>NFC tags: ${this.tags.length}</p><p>Categories: ${this.categories().length}</p></div></div>`;
  }

  previewNotificationTitle() {
    const template = this.shadowRoot?.getElementById('notify-title-template')?.value || this.notificationSettings?.title_template || '[{category}] {task_name}';
    return template.replaceAll('{category}', 'Water Filtration').replaceAll('{task_name}', 'RO Filter Replacement').replaceAll('{status}', 'Due').replaceAll('{days_remaining}', '0');
  }

  previewNotificationBody() {
    const template = this.shadowRoot?.getElementById('notify-body-template')?.value || this.notificationSettings?.body_template || '{task_name} is {status}.';
    return template.replaceAll('{category}', 'Water Filtration').replaceAll('{task_name}', 'RO Filter Replacement').replaceAll('{status}', 'Due').replaceAll('{days_remaining}', '0');
  }



  routeTaskIdFromUrl() {
    try {
      const url = new URL(window.location.href);
      const directTask = url.searchParams.get('task') || url.searchParams.get('task_id');
      if (directTask) return decodeURIComponent(directTask);

      // Home Assistant custom panels and mobile deep links may preserve the
      // destination in the hash instead of the query string. Accept a few
      // forms so old and new NFC links both work:
      //   /home-maintenance-manager?task=<id>
      //   /home-maintenance-manager#task=<id>
      //   /home-maintenance-manager#/task/<id>
      const hash = (url.hash || '').replace(/^#\/?/, '');
      if (!hash) return null;
      const hashParams = new URLSearchParams(hash.includes('?') ? hash.split('?').pop() : hash);
      const hashTask = hashParams.get('task') || hashParams.get('task_id');
      if (hashTask) return decodeURIComponent(hashTask);
      const match = hash.match(/(?:^|\/)task\/([^/?#]+)/);
      return match ? decodeURIComponent(match[1]) : null;
    } catch (err) {
      return null;
    }
  }

  applyRouteTask() {
    try {
      const taskId = this.routeTaskIdFromUrl();
      if (!taskId) return;
      const task = this.tasks.find(t => t.id === taskId);
      if (!task) return;
      const currentId = this.modal?.detail?.id || null;
      if (currentId === taskId) return;
      this.tab = 'tasks';
      this.mobileMenuOpen = false;
      this._routeTaskId = taskId;
      this.modal = { detail: JSON.parse(JSON.stringify(task)) };
    } catch (err) {
      // Route parsing is best-effort for custom panel deep links.
    }
  }

  handleRouteChanged() {
    const before = this.modal?.detail?.id || null;
    this.applyRouteTask();
    const after = this.modal?.detail?.id || null;
    if (after && after !== before) this.render();
  }

  openTaskDetail(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;
    this._modalSnapshot = null;
    this.mobileMenuOpen = false;
    this.modal = { detail: JSON.parse(JSON.stringify(task)) };
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('task', taskId);
      url.hash = `task=${encodeURIComponent(taskId)}`;
      window.history.replaceState({}, '', url.toString());
    } catch (err) {}
    this.render();
  }

  closeTaskDetail() {
    this.modal = null;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('task');
      url.searchParams.delete('task_id');
      if ((url.hash || '').includes('task')) url.hash = '';
      this._routeTaskId = null;
      window.history.replaceState({}, '', url.toString());
    } catch (err) {}
    this.render();
  }

  openHaMenu() {
    this.mobileMenuOpen = false;
    this.render();
    // Match Home Assistant's native sidebar toggle behavior. Dispatch from this
    // custom panel so the event can bubble through HA's shadow DOM boundary.
    this.dispatchEvent(new CustomEvent('hass-toggle-menu', { bubbles: true, composed: true }));
    // Fallbacks for HA frontend versions / Companion App webviews that listen
    // higher in the tree.
    document.dispatchEvent(new CustomEvent('hass-toggle-menu', { bubbles: true, composed: true }));
    window.dispatchEvent(new CustomEvent('hass-toggle-menu', { bubbles: true, composed: true }));
  }

  navigateBackToHa() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    this.navigateHomeAssistant();
  }

  navigateHomeAssistant() {
    // Custom sidebar panels can take the whole screen in the iOS Companion App.
    // Provide an explicit route back to HA's normal dashboard so users are never trapped.
    history.pushState(null, '', '/');
    window.dispatchEvent(new CustomEvent('location-changed'));
  }

  renderTaskDetailModal(t) {
    const status = this.taskStatus(t);
    const scan = this.lastNfcScan(t);
    const recent = (t.activity_history || []).slice().sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))).slice(0,8);
    const progress = t.summary || {};
    return `<div class="modal-scrim" data-action="detail-scrim"><div class="modal" data-modal-content>
      <div class="modal-head"><div><h2>${this.escape(t.name || t.id)}</h2><div class="muted">Task details, NFC status, and quick actions.</div></div><button class="btn" data-action="close-detail">Close</button></div>
      <div class="form-section">
        <h3>Overview</h3>
        <div class="detail-list">
          <div class="key">Status</div><div><span class="pill ${status}">${this.escape(status)}</span></div>
          <div class="key">Category</div><div>${this.escape(this.category(t))}</div>
          <div class="key">Equipment</div><div>${this.escape(t.equipment_name || 'Not specified')}</div>
          <div class="key">Percent used</div><div>${this.percent(t)}%</div>
          <div class="key">Next due</div><div>${this.dateShort(progress.next_due)}</div>
          <div class="key">Last completed</div><div>${this.dateShort(t.last_completed || progress.last_completed)}</div>
          <div class="key">NFC action</div><div>${this.escape(this.nfcActionLabel(t.nfc_action))}</div>
          <div class="key">Last NFC scan</div><div>${scan ? `${this.dateShort(scan.at)}${scan.scanner_name ? ' by '+this.escape(scan.scanner_name) : ''}` : 'Never'}</div>
        </div>
        <div class="progress"><div class="bar" style="width:${this.percent(t)}%"></div></div>
        <div class="task-actions">
          <button class="btn primary" data-complete="${this.escape(t.id)}">Mark complete</button>
          <button class="btn" data-snooze="${this.escape(t.id)}">Snooze 7 days</button>
          <button class="btn" data-edit-from-detail="${this.escape(t.id)}">Edit task</button>
        </div>
      </div>
      ${t.instructions ? `<div class="form-section"><h3>Instructions</h3><div style="white-space:pre-wrap">${this.escape(t.instructions)}</div></div>` : ''}
      <div class="form-section"><h3>Recent activity</h3>${recent.length ? recent.map(i=>`<div class="history-item"><b>${this.escape(i.activity || i.type || 'activity')}</b><div class="muted">${this.dateShort(i.at)}${i.scanner_name ? ' • '+this.escape(i.scanner_name) : ''}${i.notes ? ' - '+this.escape(i.notes) : ''}</div></div>`).join('') : '<p class="muted">No activity yet.</p>'}</div>
      <div class="modal-actions-bottom"><button class="btn" data-action="close-detail">Close</button><div class="right"><button class="btn primary" data-complete="${this.escape(t.id)}">Mark complete</button></div></div>
    </div></div>`;
  }

  renderModal() {
    if (!this.modal) return "";
    if (this.modal.detail) return this.renderTaskDetailModal(this.modal.detail);
    const t = this.modal.task || {};
    const isEdit = !!t.id;
    const areaOptions = [`<option value="">No area / choose later</option>`, ...this.metadata.areas.map(a=>`<option value="${this.escape(a.id)}" ${t.area===a.id?'selected':''}>${this.escape(a.name)}</option>`)].join("");
    const deviceOptions = [`<option value="">No specific device</option>`, ...this.metadata.devices.sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(d=>`<option value="${this.escape(d.id)}" ${t.linked_device_id===d.id?'selected':''}>${this.escape(d.name || d.id)}</option>`)].join("");
    const selectedNotify = t.notification_mode || 'global';
    const notifyBehavior = ["global","disabled","custom"].includes(selectedNotify) ? selectedNotify : (selectedNotify === "none" ? "disabled" : "custom");
    const customNotifyMode = ["persistent","mobile","both","automation_only"].includes(selectedNotify) ? selectedNotify : "persistent";
    const notifyBehaviorOptions = [["global","Use global notification settings"],["disabled","Disable notifications for this task"],["custom","Override for this task"]].map(([v,l])=>`<option value="${v}" ${notifyBehavior===v?'selected':''}>${l}</option>`).join("");
    const notifyOptions = [["persistent","Home Assistant persistent notification"],["mobile","Mobile app notification"],["both","Home Assistant + mobile app"],["automation_only","Automation only"]].map(([v,l])=>`<option value="${v}" ${customNotifyMode===v?'selected':''}>${l}</option>`).join("");
    const mobileOptions = [`<option value="">Use global mobile target(s)</option>`, ...this.metadata.notify_services.map(s=>`<option value="${this.escape(s.value)}" ${t.mobile_notify_service===s.value?'selected':''}>${this.escape(s.label)}</option>`)].join("");
    const tagOptions = [`<option value="">No NFC tag</option>`, ...this.tags.map(tag=>`<option value="${this.escape(tag.tag_id || tag.id)}" ${(t.nfc_tags||[])[0]===(tag.tag_id||tag.id)?'selected':''}>${this.escape(tag.name || tag.tag_id || tag.id)}</option>`)].join("");
    const nfcAction = t.nfc_action || ((t.nfc_tags||[]).length ? 'confirm' : 'disabled');
    const nfcActionOptions = [["confirm","Ask for confirmation"],["complete","Complete immediately"],["inspection","Log inspection only"],["open_dashboard","Open task in Maintenance panel"],["disabled","Disabled"]].map(([v,l])=>`<option value="${v}" ${nfcAction===v?'selected':''}>${l}</option>`).join('');
    const runtimeRule = (t.rules||[]).find(r=>r.type==='runtime') || {};
    const runtimeMethod = runtimeRule.above !== undefined ? 'above_threshold' : runtimeRule.states ? 'specific_state' : 'entity_on';
    const runtimeStateText = Array.isArray(runtimeRule.states) ? runtimeRule.states.join(', ') : 'running,on,heating,cooling';
    const counterRule = (t.rules||[]).find(r=>r.type==='counter') || {};
    const timeRule = (t.rules||[]).find(r=>r.type==='time') || {value:90, unit:'days'};
    const calendarRule = (t.rules||[]).find(r=>r.type==='calendar') || {};
    const timeInterval = this.intervalFromRule(timeRule, 90, 'days');
    const runtimeInterval = this.intervalFromRule(runtimeRule, 100, 'hours');
    const hasTimeRule = !!(timeRule.days || timeRule.value);
    const hasRuntimeRule = !!runtimeRule.entity;
    const hasCounterRule = !!counterRule.entity;
    const hasCalendarRule = !!calendarRule.id || calendarRule.type === 'calendar';
    let scheduleValue = 'time';
    if (hasTimeRule && hasRuntimeRule) scheduleValue = t.rule_logic === 'all' ? 'time_and_runtime' : 'time_or_runtime';
    else if (hasTimeRule && hasCounterRule) scheduleValue = t.rule_logic === 'all' ? 'time_and_meter' : 'time_or_meter';
    else if (hasRuntimeRule) scheduleValue = 'runtime';
    else if (hasCounterRule) scheduleValue = 'meter';
    else if (hasCalendarRule) scheduleValue = 'calendar';
    const counterSourceMode = counterRule.source_mode || 'cumulative';
    const sourceUnit = counterRule.source_unit || (counterRule.entity && this._hass?.states?.[counterRule.entity]?.attributes?.unit_of_measurement) || '';
    const counterUnit = counterRule.target_unit || counterRule.unit || (counterSourceMode === 'rate' ? this.totalizedTargetUnit(sourceUnit) : sourceUnit) || 'units';
    const categoryOptions = this.categories().map(c=>`<option value="${this.escape(c)}" ${this.category(t)===c?'selected':''}>${this.escape(c)}</option>`).join('');
    const calKind = calendarRule.calendar_kind || calendarRule.calendar_type || 'nth_weekday';
    const calNth = String(calendarRule.nth ?? 2);
    const calWeekday = String(calendarRule.weekday ?? 1);
    const calMonth = String(calendarRule.month ?? '');
    const calDay = String(calendarRule.day ?? 1);
    const calTime = `${String(calendarRule.hour ?? 9).padStart(2,'0')}:${String(calendarRule.minute ?? 0).padStart(2,'0')}`;
    const baselineMode = t.baseline_method || 'today';
    const seasonal = t.seasonal || {};
    const seasonalEnabled = !!seasonal.enabled;
    const seasonalSeason = seasonal.season || 'custom';
    const preset = this.seasonalPreset(seasonalSeason);
    const seasonalStartMonth = seasonal.start_month || preset?.[0] || 5;
    const seasonalStartDay = seasonal.start_day || preset?.[1] || 1;
    const seasonalEndMonth = seasonal.end_month || preset?.[2] || 9;
    const seasonalEndDay = seasonal.end_day || preset?.[3] || 30;
    const seasonalShowInactive = seasonal.show_when_inactive !== false;
    const seasonalPauseUsage = seasonal.pause_usage_when_inactive !== false;

    return `<div class="modal-scrim" data-action="modal-scrim"><div class="modal" data-modal-content>
      <div class="modal-head"><div><h2>${isEdit ? 'Edit maintenance task' : 'Add maintenance task'}</h2><div class="muted">This one-page setup is grouped into sections. Start simple; advanced fields can be left blank.</div></div><button class="btn" data-action="close-modal">Close</button></div>

      <div class="form-section">
        <h3>1. Task basics</h3><p class="section-note">Name the maintenance item in plain language and choose a category so dashboards and reports can group it.</p>
        <div class="two">
          <div><label>${this.label('Task name','The friendly name shown on dashboards and in notifications. Example: HVAC Filter Replacement.')}</label><div class="help">Example: HVAC filter replacement</div><input id="task-name" value="${this.escape(t.name || '')}"><div id="err-name" class="field-error">Please enter a task name.</div></div>
          <div><label>${this.label('Maintenance category','Optional. Used to group dashboard cards, filter tasks, calculate category health, and add context to notifications.')}</label><select id="task-category">${categoryOptions}</select></div>
        </div>
        <label>${this.label('Description','Optional short description for the task card and future reference.')}</label><textarea id="task-description" placeholder="Optional: what this task covers and why it matters.">${this.escape(t.description || '')}</textarea>
      </div>

      <div class="form-section">
        <h3>2. What is being maintained?</h3><p class="section-note">Choose where this work happens. A Home Assistant device is optional; use Equipment name for offline items like RO filters or smoke detectors.</p>
        <div class="two">
          <div><label>${this.label('Area','Choose the Home Assistant area where the maintenance happens, such as Garage or Pool House.')}</label><select id="task-area">${areaOptions}</select></div>
          <div><label>${this.label('Equipment in Home Assistant (optional)','Select a Home Assistant device only if one exists. Leave this blank for offline equipment like an RO water filter.')}</label><select id="task-device">${deviceOptions}</select></div>
        </div>
        <label>${this.label('Equipment name','Use this for real-world equipment even when there is no Home Assistant device, such as RO Water Filter or Garage Door Springs.')}</label><input id="task-equipment-name" placeholder="Example: RO water filter" value="${this.escape(t.equipment_name || '')}">
        <div class="info-box">You do not need a Home Assistant device or entity for simple time-based maintenance. For example, an RO filter can be tracked every 6 months with only a name and schedule.</div>
        <div class="conditional usage-fields"><label>${this.label('Data sources (optional)','Home Assistant entities related to this task. For usage-based tasks, these can be sensors, switches, or binary sensors used to track runtime or context.')}</label><div class="help">Use the searchable Home Assistant entity picker. You can select multiple entities.</div><ha-selector id="task-entities"></ha-selector></div>
      </div>

      <div class="form-section">
        <h3>3. Maintenance schedule</h3><p class="section-note">Choose when the task becomes due. Runtime counts hours while something is running. Metered usage counts a sensor value like gallons, kWh, miles, grams, or cycles.</p>
        <div class="two">
          <div><label>${this.label('Schedule type','Choose time, runtime hours, metered usage, or a combination. Runtime is duration. Metered usage uses the source entity unit.')}</label><select id="task-schedule">
            <option value="time" ${scheduleValue==='time'?'selected':''}>Time interval</option>
            <option value="runtime" ${scheduleValue==='runtime'?'selected':''}>Runtime hours</option>
            <option value="meter" ${scheduleValue==='meter'?'selected':''}>Metered usage</option>
            <option value="calendar" ${scheduleValue==='calendar'?'selected':''}>Calendar schedule</option>
            <option value="time_or_runtime" ${scheduleValue==='time_or_runtime'?'selected':''}>Time or runtime, whichever comes first</option>
            <option value="time_and_runtime" ${scheduleValue==='time_and_runtime'?'selected':''}>Time and runtime</option>
            <option value="time_or_meter" ${scheduleValue==='time_or_meter'?'selected':''}>Time or metered usage, whichever comes first</option>
            <option value="time_and_meter" ${scheduleValue==='time_and_meter'?'selected':''}>Time and metered usage</option>
          </select></div>
          <div class="conditional time-fields"><label>${this.label('Time interval','For time-based rules, the task becomes due after this interval from the last completion.')}</label><div class="inline-fields"><input id="task-time-value" type="number" min="0.01" step="0.01" value="${this.escape(timeInterval.value)}"><select id="task-time-unit">${this.unitOptions(timeInterval.unit)}</select></div><div id="err-days" class="field-error">Enter a valid time interval.</div></div>
        </div>
        <div class="two">
          <div class="conditional runtime-fields"><label>${this.label('Runtime tracking source','Choose the entity used to decide when equipment is running. Switches and binary sensors are easiest. Numeric sensors like W or RPM can use a threshold.')}</label><div class="help">Runtime always counts time. A watts sensor usually means “hours above X watts,” not “watts used.”</div><ha-entity-picker id="task-runtime-entity" allow-custom-entity></ha-entity-picker><div id="runtime-source-hint" class="help"></div><div id="err-runtime-entity" class="field-error">Choose a runtime source for runtime-based tasks.</div></div>
          <div class="conditional runtime-fields"><label>${this.label('Counts as running when','Choose how Home Maintenance Manager should interpret the selected source entity.')}</label><select id="task-runtime-method"><option value="entity_on" ${runtimeMethod==='entity_on'?'selected':''}>Entity is ON</option><option value="above_threshold" ${runtimeMethod==='above_threshold'?'selected':''}>Numeric value is above threshold</option><option value="specific_state" ${runtimeMethod==='specific_state'?'selected':''}>Entity is in specific state(s)</option></select><div id="runtime-method-hint" class="help"></div></div>
        </div>
        <div class="two conditional runtime-fields">
          <div><label>${this.label('Runtime interval','The task becomes due after this amount of accumulated runtime since the last completion.')}</label><div class="inline-fields"><input id="task-runtime-value" type="number" min="0.01" step="0.01" value="${this.escape(runtimeInterval.value)}"><select id="task-runtime-interval-unit">${this.unitOptions(runtimeInterval.unit)}</select></div><div class="help">Runtime counts only while the selected running condition is true.</div><div id="err-runtime-hours" class="field-error">Enter valid runtime interval.</div></div>
          <div class="conditional threshold-fields"><label>${this.label('Running threshold','For numeric sensors, count runtime while the value is above this threshold. Example: power > 25 W means equipment is running.')}</label><input id="task-runtime-threshold" type="number" step="0.1" value="${runtimeRule.above ?? ''}" placeholder="Example: 25"><div id="err-runtime-threshold" class="field-error">Enter a valid threshold.</div></div>
          <div class="conditional state-fields"><label>${this.label('Running states','Comma-separated states that mean the equipment is running. Example: running, heating, cooling.')}</label><input id="task-runtime-states" value="${this.escape(runtimeStateText)}"><div class="help">State matching is exact and case-sensitive to Home Assistant state values.</div></div>
        </div>
        <div class="conditional calendar-fields">
          <h4>Calendar schedule</h4>
          <p class="section-note">Use this for tasks due on a calendar pattern, such as every 2nd Tuesday of the month.</p>
          <div class="two">
            <div><label>${this.label('Calendar pattern','Choose a monthly weekday pattern or a specific month/day.')}</label><select id="task-calendar-kind"><option value="nth_weekday" ${calKind==='nth_weekday'?'selected':''}>Monthly weekday pattern</option><option value="month_day" ${calKind==='month_day'?'selected':''}>Specific month/day</option></select></div>
            <div><label>${this.label('Due time','The time of day the calendar task becomes due.')}</label><input id="task-calendar-time" type="time" value="${this.escape(calTime)}"></div>
          </div>
          <div class="two calendar-nth-fields">
            <div><label>${this.label('Which week?','Example: 2nd Tuesday means choose 2nd and Tuesday.')}</label><select id="task-calendar-nth"><option value="1" ${calNth==='1'?'selected':''}>1st</option><option value="2" ${calNth==='2'?'selected':''}>2nd</option><option value="3" ${calNth==='3'?'selected':''}>3rd</option><option value="4" ${calNth==='4'?'selected':''}>4th</option><option value="-1" ${calNth==='-1'?'selected':''}>Last</option></select></div>
            <div><label>${this.label('Weekday','The weekday for the calendar schedule.')}</label><select id="task-calendar-weekday">${this.weekdayOptions(calWeekday)}</select></div>
          </div>
          <div class="two calendar-month-day-fields">
            <div><label>${this.label('Month','Leave blank for every month, or choose a month for annual tasks.')}</label><select id="task-calendar-month"><option value="" ${!calMonth?'selected':''}>Every month</option>${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${calMonth===String(i+1)?'selected':''}>${new Date(2020,i,1).toLocaleString(undefined,{month:'long'})}</option>`).join('')}</select></div>
            <div><label>${this.label('Day of month','If the day does not exist in a month, the last day of that month is used.')}</label><input id="task-calendar-day" type="number" min="1" max="31" value="${this.escape(calDay)}"></div>
          </div>
        </div>
        <div class="seasonal-box">
          <h4>Seasonal active window</h4>
          <p class="section-note">Optional. Use this when the same time, runtime, metered, or calendar rule should only be active during part of the year.</p>
          <label class="check-row"><input id="task-seasonal-enabled" type="checkbox" ${seasonalEnabled?'checked':''}> Only active during a season/window</label>
          <div class="conditional seasonal-fields">
            <div class="two">
              <div><label>${this.label('Season preset','Choose a preset or Custom for exact start/end dates.')}</label><select id="task-seasonal-season"><option value="custom" ${seasonalSeason==='custom'?'selected':''}>Custom window</option><option value="spring" ${seasonalSeason==='spring'?'selected':''}>Spring (Mar 1–May 31)</option><option value="summer" ${seasonalSeason==='summer'?'selected':''}>Summer (Jun 1–Aug 31)</option><option value="fall" ${seasonalSeason==='fall'?'selected':''}>Fall (Sep 1–Nov 30)</option><option value="winter" ${seasonalSeason==='winter'?'selected':''}>Winter (Dec 1–Feb 28)</option></select></div>
              <div><label>${this.label('Inactive display','Choose whether paused seasonal tasks stay visible on dashboards.')}</label><label class="check-row"><input id="task-seasonal-show-inactive" type="checkbox" ${seasonalShowInactive?'checked':''}> Show when inactive</label></div>
            </div>
            <div class="two seasonal-custom-fields">
              <div><label>Start date</label><div class="inline-fields"><select id="task-seasonal-start-month">${this.monthOptions(seasonalStartMonth)}</select><input id="task-seasonal-start-day" type="number" min="1" max="31" value="${this.escape(seasonalStartDay)}"></div></div>
              <div><label>End date</label><div class="inline-fields"><select id="task-seasonal-end-month">${this.monthOptions(seasonalEndMonth)}</select><input id="task-seasonal-end-day" type="number" min="1" max="31" value="${this.escape(seasonalEndDay)}"></div></div>
            </div>
            <label class="check-row"><input id="task-seasonal-pause-usage" type="checkbox" ${seasonalPauseUsage?'checked':''}> Pause runtime and rate-meter accumulation while inactive</label>
            <div class="info-box">Outside the active window, status becomes Season Paused and due/upcoming notifications are held. When the window opens, the normal schedule logic resumes.</div>
          </div>
        </div>
        <div class="conditional runtime-fields analysis-box">
          <div><b>Threshold helper</b></div>
          <div class="help">For numeric sensors, analyze recent history to estimate OFF and RUNNING ranges and recommend a starting threshold.</div>
          <div class="analysis-controls">
            <div><label>${this.label('How far back to analyze','Longer periods are better for equipment that runs on schedules. Last 30 days is a good default.')}</label><select id="analysis-days"><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option></select></div>
            <div class="task-actions"><button class="btn small" type="button" data-action="analyze-runtime">Analyze source</button><button class="btn small" type="button" data-action="use-threshold">Use recommended threshold</button></div>
          </div>
          <div id="runtime-analysis">${this.renderRuntimeAnalysis()}</div>
        </div>
        <div class="two">
          <div class="conditional meter-fields"><label>${this.label('Metered usage source','Choose either a cumulative meter, like total gallons/kWh/miles, or a rate sensor like gal/min that HMM can totalize.')}</label><div class="help">If this sensor is a rate, Home Maintenance Manager can create its own internal totalizer.</div><ha-entity-picker id="task-meter-entity" allow-custom-entity></ha-entity-picker><div id="meter-source-hint" class="help"></div><div id="err-meter-entity" class="field-error">Choose a metered usage source.</div></div>
          <div class="conditional meter-fields"><label>${this.label('Meter source type','Cumulative meters already contain a total. Rate sensors such as gal/min must be totalized over time.')}</label><select id="task-meter-source-type"><option value="cumulative" ${counterSourceMode!=='rate'?'selected':''}>Cumulative meter - already total</option><option value="rate" ${counterSourceMode==='rate'?'selected':''}>Rate sensor - let HMM totalize it</option></select><div id="meter-type-hint" class="help"></div></div>
        </div>
        <div class="two">
          <div class="conditional meter-fields"><label>${this.label('Usage amount','The task becomes due after this amount of totalized usage since the last completion.')}</label><input id="task-meter-amount" type="number" min="0.1" step="0.1" value="${counterRule.amount || 1000}"><div class="help">Maintenance every: <span id="task-meter-unit">${this.escape(counterUnit)}</span></div><div id="err-meter-amount" class="field-error">Enter a valid usage amount.</div></div>
          <div class="conditional meter-fields"><div class="info-box" id="meter-explain-box">Metered usage uses a baseline at task creation/completion. HMM subtracts that baseline from the current total to calculate usage used.</div></div>
        </div>
        <div class="baseline-box">
          <label>${this.label('When was it last done?','Sets the starting point for the first due date. You can enter an exact completion date/time or how long ago the maintenance was done.')}</label>
          <select id="task-baseline"><option value="today" ${baselineMode==='today'?'selected':''}>Today / now</option><option value="specific" ${baselineMode==='specific'?'selected':''}>Specific date and time</option><option value="ago" ${baselineMode==='ago'?'selected':''}>A certain time ago</option><option value="unknown" ${baselineMode==='unknown'?'selected':''}>Unknown / start today</option></select>
          <div class="two conditional baseline-specific-fields"><div><label>${this.label('Last completed date/time','The exact date and time this task was last completed.')}</label><input id="task-baseline-datetime" type="datetime-local" value="${this.escape(this.localDatetimeValue(t.last_completed))}"></div></div>
          <div class="two conditional baseline-ago-fields"><div><label>${this.label('How long ago?','Example: 6 months ago, 2 weeks ago, or 30 minutes ago.')}</label><div class="inline-fields"><input id="task-baseline-ago-value" type="number" min="0" step="0.01" value="${this.escape(t.baseline_ago_value || 0)}"><select id="task-baseline-ago-unit">${this.unitOptions(t.baseline_ago_unit || 'days')}</select></div></div></div>
        </div>
      </div>

      <div class="form-section">
        <h3>4. Reminders and NFC</h3><p class="section-note">Notifications are managed globally in Settings. Most tasks should use the global default. Override only for critical or low-priority tasks.</p>
        <div class="two">
          <div><label>${this.label('Notification behavior','Use global settings for normal tasks. Disable for low-priority tasks. Override for special tasks that need different notification behavior.')}</label><select id="task-notify-behavior">${notifyBehaviorOptions}</select></div>
          <div class="conditional custom-notify-fields"><label>${this.label('Task override method','Only shown when Override for this task is selected.')}</label><select id="task-notify">${notifyOptions}</select></div>
          <div class="conditional custom-notify-fields mobile-fields"><label>${this.label('Task mobile target override','Optional. Leave blank to use the global mobile target(s).')}</label><select id="task-mobile">${mobileOptions}</select></div>
        </div>
        <div class="two">
          <div><label>${this.label('NFC tag','Choose a registered Home Assistant NFC tag. Scanning it can be used to complete, confirm, or log this task.')}</label><select id="task-nfc">${tagOptions}</select></div>
          <div><label>${this.label('When this tag is scanned','Choose the NFC workflow. Ask for confirmation is safest; Complete immediately is fastest for trusted locations.')}</label><select id="task-nfc-action">${nfcActionOptions}</select><div class="help">Scanning a HA NFC tag opens Home Assistant and also fires a tag_scanned event that HMM handles.</div></div>
        </div>
      </div>

      <div class="form-section">
        <h3>5. Instructions</h3><p class="section-note">Optional homeowner-friendly notes. Add the steps someone should follow when doing the task.</p>
        <label>${this.label('Instructions','Optional markdown-style instructions or checklist notes. Example: Turn off power, remove filter, clean, reinstall.')}</label><textarea id="task-instructions" placeholder="1. Turn off equipment\n2. Perform maintenance\n3. Mark complete">${this.escape(t.instructions || '')}</textarea>
      </div>

      <div class="modal-actions-bottom">
        <button class="btn" data-action="close-modal">Close</button>
        <div class="right"><button class="btn primary" data-action="save-task" data-task-id="${this.escape(t.id || '')}">${isEdit ? 'Save changes' : 'Create task'}</button>${isEdit ? `<button class="btn danger" data-delete="${this.escape(t.id)}">Delete</button>` : ''}</div>
      </div>
    </div></div>`;
  }

  bind() {
    this.shadowRoot.querySelectorAll('[data-action="ha-menu"]').forEach(el=>el.onclick=()=>this.openHaMenu());
    this.shadowRoot.querySelectorAll('[data-action="ha-overflow"]').forEach(el=>el.onclick=()=>{ this.mobileMenuOpen = !this.mobileMenuOpen; this.render(); });
    this.shadowRoot.querySelectorAll('[data-action="ha-dashboard"]').forEach(el=>el.onclick=()=>{ this.mobileMenuOpen = false; this.tab = "dashboard"; this.closeTaskDetail(); });
    this.shadowRoot.querySelectorAll('[data-action="ha-back"]').forEach(el=>el.onclick=()=>this.navigateBackToHa());
    this.shadowRoot.querySelectorAll('[data-action="ha-home"]').forEach(el=>el.onclick=()=>this.navigateHomeAssistant());
    this.shadowRoot.querySelectorAll('[data-tab]').forEach(el=>el.onclick=()=>{ this.tab=el.dataset.tab; this.render(); });
    this.shadowRoot.querySelectorAll('[data-action="refresh"]').forEach(el=>el.onclick=()=>this.loadData());
    this.shadowRoot.querySelectorAll('[data-action="save-notification-settings"]').forEach(el=>el.onclick=()=>this.saveNotificationSettings());
    this.shadowRoot.querySelectorAll('[data-action="test-notification"]').forEach(el=>el.onclick=()=>this.testNotification());
    this.shadowRoot.querySelectorAll('[data-preview-title],[data-preview-body]').forEach(el=>el.oninput=()=>this.updateNotificationPreview());
    this.shadowRoot.querySelectorAll('[data-action="new-task"]').forEach(el=>el.onclick=()=>{ this._modalSnapshot=null; this.modal={task:{}}; this.render(); });
    this.shadowRoot.querySelectorAll('[data-action="close-modal"]').forEach(el=>el.onclick=()=>this.requestCloseModal());
    this.shadowRoot.querySelectorAll('[data-action="modal-scrim"]').forEach(el=>el.onclick=(ev)=>{ if (ev.target === el) this.requestCloseModal(); });
    this.shadowRoot.querySelectorAll('[data-action="close-detail"]').forEach(el=>el.onclick=()=>this.closeTaskDetail());
    this.shadowRoot.querySelectorAll('[data-action="detail-scrim"]').forEach(el=>el.onclick=(ev)=>{ if (ev.target === el) this.closeTaskDetail(); });
    this.shadowRoot.querySelectorAll('[data-edit-from-detail]').forEach(el=>el.onclick=()=>{ const task=this.tasks.find(t=>t.id===el.dataset.editFromDetail); this._modalSnapshot=null; this.modal={task:JSON.parse(JSON.stringify(task||{}))}; this.render(); });
    this.shadowRoot.querySelectorAll('[data-complete]').forEach(el=>el.onclick=()=>this.callService('mark_complete',{task_id:el.dataset.complete, method:'panel'}));
    this.shadowRoot.querySelectorAll('[data-snooze]').forEach(el=>el.onclick=()=>this.callService('snooze',{task_id:el.dataset.snooze, days:7}));
    this.shadowRoot.querySelectorAll('[data-view-task]').forEach(el=>el.onclick=()=>this.openTaskDetail(el.dataset.viewTask));
    this.shadowRoot.querySelectorAll('[data-edit]').forEach(el=>el.onclick=()=>{ const task=this.tasks.find(t=>t.id===el.dataset.edit); this._modalSnapshot=null; this.modal={task:JSON.parse(JSON.stringify(task||{}))}; this.render(); });
    this.shadowRoot.querySelectorAll('[data-delete]').forEach(el=>el.onclick=()=>{ if(confirm('Delete this maintenance task?')) this.callService('delete_task',{task_id:el.dataset.delete}); });
    this.shadowRoot.querySelectorAll('[data-category-filter]').forEach(el=>el.onclick=()=>{ this.categoryFilter=el.dataset.categoryFilter; this.tab='tasks'; this.render(); });
    const save = this.shadowRoot.querySelector('[data-action="save-task"]');
    if (save) save.onclick=()=>this.saveTask(save.dataset.taskId);
    const catFilter = this.shadowRoot.getElementById('category-filter');
    if (catFilter) catFilter.onchange = () => { this.categoryFilter = catFilter.value; this.render(); };
    const statusFilter = this.shadowRoot.getElementById('status-filter');
    if (statusFilter) statusFilter.onchange = () => { this.statusFilter = statusFilter.value; this.render(); };
    const sortMode = this.shadowRoot.getElementById('sort-mode');
    if (sortMode) sortMode.onchange = () => { this.sortMode = sortMode.value; this.render(); };

    const task = this.modal?.task || {};
    const runtimeRule = (task.rules || []).find(r => r.type === 'runtime') || {};
    const counterRule = (task.rules || []).find(r => r.type === 'counter') || {};
    const entityPicker = this.shadowRoot.getElementById('task-runtime-entity');
    if (entityPicker) {
      entityPicker.hass = this._hass;
      entityPicker.value = runtimeRule.entity || '';
      entityPicker.addEventListener('value-changed', () => { this.runtimeAnalysis = null; this.syncConditionalFields(); this.renderRuntimeAnalysisIntoPanel(); });
      entityPicker.addEventListener('change', () => { this.runtimeAnalysis = null; this.syncConditionalFields(); this.renderRuntimeAnalysisIntoPanel(); });
    }
    const meterPicker = this.shadowRoot.getElementById('task-meter-entity');
    if (meterPicker) {
      meterPicker.hass = this._hass;
      meterPicker.value = counterRule.entity || '';
      meterPicker.addEventListener('value-changed', () => this.updateMeterUnit());
      meterPicker.addEventListener('change', () => this.updateMeterUnit());
    }
    const dataSourcePicker = this.shadowRoot.getElementById('task-entities');
    if (dataSourcePicker) {
      dataSourcePicker.hass = this._hass;
      dataSourcePicker.selector = { entity: { multiple: true } };
      dataSourcePicker.value = task.linked_entities || [];
    }
    const schedule = this.shadowRoot.getElementById('task-schedule');
    const notify = this.shadowRoot.getElementById('task-notify');
    const meterSourceType = this.shadowRoot.getElementById('task-meter-source-type');
    if (meterSourceType) meterSourceType.onchange = () => this.updateMeterUnit();
    const notifyBehaviorEl = this.shadowRoot.getElementById('task-notify-behavior');
    if (schedule) schedule.onchange = () => this.syncConditionalFields();
    const calKindEl = this.shadowRoot.getElementById('task-calendar-kind');
    if (calKindEl) calKindEl.onchange = () => this.syncConditionalFields();
    const baselineEl = this.shadowRoot.getElementById('task-baseline');
    if (baselineEl) baselineEl.onchange = () => this.syncConditionalFields();
    const runtimeMethodEl = this.shadowRoot.getElementById('task-runtime-method');
    if (notify) notify.onchange = () => this.syncConditionalFields();
    if (notifyBehaviorEl) notifyBehaviorEl.onchange = () => this.syncConditionalFields();
    if (runtimeMethodEl) runtimeMethodEl.onchange = () => { runtimeMethodEl.dataset.userTouched = '1'; this.syncConditionalFields(); };
    this.shadowRoot.querySelectorAll('[data-action="analyze-runtime"]').forEach(el=>el.onclick=()=>this.analyzeRuntimeSource());
    this.shadowRoot.querySelectorAll('[data-action="use-threshold"]').forEach(el=>el.onclick=()=>this.useRecommendedThreshold());
    const analysisDays = this.shadowRoot.getElementById('analysis-days');
    if (analysisDays) { analysisDays.value = String(this.analysisDays || 30); analysisDays.onchange = () => { this.analysisDays = Number(analysisDays.value || 30); this.runtimeAnalysis = null; this.renderRuntimeAnalysisIntoPanel(); }; }
    this.bindRuntimeAnalysisControls();
    if (notify) notify.onchange = () => this.syncConditionalFields();
    this.syncConditionalFields();
    this.updateMeterUnit();
    if (this.modal && this._modalSnapshot === null) {
      setTimeout(() => { if (this.modal && this._modalSnapshot === null) this._modalSnapshot = this.getModalFormSnapshot(); }, 0);
    }
  }


  getModalFormSnapshot() {
    const q = id => this.shadowRoot.getElementById(id);
    if (!this.modal) return "";
    const value = id => {
      const el = q(id);
      if (!el) return null;
      if (Array.isArray(el.value)) return [...el.value].sort();
      return el.value ?? "";
    };
    const fields = [
      'task-name','task-category','task-description','task-area','task-device','task-equipment-name',
      'task-schedule','task-seasonal-enabled','task-seasonal-season','task-time-value','task-time-unit','task-runtime-value','task-runtime-interval-unit','task-runtime-method','task-runtime-threshold','task-runtime-states',
      'task-calendar-kind','task-calendar-nth','task-calendar-weekday','task-calendar-month','task-calendar-day','task-calendar-time','task-meter-amount','task-meter-source-type','task-baseline','task-baseline-datetime','task-baseline-ago-value','task-baseline-ago-unit','task-notify-behavior','task-notify','task-mobile','task-nfc','task-nfc-action','task-instructions'
    ];
    const data = {};
    for (const id of fields) data[id] = value(id);
    data['task-runtime-entity'] = value('task-runtime-entity');
    data['task-meter-entity'] = value('task-meter-entity');
    data['task-entities'] = value('task-entities');
    return JSON.stringify(data);
  }

  isModalDirty() {
    if (!this.modal || this._modalSnapshot === null) return false;
    return this.getModalFormSnapshot() !== this._modalSnapshot;
  }

  requestCloseModal() {
    if (!this.modal) return;
    if (!this.isModalDirty()) {
      this._modalSnapshot = null;
    this.mobileMenuOpen = false;
      this.modal = null;
      this.render();
      return;
    }
    this.showUnsavedChangesDialog();
  }

  showUnsavedChangesDialog() {
    if (this.shadowRoot.getElementById('unsaved-dialog')) return;
    const wrapper = document.createElement('div');
    wrapper.id = 'unsaved-dialog';
    wrapper.className = 'unsaved-dialog';
    wrapper.innerHTML = `
      <div class="unsaved-card" role="dialog" aria-modal="true" aria-labelledby="unsaved-title">
        <h3 id="unsaved-title">Unsaved changes</h3>
        <p class="muted">You have unsaved changes. What would you like to do?</p>
        <div class="task-actions" style="justify-content:flex-end;margin-top:16px;">
          <button class="btn" data-unsaved="keep">Keep editing</button>
          <button class="btn danger" data-unsaved="discard">Discard changes</button>
          <button class="btn primary" data-unsaved="save">Save changes</button>
        </div>
      </div>`;
    wrapper.addEventListener('click', ev => { if (ev.target === wrapper) wrapper.remove(); });
    wrapper.querySelector('[data-unsaved="keep"]').onclick = () => wrapper.remove();
    wrapper.querySelector('[data-unsaved="discard"]').onclick = () => { wrapper.remove(); this._modalSnapshot=null; this.modal=null; this.render(); };
    wrapper.querySelector('[data-unsaved="save"]').onclick = () => { const id = this.shadowRoot.querySelector('[data-action="save-task"]')?.dataset?.taskId || ''; wrapper.remove(); this.saveTask(id); };
    this.shadowRoot.appendChild(wrapper);
  }

  renderRuntimeAnalysis() {
    if (this.runtimeAnalysisLoading) return `<div class="muted">Analyzing history…</div>`;
    const a = this.runtimeAnalysis;
    if (!a) return `<div class="muted">Select a numeric runtime source, choose how far back to analyze, then click Analyze source.</div>`;
    if (a.error) return `<div class="muted">${this.escape(a.error)}</div>`;
    const unit = a.unit || 'units';
    const min = Number(a.min), max = Number(a.max);
    const threshold = this.clampThreshold(Number(a.userThreshold ?? a.recommended), min, max);
    const rec = this.clampThreshold(Number(a.recommended), min, max);
    const thresholdPct = this.thresholdPct(threshold, min, max);
    const recPct = this.thresholdPct(rec, min, max);
    const view = this.analysisView || 'histogram';
    const bars = (a.histogram || []).map(b => {
      const pct = b.percent ?? 0;
      const label = `${b.label} ${unit}: ${b.count} samples (${pct.toFixed ? pct.toFixed(1) : pct}%)`;
      return `<div class="histobar" data-bin-label="${this.escape(label)}" title="${this.escape(label)}" style="height:${Math.max(4, b.height)}%"></div>`;
    }).join('');
    const historyPath = this.historyPath(a.rows || [], min, max);
    const actualPeriod = Number(a.actualPeriodDays || a.periodDays || this.analysisDays || 30);
    const availableText = a.availableStart && a.availableEnd ? ` • Available: ${this.escape(a.availableStart)} to ${this.escape(a.availableEnd)}` : '';
    const chartBody = view === 'history'
      ? `<svg class="history-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${this.escape(historyPath)}" fill="none" stroke="currentColor" stroke-width="1.8" vector-effect="non-scaling-stroke" opacity=".8" /></svg>`
      : `<div class="histogram">${bars}</div>`;
    return `<div class="recommendation">Recommended threshold: ${this.escape(a.recommended)} ${this.escape(unit)}</div>
      <div class="muted">Source unit: ${this.escape(unit)} • Requested: last ${this.escape(a.periodDays)} day${Number(a.periodDays) === 1 ? '' : 's'} • Used: ${this.escape(actualPeriod.toFixed ? actualPeriod.toFixed(1) : actualPeriod)} day${actualPeriod === 1 ? '' : 's'} • Range: ${this.escape(a.min)} to ${this.escape(a.max)} ${this.escape(unit)}${availableText}</div>
      <div class="view-tabs"><button class="btn small ${view==='histogram'?'active':''}" type="button" data-action="analysis-view" data-view="histogram">Histogram</button><button class="btn small ${view==='history'?'active':''}" type="button" data-action="analysis-view" data-view="history">History</button></div>
      <div class="histogram-workbench">
        <div>
          <div class="value-axis"><span>${this.escape(a.max)} ${this.escape(unit)}</span><span>${this.escape(a.min)} ${this.escape(unit)}</span></div>
          <div class="histogram-wrap">
            <div class="chart-area">
              <div class="threshold-marker recommended" title="Recommended threshold" style="top:${100-recPct}%"></div>
              <div class="threshold-label recommended" style="top:${100-recPct}%">Recommended ${this.escape(rec)} ${this.escape(unit)}</div>
              <div id="user-threshold-marker" class="threshold-marker" title="Your threshold" style="top:${100-thresholdPct}%"></div>
              <div id="user-threshold-label" class="threshold-label" style="top:${100-thresholdPct}%">Your threshold ${this.escape(threshold)} ${this.escape(unit)}</div>
              ${chartBody}
            </div>
            <div class="axis-row"><span>${view==='history'?'Older':'Low frequency'}</span><span>${view==='history'?'Newer':'High frequency'}</span></div>
          </div>
        </div>
        <div class="vertical-slider-wrap">
          <input id="threshold-slider" class="threshold-slider vertical" type="range" min="${this.escape(a.min)}" max="${this.escape(a.max)}" step="${this.escape(a.step || 0.1)}" value="${threshold}">
          <div class="slider-caption">Drag threshold up/down</div>
        </div>
      </div>
      <div class="tooltip-note">Hover over bars to see value ranges, sample counts, and percentages. Drag the right-side threshold control up or down to simulate runtime.</div>
      <div class="manual-threshold-row"><div><label>Your running threshold: <span id="threshold-display">${threshold}</span> ${this.escape(unit)}</label><div class="help">Anything above this line counts as running.</div></div><input id="threshold-manual-input" type="number" step="${this.escape(a.step || 0.1)}" value="${threshold}"></div>
      <div class="simulation-grid">
        <div class="sim-tile"><div class="muted">Estimated runtime</div><div id="sim-hours" class="sim-value">${this.escape(a.estimatedHours)}</div><div class="muted">hours in period</div></div>
        <div class="sim-tile"><div class="muted">Average per day</div><div id="sim-daily" class="sim-value">${this.escape(a.avgDailyHours)}</div><div class="muted">hours/day</div></div>
        <div class="sim-tile"><div class="muted">Maintenance interval</div><div id="sim-interval" class="sim-value">${this.escape(a.maintenanceIntervalDays || '—')}</div><div class="muted">days, based on limit</div></div>
      </div>
      <div class="help">Reason: ${this.escape(a.reason)}</div>`;
  }

  clampThreshold(value, min, max) {
    if (!Number.isFinite(value)) return Number.isFinite(min) ? min : 0;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return value;
    return Math.max(min, Math.min(max, value));
  }

  thresholdPct(value, min, max) {
    const span = (max - min) || 1;
    return Math.max(0, Math.min(100, ((value - min) / span) * 100));
  }

  historyPath(rows, min, max) {
    const good = (rows || []).filter(r => Number.isFinite(Number(r.value)) && Number.isFinite(Number(r.time)));
    if (good.length < 2) return '';
    const t0 = Math.min(...good.map(r => Number(r.time)));
    const t1 = Math.max(...good.map(r => Number(r.time)));
    const spanT = (t1 - t0) || 1;
    const spanV = (max - min) || 1;
    const maxPoints = 350;
    const step = Math.max(1, Math.ceil(good.length / maxPoints));
    return good.filter((_, i) => i % step === 0 || i === good.length - 1).map(r => {
      const x = ((Number(r.time) - t0) / spanT) * 100;
      const y = 100 - this.thresholdPct(Number(r.value), min, max);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
  }

  renderRuntimeAnalysisIntoPanel() {
    const el = this.shadowRoot.getElementById('runtime-analysis');
    if (el) el.innerHTML = this.renderRuntimeAnalysis();
    this.bindRuntimeAnalysisControls();
  }


  calculateRuntimeStats(threshold) {
    const a = this.runtimeAnalysis;
    const rows = a?.rows || [];
    if (!rows.length) return { hours: 0, daily: 0, intervalDays: '—' };
    let seconds = 0;
    for (let i = 1; i < rows.length; i++) {
      const prev = Number(rows[i - 1].value);
      const ta = Number(rows[i - 1].time);
      const tb = Number(rows[i].time);
      if (Number.isFinite(prev) && prev > threshold && Number.isFinite(ta) && Number.isFinite(tb)) seconds += Math.max(0, tb - ta) / 1000;
    }
    const hours = seconds / 3600;
    const days = Number(a.actualPeriodDays || a.periodDays || this.analysisDays || 30);
    const daily = days ? hours / days : 0;
    const limit = this.intervalToHours(Number(this.shadowRoot.getElementById('task-runtime-value')?.value || 0), this.shadowRoot.getElementById('task-runtime-interval-unit')?.value || 'hours');
    const intervalDays = daily > 0 && limit > 0 ? (limit / daily).toFixed(1) : '—';
    return { hours: hours.toFixed(1), daily: daily.toFixed(1), intervalDays };
  }

  bindRuntimeAnalysisControls() {
    this.shadowRoot.querySelectorAll('[data-action="analysis-view"]').forEach(btn => btn.onclick = () => {
      this.analysisView = btn.dataset.view || 'histogram';
      this.renderRuntimeAnalysisIntoPanel();
    });
    const slider = this.shadowRoot.getElementById('threshold-slider');
    if (!slider || !this.runtimeAnalysis) return;
    const updateFromValue = (rawValue) => {
      const min = Number(this.runtimeAnalysis.min), max = Number(this.runtimeAnalysis.max);
      const threshold = this.clampThreshold(Number(rawValue), min, max);
      this.runtimeAnalysis.userThreshold = threshold;
      const unit = this.runtimeAnalysis.unit || '';
      const input = this.shadowRoot.getElementById('task-runtime-threshold');
      const method = this.shadowRoot.getElementById('task-runtime-method');
      if (input) input.value = threshold;
      if (method) method.value = 'above_threshold';
      slider.value = String(threshold);
      const display = this.shadowRoot.getElementById('threshold-display');
      if (display) display.textContent = String(threshold);
      const marker = this.shadowRoot.getElementById('user-threshold-marker');
      const markerLabel = this.shadowRoot.getElementById('user-threshold-label');
      const manualInput = this.shadowRoot.getElementById('threshold-manual-input');
      const pct = this.thresholdPct(threshold, min, max);
      if (marker) marker.style.top = `${100-pct}%`;
      if (markerLabel) { markerLabel.style.top = `${100-pct}%`; markerLabel.textContent = `Your threshold ${threshold} ${unit}`; }
      if (manualInput) manualInput.value = threshold;
      const stats = this.calculateRuntimeStats(threshold);
      const h = this.shadowRoot.getElementById('sim-hours');
      const d = this.shadowRoot.getElementById('sim-daily');
      const interval = this.shadowRoot.getElementById('sim-interval');
      if (h) h.textContent = stats.hours;
      if (d) d.textContent = stats.daily;
      if (interval) interval.textContent = stats.intervalDays;
      this.syncConditionalFields();
    };
    slider.oninput = () => updateFromValue(slider.value);
    const manualInput = this.shadowRoot.getElementById('threshold-manual-input');
    if (manualInput) manualInput.oninput = () => {
      const value = Number(manualInput.value);
      if (!Number.isFinite(value)) return;
      updateFromValue(value);
    };
    updateFromValue(this.runtimeAnalysis.userThreshold ?? this.runtimeAnalysis.recommended);
  }

  updateRuntimeHints() {
    const entityId = this.shadowRoot.getElementById('task-runtime-entity')?.value || '';
    const state = this.entityState(entityId);
    const unit = this.entityUnit(entityId);
    const domain = this.entityDomain(entityId);
    const sourceHint = this.shadowRoot.getElementById('runtime-source-hint');
    const methodHint = this.shadowRoot.getElementById('runtime-method-hint');
    const unitEl = this.shadowRoot.getElementById('task-runtime-unit');
    const methodEl = this.shadowRoot.getElementById('task-runtime-method');
    if (sourceHint) {
      sourceHint.textContent = entityId ? `Current value: ${state?.state ?? 'unknown'}${unit ? ' ' + unit : ''}. Suggested method: ${this.runtimeMethodLabel(entityId)}.` : '';
    }
    if (unitEl) unitEl.textContent = this.runtimeUnitLabel(entityId);
    if (methodEl && entityId && !methodEl.dataset.userTouched) {
      if (['switch','binary_sensor','fan','light','input_boolean'].includes(domain)) methodEl.value = 'entity_on';
      else if (unit) methodEl.value = 'above_threshold';
      else methodEl.value = 'specific_state';
    }
    if (methodHint && methodEl) {
      methodHint.textContent = methodEl.value === 'above_threshold' ? 'Best for power, RPM, fan speed, current, or other numeric sensors.' : methodEl.value === 'specific_state' ? 'Best for status sensors such as printer status = running.' : 'Best for switches, binary sensors, fans, lights, and helpers.';
    }
  }

  async fetchNumericHistory(entityId, days) {
    const rows = [];
    const now = Date.now();
    const chunkDays = 7;
    const seen = new Set();
    for (let offset = 0; offset < days; offset += chunkDays) {
      const chunkEndMs = now - offset * 24*60*60*1000;
      const chunkStartMs = Math.max(now - days * 24*60*60*1000, chunkEndMs - chunkDays*24*60*60*1000);
      const startIso = new Date(chunkStartMs).toISOString();
      const endIso = new Date(chunkEndMs).toISOString();
      const url = `history/period/${encodeURIComponent(startIso)}?filter_entity_id=${encodeURIComponent(entityId)}&end_time=${encodeURIComponent(endIso)}&minimal_response`;
      try {
        const data = await this._hass.callApi('GET', url);
        const rowsRaw = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
        for (const r of rowsRaw) {
          const time = new Date(r.last_changed || r.last_updated).getTime();
          const value = Number(r.state);
          if (!Number.isFinite(value) || !Number.isFinite(time)) continue;
          const key = `${time}:${value}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({ value, time });
        }
      } catch (err) {
        // Continue with any other chunks. Some Recorder installs have shorter retention.
      }
    }
    return rows;
  }

  async analyzeRuntimeSource() {
    const entityId = this.shadowRoot.getElementById('task-runtime-entity')?.value || '';
    const unit = this.entityUnit(entityId);
    if (!entityId) { this.runtimeAnalysis = {error:'Choose a runtime source first.'}; this.renderRuntimeAnalysisIntoPanel(); return; }
    this.analysisDays = Number(this.shadowRoot.getElementById('analysis-days')?.value || this.analysisDays || 30);
    this.runtimeAnalysisLoading = true; this.renderRuntimeAnalysisIntoPanel();
    try {
      const rows = await this.fetchNumericHistory(entityId, this.analysisDays);
      rows.sort((a,b) => a.time - b.time);
      const values = rows.map(r => r.value).filter(v => Number.isFinite(v));
      if (values.length < 3) throw new Error(`Not enough numeric history was found for ${entityId}. Recorder may not have enough stored data yet, or this sensor may not be numeric.`);
      values.sort((a,b)=>a-b);
      const min = values[0], max = values[values.length-1];
      const firstTime = Math.min(...rows.map(r => r.time));
      const lastTime = Math.max(...rows.map(r => r.time));
      const actualPeriodDays = Math.max(1/24, (lastTime - firstTime) / (24*60*60*1000));
      const dateFmt = new Intl.DateTimeFormat(undefined, {month:'short', day:'numeric'});
      const availableStart = dateFmt.format(new Date(firstTime));
      const availableEnd = dateFmt.format(new Date(lastTime));
      const p10 = values[Math.floor(values.length*.10)], p50 = values[Math.floor(values.length*.50)], p90 = values[Math.floor(values.length*.90)];
      let recommended = 0;
      let reason = 'Using a conservative threshold above the low/off cluster.';
      if (min <= 1 && p50 > 5) recommended = Math.max(1, Math.round((min + p10 + 1) * 10) / 10);
      else if (min <= 5 && max > 50) recommended = Math.round((min + Math.max(10, (p10-min)*1.5)) * 10) / 10;
      else recommended = Math.round(((min + p50) / 2) * 10) / 10;
      if (unit === 'W' || unit === 'kW') reason = 'Power sensors commonly show a low/off cluster and higher running values. The recommendation is just above the likely off range.';
      if (unit === 'RPM') reason = 'RPM sensors usually show stopped near 0 and running above that. The recommendation is above the stopped range.';
      const bins = 24; const span = max-min || 1; const counts = Array(bins).fill(0);
      for (const v of values) counts[Math.min(bins-1, Math.floor(((v-min)/span)*bins))]++;
      const maxCount = Math.max(...counts,1);
      const histogram = counts.map((count,i)=>{
        const low = min+span*i/bins;
        const high = min+span*(i+1)/bins;
        return {count, percent: count/values.length*100, height: count/maxCount*100, label:`${low.toFixed(1)}-${high.toFixed(1)}`};
      });
      const step = span > 1000 ? 1 : span > 100 ? 0.5 : 0.1;
      const existingThreshold = Number(this.shadowRoot.getElementById('task-runtime-threshold')?.value);
      const userThreshold = Number.isFinite(existingThreshold) && existingThreshold > 0 ? existingThreshold : recommended;
      this.runtimeAnalysis = {min:min.toFixed(1), max:max.toFixed(1), p10:p10.toFixed(1), p50:p50.toFixed(1), p90:p90.toFixed(1), recommended, userThreshold, unit, histogram, reason, rows, periodDays:this.analysisDays, actualPeriodDays, availableStart, availableEnd, step};
      const stats = this.calculateRuntimeStats(userThreshold);
      this.runtimeAnalysis.estimatedHours = stats.hours;
      this.runtimeAnalysis.avgDailyHours = stats.daily;
      this.runtimeAnalysis.maintenanceIntervalDays = stats.intervalDays;
      const method = this.shadowRoot.getElementById('task-runtime-method');
      if (method) method.value = 'above_threshold';
      this.syncConditionalFields();
    } catch (err) {
      this.runtimeAnalysis = {error: err?.message || String(err)};
    } finally {
      this.runtimeAnalysisLoading = false; this.renderRuntimeAnalysisIntoPanel();
    }
  }

  useRecommendedThreshold() {
    const threshold = this.runtimeAnalysis?.recommended;
    const input = this.shadowRoot.getElementById('task-runtime-threshold');
    const method = this.shadowRoot.getElementById('task-runtime-method');
    if (threshold !== undefined && input) { input.value = threshold; if (this.runtimeAnalysis) this.runtimeAnalysis.userThreshold = Number(threshold); if (method) method.value = 'above_threshold'; this.syncConditionalFields(); this.renderRuntimeAnalysisIntoPanel(); }
  }

  updateMeterUnit() {
    const meterEntity = this.shadowRoot.getElementById('task-meter-entity')?.value || '';
    const state = meterEntity ? this._hass?.states?.[meterEntity] : null;
    const sourceUnit = state?.attributes?.unit_of_measurement || '';
    const typeEl = this.shadowRoot.getElementById('task-meter-source-type');
    if (typeEl && meterEntity && !typeEl.dataset.userTouched) {
      typeEl.value = this.isRateUnit(sourceUnit) ? 'rate' : 'cumulative';
    }
    if (typeEl && !typeEl.dataset.bound) {
      typeEl.dataset.bound = '1';
      typeEl.addEventListener('change', () => { typeEl.dataset.userTouched = '1'; this.updateMeterUnit(); });
    }
    const mode = typeEl?.value || 'cumulative';
    const targetUnit = mode === 'rate' ? this.totalizedTargetUnit(sourceUnit) : (sourceUnit || 'units');
    const el = this.shadowRoot.getElementById('task-meter-unit');
    if (el) el.textContent = targetUnit;
    const sourceHint = this.shadowRoot.getElementById('meter-source-hint');
    const typeHint = this.shadowRoot.getElementById('meter-type-hint');
    const explain = this.shadowRoot.getElementById('meter-explain-box');
    if (sourceHint) {
      if (!meterEntity) sourceHint.textContent = 'Choose a sensor. HMM will detect whether it looks cumulative or rate-based.';
      else if (this.isRateUnit(sourceUnit)) sourceHint.textContent = `Detected ${sourceUnit || 'rate'} rate sensor. HMM can totalize this into ${targetUnit}.`;
      else if (this.isLikelyInstantUnit(sourceUnit)) sourceHint.textContent = `Detected ${sourceUnit}. This may be an instant value; runtime threshold may be better unless this sensor is cumulative.`;
      else sourceHint.textContent = `Detected unit: ${sourceUnit || 'no unit'}. Use cumulative if this sensor only increases over time.`;
    }
    if (typeHint) typeHint.textContent = mode === 'rate' ? `HMM will add ${sourceUnit || 'units/time'} over elapsed time and track total ${targetUnit}.` : 'Use this when the sensor is already a total, like total gallons, odometer miles, or lifetime kWh.';
    if (explain) explain.textContent = mode === 'rate' ? `HMM will create an internal totalizer for this task. Mark Complete resets the maintenance baseline, not the original sensor.` : 'HMM stores the current sensor value as the baseline and tracks how much the total increases.';
  }

  syncConditionalFields() {
    const schedule = this.shadowRoot.getElementById('task-schedule')?.value || 'time';
    const notifyBehavior = this.shadowRoot.getElementById('task-notify-behavior')?.value || 'global';
    const notify = this.shadowRoot.getElementById('task-notify')?.value || 'persistent';
    const showTime = ["time","time_or_runtime","time_and_runtime","time_or_meter","time_and_meter"].includes(schedule);
    const showRuntime = ["runtime","time_or_runtime","time_and_runtime"].includes(schedule);
    const showMeter = ["meter","time_or_meter","time_and_meter"].includes(schedule);
    const showCalendar = schedule === "calendar";
    const showUsage = showRuntime || showMeter;
    const showCustomNotify = notifyBehavior === 'custom';
    const showMobile = showCustomNotify && ["mobile","both"].includes(notify);
    const runtimeMethod = this.shadowRoot.getElementById('task-runtime-method')?.value || 'entity_on';
    const calendarKind = this.shadowRoot.getElementById('task-calendar-kind')?.value || 'nth_weekday';
    const baselineMode = this.shadowRoot.getElementById('task-baseline')?.value || 'today';
    const seasonalEnabled = this.shadowRoot.getElementById('task-seasonal-enabled')?.checked;
    const seasonalSeason = this.shadowRoot.getElementById('task-seasonal-season')?.value || 'custom';
    this.shadowRoot.querySelectorAll('.time-fields').forEach(el => el.classList.toggle('hidden', !showTime));
    this.shadowRoot.querySelectorAll('.runtime-fields').forEach(el => el.classList.toggle('hidden', !showRuntime));
    this.shadowRoot.querySelectorAll('.meter-fields').forEach(el => el.classList.toggle('hidden', !showMeter));
    this.shadowRoot.querySelectorAll('.calendar-fields').forEach(el => el.classList.toggle('hidden', !showCalendar));
    this.shadowRoot.querySelectorAll('.calendar-nth-fields').forEach(el => el.classList.toggle('hidden', !(showCalendar && calendarKind === 'nth_weekday')));
    this.shadowRoot.querySelectorAll('.calendar-month-day-fields').forEach(el => el.classList.toggle('hidden', !(showCalendar && calendarKind === 'month_day')));
    this.shadowRoot.querySelectorAll('.baseline-specific-fields').forEach(el => el.classList.toggle('hidden', baselineMode !== 'specific'));
    this.shadowRoot.querySelectorAll('.baseline-ago-fields').forEach(el => el.classList.toggle('hidden', baselineMode !== 'ago'));
    this.shadowRoot.querySelectorAll('.seasonal-fields').forEach(el => el.classList.toggle('hidden', !seasonalEnabled));
    this.shadowRoot.querySelectorAll('.seasonal-custom-fields').forEach(el => el.classList.toggle('hidden', !seasonalEnabled || seasonalSeason !== 'custom'));
    this.shadowRoot.querySelectorAll('.usage-fields').forEach(el => el.classList.toggle('hidden', !showUsage));
    this.shadowRoot.querySelectorAll('.custom-notify-fields').forEach(el => el.classList.toggle('hidden', !showCustomNotify));
    this.shadowRoot.querySelectorAll('.mobile-fields').forEach(el => el.classList.toggle('hidden', !showMobile));
    this.shadowRoot.querySelectorAll('.threshold-fields').forEach(el => el.classList.toggle('hidden', !(showRuntime && runtimeMethod === 'above_threshold')));
    this.shadowRoot.querySelectorAll('.state-fields').forEach(el => el.classList.toggle('hidden', !(showRuntime && runtimeMethod === 'specific_state')));
    this.updateRuntimeHints();
    this.updateMeterUnit();
  }

  async callService(service, data) {
    await this._hass.callService('home_maintenance_manager', service, data);
    this._modalSnapshot = null;
    this.mobileMenuOpen = false;
    this.modal = null;
    setTimeout(()=>this.loadData(), 700);
  }

  setError(id, active) {
    const el = this.shadowRoot.getElementById(id);
    if (el) el.classList.toggle('active', active);
  }

  async saveTask(existingId) {
    const q = id => this.shadowRoot.getElementById(id);
    const name = q('task-name').value.trim();
    const schedule = q('task-schedule').value;
    const needsTime = ["time","time_or_runtime","time_and_runtime","time_or_meter","time_and_meter"].includes(schedule);
    const needsRuntime = ["runtime","time_or_runtime","time_and_runtime"].includes(schedule);
    const needsMeter = ["meter","time_or_meter","time_and_meter"].includes(schedule);
    const needsCalendar = schedule === "calendar";
    const timeValue = Number(q('task-time-value')?.value || 0);
    const timeUnit = q('task-time-unit')?.value || 'days';
    const runtimeEntity = q('task-runtime-entity')?.value || '';
    const runtimeValue = Number(q('task-runtime-value')?.value || 0);
    const runtimeUnit = q('task-runtime-interval-unit')?.value || 'hours';
    const meterEntity = q('task-meter-entity')?.value || '';
    const meterAmount = Number(q('task-meter-amount')?.value || 0);
    const meterSourceType = q('task-meter-source-type')?.value || 'cumulative';
    const notifyBehavior = q('task-notify-behavior')?.value || 'global';
    const notify = notifyBehavior === 'custom' ? (q('task-notify')?.value || 'persistent') : notifyBehavior;
    const mobile = q('task-mobile')?.value || '';
    const runtimeMethod = q('task-runtime-method')?.value || 'entity_on';
    const runtimeThresholdRaw = q('task-runtime-threshold')?.value;
    const runtimeThreshold = Number(runtimeThresholdRaw);
    const runtimeStates = (q('task-runtime-states')?.value || '').split(',').map(s=>s.trim()).filter(Boolean);
    const existing = existingId ? this.tasks.find(t=>t.id===existingId) : null;
    let hasError = false;
    this.setError('err-name', !name); hasError = hasError || !name;
    this.setError('err-days', needsTime && (!timeValue || timeValue <= 0)); hasError = hasError || (needsTime && (!timeValue || timeValue <= 0));
    this.setError('err-runtime-entity', needsRuntime && !runtimeEntity); hasError = hasError || (needsRuntime && !runtimeEntity);
    this.setError('err-runtime-hours', needsRuntime && (!runtimeValue || runtimeValue <= 0)); hasError = hasError || (needsRuntime && (!runtimeValue || runtimeValue <= 0));
    this.setError('err-runtime-threshold', needsRuntime && runtimeMethod === 'above_threshold' && (runtimeThresholdRaw === '' || !Number.isFinite(runtimeThreshold))); hasError = hasError || (needsRuntime && runtimeMethod === 'above_threshold' && (runtimeThresholdRaw === '' || !Number.isFinite(runtimeThreshold)));
    this.setError('err-meter-entity', needsMeter && !meterEntity); hasError = hasError || (needsMeter && !meterEntity);
    this.setError('err-meter-amount', needsMeter && (!meterAmount || meterAmount <= 0)); hasError = hasError || (needsMeter && (!meterAmount || meterAmount <= 0));
    if (hasError) return;

    const rules = [];
    if (needsTime) {
      rules.push({id:'time_1', type:'time', name:`Every ${timeValue} ${timeUnit}`, value:timeValue, unit:timeUnit, days:this.intervalToDays(timeValue, timeUnit)});
    }
    if (needsCalendar) {
      const [hourRaw, minuteRaw] = String(q('task-calendar-time')?.value || '09:00').split(':');
      const calendarKind = q('task-calendar-kind')?.value || 'nth_weekday';
      const calendarRule = {id:'calendar_1', type:'calendar', name:'Calendar schedule', calendar_kind:calendarKind, hour:Number(hourRaw||9), minute:Number(minuteRaw||0)};
      if (calendarKind === 'month_day') {
        calendarRule.month = q('task-calendar-month')?.value || null;
        calendarRule.day = Number(q('task-calendar-day')?.value || 1);
        calendarRule.name = calendarRule.month ? `Every ${calendarRule.month}/${calendarRule.day}` : `Every month on day ${calendarRule.day}`;
      } else {
        calendarRule.nth = Number(q('task-calendar-nth')?.value || 2);
        calendarRule.weekday = Number(q('task-calendar-weekday')?.value || 1);
        calendarRule.name = 'Monthly weekday schedule';
      }
      rules.push(calendarRule);
    }
    if (needsRuntime) {
      const runtimeHours = this.intervalToHours(runtimeValue, runtimeUnit);
      const runtimeRule = {id:'runtime_1', type:'runtime', name:`Every ${runtimeValue} runtime ${runtimeUnit}`, entity:runtimeEntity, value:runtimeValue, unit:runtimeUnit, hours:runtimeHours};
      if (runtimeMethod === 'above_threshold') runtimeRule.above = runtimeThreshold;
      if (runtimeMethod === 'specific_state') runtimeRule.states = runtimeStates.length ? runtimeStates : ['running'];
      rules.push(runtimeRule);
    }
    if (needsMeter) {
      const state = this._hass?.states?.[meterEntity];
      const existingCounter = existing?.rules?.find(r => r.type === 'counter' && r.entity === meterEntity);
      let baseline = existingCounter?.baseline;
      if (baseline === undefined || baseline === null || baseline === '') {
        const raw = state?.state;
        const parsed = Number(raw);
        baseline = Number.isFinite(parsed) ? parsed : 0;
      }
      const sourceUnit = state?.attributes?.unit_of_measurement || existingCounter?.source_unit || existingCounter?.unit || '';
      const targetUnit = meterSourceType === 'rate' ? this.totalizedTargetUnit(sourceUnit) : (sourceUnit || existingCounter?.target_unit || existingCounter?.unit || '');
      if (meterSourceType === 'rate') {
        baseline = existingCounter?.baseline;
        if (baseline === undefined || baseline === null || baseline === '') baseline = existingCounter?.source_mode === 'rate' ? (existing?.totalized_usage?.counter_1 || 0) : 0;
      }
      rules.push({id:'counter_1', type:'counter', name:`Every ${meterAmount} ${targetUnit || 'units'}`, entity:meterEntity, amount:meterAmount, baseline, unit: targetUnit, source_unit: sourceUnit, target_unit: targetUnit, source_mode: meterSourceType});
    }
    const entityValue = q('task-entities')?.value;
    const selectedEntities = Array.isArray(entityValue) ? entityValue : (entityValue ? [entityValue] : []);
    const nfc = q('task-nfc').value;
    const nfcAction = nfc ? (q('task-nfc-action')?.value || 'confirm') : 'disabled';
    const baselineMethod = q('task-baseline')?.value || 'today';
    let lastCompleted = existing ? (existing.last_completed || new Date().toISOString()) : new Date().toISOString();
    let baselineAgoValue = q('task-baseline-ago-value')?.value || '';
    let baselineAgoUnit = q('task-baseline-ago-unit')?.value || 'days';
    if (!existing || baselineMethod !== (existing.baseline_method || 'today')) {
      if (baselineMethod === 'specific') lastCompleted = this.isoForDatetimeLocal(q('task-baseline-datetime')?.value);
      else if (baselineMethod === 'ago') lastCompleted = this.subtractIntervalFromNow(Number(baselineAgoValue || 0), baselineAgoUnit);
      else lastCompleted = new Date().toISOString();
    } else if (baselineMethod === 'specific') {
      lastCompleted = this.isoForDatetimeLocal(q('task-baseline-datetime')?.value);
    } else if (baselineMethod === 'ago') {
      lastCompleted = this.subtractIntervalFromNow(Number(baselineAgoValue || 0), baselineAgoUnit);
    }
    const seasonalEnabled = !!q('task-seasonal-enabled')?.checked;
    const seasonalSeason = q('task-seasonal-season')?.value || 'custom';
    const seasonal = seasonalEnabled ? {
      enabled: true,
      season: seasonalSeason,
      start_month: Number(q('task-seasonal-start-month')?.value || 1),
      start_day: Number(q('task-seasonal-start-day')?.value || 1),
      end_month: Number(q('task-seasonal-end-month')?.value || 12),
      end_day: Number(q('task-seasonal-end-day')?.value || 31),
      show_when_inactive: !!q('task-seasonal-show-inactive')?.checked,
      pause_usage_when_inactive: !!q('task-seasonal-pause-usage')?.checked
    } : {};
    const task = {
      id: existingId || this.slug(name),
      name,
      description: q('task-description').value,
      category: q('task-category').value || 'General',
      area: q('task-area').value || null,
      linked_device_id: q('task-device').value || null,
      equipment_name: q('task-equipment-name').value.trim(),
      linked_entities: selectedEntities,
      rules,
      rule_logic: ["time_and_runtime","time_and_meter"].includes(schedule) ? 'all' : 'any',
      primary_rule_id: null,
      nfc_tags: nfc ? [nfc] : [],
      nfc_action: nfcAction,
      instructions: q('task-instructions').value,
      checklist: existing?.checklist || [], parts: existing?.parts || [], tools: existing?.tools || [],
      notification_mode: notify,
      mobile_notify_service: mobile || null,
      allow_snooze: true,
      max_snooze_count: 0,
      max_snooze_days: 30,
      warning_percent: 0.8,
      seasonal,
      paused: false,
      last_completed: lastCompleted,
      baseline_method: baselineMethod,
      baseline_ago_value: baselineAgoValue,
      baseline_ago_unit: baselineAgoUnit
    };
    await this.callService('upsert_task', { task });
  }

  async saveNotificationSettings() {
    const settings = this.currentNotificationSettingsFromForm();
    await this._hass.callWS({ type: 'home_maintenance_manager/update_notification_settings', settings });
    this.notificationSettings = settings;
    await this.loadData();
  }


  currentNotificationSettingsFromForm() {
    const q = id => this.shadowRoot.getElementById(id);
    const mobileSelect = q('global-mobile-targets');
    const mobileTargets = mobileSelect ? Array.from(mobileSelect.selectedOptions).map(o => o.value).filter(Boolean) : [];
    return {
      enabled: !!q('notify-enabled')?.checked,
      default_mode: q('global-notify-mode')?.value || 'automation_only',
      mobile_notify_services: mobileTargets,
      notify_upcoming: !!q('notify-upcoming')?.checked,
      notify_due: !!q('notify-due')?.checked,
      notify_overdue: !!q('notify-overdue')?.checked,
      notify_completed: !!q('notify-completed')?.checked,
      notify_snoozed: !!q('notify-snoozed')?.checked,
      repeat_mode: q('global-repeat-mode')?.value || 'once',
      repeat_days: Math.max(1, Number(q('global-repeat-days')?.value || 1)),
      quiet_start: q('quiet-start')?.value || '',
      quiet_end: q('quiet-end')?.value || '',
      title_template: q('notify-title-template')?.value || '[{category}] {task_name}',
      body_template: q('notify-body-template')?.value || '{task_name} is {status}.',
    };
  }

  updateNotificationPreview() {
    const title = this.shadowRoot.getElementById('notification-preview-title');
    const body = this.shadowRoot.getElementById('notification-preview-body');
    if (title) title.textContent = this.previewNotificationTitle();
    if (body) body.textContent = this.previewNotificationBody();
  }

  async testNotification() {
    const settings = this.currentNotificationSettingsFromForm();
    try {
      const result = await this._hass.callWS({ type: 'home_maintenance_manager/test_notification', settings });
      alert(result?.message || 'Test notification sent.');
    } catch (err) {
      alert(`Test notification failed: ${err?.message || err}`);
    }
  }

}

customElements.define('home-maintenance-manager-panel', HomeMaintenanceManagerPanel);
