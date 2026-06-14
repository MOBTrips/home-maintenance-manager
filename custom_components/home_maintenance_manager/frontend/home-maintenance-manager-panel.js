class HomeMaintenanceManagerPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this.tasks = [];
    this.metadata = { areas: [], devices: [], entities: [], notify_services: [] };
    this.tags = [];
    this.tab = "dashboard";
    this.modal = null;
    this.loading = true;
    this.error = null;
    this.categoryFilter = "All";
    this.statusFilter = "All";
    this.sortMode = "urgent";
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this.loadData();
  }

  connectedCallback() { this.render(); }

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
      .pill.paused, .pill.snoozed { background:#e8e8e8; color:#555; }
      .category-pill { display:inline-block; border-radius:999px; padding:4px 9px; font-size:12px; background: var(--secondary-background-color); color: var(--secondary-text-color); margin:4px 6px 4px 0; }
      .progress { height:12px; background: var(--secondary-background-color); border-radius:999px; overflow:hidden; margin:12px 0; }
      .bar { height:100%; background: var(--primary-color); width:0%; }
      .task-title { font-size:20px; font-weight:700; margin:0 0 6px; }
      .list { display:flex; flex-direction:column; gap:12px; }
      .two { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
      .three { display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; }
      @media(max-width: 800px){ .two, .three { grid-template-columns: 1fr; } .hero { align-items:flex-start; flex-direction:column;} .page { padding:16px; } }
      label { display:block; font-weight:600; margin:12px 0 6px; }
      .help { font-size:13px; color: var(--secondary-text-color); margin-bottom:6px; }
      input, select, textarea { box-sizing:border-box; width:100%; padding:12px; border-radius:10px; border:1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); }
      ha-entity-picker, ha-selector { display:block; width:100%; --mdc-theme-surface: var(--card-background-color); --mdc-theme-on-surface: var(--primary-text-color); }
      textarea { min-height:80px; }
      .modal-scrim { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:flex-start; justify-content:center; padding:40px 16px; z-index:10; overflow:auto; }
      .modal { width:min(940px, 100%); background:var(--card-background-color); border-radius:22px; padding:22px; box-shadow:0 16px 50px rgba(0,0,0,.35); }
      .modal-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px; }
      .empty { text-align:center; padding:40px 16px; }
      .history-item { border-left:4px solid var(--primary-color); padding-left:12px; }
      .tag-row { display:flex; justify-content:space-between; gap:12px; align-items:center; border-bottom:1px solid var(--divider-color); padding:10px 0; }
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
    `;
  }

  taskStatus(t) { return (t.status || t.summary?.status || "unknown").toLowerCase(); }
  percent(t) { return Math.max(0, Math.min(100, Math.round(t.summary?.percent_used ?? 0))); }
  category(t) { return t.category || "General"; }
  dateShort(iso) { if (!iso) return "Not recorded"; try { return new Date(iso).toLocaleDateString(); } catch { return iso; } }
  slug(value) { return (value || "maintenance_task").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "maintenance_task"; }
  escape(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
  label(text, tip) { return `<span class="field-label"><span>${text}</span><span class="tip" title="${this.escape(tip)}">?</span></span>`; }

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
    if (this.statusFilter !== "All") {
      if (this.statusFilter === "needs_attention") tasks = tasks.filter(t => ["due","overdue"].includes(this.taskStatus(t)));
      else tasks = tasks.filter(t => this.taskStatus(t) === this.statusFilter);
    }
    const score = t => ({overdue:5,due:4,upcoming:3,snoozed:2,paused:1,ok:0}[this.taskStatus(t)] ?? 0);
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
      <div class="hero"><div><h1>Home Maintenance Manager</h1><div class="subtitle">A simple place to see what needs attention around the house.</div></div><button class="btn primary" data-action="new-task">Add maintenance task</button></div>
      <div class="tabs">
        ${[["dashboard","Dashboard"],["tasks","Tasks"],["history","History"],["nfc","NFC Tags"],["settings","Settings"]].map(([id,label]) => `<button class="tab ${this.tab===id?'active':''}" data-tab="${id}">${label}</button>`).join("")}
      </div>
      ${this.tab === "dashboard" ? this.renderDashboard() : this.tab === "tasks" ? this.renderTasks() : this.tab === "history" ? this.renderHistory() : this.tab === "nfc" ? this.renderNfc() : this.renderSettings()}
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
    const statusOptions = [["All","All statuses"],["needs_attention","Needs attention"],["upcoming","Upcoming"],["ok","OK"],["snoozed","Snoozed"],["paused","Paused"]].map(([v,l]) => `<option value="${v}" ${this.statusFilter===v?'selected':''}>${l}</option>`).join("");
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
        <button class="btn small" data-edit="${this.escape(t.id)}">Edit</button>
      </div>
    </div>`;
  }

  renderHistory() {
    const items = this.tasks.flatMap(t => (t.activity_history || []).map(i => ({...i, task:t.name, category:this.category(t)}))).sort((a,b)=>String(b.at||"").localeCompare(String(a.at||""))).slice(0,100);
    return `<div class="list">${items.length ? items.map(i => `<div class="card history-item"><b>${this.escape(i.task)}</b> <span class="category-pill">${this.escape(i.category)}</span><div class="muted">${this.escape(i.activity || i.type || 'activity')} • ${this.dateShort(i.at)} ${i.notes ? ' - '+this.escape(i.notes) : ''}</div></div>`).join("") : `<div class="card empty">No maintenance history yet.</div>`}</div>`;
  }

  renderNfc() {
    return `<div class="card"><h2>NFC Tags</h2><p class="muted">These are tags currently registered in Home Assistant. Select one when creating or editing a task so scanning it can be tied to that maintenance item.</p>${this.tags.length ? this.tags.map(tag => `<div class="tag-row"><div><b>${this.escape(tag.name || tag.tag_id || tag.id)}</b><div class="muted">${this.escape(tag.tag_id || tag.id || '')}</div></div></div>`).join("") : `<p>No registered NFC tags were found, or this HA version does not expose the tag list to custom panels.</p>`}</div>`;
  }

  renderSettings() {
    return `<div class="grid"><div class="card"><h2>Settings</h2><p>This panel is the beginner-friendly Home Maintenance Manager experience. Advanced editing is still available from Settings -> Devices & Services -> Home Maintenance Manager -> Configure.</p><button class="btn" data-action="refresh">Refresh data</button></div><div class="card"><h2>Lookups</h2><p>Areas: ${this.metadata.areas.length}</p><p>Devices: ${this.metadata.devices.length}</p><p>Entities: ${this.metadata.entities.length}</p><p>Notify services: ${this.metadata.notify_services.length}</p><p>NFC tags: ${this.tags.length}</p><p>Categories: ${this.categories().length}</p></div></div>`;
  }

  renderModal() {
    if (!this.modal) return "";
    const t = this.modal.task || {};
    const isEdit = !!t.id;
    const areaOptions = [`<option value="">No area / choose later</option>`, ...this.metadata.areas.map(a=>`<option value="${this.escape(a.id)}" ${t.area===a.id?'selected':''}>${this.escape(a.name)}</option>`)].join("");
    const deviceOptions = [`<option value="">No specific device</option>`, ...this.metadata.devices.sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(d=>`<option value="${this.escape(d.id)}" ${t.linked_device_id===d.id?'selected':''}>${this.escape(d.name || d.id)}</option>`)].join("");
    const selectedNotify = t.notification_mode || 'automation_only';
    const notifyOptions = [["automation_only","Automation only"],["none","No built-in notifications"],["persistent","Home Assistant persistent notification"],["mobile","Mobile app notification"],["both","Home Assistant + mobile app"]].map(([v,l])=>`<option value="${v}" ${selectedNotify===v?'selected':''}>${l}</option>`).join("");
    const mobileOptions = [`<option value="">No mobile target selected</option>`, ...this.metadata.notify_services.map(s=>`<option value="${this.escape(s.value)}" ${t.mobile_notify_service===s.value?'selected':''}>${this.escape(s.label)}</option>`)].join("");
    const tagOptions = [`<option value="">No NFC tag</option>`, ...this.tags.map(tag=>`<option value="${this.escape(tag.tag_id || tag.id)}" ${(t.nfc_tags||[])[0]===(tag.tag_id||tag.id)?'selected':''}>${this.escape(tag.name || tag.tag_id || tag.id)}</option>`)].join("");
    const runtimeRule = (t.rules||[]).find(r=>r.type==='runtime') || {};
    const counterRule = (t.rules||[]).find(r=>r.type==='counter') || {};
    const timeRule = (t.rules||[]).find(r=>r.type==='time') || {days:90};
    const hasTimeRule = !!timeRule.days;
    const hasRuntimeRule = !!runtimeRule.entity;
    const hasCounterRule = !!counterRule.entity;
    let scheduleValue = 'time';
    if (hasTimeRule && hasRuntimeRule) scheduleValue = t.rule_logic === 'all' ? 'time_and_runtime' : 'time_or_runtime';
    else if (hasTimeRule && hasCounterRule) scheduleValue = t.rule_logic === 'all' ? 'time_and_meter' : 'time_or_meter';
    else if (hasRuntimeRule) scheduleValue = 'runtime';
    else if (hasCounterRule) scheduleValue = 'meter';
    const counterUnit = counterRule.unit || (counterRule.entity && this._hass?.states?.[counterRule.entity]?.attributes?.unit_of_measurement) || 'units';
    const categoryOptions = this.categories().map(c=>`<option value="${this.escape(c)}" ${this.category(t)===c?'selected':''}>${this.escape(c)}</option>`).join('');
    return `<div class="modal-scrim"><div class="modal">
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
            <option value="time" ${scheduleValue==='time'?'selected':''}>Time based</option>
            <option value="runtime" ${scheduleValue==='runtime'?'selected':''}>Runtime hours</option>
            <option value="meter" ${scheduleValue==='meter'?'selected':''}>Metered usage</option>
            <option value="time_or_runtime" ${scheduleValue==='time_or_runtime'?'selected':''}>Time or runtime, whichever comes first</option>
            <option value="time_and_runtime" ${scheduleValue==='time_and_runtime'?'selected':''}>Time and runtime</option>
            <option value="time_or_meter" ${scheduleValue==='time_or_meter'?'selected':''}>Time or metered usage, whichever comes first</option>
            <option value="time_and_meter" ${scheduleValue==='time_and_meter'?'selected':''}>Time and metered usage</option>
          </select></div>
          <div class="conditional time-fields"><label>${this.label('Every how many days?','For time-based rules, the task becomes due this many days after the last completed date.')}</label><input id="task-days" type="number" min="1" value="${Math.round(timeRule.days || 90)}"><div id="err-days" class="field-error">Enter a valid number of days.</div></div>
        </div>
        <div class="two">
          <div class="conditional runtime-fields"><label>${this.label('Runtime tracking source','Choose the entity whose ON/running time should be counted. Use this for pumps, fans, compressors, printers, and similar equipment.')}</label><div class="help">Runtime always stores hours. Good choices are switches, binary sensors, fans, status sensors, or power sensors above a threshold.</div><ha-entity-picker id="task-runtime-entity" allow-custom-entity></ha-entity-picker><div id="err-runtime-entity" class="field-error">Choose a runtime source for runtime-based tasks.</div></div>
          <div class="conditional runtime-fields"><label>${this.label('Runtime hours','The task becomes due after this many runtime hours since the last completion.')}</label><input id="task-runtime-hours" type="number" min="0.1" step="0.1" value="${runtimeRule.hours || 100}"><div id="err-runtime-hours" class="field-error">Enter valid runtime hours.</div></div>
        </div>
        <div class="two">
          <div class="conditional meter-fields"><label>${this.label('Metered usage source','Choose a numeric sensor that increases over time, such as gallons, kWh, miles, grams, pages, or cycles.')}</label><div class="help">The unit is read from the selected entity automatically when available.</div><ha-entity-picker id="task-meter-entity" allow-custom-entity></ha-entity-picker><div id="err-meter-entity" class="field-error">Choose a metered usage source.</div></div>
          <div class="conditional meter-fields"><label>${this.label('Usage amount','The task becomes due after the selected sensor increases by this amount since the last completion.')}</label><input id="task-meter-amount" type="number" min="0.1" step="0.1" value="${counterRule.amount || 1000}"><div class="help">Current unit: <span id="task-meter-unit">${this.escape(counterUnit)}</span></div><div id="err-meter-amount" class="field-error">Enter a valid usage amount.</div></div>
        </div>
        <label>${this.label('When was it last done?','Sets the starting point for the first due date. Today is safest for a new task.')}</label><select id="task-baseline"><option value="today">Today</option><option value="unknown">Unknown / start today</option></select>
      </div>

      <div class="form-section">
        <h3>4. Reminders and NFC</h3><p class="section-note">Choose whether Home Assistant should notify you and optionally connect an NFC tag.</p>
        <div class="two">
          <div><label>${this.label('Notification style','Automation only exposes entities for your own automations. Built-in options create Home Assistant notifications. Category is included as context, such as [Pool] Filter Cleaning.')}</label><select id="task-notify">${notifyOptions}</select></div>
          <div class="conditional mobile-fields"><label>${this.label('Mobile notification target','Choose a notify service from Home Assistant, usually notify.mobile_app_phone_name. This appears only when mobile notifications are selected.')}</label><select id="task-mobile">${mobileOptions}</select><div id="err-mobile" class="field-error">Choose a mobile notification target.</div></div>
        </div>
        <label>${this.label('NFC tag','Choose a registered Home Assistant NFC tag. Scanning it can be used to confirm or log this task.')}</label><select id="task-nfc">${tagOptions}</select>
      </div>

      <div class="form-section">
        <h3>5. Instructions</h3><p class="section-note">Optional homeowner-friendly notes. Add the steps someone should follow when doing the task.</p>
        <label>${this.label('Instructions','Optional markdown-style instructions or checklist notes. Example: Turn off power, remove filter, clean, reinstall.')}</label><textarea id="task-instructions" placeholder="1. Turn off equipment\n2. Perform maintenance\n3. Mark complete">${this.escape(t.instructions || '')}</textarea>
      </div>

      <div class="task-actions"><button class="btn primary" data-action="save-task" data-task-id="${this.escape(t.id || '')}">${isEdit ? 'Save changes' : 'Create task'}</button>${isEdit ? `<button class="btn danger" data-delete="${this.escape(t.id)}">Delete</button>` : ''}</div>
    </div></div>`;
  }

  bind() {
    this.shadowRoot.querySelectorAll('[data-tab]').forEach(el=>el.onclick=()=>{ this.tab=el.dataset.tab; this.render(); });
    this.shadowRoot.querySelectorAll('[data-action="refresh"]').forEach(el=>el.onclick=()=>this.loadData());
    this.shadowRoot.querySelectorAll('[data-action="new-task"]').forEach(el=>el.onclick=()=>{ this.modal={task:{}}; this.render(); });
    this.shadowRoot.querySelectorAll('[data-action="close-modal"]').forEach(el=>el.onclick=()=>{ this.modal=null; this.render(); });
    this.shadowRoot.querySelectorAll('[data-complete]').forEach(el=>el.onclick=()=>this.callService('mark_complete',{task_id:el.dataset.complete, method:'panel'}));
    this.shadowRoot.querySelectorAll('[data-snooze]').forEach(el=>el.onclick=()=>this.callService('snooze',{task_id:el.dataset.snooze, days:7}));
    this.shadowRoot.querySelectorAll('[data-edit]').forEach(el=>el.onclick=()=>{ const task=this.tasks.find(t=>t.id===el.dataset.edit); this.modal={task:JSON.parse(JSON.stringify(task||{}))}; this.render(); });
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
    if (schedule) schedule.onchange = () => this.syncConditionalFields();
    if (notify) notify.onchange = () => this.syncConditionalFields();
    this.syncConditionalFields();
    this.updateMeterUnit();
  }

  updateMeterUnit() {
    const meterEntity = this.shadowRoot.getElementById('task-meter-entity')?.value || '';
    const state = meterEntity ? this._hass?.states?.[meterEntity] : null;
    const unit = state?.attributes?.unit_of_measurement || 'units';
    const el = this.shadowRoot.getElementById('task-meter-unit');
    if (el) el.textContent = unit;
  }

  syncConditionalFields() {
    const schedule = this.shadowRoot.getElementById('task-schedule')?.value || 'time';
    const notify = this.shadowRoot.getElementById('task-notify')?.value || 'automation_only';
    const showTime = ["time","time_or_runtime","time_and_runtime","time_or_meter","time_and_meter"].includes(schedule);
    const showRuntime = ["runtime","time_or_runtime","time_and_runtime"].includes(schedule);
    const showMeter = ["meter","time_or_meter","time_and_meter"].includes(schedule);
    const showUsage = showRuntime || showMeter;
    const showMobile = ["mobile","both"].includes(notify);
    this.shadowRoot.querySelectorAll('.time-fields').forEach(el => el.classList.toggle('hidden', !showTime));
    this.shadowRoot.querySelectorAll('.runtime-fields').forEach(el => el.classList.toggle('hidden', !showRuntime));
    this.shadowRoot.querySelectorAll('.meter-fields').forEach(el => el.classList.toggle('hidden', !showMeter));
    this.shadowRoot.querySelectorAll('.usage-fields').forEach(el => el.classList.toggle('hidden', !showUsage));
    this.shadowRoot.querySelectorAll('.mobile-fields').forEach(el => el.classList.toggle('hidden', !showMobile));
    this.updateMeterUnit();
  }

  async callService(service, data) {
    await this._hass.callService('home_maintenance_manager', service, data);
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
    const days = Number(q('task-days')?.value || 0);
    const runtimeEntity = q('task-runtime-entity')?.value || '';
    const runtimeHours = Number(q('task-runtime-hours')?.value || 0);
    const meterEntity = q('task-meter-entity')?.value || '';
    const meterAmount = Number(q('task-meter-amount')?.value || 0);
    const notify = q('task-notify').value;
    const mobile = q('task-mobile')?.value || '';
    let hasError = false;
    this.setError('err-name', !name); hasError = hasError || !name;
    this.setError('err-days', needsTime && (!days || days < 1)); hasError = hasError || (needsTime && (!days || days < 1));
    this.setError('err-runtime-entity', needsRuntime && !runtimeEntity); hasError = hasError || (needsRuntime && !runtimeEntity);
    this.setError('err-runtime-hours', needsRuntime && (!runtimeHours || runtimeHours <= 0)); hasError = hasError || (needsRuntime && (!runtimeHours || runtimeHours <= 0));
    this.setError('err-meter-entity', needsMeter && !meterEntity); hasError = hasError || (needsMeter && !meterEntity);
    this.setError('err-meter-amount', needsMeter && (!meterAmount || meterAmount <= 0)); hasError = hasError || (needsMeter && (!meterAmount || meterAmount <= 0));
    this.setError('err-mobile', ["mobile","both"].includes(notify) && !mobile); hasError = hasError || (["mobile","both"].includes(notify) && !mobile);
    if (hasError) return;
    const rules = [];
    if (needsTime) rules.push({id:'time_1', type:'time', name:`Every ${days} days`, days});
    if (needsRuntime) rules.push({id:'runtime_1', type:'runtime', name:`Every ${runtimeHours} runtime hours`, entity:runtimeEntity, hours:runtimeHours});
    if (needsMeter) {
      const state = this._hass?.states?.[meterEntity];
      const existingCounter = existing?.rules?.find(r => r.type === 'counter' && r.entity === meterEntity);
      let baseline = existingCounter?.baseline;
      if (baseline === undefined || baseline === null || baseline === '') {
        const raw = state?.state;
        const parsed = Number(raw);
        baseline = Number.isFinite(parsed) ? parsed : 0;
      }
      const unit = state?.attributes?.unit_of_measurement || existingCounter?.unit || '';
      rules.push({id:'counter_1', type:'counter', name:`Every ${meterAmount} ${unit || 'units'}`, entity:meterEntity, amount:meterAmount, baseline, unit});
    }
    const entityValue = q('task-entities')?.value;
    const selectedEntities = Array.isArray(entityValue) ? entityValue : (entityValue ? [entityValue] : []);
    const nfc = q('task-nfc').value;
    const existing = existingId ? this.tasks.find(t=>t.id===existingId) : null;
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
      nfc_action: nfc ? 'confirm' : 'disabled',
      instructions: q('task-instructions').value,
      checklist: existing?.checklist || [], parts: existing?.parts || [], tools: existing?.tools || [],
      notification_mode: notify,
      mobile_notify_service: mobile || null,
      allow_snooze: true,
      max_snooze_count: 0,
      max_snooze_days: 30,
      warning_percent: 0.8,
      paused: false,
      last_completed: existing ? (existing.last_completed || new Date().toISOString()) : new Date().toISOString(),
      baseline_method: q('task-baseline').value
    };
    await this.callService('upsert_task', { task });
  }
}

customElements.define('home-maintenance-manager-panel', HomeMaintenanceManagerPanel);
