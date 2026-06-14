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
      .subtitle { color: var(--secondary-text-color); margin-top:6px; font-size:16px; }
      .tabs { display:flex; gap:8px; flex-wrap:wrap; margin:18px 0; }
      button, select, input, textarea { font: inherit; }
      .tab, .btn { border:0; border-radius:999px; padding:10px 16px; cursor:pointer; background: var(--secondary-background-color); color: var(--primary-text-color); }
      .tab.active, .btn.primary { background: var(--primary-color); color: var(--text-primary-color); }
      .btn.danger { background:#b00020; color:white; }
      .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:16px; }
      .card { background: var(--card-background-color); border-radius:18px; padding:18px; box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0,0,0,.12)); border: 1px solid var(--divider-color); }
      .metric { font-size:34px; font-weight:700; }
      .muted { color: var(--secondary-text-color); }
      .pill { display:inline-block; border-radius:999px; padding:5px 10px; font-size:12px; font-weight:700; text-transform:uppercase; background: var(--secondary-background-color); }
      .pill.ok { background:#e4f7e7; color:#0b6b20; } .pill.upcoming { background:#fff4d6; color:#7a5600; }
      .pill.due, .pill.overdue { background:#fde7e7; color:#9b1c1c; } .pill.paused, .pill.snoozed { background:#e8e8e8; color:#555; }
      .progress { height:12px; background: var(--secondary-background-color); border-radius:999px; overflow:hidden; margin:12px 0; }
      .bar { height:100%; background: var(--primary-color); width:0%; }
      .task-title { font-size:20px; font-weight:700; margin:0 0 6px; }
      .task-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
      .list { display:flex; flex-direction:column; gap:12px; }
      .two { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
      @media(max-width: 700px){ .two { grid-template-columns: 1fr; } .hero { align-items:flex-start; flex-direction:column;} }
      label { display:block; font-weight:600; margin:12px 0 6px; }
      .help { font-size:13px; color: var(--secondary-text-color); margin-bottom:6px; }
      input, select, textarea { box-sizing:border-box; width:100%; padding:12px; border-radius:10px; border:1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); }
      textarea { min-height:80px; }
      .modal-scrim { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:flex-start; justify-content:center; padding:40px 16px; z-index:10; overflow:auto; }
      .modal { width:min(900px, 100%); background:var(--card-background-color); border-radius:22px; padding:22px; box-shadow:0 16px 50px rgba(0,0,0,.35); }
      .modal-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px; }
      .empty { text-align:center; padding:40px 16px; }
      .history-item { border-left:4px solid var(--primary-color); padding-left:12px; }
      .tag-row { display:flex; justify-content:space-between; gap:12px; align-items:center; border-bottom:1px solid var(--divider-color); padding:10px 0; }
    `;
  }

  healthScore() {
    if (!this.tasks.length) return 100;
    const overdue = this.tasks.filter(t => ["due", "overdue"].includes(t.status)).length;
    const upcoming = this.tasks.filter(t => t.status === "upcoming").length;
    return Math.max(0, Math.round(100 - overdue * 25 - upcoming * 8));
  }

  taskStatus(t) { return (t.status || t.summary?.status || "unknown").toLowerCase(); }
  percent(t) { return Math.max(0, Math.min(100, Math.round(t.summary?.percent_used ?? 0))); }
  dateShort(iso) { if (!iso) return "Not recorded"; try { return new Date(iso).toLocaleDateString(); } catch { return iso; } }
  slug(value) { return (value || "maintenance_task").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "maintenance_task"; }

  render() {
    this.shadowRoot.innerHTML = `<style>${this.css()}</style><div class="page">${this.renderBody()}</div>${this.renderModal()}`;
    this.bind();
  }

  renderBody() {
    if (this.loading) return `<div class="card empty">Loading Home Maintenance Manager…</div>`;
    if (this.error) return `<div class="card empty"><h2>Could not load maintenance data</h2><p>${this.error}</p><button class="btn primary" data-action="refresh">Try again</button></div>`;
    return `
      <div class="hero"><div><h1>Home Maintenance Manager</h1><div class="subtitle">A simple place to see what needs attention around the house.</div></div><button class="btn primary" data-action="new-task">Add maintenance task</button></div>
      <div class="tabs">
        ${[ ["dashboard","Dashboard"], ["tasks","Tasks"], ["history","History"], ["nfc","NFC Tags"], ["settings","Settings"] ].map(([id,label]) => `<button class="tab ${this.tab===id?'active':''}" data-tab="${id}">${label}</button>`).join("")}
      </div>
      ${this.tab === "dashboard" ? this.renderDashboard() : this.tab === "tasks" ? this.renderTasks() : this.tab === "history" ? this.renderHistory() : this.tab === "nfc" ? this.renderNfc() : this.renderSettings()}
    `;
  }

  renderDashboard() {
    const due = this.tasks.filter(t => ["due", "overdue"].includes(this.taskStatus(t))).length;
    const upcoming = this.tasks.filter(t => this.taskStatus(t) === "upcoming").length;
    const ok = this.tasks.filter(t => this.taskStatus(t) === "ok").length;
    return `
      <div class="grid">
        <div class="card"><div class="muted">Maintenance health</div><div class="metric">${this.healthScore()}%</div><div class="progress"><div class="bar" style="width:${this.healthScore()}%"></div></div></div>
        <div class="card"><div class="muted">Needs attention</div><div class="metric">${due}</div><div class="muted">Due or overdue tasks</div></div>
        <div class="card"><div class="muted">Coming soon</div><div class="metric">${upcoming}</div><div class="muted">Upcoming tasks</div></div>
        <div class="card"><div class="muted">On track</div><div class="metric">${ok}</div><div class="muted">OK tasks</div></div>
      </div>
      <h2>Next up</h2>
      <div class="grid">${this.tasks.length ? this.tasks.slice().sort((a,b)=>this.percent(b)-this.percent(a)).slice(0,6).map(t=>this.renderTaskCard(t)).join("") : this.renderEmptyTasks()}</div>`;
  }

  renderTasks() { return `<div class="grid">${this.tasks.length ? this.tasks.map(t => this.renderTaskCard(t)).join("") : this.renderEmptyTasks()}</div>`; }
  renderEmptyTasks() { return `<div class="card empty"><h2>No maintenance tasks yet</h2><p>Create your first task, like HVAC filter replacement or pool filter cleaning.</p><button class="btn primary" data-action="new-task">Add maintenance task</button></div>`; }

  renderTaskCard(t) {
    const status = this.taskStatus(t);
    return `<div class="card">
      <div class="task-title">${t.name || t.id}</div>
      <span class="pill ${status}">${status}</span>
      <div class="progress"><div class="bar" style="width:${this.percent(t)}%"></div></div>
      <div><b>${this.percent(t)}%</b> used</div>
      <div class="muted">Next due: ${this.dateShort(t.summary?.next_due)}</div>
      <div class="muted">Last completed: ${this.dateShort(t.last_completed)}</div>
      <div class="task-actions">
        <button class="btn primary" data-complete="${t.id}">Mark complete</button>
        <button class="btn" data-snooze="${t.id}">Snooze 7 days</button>
        <button class="btn" data-edit="${t.id}">Edit</button>
      </div>
    </div>`;
  }

  renderHistory() {
    const items = [];
    for (const t of this.tasks) {
      for (const h of (t.activity_history || [])) items.push({ task:t.name, ...h });
      for (const h of (t.completion_history || [])) items.push({ task:t.name, activity:"completed", ...h });
    }
    items.sort((a,b)=>new Date(b.at || 0) - new Date(a.at || 0));
    return `<div class="list">${items.length ? items.slice(0,50).map(i=>`<div class="card history-item"><b>${i.task}</b><div>${i.activity || i.type || 'Activity'}</div><div class="muted">${this.dateShort(i.at)} ${i.notes ? ' - '+i.notes : ''}</div></div>`).join("") : `<div class="card empty">No maintenance history yet.</div>`}</div>`;
  }

  renderNfc() {
    return `<div class="card"><h2>NFC Tags</h2><p class="muted">These are tags currently registered in Home Assistant. Select one when creating or editing a task so scanning it can be tied to that maintenance item.</p>${this.tags.length ? this.tags.map(tag => `<div class="tag-row"><div><b>${tag.name || tag.tag_id || tag.id}</b><div class="muted">${tag.tag_id || tag.id || ''}</div></div></div>`).join("") : `<p>No registered NFC tags were found, or this HA version does not expose the tag list to custom panels.</p>`}</div>`;
  }

  renderSettings() {
    return `<div class="grid"><div class="card"><h2>Settings</h2><p>This panel is the beginner-friendly Home Maintenance Manager experience. Advanced editing is still available from Settings → Devices & Services → Home Maintenance Manager → Configure.</p><button class="btn" data-action="refresh">Refresh data</button></div><div class="card"><h2>Lookups</h2><p>Areas: ${this.metadata.areas.length}</p><p>Devices: ${this.metadata.devices.length}</p><p>Entities: ${this.metadata.entities.length}</p><p>Notify services: ${this.metadata.notify_services.length}</p><p>NFC tags: ${this.tags.length}</p></div></div>`;
  }

  renderModal() {
    if (!this.modal) return "";
    const t = this.modal.task || {};
    const isEdit = !!t.id;
    const areaOptions = [`<option value="">Choose an area...</option>`, ...this.metadata.areas.map(a=>`<option value="${a.id}" ${t.area===a.id?'selected':''}>${a.name}</option>`)].join("");
    const deviceOptions = [`<option value="">No specific device</option>`, ...this.metadata.devices.sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(d=>`<option value="${d.id}" ${t.linked_device_id===d.id?'selected':''}>${d.name}</option>`)].join("");
    const entityOptions = this.metadata.entities.slice().sort((a,b)=>a.entity_id.localeCompare(b.entity_id)).map(e=>`<option value="${e.entity_id}" ${(t.linked_entities||[]).includes(e.entity_id)?'selected':''}>${e.entity_id}${e.name ? ' - '+e.name : ''}</option>`).join("");
    const notifyOptions = [`<option value="automation_only">Automation only</option>`,`<option value="none">No built-in notifications</option>`,`<option value="persistent">Home Assistant notification</option>`,`<option value="mobile">Mobile app</option>`,`<option value="both">Home Assistant + mobile app</option>`].map(o=>o.replace(`value="${t.notification_mode||'automation_only'}"`,`value="${t.notification_mode||'automation_only'}" selected`)).join("");
    const mobileOptions = [`<option value="">Choose a mobile notify target...</option>`, ...this.metadata.notify_services.map(s=>`<option value="${s.value}" ${t.mobile_notify_service===s.value?'selected':''}>${s.label}</option>`)].join("");
    const tagOptions = [`<option value="">No NFC tag</option>`, ...this.tags.map(tag=>`<option value="${tag.tag_id || tag.id}" ${(t.nfc_tags||[])[0]===(tag.tag_id||tag.id)?'selected':''}>${tag.name || tag.tag_id || tag.id}</option>`)].join("");
    const runtimeRule = (t.rules||[]).find(r=>r.type==='runtime') || {};
    const timeRule = (t.rules||[]).find(r=>r.type==='time') || {days:90};
    return `<div class="modal-scrim"><div class="modal">
      <div class="modal-head"><div><h2>${isEdit ? 'Edit maintenance task' : 'Add maintenance task'}</h2><div class="muted">Use plain language. You can always come back and change this later.</div></div><button class="btn" data-action="close-modal">Close</button></div>
      <div class="two"><div><label>Task name</label><div class="help">Example: HVAC filter replacement</div><input id="task-name" value="${t.name || ''}"></div><div><label>Category</label><select id="task-category">${['General','HVAC','Pool','Hot Tub','Appliance','Plumbing','Electrical','Yard','Vehicle','3D Printer','Seasonal','Safety','Other'].map(c=>`<option ${t.category===c?'selected':''}>${c}</option>`).join('')}</select></div></div>
      <label>Description</label><textarea id="task-description">${t.description || ''}</textarea>
      <div class="two"><div><label>Area</label><select id="task-area">${areaOptions}</select></div><div><label>Device</label><select id="task-device">${deviceOptions}</select></div></div>
      <label>Linked entities</label><div class="help">Pick one or more entities related to this maintenance item.</div><select id="task-entities" multiple size="6">${entityOptions}</select>
      <div class="two"><div><label>Maintenance schedule</label><select id="task-schedule"><option value="time">Time based</option><option value="usage">Usage based</option><option value="time_or_usage">Time or usage, whichever comes first</option><option value="time_and_usage">Time and usage</option></select></div><div><label>Every how many days?</label><input id="task-days" type="number" min="1" value="${Math.round(timeRule.days || 90)}"></div></div>
      <div class="two"><div><label>Runtime entity</label><select id="task-runtime-entity"><option value="">Choose an entity...</option>${this.metadata.entities.map(e=>`<option value="${e.entity_id}" ${runtimeRule.entity===e.entity_id?'selected':''}>${e.entity_id}</option>`).join('')}</select></div><div><label>Runtime hours</label><input id="task-runtime-hours" type="number" min="0.1" step="0.1" value="${runtimeRule.hours || 100}"></div></div>
      <div class="two"><div><label>When was it last done?</label><select id="task-baseline"><option value="today">Today</option><option value="unknown">Unknown / start today</option></select></div><div><label>NFC tag</label><select id="task-nfc">${tagOptions}</select></div></div>
      <div class="two"><div><label>Notifications</label><select id="task-notify">${notifyOptions}</select></div><div><label>Mobile notification target</label><select id="task-mobile">${mobileOptions}</select></div></div>
      <label>Instructions</label><textarea id="task-instructions">${t.instructions || ''}</textarea>
      <div class="task-actions"><button class="btn primary" data-action="save-task" data-task-id="${t.id || ''}">${isEdit ? 'Save changes' : 'Create task'}</button>${isEdit ? `<button class="btn danger" data-delete="${t.id}">Delete</button>` : ''}</div>
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
    const save = this.shadowRoot.querySelector('[data-action="save-task"]');
    if (save) save.onclick=()=>this.saveTask(save.dataset.taskId);
  }

  async callService(service, data) {
    await this._hass.callService('home_maintenance_manager', service, data);
    this.modal = null;
    setTimeout(()=>this.loadData(), 700);
  }

  async saveTask(existingId) {
    const q = id => this.shadowRoot.getElementById(id);
    const name = q('task-name').value.trim();
    if (!name) { alert('Please enter a task name.'); return; }
    const schedule = q('task-schedule').value;
    const rules = [];
    if (["time","time_or_usage","time_and_usage"].includes(schedule)) rules.push({id:'time_1', type:'time', name:`Every ${q('task-days').value} days`, days:Number(q('task-days').value || 90)});
    if (["usage","time_or_usage","time_and_usage"].includes(schedule) && q('task-runtime-entity').value) rules.push({id:'runtime_1', type:'runtime', name:`Every ${q('task-runtime-hours').value} runtime hours`, entity:q('task-runtime-entity').value, hours:Number(q('task-runtime-hours').value || 100)});
    if (!rules.length) { alert('Please choose a valid time or usage schedule.'); return; }
    const selectedEntities = Array.from(q('task-entities').selectedOptions).map(o=>o.value);
    const nfc = q('task-nfc').value;
    const task = {
      id: existingId || this.slug(name),
      name,
      description: q('task-description').value,
      category: q('task-category').value,
      area: q('task-area').value || null,
      linked_device_id: q('task-device').value || null,
      linked_entities: selectedEntities,
      rules,
      rule_logic: schedule === 'time_and_usage' ? 'all' : 'any',
      primary_rule_id: null,
      nfc_tags: nfc ? [nfc] : [],
      nfc_action: nfc ? 'confirm' : 'disabled',
      instructions: q('task-instructions').value,
      checklist: [], parts: [], tools: [],
      notification_mode: q('task-notify').value,
      mobile_notify_service: q('task-mobile').value || null,
      allow_snooze: true,
      max_snooze_count: 0,
      max_snooze_days: 30,
      warning_percent: 0.8,
      paused: false,
      last_completed: existingId ? (this.tasks.find(t=>t.id===existingId)?.last_completed || new Date().toISOString()) : new Date().toISOString(),
      baseline_method: q('task-baseline').value
    };
    await this.callService('upsert_task', { task });
  }
}

customElements.define('home-maintenance-manager-panel', HomeMaintenanceManagerPanel);
