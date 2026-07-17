/* ============================================================================
 * frmSFContainerPlan — Packing Engine  (DOM-free · testable in Node)
 * ----------------------------------------------------------------------------
 * ปรับปรุงจาก container_loader_demo.py (Python heuristic) — 3 จุดหลัก:
 *   1. Vertical stacking จริง — สร้าง "คอลัมน์" (stack) ตาม stackable/maxStack
 *      + จำกัดด้วยความสูงตู้ (เดิม maxStack ประกาศไว้แต่ไม่เคยถูกใช้)
 *   2. ผลลัพธ์เป็น placement 3D จริง (x,y,z,l,w,h) — พร้อมต่อ view 2D/3D
 *   3. KPI ครบ: utilization (ปริมาตร/พื้น/น้ำหนัก), VGM, จุดศูนย์ถ่วง (CoG),
 *      สมดุลหน้า-หลัง/ซ้าย-ขวา, รายการที่วางไม่ลง (unplaced)
 *
 * โมเดล: "คอลัมน์วางบนพื้น" (floor-standing columns) + top-fill pass
 *   - แต่ละคอลัมน์ = กล่อง SKU เดียวกันซ้อนกัน (น้ำหนักเท่ากัน → ไม่มีการทับกันของ
 *     ของหนักบนของเบา) ⇒ กันของเปราะถูกทับ "by design"
 *   - คอลัมน์ความสูงต่างกันวางเคียงกันบนพื้นได้ (สมจริงกว่าชั้นลอยของเดิม)
 *   - top-fill: หลังวางเต็มพื้น ลองวางคอลัมน์เตี้ยที่เหลือ "บนหัว" คอลัมน์อื่น
 *     เมื่อ footprint พอดี และไม่ละเมิดกฎ no-crush (บน stackable + เบากว่า/เท่ากัน)
 *
 * พิกัด: x = ยาว (0..L), y = กว้าง (0..W), z = สูง (0..H)  หน่วย mm
 *
 * segregation: จัดกลุ่มตาม dgClass — แต่ละคลาส DG และกลุ่ม non-DG แพ็คแยก
 *   โซนความกว้าง (แถวชั้นไม่ปนคลาสกัน) ตามหลัก hazmat
 * ==========================================================================*/
(function (root) {
  'use strict';

  const yn = (v) => v === true || String(v).trim().toUpperCase() === 'Y';

  // ---- 1) expand cargoItems → รายชิ้น (join กับ skuCatalog) ---------------
  // คืน { pieces, unknownSkus, requestedQty, droppedQty }
  // สำคัญ: ห้าม "หายเงียบ" — SKU ไม่รู้จัก / เกิน cap ต้องรายงานกลับเสมอ
  // เพื่อให้ plan() ยกเป็น warning (ไม่งั้น KPI จะโกหกว่าของครบ)
  function expandItems(cargoItems, skuCatalog, cap = 5000) {
    const bySku = {};
    skuCatalog.forEach((s) => { bySku[s.sku] = s; });
    const pieces = [];
    const unknownSkus = [];
    let requestedQty = 0;
    for (const line of cargoItems) {
      const want = Math.max(0, Number(line.qty) || 0);
      const s = bySku[line.sku];
      if (!s) { if (want > 0) unknownSkus.push({ sku: String(line.sku), qty: want }); continue; }
      requestedQty += want;
      const qty = Math.min(want, Math.max(0, cap - pieces.length));
      for (let i = 0; i < qty; i++) {
        pieces.push({
          sku: s.sku, L: +s.Lmm, W: +s.Wmm, H: +s.Hmm, weight: +s.weightKg,
          stackable: yn(s.stackable), maxStack: Math.max(1, +s.maxStack || 1),
          allowRotate: yn(s.allowRotate), noWall: yn(s.noWall), nearDoor: yn(s.nearDoor),
          dgClass: String(s.dgClass || '').trim(), color: s.color || '#64748b',
        });
      }
      // ไม่ break — ต้องนับ requestedQty ของบรรทัดที่เหลือให้ครบ
      // เพื่อรายงาน droppedQty ได้ถูกต้อง (ถ้า break จะหายเงียบซ้ำอีกชั้น)
    }
    return { pieces, unknownSkus, requestedQty, droppedQty: requestedQty - pieces.length };
  }

  // ---- 2) สร้างคอลัมน์ (vertical stacks) ---------------------------------
  // รวมกล่อง SKU เดียวกันเป็นคอลัมน์ สูงไม่เกิน min(maxStack, floor(H/h))
  function buildColumns(pieces, contH) {
    const bySku = {};
    for (const p of pieces) (bySku[p.sku] = bySku[p.sku] || []).push(p);

    const columns = [];
    for (const sku of Object.keys(bySku)) {
      const list = bySku[sku];
      const proto = list[0];
      const fitByHeight = Math.max(1, Math.floor(contH / proto.H));
      const perCol = proto.stackable ? Math.max(1, Math.min(proto.maxStack, fitByHeight)) : 1;
      for (let i = 0; i < list.length; i += perCol) {
        const chunk = list.slice(i, i + perCol);
        columns.push({
          sku, count: chunk.length,
          L: proto.L, W: proto.W, unitH: proto.H,
          totalH: proto.H * chunk.length,
          unitWeight: proto.weight, weight: proto.weight * chunk.length,
          allowRotate: proto.allowRotate, noWall: proto.noWall,
          nearDoor: proto.nearDoor, dgClass: proto.dgClass, color: proto.color,
          stackable: proto.stackable, maxStack: proto.maxStack,
        });
      }
    }
    return columns;
  }

  // ---- ตรวจเงื่อนไขตำแหน่ง (wall clearance / door zone) -------------------
  function placementOk(x, y, lx, wy, contL, contW, col, cfg) {
    if (col.noWall) {
      const c = cfg.wallClearanceMm;
      if (x < c || y < c || x + lx > contL - c || y + wy > contW - c) return false;
    }
    if (col.nearDoor && cfg.doorZoneMm > 0) {
      const dz = cfg.doorZoneMm;
      if (cfg.doorAt === 'FRONT') { if (x + lx > dz) return false; }
      else { if (x < contL - dz) return false; }
    }
    return true;
  }

  // ---- Skyline (bottom-left) floor packer --------------------------------
  // มองพื้นเป็น strip: แกน W (กว้าง 0..contW) มีขอบเขต, แกน L (ยาว) คือทิศเติม
  // skyline = segment [w0,w1) พร้อม frontier ระยะ x (len) ที่วางถึงแล้ว
  function skyInit(contW) { return [{ w0: 0, w1: contW, len: 0 }]; }

  // หา frontier x สูงสุดในช่วง [w0, w0+rw)
  function skyMaxLen(segs, w0, rw) {
    const w1 = w0 + rw; let x = 0;
    for (const t of segs) { if (t.w1 <= w0 || t.w0 >= w1) continue; x = Math.max(x, t.len); }
    return x;
  }

  // อัปเดต skyline: ยกระดับ frontier ในช่วง [w0,w0+rw) เป็น newLen แล้ว merge
  function skyPlace(segs, w0, rw, newLen) {
    const w1 = w0 + rw, out = [];
    for (const s of segs) {
      if (s.w1 <= w0 || s.w0 >= w1) { out.push(s); continue; }
      if (s.w0 < w0) out.push({ w0: s.w0, w1: w0, len: s.len });
      if (s.w1 > w1) out.push({ w0: w1, w1: s.w1, len: s.len });
    }
    out.push({ w0, w1, len: newLen });
    out.sort((a, b) => a.w0 - b.w0);
    const merged = [Object.assign({}, out[0])];
    for (let i = 1; i < out.length; i++) {
      const p = merged[merged.length - 1], c = out[i];
      if (p.w1 === c.w0 && p.len === c.len) p.w1 = c.w1; else merged.push(Object.assign({}, c));
    }
    return merged;
  }

  // วางคอลัมน์ 1 ตัวลง skyline (bottom-left) เคารพ noWall/nearDoor
  // คืน { placed:{col,x,y,l,w}, segs } หรือ null ถ้าวางไม่ได้ (mutate ไม่ทำ)
  function skyTryPlace(segs, col, cont, cfg) {
    const { L: contL, W: contW } = cont;
    const c = cfg.wallClearanceMm;
    const oris = [[col.L, col.W]];
    if (cfg.allowRotate && col.allowRotate) oris.push([col.W, col.L]);

    // ขอบเขต w และ x ตามเงื่อนไข
    const wLo = col.noWall ? c : 0;
    const wHi = col.noWall ? contW - c : contW;      // ขอบบนของ (w0+rw)
    let best = null;
    for (const [rl, rw] of oris) {
      if (rw > wHi - wLo) continue;
      // candidate w0 = จุดเริ่มของแต่ละ segment (clamp ให้อยู่ในช่วงอนุญาต)
      for (const s of segs) {
        let w0 = Math.max(s.w0, wLo);
        if (w0 + rw > wHi) continue;
        let x = Math.max(skyMaxLen(segs, w0, rw), col.noWall ? c : 0);
        // door zone
        if (col.nearDoor && cfg.doorZoneMm > 0) {
          if (cfg.doorAt === 'FRONT') { if (x + rl > cfg.doorZoneMm) continue; }
          else { x = Math.max(x, contL - cfg.doorZoneMm); }
        }
        const xMax = col.noWall ? contL - c : contL;
        if (x + rl > xMax) continue;
        if (!best || x < best.x || (x === best.x && w0 < best.w0))
          best = { x, w0, rl, rw };
      }
    }
    if (!best) return null;
    const segs2 = skyPlace(segs, best.w0, best.rw, best.x + best.rl);
    return { placed: { col, x: best.x, y: best.w0, l: best.rl, w: best.rw }, segs: segs2 };
  }

  // กลยุทธ์การเรียงคอลัมน์ — มีผลต่อทั้งความแน่นและสมดุลน้ำหนัก
  // (skyline เติมจากฝั่งประตูก่อน ⇒ ของที่เรียงก่อนจะไปอยู่หน้าตู้)
  const SORT_KEYS = {
    area:    (a, b) => (b.L * b.W) - (a.L * a.W) || Math.max(b.L, b.W) - Math.max(a.L, a.W),
    density: (a, b) => (b.weight / (b.L * b.W)) - (a.weight / (a.L * a.W)),
    weight:  (a, b) => b.weight - a.weight,
    maxdim:  (a, b) => Math.max(b.L, b.W) - Math.max(a.L, a.W),
    volume:  (a, b) => (b.L * b.W * b.totalH) - (a.L * a.W * a.totalH),
  };

  // วางทั้งกลุ่ม (เรียงของมีเงื่อนไขก่อน แล้วตามกลยุทธ์ที่เลือก)
  function packGroup(segs, cols, cont, cfg) {
    const constrained = (c) => (c.nearDoor ? 2 : 0) + (c.noWall ? 1 : 0);
    const keyFn = SORT_KEYS[cfg.sortKey] || SORT_KEYS.area;
    const order = cols.slice().sort((a, b) =>
      constrained(b) - constrained(a) || keyFn(a, b));
    const placed = [], leftover = [];
    for (const col of order) {
      const r = skyTryPlace(segs, col, cont, cfg);
      if (r) { placed.push(r.placed); segs = r.segs; } else leftover.push(col);
    }
    return { placed, leftover, segs };
  }

  // ---- top-fill: วางคอลัมน์เตี้ยที่เหลือบนหัวคอลัมน์ที่วางแล้ว -----------
  function topFill(placements, leftover, contH, cfg) {
    const stillLeft = [];
    for (const col of leftover) {
      let done = false;
      // เลือกฐานที่: footprint เท่ากัน (หรือใหญ่กว่า), รวมสูงไม่เกินตู้,
      // ฐาน stackable, และ no-crush (คอลัมน์บนต้อง "เบากว่าหรือเท่ากับ" ต่อชิ้น)
      for (const base of placements) {
        if (!base.col.stackable) continue;
        if (base.stackedOn) continue;                       // ยังไม่รองรับซ้อน >1 กอง (mockup)
        const heightOk = base.z0 + base.col.totalH + col.totalH <= contH;
        // กฎกันทับ (no-crush):
        //   SKU เดียวกัน → กองรวมต้องไม่เกิน maxStack (ไม่งั้นละเมิดกฎกันทับของ SKU นั้น)
        //   ต่าง SKU    → ของบนต้องเบากว่า/เท่ากับของฐาน (ต่อชิ้น)
        const noCrush = (col.sku === base.col.sku)
          ? (base.col.count + col.count <= base.col.maxStack)
          : (col.unitWeight <= base.col.unitWeight);
        if (!heightOk || !noCrush) continue;
        // วางลงบนหัวได้ถ้า footprint ของ base ครอบ col ได้ (ลองหมุนถ้าอนุญาต)
        let fit = null;
        if (base.l >= col.L && base.w >= col.W) fit = [col.L, col.W];
        else if (cfg.allowRotate && col.allowRotate && base.l >= col.W && base.w >= col.L) fit = [col.W, col.L];
        if (fit) {
          placements.push({
            col, x: base.x, y: base.y, l: fit[0], w: fit[1],
            z0: base.z0 + base.col.totalH, onTopOf: base.id,
          });
          base.stackedOn = true; done = true; break;
        }
      }
      if (!done) stillLeft.push(col);
    }
    return stillLeft;
  }

  // ---- 3) รวมทุกอย่าง: plan() -------------------------------------------
  function plan(input) {
    const { container, cargoItems, skuCatalog, settings } = input;
    const cfg = Object.assign({
      allowRotate: true, wallClearanceMm: 50,
      doorZoneMm: 1200, doorAt: 'FRONT', topFill: true,
    }, settings || {});

    const contL = +container.innerLmm, contW = +container.innerWmm, contH = +container.innerHmm;
    const tare = +container.tareKg, maxPayload = +container.maxPayloadKg;

    const ex = expandItems(cargoItems, skuCatalog);
    const pieces = ex.pieces;
    const columns = buildColumns(pieces, contH);
    const cont = { L: contL, W: contW, H: contH };

    // segregate ตาม dgClass (หลัก hazmat): จอง "โซน DG" ไว้ท้ายตู้ (ตรงข้ามประตู)
    // ก่อน แล้วจึงเติม non-DG ในโซนหน้า → DG ไม่ปนกับ non-DG และไม่ปนข้ามคลาส
    const groups = {};
    for (const c of columns) (groups[c.dgClass || '_NON_DG'] = groups[c.dgClass || '_NON_DG'] || []).push(c);
    const dgClasses = Object.keys(groups).filter((k) => k !== '_NON_DG').sort();

    const placements = [];
    const unplacedCols = [];

    // 1) กำหนดความลึกโซน DG (probe บนพื้นที่เต็มเพื่อประเมิน) แล้วเผื่อ margin
    let dgBand = 0;
    if (dgClasses.length) {
      let probe = skyInit(contW), depth = 0;
      for (const cls of dgClasses) {
        const g = probe.reduce((m, s) => Math.max(m, s.len), 0);
        probe = probe.map((s) => ({ w0: s.w0, w1: s.w1, len: Math.max(s.len, g) }));
        const r = packGroup(probe, groups[cls], cont, cfg);
        probe = r.segs;
      }
      depth = probe.reduce((m, s) => Math.max(m, s.len), 0);
      dgBand = Math.min(Math.floor(contL * 0.5), depth + 200);   // เผื่อ margin
    }
    const frontL = contL - dgBand;        // ความยาวโซน non-DG (ฝั่งประตู)

    // 2) non-DG เติมโซนหน้า [0, frontL]
    let segs = skyInit(contW);
    if (groups._NON_DG) {
      const res = packGroup(segs, groups._NON_DG, { L: frontL, W: contW, H: contH }, cfg);
      res.placed.forEach((p) => placements.push(p));
      unplacedCols.push(...res.leftover);
      segs = res.segs;
    }
    // 3) DG เติมโซนท้าย [frontL, contL] (pack ในกรอบยาว=dgBand แล้วเลื่อนไปท้าย)
    let dgSegs = skyInit(contW);
    for (const cls of dgClasses) {
      const g = dgSegs.reduce((m, s) => Math.max(m, s.len), 0);
      dgSegs = dgSegs.map((s) => ({ w0: s.w0, w1: s.w1, len: Math.max(s.len, g) }));
      const res = packGroup(dgSegs, groups[cls], { L: dgBand, W: contW, H: contH }, cfg);
      res.placed.forEach((p) => { p.x += frontL; placements.push(p); });   // เลื่อนไปชิดท้าย
      unplacedCols.push(...res.leftover);
      dgSegs = res.segs;
    }

    // z0 ของคอลัมน์บนพื้น = 0, ใส่ id ให้ทุก placement
    placements.forEach((p, i) => { p.id = i; if (p.z0 == null) p.z0 = 0; });

    // top-fill pass (ใช้ความสูงคุ้มขึ้น)
    let remaining = unplacedCols;
    if (cfg.topFill && remaining.length) {
      remaining = topFill(placements, remaining, contH, cfg);
    }

    return buildResult({
      container, contL, contW, contH, tare, maxPayload,
      placements, remainingCols: remaining, pieces, cfg, ex,
    });
  }

  // ---- ประกอบผลลัพธ์ + KPI ----------------------------------------------
  function buildResult(s) {
    const { contL, contW, contH, tare, maxPayload, placements, remainingCols, pieces, cfg } = s;
    const ex = s.ex || { unknownSkus: [], requestedQty: pieces.length, droppedQty: 0 };

    // ระเบิดคอลัมน์เป็น "กล่องรายชิ้น" 3D (สำหรับ view / รายงาน)
    const boxes = [];
    for (const p of placements) {
      const col = p.col;
      for (let k = 0; k < col.count; k++) {
        boxes.push({
          sku: col.sku, x: p.x, y: p.y, z: p.z0 + k * col.unitH,
          l: p.l, w: p.w, h: col.unitH, weight: col.unitWeight,
          dgClass: col.dgClass, color: col.color, colId: p.id, stackIdx: k,
        });
      }
    }

    const placedWeight = boxes.reduce((a, b) => a + b.weight, 0);
    const placedVol = boxes.reduce((a, b) => a + b.l * b.w * b.h, 0);
    const contVol = contL * contW * contH;
    // floor util = เฉพาะคอลัมน์ที่ยืนบนพื้น (z0===0) — ไม่นับที่ซ้อนบนหัว
    const floorUsed = placements.filter((p) => p.z0 === 0).reduce((a, p) => a + p.l * p.w, 0);

    // จุดศูนย์ถ่วง (ถ่วงน้ำหนัก) + สมดุล
    let cgx = 0, cgy = 0, cgz = 0;
    for (const b of boxes) {
      cgx += (b.x + b.l / 2) * b.weight;
      cgy += (b.y + b.w / 2) * b.weight;
      cgz += (b.z + b.h / 2) * b.weight;
    }
    if (placedWeight > 0) { cgx /= placedWeight; cgy /= placedWeight; cgz /= placedWeight; }

    let frontW = 0, backW = 0, leftW = 0, rightW = 0;
    for (const b of boxes) {
      const cx = b.x + b.l / 2, cy = b.y + b.w / 2;
      if (cx <= contL / 2) frontW += b.weight; else backW += b.weight;
      if (cy <= contW / 2) leftW += b.weight; else rightW += b.weight;
    }

    // รายการที่วางไม่ลง (สรุปเป็น SKU × ชิ้น)
    const unplaced = {};
    for (const c of remainingCols) unplaced[c.sku] = (unplaced[c.sku] || 0) + c.count;
    const unplacedList = Object.keys(unplaced).map((sku) => ({ sku, qty: unplaced[sku] }));
    const unplacedPieces = unplacedList.reduce((a, u) => a + u.qty, 0);

    // warnings
    const warnings = [];
    const fb = frontW + backW, lr = leftW + rightW;
    if (fb && (frontW / fb < 0.35 || frontW / fb > 0.65))
      warnings.push({ level: 'warn', code: 'BALANCE_FB', msg: 'สมดุลน้ำหนักหน้า/หลังเอียงเกิน ~35/65' });
    if (lr && (leftW / lr < 0.35 || leftW / lr > 0.65))
      warnings.push({ level: 'warn', code: 'BALANCE_LR', msg: 'สมดุลน้ำหนักซ้าย/ขวาเอียงเกิน ~35/65' });
    if (placedWeight > maxPayload)
      warnings.push({ level: 'danger', code: 'OVERWEIGHT', msg: 'น้ำหนักสินค้าเกินพิกัดบรรทุกของตู้' });
    if (unplacedPieces > 0)
      warnings.push({ level: 'warn', code: 'UNPLACED', msg: `วางไม่ลง ${unplacedPieces} ชิ้น — ต้องใช้ตู้เพิ่มหรือปรับแผน` });
    // ห้ามหายเงียบ: ของที่ engine ไม่ได้พิจารณาเลย ต้องเตือนดัง ๆ
    if (ex.unknownSkus.length) {
      const t = ex.unknownSkus.reduce((a, u) => a + u.qty, 0);
      warnings.push({ level: 'danger', code: 'UNKNOWN_SKU',
        msg: `ไม่รู้จัก SKU: ${ex.unknownSkus.map((u) => u.sku).join(', ')} (รวม ${t} ชิ้น) — ไม่ถูกนำมาคำนวณ` });
    }
    if (ex.droppedQty > 0)
      warnings.push({ level: 'danger', code: 'CAP_EXCEEDED',
        msg: `จำนวนชิ้นเกินขีดจำกัด mockup (${pieces.length} ชิ้น) — ตัดออก ${ex.droppedQty} ชิ้น ผลลัพธ์ไม่ครบ` });

    const kpi = {
      piecesRequested: ex.requestedQty,        // ที่ผู้ใช้ขอจริง (ก่อนตัด cap)
      piecesTotal: pieces.length,              // ที่ engine พิจารณา (หลังตัด cap)
      piecesDropped: ex.droppedQty,            // ถูกตัดเพราะเกิน cap
      piecesPlaced: boxes.length,
      piecesUnplaced: unplacedPieces,
      columns: placements.length,
      volumeUtilPct: contVol ? +(placedVol / contVol * 100).toFixed(1) : 0,
      floorUtilPct: (contL * contW) ? +(floorUsed / (contL * contW) * 100).toFixed(1) : 0,
      weightUtilPct: maxPayload ? +(placedWeight / maxPayload * 100).toFixed(1) : 0,
      placedWeightKg: +placedWeight.toFixed(1),
      vgmKg: +(tare + placedWeight).toFixed(1),
      cog: { x: Math.round(cgx), y: Math.round(cgy), z: Math.round(cgz) },
      balance: {
        front: +frontW.toFixed(1), back: +backW.toFixed(1),
        left: +leftW.toFixed(1), right: +rightW.toFixed(1),
        frontPct: fb ? +(frontW / fb * 100).toFixed(1) : 0,
        leftPct: lr ? +(leftW / lr * 100).toFixed(1) : 0,
      },
    };

    return {
      container: { L: contL, W: contW, H: contH, tare, maxPayload, ctnType: s.container.ctnType },
      cfg, boxes, placements, kpi, warnings, unplaced: unplacedList,
    };
  }

  // ---- 4) planBest(): ลองหลายกลยุทธ์ แล้วเลือกแผนที่ดีที่สุด --------------
  // เกณฑ์: วางได้มากสุดก่อน → แล้วสมดุลน้ำหนักใกล้ 50/50 สุด → แล้วใช้พื้นคุ้มสุด
  // (packer เร็วพอที่จะรันทุกกลยุทธ์แล้วเทียบ — โปร่งใส ตรวจสอบได้)
  function scorePlan(r) {
    const k = r.kpi;
    const dev = Math.abs(k.balance.frontPct - 50) + Math.abs(k.balance.leftPct - 50);
    return k.piecesPlaced * 1e6 - dev * 1e3 + k.floorUtilPct;
  }
  function planBest(input) {
    const keys = Object.keys(SORT_KEYS);
    let best = null, tried = [];
    for (const sortKey of keys) {
      const settings = Object.assign({}, input.settings || {}, { sortKey });
      const r = plan(Object.assign({}, input, { settings }));
      const sc = scorePlan(r);
      tried.push({ sortKey, placed: r.kpi.piecesPlaced, floorPct: r.kpi.floorUtilPct,
                   frontPct: r.kpi.balance.frontPct, score: Math.round(sc) });
      if (!best || sc > best.score) best = { r, score: sc, sortKey };
    }
    best.r.strategy = { chosen: best.sortKey, tried };   // โชว์ใน UI ได้ว่าเลือกอะไร ทำไม
    return best.r;
  }

  const API = { plan, planBest, expandItems, buildColumns, packGroup, skyTryPlace, topFill, SORT_KEYS };
  root.CTNPacker = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
