export const uiCss = String.raw`
:root {
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #f4f4f5;
  background: #0d0d0d;
  font-synthesis: none;
}
* { box-sizing: border-box; }
body { margin: 0; background: #0d0d0d; color: #f4f4f5; }
button, input, select, textarea { font: inherit; }
button { color: inherit; }
.app { min-height: 100vh; display: grid; grid-template-columns: 244px minmax(0, 1fr); }
.sidebar {
  position: sticky; top: 0; height: 100vh; overflow-y: auto;
  background: #171717; border-right: 1px solid #2a2a2a; padding: 18px 12px;
}
.brand { display: flex; align-items: center; gap: 10px; padding: 2px 9px 20px; font-size: 18px; font-weight: 650; }
.brand-mark { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; background: #10a7f0; color: white; font-size: 13px; font-weight: 800; }
.brand-copy { display: grid; line-height: 1.1; }
.brand-copy small { color: #777; font-size: 10px; text-transform: uppercase; letter-spacing: .1em; margin-top: 4px; }
.nav-label { margin: 16px 10px 6px; color: #686868; font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .08em; }
.nav-item {
  width: 100%; border: 0; background: transparent; display: flex; align-items: center; gap: 11px;
  color: #aaa; padding: 9px 10px; margin: 2px 0; border-radius: 8px; cursor: pointer; text-align: left;
  transition: background .14s ease, color .14s ease;
}
.nav-item:hover, .nav-item.active { background: #292929; color: #fff; }
.nav-icon { width: 18px; text-align: center; color: #929292; font-family: Arial, sans-serif; font-size: 16px; line-height: 1; }
.nav-item.active .nav-icon { color: #10a7f0; }
.content { min-width: 0; }
.topbar {
  height: 58px; border-bottom: 1px solid #222; display: flex; align-items: center; justify-content: space-between;
  padding: 0 32px; position: sticky; top: 0; z-index: 10; background: rgba(13,13,13,.92); backdrop-filter: blur(12px);
}
.crumb { color: #8a8a8a; font-size: 13px; }
.crumb b { color: #ececec; font-weight: 550; }
.top-status { display: flex; align-items: center; gap: 8px; color: #898989; font-size: 12px; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: #666; }
.status-dot.ready { background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,.12); }
.mobile-menu { display: none; border: 0; background: transparent; color: #aaa; font-size: 20px; cursor: pointer; }
.main { max-width: 1240px; margin: 0 auto; padding: 34px 32px 80px; }
.view.hidden { display: none; }
.page-head { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; margin-bottom: 24px; }
.page-title { margin: 0; font-size: 26px; line-height: 1.2; letter-spacing: -.02em; font-weight: 650; }
.page-description { margin: 7px 0 0; color: #858585; font-size: 14px; max-width: 700px; line-height: 1.5; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.btn {
  min-height: 36px; border: 1px solid #363636; background: #202020; color: #e9e9e9;
  padding: 8px 12px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  transition: background .14s ease, border-color .14s ease, transform .14s ease;
}
.btn:hover { background: #292929; border-color: #484848; }
.btn:active { transform: translateY(1px); }
.btn.primary { background: #f4f4f5; border-color: #f4f4f5; color: #111; font-weight: 600; }
.btn.primary:hover { background: #fff; }
.btn.ghost { background: transparent; }
.btn.danger { color: #fda4af; }
.btn.small { min-height: 30px; padding: 5px 9px; font-size: 12px; }
.btn.icon { width: 34px; padding: 0; }
.grid { display: grid; gap: 14px; }
.grid.stats { grid-template-columns: repeat(4, minmax(0,1fr)); }
.grid.two { grid-template-columns: repeat(2, minmax(0,1fr)); }
.grid.three { grid-template-columns: repeat(3, minmax(0,1fr)); }
.card { background: #171717; border: 1px solid #2b2b2b; border-radius: 12px; padding: 18px; }
.card + .card { margin-top: 14px; }
.card-title { margin: 0 0 4px; font-size: 14px; font-weight: 600; }
.card-subtitle { margin: 0; color: #818181; font-size: 12px; line-height: 1.5; }
.stat-label { color: #858585; font-size: 12px; }
.stat-value { font-size: 29px; font-weight: 650; margin-top: 8px; letter-spacing: -.03em; }
.stat-foot { color: #666; font-size: 11px; margin-top: 5px; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
.section-head h2 { margin: 0; font-size: 15px; font-weight: 600; }
.field { display: grid; gap: 7px; margin-bottom: 14px; }
.field > label, .field-label { color: #aaa; font-size: 12px; font-weight: 550; }
.field-hint { color: #666; font-size: 11px; margin-top: -2px; }
input, select, textarea {
  width: 100%; min-height: 38px; border: 1px solid #353535; background: #202020; color: #f1f1f1;
  border-radius: 8px; padding: 9px 10px; outline: none;
}
textarea { min-height: 112px; resize: vertical; line-height: 1.5; }
input:focus, select:focus, textarea:focus { border-color: #5c5c5c; box-shadow: 0 0 0 3px rgba(255,255,255,.04); }
input::placeholder, textarea::placeholder { color: #5e5e5e; }
input[type="checkbox"] { width: 15px; min-height: 15px; accent-color: #10a7f0; }
.checkline { display: inline-flex; align-items: center; gap: 8px; color: #bdbdbd; font-size: 13px; cursor: pointer; }
.form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.inline-fields { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
.inline-fields.three { grid-template-columns: repeat(3,minmax(0,1fr)); }
.inline-fields.four { grid-template-columns: repeat(4,minmax(0,1fr)); }
.table-wrap { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 11px 9px; border-bottom: 1px solid #2a2a2a; text-align: left; font-size: 12px; vertical-align: middle; }
.table th { color: #777; font-weight: 550; text-transform: uppercase; letter-spacing: .045em; font-size: 10px; }
.table tr:last-child td { border-bottom: 0; }
.table td strong { font-weight: 550; color: #eee; }
.row-actions { display: flex; gap: 6px; justify-content: flex-end; }
.empty { padding: 32px 12px; text-align: center; color: #686868; font-size: 13px; }
.badge { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #353535; background: #232323; color: #bdbdbd; padding: 4px 7px; border-radius: 999px; font-size: 11px; white-space: nowrap; }
.badge.good { color: #86efac; border-color: rgba(34,197,94,.28); background: rgba(34,197,94,.08); }
.badge.warn { color: #fcd34d; border-color: rgba(245,158,11,.28); background: rgba(245,158,11,.08); }
.badge.bad { color: #fda4af; border-color: rgba(244,63,94,.28); background: rgba(244,63,94,.08); }
.badge.info { color: #7dd3fc; border-color: rgba(14,165,233,.28); background: rgba(14,165,233,.08); }
.divider { height: 1px; background: #2a2a2a; margin: 18px 0; }
.target-list { max-height: 190px; overflow: auto; border: 1px solid #303030; background: #131313; border-radius: 9px; padding: 6px; }
.target-list label { display: flex; gap: 9px; align-items: center; padding: 8px; color: #b8b8b8; border-radius: 6px; font-size: 12px; }
.target-list label:hover { background: #202020; }
.day-checks { display: flex; gap: 6px; flex-wrap: wrap; }
.day-checks label { border: 1px solid #353535; border-radius: 7px; padding: 7px 9px; display: inline-flex; align-items: center; gap: 6px; color: #aaa; font-size: 12px; }
.list-editor { display: grid; gap: 8px; }
.list-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: center; }
.list-row.action-row { grid-template-columns: 180px minmax(160px,1fr) auto; }
.list-row.control-row { grid-template-columns: 150px 1fr 1fr 72px auto; }
.list-row.pause-row { grid-template-columns: 1.5fr 1fr 1fr auto; }
.schedule-toolbar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.schedule-toolbar select { width: auto; min-width: 120px; }
.schedule-scroll { overflow-x: auto; border: 1px solid #2c2c2c; border-radius: 10px; }
.week-grid { display: grid; grid-template-columns: 74px repeat(48,28px); min-width: 1418px; user-select: none; }
.wg-head, .wg-day, .slot { height: 32px; border-right: 1px solid #292929; border-bottom: 1px solid #292929; }
.wg-head { background: #151515; color: #666; font-size: 9px; text-align: center; padding-top: 10px; }
.wg-day { position: sticky; left: 0; z-index: 2; background: #181818; color: #aaa; padding: 9px 8px; font-size: 11px; font-weight: 600; }
.slot { background: #121212; cursor: crosshair; }
.slot:hover { background: #222; }
.slot.on { background: #0ea5e9; }
.exception-row { display: grid; grid-template-columns: 150px 130px 1fr auto; gap: 8px; align-items: center; margin-bottom: 8px; }
.rule-tree { display: grid; gap: 9px; }
.rule-group { border-left: 2px solid #414141; padding: 10px 0 4px 12px; }
.rule-line { display: grid; grid-template-columns: 1.3fr 130px 1fr auto; gap: 8px; margin: 8px 0; }
.rule-head { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.rule-head select { width: auto; min-width: 90px; }
.preview { white-space: pre-wrap; background: #101010; border: 1px solid #2a2a2a; color: #bdbdbd; border-radius: 9px; padding: 14px; min-height: 170px; font: 12px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; overflow: auto; }
.tabs { display: flex; gap: 5px; margin-bottom: 10px; }
.tab { border: 0; background: transparent; color: #777; padding: 6px 9px; border-radius: 6px; cursor: pointer; font-size: 12px; }
.tab.active { background: #262626; color: #eee; }
.run-card { display: grid; gap: 14px; }
.run-top { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
.run-meta { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 8px; }
.checklist { border-top: 1px solid #2a2a2a; padding-top: 12px; }
.check-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid #242424; }
.check-item:last-child { border-bottom: 0; }
.readiness { display: grid; gap: 10px; }
.ready-row { display: flex; justify-content: space-between; gap: 12px; align-items: center; color: #aaa; font-size: 12px; }
.callout { border: 1px solid #333; background: #141414; border-radius: 10px; padding: 14px; color: #9b9b9b; font-size: 12px; line-height: 1.6; }
.callout strong { color: #e6e6e6; }
.quick-list { display: grid; gap: 1px; }
.quick-step { display: grid; grid-template-columns: 28px 1fr; gap: 10px; padding: 11px 0; border-bottom: 1px solid #262626; }
.quick-step:last-child { border-bottom: 0; }
.step-number { width: 22px; height: 22px; border-radius: 50%; border: 1px solid #3b3b3b; color: #888; display: grid; place-items: center; font-size: 10px; }
.quick-step b { display: block; font-size: 12px; font-weight: 550; }
.quick-step span { color: #707070; font-size: 11px; }
.toast { position: fixed; right: 22px; bottom: 22px; z-index: 50; max-width: 360px; background: #efefef; color: #111; padding: 11px 14px; border-radius: 9px; font-size: 12px; box-shadow: 0 14px 40px rgba(0,0,0,.35); }
.toast.error { background: #3b171c; color: #fecdd3; border: 1px solid #6e2630; }
.toast.hidden { display: none; }
.muted { color: #777; }
.mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.right { text-align: right !important; }
@media (max-width: 980px) {
  .grid.stats { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .grid.two, .grid.three { grid-template-columns: 1fr; }
  .inline-fields.four { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .list-row.control-row { grid-template-columns: 130px 1fr; }
  .list-row.control-row > :nth-child(3), .list-row.control-row > :nth-child(4) { grid-column: span 1; }
}
@media (max-width: 720px) {
  .app { grid-template-columns: 1fr; }
  .sidebar { position: fixed; inset: 0 auto 0 0; width: 244px; z-index: 30; transform: translateX(-100%); transition: transform .18s ease; box-shadow: 18px 0 50px rgba(0,0,0,.45); }
  .sidebar.open { transform: translateX(0); }
  .mobile-menu { display: inline-block; }
  .topbar { padding: 0 16px; }
  .main { padding: 24px 16px 60px; }
  .page-head { flex-direction: column; }
  .inline-fields, .inline-fields.three, .inline-fields.four { grid-template-columns: 1fr; }
  .grid.stats { grid-template-columns: 1fr 1fr; }
  .list-row, .list-row.action-row, .list-row.pause-row, .exception-row, .rule-line { grid-template-columns: 1fr; }
}
`;
