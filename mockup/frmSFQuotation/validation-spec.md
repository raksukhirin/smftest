# Sea Freight Quotation — Validation Spec

อ้างอิงต้นฉบับ: `frmSFQuotation.frm`
- `Private Sub ChkValidate` — line 3575-3684 (per-field rules)
- `Private Sub ChkValidDetailCell` — line 6874-6912 (per-grid-cell rules)
- `Private Sub SaveData` — line 3700-3854 (orchestration: lock check + JOBCLASS + loop ChkValidate + loop ChkValidDetailCell)

> **ข้อสังเกตสำคัญ:** ฟอร์มต้นฉบับ **validate น้อยมาก** — ส่วนใหญ่เชื่อ master data lookup. UI ใหม่ของเราจะ implement ตามนี้เป็น default behavior, แล้วเพิ่ม optional rules ที่ recommend ภายหลัง (ส่วน §6).

---

## 1. กฎจาก `ChkValidate(Index, blnAllowBlank, blnDoSave)`

ทำงานเฉพาะบน 4 control เท่านั้น (`Select Case Index` มี 4 case):

### 1.1 `SALENO` (Sale Person code)
| เงื่อนไข | ผลลัพธ์ |
|---|---|
| `Trim(value) = ""` AND `blnAllowBlank = False` | ❌ Error: **"Sale Number cannot be blank"** / "รหัสพนักงานขายห้ามว่าง" |
| `Trim(value) <> ""` | เรียก `SeekEmpDesc(value)` → ตั้ง `SALENAME` |
| ↳ ถ้า lookup คืนค่า `""` | ❌ Error: **"Sale Number not found"** / "ไม่พบรหัสพนักงาน" |
| ↳ ถ้า lookup สำเร็จ | ✅ Pass + side-effect: `SALENAME` ถูก set |

> **Save flow:** `SaveData` เรียก `ChkValidate(cntIndex, …, , True)` — argument ที่ 4 (`blnAllowBlank`) ปล่อยว่าง = `False` (default).
> **สรุปสำหรับการ Save: `SaleNo` เป็น required field**

### 1.2 `APPBYNO` (Approve By code)
| เงื่อนไข | ผลลัพธ์ |
|---|---|
| `Trim(value) = ""` | ✅ Pass (block "cannot be blank" ถูก comment-out) — **optional** |
| `Trim(value) <> ""` | เรียก `SeekEmpDesc(value)` → ตั้ง `APPBYNAME` |
| ↳ lookup คืน `""` | ❌ Error: **"Approval Person Code not found"** / "ไม่พบรหัสผู้อนุมัติ" |
| ↳ lookup สำเร็จ | ✅ Pass + `APPBYNAME` set |

### 1.3 `CUSTNO` (Customer code)
| เงื่อนไข | ผลลัพธ์ |
|---|---|
| `Trim(value) = ""` | `CUSTNAME = ""` แล้ว ✅ Pass (block "cannot be blank" ถูก comment-out) — **optional ตาม frm** |
| `Trim(value) <> ""` | เรียก `SeekSMBusinessName(value, strWhere, …)` → ตั้ง `CUSTNAME` |
| ↳ lookup คืน `""` | ❌ Error: **"Customer Number not found"** + เผย `WHERE` clause ที่ใช้ |
| ↳ lookup สำเร็จ | ✅ Pass + side-effects (ดูข้อ 1.5) |

**`strWhere` filter logic** ขึ้นอยู่กับ environment:
| `gstrSalePersonNo` | `strWhere` |
|---|---|
| `""` | (ไม่ filter) |
| `"{SALECO}"` | `SALENO = '<current SaleNo>'` หรือ `SALENO='Blank!!!'` ถ้า SaleNo ว่าง |
| license = `"HG09072013"` หรือ `"AG06112014"` | `SALENO = '<current SaleNo>'` (ถ้า SaleNo ไม่ว่าง) |
| ปกติ + `LOCK_CUSTBYSALE=1` ใน `sf.ini` | `SALENO = '<current SaleNo>'` |

### 1.4 `AGENTNO`
| เงื่อนไข | ผลลัพธ์ |
|---|---|
| `Trim(value) = ""` | `AGENTNAME = ""` แล้ว ✅ Pass — **optional** |
| `Trim(value) <> ""` | เรียก `SeekSMBusinessName(value, …)` → ตั้ง `AGENTNAME` |
| ↳ lookup คืน `""` | ❌ Error: **"Agent Number not found"** |
| ↳ lookup สำเร็จ | ✅ Pass + side-effects (ดูข้อ 1.5) |

### 1.5 Side-effects เมื่อ lookup สำเร็จ (auto-populate ฟิลด์ที่ยังว่าง)

**สำหรับ CUSTNO:**
- `CustDesc` (ที่อยู่ memo) ← `LoadAddress(rstFind)` (ถ้าเดิมว่าง)
- `CTCNAME` ← `rstFind!CONTACT` (ถ้าเดิมว่าง)
- `TEL` ← `rstFind!TEL` (ถ้าเดิมว่าง)
- `FAX` ← `rstFind!Fax` (ถ้าเดิมว่าง)
- `EMAIL` ← `rstFind!EMAIL` (ถ้าเดิมว่าง)
- `TOTCREDIT` ← `SeekTermDesc(rstFind!CrTerm)` → จำนวนวันเครดิต (ถ้าเดิมว่าง)

**สำหรับ AGENTNO:**
- `AgentDesc` ← `LoadAddress(rstFind)` (ถ้าเดิมว่าง)

> **`LoadAddress`** ประกอบ `Address1\nAddress2\nAddress3\nAddress4\nCountry Post` (memo)

### 1.6 Field อื่น ๆ ใน `txt[]` array
**ไม่มี validation** — ผ่านทั้งหมด. Loop `For cntIndex = 0 To txt.Count - 1` ใน SaveData เรียก ChkValidate กับทุก index แต่ Select Case มีแค่ 4 case ที่ระบุข้างบน — ที่เหลือออก default branch ที่ทำให้ `blnNotValid = False` (pass).

---

## 2. กฎจาก `ChkValidDetailCell(Index, grdObject, Row, Col, value)` — grid validation

ทำงานเฉพาะ grid 2, 3, 4 (LCL/Other Charges); grid 0, 1 (FCL) ผ่านทั้งหมด:

| Grid Index | Column | กฎ | Error |
|---|---|---|---|
| 0, 1 (FCL) | — | **ไม่มี validation** | — |
| 2, 3, 4 (LCL) | `ncolExpDesc` | `Trim(value) <> ""` | **"Description cannot be blank"** / "ข้อธิบายรายการห้ามว่าง" |
| 2, 3, 4 (LCL) | `nColExpCode` | (ถูก comment-out) | — |
| 2, 3, 4 (LCL) | column อื่น | ไม่มี validation | — |

**Skip rules:**
- `RowHeight(Row) = 0` → row นี้ถูกลบ → ผ่าน
- `mblnPosted = True` → ผ่านทั้งหมด (form อยู่ในโหมด read-only หลัง post/approve)

---

## 3. กฎจาก `SaveData` (orchestration)

นอกจากเรียก ChkValidate / ChkValidDetailCell แล้ว, SaveData ยังเช็ค:

| ลำดับ | กฎ | Error message |
|---|---|---|
| 1 | **Optimistic lock** — `FormatNumber(rstMain.Lock, 15) = FormatNumber(dblLock, 15)` | `gstrLock1` / `gstrLock2` ("ข้อมูลถูกแก้โดยผู้ใช้อื่น" / "Record was modified by another user") + auto-reload + abort save |
| 2 | **JOBCLASS toggle (Cmb(0))** — `Cmb(0).ListIndex >= 0` ต้อง true | **"Job Type is invalid. Not save"** / "กรุณาเลือกประเภทงาน" |
| 3 | Loop `txt[]` → `ChkValidate(idx, …, blnDoSave=True)` | (ตามข้อ 1) |
| 4 | Loop `grdDetail[2..4]` rows → `ChkValidDetailCell` (เฉพาะ tab ที่ `SSTab1.TabVisible(n) = True`) | "Page <n+1>. Line <row> : <error>" |

> **Note บน Cmb(0):** ใน frm `Cmb(0)` คือ **dropdown IMPORT/EXPORT** (มี `ListIndex 0=IM, 1=EX`). Error message พูดว่า "Job Type" แต่จริง ๆ เช็ค **JOBCLASS**. UI ของเราใช้ปุ่ม toggle IM/EX และไม่อนุญาตให้ "ไม่เลือก" — กฎนี้จึง **N/A** (เราตั้ง default `IM`).

---

## 4. Mapping กฎจาก frm → UI ของเรา

| Field (UI) | JSON key | กฎจาก frm | บังคับใน UI ใหม่? |
|---|---|---|---|
| Doc Number | `DocNo` | (ไม่ validate ใน ChkValidate; SaveData ใช้ค้น record) | **required** (UX) — แต่ frm ไม่บังคับ ดู §6 |
| Doc Date | `DocDate` | ไม่มี | optional ตาม frm |
| Job Type (FREIGHT/…) | `JobType` | ไม่มี | optional ตาม frm |
| Class (IM/EX) | `DocClass` | **required** ผ่าน `Cmb(0).ListIndex >= 0` | **required** — UI default = `IM`, toggle เลือกได้ |
| Effective Date | `EffDate` | ไม่มี | optional ตาม frm |
| Expiry Date | `ExpDate` | ไม่มี | optional ตาม frm |
| Credit Days | `CreditDays` | auto-fill จาก customer master | optional |
| Customer code | `CustNo` | optional, ถ้า fill ต้อง lookup เจอ | optional + lookup |
| Customer name | `CustName` | auto-populate (read-only หลัง lookup) | display only หลัง lookup |
| Address | `CustDesc` | auto-populate ถ้าว่าง | optional |
| Contact | `CtcName` | auto-populate ถ้าว่าง | optional |
| Tel / Fax / Email | `Tel`/`Fax`/`Email` | auto-populate ถ้าว่าง | optional |
| Subject | `DocSubj` | ไม่มี | optional ตาม frm |
| Sale Person code | `SaleNo` | **required** (ผ่าน `blnAllowBlank=False`) | **required** ✅ |
| Sale Person name | `SaleName` | auto-populate | display only |
| Approve By code | `AppByNo` | optional, ถ้า fill ต้อง lookup เจอ | optional + lookup |
| Approve By name | `AppByName` | auto-populate | display only |
| Agent code | `AgentNo` | optional, ถ้า fill ต้อง lookup เจอ | optional + lookup |
| Agent name | `AgentName` | auto-populate | display only |
| Remark 1-4 | `DocDesc`-`DocDesc4` | ไม่มี | optional |
| Subject Notes 1-4 | `SubjDesc`-`SubjDesc4` | ไม่มี | optional |

### Grid: Freight Charges (FCL) — `freightRates[]` → SFQRATE
**ไม่มี validation ตาม frm.** ทุกฟิลด์ optional. UI ใหม่อาจอยากเพิ่ม (ดู §6).

### Grids: Detail Charges (LCL / Shipping / Transport) — AFQDETAIL EXPTYPE 2/3/4
**กฎเดียว: `ExpDesc1` ห้ามว่าง** (`ncolExpDesc`) — บังคับใช้กับทั้ง 3 grid (LCL=`localCharges[]`, Shipping=`shippingCharges[]`, Transport=`transportCharges[]`). ตรงกับ frm `ChkValidDetailCell` Index 2/3/4.

| Column | กฎจาก frm |
|---|---|
| `ExpCode` | comment-out (ไม่บังคับ) |
| `ExpDesc1` | **required** ✅ |
| `PcType` | ไม่มี |
| `ItemCurr` | ไม่มี |
| `ItemRate` | ไม่มี |
| `Uom` | ไม่มี |
| `Qty` | ไม่มี |
| `UnitPrice` | ไม่มี |
| `SrcAmt` | ไม่มี (computed) |
| `Remark` | ไม่มี |

---

## 5. Lookup error message format

frm ใช้ `SysCode(thai_msg, eng_msg, lang_flag)` ภาษาขึ้นกับ session:
- ภาษาไทย → ข้อความข้างซ้าย
- อังกฤษ → ข้อความข้างขวา

ใน UI ใหม่ผมแนะนำใช้ pattern เดียวกัน — เก็บข้อความเป็น object คู่ `{ th, en }` แล้วเลือกตาม locale.

```js
const MSG = {
    saleNoBlank:   { th: "รหัสพนักงานขายห้ามว่าง", en: "Sale Number cannot be blank" },
    saleNoNotFound:{ th: "ไม่พบรหัสพนักงาน",       en: "Sale Number not found" },
    appNoNotFound: { th: "ไม่พบรหัสผู้อนุมัติ",     en: "Approval Person Code not found" },
    custNoNotFound:{ th: "ไม่พบรหัส Customer",     en: "Customer Number not found" },
    agentNoNotFound:{ th: "ไม่พบรหัส Agent",       en: "Agent Number not found" },
    expDescBlank:  { th: "ข้อธิบายรายการห้ามว่าง",   en: "Description cannot be blank" },
    classRequired: { th: "กรุณาเลือกประเภทงาน",     en: "Job Type is invalid. Not save" },
    optimisticLock:{ th: "ข้อมูลถูกแก้โดยผู้ใช้อื่น", en: "Record was modified by another user" },
};
```

---

## 6. Open questions / กฎที่อาจอยากเพิ่ม (เกินกว่า frm)

frm ปล่อยให้ฟอร์มยืดหยุ่นมาก (เช่น save quotation ที่ไม่มี customer หรือไม่มี freight rate ก็ได้). เพื่อความถูกต้องของ data ใน UI ใหม่ ผมแนะนำให้พิจารณา:

| # | ข้อเสนอ | เหตุผล | Default ของผม |
|---|---|---|---|
| Q1 | `DocNo` required + unique | DocNo เป็น PK; ถ้าซ้ำ save ไม่ได้แน่ | **ใส่** (UX) |
| Q2 | `DocSubj` required | quotation ที่ไม่มีหัวข้อแปลก ๆ | **ไม่ใส่** (ตาม frm) |
| Q3 | `CustNo` required (ตอน save) | ใบเสนอราคาที่ไม่มีลูกค้าผิดธรรมชาติ | **ไม่ใส่** (ตาม frm) |
| Q4 | `EffDate ≤ ExpDate` | ป้องกันใส่ผิด | **ใส่** (sanity check) |
| Q5 | `CreditDays ≥ 0` | ป้องกันค่าลบ | **ใส่** |
| Q6 | Email format | สำหรับ field email | **ใส่** (HTML5 type=email) |
| Q7 | ต้องมีอย่างน้อย 1 row ใน FCL **หรือ** LCL grid | quotation ที่ไม่มี charge ไม่ make sense | **ใส่** (เลือกอันหนึ่ง) |
| Q8 | Approved/Deleted → form read-only | mirror frm `mblnPosted` flag (form lock หลัง post) | **ใส่** |
| Q9 | FCL row: `LoadPort` หรือ `FinalPort` ต้องมีอย่างน้อยอันหนึ่ง | row ที่ไม่ได้บอก loading/destination ใช้ไม่ได้จริง | **ใส่** |
| Q10 | FCL row: `XPrice > 0` | row ราคา 0 มีประโยชน์ไหม | **ไม่ใส่** (มี free-of-charge ได้) |

ข้อ Q8 (`mblnPosted`) — ใน frm flag นี้ตั้งตอนไหนยังไม่ชัดจาก code ที่อ่าน. ต้องถาม.

---

## 7. แผน implement ใน UI mockup

**Phase 1 — port กฎจาก frm 1:1** (เฉพาะที่ frm ทำจริง)
- [ ] `SaleNo`: required + lookup-validation
- [ ] `AppByNo`: lookup-validation (ถ้า fill)
- [ ] `CustNo`: lookup-validation + auto-populate side effects
- [ ] `AgentNo`: lookup-validation + auto-populate AgentDesc
- [ ] LCL / Shipping / Transport grid: `ExpDesc1` required ทุก row, ทุก grid (mirror frm grid 2/3/4)
- [ ] Optimistic lock check (`q.lock` = stored)

**Phase 2 — กฎเสริมที่ recommend ตาม §6** (ขึ้นกับคำตอบ user)
- [ ] (Q1, Q4, Q5, Q6, Q7, Q8, Q9 ตามที่ user เลือก)

**UX:**
- ใช้ Toast แสดง error ทีละข้อ + เน้น border ฟิลด์เป็น red ถ้า invalid
- Group error ทั้งหมดเป็น modal "Validation failed — กรุณาแก้ไข" (เลียนแบบ frm `frmSYShowErr`) เมื่อ Save
- บล็อก Save จนกว่ากฎทั้งหมดจะผ่าน
- Lookup buttons (`⌕`): จำลอง lookup ด้วย mock dataset (จะเพิ่มในไฟล์ data.json) — กดแล้ว resolve code → name + auto-populate ตาม side effects

**Mock master data ที่ต้องเพิ่มใน `data.json`:**
- `salesPeople[]` — { SaleNo, SaleName }
- `approvers[]` — { AppByNo, AppByName }
- `customers[]` — { CustNo, CustName, Address, Contact, Tel, Fax, Email, CrTerm }
- `agents[]` — { AgentNo, AgentName, Address }

ใช้แทน `SeekEmpDesc` / `SeekSMBusinessName` ใน frm.
