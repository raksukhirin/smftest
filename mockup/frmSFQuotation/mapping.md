# Sea Freight Quotation — UI ↔ DB Field Mapping

อ้างอิง: `mockup/frmSFQuotation/index.html` ↔ `data.json` ↔ `frmSFQuotation.frm`
(`Sub UpdateData` line 3232, `Sub UpdateDetail` lines 3329 (FCL) / 3430 (LCL))

Save 1 ครั้งเขียน **3 ตาราง** ใน transaction เดียว:

1. **AFQHEAD** — header (1 row, key = `DOCNO`)
2. **SFQRATE** — FCL freight rates (`EXPTYPE=1`)
3. **AFQDETAIL** — detail charges, แยกด้วย `EXPTYPE`:
   - `EXPTYPE=2` → LCL / Other Charges → JSON `localCharges[]`
   - `EXPTYPE=3` → Shipping Charges → JSON `shippingCharges[]`
   - `EXPTYPE=4` → Transport Charges → JSON `transportCharges[]`

**`JOBCLASS`** = `'IM'` (Import) | `'EX'` (Export). **`DOCSTAT`** = `'Open'` | `'Approved'` | `'Deleted'`.

---

## 1. Banner & Document Info

| UI | JSON key | AFQHEAD column | Notes |
|---|---|---|---|
| Doc Number | `DocNo` | `DOCNO` (PK) | format `QS<I/E><YYMM><NNNN>` |
| (toggle IM/EX) | `DocClass` | `JOBCLASS` | drives doc number prefix + report variant |
| (constant) | `DocType` = `"Q"` | `DocType` | "Q" = Quotation |
| Job Type | `JobType` | `JOBType` | FREIGHT / LOGISTICS / CUSTOMS |
| Status | `DocStat` | `DOCSTAT` | Open / Approved / Deleted |
| Doc Date | `DocDate` | `DOCDATE` | |
| Ref No | `RefNo` | `REFNO` | external reference |
| Revision | `RevNo` | `REVNO` | revision counter |
| Effective Date | `EffDate` | `EFFDATE` | |
| Expiry Date | `ExpDate` | `EXPDATE` | |
| Credit Days | `CreditDays` | (no dedicated col) | derived/stored as part of credit terms |
| (audit) | `lock` | `Lock` | optimistic lock token |

---

## 2. Customer

| UI | JSON key | AFQHEAD column |
|---|---|---|
| Customer code | `CustNo` | `CUSTNO` |
| Customer name | `CustName` | `CUSTNAME` |
| Address | `CustDesc` | `CUSTDESC` (memo) |
| Contact To | `CtcName` | `CTCNAME` |
| Tel | `Tel` | `TEL` |
| Fax | `Fax` | `FAX` |
| Email | `Email` | `EMAIL` |
| From | `FromName` | (stored within document workflow — may map to a custom column or letterhead `FROM` field) |
| Subject | `DocSubj` | `DOCSUBJ` |
| Incoterm | `Incoterm` | `INCOTERM` |

---

## 3. Sales & Approval

| UI | JSON key | AFQHEAD column |
|---|---|---|
| Issued By | `IssueBy` | `ISSUEBY` |
| User Group | `UserGroup` | (session/user dim) |
| Sale By code | `SaleNo` | `SALENO` |
| Sale By name | `SaleName` | `SALENAME` |
| Approve By code | `AppByNo` | `APPBYNO` |
| Approve By name | `AppByName` | `APPBYNAME` |
| (set on approve) | `AppDate` | `APPDATE` |
| (set on approve) | `AppBy` | `APPBY` |
| Total Credit Limit | `TotCredit` | `TOTCREDIT` |
| Credit Approved ☑ | `IsCreditApp` | `ISCREDITAPP` |
| Credit Approved Date | `CreditAppDate` | `CREDITAPPDATE` |
| (auto) | `CreditAppBy` | `CREDITAPPBY` |

---

## 4. Other Info — Remarks (image #3)

| UI label | JSON key | AFQHEAD column |
|---|---|---|
| Remark 1 | `DocDesc` | `DOCDESC` (memo) — shown at top of printed remarks |
| Remark 2 | `DocDesc2` | `DOCDESC2` (memo) |
| Remark 3 | `DocDesc3` | `DOCDESC3` (memo) |
| Remark 4 | `DocDesc4` | `DOCDESC4` (memo) |

---

## 5. Other Info — Subject Notes (legacy memo)

field `SUBJDESC*` ใน AFQHEAD เป็น free-text memo. ใน UI ใหม่แสดงในการ์ด **"Subject Notes (legacy)"** ใต้ Other Info tab (ไม่ใช่ใน Shipping / Transport tabs อีกต่อไป — สอง tab นั้นกลายเป็น detail grid ดูข้อ 8).

| UI | JSON key | AFQHEAD column |
|---|---|---|
| Shipping Notes | `SubjDesc` | `SUBJDESC` |
| Special Instructions | `SubjDesc2` | `SUBJDESC2` |
| Transport Notes | `SubjDesc3` | `SUBJDESC3` |
| Routing Notes | `SubjDesc4` | `SUBJDESC4` |

---

## 6. Agent & Other

| UI | JSON key | AFQHEAD column |
|---|---|---|
| Agent code | `AgentNo` | `AGENTNO` |
| Agent name | `AgentName` | `AGENTNAME` |
| Agent Notes | `AgentDesc` | `AGENTDESC` |

---

## 7. Freight Charges (FCL) — `freightRates[]` → SFQRATE

Layout ตาม legacy `frmSFQuotation.frm` `Sub ReloadDetail` — grid แสดงทุก SFQRATE row ของ doc แบบ flat (ไม่ group). บางแถวมี port info เต็ม (route header), บางแถวมีแต่ item/charge (THC, BLFEE ฯลฯ) — UI ไม่ตัดสินใจให้.

> **Note**: คอลัมน์ rate ทั้งหมดเป็น `VARCHAR(80)` ใน SFQRATE → รับค่าตัวอักษรได้ (เช่น `XLCL='FREE'`, `TRANSIT='20-24'`). UI ใช้ `<input type="text">` ไม่ใช่ number.

| UI column (visible) | JSON key | SFQRATE column |
|---|---|---|
| Port of Loading | `LoadPort` | `LOADPORT` |
| Code (Loading) | `LoadPortCode` | `LOADPORTCODE` |
| Port of Discharge | `DisPort` | `DISPORT` |
| Port of Tranship | `TranPort` | `TRANPORT` |
| Final Destination | `FinalPort` | `FINALPORT` |
| Code (Destination) | `FinalPortCode` | `FINALPORTCODE` |
| Item | `ExpCode` | `EXPCODE` |
| Description | `ExpDesc` | `EXPDESC` |
| Curr | `ItemCurr` | `ITEMCURR` |
| Unit | `Uom` | `UOM` |
| Unit Price | `XPrice` | `XPRICE` |
| Cont. Type | `XCtnType` | `XCTNTYPE` |
| Total 20' | `XCtn20` | `XCTN20` |
| Total 40' | `XCtn40` | `XCTN40` |
| Total 40'H | `XCtn40HC` | `XCTN40HC` |
| Total 45' | `XCtn45` | `XCTN45` |
| Total LCL | `XLcl` | `XLCL` |
| Dep. | `Dept` | `DEPT` |
| Arr. | `Arrv` | `ARRV` |
| T/T Time | `Transit` | `TRANSIT` |
| ETD | `Etd` | `ETD` |

**Carried but not in visible grid** (kept on save, surfaced elsewhere):
| JSON key | SFQRATE column | Note |
|---|---|---|
| `RecPort` | `RECPORT` | hidden — route through port |
| `LinerNo` / `LinerName` | `LINERNO` / `LINERNAME` | carrier — shown in print/agent panel |
| `AgentNo` / `AgentName` | `AGENTNO` / `AGENTNAME` | per-route agent override |
| `Remark` | `REMARK` | row note |
| `RateId` | `RATEID` | master rate reference |
| `SeqNo` | `SEQNO` | auto-incremented on save |
| `DETID` | `DETID` (+ `DOCNO`, `EXPTYPE`, `JOBCLASS`) | row PK |

---

## 8. Detail Charges (LCL / Shipping / Transport) — AFQDETAIL

ทั้งสาม grid ใช้คอลัมน์ AFQDETAIL ชุดเดียวกัน ต่างกันแค่ `EXPTYPE`:

| Grid (UI tab) | JSON array | EXPTYPE |
|---|---|---|
| Other Charges (LCL) | `localCharges[]` | 2 |
| Shipping | `shippingCharges[]` | 3 |
| Transport | `transportCharges[]` | 4 |

Validation rule (ทั้งสาม grid): `ExpDesc1` ห้ามว่าง — mirror frm `ChkValidDetailCell` Index 2/3/4.

| UI column | JSON key | AFQDETAIL column |
|---|---|---|
| Code | `ExpCode` | `EXPCODE` |
| Description | `ExpDesc1` | `EXPDESC1` |
| (line 2) | `ExpDesc2` | `EXPDESC2` |
| P/C | `PcType` | `PCTYPE` (CC=Collect, PP=Prepaid) |
| Currency | `ItemCurr` | `ITEMCURR` |
| Exchange Rate | `ItemRate` | `ITEMRATE` |
| (text version) | `ItemTextRate` | `ITEMTEXTRATE` |
| Unit | `Uom` | `UOM` |
| Qty | `Qty` | `QTY` |
| Unit Price | `UnitPrice` | `UNITPRICE` |
| Total Amount | `SrcAmt` | `SRCAMT` (computed = Qty × UnitPrice) |
| Remark | `Remark` | (column `REMARK` — likely on AFQDETAIL too) |
| (auto) | `SeqNo` | `SEQNO` |
| (auto) | `DETID` | `DETID`, plus `DOCNO`, `EXPTYPE` (2/3/4 ตาม array), `SUB_SYSNAME='SF'`, `JOBCLASS` |

---

## 9. Save flow

```
BEGIN TRAN
  -- 1. Header
  UPSERT AFQHEAD WHERE DOCNO=?
    SET ...all 60+ columns...

  -- 2. FCL detail (EXPTYPE=1)
  DELETE SFQRATE WHERE DOCNO=? AND EXPTYPE=1 AND DETID NOT IN (...kept ids)
  UPSERT each row

  -- 3. Detail (EXPTYPE 2/3/4 — LCL / Shipping / Transport)
  DELETE AFQDETAIL WHERE DOCNO=? AND EXPTYPE IN (2,3,4) AND DETID NOT IN (...kept ids)
  UPSERT each row with appropriate EXPTYPE, computing SRCAMT = QTY * UNITPRICE
COMMIT
```

`AFQHEAD.Lock` (datetime/float) ใช้เป็น optimistic lock — เหมือน SFJob.

---

## 10. Approve / Un-Approve

```
-- Approve
UPDATE AFQHEAD
   SET DOCSTAT  = 'Approved',
       APPDATE  = NOW(),
       APPBY    = :user_id,
       Lock     = :new_lock
 WHERE DOCNO = :doc

-- Un-Approve (revert)
UPDATE AFQHEAD
   SET DOCSTAT  = 'Open',
       APPDATE  = NULL,
       APPBY    = NULL,
       Lock     = :new_lock
 WHERE DOCNO = :doc
```

UI: ปุ่ม `✓ Approve` ↔ `↺ Un-Approve` toggle อยู่ใน sticky footer; disabled ถ้า `DocStat='Deleted'`.

---

## 11. Document numbering

`SFOption` table มีฟิลด์ `SFQLEN`, `SFQPRE`, `SFQNUM`, `SFQRUN` คุม pattern. ใน mockup ผมจำลองด้วย:

```js
DocNo = 'QS' + (DocClass==='IM'?'I':'E') + YYMM + NNNN
```

ตัวอย่าง: `QSI26050008` = Q + S(SF) + I(Import) + 26 + 05 + 0008.

---

## 12. Print preview

`print.html` รับ query `?doc=<DocNo>` → อ่านจาก `localStorage` (`sf_quotation_v1`) — ถ้าไม่มี fallback อ่าน `data.json` — แล้ว layout ตาม Crystal report เดิม:

- Letterhead (จาก `data.json/_company`)
- Title สลับ "IMPORT/EXPORT" ตาม `DocClass`
- TO/ATTN/TEL/FAX/E-Mail/Incoterm/Re ↔ ฝั่งซ้าย; REF.NO/Date/Effective/Expiry/Credit ↔ ฝั่งขวา
- OCEAN FREIGHT CHARGE table (จาก `freightRates[]`)
- LOCAL CHARGES table (จาก `localCharges[]`)
- 4 REMARK บล็อค (DocDesc/2/3/4)
- Signature blocks: Quoted by (`SaleName`) · Approved by (`AppByName`) · Customer Acceptance
- Watermark "APPROVED" / "DELETED" สำหรับสถานะที่ไม่ใช่ Open
