# FPI — Legacy Object Map (v1.1 — DRAFT for review)

> **วัตถุประสงค์:** ตารางเดียวที่ mapping `legacy object → หน้าที่เดิม → FPI ใช้/แทนที่ตรงไหน → Decision ที่เกี่ยว`
> ใช้เป็น Layer 4 (Legacy reference) ของ Project Knowledge — แหล่งความจริงเรื่อง "ของเดิมทำยังไง"
> **สถานะ:** Draft — Operations objects ยืนยันแล้ว / Financial objects รอยืนยันชื่อตารางในเฟสหน้า
>
> **v1.1 `[2026-07-17]`** — อ่าน ER diagram + ฟอร์ม Job จริงจากผู้ใช้ · ตรวจโครงสร้างกับ DB:
> §1.1 **ลดสถานะเป็นสมมติฐาน** · `TOTBL` แก้ความหมาย · เพิ่ม join key #6 · เพิ่ม `CSJOB`/`MASTERNO` · เพิ่มกับดัก `SFHBL_M`

> ### 🚫 กฎการใช้ `SMF_DEMO` `[ผู้ใช้กำหนด 2026-07-17]`
>
> MCP connection ต่อ DB ชื่อ **`SMF_DEMO`** ไม่ใช่ production `smfdb` — และ job `SE17050002` ที่ไฟล์นี้
> อ้างว่า "verified live job" **อยู่ใน `SMF_DEMO`** → การ verify ทั้งหมดในไฟล์นี้ (รวม **parallel run 108/108**
> ของ D3) ทำบน **demo database**
>
> **ผู้ใช้ระบุ: "SMF_DEMO ไม่ได้เน้นความสมบูรณ์" → ห้ามสรุปสถิติจาก DB นี้ · ดูได้เฉพาะ job ที่ระบุเจาะจง**
>
> | | |
> |---|---|
> | ✅ **ใช้ได้** | **โครงสร้าง** — คีย์ join, ความหมายคอลัมน์, cardinality, object มีอยู่/ถูก encrypt ไหม |
> | ❌ **ใช้ไม่ได้** | **สัดส่วน / % / การกระจาย / ความถี่ของ edge case** → ต้องวัดบน **production** เท่านั้น |
>
> หลักฐานว่าเป็นข้อมูล seed: golden job `SE17050002` มี CBM ราย house = **10 / 20 / 30 / 40 / 50** พอดีเป๊ะ (รวม 150)
>
> **แหล่งที่ดีกว่า demo:** ฟอร์ม VB6 จริงของผู้ใช้ (เช่น *Outbound Master Job*) — บอกพฤติกรรมระบบได้ตรงกว่า
> การนับแถวใน demo (§1.2 เกิดจากฟอร์ม ไม่ใช่จาก SQL)

---

## 1. Entity Relationship (Operations → Financial)

```
Quotation ─1:N─> Booking ─1:N─> House (SFHBL) ─N:1─> Job (SFJOB) ─1:1─> CSJOB (พิธีการศุลกากร)
                                     │
                                     │ HBLREF                (key #4)
                                     ▼
                              OPTRANSDETAIL  ── REFINVDETID ──> ARINVDETAIL ── INVNO ──> ARINVHEAD
                              (ledger ปฏิบัติการ)   (key #6)      (AR+AP รวมกัน)
                               ▲ D12 อ่านที่นี่                    ▲ D12 §3 ตัดสินว่า "ไม่ join"

Job มี 2 แบบ:
  1) No-House / Direct : Job:House = 1:1
  2) Console / Multi   : Job:House = 1:N
DOCTYPE ใน SFHBL: 'Allocated' = แถว master/ตัวแบก cost (1 ต่อ job) · 'Direct' = house bill จริง (0..N)
ต้นทุนจริงไหล: AP post ที่ Job (MBL) → เกาะแถว 'Allocated' ใน SFHBL; 1 Booking มีได้หลาย House
```

**⚠ `SFJOB` ลิงก์เข้า `SFHBL` สองเส้น คนละคีย์ — จุดที่พลาดง่ายที่สุดในสคีมานี้:**

```
                 ┌── DOCNO = JOBNO ──▶ SFHBL (แถว DOCTYPE='Allocated' · 1 แถว)   ← key #1
        SFJOB ───┤
                 └── JOBNO = JOBNO ──▶ SFHBL (แถว DOCTYPE='Direct'   · 0..N แถว) ← key #2
```

> ใน ER diagram ของ SSMS เส้นสองเส้นนี้จะโผล่เป็น `SFHBL` **สองกล่อง** (กล่องที่สองมักถูกตั้งชื่อ `SFHBL_M`)
> — **เป็นตารางเดียวกัน** ลากเข้ามาสองอินสแตนซ์เพื่อโชว์สองบทบาท ไม่ใช่ตารางแยก
> `[ยืนยัน 2026-07-17: sys.objects ทั้ง DB ไม่มี object ชื่อ SFHBL_M]`

> **หมายเหตุ:** DB นี้ **ไม่มี FOREIGN KEY constraint เลยสักตัว** ในกลุ่มตารางนี้ (`sys.foreign_keys` = 0 แถว)
> → ความสัมพันธ์ทั้งหมดบังคับใช้ที่ชั้นแอป (VB6) ไม่ใช่ที่ DB · เส้นใน ER diagram มาจากเครื่องมือ model ไม่ใช่ FK จริง
> → **นัย:** ห้ามสมมติ referential integrity — D12 ต้อง handle orphan/mismatch เอง (เช่น `TOTBL` ที่ไม่ตรงจำนวน house จริง 4 ใบ)

| ความสัมพันธ์ | Cardinality | หมายเหตุ |
|---|---|---|
| Quotation : Booking | 1 : N | 1 ใบเสนอราคาครอบหลาย booking ตลอด Validity (ตรงกับ **D2**) |
| Booking : House (`SFHBL`) | 1 : N | `[แก้ 2026-07-14 — verified SE17050002]` 1 booking มีได้หลาย house (booking `BSE17050004` → 6 house: 1 master `Allocated` + 5 `Direct`) |
| Job : House (`SFHBL`) | 1:1 หรือ 1:N | No-House/Direct = 1:1 / Console = 1:N (นับรวมแถว master `DOCTYPE='Allocated'`) |
| Booking : Job | N : 1 | หลาย booking รวมเป็น 1 Job (ผ่านชั้น House) |
| Cost/Sell line : House (`OPTRANSDETAIL`) | N : 1 | `HBLREF=SFHBL.DOCNO`; `TRANSTYPE`=Bill(sell)/Cost |
| AR invoice line : House (`ARINVDETAIL`) | N : 1 | `SUBJOBNO=SFHBL.DOCNO` — roll up เป็น booking ด้วย `BOOKREF` |
| Job : CSJOB | 1 : 1 | `[ใหม่ 2026-07-17]` `CSJOB.JOBNO = SFJOB.JOBNO` — งานพิธีการศุลกากรของ job นั้น |

**Join keys (verified 2026-07-14 · job `SE17050002` — ตรวจซ้ำทั้งตาราง 2026-07-17):**

| # | ความสัมพันธ์ | Card. | Join key | หมายเหตุ |
|---|---|---|---|---|
| 1 | Allocated-House : Job | 1:1 | `SFHBL.DOCNO = SFJOB.JOBNO` (แถว master, DOCNO=JOBNO) | **1 แถวต่อ job** |
| 2 | Direct-House : Job | N:1 | `SFHBL.JOBNO = SFJOB.JOBNO` | 0..N แถวต่อ job |
| 3 | House : Booking | N:1 | `SFHBL.BOOKREF = SFBOOK.DOCNO` | **แถว master ก็ถือ `BOOKREF`** — แต่มีเงื่อนไข ดู §1.2 |
| 4 | Cost/Sell line : House | N:1 | `OPTRANSDETAIL.HBLREF = SFHBL.DOCNO` | grain = 1 charge ต่อ 1 house |
| 5 | AR/AP invoice line : House | N:1 | `ARINVDETAIL.SUBJOBNO = SFHBL.DOCNO` | — |
| 6 | **Ledger line : AR/AP line** `[ใหม่]` | N:1 | `OPTRANSDETAIL.REFINVDETID = ARINVDETAIL.DETID` | **D12 §3 ตัดสินว่าไม่ใช้คีย์นี้** · null = บรรทัดที่ยังไม่ post |
| 7 | **AR/AP line : Head** `[ใหม่]` | N:1 | `ARINVDETAIL.INVNO = ARINVHEAD.INVNO` | AR+AP แยกด้วย `SRCTYPE` |
| 8 | **CSJOB : Job** `[ใหม่]` | 1:1 | `CSJOB.JOBNO = SFJOB.JOBNO` | ดู §2 — อาจกระทบ scope |

> **นัยของ key #6 ต่อ D12 §3:** คีย์นี้คือทางที่ D12 **เลือกไม่เดิน** — ถ้า D12 `COALESCE` ไปยอด posted
> ตามที่เคยเสนอ ยอด actual ของบรรทัดที่ยังไม่ post จะ**ขยับเองเมื่อบัญชี post** โดยไม่มีใครแก้อะไร
> → ตรงกับเหตุผล "ค่าต้องนิ่ง" ใน D12 §3 พอดี
> 🔲 *มีบรรทัดที่ยังไม่ post สัดส่วนเท่าไหร่ → วัดบน production*

**Margin Actualization (D12) — ที่มา actual (verified):**
- **Cost/Sell จริงผูกถึง house** ผ่าน `OPTRANSDETAIL.HBLREF` (`TRANSTYPE`: `Bill`=sell / `Cost`=cost) → อ่าน actual ต่อ house ได้ตรง แล้ว roll up เป็น booking ด้วย `BOOKREF`
- **AR/AP อยู่ตารางเดียวกัน** `ARINVHEAD`/`ARINVDETAIL` แยกด้วย `SRCTYPE` (AR/AP), detail ผูก house `SUBJOBNO=SFHBL.DOCNO` → actual revenue (AR) + cost (AP) ต่อ house อ่านได้ตรง
- **master-level item เกาะแถว `Allocated`** (DOCNO=JOBNO) → ส่วนเดียวที่ต้อง allocate · **กฎการเฉลี่ยยังเป็นสมมติฐาน** (§1.1)
  · **และจำเป็นเฉพาะ job ที่มีหลาย booking** (§1.2)
- `ALLOCAMT` (SFHBL) พบ **null** + master item เป็น line ใน `OPTRANSDETAIL` → **ไม่ persist**
  → compute สด (หรือ **ไม่เคยเฉลี่ยเลย** — ดู §1.1)
- `SF_BOOK_PROFIT2` ใช้ cost ที่กรอกใน booking (**estimated**) → **D3 + 108/108 = estimated ไม่กระทบ** / **D12 = actual** จากข้างต้น

### 1.0 ราคาโอนภายใน (Com Rate / Com Price) `[ใหม่ 2026-07-22]`

ช่องที่ผู้ใช้กรอกในฟอร์ม *Outbound Master Job* → tab `3. Revenue and Cost`
เพื่อกำหนด **ราคาที่ Consol ขายให้ Sale** — ตัวเลขนี้ไปโผล่เป็นรายได้/ต้นทุนของ Sale Dept ในรายงานกำไร

| ช่องในฟอร์ม | คอลัมน์ `OPTRANSDETAIL` | บทบาท |
|---|---|---|
| `Com Exc. Rate` | `SALERATE` · `SALETEXTRATE` (ข้อความ) | อัตราแลกเปลี่ยนของราคาโอน · **`SALETEXTRATE` เป็นตัวแยก 3 สถานะ** |
| `Com Unit Price` | `SALEPRICE` | ราคาต่อหน่วยที่โอนให้ Sale |
| ☑/☐ หน้าแถว (`Adjust (y/n)`) | ติ๊กออก → `SALETEXTRATE = '0'` | "ไม่ให้" — ตัดบรรทัดออกจากฝั่ง Sale และจากการเฉลี่ย |

**3 สถานะของ `SALETEXTRATE`:** ว่าง = ยังไม่ตั้ง (ใช้ยอด invoice) · ตัวเลข = ใช้ราคาโอน · `'0'` = ไม่ให้

> 🔐 **จำกัดสิทธิ์ — ผู้มีอำนาจเท่านั้นที่เห็นและกรอกตัวเลขได้** `[ผู้ใช้ยืนยัน 2026-07-22]`
> → FPI ต้องเคารพ gate เดียวกัน · **ห้ามเปิด Com Price ผ่านหน้าจอ explainability**
>
> ⚠ **คุมทีละบรรทัด ไม่มีสวิตช์ระดับ job/house** → ปิดบางบรรทัดได้และระบบเดิมไม่เตือน
> รายละเอียดสูตร: [`FPI_D12_MarginActualization_v0.1.md`](./FPI_D12_MarginActualization_v0.1.md) §4 กลไก ③

### 1.1 Cost Allocation Model — Console/Multi Job  `[✅ ยืนยันแล้ว 2026-07-22 — เจอสูตรใน Crystal Report]`

> **สรุปล่าสุด:** สูตรการเฉลี่ยมีอยู่จริงใน `tools/SFDPFJOB01_CONSOL.rpt`
> (`xBillRevThb_Alloc` / `xVchrThb_Alloc`) และ mockup คำนวณตามสูตรได้ **ตรงรายงานจริง 6/6 ช่อง**
> ที่หาไม่เจอตลอดมาเพราะ **มองผิดที่** — allocation ไม่ persist เพราะ **คำนวณตอนพิมพ์รายงาน**
> ไม่ใช่ stored proc และไม่เกี่ยวกับ `fxnHBL` ที่ถูก encrypt
>
> ⚠ **แต่ basis ที่เคยเขียนไว้ผิด** — ไม่ได้เฉลี่ยตาม `UOM` โดยตรง · ของจริงคือคอลัมน์
> **`OPTRANSDETAIL.ALLOCBY`** (`CBM`/`KGS`/`SHP`/`D/O`) และใช้ `UOM` เป็น *fallback* เมื่อ `ALLOCBY` ว่าง:
> `Left(UOM,2)="KG"→KGS · Left(UOM,3)="CBM"→CBM · Left(UOM,2)="M3"→CBM · **Else→SHP**`
>
> ผู้ควบคุมว่าบรรทัดไหน "ให้เฉลี่ย" คือ **`SALETEXTRATE` (ราคาที่ Consol ขายให้ Sale)** —
> `'0'` = ขายให้ 0 → ไม่เฉลี่ย · คุม **ทีละบรรทัด** ไม่มีสวิตช์ระดับ job
>
> รายละเอียดเต็ม: [`FPI_D12_MarginActualization_v0.1.md`](./FPI_D12_MarginActualization_v0.1.md) §4

> **ทำไมถึงลดสถานะ:** v1.0 ป้ายหัวข้อนี้ว่า `[ยืนยันแล้ว 2026-07-14]` และบรรทัดสุดท้ายเขียนว่า
> "reverse-engineer routine allocation เดิม" — **แต่ไม่เคยมีใครเห็น routine นั้น** ขณะที่
> `FPI_D12_MarginActualization_v0.1.md` §4 ระบุตรงกันข้ามว่ากฎนี้ยังไม่ยืนยัน → **สองไฟล์ขัดกันเอง**
> ไฟล์นี้จึงยอมตามฉบับที่อนุรักษ์นิยมกว่า (ดู `FPI_D12...` §8 ข้อ 7 — Decision ยังเปิด)

**สิ่งที่ยืนยันจริง ✅ vs สิ่งที่อนุมาน 🔲:**

| | สถานะ | หลักฐาน |
|---|---|---|
| มีแถว `DOCTYPE='Allocated'` ถือยอดระดับ master | ✅ **ยืนยัน** | `DOCNO=JOBNO` · 1 แถวต่อ job · เห็นในฟอร์ม (`Doc Type = Allocated`) |
| ยอด master เป็น line ใน `OPTRANSDETAIL` ไม่ persist | ✅ **ยืนยัน** | `ALLOCAMT` null · master item เป็น line ใน ledger |
| **ระบบเดิมเฉลี่ยยอดนั้นลง house** | ✅ **ยืนยัน `[2026-07-22]`** | สูตรอยู่ใน `SFDPFJOB01_CONSOL.rpt` · เทียบรายงานจริงตรง 6/6 |
| basis = `ALLOCBY` (UOM เป็น fallback) | ✅ **ยืนยัน** | `{@cAllocBy}` ใน .rpt — พิสูจน์แล้วบน path `SHP` และ `CBM` · `KGS`/`D/O` ยังไม่มีใบตัวอย่าง |

> ~~เป็นไปได้ว่าระบบเดิมไม่เคยเฉลี่ยเลย~~ **ตกไป `[2026-07-22]`** — เฉลี่ยจริง มีสูตรรองรับ
> → ตารางด้านล่างจึงเป็น **สูตรที่ reverse-engineer มา ไม่ใช่กฎใหม่ที่ต้อง sign-off**

เมื่อ cost เกิดที่ระดับ **Master (MBL)** (เช่นค่าระวางที่ carrier บิลทั้งตู้):
1. AP บันทึกเป็น line ใน House table ด้วย `DOCTYPE = 'Allocated'` = **ยอด master ที่ยังไม่กระจาย** ✅
2. ✅ **(สูตรของระบบเดิม)** เฉลี่ยลง House จริง ตาม **`ALLOCBY` ของ charge นั้น** (ว่าง → เดาจาก `UOM`):

| Charge (ตัวอย่าง) | UOM/Basis | น้ำหนักเฉลี่ย (weight) |
|---|---|---|
| FRT (freight) | `CBM` | master × (CBM ของ house / CBM รวม) |
| B/L | `SET` | master × (จำนวน SET ของ house / SET รวม) |
| ค่าต่อ shipment | `SHIP` | หารเท่าทุก house = master ÷ **จำนวน Direct house จริง** (ดูด้านล่าง) |

**`SFJOB.TOTBL` — แก้ความหมาย + เสนอเลิกใช้ `[2026-07-17]`**

- ✅ **ความหมายที่ถูก:** `TOTBL` = จำนวน **Direct house เท่านั้น** — **ไม่นับแถว master**
  (`SE17050002`: TOTBL=5, Direct=5, +1 `Allocated` = 6 แถวใน `SFHBL`) · v1.0 เขียนกำกวมว่า "จำนวน House ในงาน"
- ⚠ **เสนอไม่ใช้เป็นตัวหาร** → ใช้ `COUNT(SFHBL WHERE JOBNO=? AND DOCTYPE='Direct')` แทน

> **เหตุผลเชิงโครงสร้าง:** `TOTBL` เป็น counter ที่ denormalize ไว้ และ **DB นี้ไม่มี FK/constraint บังคับให้ตรง
> กับจำนวนแถวจริง** → ไม่ตรงได้โดยไม่มีอะไรจับ · ขณะที่สิ่งที่สูตรต้องการคือ "จำนวน house ที่มีอยู่ให้เฉลี่ยลง"
> ซึ่ง COUNT ตอบตรงและ**มีค่าเสมอ**
>
> **ข้อโต้แย้งที่ต้องเคลียร์:** `TOTBL` อาจตั้งใจหมายถึง *"จำนวน B/L ที่วางแผนไว้"* ไม่ใช่ *"ที่สร้างจริง"*
> — ถ้าใช่ สองตัวนี้ตอบคนละคำถาม ต้องเลือกโดยรู้ตัว
>
> 🔲 **`TOTBL` ไม่ตรง/ว่าง บ่อยแค่ไหน → วัดบน production**

- **ตัวหาร CBM** — `SE17050002`: master CBM = **150** = Σ Direct (10+20+30+40+50)
  → `SUM(house)` กับ CBM ของแถว `Allocated` ให้ผลเท่ากัน (ปิดข้อ §4(b) **เชิงโครงสร้าง**)
  ⚠ *แต่ค่า 10/20/30/40/50 คือข้อมูล seed — ไม่ใช่หลักฐานว่าของจริงก็ตรงกัน*
- **No-House:** job ที่ไม่มีแถว `Direct` เลย → ยอดค้างบนแถว `Allocated` ซึ่ง map 1:1 กับ job อยู่แล้ว
  → **ไม่ต้องเฉลี่ย ไม่ใช่ "เฉลี่ยแบบ trivial"** ตามที่ v1.0 เขียน (ไม่มี house ปลายทางให้ลง)
- `DOCTYPE='Allocated'` = **แถว master ถือ line ระดับ master** (เป็น cost หรือ revenue ก็ได้ — ใน `SE17050002` เป็น Bill/REV 12,934.58); `Direct` = house จริง

**นัยต่อ D12:** actual cost ต่อ booking = *(cost ตรงของ house)* ✅ + *(ส่วนแบ่งจากยอด `'Allocated'`)* 🔲
UOM/Basis ตรงกับ dimension **"Basis"** ที่ FPI model ไว้แล้วใน `rate_charges` → **ไม่ต้องคิด basis ใหม่ แต่ก็ไม่ใช่การ reverse-engineer ของเดิม** (ไม่มีของเดิมให้ reverse) — เป็นการ**เลือกใช้ basis ของ FPI มาเติมช่องว่าง** ต้อง sign-off

> **⚠ ขอบเขตที่แคบกว่าที่เคยเข้าใจ (ดู §1.2):** การเฉลี่ยจำเป็นต่อ margin **ระดับ booking**
> **เฉพาะเมื่อ job มีหลาย booking** เท่านั้น — ถ้า job มี booking เดียว เงินทั้ง job เป็นของ booking นั้นอยู่แล้ว

---

### 1.2 `SFHBL.BOOKREF` — กฎที่ระบบเดิมใช้จริง  `[จากฟอร์ม Job จริง 2026-07-17]`

**ที่มา:** ฟอร์ม *Outbound Master Job* (`SE17050002`) แท็บ **2. Booking and HB/L** — คอลัมน์ `Booking Ref#`
คือ `SFHBL.BOOKREF` → `SFBOOK.DOCNO` ตรง ๆ

**สิ่งที่ฟอร์มเปิดเผย — แถว master ก็ถือ `BOOKREF`:**

```
B/L Ref #      Booking Ref#     Doc Type
SE17050002  →  BSE17050004      Allocated   ← แถว master ก็มี BOOKREF!
BLE17050003 →  BSE17050004      Direct
BLE17050004 →  BSE17050004      Direct
BLE17050005 →  BSE17050004      Direct       (job นี้มี booking เดียว)
BLE17050006 →  BSE17050004      Direct
BLE17050007 →  BSE17050004      Direct
```

**กฎที่อนุมานได้ 🔲 (ควรยืนยันกับฝ่ายธุรกิจ):**

**ข้อเท็จจริงจาก `SE17050002` (job เดียวที่ได้รับอนุญาตให้ดู):**

| แถว | `SFHBL.BOOKREF` |
|---|---|
| `Allocated` (master) | **ค่าว่าง** |
| `Direct` ทั้ง 5 | `BSE17050004` |

> ~~ตารางเดิมที่นี่สรุปว่า `BOOKREF` ของ master ขึ้นกับจำนวน booking ของ job~~
> **ถอนออก `[2026-07-22]`** — ข้อสรุปนั้นได้มาจากการอ่าน job อื่นที่ไม่ได้รับอนุญาต
> ตามกติกา `SMF_DEMO` · **ห้ามเก็บไว้เป็นสมมติฐาน**
>
> สิ่งที่พูดได้จากหลักฐานที่มี: **กฎ roll-up อิง `BOOKREF` ของแถว master ไม่ได้**
>
> **กฎ roll-up ที่เสนอ — แยกตามจำนวน booking ของ job:**
>
> | job มี booking | ทำอะไร | ต้องเฉลี่ยไหม |
> |---|---|---|
> | **1 ใบ** | Σ ทั้ง job → booking นั้น | ❌ ไม่ต้อง |
> | **≥2 ใบ** | เฉลี่ย master ลง Direct ตาม UOM → roll up ด้วย `BOOKREF` ของ house | ✅ **ต้อง — กฎที่ต้อง sign-off** |
> | **0 ใบ** | ไม่มี actual ระดับ booking | — |

🔲 **สัดส่วน job ที่มีหลาย booking → ต้องวัดบน production** — เป็นตัวกำหนดว่ากฎเฉลี่ยมีเดิมพันแค่ไหน
🔲 **`BOOKREF` ของ master ในเคสอื่น ๆ → ต้องได้ job ตัวอย่างที่ได้รับอนุญาตก่อน**

---

## 2. Operations Objects (ยืนยันแล้ว)

| Object | ชนิด | หน้าที่เดิม | FPI ใช้/แทนที่ตรงไหน | D# |
|---|---|---|---|---|
| `SFRATE` | Table | เก็บเรทค่าระวางเรือ (Sea) | แหล่งข้อมูล Rate KB ฝั่ง Sea | D6 |
| `AFRATED` | Table | เรทค่าระวางอากาศ ระดับ detail (weight break) | แหล่งข้อมูล Rate KB ฝั่ง Air; ตรรกะ weight-break สร้างใหม่ | D7 |
| `AFQHEAD` / `AFQDETAIL` | Table | หัว/รายละเอียดใบเสนอราคา Air | อ้างอิงโครงสร้าง Quotation | D2 |
| `OPITEM` | Table | Master รายการค่าใช้จ่าย (`subSysName`+`jobClass`+`expCode`) | กระดูกสันหลังมิติ Charge → seed เข้า `FPI_ChargePolicy` (329 รายการ) | D4, D5 |
| `SMITEM` | Table | ผูกรายการเข้าบัญชี GL | GL linkage ผ่าน chain `OPITEM → SMITEM` | D4 |
| `OPTRANSDETAIL` | Table | Cost/Sell ledger ต่อ house (`HBLREF=SFHBL.DOCNO`); `TRANSTYPE`=Bill/Cost, `ITEMTYPE`=ADV/REV/COS, `THBAMT`×`DOCBAL`(sign หัก CN), `UOM`/`QTY` | ประวัติ → `vFPI_LaneHistory` (D11) + **actual (operational) ของ D12** | D11, D12 |
| `SFBOOK` | Table | Booking ค่าระวางเรือ | Entity Booking; `REFQTNO` ไม่เก็บ rev number → เก็บ `quoteRevNo` ใน `BookingRateRef` | D1, D10 |
| `SFHBL` | Table | House B/L (HBL), **N:1 กับ Booking**; `DOCTYPE`: `Direct`=house จริง / `Allocated`=แถว master; คอลัมน์สำคัญ `ALLOCAMT`(null),`CBM`,`REVTON`,**`BOOKREF`** (ดู §1.2) | **ชั้น allocation ของ D12** (ดู §1.1) | D11, D12 |
| `SFJOB` | Table | Job = ระดับ consolidation/MBL (มิติ Lane/Carrier/Agent); `TOTBL` = จำนวน **Direct** house (ไม่นับ master); `MASTERNO` = **เลข MBL ของสายเรือ — ไม่ใช่ join key** (ไม่ match `SFHBL.DOCNO`, หลาย job ใช้ซ้ำได้) | Join มิติ; จุด AP post → เกาะแถว `Allocated`; **เสนอเลิกใช้ `TOTBL` เป็นตัวหาร** → COUNT แทน (§1.1) | D11 |
| `CSJOB` | Table | `[ใหม่ 2026-07-17]` งาน**พิธีการศุลกากร** ต่อ job — `JOBNO` 1:1 กับ `SFJOB`; มีชุดค่าใช้จ่ายของตัวเอง `FRTCHG`/`DUTYCHG`/`VATCHG`/`GUARANCHG`/`INSURCHG`/`OTHCHG` + `REFHBL`/`REFBOOK` | 🔲 **ยังไม่ตัดสิน** — ค่าเหล่านี้อยู่นอก `OPTRANSDETAIL` → ถ้าเป็นรายได้/ต้นทุนจริง **D12 จะมองไม่เห็น** (ดู §4 ข้อ 5) | 🔲 |
| `SMHBL` | Table | House B/L ฝั่งโมดูล SM — ว่าง | ไม่ใช้ | — |
| `SFHBL_COPY` | Table | สำเนา/เศษงาน | ไม่ใช้ | — |
| `fxnHBL` | Inline TVF | ชื่อเข้าเค้าว่าเกี่ยวกับ HBL — **encrypted เปิดดูไม่ได้** (`sys.sql_modules.definition` = null) | 🔲 **ผู้ต้องสงสัยอันดับ 1** ว่าเป็น routine allocation ที่หาไม่เจอ (§1.1) — ต้องเปิดจากซอร์ส VB6/สคริปต์ติดตั้ง | 🔲 |
| `SF_BOOK_PROFIT2` | View (encrypted) | คำนวณกำไร booking (Sold/Cost/KB) | **Oracle สำหรับ Parallel Run** — `vFPI_BookProfit` ต้องตรง (Round 0: 108/108) | D3 |
| `frmSFBooking.frm` | VB6 Form | หน้าจอ Booking + ตรรกะคำนวณ Margin | แหล่งที่ reverse-engineer สูตร Margin ออกมา | D3 |
| `mdlAccFunc.bas` | VB6 Module | ฟังก์ชันบัญชี/แปลงค่าเงิน | แหล่งตรรกะ FX ต่อบรรทัด (DocRate/ItemRate) | D3 |
| `SeekIATARate` | VB6 Function | Lookup air weight-break (มี **bug**) | ระบุ bug แล้ว → แทนด้วย take-lower logic | D7 |

**Field ที่จงใจตัดออกจากชั้น History (บันทึกไว้กันสับสน):**
- `SALEPRICE` / `SALERATE` / `SALEAMT` / `SALEADJ` → ชุดคำนวณค่าคอมมิชชั่น Sales (ผูก Feature `COM`) ไม่ใช่ราคาซื้อขายจริง
- `PLRATE` / `PLAMT` → Agent-view metrics ไม่ใช่ราคาฐาน
- ✅ **ยืนยันชื่อตาราง:** House table = `SFHBL` (ตรวจจาก `INFORMATION_SCHEMA`, 2026-07-14)

---

## 3. Financial Objects (รอยืนยัน — เฟสหน้า D12)

> `[ยืนยันชื่อจาก DB 2026-07-14]` invoice/GL/CB detail ผูก house ผ่าน `SUBJOBNO = SFHBL.DOCNO`
> **AR และ AP อยู่ตารางเดียวกัน** `ARINVHEAD`/`ARINVDETAIL` แยกด้วย `SRCTYPE` (AR / AP)

| บทบาท | Module | หน้าที่ | join / หมายเหตุ | ชื่อตาราง |
|---|---|---|---|---|
| AR Invoice | AR | ใบแจ้งหนี้ลูกค้า (confirmed revenue) | `SRCTYPE='AR'`; `SUBJOBNO=SFHBL.DOCNO` | ✅ `ARINVHEAD` / `ARINVDETAIL` |
| AP Invoice | AP | ต้นทุน vendor/agent/carrier (confirmed cost) | **`SRCTYPE='AP'` ในตารางเดียวกับ AR**; `SUBJOBNO=SFHBL.DOCNO` | ✅ `ARINVHEAD` / `ARINVDETAIL` |
| GL Entry | GL | รายการ post บัญชีแยกประเภท | `SUBJOBNO`=house; ชั้น reconciliation สุดท้าย | ✅ `GLDETAIL` / `GL_ACC_DETAIL` |
| Cash/Bank | CB | รับ/จ่ายเงินจริง (สถานะชำระ) | `SUBJOBNO`=house; น่าจะนอก scope margin | ✅ `CBDETAIL` / `CB_SUBDETHEAD` |

---

## 4. Open Questions (ต้องเคลียร์ก่อนเริ่ม D12)

1. `[แก้สถานะ 2026-07-17 — v1.0 ปิดข้อนี้เร็วเกินไป]` **AP เกาะแถว `Allocated` ใน `SFHBL`** ✅ แต่ **กฎการเฉลี่ยยังไม่จบ**
     - (a) ✅ ชื่อตาราง = `SFHBL` (ยืนยันแล้วจาก DB) · **ไม่มี `SFHBL_M`** (ที่เห็นใน ER diagram = `SFHBL` อินสแตนซ์ที่สอง)
     - (b) ✅ CBM/น้ำหนักต่อ house = `SFHBL.CBM`/`REVTON`; total = `SUM(house)` **หรือ**แถว `Allocated` → **ให้ผลเท่ากัน** (ยืนยัน `SE17050002`)
     - (c) ✅ `ALLOCAMT` null + master item เป็น line ใน `OPTRANSDETAIL` → **ไม่ persist**
     - (d) 🔲 **ยังหาไม่เจอ** — proc/query ที่รัน allocation จริง · ผู้ต้องสงสัย = `fxnHBL` (encrypted)
       **→ จนกว่าจะเจอ ต้องถือว่า "ระบบเดิมอาจไม่เคยเฉลี่ยเลย" เป็นความเป็นไปได้ที่ยังไม่ถูกตัดออก**
     - (e) 🔲 **ใหม่:** ตัวหาร `SHIP` — เสนอใช้ `COUNT(Direct)` แทน `SFJOB.TOTBL` (§1.1) — **ต้องรับรอง**
     - (f) 🔲 **ใหม่:** กฎเฉลี่ยจำเป็น **เฉพาะ job ที่มีหลาย booking** (§1.2) — สัดส่วนเท่าไหร่ **ต้องวัดบน production**
2. `[ตอบแล้ว §3]` Financial: ✅ `ARINVHEAD/DETAIL` (AR+AP แยกด้วย `SRCTYPE`, join `INVNO`), `GLDETAIL`, `CBDETAIL`
   · ⚠ ~~verified `SE17050002`: AR 22,277.24 / AP 12,962~~ **สองตัวเลขนี้ reproduce ไม่ได้ `[2026-07-22]`**
   — query ซ้ำบน job เดียวกันได้คนละยอด · ไม่รู้ว่านิยาม/ตัวกรองตอนนั้นคืออะไร
   → **ห้ามใช้อ้างอิงจนกว่าจะมี query ที่เขียนไว้ชัด** (ตัวเลขที่ยืนยันแล้วคือชุดใน Profit Summary — ดู D12 §10)
   - `[เพิ่ม 2026-07-17]` ทางเชื่อม ledger→invoice = `OPTRANSDETAIL.REFINVDETID` (key #6) — **D12 §3 เลือกไม่เดิน**
3. `[ตกไปจาก D12 · ยังค้างในฐานะงาน reconciliation]` **Posting logic:** `mdlAccFunc.bas` post จาก Operations → Financial อย่างไร
   — D12 §3 ตัดสินไม่แตะ financial แล้ว จึงไม่ใช่เงื่อนไขของ D12 อีกต่อไป
4. `[ตอบแล้ว — D12 §7]` **CB in scope?** → **ไม่อยู่ใน scope** · actual margin หยุดที่ ledger ปฏิบัติการ
5. 🔲 **ใหม่ 2026-07-17 — `CSJOB` อยู่ใน scope margin ไหม?**
   งานพิธีการศุลกากรมีชุดค่าใช้จ่ายของตัวเอง (`DUTYCHG`/`VATCHG`/`GUARANCHG`/`FRTCHG`/...) **นอก `OPTRANSDETAIL`**
   → ถ้ารายการเหล่านี้เป็นรายได้/ต้นทุนจริงของงาน **D12 จะมองไม่เห็นทั้งก้อน**
   → ถ้าเป็นแค่ยอดสำแดง/เงินทดรอง (disbursement ที่ผ่านไปหาลูกค้า) ก็อยู่นอก scope ถูกแล้ว
   **ต้องถามฝ่ายธุรกิจ — ยังไม่ตัดสิน**

---

## 5. หมายเหตุการใช้ไฟล์

- ไฟล์นี้เป็น **reference** ไม่ใช่ design authority — เหตุผลเต็มของแต่ละ Decision อยู่ใน `FPI_Design_v0.3_Freeze_Candidate.md`
- เมื่อเริ่มเฟส Financial ให้ยืนยัน §3 + ตอบ §4 ก่อน แล้วค่อยบันทึกเป็น Decision ใหม่ (D12+) ตามธรรมเนียม D-number
- เวอร์ชันไฟล์อยู่ในชื่อ (`v1.0`) — อย่าแก้ทับ ให้ออก `v1.1` เมื่อเติม Financial objects
