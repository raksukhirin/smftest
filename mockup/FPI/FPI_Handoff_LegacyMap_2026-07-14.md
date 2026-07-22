# FPI — Handoff → Claude Code (2026-07-14)

> สรุป session ที่ verify โครง Legacy กับ live `smfdb` (job `SE17050002`) เพื่อทำ `FPI_Legacy_Map.md`
> เนื้อหาเต็ม = ไฟล์ `FPI_Legacy_Map.md` (ดาวน์โหลดจากแชทแล้ว) — เอกสารนี้คือ **บริบท + งานต่อ**

---

## งานให้ Claude Code ทำ

1. วางไฟล์ `FPI_Legacy_Map.md` ลง `mockup/FPI/` (Layer 4 ของ Project Knowledge)
2. อัปเดต `mockup/FPI/CLAUDE.md`:
   - เพิ่ม `FPI_Legacy_Map.md` ในผังไฟล์ (Layer 4 — Legacy reference)
   - บันทึกสถานะ: join map operations↔financial verified แล้ว
3. (ถ้าจะเดินต่อ) เริ่ม D12 — ดูหัวข้อ "งานที่เปิดอยู่" ด้านล่าง

---

## Join map ที่ verify แล้ว (หัวใจของ D12)

| # | ความสัมพันธ์ | Card. | Join key |
|---|---|---|---|
| 1 | Allocated-House : Job | 1:1 | `SFHBL.DOCNO = SFJOB.JOBNO` (แถว master, DOCNO=JOBNO) |
| 2 | Direct-House : Job | N:1 | `SFHBL.JOBNO = SFJOB.JOBNO` |
| 3 | Booking : House | 1:N | `SFHBL.BOOKREF = SFBOOK.DOCNO` |
| 4 | Cost/Sell line : House | N:1 | `OPTRANSDETAIL.HBLREF = SFHBL.DOCNO` |
| 5 | AR/AP invoice line : House | N:1 | `ARINVDETAIL.SUBJOBNO = SFHBL.DOCNO` (header/detail join ด้วย `INVNO`) |

**Entity chain:** `Quotation ─1:N─ Booking ─1:N─ House(SFHBL) ─N:1─ Job(SFJOB)`

---

## Facts ที่ยืนยันจาก DB

- **`SFHBL`** (House B/L) — `DOCTYPE`: `Allocated` = แถว master (1 ต่อ job, ถือ line ระดับ master รอเฉลี่ย) · `Direct` = house bill จริง
- **`OPTRANSDETAIL`** (operational cost/sell ledger) — `TRANSTYPE` = `Bill`(sell)/`Cost` · `ITEMTYPE` = `ADV`/`REV`/`COS` · ยอด = `THBAMT × DOCBAL` (DOCBAL คือ sign หัก CN) · มี `HBLREF`, `UOM`, `QTY`
- **`ARINVHEAD`/`ARINVDETAIL`** — **AR และ AP อยู่ตารางเดียวกัน แยกด้วย `SRCTYPE` (AR/AP)** · join `INVNO` · detail ผูก house `SUBJOBNO=SFHBL.DOCNO` · ยอด `THBAMT`
- **Financial ทั้งชุด:** AR/AP = `ARINVHEAD/DETAIL` · GL = `GLDETAIL`/`GL_ACC_DETAIL` · CB = `CBDETAIL`/`CB_SUBDETHEAD` (ทั้งหมดผูก house ผ่าน `SUBJOBNO`)
- **Allocation (Console/Multi):** master item บนแถว `Allocated` เฉลี่ยลง direct house ตาม UOM — FRT→`CBM`, B/L→`SET`, per-SHIP→`÷ SFJOB.TOTBL` · qty ต่อ house = `SFHBL.CBM`/`REVTON` · **`SFHBL.ALLOCAMT` มีคอลัมน์แต่ null ใน job นี้ → เฉลี่ย compute สด ไม่ persist**

**ตัวเลข verified (`SE17050002`):**
- `SFHBL` 6 แถว = 1 `Allocated` (master, DOCNO=SE17050002) + 5 `Direct` (BLE17050003–07) — ทั้งหมด `BOOKREF=BSE17050004` (1 booking)
- `OPTRANSDETAIL` 19 บรรทัด: BLE17050003 → Bill/ADV 1,200 + Bill/REV 3,091.16 + Cost/COS 9,141.50 · Allocated → Bill/REV 12,934.58 · (direct อีก 4 house ว่าง, CBM=0)
- `ARINVDETAIL`: AR 8 inv/12 lines = **22,277.24** · AP 5 inv/13 lines = **12,962**

---

## ⚠️ แก้จากความเข้าใจเดิม (DB override — ระวังอย่าถอยกลับ)

1. ชื่อตาราง House = **`SFHBL`** (ไม่ใช่ SFBHL)
2. **Booking : House = 1:N** (ไม่ใช่ 1:1) — booking เดียวมีได้หลาย house
3. **AP อยู่ใน `ARINVHEAD` แยกด้วย `SRCTYPE='AP'`** (ไม่ใช่ OPTRANSDETAIL, ไม่มี APINV แยก)

---

## งานที่เปิดอยู่ (สำหรับ D12 — Margin Actualization)

1. **เลือกแหล่ง "actual" ให้ชัด** — มี 2 ชั้นและ **ตัวเลขไม่ตรงกัน**:
   - `OPTRANSDETAIL` (operational): sell รวม ~17,225.74 · cost 9,141.50
   - `ARINVDETAIL` (invoiced, SRCTYPE): AR 22,277.24 · AP 12,962
   - → ต้องตัดสินว่าอันไหนคือ "confirmed actual" ของ D12 (operational ledger vs เอกสาร invoice ที่ออกจริง) และเข้าใจว่าทำไมต่าง (ADV handling / timing / รายการที่บิลเพิ่ม) — **เป็น design decision ของ D12**
2. **(d)** หา stored proc / VB6 routine ที่รัน allocation จริง (ตัวที่ฟอร์ม Job ใช้ sync ยอดกลับ booking) — ยังต้องขุด `frmSFBooking.frm` / proc
3. รอ **summary เพิ่มเติมจาก SMFDeveloper** (แจ้งว่าจะสรุปเอง)

**Recipe D12 (ร่าง):**
```
actual ต่อ house  = เลือกจาก OPTRANSDETAIL(HBLREF) หรือ ARINVDETAIL(SUBJOBNO)
                    แยก cost/sell ด้วย TRANSTYPE หรือ SRCTYPE
master item (Allocated) → เฉลี่ยลง direct house ตาม CBM
roll up เป็น booking ด้วย BOOKREF
เทียบกับ estimated (SF_BOOK_PROFIT2 = cost ที่กรอกใน booking) → margin actualization
```

---

## หลักการที่ต้องคงไว้

- Legacy Map เป็น **reference** ไม่ใช่ design authority — เหตุผลเต็มอยู่ `FPI_Design_v0.3_Freeze_Candidate.md`
- D3 + parallel run 108/108 เป็นฝั่ง **estimated** — D12 (actual) **ไม่แตะ** ของเดิม เพิ่มชั้นใหม่
- verify กับ live `smfdb` ก่อน finalize ทุก design decision (archaeology first)
- version ในชื่อไฟล์ — อย่าแก้ทับ frozen artifact
