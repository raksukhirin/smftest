/* ============================================================================
 * frmSFContainerPlan — Sample Data (Mockup Phase)
 * ----------------------------------------------------------------------------
 * เฟส Mockup: ข้อมูลอยู่ใน JS object นี้ (ยังไม่ต่อ SQL Server `smfdb`)
 * ตั้งชื่อ field แบบ camelCase ให้ map กับ DDL จริงภายหลังได้ 1:1
 *
 * grounding จาก schema จริง (ตรวจแล้วผ่าน MCP smfdb):
 *   SFCTNSIZE      — master ISO code ของตู้ (PMKEY, ISOCODE, DESCRIPTION) — ไม่มีมิติ
 *   SFCTNLISTBOOK  — รายการตู้ต่อ Booking (JOBNO, BOOKREF, CONTID, GW, CBM, PKGUNIT, PKGQTY)
 *                    → เก็บ "สรุประดับตู้" เท่านั้น ไม่มีมิติรายชิ้น (L×W×H ต่อ SKU)
 *
 * ⇒ ช่องว่างที่โมดูลนี้เติม: มิติ "รายชิ้น" (cargoItems) เป็นข้อมูลใหม่
 *   ที่ผู้ใช้กรอก/โมดูลนี้เพิ่มเข้ามา เพื่อคำนวณแผนจัดเรียง
 * ==========================================================================*/
(function (root) {
  'use strict';

  // ---- Container master --------------------------------------------------
  // มิติภายใน (inner mm) + tare/payload เป็นค่ามาตรฐานอุตสาหกรรม
  // isoCode เชื่อมกับ SFCTNSIZE.ISOCODE (ต่อ SQL ภายหลัง)
  const containerTypes = [
    { ctnType: '20STD', isoCode: '22G1', innerLmm: 5898,  innerWmm: 2352, innerHmm: 2393, tareKg: 2200, maxPayloadKg: 28000, teu: 1 },
    { ctnType: '40STD', isoCode: '42G1', innerLmm: 12032, innerWmm: 2352, innerHmm: 2393, tareKg: 3700, maxPayloadKg: 27600, teu: 2 },
    { ctnType: '40HC',  isoCode: '45G1', innerLmm: 12032, innerWmm: 2352, innerHmm: 2695, tareKg: 4000, maxPayloadKg: 26000, teu: 2 },
    { ctnType: '45HC',  isoCode: 'L5G1', innerLmm: 13556, innerWmm: 2352, innerHmm: 2695, tareKg: 4800, maxPayloadKg: 27000, teu: 2 },
  ];

  // ---- SKU catalog (มิติรายชิ้น — ข้อมูลใหม่ของโมดูลนี้) ------------------
  // Field: sku, Lmm/Wmm/Hmm, weightKg, stackable, maxStack, allowRotate,
  //        noWall, nearDoor, dgClass (ว่าง=ไม่ใช่ DG), color (ใช้วาด)
  const skuCatalog = [
    { sku: 'MED-CARTON',    Lmm: 600,  Wmm: 400, Hmm: 300, weightKg: 12,  stackable: true,  maxStack: 4, allowRotate: true,  noWall: false, nearDoor: false, dgClass: '',  color: '#0ea5e9' },
    { sku: 'SHOE-BOX',      Lmm: 350,  Wmm: 220, Hmm: 130, weightKg: 2,   stackable: true,  maxStack: 6, allowRotate: true,  noWall: false, nearDoor: false, dgClass: '',  color: '#22c55e' },
    { sku: 'FRAGILE-CRATE', Lmm: 1200, Wmm: 800, Hmm: 600, weightKg: 55,  stackable: false, maxStack: 1, allowRotate: false, noWall: false, nearDoor: false, dgClass: '',  color: '#f59e0b' },
    { sku: 'LIQUID-DRUM',   Lmm: 580,  Wmm: 580, Hmm: 900, weightKg: 50,  stackable: false, maxStack: 1, allowRotate: false, noWall: false, nearDoor: false, dgClass: '',  color: '#8b5cf6' },
    { sku: 'CHEM',          Lmm: 580,  Wmm: 580, Hmm: 900, weightKg: 120, stackable: false, maxStack: 1, allowRotate: false, noWall: true,  nearDoor: false, dgClass: '3', color: '#ef4444' },
    { sku: 'BAMBOO',        Lmm: 580,  Wmm: 580, Hmm: 900, weightKg: 100, stackable: false, maxStack: 1, allowRotate: false, noWall: false, nearDoor: true,  dgClass: '',  color: '#84cc16' },
  ];

  // ---- Bookings (mirror SFCTNLISTBOOK — "แหล่งข้อมูลจากระบบ") -------------
  // สรุประดับตู้จริงมีแค่ gw/cbm/pkgQty; cargoItems (มิติรายชิ้น) คือ layer ใหม่
  const bookings = [
    {
      jobNo: 'SE26070012', bookRef: 'BSE26070012',
      customer: 'C-ALPHA TRADING', pol: 'THLCH', pod: 'DEHAM',
      // ตู้ที่จองในระบบ (SFCTNLISTBOOK): contId, isoCode, gw(kg), cbm, pkgUnit, pkgQty
      containers: [
        { contId: 501, ctnType: '40HC', isoCode: '45G1', gwKg: 3730, cbm: 42.5, pkgUnit: 'CTN', pkgQty: 649 },
      ],
      // มิติรายชิ้น (ข้อมูลใหม่ที่ผู้ใช้ต้องกรอก/นำเข้าเพื่อจัดเรียง)
      cargoItems: [
        { sku: 'MED-CARTON',    qty: 120 },
        { sku: 'SHOE-BOX',      qty: 500 },
        { sku: 'FRAGILE-CRATE', qty: 10  },
        { sku: 'LIQUID-DRUM',   qty: 8   },
        { sku: 'CHEM',          qty: 2   },
        { sku: 'BAMBOO',        qty: 1   },
      ],
    },
    {
      jobNo: 'SE26070018', bookRef: 'BSE26070018',
      customer: 'C-BRAVO LOGISTICS', pol: 'THBKK', pod: 'SGSIN',
      containers: [
        { contId: 512, ctnType: '20STD', isoCode: '22G1', gwKg: 9800, cbm: 24.0, pkgUnit: 'CTN', pkgQty: 300 },
      ],
      cargoItems: [
        { sku: 'MED-CARTON', qty: 200 },
        { sku: 'SHOE-BOX',   qty: 100 },
      ],
    },
  ];

  // ---- Settings (ค่าเริ่มต้น — ตรงกับ Settings sheet ของ demo เดิม) --------
  const defaultSettings = {
    allowRotate: true,       // อนุญาตหมุน 2D (สลับ L↔W)
    wallClearanceMm: 50,     // ระยะห่างจากผนัง (สำหรับ item ที่ noWall)
    doorZoneMm: 1200,        // ความกว้างเขตประตู (สำหรับ item ที่ nearDoor)
    doorAt: 'FRONT',         // ประตูอยู่ฝั่ง FRONT | BACK
    topFill: true,           // เปิด pass เติมของบนหัวคอลัมน์ (ใช้ความสูงคุ้มขึ้น)
  };

  const DATA = { containerTypes, skuCatalog, bookings, defaultSettings };

  // export: browser (window.CTN_DATA) + Node (module.exports)
  root.CTN_DATA = DATA;
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
