class HomeMaintenanceManagerPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this.tasks = [];
    this.metadata = { areas: [], devices: [], entities: [], notify_services: [], notification_settings: null };
    this.backupStatus = null;
    this.builtInTaskPacks = [];
    this.importPackage = null;
    this.importPreview = null;
    this.importMode = "merge";
    this.importWizardOpen = false;
    this.importWizardStep = 1;
    this.importStatusFilter = "all";
    this.importEntityFilter = "all";
    this.importEntityQueueIndex = 0;
    this.importEntityMapping = {};
    this.taskPackExportOpen = false;
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
      const [taskData, meta, backupStatus] = await Promise.all([
        this._hass.callWS({ type: "home_maintenance_manager/get_tasks" }),
        this._hass.callWS({ type: "home_maintenance_manager/get_metadata" }),
        this._hass.callWS({ type: "home_maintenance_manager/get_backup_status" })
      ]);
      this.tasks = taskData.tasks || [];
      this.metadata = meta || this.metadata;
      this.backupStatus = backupStatus || null;
      try {
        const library = await this._hass.callWS({ type: "home_maintenance_manager/list_built_in_task_packs" });
        this.builtInTaskPacks = Array.isArray(library?.packs) ? library.packs : [];
      } catch (err) {
        this.builtInTaskPacks = [];
      }
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
      :host {
        display:block;
        font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
        color: var(--primary-text-color);
        --hmm-status-healthy-text: var(--success-color, #0b6b20);
        --hmm-status-healthy-bg: color-mix(in srgb, var(--hmm-status-healthy-text) 14%, var(--card-background-color));
        --hmm-status-due-soon-text: var(--warning-color, #8a5f00);
        --hmm-status-due-soon-bg: color-mix(in srgb, var(--hmm-status-due-soon-text) 16%, var(--card-background-color));
        --hmm-status-due-now-text: var(--hmm-status-orange, #b85c00);
        --hmm-status-due-now-bg: color-mix(in srgb, var(--hmm-status-due-now-text) 16%, var(--card-background-color));
        --hmm-status-overdue-text: var(--error-color, #b00020);
        --hmm-status-overdue-bg: color-mix(in srgb, var(--hmm-status-overdue-text) 14%, var(--card-background-color));
        --hmm-status-critical-text: #7f0018;
        --hmm-status-critical-bg: color-mix(in srgb, var(--hmm-status-critical-text) 16%, var(--card-background-color));
        --hmm-status-paused-text: var(--secondary-text-color);
        --hmm-status-paused-bg: var(--secondary-background-color);
        --hmm-status-neutral-text: var(--secondary-text-color);
        --hmm-status-neutral-bg: var(--secondary-background-color);
      }
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
      .metric-card { min-height:118px; display:flex; flex-direction:column; justify-content:space-between; gap:8px; }
      .metric-card .metric-card-head { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
      .metric-card .metric-card-label { color:var(--secondary-text-color); }
      .metric-card .metric { line-height:1; }
      .metric-card .progress { margin:4px 0; }
      .dashboard-stack { display:grid; gap:20px; }
      .dashboard-hero-grid { display:grid; grid-template-columns:minmax(280px, 1.3fr) minmax(260px, .9fr); gap:16px; align-items:stretch; }
      .home-health-card { display:grid; grid-template-columns:minmax(130px, .5fr) minmax(0, 1fr); gap:18px; align-items:center; }
      .health-score-block { display:flex; flex-direction:column; gap:8px; }
      .health-score-value { font-size:52px; line-height:1; font-weight:800; }
      .health-score-label { color:var(--secondary-text-color); }
      .health-breakdown { display:grid; gap:10px; }
      .health-breakdown-row { display:grid; grid-template-columns:minmax(90px, .8fr) minmax(90px, 1fr) 42px; gap:10px; align-items:center; font-size:13px; }
      .health-breakdown-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .health-breakdown-value { text-align:right; color:var(--secondary-text-color); }
      .attention-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:12px; }
      .attention-grid .metric-card { min-height:104px; padding:16px; }
      .dashboard-section { display:grid; gap:12px; }
      @media(max-width: 900px){ .dashboard-hero-grid, .home-health-card { grid-template-columns:1fr; } .attention-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); } }
      @media(max-width: 520px){ .attention-grid { grid-template-columns:1fr; } .health-breakdown-row { grid-template-columns:minmax(80px, .8fr) minmax(80px, 1fr) 38px; } }
      .muted { color: var(--secondary-text-color); }
      .pill { display:inline-block; border-radius:999px; padding:5px 10px; font-size:12px; font-weight:700; text-transform:uppercase; background: var(--hmm-status-neutral-bg); color:var(--hmm-status-neutral-text); }
      .pill.ok { background:var(--hmm-status-healthy-bg); color:var(--hmm-status-healthy-text); }
      .pill.upcoming { background:var(--hmm-status-due-soon-bg); color:var(--hmm-status-due-soon-text); }
      .pill.due { background:var(--hmm-status-due-now-bg); color:var(--hmm-status-due-now-text); }
      .pill.overdue { background:var(--hmm-status-overdue-bg); color:var(--hmm-status-overdue-text); }
      .pill.critical { background:var(--hmm-status-critical-bg); color:var(--hmm-status-critical-text); }
      .pill.warn { background:var(--hmm-status-due-soon-bg); color:var(--hmm-status-due-soon-text); }
      .pill.paused, .pill.snoozed, .pill.season_paused { background:var(--hmm-status-paused-bg); color:var(--hmm-status-paused-text); }
      .status-chip { display:inline-flex; align-items:center; gap:6px; border:1px solid transparent; border-radius:999px; padding:5px 10px; font-size:12px; font-weight:700; line-height:1; text-transform:uppercase; background:var(--hmm-status-neutral-bg); color:var(--hmm-status-neutral-text); white-space:nowrap; }
      .status-chip ha-icon { --mdc-icon-size:16px; width:16px; height:16px; flex:0 0 16px; }
      .status-chip--compact { padding:4px 8px; font-size:11px; }
      .status-chip--healthy { background:var(--hmm-status-healthy-bg); color:var(--hmm-status-healthy-text); }
      .status-chip--due-soon { background:var(--hmm-status-due-soon-bg); color:var(--hmm-status-due-soon-text); }
      .status-chip--due-now { background:var(--hmm-status-due-now-bg); color:var(--hmm-status-due-now-text); }
      .status-chip--overdue { background:var(--hmm-status-overdue-bg); color:var(--hmm-status-overdue-text); }
      .status-chip--critical { background:var(--hmm-status-critical-bg); color:var(--hmm-status-critical-text); }
      .status-chip--paused, .status-chip--season-paused { background:var(--hmm-status-paused-bg); color:var(--hmm-status-paused-text); }
      .category-pill { display:inline-block; border-radius:999px; padding:4px 9px; font-size:12px; background: var(--secondary-background-color); color: var(--secondary-text-color); margin:4px 6px 4px 0; }
      .category-icon { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:50%; color:var(--primary-color); background:color-mix(in srgb, var(--primary-color) 12%, var(--card-background-color)); }
      .category-icon ha-icon { --mdc-icon-size:18px; width:18px; height:18px; }
      .progress { height:12px; background: var(--secondary-background-color); border-radius:999px; overflow:hidden; margin:12px 0; }
      .bar { height:100%; background: var(--primary-color); width:0%; }
      .detail-hero { display:grid; grid-template-columns: 112px 1fr; gap:16px; align-items:center; margin:10px 0 16px; }
      .hmm-avatar { width:96px; height:96px; border-radius:24px; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg, var(--primary-color), var(--accent-color, #03a9f4)); color:var(--text-primary-color); box-shadow:0 8px 24px rgba(0,0,0,.18); }
      .hmm-avatar svg { width:70px; height:70px; }
      .status-title { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .summary-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin:12px 0; }
      .summary-tile { background:var(--card-background-color); border:1px solid var(--divider-color); border-radius:14px; padding:12px; }
      .summary-tile .value { font-size:22px; font-weight:700; margin-top:4px; }
      .progress.big { height:18px; }
      .rule-row { border:1px solid var(--divider-color); background:var(--card-background-color); border-radius:14px; padding:12px; margin:10px 0; }
      .season-badges { display:flex; gap:8px; flex-wrap:wrap; margin:10px 0; }
      .season-badge { border:1px solid var(--divider-color); background:var(--card-background-color); border-radius:999px; padding:7px 10px; font-weight:700; }
      .season-timeline { position:relative; height:34px; border-radius:999px; background:var(--card-background-color); border:1px solid var(--divider-color); overflow:hidden; margin:10px 0 4px; }
      .season-segment { position:absolute; top:0; bottom:0; background:var(--primary-color); opacity:.75; }
      .month-row { display:grid; grid-template-columns:repeat(12, 1fr); gap:2px; font-size:11px; color:var(--secondary-text-color); text-align:center; }
      .detail-card-grid { display:grid; grid-template-columns: 1fr 1fr; gap:16px; }
      @media(max-width: 800px){ .detail-card-grid, .detail-hero { grid-template-columns:1fr; } .hmm-avatar { width:76px; height:76px; border-radius:18px; } }
      .task-title { font-size:20px; font-weight:700; margin:0 0 6px; }
      .list { display:flex; flex-direction:column; gap:12px; }
      .two { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
      .form-grid { display:grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap:14px 18px; align-items:start; }
      .span-12 { grid-column: span 12; }
      .span-8 { grid-column: span 8; }
      .span-6 { grid-column: span 6; }
      .span-4 { grid-column: span 4; }
      .span-3 { grid-column: span 3; }
      .form-field { min-width:0; }
      .form-field label { margin-top:0; min-height:26px; display:flex; align-items:center; }
      .input-row { display:grid; grid-template-columns: minmax(120px, 1fr) minmax(140px, .85fr); gap:10px; align-items:center; }
      .schedule-row { display:grid; grid-template-columns: minmax(240px, 1fr) minmax(260px, 1fr); gap:18px; align-items:end; margin-bottom:14px; }
      .schedule-card { border:1px solid var(--divider-color); border-radius:14px; padding:14px; background:var(--card-background-color); margin:12px 0; }
      .schedule-card h4 { margin:0 0 10px; font-size:16px; }
      .field-caption { color:var(--secondary-text-color); font-size:13px; margin:4px 0 8px; }
      .three { display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; }
      @media(max-width: 800px){ .two, .three, .schedule-row { grid-template-columns: 1fr; } .form-grid { grid-template-columns:1fr; } .span-12, .span-8, .span-6, .span-4, .span-3 { grid-column:1; } .input-row { grid-template-columns: 1fr 1fr; } .hero { align-items:flex-start; flex-direction:column;} .page { padding:16px; } .ha-mobile-appbar { display:block; margin:-16px -16px 24px; } }
      label { display:block; font-weight:600; margin:12px 0 6px; }
      .help { font-size:13px; color: var(--secondary-text-color); margin-bottom:6px; }
      input, select, textarea { box-sizing:border-box; width:100%; padding:12px; border-radius:10px; border:1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); }
      input[type="checkbox"] { width:auto; padding:0; }
      .check-row { display:flex; align-items:center; gap:10px; margin:12px 0 6px; font-weight:600; }
      .check-row input[type="checkbox"] { flex:0 0 auto; }
      .seasonal-box { margin-top:16px; padding:14px; border:1px dashed var(--divider-color); border-radius:14px; background: var(--card-background-color); }
      .seasonal-box h4 { margin:0 0 8px; font-size:16px; }
      .season-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:8px 14px; margin:8px 0 12px; }
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
      .task-table { width:100%; border-collapse:collapse; }
      .task-table th, .task-table td { border-bottom:1px solid var(--divider-color); padding:8px; text-align:left; vertical-align:top; }
      .info-box { border-left:4px solid var(--primary-color); background: var(--card-background-color); padding:10px 12px; border-radius:10px; margin:10px 0; color: var(--secondary-text-color); }
      .toolbar-card { margin-bottom:16px; }
      .category-header { display:flex; justify-content:space-between; gap:12px; align-items:baseline; margin:24px 0 10px; }
      .category-header h2 { margin:0; }
      .status-dot { width:10px; height:10px; border-radius:50%; background: var(--primary-color); display:inline-block; margin-right:6px; }
      .status-dot--healthy { background:var(--hmm-status-healthy-text); }
      .status-dot--due-soon { background:var(--hmm-status-due-soon-text); }
      .status-dot--due-now { background:var(--hmm-status-due-now-text); }
      .status-dot--overdue { background:var(--hmm-status-overdue-text); }
      .status-dot--critical { background:var(--hmm-status-critical-text); }
      .status-dot--paused, .status-dot--season-paused { background:var(--hmm-status-paused-text); }
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
      .section-header { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; margin:22px 0 12px; }
      .section-header h2, .section-header h3 { margin:0; }
      .section-header .section-kicker { color:var(--secondary-text-color); font-size:13px; margin-top:3px; }
      .section-header .section-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
      .compact-task-list { display:flex; flex-direction:column; border:1px solid var(--divider-color); border-radius:16px; overflow:hidden; background:var(--card-background-color); }
      .compact-task-row { min-height:44px; display:grid; grid-template-columns:minmax(190px, 1.4fr) minmax(110px, .65fr) minmax(150px, 1fr) auto; gap:10px; align-items:center; padding:8px 10px; border-bottom:1px solid var(--divider-color); }
      .compact-task-row:last-child { border-bottom:0; }
      .compact-task-main { min-width:0; display:flex; align-items:center; gap:8px; }
      .compact-task-title { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:700; }
      .compact-task-meta { min-width:0; color:var(--secondary-text-color); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; }
      .compact-rule-stack { display:grid; gap:5px; }
      .compact-rule-progress { display:grid; grid-template-columns:18px minmax(70px, 1fr) 36px; gap:6px; align-items:center; min-width:0; font-size:12px; color:var(--secondary-text-color); }
      .compact-rule-label { font-weight:800; color:var(--primary-text-color); }
      .compact-mini-bar { height:7px; border-radius:999px; overflow:hidden; background:var(--secondary-background-color); }
      .compact-mini-fill { height:100%; width:0%; background:var(--primary-color); }
      .compact-task-actions { display:flex; gap:6px; justify-content:flex-end; }
      .hmm-dialog { width:min(940px, 100%); }
      .hmm-dialog--narrow { width:min(620px, 100%); }
      .hmm-dialog-body { display:block; }
      @media(max-width: 800px){ .compact-task-row { grid-template-columns:1fr; align-items:start; } .compact-task-actions { justify-content:flex-start; } .section-header { align-items:flex-start; flex-direction:column; } }

      .import-wizard { width:min(1120px, 100%); padding:0; overflow:hidden; }
      .import-wizard .sticky-head { position:sticky; top:0; z-index:2; background:var(--card-background-color); padding:20px 22px 14px; border-bottom:1px solid var(--divider-color); margin:0; }
      .import-wizard h2 { margin:2px 0 4px; }
      .wizard-stepper { display:flex; gap:10px; padding:14px 22px; background:var(--secondary-background-color); border-bottom:1px solid var(--divider-color); overflow:auto; }
      .step { display:flex; align-items:center; gap:8px; border:1px solid var(--divider-color); border-radius:999px; padding:8px 12px; white-space:nowrap; color:var(--secondary-text-color); }
      .step b { display:inline-flex; width:22px; height:22px; border-radius:50%; align-items:center; justify-content:center; background:var(--divider-color); color:var(--primary-text-color); }
      .step.active { border-color:var(--primary-color); color:var(--primary-text-color); }
      .step.active b { background:var(--primary-color); color:var(--text-primary-color); }
      .wizard-summary-grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; padding:18px 22px 8px; }
      .summary-tile { border:1px solid var(--divider-color); border-radius:16px; padding:14px; background:var(--secondary-background-color); }
      .summary-tile.attention { border-color:var(--primary-color); }
      .summary-value { font-size:28px; font-weight:800; line-height:1; }
      .wizard-warning, .wizard-alert { margin:12px 22px; border-left:5px solid var(--primary-color); padding:12px 14px; border-radius:12px; background:var(--secondary-background-color); color:var(--primary-text-color); }
      .wizard-controls { display:flex; justify-content:space-between; gap:16px; align-items:end; padding:8px 22px 14px; border-bottom:1px solid var(--divider-color); }
      .chip-row { display:flex; gap:8px; flex-wrap:wrap; }
      .chip { border:1px solid var(--divider-color); background:var(--card-background-color); border-radius:999px; padding:8px 11px; cursor:pointer; color:var(--primary-text-color); }
      .chip.active { background:var(--primary-color); color:var(--text-primary-color); border-color:var(--primary-color); }
      .wizard-bulk-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
      .review-list { padding:12px 22px; max-height:45vh; overflow:auto; background:var(--card-background-color); }
      .review-row { display:grid; grid-template-columns:42px 1fr; gap:12px; border:1px solid var(--divider-color); border-radius:16px; padding:14px; margin-bottom:10px; background:var(--secondary-background-color); }
      .review-row.disabled { opacity:.62; }
      .review-check { padding-top:5px; }
      .review-title-row { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
      .review-title-row h3 { margin:0 0 4px; font-size:18px; }
      .entity-warning { margin-top:8px; color:var(--primary-text-color); font-weight:700; }
      .missing-entity-list { margin-top:8px; color:var(--secondary-text-color); line-height:1.8; }
      .missing-entity-list code { white-space:normal; }
      .import-options-section { margin:12px 22px 0; }
      .wizard-panel { padding:16px 22px; }
      .wizard-section-card { border:1px solid var(--divider-color); border-radius:16px; padding:14px; margin:0 0 12px; background:var(--secondary-background-color); }
      .wizard-section-card h3 { margin:0 0 8px; }
      .option-card { display:flex; align-items:flex-start; gap:10px; border:1px solid var(--divider-color); border-radius:14px; padding:12px; margin:10px 0; background:var(--card-background-color); cursor:pointer; }
      .option-card input { flex:0 0 auto; width:auto; margin-top:3px; }
      .danger-option { border-style:dashed; }
      .entity-map-row { display:grid; grid-template-columns:1.1fr 1.4fr; gap:14px; align-items:start; border:1px solid var(--divider-color); border-radius:16px; padding:14px; margin-bottom:12px; background:var(--secondary-background-color); }
      .entity-map-row .entity-original { word-break:break-word; }
      .entity-map-actions { display:grid; gap:8px; }
      .entity-map-actions ha-entity-picker { display:block; width:100%; }
      .entity-queue-layout { display:grid; grid-template-columns:minmax(230px, .75fr) minmax(0, 1.5fr); gap:14px; align-items:start; }
      .entity-queue-list { display:grid; gap:8px; }
      .entity-queue-item { text-align:left; border:1px solid var(--divider-color); border-radius:12px; padding:10px; background:var(--card-background-color); color:var(--primary-text-color); cursor:pointer; }
      .entity-queue-item.active { border-color:var(--primary-color); box-shadow:0 0 0 1px var(--primary-color); }
      .entity-queue-item.mapped { border-color:#0b6b20; }
      .entity-queue-panel { border:1px solid var(--divider-color); border-radius:16px; padding:16px; background:var(--secondary-background-color); }
      .entity-meta-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:8px; margin:12px 0; }
      .entity-meta-tile { border:1px solid var(--divider-color); border-radius:12px; padding:10px; background:var(--card-background-color); }
      .entity-meta-tile .key { color:var(--secondary-text-color); font-size:12px; margin-bottom:2px; }
      .suggestion-list { display:grid; gap:8px; margin-top:8px; }
      .suggestion-card { text-align:left; border:1px solid var(--divider-color); border-radius:12px; padding:10px; background:var(--card-background-color); color:var(--primary-text-color); cursor:pointer; }
      .suggestion-card:hover { border-color:var(--primary-color); }
      .suggestion-card .score { float:right; color:var(--secondary-text-color); font-size:12px; }
      details.entity-picker-fallback { border:1px dashed var(--divider-color); border-radius:12px; padding:10px; background:var(--card-background-color); }
      .entity-map-context { margin-top:12px; display:grid; gap:8px; }
      .entity-context-card { border:1px solid var(--divider-color); border-radius:12px; padding:10px; background:var(--card-background-color); }
      .entity-context-title { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; font-weight:800; }
      .entity-context-meta { color:var(--secondary-text-color); font-size:13px; margin-top:3px; line-height:1.45; }
      .entity-context-note { margin-top:6px; font-size:13px; line-height:1.45; }
      .entity-context-more { color:var(--secondary-text-color); font-size:13px; margin-top:4px; }
      .summary-list { display:grid; gap:8px; }
      .summary-line { display:flex; justify-content:space-between; gap:12px; border-bottom:1px solid var(--divider-color); padding:8px 0; }
      .sticky-actions { position:sticky; bottom:0; background:var(--card-background-color); padding:16px 22px; margin:0; }
      .empty-list { text-align:center; color:var(--secondary-text-color); padding:24px; }
      @media(max-width: 800px){ .entity-map-row, .entity-queue-layout { grid-template-columns:1fr; } .import-wizard-scrim { padding:0; } .import-wizard { min-height:100vh; border-radius:0; } .wizard-summary-grid { grid-template-columns:1fr 1fr; } .wizard-controls { flex-direction:column; align-items:stretch; } .review-list { max-height:none; } .modal-actions-bottom.sticky-actions { align-items:stretch; flex-direction:column; } .sticky-actions .right { justify-content:stretch; } .sticky-actions .right .btn { flex:1; } }
    `;
  }

  taskStatus(t) { return (t.status || t.summary?.status || "unknown").toLowerCase(); }
  percent(t) { return Math.max(0, Math.min(100, Math.round(t.summary?.percent_used ?? 0))); }
  category(t) { return t.category || "General"; }
  dateShort(iso) { if (!iso) return "Not recorded"; try { return new Date(iso).toLocaleDateString(); } catch { return iso; } }
  slug(value) { return (value || "maintenance_task").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "maintenance_task"; }
  escape(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
  label(text, tip) { return `<span class="field-label"><span>${text}</span><span class="tip" title="${this.escape(tip)}">?</span></span>`; }

  friendlyStatus(status) {
    const map = { ok:'OK', upcoming:'Upcoming', due:'Due', overdue:'Overdue', paused:'Paused', snoozed:'Snoozed', season_paused:'Season Paused', unknown:'Unknown' };
    return map[String(status || '').toLowerCase()] || String(status || 'Unknown').replaceAll('_',' ').replace(/\b\w/g, c=>c.toUpperCase());
  }

  statusVisual(status) {
    const raw = String(status || 'unknown').toLowerCase().replaceAll('_', '-');
    const aliases = {
      ok: 'healthy',
      healthy: 'healthy',
      upcoming: 'due-soon',
      'due-soon': 'due-soon',
      due: 'due-now',
      'due-now': 'due-now',
      'due-today': 'due-now',
      overdue: 'overdue',
      critical: 'critical',
      paused: 'paused',
      snoozed: 'paused',
      'season-paused': 'season-paused',
      unknown: 'unknown',
    };
    const tone = aliases[raw] || 'unknown';
    const labels = {
      healthy: 'Healthy',
      'due-soon': 'Due Soon',
      'due-now': 'Due Now',
      overdue: 'Overdue',
      critical: 'Critical',
      paused: 'Paused',
      'season-paused': 'Season Paused',
      unknown: 'Unknown',
    };
    const icons = {
      healthy: 'mdi:check-circle',
      'due-soon': 'mdi:clock-alert-outline',
      'due-now': 'mdi:alert-circle-outline',
      overdue: 'mdi:alert-octagon-outline',
      critical: 'mdi:alert-octagram',
      paused: 'mdi:pause-circle-outline',
      'season-paused': 'mdi:leaf-off',
      unknown: 'mdi:help-circle-outline',
    };
    return { tone, label: labels[tone] || this.friendlyStatus(status), icon: icons[tone] || icons.unknown };
  }

  renderTaskStatusChip(status, options = {}) {
    const visual = this.statusVisual(status);
    const label = options.label || visual.label;
    const compact = options.compact ? ' status-chip--compact' : '';
    const title = options.title || label;
    return `<span class="status-chip status-chip--${visual.tone}${compact}" title="${this.escape(title)}" aria-label="${this.escape(label)}"><ha-icon icon="${visual.icon}"></ha-icon><span>${this.escape(label)}</span></span>`;
  }

  categoryIconName(category) {
    const key = String(category || 'General').toLowerCase();
    if (key.includes('hvac')) return 'mdi:hvac';
    if (key.includes('electrical')) return 'mdi:lightning-bolt';
    if (key.includes('plumb') || key.includes('water')) return 'mdi:pipe';
    if (key.includes('pool')) return 'mdi:pool';
    if (key.includes('safety')) return 'mdi:shield-check';
    if (key.includes('exterior') || key.includes('roof')) return 'mdi:home-roof';
    if (key.includes('appliance')) return 'mdi:wrench';
    if (key.includes('landscap') || key.includes('yard')) return 'mdi:tree';
    return 'mdi:clipboard-check';
  }

  renderCategoryIcon(category) {
    return `<span class="category-icon" title="${this.escape(category || 'General')}"><ha-icon icon="${this.categoryIconName(category)}"></ha-icon></span>`;
  }

  compactRuleLabel(type) {
    return { time:'T', runtime:'R', counter:'M', calendar:'C' }[type] || 'P';
  }

  renderCompactRuleProgress(rule) {
    const pct = Math.max(0, Math.min(100, Math.round(rule.percent ?? rule.percent_used ?? 0)));
    const label = rule.label || this.compactRuleLabel(rule.rule_type || rule.type);
    const title = rule.title || this.ruleTypeLabel(rule.rule_type || rule.type);
    return `<div class="compact-rule-progress" title="${this.escape(title)}"><span class="compact-rule-label">${this.escape(label)}</span><span class="compact-mini-bar"><span class="compact-mini-fill" style="width:${pct}%"></span></span><span>${pct}%</span></div>`;
  }

  renderCompactTaskRow(t) {
    const status = this.taskStatus(t);
    const category = this.category(t);
    const taskId = this.escape(t.id || '');
    const rules = Array.isArray(t.summary?.rule_progress) && t.summary.rule_progress.length
      ? t.summary.rule_progress.map(r => ({ ...r, percent: Math.round((r.percent_used || 0) * 100) }))
      : [{ type: 'time', percent: this.percent(t), title: 'Overall progress' }];
    return `<div class="compact-task-row" data-task-id="${taskId}">
      <div class="compact-task-main">${this.renderCategoryIcon(category)}<span class="compact-task-title">${this.escape(t.name || t.id)}</span></div>
      <div>${this.renderTaskStatusChip(status, { compact: true })}</div>
      <div class="compact-rule-stack">${rules.slice(0, 2).map(r => this.renderCompactRuleProgress(r)).join('')}</div>
      <div class="compact-task-actions"><button class="btn small primary" data-complete="${taskId}">Done</button><button class="btn small" data-view-task="${taskId}">View</button></div>
    </div>`;
  }

  renderSectionHeader(title, options = {}) {
    const level = options.level === 3 ? 'h3' : 'h2';
    const subtitle = options.subtitle ? `<div class="section-kicker">${this.escape(options.subtitle)}</div>` : '';
    const actions = options.actions ? `<div class="section-actions">${options.actions}</div>` : '';
    return `<div class="section-header"><div><${level}>${this.escape(title)}</${level}>${subtitle}</div>${actions}</div>`;
  }

  renderDialogLayout(options = {}) {
    const scrimAction = options.scrimAction || 'modal-scrim';
    const closeAction = options.closeAction || 'close-modal';
    const classes = ['modal', 'hmm-dialog', options.className || ''].filter(Boolean).join(' ');
    const subtitle = options.subtitle ? `<div class="muted">${this.escape(options.subtitle)}</div>` : '';
    const footer = options.footer ? `<div class="modal-actions-bottom">${options.footer}</div>` : '';
    return `<div class="modal-scrim" data-action="${this.escape(scrimAction)}"><div class="${this.escape(classes)}" role="dialog" aria-modal="true" aria-label="${this.escape(options.ariaLabel || options.title || 'Dialog')}" data-modal-content>
      <div class="modal-head"><div><h2>${this.escape(options.title || '')}</h2>${subtitle}</div><button class="btn" data-action="${this.escape(closeAction)}">Close</button></div>
      <div class="hmm-dialog-body">${options.body || ''}</div>
      ${footer}
    </div></div>`;
  }

  renderDashboardMetricCard(options = {}) {
    const visual = this.statusVisual(options.status || 'unknown');
    const progress = options.progress === undefined ? '' : `<div class="progress"><div class="bar" style="width:${Math.max(0, Math.min(100, Number(options.progress) || 0))}%"></div></div>`;
    return `<div class="card metric-card ${this.escape(options.className || '')}">
      <div class="metric-card-head"><div class="metric-card-label">${this.escape(options.label || '')}</div>${options.status ? `<span class="status-dot status-dot--${visual.tone}" title="${this.escape(visual.label)}"></span>` : ''}</div>
      <div class="metric">${this.escape(options.value ?? '')}</div>
      ${progress}
      ${options.help ? `<div class="muted">${this.escape(options.help)}</div>` : ''}
    </div>`;
  }

  healthStatus(score) {
    if (score >= 85) return 'ok';
    if (score >= 70) return 'upcoming';
    if (score >= 50) return 'due';
    return 'overdue';
  }

  renderHomeHealthDashboardCard(counts, activeCategories) {
    const score = this.homeHealthScore(counts);
    const categories = activeCategories.slice(0, 5).map(category => {
      const stats = this.categoryStats(category);
      return `<div class="health-breakdown-row">
        <div class="health-breakdown-name">${this.escape(category)}</div>
        <div class="progress"><div class="bar" style="width:${stats.score}%"></div></div>
        <div class="health-breakdown-value">${stats.score}%</div>
      </div>`;
    }).join('');
    return `<div class="card home-health-card">
      <div class="health-score-block">
        <div class="health-score-label">Home Health</div>
        <div class="health-score-value">${score}%</div>
        ${this.renderTaskStatusChip(this.healthStatus(score), { label: score >= 85 ? 'Healthy' : score >= 70 ? 'Watch' : score >= 50 ? 'Needs Attention' : 'Critical' })}
        <div class="muted">Simple score from overdue and due-today tasks.</div>
      </div>
      <div class="health-breakdown">
        <div class="status-title"><b>Category health</b><span class="muted">${activeCategories.length ? `${activeCategories.length} active` : 'No active categories'}</span></div>
        ${categories || '<div class="muted">Create tasks to see category health here.</div>'}
      </div>
    </div>`;
  }

  renderAttentionSummary(counts) {
    return `<div class="attention-grid">
      ${this.renderDashboardMetricCard({ label: 'Overdue', value: counts.overdue, status: counts.overdue ? 'overdue' : 'ok', help: 'Past due tasks' })}
      ${this.renderDashboardMetricCard({ label: 'Due Today', value: counts.dueToday, status: counts.dueToday ? 'due' : 'ok', help: 'Tasks due now' })}
      ${this.renderDashboardMetricCard({ label: 'Due Soon', value: counts.dueSoon, status: counts.dueSoon ? 'upcoming' : 'ok', help: 'Upcoming status tasks' })}
      ${this.renderDashboardMetricCard({ label: 'Upcoming', value: counts.upcoming, status: 'ok', help: 'On-track tasks' })}
    </div>`;
  }

  ruleTypeLabel(type) {
    return { time:'Time interval', runtime:'Runtime hours', counter:'Metered usage', calendar:'Calendar/date' }[type] || String(type || 'Rule');
  }

  seasonLabel(season) {
    return { spring:'🌱 Spring', summer:'☀️ Summer', fall:'🍂 Fall', winter:'❄️ Winter' }[String(season || '').toLowerCase()] || this.escape(season || 'Season');
  }

  monthName(month) {
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Math.max(1, Math.min(12, Number(month)||1))-1];
  }

  monthDayLabel(month, day) { return `${this.monthName(month)} ${Number(day)||1}`; }

  detailIconSvg() {
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M8 30 32 10l24 20v24a4 4 0 0 1-4 4H38V42H26v16H12a4 4 0 0 1-4-4V30z" opacity=".95"/><path fill="var(--card-background-color)" d="M41.7 22.6a8.8 8.8 0 0 0-10.8 10.8L18.5 45.8a3.8 3.8 0 1 0 5.4 5.4l12.4-12.4a8.8 8.8 0 0 0 10.8-10.8l-5.5 5.5-4-4 5.5-5.5z"/><path fill="currentColor" d="M20.7 48.9a1.4 1.4 0 1 1 2-2 1.4 1.4 0 0 1-2 2z"/></svg>`;
  }

  seasonalWindowSegments(seasonal) {
    if (!seasonal?.enabled) return [];
    const presets = { spring:[3,1,5,31], summer:[6,1,8,31], fall:[9,1,11,30], winter:[12,1,2,28] };
    const ranges = [];
    const seasons = Array.isArray(seasonal.seasons) && seasonal.seasons.length ? seasonal.seasons : (seasonal.season && seasonal.season !== 'custom' ? [seasonal.season] : []);
    if (seasonal.custom_enabled || seasonal.season === 'custom' || !seasons.length) ranges.push([seasonal.start_month||5, seasonal.start_day||1, seasonal.end_month||9, seasonal.end_day||30]);
    else seasons.forEach(season => { if (presets[season]) ranges.push(presets[season]); });
    const dayOfYear = (m,d) => Math.floor((Date.UTC(2024, Number(m)-1, Number(d)) - Date.UTC(2024,0,1)) / 86400000) + 1;
    const segments = [];
    for (const [sm,sd,em,ed] of ranges) {
      const start = dayOfYear(sm,sd), end = dayOfYear(em,ed);
      if (end >= start) segments.push([start, end]); else { segments.push([start, 366]); segments.push([1, end]); }
    }
    return segments.map(([s,e]) => ({ left: ((s-1)/366)*100, width: Math.max(((e-s+1)/366)*100, .6) }));
  }

  seasonalSummary(t) {
    const seasonal = t.seasonal || t.summary?.seasonal || {};
    if (!seasonal.enabled) return '';
    const seasons = Array.isArray(seasonal.seasons) && seasonal.seasons.length ? seasonal.seasons : (seasonal.season && seasonal.season !== 'custom' ? [seasonal.season] : []);
    const isCustom = seasonal.custom_enabled || seasonal.season === 'custom' || !seasons.length;
    const title = isCustom ? 'Custom date range' : seasons.map(s => this.seasonLabel(s)).join(' ');
    const range = isCustom ? `${this.monthDayLabel(seasonal.start_month||5, seasonal.start_day||1)} → ${this.monthDayLabel(seasonal.end_month||9, seasonal.end_day||30)}` : seasons.map(s => {
      const p = this.seasonalPreset(s); return p ? `${this.seasonLabel(s)}: ${this.monthDayLabel(p[0],p[1])} → ${this.monthDayLabel(p[2],p[3])}` : this.seasonLabel(s);
    }).join('<br>');
    const active = t.summary?.season_active !== false;
    const next = t.summary?.next_season_start;
    const segments = this.seasonalWindowSegments(seasonal).map(seg=>`<span class="season-segment" style="left:${seg.left}%;width:${seg.width}%"></span>`).join('');
    const badges = isCustom ? `<span class="season-badge">📅 Custom</span>` : seasons.map(s=>`<span class="season-badge">${this.seasonLabel(s)}</span>`).join('');
    return `<div class="form-section"><h3>Seasonal window</h3><div class="season-badges">${badges}</div><div class="detail-list"><div class="key">Mode</div><div>${title}</div><div class="key">Active range</div><div>${range}</div><div class="key">Current state</div><div>${active ? 'Active now' : `Paused${next ? ' until '+this.dateShort(next) : ' until active season'}`}</div><div class="key">Inactive behavior</div><div>${seasonal.show_when_inactive === false ? 'Hidden while inactive' : 'Shown while inactive'}${seasonal.pause_usage_when_inactive === false ? ' • Usage continues' : ' • Usage paused'}</div></div><div class="season-timeline">${segments}</div><div class="month-row">${['J','F','M','A','M','J','J','A','S','O','N','D'].map(m=>`<span>${m}</span>`).join('')}</div></div>`;
  }

  ruleProgressHtml(t) {
    const rules = t.summary?.rule_progress || [];
    if (!rules.length) return '<p class="muted">No schedule progress available yet.</p>';
    return rules.map(r => {
      const pct = Math.max(0, Math.min(100, Math.round((r.percent_used || 0) * 100)));
      return `<div class="rule-row"><div class="status-title"><b>${this.ruleTypeLabel(r.rule_type)}</b><span class="pill ${r.due ? 'due' : 'ok'}">${r.due ? 'Due' : 'Tracking'}</span></div><div class="muted">${this.escape(r.name || '')}</div><div class="progress big"><div class="bar" style="width:${pct}%"></div></div><div class="detail-list"><div class="key">Progress</div><div>${pct}%</div><div class="key">Used / target</div><div>${this.escape(r.detail || '')}</div><div class="key">Remaining</div><div>${r.remaining === null || r.remaining === undefined ? 'N/A' : this.escape(Number(r.remaining).toFixed(1))}</div></div></div>`;
    }).join('');
  }

  trackingSourceHtml(t) {
    const rules = t.rules || [];
    const rows = [];
    for (const r of rules) {
      if ((r.type === 'runtime' || r.type === 'counter') && r.entity) {
        const state = this.entityState(r.entity);
        rows.push(`<div class="key">${this.ruleTypeLabel(r.type)} entity</div><div>${this.escape(r.entity)}</div>`);
        rows.push(`<div class="key">Current state</div><div>${state ? this.escape(state.state + (state.attributes?.unit_of_measurement ? ' '+state.attributes.unit_of_measurement : '')) : 'Unavailable'}</div>`);
        if (r.type === 'runtime') rows.push(`<div class="key">Detection</div><div>${this.escape(this.runtimeMethodLabel(r.entity))}${r.above !== undefined ? ' > '+this.escape(r.above) : ''}</div>`);
        if (r.type === 'counter') rows.push(`<div class="key">Baseline</div><div>${this.escape(r.baseline ?? 0)} ${this.escape(r.target_unit || r.unit || '')}</div>`);
      }
    }
    if (!rows.length && (!t.linked_entities || !t.linked_entities.length)) return '';
    const linked = (t.linked_entities || []).map(e=>this.escape(e)).join('<br>');
    return `<div class="form-section"><h3>Tracking source</h3><div class="detail-list">${linked ? `<div class="key">Linked entities</div><div>${linked}</div>` : ''}${rows.join('')}</div></div>`;
  }

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

  canonicalUsageUnit(unit) {
    const u = String(unit || '').trim();
    const l = u.toLowerCase();
    const aliases = {sec:'s', second:'s', seconds:'s', minute:'min', minutes:'min', hour:'h', hours:'h', hr:'h', hrs:'h', day:'d', days:'d', week:'wk', weeks:'wk', month:'mo', months:'mo', year:'y', years:'y', wh:'Wh', kwh:'kWh', mwh:'MWh', gallon:'gal', gallons:'gal', liter:'L', liters:'L', litre:'L', litres:'L'};
    return aliases[l] || u;
  }

  usageUnitFamily(unit) {
    const u = this.canonicalUsageUnit(unit);
    if (['s','min','h','d','wk','mo','y'].includes(u)) return 'time';
    if (['Wh','kWh','MWh'].includes(u)) return 'energy';
    if (['W','kW'].includes(u)) return 'power';
    if (['gal','qt','oz','L','mL'].includes(u)) return 'volume';
    if (['mi','ft','m','km'].includes(u)) return 'distance';
    return '';
  }

  usageUnitOptions(sourceUnit, selected) {
    const family = this.usageUnitFamily(sourceUnit);
    const groups = {
      time: [['s','seconds'],['min','minutes'],['h','hours'],['d','days'],['wk','weeks'],['mo','months'],['y','years']],
      energy: [['Wh','Wh'],['kWh','kWh'],['MWh','MWh']],
      volume: [['gal','gal'],['qt','qt'],['oz','oz'],['L','L'],['mL','mL']],
      distance: [['mi','mi'],['ft','ft'],['m','m'],['km','km']],
    };
    const options = groups[family] || [[sourceUnit || 'units', sourceUnit || 'units']];
    const current = selected || sourceUnit || 'units';
    return options.map(([v,l]) => `<option value="${this.escape(v)}" ${this.canonicalUsageUnit(current)===this.canonicalUsageUnit(v)?'selected':''}>${this.escape(l)}</option>`).join('');
  }

  convertUsageAmount(value, fromUnit, toUnit) {
    const n = Number(value || 0);
    const from = this.canonicalUsageUnit(fromUnit);
    const to = this.canonicalUsageUnit(toUnit);
    if (!from || !to || from === to) return n;
    if (this.usageUnitFamily(from) === 'time' && this.usageUnitFamily(to) === 'time') {
      const factors = {s:1, min:60, h:3600, d:86400, wk:604800, mo:30.4375*86400, y:365.25*86400};
      return n * factors[from] / factors[to];
    }
    return n;
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
  dayOptions(selected) {
    return Array.from({length:31},(_,i)=>`<option value="${i+1}" ${String(selected)===String(i+1)?'selected':''}>${i+1}</option>`).join('');
  }

  seasonalPreset(season) {
    const presets = {spring:[3,1,5,31], summer:[6,1,8,31], fall:[9,1,11,30], winter:[12,1,2,28]};
    return presets[String(season || '').toLowerCase()] || null;
  }
  seasonalDateValue(month, day) {
    const m = String(Number(month || 1)).padStart(2, '0');
    const d = String(Number(day || 1)).padStart(2, '0');
    return `2000-${m}-${d}`;
  }
  seasonalMonthDayFromDate(value, fallbackMonth=1, fallbackDay=1) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return [Number(fallbackMonth || 1), Number(fallbackDay || 1)];
    return [Number(match[2]), Number(match[3])];
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

  dashboardStatusCounts(tasks = this.tasks) {
    return tasks.reduce((counts, task) => {
      const status = this.taskStatus(task);
      if (status === "overdue") counts.overdue += 1;
      else if (status === "due") counts.dueToday += 1;
      else if (status === "upcoming") counts.dueSoon += 1;
      else if (status === "ok") counts.upcoming += 1;
      return counts;
    }, { overdue: 0, dueToday: 0, dueSoon: 0, upcoming: 0 });
  }

  homeHealthScore(counts = this.dashboardStatusCounts()) {
    return Math.max(0, Math.min(100, 100 - counts.overdue * 20 - counts.dueToday * 12));
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
    this.shadowRoot.innerHTML = `<style>${this.css()}</style><div class="page">${this.renderBody()}</div>${this.safeRenderModal()}${this.renderImportWizardModal()}${this.renderTaskPackExportModal()}`;
    this.bind();
  }

  safeRenderModal() {
    try {
      return this.renderModal();
    } catch (err) {
      console.error('Home Maintenance Manager modal render failed', err);
      return `<div class="modal-scrim"><div class="modal" data-modal-content>
        <div class="modal-head"><div><h2>Could not open editor</h2><div class="muted">The task editor hit a rendering error. Close this dialog and refresh HMM before trying again.</div></div><button class="btn" data-action="close-modal">Close</button></div>
        <div class="info-box">${this.escape(err?.message || err || 'Unknown render error')}</div>
      </div></div>`;
    }
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
    const counts = this.dashboardStatusCounts();
    const activeCategories = this.categories().filter(c => this.tasks.some(t => this.category(t) === c));
    return `
      <div class="dashboard-stack">
        <div class="dashboard-section">
          ${this.renderSectionHeader('Dashboard', { subtitle: 'Home Health and tasks needing attention.' })}
          <div class="dashboard-hero-grid">
            ${this.renderHomeHealthDashboardCard(counts, activeCategories)}
            <div class="card">
              <div class="task-title">What needs attention</div>
              <p class="muted">Counts use the current task status data already loaded by Home Maintenance Manager.</p>
              <div class="summary-list">
                <div class="summary-line"><span>Overdue</span><b>${counts.overdue}</b></div>
                <div class="summary-line"><span>Due today</span><b>${counts.dueToday}</b></div>
                <div class="summary-line"><span>Due soon</span><b>${counts.dueSoon}</b></div>
                <div class="summary-line"><span>Upcoming</span><b>${counts.upcoming}</b></div>
              </div>
            </div>
          </div>
        </div>
        <div class="dashboard-section">
          ${this.renderSectionHeader('Attention Summary', { subtitle: 'Overdue and due-today tasks are the highest priority.' })}
          ${this.renderAttentionSummary(counts)}
        </div>
        <div class="dashboard-section">
          ${this.renderSectionHeader('Categories', { subtitle: activeCategories.length ? 'Existing category cards and actions are unchanged.' : 'No categories yet.' })}
          <div class="grid">${activeCategories.length ? activeCategories.map(c => this.renderCategoryCard(c)).join("") : this.renderEmptyTasks()}</div>
        </div>
        <div class="dashboard-section">
          ${this.renderSectionHeader('Next up', { subtitle: 'Same task feed preview, sorted by progress used.' })}
          <div class="grid">${this.tasks.length ? this.tasks.slice().sort((a,b)=>this.percent(b)-this.percent(a)).slice(0,6).map(t=>this.renderTaskCard(t)).join("") : this.renderEmptyTasks()}</div>
        </div>
      </div>
    `;
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
        ${this.taskGeneratedDeviceId(t) ? `<button class="btn small" data-open-task-device="${this.escape(t.id)}">Open HA Device</button>` : ''}
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
    const b = this.backupStatus || {};
    const installedPacks = Array.isArray(b.installed_task_packs) ? b.installed_task_packs : [];
    const migratedFrom = (b.migration?.migrated_from || []).join(', ') || 'No legacy migration needed';
    const migratedAt = b.migration?.migrated_at ? new Date(b.migration.migrated_at).toLocaleString() : 'Not recorded';
    return `<div class="grid">
      <div class="card"><h2>Settings</h2><p class="muted">General Home Maintenance Manager information and lookups.</p><p>Notification settings have moved to the <b>Notifications</b> tab.</p></div>
      <div class="card"><h2>Backup & Restore</h2>
        <p><span class="pill ok">Included in HA backups</span></p>
        <p class="muted">HMM v0.7 stores task data, runtime history, NFC assignments, Task Pack metadata, and HMM settings in one Home Assistant storage file. Full Home Assistant backups include this file automatically.</p>
        <p><b>Storage file:</b><br><code>${this.escape(b.storage_path || '/config/.storage/home_maintenance_manager')}</code></p>
        <p><b>Storage version:</b> ${this.escape(String(b.storage_version || 'unknown'))}</p>
        <p><b>Tasks:</b> ${b.tasks ?? this.tasks.length}</p>
        <p><b>Completion history records:</b> ${b.completion_history_records ?? 0}</p>
        <p><b>Activity history records:</b> ${b.activity_history_records ?? 0}</p>
        <p><b>Settings in storage:</b> ${b.settings_in_storage ? 'Yes' : 'No'}</p>
        <p><b>Migrated from:</b> ${this.escape(migratedFrom)}</p>
        <p><b>Migration time:</b> ${this.escape(migratedAt)}</p>
      </div>
      <div class="card"><h2>Export / Import JSON</h2>
        <p class="muted">Export creates a full backup-style JSON file. Import now uses a review step so you can validate tasks, detect duplicates, and see missing entities before anything is saved.</p>
        <div class="task-actions"><button class="btn primary" data-action="export-json">Export JSON</button><button class="btn" data-action="open-task-pack-export">Export selected tasks as Task Pack</button></div>
        <hr>
        <p><b>Import</b></p>
        <input id="import-json-file" type="file" accept="application/json,.json">
        <div class="task-actions" style="margin-top:12px;"><button class="btn" data-action="preview-import-json">Review Import</button></div>
        <div class="info-box">Choose a JSON file and review it in the import wizard. Merge/replace, task selection, and entity mapping are handled inside the wizard before anything is saved.</div>
        <p class="muted">Task Packs are treated as templates. Entity IDs become mapping requirements instead of silently failing.</p>
      </div>
      <div class="card"><h2>Installed Task Packs</h2>
        ${installedPacks.length ? `<div class="summary-list">${installedPacks.map(pack => {
          const importedCount = Array.isArray(pack.imported_task_ids) ? pack.imported_task_ids.length : 0;
          const installedAt = pack.installed_at ? new Date(pack.installed_at).toLocaleString() : 'Not recorded';
          return `<div class="summary-line"><span><b>${this.escape(pack.name || pack.id || 'Task Pack')}</b><br><span class="muted">${this.escape(pack.id || '')}</span></span><span><b>${this.escape(pack.version || 'Unknown')}</b><br><span class="muted">${this.escape(installedAt)} • ${importedCount} task${importedCount === 1 ? '' : 's'}</span></span></div>`;
        }).join('')}</div>` : `<p class="muted">No Task Packs have been imported yet.</p>`}
      </div>
      <div class="card"><h2>Browse built-in packs</h2>
        <p class="muted">Local sample packs bundled with HMM. Installing opens the import review wizard first; nothing is saved until you confirm the wizard.</p>
        ${this.renderBuiltInTaskPackLibrary(installedPacks)}
      </div>
      <div class="card"><h2>Lookups</h2><p>Areas: ${this.metadata.areas.length}</p><p>Devices: ${this.metadata.devices.length}</p><p>Entities: ${this.metadata.entities.length}</p><p>Notify services: ${this.metadata.notify_services.length}</p><p>NFC tags: ${this.tags.length}</p><p>Categories: ${this.categories().length}</p></div>
    </div>`;
  }

  renderBuiltInTaskPackLibrary(installedPacks) {
    const installedIds = new Set((installedPacks || []).map(pack => pack.id).filter(Boolean));
    const packs = this.builtInTaskPacks || [];
    if (!packs.length) return `<p class="muted">No built-in Task Packs were found in this installation.</p>`;
    return `<div class="summary-list">${packs.map(pack => {
      const installed = pack.installed || installedIds.has(pack.id);
      const tags = [...(pack.categories || []), ...(pack.tags || [])].slice(0, 8);
      return `<div class="wizard-section-card">
        <div class="review-title-row"><h3>${this.escape(pack.name || pack.id || 'Task Pack')}</h3><span class="pill ${installed ? 'ok' : ''}">${installed ? 'Installed' : 'Not installed'}</span></div>
        <p class="muted">${this.escape(pack.description || '')}</p>
        <div class="summary-line"><span>Tasks</span><b>${Number(pack.task_count || 0)}</b></div>
        ${tags.length ? `<div>${tags.map(tag => `<span class="category-pill">${this.escape(tag)}</span>`).join('')}</div>` : ''}
        <div class="task-actions" style="margin-top:10px;"><button class="btn ${installed ? '' : 'primary'}" data-install-built-in-pack="${this.escape(pack.id)}">${installed ? 'Review again' : 'Install'}</button></div>
      </div>`;
    }).join('')}</div>`;
  }

  renderTaskPackExportModal() {
    if (!this.taskPackExportOpen) return '';
    const defaultName = 'My Maintenance Task Pack';
    const defaultId = `hmm.${this.slug(defaultName).replace(/_/g, '.')}`;
    const taskRows = this.tasks.slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(t => {
      const schedule = (t.rules || []).map(r => this.ruleTypeLabel(r.type)).join(' + ') || 'No schedule';
      return `<label class="review-row">
        <span class="review-check"><input type="checkbox" class="task-pack-export-task" value="${this.escape(t.id)}" checked></span>
        <span class="review-main"><span class="review-title-row"><h3>${this.escape(t.name || t.id)}</h3><span class="category-pill">${this.escape(this.category(t))}</span></span><span class="muted">${this.escape(schedule)}</span></span>
      </label>`;
    }).join('');
    return `<div class="modal-scrim" data-action="task-pack-export-scrim">
      <div class="modal import-wizard" role="dialog" aria-modal="true" aria-label="Export Task Pack">
        <div class="modal-head sticky-head">
          <div><div class="muted">Task Pack Export</div><h2>Export selected tasks as a Task Pack</h2><div class="muted">Task Packs are templates. Runtime history, NFC tags, device IDs, and private notification targets are stripped during export.</div></div>
          <button class="btn" data-action="close-task-pack-export">Close</button>
        </div>
        <div class="wizard-panel">
          <div class="wizard-section-card"><h3>Pack metadata</h3>
            <div class="form-grid">
              <div class="form-field span-6"><label>Pack name</label><input id="task-pack-name" value="${this.escape(defaultName)}"></div>
              <div class="form-field span-6"><label>Pack ID</label><input id="task-pack-id" value="${this.escape(defaultId)}"><div class="help">Use a stable lowercase ID, for example <code>hmm.basic_homeowner</code>.</div></div>
              <div class="form-field span-4"><label>Version</label><input id="task-pack-version" value="1.0.0"></div>
              <div class="form-field span-4"><label>Author</label><input id="task-pack-author" placeholder="Optional"></div>
              <div class="form-field span-4"><label>Tags</label><input id="task-pack-tags" placeholder="homeowner, hvac, seasonal"></div>
              <div class="form-field span-12"><label>Description</label><textarea id="task-pack-description" placeholder="What this pack is for and when to use it."></textarea></div>
            </div>
          </div>
          <div class="wizard-section-card"><h3>Tasks</h3><p class="muted">Select the tasks to include. The exported JSON can be shared or re-imported through the HMM import wizard.</p>
            <div class="task-actions"><button class="btn small" type="button" data-action="select-all-task-pack-export">Select all</button><button class="btn small" type="button" data-action="select-none-task-pack-export">Select none</button></div>
          </div>
          <div class="review-list">${taskRows || '<div class="empty-list">No tasks are available to export.</div>'}</div>
        </div>
        <div class="modal-actions-bottom sticky-actions">
          <div><span id="task-pack-export-count">${this.tasks.length}</span> selected</div>
          <div class="right"><button class="btn" data-action="close-task-pack-export">Cancel</button><button class="btn primary" data-action="export-task-pack">Export Task Pack</button></div>
        </div>
      </div>
    </div>`;
  }


  renderImportWizardModal() {
    if (!this.importWizardOpen || !this.importPreview) return '';
    const p = this.importPreview;
    const counts = p.counts || {};
    const entity = p.entity_counts || {};
    const total = (p.tasks || []).length;
    const selected = (p.tasks || []).filter(t => t.selected && t.status !== 'invalid').length;
    const requiredMissing = Number(entity.required_missing || 0);
    const missing = Number(entity.missing || 0);
    const requirements = Array.isArray(p.entity_requirements) ? p.entity_requirements : [];
    const step = this.importWizardStep || 1;
    const warnings = (p.warnings || []).map(w=>`<div class="wizard-alert">${this.escape(w)}</div>`).join('');
    const canApply = selected > 0;
    const steps = [[1,'Analyze'],[2,'Review tasks'],[3,'Map entities'],[4,'Import options'],[5,'Summary']]
      .map(([num,label])=>`<button class="step ${step===num?'active':''}" data-import-step="${num}"><b>${num}</b>${label}</button>`).join('');
    return `<div class="modal-scrim import-wizard-scrim" data-action="import-wizard-scrim">
      <div class="modal import-wizard" role="dialog" aria-modal="true" aria-label="Import review">
        <div class="modal-head sticky-head">
          <div>
            <div class="muted">Import Review Wizard</div>
            <h2>${this.escape(p.pack_name || 'HMM Import')}</h2>
            <div class="muted">${this.escape(p.package_type || 'backup')} • Nothing has been saved yet</div>
          </div>
          <button class="btn" data-action="close-import-wizard">Close</button>
        </div>
        <div class="wizard-stepper">${steps}</div>
        <div class="wizard-summary-grid">
          <div class="summary-tile"><div class="summary-value">${total}</div><div class="muted">Tasks in file</div></div>
          <div class="summary-tile"><div class="summary-value">${selected}</div><div class="muted">Selected</div></div>
          <div class="summary-tile"><div class="summary-value">${requirements.length}</div><div class="muted">Requirements</div></div>
          <div class="summary-tile"><div class="summary-value">${missing}</div><div class="muted">Missing entities</div></div>
          <div class="summary-tile ${requiredMissing ? 'attention' : ''}"><div class="summary-value">${requiredMissing}</div><div class="muted">Required missing</div></div>
        </div>
        ${warnings}
        ${step===1 ? this.renderImportWizardAnalyzeStep(p, counts, entity) : ''}
        ${step===2 ? this.renderImportWizardTaskStep(p, counts, missing) : ''}
        ${step===3 ? this.renderImportWizardEntityStep(p) : ''}
        ${step===4 ? this.renderImportWizardOptionsStep(p) : ''}
        ${step===5 ? this.renderImportWizardSummaryStep(p, selected) : ''}
        <div class="modal-actions-bottom sticky-actions">
          <div><b>${selected}</b> selected of ${total} task${total === 1 ? '' : 's'}</div>
          <div class="right">
            <button class="btn" data-action="close-import-wizard">Cancel</button>
            ${step>1 ? `<button class="btn" data-action="import-step-prev">Back</button>` : ''}
            ${step<5 ? `<button class="btn primary" data-action="import-step-next">Next</button>` : `<button class="btn primary" data-action="apply-import-json" ${canApply ? '' : 'disabled'}>${this.importMode === 'replace' ? 'Replace with selected' : 'Import selected'}</button>`}
          </div>
        </div>
      </div>
    </div>`;
  }

  renderImportWizardAnalyzeStep(p, counts, entity) {
    const exported = p.exported_at ? new Date(p.exported_at).toLocaleString() : 'Not provided';
    const isPack = p.package_type === 'task_pack';
    const pack = p.pack || {};
    const requirements = Array.isArray(p.entity_requirements) ? p.entity_requirements : [];
    return `<div class="wizard-panel">
      <div class="wizard-section-card"><h3>File analysis</h3>
        <p><b>Type:</b> ${this.escape(p.package_type || 'backup')}</p>
        <p><b>Version:</b> ${this.escape(String(p.format_version || 'Not provided'))}</p>
        <p><b>Exported:</b> ${this.escape(exported)}</p>
        <p><b>Settings included:</b> ${p.settings_present ? 'Yes' : 'No'}</p>
      </div>
      ${isPack ? `<div class="wizard-section-card"><h3>Task Pack metadata</h3>
        <div class="summary-list">
          <div class="summary-line"><span>Pack ID</span><b>${this.escape(pack.id || 'Not provided')}</b></div>
          <div class="summary-line"><span>Name</span><b>${this.escape(pack.name || p.pack_name || 'Task Pack')}</b></div>
          <div class="summary-line"><span>Pack version</span><b>${this.escape(pack.version || 'Not provided')}</b></div>
          <div class="summary-line"><span>Author</span><b>${this.escape(pack.author || 'Not provided')}</b></div>
          <div class="summary-line"><span>Source</span><b>${this.escape(pack.source || pack.source_url || 'Not provided')}</b></div>
          <div class="summary-line"><span>Provenance</span><b>${this.escape(pack.provenance?.kind || 'community')}</b></div>
        </div>
        ${pack.description ? `<p class="muted">${this.escape(pack.description)}</p>` : ''}
      </div>
      <div class="wizard-section-card"><h3>Template safety</h3>
        <p class="muted">Task Packs always merge. They cannot replace full storage, remove existing tasks, import settings, or restore deleted tombstones. Runtime/history, NFC tag IDs, Home Assistant device IDs, and private notification targets are ignored.</p>
      </div>` : ''}
      <div class="wizard-section-card"><h3>Impact preview</h3>
        <div class="summary-list">
          <div class="summary-line"><span>New tasks</span><b>${counts.new || 0}</b></div>
          <div class="summary-line"><span>Updates</span><b>${counts.update || 0}</b></div>
          <div class="summary-line"><span>Duplicates</span><b>${counts.duplicate || 0}</b></div>
          <div class="summary-line"><span>Previously deleted</span><b>${counts.deleted || 0}</b></div>
          <div class="summary-line"><span>Invalid</span><b>${counts.invalid || 0}</b></div>
          <div class="summary-line"><span>Entities found</span><b>${entity.found || 0}</b></div>
          <div class="summary-line"><span>Entities missing</span><b>${entity.missing || 0}</b></div>
          ${isPack ? `<div class="summary-line"><span>Entity requirements</span><b>${requirements.length}</b></div>` : ''}
        </div>
      </div>
      ${isPack ? this.renderTaskPackRequirements(requirements) : ''}
      ${(entity.required_missing || 0) ? `<div class="wizard-warning"><b>Entity mapping recommended:</b> required runtime/counter entities are missing. Map them in step 3 or those tasks will be imported paused.</div>` : ''}
    </div>`;
  }

  renderTaskPackRequirements(requirements) {
    if (!requirements.length) return `<div class="wizard-section-card"><h3>Entity requirements</h3><p class="muted">This Task Pack does not declare entity requirements.</p></div>`;
    return `<div class="wizard-section-card"><h3>Entity requirements</h3>
      <div class="summary-list">
        ${requirements.map(req => `<div class="summary-line"><span>${this.escape(req.name || req.id)}</span><b>${this.escape(req.required ? 'Required' : 'Optional')}</b></div><p class="muted">${this.escape([req.role, req.domain, req.description].filter(Boolean).join(' • ') || req.id)}</p>`).join('')}
      </div>
    </div>`;
  }

  renderImportWizardTaskStep(p, counts, missing) {
    const total = (p.tasks || []).length;
    const filters = [
      ['all', `All (${total})`], ['new', `New (${counts.new || 0})`], ['update', `Updates (${counts.update || 0})`],
      ['duplicate', `Duplicates (${counts.duplicate || 0})`], ['deleted', `Deleted (${counts.deleted || 0})`],
      ['invalid', `Invalid (${counts.invalid || 0})`], ['missing_entities', `Missing entities (${missing || 0})`],
    ];
    const rows = (p.tasks || []).filter(t => {
      const f = this.importStatusFilter || 'all';
      if (f === 'all') return true;
      if (f === 'missing_entities') return (t.entities || []).some(e => e.status === 'missing');
      return t.status === f;
    }).map(t => this.renderImportTaskReviewRow(t)).join('');
    return `<div class="wizard-controls">
      <div><label>Show</label><div class="chip-row">${filters.map(([id,label]) => `<button class="chip ${this.importStatusFilter === id ? 'active' : ''}" data-import-filter="${id}">${this.escape(label)}</button>`).join('')}</div></div>
      <div class="wizard-bulk-actions"><button class="btn small" data-action="select-all-import">Select all valid</button><button class="btn small" data-action="select-none-import">Select none</button></div>
    </div><div class="review-list">${rows || '<div class="empty-list">No tasks match this filter.</div>'}</div>`;
  }

  importMissingEntityRefs() {
    const rows = [];
    const byEntity = new Map();
    for (const t of (this.importPreview?.tasks || [])) {
      if (!t.selected || t.status === 'invalid') continue;
      for (const e of (t.entities || [])) {
        if (e.status !== 'missing') continue;
        const key = e.entity_id;
        if (!byEntity.has(key)) byEntity.set(key, {...e, tasks: [], required: !!e.required, roles: new Set()});
        const ref = byEntity.get(key);
        ref.required = ref.required || !!e.required;
        if (e.role) ref.roles.add(e.role);
        ref.tasks.push({
          id: t.id,
          name: t.name || 'Unnamed task',
          category: t.category || 'General',
          status: t.status || 'unknown',
          schedule_type: t.schedule_type || t.schedule?.type || '',
          frequency: t.frequency || t.interval || '',
          last_completed: t.last_completed || t.last_done || '',
          due_date: t.due_date || t.next_due || '',
          description: t.description || t.notes || t.instructions || '',
          required: !!e.required,
          role: e.role || 'entity',
        });
      }
    }
    for (const ref of byEntity.values()) {
      ref.role = ref.roles?.size ? Array.from(ref.roles).join(', ') : ref.role;
      delete ref.roles;
      rows.push(ref);
    }
    return rows;
  }

  importTaskScheduleSummary(t) {
    const bits = [];
    if (t.schedule_type) bits.push(String(t.schedule_type).replace(/_/g, ' '));
    if (t.frequency) bits.push(`Every ${t.frequency}`);
    if (t.last_completed) bits.push(`Last done ${this.dateShort(t.last_completed)}`);
    if (t.due_date) bits.push(`Due ${this.dateShort(t.due_date)}`);
    return bits.join(' • ');
  }

  renderEntityMapTaskContext(task) {
    const schedule = this.importTaskScheduleSummary(task);
    const desc = (task.description || '').replace(/\s+/g, ' ').trim();
    return `<div class="entity-context-card">
      <div class="entity-context-title"><span>${this.escape(task.name)}</span><span class="pill ${task.required ? 'warn' : ''}">${this.escape(task.required ? 'Required' : 'Optional')}</span></div>
      <div class="entity-context-meta">${this.escape(task.category || 'General')} • ${this.escape(task.role || 'entity')} • ${this.escape(task.status || 'unknown')}${schedule ? ` • ${this.escape(schedule)}` : ''}</div>
      ${desc ? `<div class="entity-context-note">${this.escape(desc.slice(0, 180))}${desc.length > 180 ? '…' : ''}</div>` : ''}
    </div>`;
  }

  renderImportWizardEntityStep(p) {
    const refs = this.importMissingEntityRefs();
    if (!refs.length) return `<div class="wizard-panel"><div class="wizard-section-card"><h3>Entity mapping</h3><p class="muted">No missing entities were found for the selected tasks.</p></div></div>`;
    const mapped = refs.filter(ref => {
      const value = this.importEntityMapping?.[ref.entity_id];
      return value && !['__unresolved__','__clear__'].includes(value);
    }).length;
    const cleared = refs.filter(ref => this.importEntityMapping?.[ref.entity_id] === '__clear__').length;
    const required = refs.filter(ref => ref.required).length;
    const optional = refs.length - required;
    const filter = this.importEntityFilter || 'all';
    const visibleRefs = refs.filter(ref => filter === 'all' || (filter === 'required' ? ref.required : !ref.required));
    const index = Math.max(0, Math.min(Number(this.importEntityQueueIndex || 0), Math.max(visibleRefs.length - 1, 0)));
    this.importEntityQueueIndex = index;
    const current = visibleRefs[index] || visibleRefs[0] || refs[0];
    const currentPosition = refs.findIndex(ref => ref.entity_id === current.entity_id) + 1;
    return `<div class="wizard-panel">
      <div class="wizard-section-card"><h3>Map entity requirements</h3><p class="muted">Review each unresolved Task Pack requirement. Required runtime and meter requirements may stay unresolved, but affected tasks will import paused until mapped.</p></div>
      <div class="wizard-summary-grid" style="padding:0 0 12px;">
        <div class="summary-tile"><div class="summary-value">${refs.length}</div><div class="muted">Total unresolved</div></div>
        <div class="summary-tile ${required ? 'attention' : ''}"><div class="summary-value">${required}</div><div class="muted">Required</div></div>
        <div class="summary-tile"><div class="summary-value">${optional}</div><div class="muted">Optional</div></div>
        <div class="summary-tile"><div class="summary-value">${mapped}</div><div class="muted">Mapped</div></div>
      </div>
      <div class="wizard-controls">
        <div><label>Queue</label><div class="chip-row">${[['all','All'],['required','Required'],['optional','Optional']].map(([id,label]) => `<button class="chip ${filter===id?'active':''}" data-entity-filter="${id}">${label}</button>`).join('')}</div></div>
        <div class="muted">Entity ${currentPosition || 1} of ${refs.length} • ${cleared} cleared</div>
      </div>
      <div class="entity-queue-layout">
        <div class="entity-queue-list">
          ${visibleRefs.map((ref, idx) => this.renderEntityQueueItem(ref, idx, current.entity_id)).join('')}
        </div>
        ${this.renderEntityMapRow(current, currentPosition, refs.length)}
      </div>
    </div>`;
  }

  renderEntityQueueItem(ref, idx, activeId) {
    const value = this.importEntityMapping?.[ref.entity_id] || '__unresolved__';
    const mapped = value && !['__unresolved__','__clear__'].includes(value);
    const status = mapped ? 'Mapped' : value === '__clear__' ? 'Cleared' : 'Unresolved';
    const label = ref.entity_requirement_label || ref.entity_requirement_name || ref.name || ref.entity_id;
    return `<button class="entity-queue-item ${activeId === ref.entity_id ? 'active' : ''} ${mapped ? 'mapped' : ''}" data-entity-queue-index="${idx}">
      <b>${this.escape(label)}</b>
      <div class="muted">${this.escape(ref.required ? 'Required' : 'Optional')} • ${this.escape(ref.role || 'entity')} • ${this.escape(status)}</div>
    </button>`;
  }

  renderEntityMapRow(ref, position=1, total=1) {
    const current = this.importEntityMapping?.[ref.entity_id] || '__unresolved__';
    const suggestions = (ref.suggestions || []).slice(0,6).map(item => typeof item === 'string' ? {entity_id:item, name:item, reasons:[], score:0} : item);
    const requirementName = ref.entity_requirement_label || ref.entity_requirement_name || ref.name || '';
    const title = requirementName || ref.entity_id;
    const expected = [
      ['Domain', ref.domain],
      ['Device class', ref.device_class],
      ['State class', ref.state_class],
      ['Unit', ref.unit_of_measurement],
    ];
    const requiredHelp = ref.required
      ? 'If left unresolved or cleared, affected runtime/meter tasks will be imported paused.'
      : 'Optional references can be kept for later, cleared, or mapped now.';
    return `<div class="entity-queue-panel">
      <div>
        <div class="muted">Entity ${position} of ${total}</div>
        <div class="pill ${ref.required ? 'warn' : ''}">${ref.required ? 'Required' : 'Optional'} ${this.escape(ref.role || 'entity')}</div>
        <h3 class="entity-original">${this.escape(title)}</h3>
        <div class="muted">Placeholder: <code>${this.escape(ref.entity_id)}</code></div>
        ${ref.description ? `<p>${this.escape(ref.description)}</p>` : '<p class="muted">No description was provided by this pack.</p>'}
        <div class="entity-meta-grid">
          ${expected.map(([label,value]) => `<div class="entity-meta-tile"><div class="key">${label}</div><div>${this.escape(value || 'Any')}</div></div>`).join('')}
        </div>
        <div class="info-box">${this.escape(requiredHelp)}</div>
        <div class="muted">Used by ${ref.tasks?.length || 0} selected imported task${(ref.tasks?.length || 0) === 1 ? '' : 's'}</div>
        <div class="entity-map-context">
          ${(ref.tasks || []).slice(0,4).map(t => this.renderEntityMapTaskContext(t)).join('')}
          ${(ref.tasks || []).length > 4 ? `<div class="entity-context-more">+${(ref.tasks || []).length - 4} more task${((ref.tasks || []).length - 4) === 1 ? '' : 's'} use this entity</div>` : ''}
        </div>
      </div>
      <div class="entity-map-actions">
        <label><input type="radio" name="map-${this.escape(ref.entity_id)}" data-map-entity="${this.escape(ref.entity_id)}" value="__unresolved__" ${current==='__unresolved__'?'checked':''}> ${ref.required ? 'Keep unresolved and pause affected tasks' : 'Keep unresolved and map later'}</label>
        <label><input type="radio" name="map-${this.escape(ref.entity_id)}" data-map-entity="${this.escape(ref.entity_id)}" value="__clear__" ${current==='__clear__'?'checked':''}> Clear this reference from imported tasks</label>
        <h4>Suggested entities</h4>
        ${suggestions.length ? `<div class="suggestion-list">${suggestions.map(x=>`<button class="suggestion-card" data-map-suggestion="${this.escape(ref.entity_id)}" data-map-value="${this.escape(x.entity_id)}"><span class="score">${this.escape((x.reasons || []).join(', ') || 'match')}</span><b>${this.escape(x.name || x.entity_id)}</b><div class="muted">${this.escape(x.entity_id)}${x.unit_of_measurement ? ' • '+this.escape(x.unit_of_measurement) : ''}${x.device_class ? ' • '+this.escape(x.device_class) : ''}</div></button>`).join('')}</div>` : '<div class="muted">No relevant suggestions found.</div>'}
        <details class="entity-picker-fallback">
          <summary class="btn small">Open Entity Picker</summary>
          <label><input type="radio" name="map-${this.escape(ref.entity_id)}" data-map-entity="${this.escape(ref.entity_id)}" value="__manual__" ${current && !['__unresolved__','__clear__'].includes(current)?'checked':''}> Use selected entity from picker</label>
          <ha-entity-picker data-map-picker="${this.escape(ref.entity_id)}" allow-custom-entity></ha-entity-picker>
        </details>
        <div class="task-actions"><button class="btn small" data-action="entity-queue-prev">Previous</button><button class="btn small primary" data-action="entity-queue-next">Next</button></div>
      </div>
    </div>`;
  }

  renderImportWizardOptionsStep(p) {
    const isPack = p.package_type === 'task_pack';
    const hasUpdates = (p.counts?.update || 0) > 0;
    const hasDeleted = (p.counts?.deleted || 0) > 0;
    const selected = (p.tasks || []).filter(t => t.selected && t.status !== 'invalid').length;
    return `<div class="wizard-panel">
      <div class="wizard-section-card"><h3>Import options</h3>
        <p class="muted">These choices control what happens when you press Import on the next page. Your selected tasks and entity mappings are preserved while you move between wizard steps.</p>
        <div class="summary-list">
          <div class="summary-line"><span>Selected tasks</span><b>${selected}</b></div>
          <div class="summary-line"><span>Import type</span><b>${isPack ? 'Task Pack' : 'Backup export'}</b></div>
        </div>
      </div>
      ${!isPack ? `<div class="wizard-section-card"><h3>Apply mode</h3>
        <p class="muted"><b>Merge</b> is safest for normal imports. It adds new selected tasks and updates selected matching tasks without deleting your other HMM tasks.</p>
        <label class="option-card"><input type="radio" name="wizard-import-mode" value="merge" ${this.importMode !== 'replace' ? 'checked' : ''}> <span><b>Merge selected tasks</b><br><span class="muted">Keep existing HMM data. Add/update only the tasks selected in this wizard.</span></span></label>
        <label class="option-card danger-option"><input type="radio" name="wizard-import-mode" value="replace" ${this.importMode === 'replace' ? 'checked' : ''}> <span><b>Replace HMM tasks with selected tasks</b><br><span class="muted">Recovery/migration mode. Existing HMM tasks not selected here will be removed.</span></span></label>
      </div>` : `<div class="wizard-section-card"><h3>Apply mode</h3><p class="muted">Task Packs are templates, so they always use merge mode. They add selected tasks without replacing your existing HMM data, importing settings, or restoring deleted tasks.</p></div>`}
      <div class="wizard-section-card"><h3>Settings and deleted tasks</h3>
        <label class="check-row"><input type="checkbox" id="import-settings" ${isPack ? '' : 'checked'} ${isPack ? 'disabled' : ''}> Import HMM settings from this backup</label>
        <p class="muted">Use this when restoring your own backup. Leave it off when you only want tasks.</p>
        <label class="check-row"><input type="checkbox" id="restore-deleted" ${hasDeleted ? '' : 'disabled'}> Allow previously deleted tasks to be restored</label>
        <p class="muted">Normally HMM protects you from resurrecting tasks you already deleted. Turn this on only when you intentionally want those tasks back.</p>
        ${hasUpdates ? '<div class="info-box"><b>Updates found:</b> selected tasks with matching IDs will update existing tasks when merge mode is used.</div>' : ''}
        ${hasDeleted ? '' : '<p class="muted">No previously deleted tasks were detected in this import.</p>'}
      </div>
    </div>`;
  }

  renderImportWizardSummaryStep(p, selected) {
    const entitySummary = this.importEntityMappingSummary();
    const normalTasks = Math.max(0, selected - entitySummary.pausedTasks);
    return `<div class="wizard-panel">
      <div class="wizard-section-card"><h3>Ready to import</h3>
        <div class="summary-list">
          <div class="summary-line"><span>Selected tasks</span><b>${selected}</b></div>
          <div class="summary-line"><span>Mode</span><b>${p.package_type === 'task_pack' ? 'Merge' : (this.importMode === 'replace' ? 'Replace' : 'Merge')}</b></div>
          <div class="summary-line"><span>Mapped entities</span><b>${entitySummary.mapped}</b></div>
          <div class="summary-line"><span>Cleared optional references</span><b>${entitySummary.clearedOptional}</b></div>
          <div class="summary-line"><span>Skipped optional references</span><b>${entitySummary.skipped}</b></div>
          <div class="summary-line"><span>Unresolved required entities</span><b>${entitySummary.requiredUnresolved}</b></div>
          <div class="summary-line"><span>Tasks imported paused</span><b>${entitySummary.pausedTasks}</b></div>
          <div class="summary-line"><span>Tasks imported normally</span><b>${normalTasks}</b></div>
          <div class="summary-line"><span>Unresolved missing entities</span><b>${entitySummary.unresolved}</b></div>
        </div>
        ${entitySummary.pausedTasks ? '<div class="wizard-warning"><b>Note:</b> tasks with unresolved or cleared required runtime/meter entities will import paused instead of calculating due status from the wrong source.</div>' : ''}
      </div>
    </div>`;
  }

  importEntityMappingSummary() {
    const refs = this.importMissingEntityRefs();
    const pausedTaskIds = new Set();
    let mapped = 0, cleared = 0, clearedOptional = 0, clearedRequired = 0, skipped = 0, unresolved = 0, requiredUnresolved = 0;
    for (const ref of refs) {
      const action = this.importEntityMapping?.[ref.entity_id] || '__unresolved__';
      if (action && !['__unresolved__','__clear__'].includes(action)) mapped += 1;
      else if (action === '__clear__') {
        cleared += 1;
        if (ref.required) clearedRequired += 1;
        else clearedOptional += 1;
      }
      else {
        unresolved += 1;
        if (ref.required) requiredUnresolved += 1;
        else skipped += 1;
      }
      if (ref.required && (action === '__unresolved__' || action === '__clear__')) {
        for (const task of ref.tasks || []) pausedTaskIds.add(task.id);
      }
    }
    return { mapped, cleared, clearedOptional, clearedRequired, skipped, unresolved, requiredUnresolved, pausedTasks: pausedTaskIds.size };
  }

  renderImportTaskReviewRow(t) {
    const entities = t.entities || [];
    const missingEntities = entities.filter(e => e.status === 'missing');
    const entityStatus = entities.length
      ? `${entities.length - missingEntities.length} found • ${missingEntities.length} missing`
      : 'No entity references';
    const checked = t.selected ? 'checked' : '';
    const disabled = t.status === 'invalid' ? 'disabled' : '';
    const statusClass = t.status === 'new' ? 'ok' : t.status === 'invalid' || t.required_entity_missing ? 'warn' : '';
    const pauseNote = t.required_entity_missing ? '<div class="entity-warning">Required entity missing. This task will be imported paused unless remapped in the entity mapping step.</div>' : '';
    const entityList = missingEntities.slice(0, 3).map(e => `<code>${this.escape(e.entity_id || e.id || '')}</code>`).join(' ');
    return `<div class="review-row ${disabled ? 'disabled' : ''}">
      <div class="review-check"><input type="checkbox" class="import-task-select" data-task-id="${this.escape(t.id)}" ${checked} ${disabled}></div>
      <div class="review-main">
        <div class="review-title-row"><h3>${this.escape(t.name || 'Unnamed task')}</h3><span class="pill ${statusClass}">${this.escape(t.status || 'unknown')}</span></div>
        <div class="muted">${this.escape(t.category || 'General')} • ${this.escape(entityStatus)}</div>
        ${pauseNote}
        ${entityList ? `<div class="missing-entity-list">Missing: ${entityList}${missingEntities.length > 3 ? ` +${missingEntities.length - 3} more` : ''}</div>` : ''}
      </div>
    </div>`;
  }

  renderImportPreview() { return ''; }

  async exportJson() {
    try {
      const data = await this._hass.callWS({ type: 'home_maintenance_manager/export_data' });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `home_maintenance_manager_export_${stamp}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      alert(`Export failed: ${err?.message || err}`);
    }
  }

  openTaskPackExport() {
    if (!this.tasks.length) {
      alert('Create at least one maintenance task before exporting a Task Pack.');
      return;
    }
    this.taskPackExportOpen = true;
    this.render();
  }

  taskPackExportMetadata() {
    const q = id => this.shadowRoot.getElementById(id)?.value?.trim() || '';
    const tags = q('task-pack-tags').split(',').map(tag => tag.trim()).filter(Boolean);
    return {
      name: q('task-pack-name'),
      id: q('task-pack-id'),
      version: q('task-pack-version') || '1.0.0',
      author: q('task-pack-author'),
      description: q('task-pack-description'),
      tags,
      source: 'manual_export',
      min_hmm_version: '0.7.3',
      provenance: { kind: 'manual', source: 'export' },
    };
  }

  selectedTaskPackExportIds() {
    return Array.from(this.shadowRoot.querySelectorAll('.task-pack-export-task')).filter(el=>el.checked).map(el=>el.value);
  }

  updateTaskPackExportCount() {
    const el = this.shadowRoot.getElementById('task-pack-export-count');
    if (el) el.textContent = String(this.selectedTaskPackExportIds().length);
  }

  async exportTaskPack() {
    const pack = this.taskPackExportMetadata();
    if (!pack.name || !pack.id || !pack.version) {
      alert('Pack name, Pack ID, and Version are required.');
      return;
    }
    const task_ids = this.selectedTaskPackExportIds();
    if (!task_ids.length) {
      alert('Select at least one task to export.');
      return;
    }
    try {
      const data = await this._hass.callWS({ type: 'home_maintenance_manager/export_task_pack', task_ids, pack });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${this.slug(pack.id || pack.name)}_${stamp}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      this.taskPackExportOpen = false;
      this.render();
    } catch (err) {
      alert(`Task Pack export failed: ${err?.message || err}`);
    }
  }

  async previewImportJson() {
    const fileInput = this.shadowRoot.getElementById('import-json-file');
    const file = fileInput?.files?.[0];
    if (!file) { alert('Choose a Home Maintenance Manager JSON file first.'); return; }
    this.importMode = 'merge';
    try {
      const text = await file.text();
      this.importPackage = JSON.parse(text);
      this.importPreview = await this._hass.callWS({ type: 'home_maintenance_manager/import_preview', mode: this.importMode, data: this.importPackage });
      if (this.importPreview?.package_type === 'task_pack') this.importMode = 'merge';
      this.importStatusFilter = 'all';
      this.importEntityFilter = 'all';
      this.importEntityQueueIndex = 0;
      this.importEntityMapping = {};
      this.importWizardStep = 1;
      this.importWizardOpen = true;
      this.render();
    } catch (err) {
      alert(`Import preview failed: ${err?.message || err}`);
    }
  }

  async installBuiltInTaskPack(packId) {
    try {
      const pack = await this._hass.callWS({ type: 'home_maintenance_manager/get_built_in_task_pack', pack_id: packId });
      this.importMode = 'merge';
      this.importPackage = pack;
      this.importPreview = await this._hass.callWS({ type: 'home_maintenance_manager/import_preview', mode: 'merge', data: pack });
      this.importStatusFilter = 'all';
      this.importEntityFilter = 'all';
      this.importEntityQueueIndex = 0;
      this.importEntityMapping = {};
      this.importWizardStep = 1;
      this.importWizardOpen = true;
      this.render();
    } catch (err) {
      alert(`Could not open built-in Task Pack: ${err?.message || err}`);
    }
  }

  captureImportSelections() {
    if (!this.importPreview?.tasks) return;
    const boxes = Array.from(this.shadowRoot.querySelectorAll('.import-task-select'));
    // Only the task review step renders task checkboxes. Do not treat steps without
    // checkboxes as an empty selection, or moving through the wizard will clear
    // previously selected tasks.
    if (!boxes.length) return;
    const checked = new Set(boxes.filter(el=>el.checked).map(el=>el.dataset.taskId));
    for (const task of this.importPreview.tasks) {
      if (task.status !== 'invalid') task.selected = checked.has(task.id);
    }
  }

  selectedImportIds() {
    this.captureImportSelections();
    if (this.importPreview?.tasks) {
      return this.importPreview.tasks.filter(t => t.selected && t.status !== 'invalid').map(t => t.id);
    }
    return Array.from(this.shadowRoot.querySelectorAll('.import-task-select')).filter(el=>el.checked).map(el=>el.dataset.taskId);
  }

  captureEntityMapping() {
    const mapping = {...(this.importEntityMapping || {})};
    this.shadowRoot.querySelectorAll('[data-map-entity]').forEach(el => {
      if (!el.checked) return;
      const id = el.dataset.mapEntity;
      if (el.value === '__manual__') {
        const picker = this.shadowRoot.querySelector(`[data-map-picker="${CSS.escape(id)}"]`);
        mapping[id] = picker?.value || mapping[id] || '__unresolved__';
      } else {
        mapping[id] = el.value;
      }
    });
    this.importEntityMapping = mapping;
    return mapping;
  }

  filteredImportEntityRefs() {
    const filter = this.importEntityFilter || 'all';
    return this.importMissingEntityRefs().filter(ref => filter === 'all' || (filter === 'required' ? ref.required : !ref.required));
  }

  advanceEntityQueue(delta=1) {
    const refs = this.filteredImportEntityRefs();
    if (!refs.length) return;
    this.importEntityQueueIndex = Math.max(0, Math.min((this.importEntityQueueIndex || 0) + delta, refs.length - 1));
  }

  autoAdvanceEntityQueue() {
    const before = this.importEntityQueueIndex || 0;
    this.advanceEntityQueue(1);
    if ((this.importEntityQueueIndex || 0) === before) {
      this.render();
      return;
    }
    this.render();
  }

  captureImportWizardOptions() {
    const mode = this.shadowRoot.querySelector('input[name="wizard-import-mode"]:checked')?.value;
    if (mode) this.importMode = mode;
    if (this.importPreview?.package_type === 'task_pack') this.importMode = 'merge';
    this.captureEntityMapping();
  }

  async applyImportJson() {
    if (!this.importPackage || !this.importPreview) { alert('Preview an import first.'); return; }
    this.captureImportWizardOptions();
    const selected_ids = this.selectedImportIds();
    if (!selected_ids.length) { alert('Select at least one task to import.'); return; }
    if (this.importMode === 'replace' && !confirm(`Replace existing HMM tasks with ${selected_ids.length} selected imported task(s)? This cannot be undone except by restoring a backup or importing another export.`)) return;
    try {
      const import_settings = !!this.shadowRoot.getElementById('import-settings')?.checked;
      const restore_deleted = !!this.shadowRoot.getElementById('restore-deleted')?.checked;
      const result = await this._hass.callWS({ type: 'home_maintenance_manager/import_apply', mode: this.importMode, data: this.importPackage, selected_ids, import_settings, restore_deleted, entity_mapping: this.captureEntityMapping() });
      alert(`Import complete.\nNew tasks imported: ${result.new_tasks ?? 0}\nUpdated tasks: ${result.updated_tasks ?? 0}\nPaused due to unresolved entities: ${result.paused_due_to_unresolved_entities ?? 0}\nSkipped: ${result.skipped ?? 0}\nTasks now: ${result.after_tasks ?? 0}`);
      this.importPackage = null; this.importPreview = null; this.importWizardOpen = false; this.importEntityMapping = {}; this.importWizardStep = 1;
      await this.loadData();
    } catch (err) {
      alert(`Import failed: ${err?.message || err}`);
    }
  }

  importJson() { return this.previewImportJson(); }

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

  taskGeneratedDeviceId(task) {
    return task?.summary?.generated_device_id || task?.generated_device_id || '';
  }

  openTaskDevice(taskId) {
    const task = this.tasks.find(t => t.id === taskId) || this.modal?.detail || this.modal?.task;
    const deviceId = this.taskGeneratedDeviceId(task);
    if (!deviceId) {
      alert('Home Assistant has not registered this task device yet. Refresh or reload the integration after saving the task.');
      return;
    }
    history.pushState(null, '', `/config/devices/device/${encodeURIComponent(deviceId)}`);
    window.dispatchEvent(new CustomEvent('location-changed'));
  }

  renderTaskDetailModal(t) {
    const status = this.taskStatus(t);
    const scan = this.lastNfcScan(t);
    const recent = (t.activity_history || []).slice().sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))).slice(0,8);
    const completed = (t.completion_history || []).slice().sort((a,b)=>String(b.completed_at||b.at||'').localeCompare(String(a.completed_at||a.at||''))).slice(0,8);
    const progress = t.summary || {};
    const percent = this.percent(t);
    const seasonalCard = this.seasonalSummary(t);
    const trackingCard = this.trackingSourceHtml(t);
    const scheduleLabel = (t.rules || []).map(r => this.ruleTypeLabel(r.type)).join(' + ') || 'Not configured';
    const nextDueLabel = status === 'season_paused' && progress.next_season_start ? `Season opens ${this.dateShort(progress.next_season_start)}` : this.dateShort(progress.next_due);
    return `<div class="modal-scrim" data-action="detail-scrim"><div class="modal" data-modal-content>
      <div class="modal-head"><div><h2>${this.escape(t.name || t.id)}</h2><div class="muted">Task details, schedule progress, seasonal status, and quick actions.</div></div><button class="btn" data-action="close-detail">Close</button></div>
      <div class="detail-hero">
        <div class="hmm-avatar">${this.detailIconSvg()}</div>
        <div>
          <div class="status-title"><span class="pill ${status}">${this.friendlyStatus(status)}</span><span class="category-pill">${this.escape(this.category(t))}</span></div>
          <h3 style="margin:10px 0 4px">${this.escape(t.equipment_name || 'No asset specified')}</h3>
          <div class="muted">${this.escape(scheduleLabel)}</div>
          <div class="progress big"><div class="bar" style="width:${percent}%"></div></div>
          <div class="muted">${percent}% used${progress.season_active === false ? ' • inactive seasonal window' : ''}</div>
        </div>
      </div>
      <div class="summary-grid">
        <div class="summary-tile"><div class="muted">Status</div><div class="value">${this.friendlyStatus(status)}</div></div>
        <div class="summary-tile"><div class="muted">Next due</div><div class="value">${this.escape(nextDueLabel)}</div></div>
        <div class="summary-tile"><div class="muted">Last completed</div><div class="value">${this.dateShort(t.last_completed || progress.last_completed)}</div></div>
        <div class="summary-tile"><div class="muted">Completion count</div><div class="value">${this.escape(progress.completion_count ?? (t.completion_history || []).length ?? 0)}</div></div>
      </div>
      <div class="detail-card-grid">
        <div class="form-section"><h3>Schedule progress</h3>${this.ruleProgressHtml(t)}</div>
        <div class="form-section"><h3>Overview</h3><div class="detail-list">
          <div class="key">Category</div><div>${this.escape(this.category(t))}</div>
          <div class="key">Asset</div><div>${this.escape(t.equipment_name || 'Not specified')}</div>
          <div class="key">Area</div><div>${this.escape(t.area || 'Not specified')}</div>
          <div class="key">NFC action</div><div>${this.escape(this.nfcActionLabel(t.nfc_action))}</div>
          <div class="key">Last NFC scan</div><div>${scan ? `${this.dateShort(scan.at)}${scan.scanner_name ? ' by '+this.escape(scan.scanner_name) : ''}` : 'Never'}</div>
        </div>
        <div class="task-actions"><button class="btn primary" data-complete="${this.escape(t.id)}">Mark complete</button><button class="btn" data-snooze="${this.escape(t.id)}">Snooze 7 days</button>${this.taskGeneratedDeviceId(t) ? `<button class="btn" data-open-task-device="${this.escape(t.id)}">Open HA Device</button>` : ''}<button class="btn" data-edit-from-detail="${this.escape(t.id)}">Edit task</button></div></div>
      </div>
      ${seasonalCard}
      ${trackingCard}
      ${t.instructions ? `<div class="form-section"><h3>Instructions</h3><div style="white-space:pre-wrap">${this.escape(t.instructions)}</div></div>` : ''}
      <div class="form-section"><h3>Completion history</h3>${completed.length ? completed.map(i=>`<div class="history-item"><b>${this.dateShort(i.completed_at || i.at)}</b><div class="muted">${this.escape(i.method || i.completed_by || i.activity || 'Completed')}${i.notes ? ' - '+this.escape(i.notes) : ''}</div></div>`).join('') : '<p class="muted">No completions yet.</p>'}</div>
      <div class="form-section"><h3>Recent activity</h3>${recent.length ? recent.map(i=>`<div class="history-item"><b>${this.escape(i.activity || i.type || 'activity')}</b><div class="muted">${this.dateShort(i.at)}${i.scanner_name ? ' • '+this.escape(i.scanner_name) : ''}${i.notes ? ' - '+this.escape(i.notes) : ''}</div></div>`).join('') : '<p class="muted">No activity yet.</p>'}</div>
      <div class="modal-actions-bottom"><button class="btn" data-action="close-detail">Close</button><div class="right">${this.taskGeneratedDeviceId(t) ? `<button class="btn" data-open-task-device="${this.escape(t.id)}">Open HA Device</button>` : ''}<button class="btn primary" data-complete="${this.escape(t.id)}">Mark complete</button></div></div>
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
    const actualTimeRule = (t.rules||[]).find(r=>r.type==='time');
    const timeRule = actualTimeRule || {value:90, unit:'days'};
    const calendarRule = (t.rules||[]).find(r=>r.type==='calendar') || {};
    const timeInterval = this.intervalFromRule(timeRule, 90, 'days');
    const runtimeInterval = this.intervalFromRule(runtimeRule, 100, 'hours');
    const hasTimeRule = !!actualTimeRule;
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
    const counterDisplayUnit = counterRule.target_display_unit || counterUnit;
    const counterDisplayAmount = counterRule.target_display_value ?? this.convertUsageAmount(counterRule.amount || 1000, counterUnit, counterDisplayUnit);
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
    const seasonalSeasons = Array.isArray(seasonal.seasons) ? seasonal.seasons : ((seasonal.season && seasonal.season !== 'custom') ? [seasonal.season] : []);
    const seasonalCustomEnabled = seasonal.custom_enabled !== undefined ? (!!seasonal.custom_enabled && !seasonalSeasons.length) : (!seasonalSeasons.length || seasonal.season === 'custom');
    const seasonalStartMonth = seasonal.start_month || 5;
    const seasonalStartDay = seasonal.start_day || 1;
    const seasonalEndMonth = seasonal.end_month || 9;
    const seasonalEndDay = seasonal.end_day || 30;
    const seasonalStartDate = this.seasonalDateValue(seasonalStartMonth, seasonalStartDay);
    const seasonalEndDate = this.seasonalDateValue(seasonalEndMonth, seasonalEndDay);
    const seasonalShowInactive = seasonal.show_when_inactive !== false;
    const seasonalPauseUsage = seasonal.pause_usage_when_inactive !== false;

    return `<div class="modal-scrim" data-action="modal-scrim"><div class="modal" data-modal-content>
      <div class="modal-head"><div><h2>${isEdit ? 'Edit maintenance task' : 'Add maintenance task'}</h2><div class="muted">This one-page setup is grouped into sections. Start simple; advanced fields can be left blank.</div></div><button class="btn" data-action="close-modal">Close</button></div>

      <div class="form-section">
        <h3>1. Task basics</h3><p class="section-note">Name the maintenance item in plain language and choose a category so dashboards and reports can group it.</p>
        <div class="form-grid">
          <div class="form-field span-6"><label>${this.label('Task name','The friendly name shown on dashboards and in notifications. Example: HVAC Filter Replacement.')}</label><input id="task-name" placeholder="Example: HVAC filter replacement" value="${this.escape(t.name || '')}"><div id="err-name" class="field-error">Please enter a task name.</div></div>
          <div class="form-field span-6"><label>${this.label('Maintenance category','Optional. Used to group dashboard cards, filter tasks, calculate category health, and add context to notifications.')}</label><select id="task-category">${categoryOptions}</select></div>
          <div class="form-field span-12"><label>${this.label('Description','Optional short description for the task card and future reference.')}</label><textarea id="task-description" placeholder="Optional: what this task covers and why it matters.">${this.escape(t.description || '')}</textarea></div>
        </div>
      </div>

      <div class="form-section">
        <h3>2. Asset being maintained</h3><p class="section-note">Choose the real-world equipment or Home Assistant device this task belongs to. Usage sensors are selected later in the schedule section so they are not duplicated here.</p>
        <div class="two">
          <div><label>${this.label('Area','Choose the Home Assistant area where the maintenance happens, such as Garage or Pool House. Selecting a Home Assistant device can fill this automatically when the device has an area.')}</label><select id="task-area">${areaOptions}</select></div>
          <div><label>${this.label('Home Assistant device (optional)','Select the device being maintained only if it exists in Home Assistant. Leave blank for offline equipment like RO filters, smoke detectors, or mower blades.')}</label><select id="task-device">${deviceOptions}</select></div>
        </div>
        <label>${this.label('Equipment name','Use this for real-world equipment even when there is no Home Assistant device. If left blank and a Home Assistant device is selected, HMM will use the device name.')}</label><input id="task-equipment-name" placeholder="Example: RO water filter" value="${this.escape(t.equipment_name || '')}">
        <div class="info-box">Clean setup model: the asset/device answers “what is being maintained.” The schedule section answers “what data source tracks it.” Runtime and meter source entities are automatically associated with the task when saved.</div>
      </div>

      <div class="form-section">
        <h3>3. Maintenance schedule</h3><p class="section-note">Choose when the task becomes due. Runtime counts hours while something is running. Metered usage counts a sensor value like gallons, kWh, miles, grams, or cycles.</p>
        <div class="schedule-row">
          <div class="form-field"><label>${this.label('Schedule type','Choose time, runtime hours, metered usage, or a combination. Runtime is duration. Metered usage uses the source entity unit.')}</label><select id="task-schedule">
            <option value="time" ${scheduleValue==='time'?'selected':''}>Time interval</option>
            <option value="runtime" ${scheduleValue==='runtime'?'selected':''}>Runtime hours</option>
            <option value="meter" ${scheduleValue==='meter'?'selected':''}>Metered usage</option>
            <option value="calendar" ${scheduleValue==='calendar'?'selected':''}>Calendar schedule</option>
            <option value="time_or_runtime" ${scheduleValue==='time_or_runtime'?'selected':''}>Time or runtime, whichever comes first</option>
            <option value="time_and_runtime" ${scheduleValue==='time_and_runtime'?'selected':''}>Time and runtime</option>
            <option value="time_or_meter" ${scheduleValue==='time_or_meter'?'selected':''}>Time or metered usage, whichever comes first</option>
            <option value="time_and_meter" ${scheduleValue==='time_and_meter'?'selected':''}>Time and metered usage</option>
          </select></div>
          <div class="form-field conditional time-fields"><label>${this.label('Time interval','For time-based rules, the task becomes due after this interval from the last completion.')}</label><div class="input-row"><input id="task-time-value" type="number" min="0.01" step="0.01" value="${this.escape(timeInterval.value)}"><select id="task-time-unit">${this.unitOptions(timeInterval.unit)}</select></div><div id="err-days" class="field-error">Enter a valid time interval.</div></div>
        </div>
        <div class="schedule-card conditional runtime-fields">
          <h4>Runtime tracking</h4>
          <div class="form-grid">
            <div class="form-field span-6"><label>${this.label('Runtime tracking source','Choose the entity used to decide when equipment is running. Switches and binary sensors are easiest. Numeric sensors like W or RPM can use a threshold.')}</label><div class="field-caption">Runtime always counts time. A watts sensor usually means “hours above X watts,” not “watts used.”</div><ha-entity-picker id="task-runtime-entity" allow-custom-entity></ha-entity-picker><div id="runtime-source-hint" class="help"></div><div id="err-runtime-entity" class="field-error">Choose a runtime source for runtime-based tasks.</div></div>
            <div class="form-field span-6"><label>${this.label('Runtime interval','The task becomes due after this amount of accumulated runtime since the last completion.')}</label><div class="input-row"><input id="task-runtime-value" type="number" min="0.01" step="0.01" value="${this.escape(runtimeInterval.value)}"><select id="task-runtime-interval-unit">${this.unitOptions(runtimeInterval.unit)}</select></div><div class="help">Runtime counts only while the selected running condition is true.</div><div id="err-runtime-hours" class="field-error">Enter valid runtime interval.</div></div>
            <div class="form-field span-6"><label>${this.label('Counts as running when','Choose how Home Maintenance Manager should interpret the selected source entity.')}</label><select id="task-runtime-method"><option value="entity_on" ${runtimeMethod==='entity_on'?'selected':''}>Entity is ON</option><option value="above_threshold" ${runtimeMethod==='above_threshold'?'selected':''}>Numeric value is above threshold</option><option value="specific_state" ${runtimeMethod==='specific_state'?'selected':''}>Entity is in specific state(s)</option></select><div id="runtime-method-hint" class="help"></div></div>
            <div class="form-field span-6 conditional threshold-fields"><label>${this.label('Running threshold','For numeric sensors, count runtime while the value is above this threshold. Example: power > 25 W means equipment is running.')}</label><input id="task-runtime-threshold" type="number" step="0.1" value="${runtimeRule.above ?? ''}" placeholder="Example: 25"><div id="err-runtime-threshold" class="field-error">Enter a valid threshold.</div></div>
            <div class="form-field span-6 conditional state-fields"><label>${this.label('Running states','Comma-separated states that mean the equipment is running. Example: running, heating, cooling.')}</label><input id="task-runtime-states" value="${this.escape(runtimeStateText)}"><div class="help">State matching is exact and case-sensitive to Home Assistant state values.</div></div>
          </div>
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
            <div><label>${this.label('Active seasons','Choose one or more preset seasons. The task is active when any selected season is active.')}</label>
              <div class="season-grid">
                <label class="check-row"><input id="task-seasonal-spring" data-seasonal-preset="spring" type="checkbox" ${seasonalSeasons.includes('spring')?'checked':''}> Spring (Mar 1–May 31)</label>
                <label class="check-row"><input id="task-seasonal-summer" data-seasonal-preset="summer" type="checkbox" ${seasonalSeasons.includes('summer')?'checked':''}> Summer (Jun 1–Aug 31)</label>
                <label class="check-row"><input id="task-seasonal-fall" data-seasonal-preset="fall" type="checkbox" ${seasonalSeasons.includes('fall')?'checked':''}> Fall (Sep 1–Nov 30)</label>
                <label class="check-row"><input id="task-seasonal-winter" data-seasonal-preset="winter" type="checkbox" ${seasonalSeasons.includes('winter')?'checked':''}> Winter (Dec 1–Feb 28)</label>
              </div>
            </div>
            <label class="check-row"><input id="task-seasonal-custom-enabled" type="checkbox" ${seasonalCustomEnabled?'checked':''}> Use a custom date range instead</label>
            <div id="err-seasonal-choice" class="field-error">Choose one or more seasons, or use a custom date range.</div>
            <div class="two seasonal-custom-fields">
              <div><label>${this.label('Custom start','Choose the month and day this custom active window starts.')}</label><div class="two"><select id="task-seasonal-start-month">${this.monthOptions(seasonalStartMonth)}</select><select id="task-seasonal-start-day">${this.dayOptions(seasonalStartDay)}</select></div></div>
              <div><label>${this.label('Custom end','Choose the month and day this custom active window ends. Ranges can cross New Year.')}</label><div class="two"><select id="task-seasonal-end-month">${this.monthOptions(seasonalEndMonth)}</select><select id="task-seasonal-end-day">${this.dayOptions(seasonalEndDay)}</select></div></div>
            </div>
            <div class="two">
              <div><label>${this.label('Inactive display','Choose whether paused seasonal tasks stay visible on dashboards.')}</label><label class="check-row"><input id="task-seasonal-show-inactive" type="checkbox" ${seasonalShowInactive?'checked':''}> Show when inactive</label></div>
              <div><label>${this.label('Usage tracking','For runtime/rate-metered tasks, choose whether usage accumulates outside the active season.')}</label><label class="check-row"><input id="task-seasonal-pause-usage" type="checkbox" ${seasonalPauseUsage?'checked':''}> Pause usage while inactive</label></div>
            </div>
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
        <div class="schedule-card conditional meter-fields">
          <h4>Metered usage tracking</h4>
          <div class="form-grid">
            <div class="form-field span-6"><label>${this.label('Metered usage source','Choose either a cumulative meter, like total gallons/kWh/miles, or a rate sensor like gal/min that HMM can totalize.')}</label><div class="field-caption">If this sensor is a rate, Home Maintenance Manager can create its own internal totalizer.</div><ha-entity-picker id="task-meter-entity" allow-custom-entity></ha-entity-picker><div id="meter-source-hint" class="help"></div><div id="err-meter-entity" class="field-error">Choose a metered usage source.</div></div>
            <div class="form-field span-6"><label>${this.label('Usage amount','The task becomes due after this amount of totalized usage since the last completion.')}</label><div class="input-row"><input id="task-meter-amount" type="number" min="0.1" step="0.1" value="${this.escape(counterDisplayAmount)}"><div class="field-caption">every <select id="task-meter-target-unit">${this.usageUnitOptions(counterUnit, counterDisplayUnit)}</select><span id="task-meter-unit" class="hidden">${this.escape(counterUnit)}</span></div></div><div id="err-meter-amount" class="field-error">Enter a valid usage amount.</div></div>
            <div class="form-field span-6"><label>${this.label('Meter source type','Cumulative meters already contain a total. Rate sensors such as gal/min must be totalized over time. Reset/session counters increase during a session and then drop back to zero.')}</label><select id="task-meter-source-type"><option value="cumulative_total" ${!['rate','session_total','reset_counter'].includes(counterSourceMode)?'selected':''}>Cumulative meter - already total</option><option value="rate" ${counterSourceMode==='rate'?'selected':''}>Rate sensor - let HMM totalize it</option><option value="session_total" ${['session_total','reset_counter'].includes(counterSourceMode)?'selected':''}>Reset/session counter - add positive deltas</option></select><div id="meter-type-hint" class="help"></div></div>
            <div class="form-field span-6"><div class="info-box" id="meter-explain-box">Metered usage uses a baseline at task creation/completion. HMM subtracts that baseline from the current total to calculate usage used.</div></div>
          </div>
        </div>
        <div class="baseline-box">
          <label>${this.label('When was it last done?','Sets the starting point for the first due date. You can enter an exact completion date/time or how long ago the maintenance was done.')}</label>
          <select id="task-baseline"><option value="today" ${baselineMode==='today'?'selected':''}>Today / now</option><option value="specific" ${baselineMode==='specific'?'selected':''}>Specific date and time</option><option value="ago" ${baselineMode==='ago'?'selected':''}>A certain time ago</option><option value="unknown" ${baselineMode==='unknown'?'selected':''}>Unknown / start today</option></select>
          <div class="form-grid conditional baseline-specific-fields"><div class="form-field span-6"><label>${this.label('Last completed date/time','The exact date and time this task was last completed.')}</label><input id="task-baseline-datetime" type="datetime-local" value="${this.escape(this.localDatetimeValue(t.last_completed))}"></div></div>
          <div class="form-grid conditional baseline-ago-fields"><div class="form-field span-6"><label>${this.label('How long ago?','Example: 6 months ago, 2 weeks ago, or 30 minutes ago.')}</label><div class="input-row"><input id="task-baseline-ago-value" type="number" min="0" step="0.01" value="${this.escape(t.baseline_ago_value || 0)}"><select id="task-baseline-ago-unit">${this.unitOptions(t.baseline_ago_unit || 'days')}</select></div></div></div>
        </div>
      </div>

      <div class="form-section">
        <h3>4. Reminders</h3><p class="section-note">Notifications are managed globally in Settings. Most tasks should use the global default. Override only for critical or low-priority tasks.</p>
        <div class="form-grid">
          <div class="form-field span-6"><label>${this.label('Notification behavior','Use global settings for normal tasks. Disable for low-priority tasks. Override for special tasks that need different notification behavior.')}</label><select id="task-notify-behavior">${notifyBehaviorOptions}</select></div>
          <div class="form-field span-6 conditional custom-notify-fields"><label>${this.label('Task override method','Only shown when Override for this task is selected.')}</label><select id="task-notify">${notifyOptions}</select></div>
          <div class="form-field span-6 conditional custom-notify-fields mobile-fields"><label>${this.label('Task mobile target override','Optional. Leave blank to use the global mobile target(s).')}</label><select id="task-mobile">${mobileOptions}</select></div>
        </div>
      </div>

      <div class="form-section">
        <h3>5. NFC Tag</h3><p class="section-note">Attach a Home Assistant NFC tag so scanning the equipment can open, complete, confirm, or log the maintenance task.</p>
        <div class="form-grid">
          <div class="form-field span-6"><label>${this.label('NFC tag','Choose a registered Home Assistant NFC tag. Scanning it can be used to complete, confirm, or log this task.')}</label><select id="task-nfc">${tagOptions}</select></div>
          <div class="form-field span-6"><label>${this.label('When this tag is scanned','Choose the NFC workflow. Ask for confirmation is safest; Complete immediately is fastest for trusted locations.')}</label><select id="task-nfc-action">${nfcActionOptions}</select><div class="help">Scanning a HA NFC tag opens Home Assistant and also fires a tag_scanned event that HMM handles.</div></div>
        </div>
      </div>

      <div class="form-section">
        <h3>6. Instructions</h3><p class="section-note">Optional homeowner-friendly notes. Add the steps someone should follow when doing the task.</p>
        <label>${this.label('Instructions','Optional markdown-style instructions or checklist notes. Example: Turn off power, remove filter, clean, reinstall.')}</label><textarea id="task-instructions" placeholder="1. Turn off equipment
2. Perform maintenance
3. Mark complete">${this.escape(t.instructions || '')}</textarea>
      </div>

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
    const actualTimeRule = (t.rules||[]).find(r=>r.type==='time');
    const timeRule = actualTimeRule || {value:90, unit:'days'};
    const calendarRule = (t.rules||[]).find(r=>r.type==='calendar') || {};
    const timeInterval = this.intervalFromRule(timeRule, 90, 'days');
    const runtimeInterval = this.intervalFromRule(runtimeRule, 100, 'hours');
    const hasTimeRule = !!actualTimeRule;
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
    const counterDisplayUnit = counterRule.target_display_unit || counterUnit;
    const counterDisplayAmount = counterRule.target_display_value ?? this.convertUsageAmount(counterRule.amount || 1000, counterUnit, counterDisplayUnit);
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
    const seasonalSeasons = Array.isArray(seasonal.seasons) ? seasonal.seasons : ((seasonal.season && seasonal.season !== 'custom') ? [seasonal.season] : []);
    const seasonalCustomEnabled = seasonal.custom_enabled !== undefined ? (!!seasonal.custom_enabled && !seasonalSeasons.length) : (!seasonalSeasons.length || seasonal.season === 'custom');
    const seasonalStartMonth = seasonal.start_month || 5;
    const seasonalStartDay = seasonal.start_day || 1;
    const seasonalEndMonth = seasonal.end_month || 9;
    const seasonalEndDay = seasonal.end_day || 30;
    const seasonalStartDate = this.seasonalDateValue(seasonalStartMonth, seasonalStartDay);
    const seasonalEndDate = this.seasonalDateValue(seasonalEndMonth, seasonalEndDay);
    const seasonalShowInactive = seasonal.show_when_inactive !== false;
    const seasonalPauseUsage = seasonal.pause_usage_when_inactive !== false;

    return `<div class="modal-scrim" data-action="modal-scrim"><div class="modal" data-modal-content>
      <div class="modal-head"><div><h2>${isEdit ? 'Edit maintenance task' : 'Add maintenance task'}</h2><div class="muted">This one-page setup is grouped into sections. Start simple; advanced fields can be left blank.</div></div><button class="btn" data-action="close-modal">Close</button></div>

      <div class="form-section">
        <h3>1. Task basics</h3><p class="section-note">Name the maintenance item in plain language and choose a category so dashboards and reports can group it.</p>
        <div class="form-grid">
          <div class="form-field span-6"><label>${this.label('Task name','The friendly name shown on dashboards and in notifications. Example: HVAC Filter Replacement.')}</label><input id="task-name" placeholder="Example: HVAC filter replacement" value="${this.escape(t.name || '')}"><div id="err-name" class="field-error">Please enter a task name.</div></div>
          <div class="form-field span-6"><label>${this.label('Maintenance category','Optional. Used to group dashboard cards, filter tasks, calculate category health, and add context to notifications.')}</label><select id="task-category">${categoryOptions}</select></div>
          <div class="form-field span-12"><label>${this.label('Description','Optional short description for the task card and future reference.')}</label><textarea id="task-description" placeholder="Optional: what this task covers and why it matters.">${this.escape(t.description || '')}</textarea></div>
        </div>
      </div>

      <div class="form-section">
        <h3>2. Asset being maintained</h3><p class="section-note">Choose the real-world equipment or Home Assistant device this task belongs to. Usage sensors are selected later in the schedule section so they are not duplicated here.</p>
        <div class="two">
          <div><label>${this.label('Area','Choose the Home Assistant area where the maintenance happens, such as Garage or Pool House. Selecting a Home Assistant device can fill this automatically when the device has an area.')}</label><select id="task-area">${areaOptions}</select></div>
          <div><label>${this.label('Home Assistant device (optional)','Select the device being maintained only if it exists in Home Assistant. Leave blank for offline equipment like RO filters, smoke detectors, or mower blades.')}</label><select id="task-device">${deviceOptions}</select></div>
        </div>
        <label>${this.label('Equipment name','Use this for real-world equipment even when there is no Home Assistant device. If left blank and a Home Assistant device is selected, HMM will use the device name.')}</label><input id="task-equipment-name" placeholder="Example: RO water filter" value="${this.escape(t.equipment_name || '')}">
        <div class="info-box">Clean setup model: the asset/device answers “what is being maintained.” The schedule section answers “what data source tracks it.” Runtime and meter source entities are automatically associated with the task when saved.</div>
      </div>

      <div class="form-section">
        <h3>3. Maintenance schedule</h3><p class="section-note">Choose when the task becomes due. Runtime counts hours while something is running. Metered usage counts a sensor value like gallons, kWh, miles, grams, or cycles.</p>
        <div class="schedule-row">
          <div class="form-field"><label>${this.label('Schedule type','Choose time, runtime hours, metered usage, or a combination. Runtime is duration. Metered usage uses the source entity unit.')}</label><select id="task-schedule">
            <option value="time" ${scheduleValue==='time'?'selected':''}>Time interval</option>
            <option value="runtime" ${scheduleValue==='runtime'?'selected':''}>Runtime hours</option>
            <option value="meter" ${scheduleValue==='meter'?'selected':''}>Metered usage</option>
            <option value="calendar" ${scheduleValue==='calendar'?'selected':''}>Calendar schedule</option>
            <option value="time_or_runtime" ${scheduleValue==='time_or_runtime'?'selected':''}>Time or runtime, whichever comes first</option>
            <option value="time_and_runtime" ${scheduleValue==='time_and_runtime'?'selected':''}>Time and runtime</option>
            <option value="time_or_meter" ${scheduleValue==='time_or_meter'?'selected':''}>Time or metered usage, whichever comes first</option>
            <option value="time_and_meter" ${scheduleValue==='time_and_meter'?'selected':''}>Time and metered usage</option>
          </select></div>
          <div class="form-field conditional time-fields"><label>${this.label('Time interval','For time-based rules, the task becomes due after this interval from the last completion.')}</label><div class="input-row"><input id="task-time-value" type="number" min="0.01" step="0.01" value="${this.escape(timeInterval.value)}"><select id="task-time-unit">${this.unitOptions(timeInterval.unit)}</select></div><div id="err-days" class="field-error">Enter a valid time interval.</div></div>
        </div>
        <div class="schedule-card conditional runtime-fields">
          <h4>Runtime tracking</h4>
          <div class="form-grid">
            <div class="form-field span-6"><label>${this.label('Runtime tracking source','Choose the entity used to decide when equipment is running. Switches and binary sensors are easiest. Numeric sensors like W or RPM can use a threshold.')}</label><div class="field-caption">Runtime always counts time. A watts sensor usually means “hours above X watts,” not “watts used.”</div><ha-entity-picker id="task-runtime-entity" allow-custom-entity></ha-entity-picker><div id="runtime-source-hint" class="help"></div><div id="err-runtime-entity" class="field-error">Choose a runtime source for runtime-based tasks.</div></div>
            <div class="form-field span-6"><label>${this.label('Runtime interval','The task becomes due after this amount of accumulated runtime since the last completion.')}</label><div class="input-row"><input id="task-runtime-value" type="number" min="0.01" step="0.01" value="${this.escape(runtimeInterval.value)}"><select id="task-runtime-interval-unit">${this.unitOptions(runtimeInterval.unit)}</select></div><div class="help">Runtime counts only while the selected running condition is true.</div><div id="err-runtime-hours" class="field-error">Enter valid runtime interval.</div></div>
            <div class="form-field span-6"><label>${this.label('Counts as running when','Choose how Home Maintenance Manager should interpret the selected source entity.')}</label><select id="task-runtime-method"><option value="entity_on" ${runtimeMethod==='entity_on'?'selected':''}>Entity is ON</option><option value="above_threshold" ${runtimeMethod==='above_threshold'?'selected':''}>Numeric value is above threshold</option><option value="specific_state" ${runtimeMethod==='specific_state'?'selected':''}>Entity is in specific state(s)</option></select><div id="runtime-method-hint" class="help"></div></div>
            <div class="form-field span-6 conditional threshold-fields"><label>${this.label('Running threshold','For numeric sensors, count runtime while the value is above this threshold. Example: power > 25 W means equipment is running.')}</label><input id="task-runtime-threshold" type="number" step="0.1" value="${runtimeRule.above ?? ''}" placeholder="Example: 25"><div id="err-runtime-threshold" class="field-error">Enter a valid threshold.</div></div>
            <div class="form-field span-6 conditional state-fields"><label>${this.label('Running states','Comma-separated states that mean the equipment is running. Example: running, heating, cooling.')}</label><input id="task-runtime-states" value="${this.escape(runtimeStateText)}"><div class="help">State matching is exact and case-sensitive to Home Assistant state values.</div></div>
          </div>
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
            <div><label>${this.label('Active seasons','Choose one or more preset seasons. The task is active when any selected season is active.')}</label>
              <div class="season-grid">
                <label class="check-row"><input id="task-seasonal-spring" data-seasonal-preset="spring" type="checkbox" ${seasonalSeasons.includes('spring')?'checked':''}> Spring (Mar 1–May 31)</label>
                <label class="check-row"><input id="task-seasonal-summer" data-seasonal-preset="summer" type="checkbox" ${seasonalSeasons.includes('summer')?'checked':''}> Summer (Jun 1–Aug 31)</label>
                <label class="check-row"><input id="task-seasonal-fall" data-seasonal-preset="fall" type="checkbox" ${seasonalSeasons.includes('fall')?'checked':''}> Fall (Sep 1–Nov 30)</label>
                <label class="check-row"><input id="task-seasonal-winter" data-seasonal-preset="winter" type="checkbox" ${seasonalSeasons.includes('winter')?'checked':''}> Winter (Dec 1–Feb 28)</label>
              </div>
            </div>
            <label class="check-row"><input id="task-seasonal-custom-enabled" type="checkbox" ${seasonalCustomEnabled?'checked':''}> Use a custom date range instead</label>
            <div id="err-seasonal-choice" class="field-error">Choose one or more seasons, or use a custom date range.</div>
            <div class="two seasonal-custom-fields">
              <div><label>${this.label('Custom start','Choose the month and day this custom active window starts.')}</label><div class="two"><select id="task-seasonal-start-month">${this.monthOptions(seasonalStartMonth)}</select><select id="task-seasonal-start-day">${this.dayOptions(seasonalStartDay)}</select></div></div>
              <div><label>${this.label('Custom end','Choose the month and day this custom active window ends. Ranges can cross New Year.')}</label><div class="two"><select id="task-seasonal-end-month">${this.monthOptions(seasonalEndMonth)}</select><select id="task-seasonal-end-day">${this.dayOptions(seasonalEndDay)}</select></div></div>
            </div>
            <div class="two">
              <div><label>${this.label('Inactive display','Choose whether paused seasonal tasks stay visible on dashboards.')}</label><label class="check-row"><input id="task-seasonal-show-inactive" type="checkbox" ${seasonalShowInactive?'checked':''}> Show when inactive</label></div>
              <div><label>${this.label('Usage tracking','For runtime/rate-metered tasks, choose whether usage accumulates outside the active season.')}</label><label class="check-row"><input id="task-seasonal-pause-usage" type="checkbox" ${seasonalPauseUsage?'checked':''}> Pause usage while inactive</label></div>
            </div>
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
        <div class="schedule-card conditional meter-fields">
          <h4>Metered usage tracking</h4>
          <div class="form-grid">
            <div class="form-field span-6"><label>${this.label('Metered usage source','Choose either a cumulative meter, like total gallons/kWh/miles, or a rate sensor like gal/min that HMM can totalize.')}</label><div class="field-caption">If this sensor is a rate, Home Maintenance Manager can create its own internal totalizer.</div><ha-entity-picker id="task-meter-entity" allow-custom-entity></ha-entity-picker><div id="meter-source-hint" class="help"></div><div id="err-meter-entity" class="field-error">Choose a metered usage source.</div></div>
            <div class="form-field span-6"><label>${this.label('Usage amount','The task becomes due after this amount of totalized usage since the last completion.')}</label><div class="input-row"><input id="task-meter-amount" type="number" min="0.1" step="0.1" value="${this.escape(counterDisplayAmount)}"><div class="field-caption">every <select id="task-meter-target-unit">${this.usageUnitOptions(counterUnit, counterDisplayUnit)}</select><span id="task-meter-unit" class="hidden">${this.escape(counterUnit)}</span></div></div><div id="err-meter-amount" class="field-error">Enter a valid usage amount.</div></div>
            <div class="form-field span-6"><label>${this.label('Meter source type','Cumulative meters already contain a total. Rate sensors such as gal/min must be totalized over time. Reset/session counters increase during a session and then drop back to zero.')}</label><select id="task-meter-source-type"><option value="cumulative_total" ${!['rate','session_total','reset_counter'].includes(counterSourceMode)?'selected':''}>Cumulative meter - already total</option><option value="rate" ${counterSourceMode==='rate'?'selected':''}>Rate sensor - let HMM totalize it</option><option value="session_total" ${['session_total','reset_counter'].includes(counterSourceMode)?'selected':''}>Reset/session counter - add positive deltas</option></select><div id="meter-type-hint" class="help"></div></div>
            <div class="form-field span-6"><div class="info-box" id="meter-explain-box">Metered usage uses a baseline at task creation/completion. HMM subtracts that baseline from the current total to calculate usage used.</div></div>
          </div>
        </div>
        <div class="baseline-box">
          <label>${this.label('When was it last done?','Sets the starting point for the first due date. You can enter an exact completion date/time or how long ago the maintenance was done.')}</label>
          <select id="task-baseline"><option value="today" ${baselineMode==='today'?'selected':''}>Today / now</option><option value="specific" ${baselineMode==='specific'?'selected':''}>Specific date and time</option><option value="ago" ${baselineMode==='ago'?'selected':''}>A certain time ago</option><option value="unknown" ${baselineMode==='unknown'?'selected':''}>Unknown / start today</option></select>
          <div class="form-grid conditional baseline-specific-fields"><div class="form-field span-6"><label>${this.label('Last completed date/time','The exact date and time this task was last completed.')}</label><input id="task-baseline-datetime" type="datetime-local" value="${this.escape(this.localDatetimeValue(t.last_completed))}"></div></div>
          <div class="form-grid conditional baseline-ago-fields"><div class="form-field span-6"><label>${this.label('How long ago?','Example: 6 months ago, 2 weeks ago, or 30 minutes ago.')}</label><div class="input-row"><input id="task-baseline-ago-value" type="number" min="0" step="0.01" value="${this.escape(t.baseline_ago_value || 0)}"><select id="task-baseline-ago-unit">${this.unitOptions(t.baseline_ago_unit || 'days')}</select></div></div></div>
        </div>
      </div>

      <div class="form-section">
        <h3>4. Reminders</h3><p class="section-note">Notifications are managed globally in Settings. Most tasks should use the global default. Override only for critical or low-priority tasks.</p>
        <div class="form-grid">
          <div class="form-field span-6"><label>${this.label('Notification behavior','Use global settings for normal tasks. Disable for low-priority tasks. Override for special tasks that need different notification behavior.')}</label><select id="task-notify-behavior">${notifyBehaviorOptions}</select></div>
          <div class="form-field span-6 conditional custom-notify-fields"><label>${this.label('Task override method','Only shown when Override for this task is selected.')}</label><select id="task-notify">${notifyOptions}</select></div>
          <div class="form-field span-6 conditional custom-notify-fields mobile-fields"><label>${this.label('Task mobile target override','Optional. Leave blank to use the global mobile target(s).')}</label><select id="task-mobile">${mobileOptions}</select></div>
        </div>
      </div>

      <div class="form-section">
        <h3>5. NFC Tag</h3><p class="section-note">Attach a Home Assistant NFC tag so scanning the equipment can open, complete, confirm, or log the maintenance task.</p>
        <div class="form-grid">
          <div class="form-field span-6"><label>${this.label('NFC tag','Choose a registered Home Assistant NFC tag. Scanning it can be used to complete, confirm, or log this task.')}</label><select id="task-nfc">${tagOptions}</select></div>
          <div class="form-field span-6"><label>${this.label('When this tag is scanned','Choose the NFC workflow. Ask for confirmation is safest; Complete immediately is fastest for trusted locations.')}</label><select id="task-nfc-action">${nfcActionOptions}</select><div class="help">Scanning a HA NFC tag opens Home Assistant and also fires a tag_scanned event that HMM handles.</div></div>
        </div>
      </div>

      <div class="form-section">
        <h3>6. Instructions</h3><p class="section-note">Optional homeowner-friendly notes. Add the steps someone should follow when doing the task.</p>
        <label>${this.label('Instructions','Optional markdown-style instructions or checklist notes. Example: Turn off power, remove filter, clean, reinstall.')}</label><textarea id="task-instructions" placeholder="1. Turn off equipment\n2. Perform maintenance\n3. Mark complete">${this.escape(t.instructions || '')}</textarea>
      </div>

      <div class="modal-actions-bottom">
        <button class="btn" data-action="close-modal">Close</button>
        <div class="right">${isEdit && this.taskGeneratedDeviceId(t) ? `<button class="btn" type="button" data-open-task-device="${this.escape(t.id)}">Open HA Device</button>` : ''}<button class="btn primary" data-action="save-task" data-task-id="${this.escape(t.id || '')}">${isEdit ? 'Save changes' : 'Create task'}</button>${isEdit ? `<button class="btn danger" data-delete="${this.escape(t.id)}">Delete</button>` : ''}</div>
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
    this.shadowRoot.querySelectorAll('[data-action="export-json"]').forEach(el=>el.onclick=()=>this.exportJson());
    this.shadowRoot.querySelectorAll('[data-install-built-in-pack]').forEach(el=>el.onclick=()=>this.installBuiltInTaskPack(el.dataset.installBuiltInPack));
    this.shadowRoot.querySelectorAll('[data-action="open-task-pack-export"]').forEach(el=>el.onclick=()=>this.openTaskPackExport());
    this.shadowRoot.querySelectorAll('[data-action="close-task-pack-export"]').forEach(el=>el.onclick=()=>{ this.taskPackExportOpen=false; this.render(); });
    this.shadowRoot.querySelectorAll('[data-action="task-pack-export-scrim"]').forEach(el=>el.onclick=(ev)=>{ if (ev.target === el) { this.taskPackExportOpen=false; this.render(); } });
    this.shadowRoot.querySelectorAll('[data-action="export-task-pack"]').forEach(el=>el.onclick=()=>this.exportTaskPack());
    this.shadowRoot.querySelectorAll('[data-action="select-all-task-pack-export"]').forEach(el=>el.onclick=()=>{ this.shadowRoot.querySelectorAll('.task-pack-export-task').forEach(cb=>cb.checked=true); this.updateTaskPackExportCount(); });
    this.shadowRoot.querySelectorAll('[data-action="select-none-task-pack-export"]').forEach(el=>el.onclick=()=>{ this.shadowRoot.querySelectorAll('.task-pack-export-task').forEach(cb=>cb.checked=false); this.updateTaskPackExportCount(); });
    this.shadowRoot.querySelectorAll('.task-pack-export-task').forEach(el=>el.onchange=()=>this.updateTaskPackExportCount());
    this.shadowRoot.querySelectorAll('[data-action="import-json"]').forEach(el=>el.onclick=()=>this.importJson());
    this.shadowRoot.querySelectorAll('[data-action="preview-import-json"]').forEach(el=>el.onclick=()=>this.previewImportJson());
    this.shadowRoot.querySelectorAll('[data-action="apply-import-json"]').forEach(el=>el.onclick=()=>this.applyImportJson());
    this.shadowRoot.querySelectorAll('[data-action="clear-import-preview"]').forEach(el=>el.onclick=()=>{this.importPackage=null;this.importPreview=null;this.importWizardOpen=false;this.render();});
    this.shadowRoot.querySelectorAll('[data-action="close-import-wizard"]').forEach(el=>el.onclick=()=>{this.importWizardOpen=false;this.render();});
    this.shadowRoot.querySelectorAll('[data-action="import-wizard-scrim"]').forEach(el=>el.onclick=(ev)=>{ if (ev.target === el) { this.importWizardOpen=false; this.render(); } });
    this.shadowRoot.querySelectorAll('[data-import-filter]').forEach(el=>el.onclick=()=>{ this.captureImportSelections(); this.captureEntityMapping(); this.importStatusFilter=el.dataset.importFilter; this.render(); });
    this.shadowRoot.querySelectorAll('[data-import-step]').forEach(el=>el.onclick=()=>{ this.captureImportSelections(); this.captureImportWizardOptions(); this.importWizardStep=Number(el.dataset.importStep||1); this.render(); });
    this.shadowRoot.querySelectorAll('[data-action="import-step-next"]').forEach(el=>el.onclick=()=>{ this.captureImportSelections(); this.captureImportWizardOptions(); this.importWizardStep=Math.min(5,(this.importWizardStep||1)+1); this.render(); });
    this.shadowRoot.querySelectorAll('[data-action="import-step-prev"]').forEach(el=>el.onclick=()=>{ this.captureImportSelections(); this.captureImportWizardOptions(); this.importWizardStep=Math.max(1,(this.importWizardStep||1)-1); this.render(); });
    this.shadowRoot.querySelectorAll('[data-entity-filter]').forEach(el=>el.onclick=()=>{ this.captureEntityMapping(); this.importEntityFilter=el.dataset.entityFilter; this.importEntityQueueIndex=0; this.render(); });
    this.shadowRoot.querySelectorAll('[data-entity-queue-index]').forEach(el=>el.onclick=()=>{ this.captureEntityMapping(); this.importEntityQueueIndex=Number(el.dataset.entityQueueIndex||0); this.render(); });
    this.shadowRoot.querySelectorAll('[data-action="entity-queue-next"]').forEach(el=>el.onclick=()=>{ this.captureEntityMapping(); this.advanceEntityQueue(1); this.render(); });
    this.shadowRoot.querySelectorAll('[data-action="entity-queue-prev"]').forEach(el=>el.onclick=()=>{ this.captureEntityMapping(); this.advanceEntityQueue(-1); this.render(); });
    this.shadowRoot.querySelectorAll('[data-map-entity]').forEach(el=>el.onchange=()=>{ this.captureEntityMapping(); if (el.value !== '__manual__') this.render(); });
    this.shadowRoot.querySelectorAll('[data-map-suggestion]').forEach(el=>el.onclick=()=>{ const id=el.dataset.mapSuggestion; this.importEntityMapping[id]=el.dataset.mapValue; this.autoAdvanceEntityQueue(); });
    this.shadowRoot.querySelectorAll('ha-entity-picker[data-map-picker]').forEach(el=>{ el.hass=this._hass; const id=el.dataset.mapPicker; const v=this.importEntityMapping?.[id]; if (v && !['__unresolved__','__clear__'].includes(v)) el.value=v; el.addEventListener('value-changed', ev=>{ const value=ev.detail?.value; this.importEntityMapping[id]=value || '__unresolved__'; const radio=this.shadowRoot.querySelector(`input[data-map-entity="${CSS.escape(id)}"][value="__manual__"]`); if (radio) radio.checked=true; if (value) this.autoAdvanceEntityQueue(); }); });
    this.shadowRoot.querySelectorAll('[data-action="select-all-import"]').forEach(el=>el.onclick=()=>{this.shadowRoot.querySelectorAll('.import-task-select:not(:disabled)').forEach(cb=>cb.checked=true); this.captureImportSelections(); this.render();});
    this.shadowRoot.querySelectorAll('[data-action="select-none-import"]').forEach(el=>el.onclick=()=>{this.shadowRoot.querySelectorAll('.import-task-select').forEach(cb=>cb.checked=false); this.captureImportSelections(); this.render();});
    this.shadowRoot.querySelectorAll('.import-task-select').forEach(el=>el.onchange=()=>this.captureImportSelections());
    this.shadowRoot.querySelectorAll('[data-preview-title],[data-preview-body]').forEach(el=>el.oninput=()=>this.updateNotificationPreview());
    this.shadowRoot.querySelectorAll('[data-action="new-task"]').forEach(el=>el.onclick=()=>{ this._modalSnapshot=null; this.modal={task:{}}; this.render(); });
    this.shadowRoot.querySelectorAll('[data-action="close-modal"]').forEach(el=>el.onclick=()=>this.requestCloseModal());
    this.shadowRoot.querySelectorAll('[data-action="modal-scrim"]').forEach(el=>el.onclick=(ev)=>{ if (ev.target === el) this.requestCloseModal(); });
    this.shadowRoot.querySelectorAll('[data-action="close-detail"]').forEach(el=>el.onclick=()=>this.closeTaskDetail());
    this.shadowRoot.querySelectorAll('[data-action="detail-scrim"]').forEach(el=>el.onclick=(ev)=>{ if (ev.target === el) this.closeTaskDetail(); });
    this.shadowRoot.querySelectorAll('[data-edit-from-detail]').forEach(el=>el.onclick=()=>{ const task=this.tasks.find(t=>t.id===el.dataset.editFromDetail); this._modalSnapshot=null; this.modal={task:JSON.parse(JSON.stringify(task||{}))}; this.render(); });
    this.shadowRoot.querySelectorAll('[data-complete]').forEach(el=>el.onclick=()=>this.callService('mark_complete',{task_id:el.dataset.complete, method:'panel'}));
    this.shadowRoot.querySelectorAll('[data-snooze]').forEach(el=>el.onclick=()=>this.callService('snooze',{task_id:el.dataset.snooze, days:7}));
    this.shadowRoot.querySelectorAll('[data-open-task-device]').forEach(el=>el.onclick=()=>this.openTaskDevice(el.dataset.openTaskDevice));
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
    const meterTargetUnit = this.shadowRoot.getElementById('task-meter-target-unit');
    if (meterTargetUnit) meterTargetUnit.onchange = () => this.updateMeterUnit();
    const notifyBehaviorEl = this.shadowRoot.getElementById('task-notify-behavior');
    const deviceEl = this.shadowRoot.getElementById('task-device');
    if (deviceEl) deviceEl.onchange = () => this.syncAreaFromDevice();
    if (schedule) schedule.onchange = () => this.syncConditionalFields();
    const calKindEl = this.shadowRoot.getElementById('task-calendar-kind');
    if (calKindEl) calKindEl.onchange = () => this.syncConditionalFields();
    const baselineEl = this.shadowRoot.getElementById('task-baseline');
    if (baselineEl) baselineEl.onchange = () => this.syncConditionalFields();
    const runtimeMethodEl = this.shadowRoot.getElementById('task-runtime-method');
    const seasonalEnabledEl = this.shadowRoot.getElementById('task-seasonal-enabled');
    const seasonalCustomEl = this.shadowRoot.getElementById('task-seasonal-custom-enabled');
    if (seasonalEnabledEl) seasonalEnabledEl.onchange = () => this.syncConditionalFields();
    if (seasonalCustomEl) seasonalCustomEl.onchange = () => {
      if (seasonalCustomEl.checked) this.shadowRoot.querySelectorAll('[data-seasonal-preset]').forEach(el => { el.checked = false; });
      this.syncConditionalFields();
    };
    this.shadowRoot.querySelectorAll('[data-seasonal-preset]').forEach(el => el.onchange = () => {
      if (el.checked && seasonalCustomEl) seasonalCustomEl.checked = false;
      this.syncConditionalFields();
    });
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
      if (el.type === 'checkbox') return !!el.checked;
      if (Array.isArray(el.value)) return [...el.value].sort();
      return el.value ?? "";
    };
    const fields = [
      'task-name','task-category','task-description','task-area','task-device','task-equipment-name',
      'task-schedule','task-seasonal-enabled','task-seasonal-spring','task-seasonal-summer','task-seasonal-fall','task-seasonal-winter','task-seasonal-custom-enabled','task-seasonal-start-month','task-seasonal-start-day','task-seasonal-end-month','task-seasonal-end-day','task-seasonal-show-inactive','task-seasonal-pause-usage','task-time-value','task-time-unit','task-runtime-value','task-runtime-interval-unit','task-runtime-method','task-runtime-threshold','task-runtime-states',
      'task-calendar-kind','task-calendar-nth','task-calendar-weekday','task-calendar-month','task-calendar-day','task-calendar-time','task-meter-amount','task-meter-target-unit','task-meter-source-type','task-baseline','task-baseline-datetime','task-baseline-ago-value','task-baseline-ago-unit','task-notify-behavior','task-notify','task-mobile','task-nfc','task-nfc-action','task-instructions'
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
      typeEl.value = this.isRateUnit(sourceUnit) ? 'rate' : 'cumulative_total';
    }
    if (typeEl && !typeEl.dataset.bound) {
      typeEl.dataset.bound = '1';
      typeEl.addEventListener('change', () => { typeEl.dataset.userTouched = '1'; this.updateMeterUnit(); });
    }
    const mode = typeEl?.value || 'cumulative';
    const targetUnit = mode === 'rate' ? this.totalizedTargetUnit(sourceUnit) : (sourceUnit || 'units');
    const targetSelect = this.shadowRoot.getElementById('task-meter-target-unit');
    if (targetSelect) {
      const current = targetSelect.value || targetUnit;
      targetSelect.innerHTML = this.usageUnitOptions(targetUnit, current);
    }
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
    if (typeHint) typeHint.textContent = mode === 'rate' ? `HMM will add ${sourceUnit || 'units/time'} over elapsed time and track total ${targetUnit}.` : mode === 'session_total' ? 'HMM will add only positive increases and ignore drops when the sensor resets between sessions.' : 'Use this when the sensor is already a total, like total gallons, odometer miles, or lifetime kWh.';
    if (explain) explain.textContent = mode === 'rate' || mode === 'session_total' ? `HMM will create an internal totalizer for this task. Mark Complete resets the maintenance baseline, not the original sensor.` : 'HMM stores the current sensor value as the baseline and tracks how much the total increases.';
  }


  applySeasonalPresetDates() {
    const seasonEl = this.shadowRoot.getElementById('task-seasonal-season');
    const preset = this.seasonalPreset(seasonEl?.value || 'custom');
    if (!preset) return;
    const [sm, sd, em, ed] = preset;
    const set = (id, value) => { const el = this.shadowRoot.getElementById(id); if (el) el.value = String(value); };
    set('task-seasonal-start-month', sm);
    set('task-seasonal-start-day', sd);
    set('task-seasonal-end-month', em);
    set('task-seasonal-end-day', ed);
  }

  syncAreaFromDevice() {
    const deviceEl = this.shadowRoot.getElementById('task-device');
    const areaEl = this.shadowRoot.getElementById('task-area');
    if (!deviceEl || !areaEl || areaEl.value) return;
    const dev = (this.metadata.devices || []).find(d => d.id === deviceEl.value);
    if (dev?.area_id) areaEl.value = dev.area_id;
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
    const seasonalCustomEnabled = this.shadowRoot.getElementById('task-seasonal-custom-enabled')?.checked;
    this.shadowRoot.querySelectorAll('.time-fields').forEach(el => el.classList.toggle('hidden', !showTime));
    this.shadowRoot.querySelectorAll('.runtime-fields').forEach(el => el.classList.toggle('hidden', !showRuntime));
    this.shadowRoot.querySelectorAll('.meter-fields').forEach(el => el.classList.toggle('hidden', !showMeter));
    this.shadowRoot.querySelectorAll('.calendar-fields').forEach(el => el.classList.toggle('hidden', !showCalendar));
    this.shadowRoot.querySelectorAll('.calendar-nth-fields').forEach(el => el.classList.toggle('hidden', !(showCalendar && calendarKind === 'nth_weekday')));
    this.shadowRoot.querySelectorAll('.calendar-month-day-fields').forEach(el => el.classList.toggle('hidden', !(showCalendar && calendarKind === 'month_day')));
    this.shadowRoot.querySelectorAll('.baseline-specific-fields').forEach(el => el.classList.toggle('hidden', baselineMode !== 'specific'));
    this.shadowRoot.querySelectorAll('.baseline-ago-fields').forEach(el => el.classList.toggle('hidden', baselineMode !== 'ago'));
    this.shadowRoot.querySelectorAll('.seasonal-fields').forEach(el => el.classList.toggle('hidden', !seasonalEnabled));
    this.shadowRoot.querySelectorAll('.seasonal-custom-fields').forEach(el => el.classList.toggle('hidden', !seasonalEnabled || !seasonalCustomEnabled));
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
    const meterDisplayAmount = Number(q('task-meter-amount')?.value || 0);
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
    this.setError('err-meter-amount', needsMeter && (!meterDisplayAmount || meterDisplayAmount <= 0)); hasError = hasError || (needsMeter && (!meterDisplayAmount || meterDisplayAmount <= 0));
    const seasonalEnabledForValidation = !!q('task-seasonal-enabled')?.checked;
    const seasonalSeasonsForValidation = ['spring','summer','fall','winter'].filter(season => !!q(`task-seasonal-${season}`)?.checked);
    const seasonalCustomForValidation = !!q('task-seasonal-custom-enabled')?.checked;
    const seasonalChoiceInvalid = seasonalEnabledForValidation && ((seasonalCustomForValidation && seasonalSeasonsForValidation.length > 0) || (!seasonalCustomForValidation && seasonalSeasonsForValidation.length === 0));
    this.setError('err-seasonal-choice', seasonalChoiceInvalid); hasError = hasError || seasonalChoiceInvalid;
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
      const displayUnit = q('task-meter-target-unit')?.value || targetUnit || 'units';
      const meterAmount = this.convertUsageAmount(meterDisplayAmount, displayUnit, targetUnit);
      if (meterSourceType === 'rate' || meterSourceType === 'session_total') {
        baseline = existingCounter?.baseline;
        if (baseline === undefined || baseline === null || baseline === '') baseline = ['rate','session_total','reset_counter'].includes(existingCounter?.source_mode) ? (existing?.totalized_usage?.counter_1 || 0) : 0;
      }
      rules.push({id:'counter_1', type:'counter', name:`Every ${meterDisplayAmount} ${displayUnit || targetUnit || 'units'}`, entity:meterEntity, amount:meterAmount, baseline, unit: targetUnit, source_unit: sourceUnit, target_unit: targetUnit, target_display_value: meterDisplayAmount, target_display_unit: displayUnit, source_mode: meterSourceType});
    }
    const entityValue = q('task-entities')?.value;
    const manualEntities = Array.isArray(entityValue) ? entityValue : (entityValue ? [entityValue] : []);
    const selectedEntities = [...new Set([
      ...manualEntities,
      ...(needsRuntime && runtimeEntity ? [runtimeEntity] : []),
      ...(needsMeter && meterEntity ? [meterEntity] : [])
    ])];
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
    const seasonalSeasons = ['spring','summer','fall','winter'].filter(season => !!q(`task-seasonal-${season}`)?.checked);
    const seasonalCustomEnabled = !!q('task-seasonal-custom-enabled')?.checked;
    const seasonalStartMonth = Number(q('task-seasonal-start-month')?.value || 5);
    const seasonalStartDay = Number(q('task-seasonal-start-day')?.value || 1);
    const seasonalEndMonth = Number(q('task-seasonal-end-month')?.value || 9);
    const seasonalEndDay = Number(q('task-seasonal-end-day')?.value || 30);
    const seasonal = seasonalEnabled ? {
      enabled: true,
      seasons: seasonalCustomEnabled ? [] : seasonalSeasons,
      custom_enabled: seasonalCustomEnabled,
      season: seasonalCustomEnabled && !seasonalSeasons.length ? 'custom' : (seasonalSeasons[0] || 'custom'),
      start_month: seasonalStartMonth,
      start_day: seasonalStartDay,
      end_month: seasonalEndMonth,
      end_day: seasonalEndDay,
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
      equipment_name: q('task-equipment-name').value.trim() || ((this.metadata.devices || []).find(d => d.id === q('task-device').value)?.name || ''),
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
