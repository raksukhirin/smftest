# frmSFContainerPlan — Container Loading Planner (Mockup)

โมดูลวางแผนจัดเรียงสินค้าลงตู้คอนเทนเนอร์ของ SMF — พัฒนาต่อจาก prototype Python
`mockup/ContainerLoader/container_loader_demo.py` ให้เป็น Web mockup ที่ใช้งานจริงได้
(แนวเดียวกับ mockup อื่นของ SMF: Tailwind CDN + engine แยก DOM-free ที่เทสใน Node ได้)

## รันยังไง

```bash
# ผ่าน launch.json (แนะนำ)
#   preview_start ชื่อ "sfcontainerplan-mockup" → http://localhost:8770
# หรือรันเอง
cd D:/DEV.AI/SMP.AI/mockup/frmSFContainerPlan
python -m http.server 8770
```
เปิด `http://localhost:8770/index.html` — Double-click ไฟล์ (file://) ก็ได้ (data ฝังใน `data.js`)

## ไฟล์

```
index.html        UI (ธีม Emerald) + importmap ของ Three.js
style.css         รวม print styles ของ Loading Instruction
data.js           ตู้ 4 ISO + Booking ตัวอย่าง (mirror SFCTNLISTBOOK) + SKU + settings
src/
  packer.js       ★ Engine (DOM-free) — skyline bin-packing + stacking + เงื่อนไข + KPI + planBest()
  view2d.js       วาด SVG: floor plan (บน) + elevation (ข้าง) + legend
  view3d.js       3D จริง (Three.js, ES module) — InstancedMesh + orbit + คลิกดู + ตัดชั้น
  report.js       Loading Instruction → window.print() (Save as PDF) + ลำดับการโหลด
  app.js          DOM wiring: ตาราง/ปุ่ม → planBest() → เรนเดอร์ผล + บันทึก
```

> ⚠ **ต้องรันผ่าน http://** (ไม่ใช่ file://) — Three.js โหลดผ่าน importmap/ES module จาก CDN
> ถ้าแก้ไฟล์แล้วหน้าไม่เปลี่ยน = เบราว์เซอร์ cache → เพิ่ม `?v=` ที่ query หรือ hard reload

## Engine (`packer.js`) — ปรับปรุงจาก Python demo

| ประเด็น | Python demo เดิม | โมดูลนี้ |
|---|---|---|
| Vertical stacking | ประกาศ `MaxStack` แต่ไม่เคยใช้ | สร้าง "คอลัมน์" ซ้อนจริงตาม `maxStack` + จำกัดความสูงตู้ |
| กันของเปราะถูกทับ | ไม่มี | ซ้อน SKU เดียวกันไม่เกิน maxStack · ต่าง SKU ต้องเบากว่า (no-crush) |
| Packing | shelf ต่อ layer (เพดาน ~65% พื้น) | **skyline bottom-left** (~87–92% พื้น) |
| ผลลัพธ์ | รูป PNG ต่อ layer | placement 3D จริง (x,y,z,l,w,h) → ต่อ 2D/3D ได้ |
| DG segregation | สลับ layer หยาบ ๆ | จองโซนท้ายตู้ (ตรงข้ามประตู) แยกคลาส ไม่ปน non-DG |
| KPI | สรุปน้ำหนักคร่าว | utilization (พื้น/ปริมาตร/น้ำหนัก) · VGM · CoG · สมดุล FB/LR · วางไม่ลง |

**เงื่อนไขที่รองรับ:** `noWall` (เว้นผนัง) · `nearDoor` (อยู่เขตประตู) · `dgClass` (แยกโซน) ·
`stackable`/`maxStack` (ซ้อน) · `allowRotate` (หมุน 2D)

**สัญญา API:**
```js
CTNPacker.plan({ container, cargoItems, skuCatalog, settings }) → {
  container, cfg, boxes[], placements[], kpi, warnings[], unplaced[]
}
```
เทสใน Node: `node -e "const D=require('./data.js'),P=require('./src/packer.js'); ..."`

## `planBest()` — เลือกกลยุทธ์อัตโนมัติ (โปร่งใส)

skyline เติมจากฝั่งประตูก่อน ⇒ **ลำดับการเรียงคอลัมน์และทิศทางการเติม มีผลทั้งความแน่นและสมดุลน้ำหนัก**
`planBest()` จึงรัน **5 กลยุทธ์ × 2 ทิศทาง = 10 แผน** แล้วเลือกให้อัตโนมัติ (packer เร็วพอ)
พร้อมแสดงตารางเทียบใน UI ว่าเลือกอะไรเพราะอะไร — ผู้ใช้ไม่ต้องกดโหมดเอง

| มิติ | ตัวเลือก |
|---|---|
| กลยุทธ์เรียง | `area · density · weight · maxdim · volume` |
| ทิศทางเติม | **ทิศเดียว** (ประตู→ท้าย) · **สองทิศ** (bidirectional) |

### bidirectional packing — แก้สมดุลน้ำหนัก
เติมทิศเดียวทำให้น้ำหนักเทไปด้านที่เติมก่อน (เคยได้ 69/31) วิธีแก้: แบ่งคอลัมน์เป็น 2 กอง
น้ำหนักใกล้เคียงกัน (greedy least-loaded) → กอง A เติม `[0, half]` ปกติ · กอง B เติม `[half, frontL]`
แบบ **mirror** ⇒ น้ำหนักกระจายสองฝั่งโดยโครงสร้าง
(ของมีเงื่อนไข `nearDoor`/`noWall` บังคับเข้ากอง A เพราะกอง B ถูก mirror ไปท้าย)

### เกณฑ์การเลือก
สมดุลเป็น **ผ่าน/ไม่ผ่าน (35–65%)** ไม่ใช่ "ยิ่งใกล้ 50 ยิ่งดี" ⇒ พอผ่านเกณฑ์แล้วให้เอาของลงมากสุด
`BALANCE_BONUS_PIECES = 5` — ยอมแลกได้ถึง 5 ชิ้นเพื่อให้ตู้ผ่านเกณฑ์สมดุล แต่ไม่คุ้มถ้าต้องทิ้งเป็นสิบ

## ผลตรวจ (golden run — Booking BSE26070012 / 40HC)

`planBest` เลือก **`density` / สองทิศ** → วางได้ **635/641 ชิ้น** · ใช้พื้น 74.9% · **FB 48.1 / LR 57.2 (ผ่านเกณฑ์)**

- ✅ 0 กล่องล้นตู้ · 0 กล่องซ้อนทับกัน · 0 การละเมิด maxStack · DG แยกโซนถูกต้อง
- ✅ ลำดับการโหลดถูกต้อง (ประตู FRONT → โหลดของไกลประตูก่อน · ชั้นล่างก่อนชั้นบน)
- ✅ `BAMBOO` (nearDoor) อยู่ในเขตประตู · `CHEM` (DG3 + noWall) แยกโซนท้ายตู้ เว้นผนัง
- ✅ **เตือน "ตู้เอียง" หายแล้ว** — เดิม 68.8/31.2 (ทิศเดียว) → 48.1/51.9 (สองทิศ) **โดยเสียของแค่ 2 ชิ้น**
- ⚠ เหลือ "วางไม่ลง 6 ชิ้น" — เป็นฟีเจอร์ (บอก planner ว่าต้องเพิ่มตู้)

**ราคาของสมดุล:** floor 81.7% → 74.9% เพราะเกิด "รอยต่อ" ตรงกลางที่สองกองมาบรรจบ (เห็นได้ในมุมมอง 3D)

> **20STD ไม่สลับไปสองทิศ** — เพราะทิศเดียวได้ FB 51.8 (ผ่านเกณฑ์อยู่แล้ว) การสลับจะเสีย 8 ชิ้นฟรี ๆ
> เป็นตัวอย่างว่าเกณฑ์ "ผ่านก็พอ" ทำงานถูก

## หลักการ: ห้ามข้อมูล "หายเงียบ" (no silent data loss)

เครื่องมือวางแผนที่รายงานผลผิดอย่างมั่นใจ อันตรายกว่าเครื่องมือที่บอกว่าทำไม่ได้
engine จึงบังคับให้ **ทุกชิ้นที่ผู้ใช้ขอ ต้องถูกนับเสมอ** — ตรวจด้วย identity นี้:

```
piecesPlaced + piecesUnplaced + piecesDropped === piecesRequested
```

| กรณี | เดิม (บั๊ก) | ตอนนี้ |
|---|---|---|
| qty เกิน cap (5,000) | `piecesTotal` เหลือ 5000 เงียบ ๆ → หาย 4,999 ชิ้น | `CAP_EXCEEDED` (danger) + `piecesRequested`/`piecesDropped` |
| SKU ไม่รู้จัก | หายเงียบ ไม่มีเตือน (เห็น "0/0" = ดูเหมือนสำเร็จ) | `UNKNOWN_SKU` (danger) บอกชื่อ SKU + จำนวน |
| KPI "วางได้" | เทียบกับยอดหลังตัด (โกหก) | เทียบกับ **ยอดที่ขอจริง** เสมอ |

## แหล่งข้อมูล 2 ทาง (ตามที่ตกลง)

1. **จาก Booking** — เลือก dropdown → ดึงตู้+สรุปจาก `SFCTNLISTBOOK` (jobNo/bookRef/GW/CBM/pkgQty)
2. **กรอกเอง** — แก้ตารางสินค้าได้สด (เพิ่ม/ลบแถว, เลือก SKU, จำนวน)

> **ช่องว่างสำคัญ:** schema จริง `SFCTNLISTBOOK` เก็บแค่ **สรุประดับตู้** (GW/CBM/PKGQTY)
> **ไม่มีมิติรายชิ้น** (L×W×H ต่อ SKU) — โมดูลนี้จึงเพิ่ม layer "มิติรายชิ้น" (`cargoItems` + `skuCatalog`)
> ซึ่งเป็นข้อมูลใหม่ที่จำเป็นต่อการจัดเรียง (ดู [mapping.md](./mapping.md))

## ฟีเจอร์รอบ 2

| ฟีเจอร์ | รายละเอียด |
|---|---|
| 🧊 **3D interactive** | `view3d.js` — กล่องทึบจริง, InstancedMesh ต่อ SKU (เรนเดอร์ 600+ กล่องลื่น), OrbitControls (หมุน/ซูม/แพน), **คลิกกล่องดูรายละเอียด** (raycast → instanceId), **ตัดชั้นด้วย clipping plane จริง** (เฉือนกลางกล่องได้ · เลื่อนสไลเดอร์ไม่ rebuild ฉาก), `snapshot()` คืน dataURL (เอาไปแปะ PDF / ตรวจงานตอน dev) |
| 📄 **Loading Instruction** | `report.js` → `window.print()` (Save as PDF) — ไม่ต้องพึ่งไลบรารี PDF และได้ฟอนต์ไทยถูกต้อง · มี **ลำดับการโหลด** (ประตู FRONT → โหลดของท้ายตู้ก่อน, ชั้นล่างก่อนชั้นบน) |
| 💾 **บันทึกแผน** | เก็บ `localStorage['smf_ctnplan_v1']` — แผนระดับคอลัมน์ (sku/qty/x/y/z/l/w/h/weight/dg) พร้อม kpi + strategy → โครงตรงกับ `SFCTNCARGODTL` ที่เสนอใน [mapping.md](./mapping.md) |
| ⚖ **สมดุลน้ำหนัก** | `planBest()` ลอง 5 กลยุทธ์แล้วเลือกที่ balance/placement ดีสุด + แสดงตารางเทียบ |

## ขอบเขต — ทำแล้ว / รอบถัดไป

- ✅ **รอบ 1:** engine (skyline+stacking+เงื่อนไข+KPI) · ตารางสินค้าแก้ได้ · 2 แหล่งข้อมูล · 2D (บน+ข้าง) · KPI/เตือน/สมดุล
- ✅ **รอบ 2:** 3D interactive · Loading Instruction (PDF) · บันทึกแผน · `planBest()` เลือกกลยุทธ์
- ✅ **รอบ 3:** แก้บั๊ก silent data loss · **bidirectional packing (สมดุลผ่านเกณฑ์แล้ว)** · clipping plane · `snapshot()`
- ⬜ **ถัดไป:** หลายตู้ต่อ Booking (ของล้น → จัดตู้ถัดไปอัตโนมัติ) · เขียนกลับ SQL จริง · Import Excel ·
  แปะภาพ 3D ลง Loading Instruction (มี `snapshot()` รออยู่แล้ว) · ทำ cache-bust `?v=` ให้อัตโนมัติ
