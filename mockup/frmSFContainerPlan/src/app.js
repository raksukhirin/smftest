/* ============================================================================
 * frmSFContainerPlan — App (DOM wiring)
 * ปุ่ม/ตาราง → เรียก CTNPacker.plan() → เรนเดอร์ KPI / เตือน / สมดุล / 2D
 * ========================================================================== */
(function () {
  'use strict';
  const D = window.CTN_DATA, Pk = window.CTNPacker, V = window.CTNView2D;
  const $ = (id) => document.getElementById(id);
  const catBy = {};
  D.skuCatalog.forEach((s) => { catBy[s.sku] = s; });

  const state = { source: 'booking', items: [], last: null, meta: {} };
  const LS_KEY = 'smf_ctnplan_v1';

  // ---- populate selects --------------------------------------------------
  function initSelects() {
    $('bookingSel').innerHTML = D.bookings.map((b) =>
      `<option value="${b.bookRef}">${b.bookRef} · ${b.customer}</option>`).join('');
    $('ctnSel').innerHTML = D.containerTypes.map((c) =>
      `<option value="${c.ctnType}">${c.ctnType} (${c.isoCode})</option>`).join('');
  }

  function loadBooking(bookRef) {
    const b = D.bookings.find((x) => x.bookRef === bookRef) || D.bookings[0];
    const ctn = b.containers[0];
    $('ctnSel').value = ctn.ctnType;
    state.items = b.cargoItems.map((it) => ({ sku: it.sku, qty: it.qty }));
    state.meta = { jobNo: b.jobNo, bookRef: b.bookRef, customer: b.customer, pol: b.pol, pod: b.pod };
    const totQty = b.containers.reduce((a, c) => a + (c.pkgQty || 0), 0);
    $('bookingInfo').innerHTML =
      `<b>${b.jobNo}</b> · ${b.customer}<br>${b.pol} → ${b.pod} · ตู้ ${ctn.ctnType} · ` +
      `GW ${ctn.gwKg.toLocaleString()} kg · ${ctn.cbm} CBM · ${totQty} ${ctn.pkgUnit}` +
      `<br><span class="text-slate-400">(มิติรายชิ้นด้านล่างเป็นข้อมูลที่โมดูลนี้เพิ่ม — SFCTNLISTBOOK เก็บแค่สรุปตู้)</span>`;
    renderItems();
    updateDims();
  }

  function updateDims() {
    const ct = D.containerTypes.find((c) => c.ctnType === $('ctnSel').value);
    $('ctnDims').textContent = `ภายใน ${ct.innerLmm} × ${ct.innerWmm} × ${ct.innerHmm} mm · Tare ${ct.tareKg} · Payload ${ct.maxPayloadKg.toLocaleString()} kg`;
  }

  // ---- items table -------------------------------------------------------
  function renderItems() {
    const tb = $('itemsTbl').querySelector('tbody');
    tb.innerHTML = state.items.map((it, i) => {
      const s = catBy[it.sku] || D.skuCatalog[0];
      const opts = D.skuCatalog.map((c) =>
        `<option value="${c.sku}"${c.sku === it.sku ? ' selected' : ''}>${c.sku}${c.dgClass ? ' ☣' + c.dgClass : ''}</option>`).join('');
      return `<tr>
        <td><select data-i="${i}" class="it-sku">${opts}</select></td>
        <td><input data-i="${i}" class="it-qty text-right" type="number" min="0" value="${it.qty}"></td>
        <td class="text-right text-slate-400 font-mono">${s.Lmm}×${s.Wmm}×${s.Hmm}</td>
        <td><span class="rm-row" data-i="${i}">×</span></td></tr>`;
    }).join('');
    tb.querySelectorAll('.it-sku').forEach((el) => el.onchange = (e) => { state.items[+e.target.dataset.i].sku = e.target.value; renderItems(); });
    tb.querySelectorAll('.it-qty').forEach((el) => el.onchange = (e) => { state.items[+e.target.dataset.i].qty = Math.max(0, +e.target.value || 0); });
    tb.querySelectorAll('.rm-row').forEach((el) => el.onclick = (e) => { state.items.splice(+e.target.dataset.i, 1); renderItems(); });
  }

  // ---- gather + run ------------------------------------------------------
  function gather() {
    const ct = D.containerTypes.find((c) => c.ctnType === $('ctnSel').value);
    return {
      container: ct,
      cargoItems: state.items.filter((it) => it.qty > 0),
      skuCatalog: D.skuCatalog,
      settings: {
        allowRotate: $('setRotate').checked,
        topFill: $('setTopFill').checked,
        wallClearanceMm: +$('setWall').value || 0,
        doorZoneMm: +$('setDoor').value || 0,
        doorAt: $('setDoorAt').value,
      },
    };
  }

  function run() {
    const res = Pk.planBest(gather());        // ลองทุกกลยุทธ์ → เลือกดีที่สุด
    state.last = res;
    renderKPI(res); renderWarn(res); renderBalance(res); renderUnplaced(res);
    renderViews(res); renderStrategy(res); syncSlice(res); render3D(true);
  }

  // ---- renderers ---------------------------------------------------------
  function kpiCard(v, l, cls) { return `<div class="kpi ${cls || ''}"><div class="v">${v}</div><div class="l">${l}</div></div>`; }
  function renderKPI(r) {
    const k = r.kpi;
    // เทียบกับยอด "ที่ขอจริง" เสมอ — ถ้าโดนตัด cap ต้องเห็นชัดว่าไม่ครบ
    const denom = k.piecesRequested != null ? k.piecesRequested : k.piecesTotal;
    const placeCls = k.piecesDropped > 0 ? 'bad' : (k.piecesUnplaced === 0 ? 'good' : 'warn');
    const wtCls = k.weightUtilPct > 100 ? 'bad' : (k.weightUtilPct > 90 ? 'warn' : 'good');
    $('kpiRow').innerHTML =
      kpiCard(`${k.piecesPlaced}<span class="text-slate-400 text-sm">/${denom}</span>`, 'ชิ้นที่วางได้', placeCls) +
      kpiCard(k.floorUtilPct + '%', 'ใช้พื้น') +
      kpiCard(k.volumeUtilPct + '%', 'ใช้ปริมาตร') +
      kpiCard(k.weightUtilPct + '%', 'ใช้พิกัดน้ำหนัก', wtCls) +
      kpiCard(k.vgmKg.toLocaleString(), 'VGM (kg)') +
      kpiCard(k.columns, 'คอลัมน์');
  }

  function renderWarn(r) {
    if (!r.warnings.length) { $('warnBox').innerHTML = `<div class="wn wn-ok">✓ แผนผ่านเกณฑ์เบื้องต้น — ไม่มีคำเตือน</div>`; return; }
    $('warnBox').innerHTML = r.warnings.map((w) =>
      `<div class="wn wn-${w.level}">${w.level === 'danger' ? '⛔' : '⚠'} ${w.msg}</div>`).join('');
  }

  function bar(pctA, labelA, labelB, valA, valB) {
    const skew = pctA < 35 || pctA > 65 ? ' skew' : '';
    return `<div class="balrow">
      <div class="cap"><span>${labelA} ${valA.toLocaleString()}kg</span><span>${valB.toLocaleString()}kg ${labelB}</span></div>
      <div class="gauge${skew}"><div class="a" style="width:${pctA}%">${pctA}%</div><div class="b" style="width:${100 - pctA}%">${(100 - pctA).toFixed(1)}%</div></div>
    </div>`;
  }
  function renderBalance(r) {
    const b = r.kpi.balance;
    $('balanceBox').innerHTML =
      bar(b.frontPct, 'หน้า', 'หลัง', b.front, b.back) +
      bar(b.leftPct, 'ซ้าย', 'ขวา', b.left, b.right) +
      `<div class="text-slate-400 pt-1">จุดศูนย์ถ่วง (CoG): x=${r.kpi.cog.x} · y=${r.kpi.cog.y} · z=${r.kpi.cog.z} mm</div>
       <div class="text-slate-400">เกณฑ์สมดุล 35–65% · สีส้ม = เอียงเกินเกณฑ์</div>`;
  }

  function renderUnplaced(r) {
    if (!r.unplaced.length) { $('unplacedBox').innerHTML = `<div class="text-emerald-600">✓ วางได้ครบทุกชิ้น</div>`; return; }
    $('unplacedBox').innerHTML = r.unplaced.map((u) =>
      `<div class="flex justify-between border-b border-slate-100 py-0.5"><span>${u.sku}</span><span class="font-mono text-amber-600">${u.qty} ชิ้น</span></div>`).join('') +
      `<div class="text-slate-400 mt-1.5">→ ต้องใช้ตู้เพิ่ม หรือปรับ maxStack / เลือกตู้ใหญ่ขึ้น</div>`;
  }

  function renderViews(r) {
    $('planWrap').innerHTML = V.drawPlan(r, { width: 900 });
    $('elevWrap').innerHTML = V.drawElevation(r, { width: 900 });
    const used = new Set(r.boxes.map((b) => b.sku));
    $('legend').innerHTML = V.legendHTML(D.skuCatalog, used);
    bindTooltips();
  }

  // ---- strategy (โปร่งใส: เลือกอะไร เพราะอะไร) --------------------------
  function renderStrategy(r) {
    if (!r.strategy) { $('strategyBox').innerHTML = ''; return; }
    const modeTh = r.strategy.mode;
    const rows = r.strategy.tried.map((t) => {
      const on = t.sortKey === r.strategy.chosen && t.mode === modeTh;
      return `<tr class="${on ? 'font-semibold text-emerald-700' : 'text-slate-500'}">
        <td>${on ? '✓ ' : ''}${t.sortKey}</td>
        <td class="text-[9px]">${t.mode}</td>
        <td class="text-right font-mono">${t.placed}</td>
        <td class="text-right font-mono">${t.frontPct}%${t.balanced ? ' <span class="text-emerald-600">✓</span>' : ''}</td></tr>`;
    }).join('');
    $('strategyBox').innerHTML =
      `<table class="w-full text-[10px]"><thead><tr class="text-slate-400">
        <th class="text-left">กลยุทธ์</th><th class="text-left">ทิศ</th>
        <th class="text-right">วางได้</th><th class="text-right">หน้า</th></tr></thead>
       <tbody>${rows}</tbody></table>
       <div class="text-slate-400 mt-1.5 leading-relaxed">
         ลองทุกกลยุทธ์ × ทิศทางเติม (ทิศเดียว/สองทิศ) แล้วเลือกอัตโนมัติ<br>
         เกณฑ์: วางได้มากสุด — แต่ยอมแลกได้ถึง 5 ชิ้น ถ้าทำให้สมดุลผ่าน 35–65% (<span class="text-emerald-600">✓</span>)
       </div>`;
  }

  // ---- 3D ---------------------------------------------------------------
  function syncSlice(r) {
    const s = $('sliceZ');
    s.max = r.container.H; s.value = r.container.H;
    $('sliceLbl').textContent = r.container.H;
  }
  function render3D(reset) {
    if (!window.CTNView3D || !state.last) return;
    if (!render3D._init) { window.CTNView3D.init($('view3d')); window.CTNView3D.setPickHandler(showPick); render3D._init = true; }
    window.CTNView3D.render(state.last, { maxZ: +$('sliceZ').value, resetView: reset !== false });
  }
  function showPick(b) {
    const el = $('pickInfo');
    if (!b) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = `<b>${b.sku}</b>${b.dgClass ? ` <span class="text-red-600 font-bold">☣${b.dgClass}</span>` : ''}<br>
      <span class="text-slate-400">ตำแหน่ง</span> <span class="font-mono">x=${b.x} y=${b.y} z=${b.z}</span><br>
      <span class="text-slate-400">ขนาด</span> <span class="font-mono">${b.l}×${b.w}×${b.h} mm</span><br>
      <span class="text-slate-400">น้ำหนัก</span> <span class="font-mono">${b.weight} kg</span> ·
      <span class="text-slate-400">ชั้นที่</span> <span class="font-mono">${b.stackIdx + 1}</span>`;
  }

  // ---- print / save -----------------------------------------------------
  function doPrint() {
    if (!state.last) return;
    const r = state.last;
    window.CTNReport.print(r, Object.assign({}, state.meta, {
      printedAt: new Date().toLocaleString('th-TH'),
    }), { plan: V.drawPlan(r, { width: 900 }), elev: V.drawElevation(r, { width: 900 }) });
  }

  function doSave() {
    if (!state.last) return;
    const r = state.last;
    // mock การเขียนกลับระบบ — เก็บ "แผน" ระดับคอลัมน์ (ดู mapping.md → SFCTNCARGODTL)
    const rec = {
      savedAtUtc: new Date().toISOString(),
      bookRef: state.meta.bookRef || null, jobNo: state.meta.jobNo || null,
      ctnType: r.container.ctnType, strategy: r.strategy ? r.strategy.chosen : null,
      kpi: r.kpi,
      placements: r.placements.map((p) => ({
        sku: p.col.sku, qty: p.col.count, x: p.x, y: p.y, z: p.z0,
        l: p.l, w: p.w, h: p.col.totalH, weightKg: p.col.weight, dgClass: p.col.dgClass || '',
      })),
      unplaced: r.unplaced,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(rec));
    showSaved();
  }
  function showSaved() {
    try {
      const rec = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      $('saveInfo').innerHTML = rec
        ? `✓ บันทึกแล้ว: <b>${rec.bookRef || '-'}</b> · ${rec.placements.length} คอลัมน์ · ${new Date(rec.savedAtUtc).toLocaleString('th-TH')}`
        : '';
    } catch (e) { $('saveInfo').textContent = ''; }
  }

  // ---- tooltip (จาก <title> → กล่องลอย) ---------------------------------
  function bindTooltips() {
    const tip = $('tooltip');
    document.querySelectorAll('.plan-svg .box, .elev-svg rect').forEach((el) => {
      const t = el.querySelector('title');
      const txt = t ? t.textContent : null;
      if (!txt) return;
      el.addEventListener('mousemove', (e) => { tip.textContent = txt; tip.classList.remove('hidden'); tip.style.left = (e.clientX + 12) + 'px'; tip.style.top = (e.clientY + 12) + 'px'; });
      el.addEventListener('mouseleave', () => tip.classList.add('hidden'));
    });
  }

  // ---- events ------------------------------------------------------------
  function bind() {
    document.querySelectorAll('input[name=src]').forEach((el) => el.onchange = (e) => {
      state.source = e.target.value;
      $('bookingBox').style.display = state.source === 'booking' ? '' : 'none';
      if (state.source === 'manual') {
        // ต้องล้าง meta — ไม่งั้นแผนที่กรอกเองจะถูกอ้างเป็น Booking ล่าสุด
        // (Loading Instruction จะพิมพ์เลข Booking ผิด)
        state.meta = {};
        if (!state.items.length) { state.items = [{ sku: D.skuCatalog[0].sku, qty: 10 }]; renderItems(); }
      } else {
        loadBooking($('bookingSel').value);   // สลับกลับ → ดึงข้อมูล Booking คืน
      }
    });
    $('bookingSel').onchange = (e) => loadBooking(e.target.value);
    $('ctnSel').onchange = updateDims;
    $('addRow').onclick = () => { state.items.push({ sku: D.skuCatalog[0].sku, qty: 1 }); renderItems(); };
    $('runBtn').onclick = run;
    $('printBtn').onclick = doPrint;
    $('saveBtn').onclick = doSave;
    $('reset3d').onclick = () => window.CTNView3D && window.CTNView3D.resetView();
    $('sliceZ').oninput = (e) => {
      $('sliceLbl').textContent = e.target.value;
      if (window.CTNView3D) window.CTNView3D.setMaxZ(+e.target.value);
    };
    // view3d.js เป็น ES module (โหลดทีหลัง) — พอพร้อมค่อยเรนเดอร์ 3D
    window.addEventListener('ctn3d-ready', () => render3D(true));
  }

  // ---- boot --------------------------------------------------------------
  initSelects();
  bind();
  loadBooking(D.bookings[0].bookRef);
  run();
  showSaved();
})();
