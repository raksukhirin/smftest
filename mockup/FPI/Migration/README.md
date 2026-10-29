# FPI — Database Migration

> ลำดับการติดตั้ง/อัปเกรด schema ของ FPI บน `smfdb`
> **หลักการ:** ทุกการเปลี่ยน schema ต้องผ่านไฟล์ในโฟลเดอร์นี้ · มี rollback คู่เสมอ · รันซ้ำได้ (idempotent)

---

## สถานะปัจจุบัน (ตรวจกับ DB จริง 2026-07-14)

| | |
|---|---|
| Objects `FPI_*` / `vFPI_*` ใน `smfdb` | **0 — ยังไม่เคย deploy** |
| Migration ที่ apply แล้ว | *(ยังไม่มี)* |
| Baseline ที่รอ apply | `001_baseline_fpi_v1.0` |

> **งาน Mockup 6 หน้าจอ ไม่ทำให้ schema เปลี่ยนเลย** — ทุก field ที่ใช้
> (`CreatedAtUtc`, `ConfirmedAtUtc`, `TakeLowerEnabled`, `SupersededBy`, `StdSellAmount`,
> `QuoteRevNo`, `QuoteDeltaTHB`, `MarginOverridePct`, `TolerancePP`, `FailOpenIfNoData`, `IsRebate`)
> **มีอยู่ใน `FPI_DDL_v1.0.sql` แล้วครบ** → ไม่มี migration แก้ schema จากเฟส mockup
> การเปลี่ยนแปลงในเฟสนั้นเป็น **data ของ mockup** (`../data/*.json`) ไม่ใช่ schema

---

## ลำดับการรัน

| # | ไฟล์ | ทำอะไร | สถานะ |
|---|---|---|---|
| 000 | `000_migration_log.sql` | สร้าง `FPI_MigrationLog` (ตารางบันทึกว่า migration ไหนลงแล้ว) | ✅ พร้อม |
| 001 | `001_baseline_fpi_v1.0.sql` | ติดตั้ง FPI v1.0 ทั้งชุด (8 ตาราง · 4 view · 1 proc · index · seed rule) | ✅ พร้อม |

รันตามลำดับเลข · แต่ละไฟล์ตรวจ log เองว่าเคยลงหรือยัง → **รันซ้ำไม่พัง**

```bash
# SSMS: เปิด SQLCMD Mode ก่อน (เมนู Query → SQLCMD Mode)  ← จำเป็นสำหรับ 001
# หรือ command line:
sqlcmd -S <server> -d smfdb -i 000_migration_log.sql
sqlcmd -S <server> -d smfdb -i 001_baseline_fpi_v1.0.sql
sqlcmd -S <server> -d smfdb -i _verify.sql          # ตรวจผล
```

### Rollback

```bash
sqlcmd -S <server> -d smfdb -i 001_baseline_fpi_v1.0.rollback.sql   # ลบ FPI objects ทั้งหมด (ข้อมูลหาย!)
sqlcmd -S <server> -d smfdb -i 000_migration_log.rollback.sql       # ลบตาราง log
```

---

## 🔲 Migration ที่ **ยังเขียนไม่ได้** — รอ Decision

D12 (Margin Actualization) จะต้องมี migration ของตัวเอง แต่**ยังออกแบบไม่ได้**
เพราะข้อตัดสินสำคัญยังเปิดอยู่ — เขียนตอนนี้ = เดา schema จากสิ่งที่ยังไม่ตกลง

| # (แผน) | จะทำอะไร | ติดอะไรอยู่ |
|---|---|---|
| `002_d12_book_actual` | `vFPI_BookActual` — actual margin จาก `OPTRANSDETAIL` | **สูตรอ่าน ledger** ยังไม่ได้รับ (ผู้ใช้จะให้) · เคส `THBAMT` null (เติมตอน post) ยังไม่ตัดสิน |
| `003_d12_dept_lens` | มิติแผนก (Sale / Consol) — margin เป็นฟังก์ชันของ (booking, lens) | **ยังไม่ออกแบบ** — house ผูกแผนกยังไง? นิยาม Sell/Cost by Dept ยังไม่มี |
| `004_d12_transfer_price` | ราคาโอน Consol → Sale (เก็บเป็นข้อมูล ไม่ใช่คำนวณตอนพิมพ์) | **กฎยังไม่มี** — รอแกะจาก Crystal Report · และ**ไม่มี ground truth** → ต้องมีคนเซ็นรับ ไม่ใช่ verify |

**ข้อควรรู้:** เฟส 1 ของ D12 (**82% ของ job** ที่มี booking เดียว) ต้องการแค่ `002` — ไม่ต้องรอ `003`/`004`

---

## Convention สำหรับ migration ใหม่

1. ตั้งชื่อ `NNN_snake_case.sql` + คู่ `NNN_snake_case.rollback.sql` เสมอ — copy จาก `_template.sql`
2. **ห้ามแก้ไฟล์ที่ apply ไปแล้ว** — ออกเลขใหม่เสมอ (แก้ทับ = DB คนละสถานะกับ repo)
3. **ห้ามแตะตารางของระบบเดิม** (`SFBOOK`, `OPTRANSDETAIL`, `ARINVDETAIL`, `SFHBL`, `SFJOB`, …)
   FPI เป็น **ชั้นทับ** — อ่านอย่างเดียว · สร้างเฉพาะ object prefix `FPI_` / `vFPI_`
4. ทุกไฟล์ต้อง: guard (`IF OBJECT_ID ... IS NULL`) · อยู่ใน transaction ถ้าเป็นไปได้ · บันทึกลง `FPI_MigrationLog`
5. `_verify.sql` รันได้ทุกเมื่อ — ไม่เปลี่ยนอะไร แค่รายงานสถานะ

---

## ไฟล์อ้างอิง (ไม่ใช่ migration — ห้ามแก้)

| ไฟล์ | บทบาท |
|---|---|
| `../FPI_DDL_v1.0.sql` | **Frozen** — schema ต้นฉบับ v1.0 · `001` เรียกใช้ไฟล์นี้ (single source of truth) |
| `../FPI_DDL_Rollback_v1.0.sql` | **Frozen** — rollback ต้นฉบับ · `001_...rollback.sql` เรียกใช้ |
| `../FPI_Design_v0.3_Freeze_Candidate.md` | เหตุผลของ schema |
| `../FPI_D12_MarginActualization_v0.1.md` | D12 (draft) — ที่มาของ `002`–`004` |
