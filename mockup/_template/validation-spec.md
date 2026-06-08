# `<frmYourForm>` — Validation Spec

> **TODO:** อ่าน `Sub ChkValidate` + `Sub ChkValidDetailCell` + `Sub SaveData` ของ frm แล้วเขียนกฎทั้งหมดที่นี่.

อ้างอิง: `<frmYourForm>.frm`
- `Private Sub ChkValidate` — line NNN-NNN (per-field rules)
- `Private Sub ChkValidDetailCell` — line NNN-NNN (per-grid-cell rules)
- `Private Sub SaveData` — line NNN-NNN (orchestration)

---

## 1. กฎจาก `ChkValidate(Index, blnAllowBlank, blnDoSave)`

ทำงานเฉพาะ Index ต่อไปนี้ (`Select Case Index`):

### 1.1 `<FIELD_NAME>`
| เงื่อนไข | ผลลัพธ์ |
|---|---|
| `Trim(value) = ""` AND `blnAllowBlank = False` | ❌ Error: **"<message>"** |
| `Trim(value) <> ""` | เรียก lookup → ตั้ง `<DEPENDENT_FIELD>` |
| ↳ ถ้า lookup คืนค่า `""` | ❌ Error: **"<not found>"** |
| ↳ ถ้า lookup สำเร็จ | ✅ Pass + side-effect |

### 1.2 ...

### 1.x Field อื่น ๆ
**ไม่มี validation** — pass ทั้งหมด.

---

## 2. กฎจาก `ChkValidDetailCell(Index, grdObject, Row, Col, value)`

| Grid Index | Column | กฎ | Error |
|---|---|---|---|
| 0 (FCL/...) | — | (ไม่มี / มี) | — |
| 1 (LCL/...) | `<colXxx>` | `Trim(value) <> ""` | **"<message>"** |

**Skip rules:**
- `RowHeight(Row) = 0` → row ถูกลบ → ผ่าน
- `mblnPosted = True` → ผ่านทั้งหมด (read-only mode)

---

## 3. กฎจาก `SaveData` (orchestration)

| ลำดับ | กฎ | Error message |
|---|---|---|
| 1 | **Optimistic lock** — `rstMain.Lock = dblLock` | "Record was modified by another user" |
| 2 | `Cmb(0).ListIndex >= 0` | "<message>" |
| 3 | Loop `txt[]` → `ChkValidate(idx, ..., blnDoSave=True)` | (ตามข้อ 1) |
| 4 | Loop grid rows → `ChkValidDetailCell` (เฉพาะ tab visible) | "Page N. Line R : <error>" |

---

## 4. Mapping → UI ใหม่

| Field (UI) | JSON key | กฎจาก frm | บังคับใน UI ใหม่? |
|---|---|---|---|
| Doc Number | `DocNo` | (ไม่ validate) | **required** (UX) |
| ... | ... | ... | ... |

---

## 5. Error messages (bilingual)

```js
const MSG = {
    fooBlank:    { th: '<TH>', en: '<EN>' },
    fooNotFound: { th: '<TH>', en: '<EN>' },
    // ...
};
```

---

## 6. Open questions / กฎที่อาจอยากเพิ่ม

| # | ข้อเสนอ | เหตุผล | Default |
|---|---|---|---|
| Q1 | `DocNo` required + unique | PK | **ใส่** |
| Q2 | Date relationship checks | sanity | ขึ้นกับ business |
| Q3 | At least 1 row required | quotation must have charges | ขึ้นกับ business |
| Q4 | Approved → read-only | mirror frm `mblnPosted` | **ใส่** |

---

## 7. แผน implement

**Phase 1 — port กฎจาก frm 1:1**
- [ ] Field-level rules (จาก ChkValidate)
- [ ] Grid-level rules (จาก ChkValidDetailCell)
- [ ] Optimistic lock check

**Phase 2 — กฎเสริม**
- [ ] Required ที่ frm ไม่บังคับแต่ business ต้องการ
- [ ] Date sanity (eg. EffDate ≤ ExpDate)
- [ ] Read-only mode สำหรับ status ที่ปิด
