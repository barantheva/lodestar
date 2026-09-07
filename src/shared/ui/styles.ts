export const DASHBOARD_CSS = `
:root {
  --bg: #090c10;
  --sidebar-bg: #0d1117;
  --card-bg: #161b22;
  --card-inner: #0d1117;
  --border: #30363d;
  --border-light: #21262d;
  --text: #c9d1d9;
  --text-muted: #8b949e;
  --text-white: #f0f6fc;
  --blue: #388bfd;
  --blue-muted: rgba(56, 139, 253, 0.15);
  --green: #3fb950;
  --green-muted: rgba(63, 185, 80, 0.15);
  --orange: #d29922;
  --purple: #bc8cff;
  --red: #f85149;
}
* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
body { background: var(--bg); color: var(--text); display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

.app-body { flex: 1; display: flex; min-height: 0; }

.sidebar { width: 220px; background: var(--sidebar-bg); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 16px 12px; flex-shrink: 0; }
.brand { display: flex; align-items: center; gap: 10px; padding: 6px 8px; margin-bottom: 20px; }
.brand-logo { width: 28px; height: 28px; border-radius: 6px; background: #0d1117; border: 1px solid rgba(56, 189, 248, 0.3); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px rgba(56, 189, 248, 0.2); flex-shrink: 0; }
.brand-text h2 { font-size: 15px; color: var(--text-white); font-weight: 600; line-height: 1.2; }
.brand-text span { font-size: 11px; color: var(--text-muted); }

.nav-group { margin-bottom: 18px; }
.nav-title { font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 600; padding: 6px 8px; letter-spacing: 0.5px; }
.nav-item { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 6px; font-size: 13px; color: var(--text); cursor: pointer; text-decoration: none; transition: 0.15s; user-select: none; }
.nav-item:hover { background: #21262d; color: var(--text-white); }
.nav-item.active { background: #1f6feb22; color: #58a6ff; font-weight: 600; }
.nav-badge { margin-left: auto; width: 18px; height: 18px; border-radius: 9px; background: var(--blue-muted); color: var(--blue); font-size: 11px; display: flex; align-items: center; justify-content: center; font-weight: 600; }

.sidebar-footer { margin-top: auto; padding-top: 12px; border-top: 1px solid var(--border-light); font-size: 12px; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center; }

.main-content { flex: 1; display: flex; flex-direction: column; overflow-y: auto; background: var(--bg); min-width: 0; }
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid var(--border); background: var(--sidebar-bg); }
.topbar-left { display: flex; align-items: center; gap: 16px; }
.page-title { font-size: 20px; font-weight: 700; color: var(--text-white); }

.filter-pills { display: flex; background: #0d1117; border: 1px solid var(--border); border-radius: 6px; padding: 2px; }
.filter-pills[hidden] { display: none; }
.pill { padding: 4px 12px; font-size: 12px; border-radius: 4px; cursor: pointer; color: var(--text-muted); font-weight: 500; text-decoration: none; }
.pill.active { background: #238636; color: #fff; font-weight: 600; }

.dropdown-btn { background: #161b22; border: 1px solid var(--border); border-radius: 6px; padding: 5px 12px; font-size: 12px; color: var(--text); cursor: pointer; display: flex; align-items: center; gap: 6px; }
.action-btn { background: #21262d; border: 1px solid var(--border); color: var(--text-white); font-size: 12px; font-weight: 500; padding: 6px 12px; border-radius: 6px; cursor: pointer; }
.action-btn.primary { background: #1f6feb; border-color: #388bfd; }
.action-btn.danger { background: rgba(248, 81, 73, 0.12); border-color: var(--red); color: #ffa198; }

.dashboard-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 20px; }

.sentinel-banner { background: rgba(210, 153, 34, 0.12); border: 1px solid var(--orange); border-radius: 8px; padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #e3b341; }
.sentinel-countdown { font-family: monospace; font-size: 15px; font-weight: 700; background: rgba(0,0,0,0.3); padding: 4px 10px; border-radius: 4px; border: 1px solid rgba(210, 153, 34, 0.3); }

.widget-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.widget-grid-2 { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
.widget-grid-3col { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }

.card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; }
.card-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
.card-title-group { display: flex; align-items: center; gap: 8px; }
.card-icon { font-size: 14px; }
.card-title { font-size: 14px; font-weight: 600; color: var(--text-white); }
.card-stat { font-size: 20px; font-weight: 700; color: var(--text-white); }
.card-stat-label { font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 600; }
.card-subtitle { font-size: 11px; color: var(--text-muted); margin-bottom: 10px; }

.tabs { display: flex; gap: 6px; margin-bottom: 14px; }
.tab { font-size: 11px; padding: 3px 8px; border-radius: 4px; background: #21262d; color: var(--text-muted); cursor: pointer; font-weight: 500; text-decoration: none; }
.tab.active { background: #388bfd22; color: #58a6ff; font-weight: 600; }

.bar-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
.bar-row { display: flex; align-items: center; justify-content: space-between; font-size: 12px; }
.bar-label { width: 130px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: monospace; }
.bar-track { flex: 1; height: 7px; background: #21262d; border-radius: 4px; margin: 0 12px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 4px; background: #388bfd; }
.bar-meta { width: 90px; text-align: right; color: var(--text-muted); font-size: 11px; }

.card-footer { margin-top: auto; padding-top: 10px; border-top: 1px solid var(--border-light); font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between; }

.chart-container { height: 80px; display: flex; align-items: flex-end; gap: 4px; padding: 8px 0; margin-bottom: 12px; border-bottom: 1px solid var(--border-light); }
.chart-bar { flex: 1; background: #1f6feb; border-radius: 2px 2px 0 0; }
.chart-bar.stacked-green { background: #238636; }
.chart-bar.stacked-orange { background: #d29922; }

.decision-quote { background: #0d1117; border-left: 3px solid #1f6feb; padding: 10px 12px; font-size: 12px; color: #8b949e; border-radius: 0 4px 4px 0; line-height: 1.4; margin-bottom: 10px; font-style: italic; }

.activity-feed { display: flex; flex-direction: column; gap: 12px; }
.activity-item { background: #0d1117; border: 1px solid var(--border-light); border-radius: 6px; padding: 12px; font-size: 12px; }
.activity-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.branch-tag { font-family: monospace; color: #58a6ff; font-weight: 600; }
.badge-pill { background: #21262d; border-radius: 4px; padding: 2px 6px; font-size: 10px; color: var(--text-muted); }
.badge-green { background: rgba(63, 185, 80, 0.15); color: #3fb950; }
.badge-orange { background: rgba(210, 153, 34, 0.15); color: #e3b341; }
.badge-red { background: rgba(248, 81, 73, 0.15); color: #ffa198; }
.guard-doc-link { color: #58a6ff; text-decoration: none; font-size: 12px; }
.guard-doc-link:hover { text-decoration: underline; }
.activity-quote { color: #c9d1d9; font-size: 12px; margin-bottom: 8px; }
.activity-meta { font-size: 11px; color: var(--text-muted); display: flex; gap: 12px; }

.log-block { font-size: 11px; background: #0d1117; padding: 8px; border-radius: 4px; font-family: monospace; color: #79c0ff; border: 1px solid #21262d; line-height: 1.6; }
.log-block .ok { color: #7ee787; }
.log-block .warn { color: #e3b341; }
.log-block .err { color: #ffa198; }
.log-block .muted { color: var(--text-muted); }

table.worker-table { width: 100%; border-collapse: collapse; font-size: 12px; }
table.worker-table th { text-align: left; color: var(--text-muted); font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; padding: 6px 8px; border-bottom: 1px solid var(--border-light); }
table.worker-table td { padding: 8px; border-bottom: 1px solid var(--border-light); font-family: monospace; color: var(--text); }
table.worker-table tr:last-child td { border-bottom: none; }
.assign-select { background: #0d1117; border: 1px solid var(--border); color: var(--text); font-family: monospace; font-size: 11px; padding: 3px 4px; border-radius: 4px; }
.state-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
.state-running { background: #3fb950; }
.state-idle { background: #8b949e; }
.state-paused { background: #d29922; }
.state-crashed { background: #f85149; }
.state-restarting { background: #58a6ff; }
.worker-actions { display: flex; gap: 6px; }
.worker-actions button, .worker-actions form { display: inline; }
.worker-actions button { font-size: 11px; padding: 3px 8px; }

.log-split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.log-pane { background: #0d1117; border: 1px solid var(--border-light); border-radius: 6px; padding: 10px; font-family: monospace; font-size: 11px; color: var(--text-muted); max-height: 200px; overflow-y: auto; line-height: 1.7; }
.log-pane-title { font-size: 10px; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 6px; letter-spacing: 0.5px; }

.gateway-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 4px; border-bottom: 1px solid var(--border-light); font-size: 12px; }
.gateway-row:last-child { border-bottom: none; }

.stepper { display: flex; align-items: center; justify-content: center; gap: 2px; padding: 4px 0 24px; flex-wrap: wrap; }
.step { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 104px; }
.step-circle { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; border: 2px solid var(--border); background: var(--card-bg); color: var(--text-muted); }
.step.done .step-circle { border-color: #3fb950; color: #3fb950; }
.step.pending .step-circle { border-color: #d29922; color: #d29922; }
.step-label { font-size: 11px; color: var(--text-white); text-align: center; font-weight: 600; }
.step-sub { font-size: 10px; color: var(--text-muted); text-align: center; }
.step-connector { flex: 1; height: 2px; background: var(--border); margin-top: -18px; max-width: 36px; min-width: 12px; }
.step-connector.done { background: #3fb950; }

.relay-grid-3x2 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 16px; }
.relay-grid-3x2 .card { border-left: 3px solid var(--border); }
.relay-grid-3x2 .card.stage-auto { border-left-color: #3fb950; }
.relay-grid-3x2 .card.stage-pending { border-left-color: #d29922; }

.relay-grid-2x3 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; }
.relay-grid-2x3 .card { border-left: 3px solid var(--border); }
.relay-grid-2x3 .card.stage-auto { border-left-color: #3fb950; }
.relay-grid-2x3 .card.stage-pending { border-left-color: #d29922; }

.guard-details { margin-top: 10px; background: rgba(0, 0, 0, 0.35); border: 1px solid var(--border-light); border-radius: 6px; padding: 8px 12px; font-size: 11px; }
.guard-details summary { font-weight: 600; color: #79c0ff; cursor: pointer; user-select: none; outline: none; display: flex; align-items: center; justify-content: space-between; }
.guard-details summary:hover { color: var(--text-white); }
.guard-details-content { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border-light); color: var(--text); line-height: 1.55; }
.guard-details-content ul { margin: 4px 0 6px 16px; }
.guard-details-content li { margin-bottom: 4px; }
.guard-details-content strong { color: var(--text-white); }
.guard-details-content code { color: #79c0ff; background: rgba(56, 139, 253, 0.1); padding: 1px 4px; border-radius: 3px; font-family: monospace; }
.guard-badge { background: #21262d; border-radius: 4px; padding: 1px 5px; font-family: monospace; font-size: 10px; color: #8b949e; }
.conn-list { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 10px; }
.conn-tag { display: inline-flex; align-items: center; gap: 5px; font-family: monospace; font-size: 10px; padding: 3px 8px; border-radius: 4px; background: #161b22; border: 1px solid var(--border-light); color: var(--text); }
.conn-tag.ok { border-color: rgba(63, 185, 80, 0.4); background: rgba(63, 185, 80, 0.1); color: #7ee787; }
.conn-tag.pending { border-color: rgba(210, 153, 34, 0.4); background: rgba(210, 153, 34, 0.1); color: #e3b341; }

.tree, .tree ul { list-style: none; margin: 0; padding: 0; font-family: monospace; font-size: 12px; }
.tree ul { padding-left: 16px; border-left: 1px dashed var(--border); margin-left: 6px; }
.tree li { padding: 4px 0; }
.tree-dir { color: var(--text-muted); font-weight: 600; }
.tree-symbol { color: #79c0ff; }
.tree-type { color: var(--text-muted); font-size: 10px; margin-left: 6px; }

.notify-icons { display: flex; gap: 4px; flex-wrap: wrap; }
.notify-icon { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #21262d; color: var(--text-muted); white-space: nowrap; }
.notify-icon.sent { background: rgba(63, 185, 80, 0.15); color: #3fb950; }
.notify-icon.pending { background: rgba(210, 153, 34, 0.15); color: #e3b341; }

.settings-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border-light); gap: 16px; }
.settings-row:last-child { border-bottom: none; }
.settings-label { font-size: 12px; color: var(--text-white); font-weight: 600; }
.settings-desc { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.settings-input { background: #0d1117; border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; font-size: 12px; color: var(--text); font-family: monospace; min-width: 220px; }
.settings-input::placeholder { color: #484f58; }
.install-step { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border-light); }
.install-step:last-child { border-bottom: none; }
.install-step-num { width: 22px; height: 22px; border-radius: 50%; background: #1f6feb22; color: #58a6ff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

.empty-state { font-size: 12px; color: var(--text-muted); padding: 20px; text-align: center; }

/* User profile button & prompt dropdown */
.user-menu-btn { background: #161b22; border: 1px solid var(--border); border-radius: 20px; padding: 5px 12px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-white); font-size: 12px; transition: all 0.15s ease; outline: none; }
.user-menu-btn:hover { background: #21262d; border-color: #58a6ff; box-shadow: 0 0 10px rgba(56, 139, 253, 0.2); }
.user-prompt-dropdown { position: absolute; right: 0; top: calc(100% + 8px); width: 280px; background: #161b22; border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 12px 28px rgba(0,0,0,0.7); padding: 14px; z-index: 1000; }
.user-prompt-header { display: flex; align-items: center; gap: 10px; padding-bottom: 12px; border-bottom: 1px solid var(--border-light); margin-bottom: 12px; }
.user-avatar-circle { width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(135deg, #1f6feb, #38bdf8); color: #fff; font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.user-prompt-section { margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--border-light); font-size: 11px; }
.user-prompt-item { display: flex; justify-content: space-between; margin-bottom: 6px; }
.user-prompt-footer { padding-top: 2px; }
`;
