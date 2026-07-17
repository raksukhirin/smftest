# mapping.md — Field ใน mockup ↔ Schema จริง (`smfdb`)

เฟส mockup ใช้ JSON ใน `data.js` — ตั้งชื่อ camelCase ให้ map กับ DDL ได้ 1:1 ตอนต่อ SQL
(แนวเดียวกับ FPI) เอกสารนี้บอกว่าอะไร "มีอยู่จริง" อะไร "เป็น layer ใหม่ที่ต้องเพิ่ม"

## 1) ตรวจแล้วจาก schema จริง (ผ่าน MCP `smfdb`)

### `SFCTNSIZE` — master ISO code ของตู้
| คอลัมน์จริง | ชนิด | หมายเหตุ |
|---|---|---|
| PMKEY | int | PK |
| ISOCODE | varchar | เช่น `22G1`, `45G1` |
| DESCRIPTION | varchar | คำอธิบาย |
| LOCK | float | |

> ⚠ **ไม่มีมิติภายใน** (L/W/H) และไม่มี tare/payload — mockup เก็บค่ามาตรฐานไว้ใน
> `data.js > containerTypes` (`innerLmm/innerWmm/innerHmm/tareKg/maxPayloadKg`) โยงด้วย `isoCode`
> → ถ้าจะทำจริง ควรเพิ่มคอลัมน์มิติใน `SFCTNSIZE` หรือสร้างตารางเสริม

### `SFCTNLISTBOOK` — รายการตู้ต่อ Booking
| คอลัมน์จริง | ชนิด | map → `data.js` (bookings[].containers[]) |
|---|---|---|
| JOBNO | varchar | `jobNo` |
| BOOKREF | varchar | `bookRef` |
| CONTID | int | `contId` |
| GW | decimal | `gwKg` — น้ำหนักรวม (สรุปตู้) |
| CBM | decimal | `cbm` — ปริมาตรรวม (สรุปตู้) |
| PKGUNIT | varchar | `pkgUnit` |
| PKGQTY | decimal | `pkgQty` — จำนวนหีบห่อรวม |
| TEMPMKEY | varchar | (ยังไม่ใช้) |

## 2) Layer ใหม่ที่โมดูลนี้เพิ่ม (ยังไม่มีในระบบ)

`SFCTNLISTBOOK` เก็บแค่ **สรุประดับตู้** — ไม่มีมิติรายชิ้น จึงจัดเรียงไม่ได้
โมดูลนี้เพิ่ม 2 ส่วน (เฟสจริงควรทำเป็นตารางใหม่):

### `skuCatalog` → เสนอตาราง `SFCARGOSKU` (master มิติสินค้า)
`sku, Lmm, Wmm, Hmm, weightKg, stackable, maxStack, allowRotate, noWall, nearDoor, dgClass`

### `cargoItems` → เสนอตาราง `SFCTNCARGODTL` (รายการชิ้นต่อ Booking/ตู้)
`bookRef, contId, sku, qty` (+ ผลลัพธ์แผน: `layer/x/y/z/l/w/h` ถ้าจะบันทึกแผน)

## 3) Settings → เสนอ `SFCTNPLANCFG` (หรือ config ราย Booking)
`allowRotate, heightBucketMm, wallClearanceMm, doorZoneMm, doorAt, topFill`

## 4) เส้นทางต่อของจริง (รอบถัดไป)

```
เลือก Booking → ดึง SFCTNLISTBOOK (ตู้+สรุป)
             → ผู้ใช้กรอก/นำเข้า มิติรายชิ้น (SFCTNCARGODTL + SFCARGOSKU)
             → CTNPacker.plan()
             → แสดง 2D/3D + KPI
             → [รอบ 2] บันทึกแผนกลับ (placement ต่อชิ้น) + ออก Loading Instruction PDF
```
