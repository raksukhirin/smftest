# `<frmYourForm>` — UI ↔ DB Field Mapping

> **TODO:** กรอกตามฟอร์มจริง.

อ้างอิง: `<frmYourForm>.frm`
- `Sub UpdateData` — line NNN-NNN
- `Sub UpdateDataXxx` — line NNN-NNN (detail tables)

Save 1 ครั้งเขียน **<N>** ตาราง: `MainTable` (header) + `DetailTableA` + `DetailTableB`.

---

## 1. Banner / Document Info

| UI label | JSON key | MainTable column | Notes |
|---|---|---|---|
| Doc Number | `DocNo` | `DOCNO` (PK) | format `XXXyyyymmdd-NNN` |
| Date | `DocDate` | `DOCDATE` | |
| Status | `DocStat` | `DOCSTAT` | Open / Approved / Deleted |
| (audit) | `lock` | `Lock` | optimistic lock token |

---

## 2. <Section A>

| UI | JSON key | Column | Notes |
|---|---|---|---|

---

## 3. <Section B>

---

## N. Detail rows — `details[]` → `DetailTableA`

| UI column | JSON key | Column |
|---|---|---|
| Description | `Description` | `DESC` |
| Qty | `Qty` | `QTY` |
| Price | `Price` | `PRICE` |
| (auto) | `DETID` | `DETID`, plus `DOCNO`, `SEQNO` |

---

## N+1. Save flow

```sql
BEGIN TRAN
  -- Header
  UPSERT MainTable WHERE DOCNO = ?

  -- Detail (diff sync)
  DELETE DetailTableA WHERE DOCNO = ? AND DETID NOT IN (...kept ids)
  UPSERT each row, set SEQNO, Lock = NOW
COMMIT
```

ใช้ `MainTable.Lock` (datetime/float) เป็น optimistic lock.

---

## Quirks ⚠

> TODO: ถ้ามี label ใน UI ที่ตรงกับ column ไม่ตรงกันใส่ตรงนี้.

- _ตัวอย่าง: ใน frmSFJob "Closing Date" จริง ๆ คือ column `LOADDATE`._
- _ตัวอย่าง: ใน frmSFJob `JOBOWNER` คือ "Sold By" dropdown._
