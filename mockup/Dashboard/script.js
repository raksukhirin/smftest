// SMF Dashboard mockup — vanilla JS, inline SVG charts. Data comes from DATA (data.js).
const $ = s => document.querySelector(s);
const st = { mod: 'ops', mode: 'All' };
const COL = { ops: '#0369a1', acc: '#047857', mkt: '#7c3aed' };

/* ---------- helpers ---------- */
function sparkline(v, c) {
  const w = 70, h = 28, mx = Math.max(...v), mn = Math.min(...v);
  const pts = v.map((y, i) => `${(i / (v.length - 1) * w).toFixed(1)},${(h - 2 - (y - mn) / (mx - mn || 1) * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg width="${w}" height="${h}"><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="1.8"/></svg>`;
}
const sparkFor = i => [3, 5, 4, 7, 6, 8, 7, 9].map((v, k) => v + ((i * 3 + k * 7) % 4));
const kpi = ([label, val, delta, dir], i, color) => `
  <div class="card"><div class="kpi-label">${label}</div>
  <div class="flex items-end justify-between"><div><div class="kpi-value tabular">${val}</div>
  <span class="delta delta-${dir}">${dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'} ${delta}</span></div>
  ${sparkline(sparkFor(i), color)}</div></div>`;
const kpiRow = (rows, color) => `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">${rows.map((r, i) => kpi(r, i, color)).join('')}</div>`;

const gridLines = (w, h, p) => [0, .5, 1].map(f => `<line x1="${p}" x2="${w - p}" y1="${h - 18 - f * (h - 30)}" y2="${h - 18 - f * (h - 30)}" stroke="#e2e8f0"/>`).join('');
const legend = s => `<div class="legend">${s.map(x => `<span><i style="background:${x.color}"></i>${x.name}</span>`).join('')}</div>`;

function bars(vals, labels, color, h = 150) {
  const w = 520, p = 22, mx = Math.max(...vals) * 1.1, bw = (w - p * 2) / vals.length;
  return `<svg viewBox="0 0 ${w} ${h}" class="w-full">${gridLines(w, h, p)}
   ${vals.map((v, i) => { const bh = v / mx * (h - 30);
     return `<rect x="${p + i * bw + 4}" y="${h - 18 - bh}" width="${bw - 8}" height="${bh}" rx="3" fill="${color}"><title>${labels[i]}: ${v}</title></rect>
     <text x="${p + i * bw + bw / 2}" y="${h - 5}" text-anchor="middle">${labels[i]}</text>`; }).join('')}</svg>`;
}
function groupBars(series, labels, h = 160) {
  const w = 520, p = 22, mx = Math.max(...series.flatMap(s => s.vals)) * 1.1, gw = (w - p * 2) / labels.length, bw = (gw - 8) / series.length;
  return `<svg viewBox="0 0 ${w} ${h}" class="w-full">${gridLines(w, h, p)}
   ${labels.map((l, i) => series.map((s, k) => { const bh = s.vals[i] / mx * (h - 30);
     return `<rect x="${p + i * gw + 4 + k * bw}" y="${h - 18 - bh}" width="${bw - 1}" height="${bh}" rx="2" fill="${s.color}"><title>${s.name} ${l}: ${s.vals[i]}</title></rect>`; }).join('')
     + `<text x="${p + i * gw + gw / 2}" y="${h - 5}" text-anchor="middle">${l}</text>`).join('')}</svg>${legend(series)}`;
}
function line(series, labels, h = 160) {
  const w = 520, p = 22, mx = Math.max(...series.flatMap(s => s.vals)) * 1.1;
  const X = i => p + i / (labels.length - 1) * (w - p * 2), Y = v => h - 18 - v / mx * (h - 30);
  return `<svg viewBox="0 0 ${w} ${h}" class="w-full">${gridLines(w, h, p)}
   ${series.map(s => `<polyline fill="none" stroke="${s.color}" stroke-width="2.2" points="${s.vals.map((v, i) => X(i) + ',' + Y(v)).join(' ')}"/>`
     + s.vals.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="2.6" fill="${s.color}"><title>${s.name} ${labels[i]}: ${v}</title></circle>`).join('')).join('')}
   ${labels.map((l, i) => i % 2 === 0 ? `<text x="${X(i)}" y="${h - 5}" text-anchor="middle">${l}</text>` : '').join('')}</svg>${legend(series)}`;
}
function donut(rows) {
  const tot = rows.reduce((a, r) => a + r[1], 0), R = 46, C = 2 * Math.PI * R; let off = 0;
  const arcs = rows.map(r => { const len = r[1] / tot * C;
    const s = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${r[2]}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"><title>${r[0]}: ${r[1]}</title></circle>`;
    off += len; return s; }).join('');
  return `<div class="flex items-center gap-4"><svg width="120" height="120">${arcs}<text x="60" y="58" text-anchor="middle" style="font-size:16px;font-weight:700;fill:#1e293b">${tot.toLocaleString()}</text><text x="60" y="72" text-anchor="middle">total</text></svg>
   <div class="text-xs space-y-1 flex-1">${rows.map(r => `<div class="flex justify-between gap-3"><span><i class="inline-block w-2 h-2 rounded-sm mr-1.5" style="background:${r[2]}"></i>${r[0]}</span><b class="tabular">${r[1].toLocaleString()}</b></div>`).join('')}</div></div>`;
}
function hbars(rows, color) {
  const mx = Math.max(...rows.map(r => r[1]));
  return rows.map(r => `<div class="flex items-center gap-2 text-xs mb-1.5"><span class="w-24 truncate">${r[0]}</span>
   <div class="flex-1 bg-slate-100 rounded h-3"><div class="h-3 rounded" style="width:${r[1] / mx * 100}%;background:${r[2] || color}"></div></div><b class="tabular w-12 text-right">${r[1].toLocaleString()}</b></div>`).join('');
}
function pill(txt) {
  const t = String(txt).toLowerCase();
  const c = /delay|late|missing|hold|inspection|>90|awaiting|pending/.test(t) ? 'b-bad'
    : /on time|arrived|flown|cleared/.test(t) ? 'b-ok'
    : /transit|lodged|dispatched|booked|planned|open/.test(t) ? 'b-info' : 'b-mute';
  return `<span class="badge ${c}">${txt}</span>`;
}
function table(cols, rows, pillCol = -1, numCols = []) {
  return `<table class="t"><thead><tr>${cols.map((c, i) => `<th class="${numCols.includes(i) ? 'num' : ''}">${c}</th>`).join('')}</tr></thead><tbody>
   ${rows.map(r => `<tr>${r.map((c, i) => `<td class="${numCols.includes(i) ? 'num' : ''}">${i === pillCol ? pill(c) : c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
const card = (title, body, hint = '', span = '') => `<div class="card ${span}"><div class="card-title">${title}<small>${hint}</small></div>${body}</div>`;
const grid = (cols, ...c) => `<div class="grid gap-3 ${cols}">${c.join('')}</div>`;

/* ---------- modules ---------- */
function viewOps() {
  const o = DATA.ops, m = st.mode, c = COL.ops, t = o.table[m];
  const pipe = o.pipeline[m]
    ? card('Workflow status', `<div class="pipe">${o.pipeline[m].map(p => `<div style="--c:${p[2]}"><b class="tabular">${p[1]}</b><span>${p[0]}</span></div>`).join('')}</div>`, 'drill-down: todo')
    : '';
  return kpiRow(o.kpis[m], c) + pipe +
    grid('lg:grid-cols-3',
      card(o.volumeTitle[m], bars(o.volume[m], W12, c), 'last 12 weeks', 'lg:col-span-2'),
      card(o.splitTitle[m], m === 'All' || m === 'Sea' ? donut(o.split[m]) : hbars(o.split[m], c))) +
    card(o.tableTitle[m], table(t.cols, t.rows, t.pill), 'top 4');
}
function viewAcc() {
  const a = DATA.acc;
  const age = (title, vals, col) => card(title, bars(vals, a.aging, col, 130), 'THB million, days overdue');
  return kpiRow(a.kpis, COL.acc) +
    `<div class="section-h">Cash Book</div>` +
    grid('lg:grid-cols-3',
      card('Cash in vs out', line([{ name: 'In', vals: a.cash.in, color: '#059669' }, { name: 'Out', vals: a.cash.out, color: '#dc2626' }], W12), 'THB million / week', 'lg:col-span-2'),
      card('Bank balances', table(['Account', 'Balance'], a.banks, -1, [1]))) +
    `<div class="section-h">AR / AP</div>` +
    grid('lg:grid-cols-2', age('AR aging', a.ar, '#059669'), age('AP aging', a.ap, '#d97706')) +
    grid('lg:grid-cols-2',
      card('Top receivables', table(['Customer', 'Amount', 'Aging'], a.topAR, 2, [1])),
      card('Payables due this week', table(['Vendor', 'Amount', 'Due'], a.dueAP, -1, [1]))) +
    `<div class="section-h">General Ledger</div>` +
    grid('lg:grid-cols-3',
      card('Revenue vs cost', groupBars([{ name: 'Revenue', vals: a.pl.rev, color: '#059669' }, { name: 'Cost', vals: a.pl.cost, color: '#94a3b8' }], M6), 'THB million / month', 'lg:col-span-2'),
      card('Closing checklist', a.gl.map(g => `<div class="flex justify-between items-center py-1.5 border-b border-slate-100 text-xs"><span>${g[0]}</span><span class="badge ${g[2]}">${g[1]}</span></div>`).join('')));
}
function viewMkt() {
  const k = DATA.mkt, sent = k.funnel[1][1], top = k.funnel[0][1];
  const funnel = k.funnel.map(f => `<div class="flex items-center gap-2 text-xs mb-1.5"><span class="w-20">${f[0]}</span><div class="flex-1 bg-slate-100 rounded h-5"><div class="h-5 rounded text-white text-[11px] px-2 flex items-center" style="width:${f[1] / top * 100}%;background:${f[2]}">${f[1]}</div></div><span class="w-10 text-right text-slate-400">${Math.round(f[1] / sent * 100)}%</span></div>`).join('');
  return kpiRow(k.kpis, COL.mkt) +
    `<div class="section-h">Quotation</div>` +
    grid('lg:grid-cols-3',
      card('Quotation funnel', funnel, '% of sent'),
      card('Quotations vs Bookings', groupBars([{ name: 'Quotations', vals: k.qMonth, color: '#7c3aed' }, { name: 'Bookings', vals: k.bMonth, color: '#10b981' }], M6), 'per month', 'lg:col-span-2')) +
    grid('lg:grid-cols-2',
      card('Quotes expiring soon', table(['No.', 'Customer', 'Expires', 'Value'], k.expiring, -1, [3])),
      card('Top customers', table(['Customer', 'Bookings', 'Revenue'], k.topCust, -1, [1, 2]))) +
    `<div class="section-h">Booking</div>` +
    grid('lg:grid-cols-3',
      card('Bookings by mode', donut(k.bookMode)),
      card('Bookings waiting', table(['No.', 'Customer', 'Lane', 'Waiting for'], k.pendingBk, 3), '', 'lg:col-span-2'));
}

/* ---------- shell ---------- */
function render() {
  document.querySelectorAll('.mod-tab').forEach(b => b.classList.toggle('active', b.dataset.mod === st.mod));
  $('#subBar').innerHTML = st.mod === 'ops'
    ? DATA.ops.modes.map(m => `<button class="sub-tab ${m === st.mode ? 'active' : ''}" data-mode="${m}">${m === 'All' ? 'Overview' : m}</button>`).join('')
    : '';
  const apr = st.mod === 'apr';
  document.body.classList.toggle('apr-mode', apr);
  $('#aprHost').hidden = !apr;
  $('#view').hidden = apr;
  if (apr) {
    // created on first visit, then only hidden: the Approval page keeps its own state (open request, filters) between tab switches
    if (!$('#aprFrame')) $('#aprHost').innerHTML = '<iframe id="aprFrame" title="Approval" src="../ApprovalFlow/index.html?embed=1"></iframe>';
  } else {
    $('#view').innerHTML = { ops: viewOps, acc: viewAcc, mkt: viewMkt }[st.mod]();
  }
  try { localStorage.setItem('smfDash', JSON.stringify(st)); } catch (e) {}
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-mod],[data-mode]');
  if (!t) return;
  if (t.dataset.mod) st.mod = t.dataset.mod; else st.mode = t.dataset.mode;
  render();
});
/* ---------- live data: only inside SMFDash.Web (WebView2 host injects window.SMF; a plain browser keeps the demo data) ---------- */
const FOOTER_OFFLINE = $('#compName').textContent;
async function loadCompany() {   // header = SMCOMPANY.COMPID, footer = SMCOMPANY.NAME; not connected -> OFFLINE / the mockup footer
  let id = 'OFFLINE', name = FOOTER_OFFLINE;
  try { if (window.SMF) { const c = await SMF.call('company'); id = c.compId || id; name = c.name || name; } } catch (e) {}
  $('#dataTag').textContent = '[' + id + ']'; $('#compName').textContent = name;
  document.title = id === 'OFFLINE' ? 'SMF Dashboard — Mockup' : id + ' — Dashboard';
}
async function loadLive() {
  loadCompany();
  if (!window.SMF) return;
  const tag = $('#dataTag');
  try {
    const a = await SMF.call('acc'), A = DATA.acc, L = a.live;
    if (L.bank) { A.banks = a.banks; A.kpis[0] = a.kpis[0]; }
    if (L.ar) { A.ar = a.ar; A.kpis[1] = a.kpis[1]; A.topAR = a.topAR; }
    if (L.ap) { A.ap = a.ap; A.kpis[2] = a.kpis[2]; A.dueAP = a.dueAP; }
    // the [COMPID] shows the state by colour (green = connected, amber = partly loaded); the tooltip is the server / database
    tag.title = a.target;
    tag.className = a.error ? 'text-amber-600' : 'text-emerald-600';
  } catch (e) { tag.title = ''; tag.className = 'text-slate-400'; }
  render();
}
if (window.SMF) {
  $('#btnSettings').hidden = false;
  $('#btnSettings').onclick = async () => { const r = await SMF.call('settings'); if (r.saved) loadLive(); };
}
$('#btnRefresh').onclick = () => { render(); loadLive(); };
$('#period').onchange = render;
$('#branch').onchange = render;
try { Object.assign(st, JSON.parse(localStorage.getItem('smfDash') || '{}')); } catch (e) {}
render();
loadLive();
