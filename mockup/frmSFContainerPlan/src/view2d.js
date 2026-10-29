/* ============================================================================
 * frmSFContainerPlan — 2D Views (SVG)
 * ----------------------------------------------------------------------------
 * drawPlan()      — มุมมองจากบน (top-down, แกน L×W) : footprint คอลัมน์ + โซนประตู
 *                   + wall clearance + จุดศูนย์ถ่วง (CoG) + คอลัมน์ที่ซ้อนบนหัว
 * drawElevation() — มุมมองด้านข้าง (แกน L×H) : เห็นความสูงกอง/การซ้อน
 * ทั้งคู่คืน SVG string; แต่ละกล่องมี <title> เป็น tooltip เนทีฟ
 * ========================================================================== */
(function (root) {
  'use strict';

  const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  // ปรับสีให้จางลง (สำหรับพื้น) — mix กับขาว
  function tint(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const mix = (c) => Math.round(c + (255 - c) * amt);
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
  }

  // ---- Top-down floor plan ----------------------------------------------
  function drawPlan(result, opts) {
    opts = opts || {};
    const { L, W } = result.container;
    const cfg = result.cfg;
    const padL = 46, padR = 16, padT = 30, padB = 26;
    const maxW = opts.width || 940;
    const scale = (maxW - padL - padR) / L;
    const svgW = maxW;
    const svgH = W * scale + padT + padB;
    const X = (x) => padL + x * scale;
    const Y = (y) => padT + y * scale;

    const parts = [];
    parts.push(`<svg viewBox="0 0 ${svgW} ${svgH}" class="plan-svg" xmlns="http://www.w3.org/2000/svg" font-family="Inter,sans-serif">`);

    // container outline
    parts.push(`<rect x="${X(0)}" y="${Y(0)}" width="${L * scale}" height="${W * scale}" fill="#f8fafc" stroke="#334155" stroke-width="1.5"/>`);

    // door zone
    if (cfg.doorZoneMm > 0) {
      const dz = cfg.doorZoneMm * scale;
      const dx = cfg.doorAt === 'FRONT' ? X(0) : X(L) - dz;
      parts.push(`<rect x="${dx}" y="${Y(0)}" width="${dz}" height="${W * scale}" fill="#3b82f6" opacity="0.07"/>`);
      parts.push(`<text x="${dx + dz / 2}" y="${Y(0) + 12}" fill="#2563eb" font-size="9" text-anchor="middle">DOOR ${cfg.doorAt}</text>`);
    }
    // wall clearance guide
    if (cfg.wallClearanceMm > 0) {
      const c = cfg.wallClearanceMm * scale;
      parts.push(`<rect x="${X(0) + c}" y="${Y(0) + c}" width="${L * scale - 2 * c}" height="${W * scale - 2 * c}" fill="none" stroke="#ef4444" stroke-width="1" stroke-dasharray="4 3" opacity="0.5"/>`);
    }

    // floor columns (z0===0) + top-fill overlays
    const floor = result.placements.filter((p) => p.z0 === 0);
    const tops = result.placements.filter((p) => p.z0 > 0);
    for (const p of floor) {
      const c = p.col;
      const rx = X(p.x), ry = Y(p.y), rw = p.l * scale, rh = p.w * scale;
      const title = `${c.sku}${c.dgClass ? ' (DG ' + c.dgClass + ')' : ''}\n${p.l}×${p.w}×${c.totalH}mm · ×${c.count} สูง · ${c.weight}kg`;
      parts.push(`<g class="box"><title>${esc(title)}</title>`);
      parts.push(`<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${tint(c.color, 0.35)}" stroke="${c.color}" stroke-width="0.8"/>`);
      if (rw > 26 && rh > 12) {
        parts.push(`<text x="${rx + rw / 2}" y="${ry + rh / 2 + 3}" fill="#0f172a" font-size="8" text-anchor="middle">×${c.count}</text>`);
      }
      if (c.dgClass) parts.push(`<text x="${rx + 3}" y="${ry + 9}" fill="#b91c1c" font-size="8" font-weight="700">☣${c.dgClass}</text>`);
      parts.push('</g>');
    }
    // top-fill: dashed badge on the base footprint
    for (const p of tops) {
      const rx = X(p.x), ry = Y(p.y), rw = p.l * scale, rh = p.w * scale;
      parts.push(`<g class="box"><title>${esc(p.col.sku + ' · ซ้อนบนหัว (+' + p.col.count + ')')}</title>`);
      parts.push(`<rect x="${rx + 1.5}" y="${ry + 1.5}" width="${Math.max(0, rw - 3)}" height="${Math.max(0, rh - 3)}" fill="none" stroke="${p.col.color}" stroke-width="1" stroke-dasharray="2 2"/>`);
      parts.push(`<text x="${rx + rw - 3}" y="${ry + rh - 3}" fill="${p.col.color}" font-size="7" text-anchor="end">+${p.col.count}</text></g>`);
    }

    // CoG marker
    const cog = result.kpi.cog;
    if (result.kpi.piecesPlaced > 0) {
      const cx = X(cog.x), cy = Y(cog.y);
      parts.push(`<g><title>จุดศูนย์ถ่วง (CoG) x=${cog.x} y=${cog.y}mm</title>`);
      parts.push(`<line x1="${cx - 7}" y1="${cy}" x2="${cx + 7}" y2="${cy}" stroke="#0f172a" stroke-width="1.2"/>`);
      parts.push(`<line x1="${cx}" y1="${cy - 7}" x2="${cx}" y2="${cy + 7}" stroke="#0f172a" stroke-width="1.2"/>`);
      parts.push(`<circle cx="${cx}" cy="${cy}" r="4" fill="none" stroke="#0f172a" stroke-width="1.2"/></g>`);
    }
    // center line (L/2)
    parts.push(`<line x1="${X(L / 2)}" y1="${Y(0)}" x2="${X(L / 2)}" y2="${Y(W)}" stroke="#94a3b8" stroke-width="0.6" stroke-dasharray="3 3"/>`);

    // axis labels
    parts.push(`<text x="${X(L / 2)}" y="${svgH - 8}" fill="#64748b" font-size="9" text-anchor="middle">← ยาว ${L} mm →</text>`);
    parts.push(`<text x="12" y="${Y(W / 2)}" fill="#64748b" font-size="9" text-anchor="middle" transform="rotate(-90 12 ${Y(W / 2)})">กว้าง ${W} mm</text>`);
    parts.push('</svg>');
    return parts.join('');
  }

  // ---- Side elevation (L×H) — เห็นความสูงกอง/การซ้อน ---------------------
  function drawElevation(result, opts) {
    opts = opts || {};
    const { L, H } = result.container;
    const padL = 46, padR = 16, padT = 16, padB = 22;
    const maxW = opts.width || 940;
    const scale = (maxW - padL - padR) / L;
    const svgW = maxW, svgH = H * scale + padT + padB;
    const X = (x) => padL + x * scale;
    const Y = (z) => padT + (H - z) * scale;   // z ขึ้น = y ลง

    const parts = [`<svg viewBox="0 0 ${svgW} ${svgH}" class="elev-svg" xmlns="http://www.w3.org/2000/svg" font-family="Inter,sans-serif">`];
    parts.push(`<rect x="${X(0)}" y="${Y(H)}" width="${L * scale}" height="${H * scale}" fill="#f8fafc" stroke="#334155" stroke-width="1.5"/>`);

    // วาด "รายคอลัมน์" (เบากว่ารายชิ้นมาก) เรียงตาม y (ไกล→ใกล้) เป็น depth cue
    const cols = result.placements.slice().sort((a, b) => b.y - a.y);
    for (const p of cols) {
      const c = p.col;
      const rx = X(p.x), ry = Y(p.z0 + c.totalH), rw = p.l * scale, rh = c.totalH * scale;
      const depth = 1 - (p.y / result.container.W) * 0.4;
      parts.push(`<g class="box"><title>${esc(c.sku + ' ×' + c.count + ' สูง · ' + c.totalH + 'mm')}</title>`);
      parts.push(`<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${tint(c.color, 0.25)}" fill-opacity="${depth.toFixed(2)}" stroke="${c.color}" stroke-width="0.5"/>`);
      // เส้นแบ่งชั้น (บอกจำนวนซ้อน)
      for (let k = 1; k < c.count && rh / c.count > 3; k++) {
        const ly = Y(p.z0 + k * c.unitH);
        parts.push(`<line x1="${rx}" y1="${ly}" x2="${rx + rw}" y2="${ly}" stroke="${c.color}" stroke-width="0.3" opacity="0.5"/>`);
      }
      parts.push('</g>');
    }
    // ceiling guide
    parts.push(`<line x1="${X(0)}" y1="${Y(H)}" x2="${X(L)}" y2="${Y(H)}" stroke="#64748b" stroke-width="0.6" stroke-dasharray="3 3"/>`);
    parts.push(`<text x="${X(L)}" y="${Y(H) - 3}" fill="#64748b" font-size="8" text-anchor="end">เพดาน ${H}mm</text>`);
    parts.push(`<text x="${X(L / 2)}" y="${svgH - 6}" fill="#64748b" font-size="9" text-anchor="middle">มุมมองด้านข้าง (ยาว × สูง)</text>`);
    parts.push('</svg>');
    return parts.join('');
  }

  // ---- legend (SKU → สี) -------------------------------------------------
  function legendHTML(skuCatalog, usedSkus) {
    return skuCatalog.filter((s) => !usedSkus || usedSkus.has(s.sku)).map((s) =>
      `<span class="lg"><span class="sw" style="background:${s.color}"></span>${esc(s.sku)}${s.dgClass ? ' <span class="dgtag">☣' + s.dgClass + '</span>' : ''}</span>`
    ).join('');
  }

  const API = { drawPlan, drawElevation, legendHTML, tint };
  root.CTNView2D = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
