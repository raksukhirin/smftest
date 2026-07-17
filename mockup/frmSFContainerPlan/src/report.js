/* ============================================================================
 * frmSFContainerPlan — Loading Instruction (พิมพ์ → PDF)
 * ----------------------------------------------------------------------------
 * แทนที่ PdfPages ของ Python demo — ใช้ window.print() ของเบราว์เซอร์
 * (Save as PDF) จึงไม่ต้องพึ่งไลบรารีเพิ่ม และได้ font ไทยถูกต้อง
 *
 * เพิ่มจากของเดิม: **ลำดับการโหลด** (loading sequence)
 *   ประตู FRONT (x=0) → ต้องโหลดของท้ายตู้ (x มาก) ก่อน ⇒ เรียง x จากมาก→น้อย
 *   ประตู BACK        → กลับกัน
 * ==========================================================================*/
(function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const n = (v) => Number(v).toLocaleString();

  // ลำดับการโหลด: ของที่อยู่ไกลประตูสุดต้องเข้าก่อน
  function loadingSequence(result) {
    const far = result.cfg.doorAt === 'FRONT'
      ? (p) => -(p.x + p.l)      // ประตูหน้า → x มาก = ไกล = โหลดก่อน
      : (p) => p.x;              // ประตูหลัง → x น้อย = ไกล = โหลดก่อน
    return result.placements.slice().sort((a, b) =>
      far(a) - far(b) || a.z0 - b.z0 || a.y - b.y);   // ชั้นล่างก่อนชั้นบน
  }

  function build(result, meta, svgs) {
    const k = result.kpi, c = result.container;
    const seq = loadingSequence(result);
    const rows = seq.map((p, i) => `<tr>
      <td class="num">${i + 1}</td>
      <td>${esc(p.col.sku)}${p.col.dgClass ? ' <b class="dg">☣' + esc(p.col.dgClass) + '</b>' : ''}</td>
      <td class="num">${p.col.count}</td>
      <td class="num">${p.x}</td><td class="num">${p.y}</td><td class="num">${p.z0}</td>
      <td class="num">${p.l}×${p.w}×${p.col.totalH}</td>
      <td class="num">${p.col.weight}</td>
      <td>${p.z0 > 0 ? 'ซ้อนบนหัว' : (p.col.nearDoor ? 'เขตประตู' : (p.col.noWall ? 'เว้นผนัง' : ''))}</td>
    </tr>`).join('');

    const warn = result.warnings.length
      ? `<ul class="wl">${result.warnings.map((w) => `<li class="${w.level}">${w.level === 'danger' ? '⛔' : '⚠'} ${esc(w.msg)}</li>`).join('')}</ul>`
      : `<p class="ok">✓ ไม่มีคำเตือน</p>`;

    const unpl = result.unplaced.length
      ? `<table class="t"><thead><tr><th>SKU</th><th class="num">วางไม่ลง</th></tr></thead><tbody>${
          result.unplaced.map((u) => `<tr><td>${esc(u.sku)}</td><td class="num">${u.qty}</td></tr>`).join('')}</tbody></table>`
      : `<p class="ok">✓ วางได้ครบทุกชิ้น</p>`;

    return `
    <div class="rpt">
      <div class="hd">
        <div>
          <h1>Loading Instruction</h1>
          <div class="sub">SMF · Container Loading Planner <span class="demo">[DEMO]</span></div>
        </div>
        <div class="meta">
          <div><b>${esc(meta.bookRef || '-')}</b> · ${esc(meta.jobNo || '-')}</div>
          <div>${esc(meta.customer || '-')}</div>
          <div>${esc(meta.pol || '-')} → ${esc(meta.pod || '-')}</div>
          <div class="mono">พิมพ์: ${esc(meta.printedAt)}</div>
        </div>
      </div>

      <h2>1 · ข้อมูลตู้และสรุปแผน</h2>
      <div class="grid2">
        <table class="t">
          <tr><th>ประเภทตู้</th><td>${esc(c.ctnType)}</td></tr>
          <tr><th>ขนาดภายใน (mm)</th><td class="mono">${c.L} × ${c.W} × ${c.H}</td></tr>
          <tr><th>Tare / Payload (kg)</th><td class="mono">${n(c.tare)} / ${n(c.maxPayload)}</td></tr>
          <tr><th>ประตู / เขตประตู</th><td>${esc(result.cfg.doorAt)} · ${result.cfg.doorZoneMm} mm</td></tr>
          <tr><th>ระยะห่างผนัง</th><td>${result.cfg.wallClearanceMm} mm</td></tr>
        </table>
        <table class="t">
          <tr><th>ชิ้นที่วางได้</th><td class="mono">${k.piecesPlaced} / ${k.piecesTotal}</td></tr>
          <tr><th>ใช้พื้น / ปริมาตร</th><td class="mono">${k.floorUtilPct}% / ${k.volumeUtilPct}%</td></tr>
          <tr><th>น้ำหนักสินค้า (kg)</th><td class="mono">${n(k.placedWeightKg)} (${k.weightUtilPct}% ของพิกัด)</td></tr>
          <tr><th>VGM (kg)</th><td class="mono"><b>${n(k.vgmKg)}</b></td></tr>
          <tr><th>สมดุล หน้า/หลัง</th><td class="mono">${k.balance.frontPct}% / ${(100 - k.balance.frontPct).toFixed(1)}%</td></tr>
          <tr><th>สมดุล ซ้าย/ขวา</th><td class="mono">${k.balance.leftPct}% / ${(100 - k.balance.leftPct).toFixed(1)}%</td></tr>
          <tr><th>จุดศูนย์ถ่วง (mm)</th><td class="mono">x=${k.cog.x} y=${k.cog.y} z=${k.cog.z}</td></tr>
        </table>
      </div>
      ${warn}

      <h2>2 · ผังจัดเรียง</h2>
      <div class="vlbl">มุมมองจากบน (Top-down)</div>
      <div class="svgbox">${svgs.plan}</div>
      <div class="vlbl">มุมมองด้านข้าง (Elevation)</div>
      <div class="svgbox">${svgs.elev}</div>

      <h2 class="pb">3 · ลำดับการโหลด (${seq.length} คอลัมน์)</h2>
      <p class="note">ประตูอยู่ <b>${esc(result.cfg.doorAt)}</b> → โหลดคอลัมน์ที่อยู่ไกลประตูที่สุดก่อน · ชั้นล่างก่อนชั้นบน</p>
      <table class="t seq">
        <thead><tr>
          <th class="num">ลำดับ</th><th>SKU</th><th class="num">ซ้อน</th>
          <th class="num">X</th><th class="num">Y</th><th class="num">Z</th>
          <th class="num">ก×ย×ส (mm)</th><th class="num">น้ำหนัก (kg)</th><th>หมายเหตุ</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <h2>4 · รายการที่วางไม่ลง</h2>
      ${unpl}

      <div class="ft">เอกสารสร้างจาก mockup — heuristic (skyline + stacking) ไม่รับประกันว่าเป็นแผนที่ดีที่สุด · ตรวจสอบก่อนใช้งานจริง</div>
    </div>`;
  }

  // เปิดหน้าพิมพ์ (ผู้ใช้เลือก Save as PDF)
  function print(result, meta, svgs) {
    const el = document.getElementById('printArea');
    el.innerHTML = build(result, meta, svgs);
    window.print();
  }

  const API = { build, print, loadingSequence };
  root.CTNReport = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
