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

skyline เติมจากฝั่งประตูก่อน ⇒ **ลำดับการเรียงคอลัมน์มีผลทั้งความแน่นและสมดุลน้ำหนัก**
`planBest()` จึงรันทุกกลยุทธ์ (`area · density · weight · maxdim · volume`) แล้วเลือกด้วยเกณฑ์
**วางได้มากสุด → สมดุลใกล้ 50/50 → ใช้พื้นคุ้มสุด** และแสดงตารางเทียบใน UI ว่าเลือกอะไรเพราะอะไร

## ผลตรวจ (golden run — Booking BSE26070012 / 40HC)

- `planBest` เลือก **`density`** → วางได้ **637/641 ชิ้น** (ดีกว่า `area` ที่ได้ 633) · ใช้พื้น 81.7% · VGM 7,510 kg
- ✅ 0 กล่องล้นตู้ · 0 กล่องซ้อนทับกัน · 0 การละเมิด maxStack · DG แยกโซนถูกต้อง
- ✅ ลำดับการโหลดถูกต้อง (ประตู FRONT → เริ่ม x=11252 ไกลประตู → จบ x=0 · ชั้นล่างก่อนชั้นบน)
- ✅ `BAMBOO` (nearDoor) ถูกวางที่ x=0 ในเขตประตู · `CHEM` (DG3 + noWall) แยกโซนท้ายตู้ เว้นผนัง
- ⚠ ยังเตือน "ตู้เอียงหน้า 68.8%" + "วางไม่ลง 4 ชิ้น" — **เป็นฟีเจอร์** (บอก planner ให้จัดสมดุล/เพิ่มตู้)

> **ข้อจำกัดสมดุลน้ำหนักที่ยังเหลือ:** skyline เติมทิศเดียว (ประตู→ท้าย) ทำให้น้ำหนักเทไปด้านที่เติมก่อน
> `planBest` ช่วยลดความเอียงได้ระดับหนึ่ง (เลือกกลยุทธ์ที่ balance ดีกว่า) แต่จะแก้ให้ ~50/50 จริง
> ต้องเปลี่ยนเป็น **bidirectional packing** (แพ็คครึ่งหน้า/ครึ่งหลังแยกกันแล้วสลับของหนัก) — งานรอบถัดไป

## แหล่งข้อมูล 2 ทาง (ตามที่ตกลง)

1. **จาก Booking** — เลือก dropdown → ดึงตู้+สรุปจาก `SFCTNLISTBOOK` (jobNo/bookRef/GW/CBM/pkgQty)
2. **กรอกเอง** — แก้ตารางสินค้าได้สด (เพิ่ม/ลบแถว, เลือก SKU, จำนวน)

> **ช่องว่างสำคัญ:** schema จริง `SFCTNLISTBOOK` เก็บแค่ **สรุประดับตู้** (GW/CBM/PKGQTY)
> **ไม่มีมิติรายชิ้น** (L×W×H ต่อ SKU) — โมดูลนี้จึงเพิ่ม layer "มิติรายชิ้น" (`cargoItems` + `skuCatalog`)
> ซึ่งเป็นข้อมูลใหม่ที่จำเป็นต่อการจัดเรียง (ดู [mapping.md](./mapping.md))

## ฟีเจอร์รอบ 2

| ฟีเจอร์ | รายละเอียด |
|---|---|
| 🧊 **3D interactive** | `view3d.js` — กล่องทึบจริง, InstancedMesh ต่อ SKU (เรนเดอร์ 600+ กล่องลื่น), OrbitControls (หมุน/ซูม/แพน), **คลิกกล่องดูรายละเอียด** (raycast → instanceId), **สไลเดอร์ตัดชั้น** มองทะลุเข้าไปข้างใน |
| 📄 **Loading Instruction** | `report.js` → `window.print()` (Save as PDF) — ไม่ต้องพึ่งไลบรารี PDF และได้ฟอนต์ไทยถูกต้อง · มี **ลำดับการโหลด** (ประตู FRONT → โหลดของท้ายตู้ก่อน, ชั้นล่างก่อนชั้นบน) |
| 💾 **บันทึกแผน** | เก็บ `localStorage['smf_ctnplan_v1']` — แผนระดับคอลัมน์ (sku/qty/x/y/z/l/w/h/weight/dg) พร้อม kpi + strategy → โครงตรงกับ `SFCTNCARGODTL` ที่เสนอใน [mapping.md](./mapping.md) |
| ⚖ **สมดุลน้ำหนัก** | `planBest()` ลอง 5 กลยุทธ์แล้วเลือกที่ balance/placement ดีสุด + แสดงตารางเทียบ |

## ขอบเขต — ทำแล้ว / รอบถัดไป

- ✅ **รอบ 1:** engine (skyline+stacking+เงื่อนไข+KPI) · ตารางสินค้าแก้ได้ · 2 แหล่งข้อมูล · 2D (บน+ข้าง) · KPI/เตือน/สมดุล
- ✅ **รอบ 2:** 3D interactive · Loading Instruction (PDF) · บันทึกแผน · `planBest()` เลือกกลยุทธ์
- ⬜ **รอบ 3 (เสนอ):** bidirectional packing (แก้สมดุลให้ ~50/50) · เขียนกลับ SQL จริง · หลายตู้ต่อ Booking (ของล้น → จัดตู้ถัดไปอัตโนมัติ) · Import Excel
