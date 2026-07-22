/* รันเครื่องคำนวณใน index.html แบบ headless แล้วเทียบกับตัวเลขในรายงานจริง */
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const src = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));

// stub DOM: ให้ render*() ไม่พัง แต่ compute() ทำงานจริง
const el = new Proxy({}, { get: () => el, set: () => true, apply: () => el });
const ctx = {
  console, Math, Number, String, Object, Array, JSON, isFinite, parseFloat, Set,
  document: { querySelector: () => ({ innerHTML: '', textContent: '', className: '', onclick: null }),
              querySelectorAll: () => [] }
};
ctx.globalThis = ctx;
vm.createContext(ctx);
// top-level const ไม่ผูกกับ context object → export ออกมาท้าย script
vm.runInContext(src + '\n;globalThis.__x={REPORT,LINES,R2,amtThb,compute,JOB,HOUSES,LN,setSnap:v=>SNAP=v};',
  ctx, { filename: 'd12-ui.js' });

const X = ctx.__x;
X.setSnap('A'); const C = X.compute();
X.setSnap('B'); const B = X.compute();
X.setSnap('NOW'); const NOW = X.compute();
const R = X.REPORT, R2 = X.R2;

const checks = [
  ['Sale · Revenue',   C.tot.legacyRev,    R.saleRev],
  ['Sale · Cost',      C.tot.legacyCost,   R.saleCost],
  ['Sale · Profit',    C.tot.legacyProfit, R.saleProfit],
  ['Consol · Revenue', C.tot.consolRev,        R.consolRev],
  ['Consol · Cost',    C.tot.consolCost,       R.consolCost],
  ['Consol · Profit',  C.tot.consolProfit,     R.consolProfit],
];

console.log('== golden: ย้อนสถานะ ณ วันพิมพ์ · เทียบ "รายงานเดิม (รวมแถวผี)" ==');
console.log('รายการ'.padEnd(18), 'คำนวณได้'.padStart(14), 'ในรายงาน'.padStart(14), '  ผล');
let pass = 0;
for (const [k, calc, exp] of checks) {
  const ok = Math.abs(R2(calc) - exp) < 0.02;
  if (ok) pass++;
  console.log(k.padEnd(18), R2(calc).toFixed(2).padStart(14), exp.toFixed(2).padStart(14),
    '  ' + (ok ? 'ตรง' : 'ต่าง ' + R2(calc - exp).toFixed(2)));
}
console.log('\nรวม: ' + pass + '/' + checks.length + (pass === checks.length ? '  ✓ สูตรถูกต้อง' : '  ✗ ยังไม่ตรง'));

console.log('\n--- รายแถว ---');
for (const r of NOW.rows) {
  console.log(String(r.h.BLNO).padEnd(18),
    'share R', String(R2(r.shareRev)).padStart(8), 'C', String(R2(r.shareCost)).padStart(7),
    '| Sale', String(R2(r.saleRev)).padStart(10), String(R2(r.saleCost)).padStart(9),
    String(R2(r.saleRev - r.saleCost)).padStart(10),
    '| Consol', String(R2(r.consolRev)).padStart(9), String(R2(r.consolCost)).padStart(6));
}

const mTot = X.LN().filter(l => l.HBLREF === NOW.master.DOCNO).reduce((s, l) => s + X.amtThb(l), 0);
console.log('\nInvariant Σ share = master :', NOW.tot.alloc === 0
  ? 'ไม่ใช้ — ปิดการเฉลี่ยทั้งหมด'
  : R2(NOW.tot.alloc) + ' vs ' + R2(mTot) + ' → ต่าง ' + R2(NOW.tot.alloc - mTot));

const h01 = B.rows.find(r => r.h.BLNO.endsWith('/01'));
console.log('\n== golden 2: ย้อนสถานะ B · เทียบรายงานหลังปิดการเฉลี่ย (house /01) ==');
for (const [k, calc, exp] of [['Revenue', h01.saleRev, 4291.16], ['Cost', h01.saleCost, 10441.50],
                              ['Profit', h01.saleRev - h01.saleCost, -6150.34]])
  console.log('  ' + k.padEnd(8), R2(calc).toFixed(2).padStart(11), R2(exp).toFixed(2).padStart(11),
    Math.abs(R2(calc) - exp) < 0.02 ? ' ตรง' : ' ต่าง');

console.log('\n== golden 3: สถานะ NOW (กรณี 3.1 · basis CBM) — ผู้ใช้ยืนยันตัวเลขแล้ว 2026-07-22 ==');
console.log('   ทำนายแถวผีไว้ rev 2,586.92 / cost 0 → ตรง · D12 ตัดออกแล้ว');
for (const [k, calc, exp] of [['Sale Rev  (รายงาน)', NOW.tot.legacyRev, 19812.68],
                              ['Sale Cost (รายงาน)', NOW.tot.legacyCost, 11941.50],
                              ['Sale Prof (รายงาน)', NOW.tot.legacyProfit, 7871.18]])
  console.log('  ' + k.padEnd(20), R2(calc).toFixed(2).padStart(11), R2(exp).toFixed(2).padStart(11),
    Math.abs(R2(calc) - exp) < 0.02 ? ' ตรง' : ' ต่าง');

console.log('\n--- ผลลัพธ์ D12 (ตัดแถวผีออกแล้ว) ---');
for (const [k, v] of [['Sale · Revenue', NOW.tot.saleRev], ['Sale · Cost', NOW.tot.saleCost],
                      ['Sale · Profit', NOW.tot.saleProfit], ['Consol · Revenue', NOW.tot.consolRev],
                      ['Consol · Cost', NOW.tot.consolCost], ['Consol · Profit', NOW.tot.consolProfit]])
  console.log('  ' + k.padEnd(18), R2(v).toFixed(2).padStart(12));
