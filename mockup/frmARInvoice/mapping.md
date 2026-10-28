# Outbound Billing Entry — UI ↔ DB Field Mapping

อ้างอิง: `mockup/frmARInvoice/index.html` ↔ `data.json` ↔ `frmARInvoice.frm`
(`Sub SaveData` line 8147 · `Sub UpdateHead` line 7510 · `Sub UpdateDetail` line 8729 · `Sub UpdateAROption` line 7794)

ฟอร์มเดียวรองรับหลาย sub-system / DocType / AR+AP. mockup นี้ตั้งค่า fix ที่
**`SRCTYPE='AR'`, `SUB_SYSNAME='SF'`, `JOBCLASS='EX'`** (= Outbound Billing, Sea Freight Export).

Save 1 ครั้งเขียน **3 ตาราง** ใน transaction เดียว (verify กับ `smfdb` แล้ว):

1. **ARINVHEAD** — header (93 คอลัมน์) · PK = `BATCHID + ENTRYNO`, business key = `INVNO`
2. **ARINVDETAIL** — บรรทัดรายการ (51 คอลัมน์) · PK = `DETID`, ลำดับ `DETLINE`
3. **ARINVREM** — คำอธิบาย / ที่อยู่ใบกำกับ / ข้อมูล W/T (1 row/doc)

ตารางที่เกี่ยวข้องแต่ mockup ไม่เขียน: `ARINVBAT` (book/batch + ยอดรวม), `ARINVDET2` (บรรทัดคำอธิบายเงิน), `GLHEAD/GLDETAIL/GLTAX` (ลง G/L ตอน Post).

> **`DOCTYPE`** = `IN` Invoice · `CN` Credit Note · `DN` Debit Note · `AI` Advance Invoice · `FI` Free Invoice
> **`DOCBAL`** = `+1` ปกติ · `-1` สำหรับ Credit Note
> **`DOCSTAT`** = `Open` → `Confirm` → `Approved` → `Paid` (/ `Canceled`)
> **`POSTENTRY`** = `0` Not Post · `1` Ready · `2` Posted · `3` Canceled

---

## 1. Banner & Book / Document

| UI | JSON key | ARINVHEAD column | Notes |
|---|---|---|---|
| Book No | `BookNo` | `BATCHID` | book ของ batch (ARINVBAT.BATCHID) |
| (book description) | `Descrip` | `ARINVBAT.DESCRIP` | อยู่บน batch ไม่ใช่ head |
| Entry No | `EntryNo` | `ENTRYNO` (int) | ลำดับใน book — PK ส่วนที่สอง |
| Doc. No. | `InvNo` | `INVNO` (varchar 20) | business key + เลขใบแจ้งหนี้ |
| Doc. Type | `DocType` | `DOCTYPE` (varchar 2) | IN/CN/DN/AI/FI |
| (derived) | `DocBal` | `DOCBAL` (int) | +1 / -1 ตาม DocType |
| Status | `DocStat` | `DOCSTAT` (varchar 20) | |
| (posting) | `PostEntry` | `POSTENTRY` (int) | 0/1/2/3 |
| Checked | `Checked` | `CHECKJOB` (varchar 1) | '✓' flag + `CHECKBY`/`CHECKDATE` |
| (const) | `SrcType` | `SRCTYPE` = `'AR'` | |
| (const) | `SubSysName` | `SUB_SYSNAME` = `'SF'` | |
| (const) | `JobClass` | `JOBCLASS` = `'EX'` | |
| (audit) | `Lock` | `LOCK` (float) | optimistic lock token |
| (audit) | `EditBy` / `EditDate` | `EDITBY` / `EDITDATE` | |

---

## 2. Customer & references (Pg.1 General)

| UI | JSON key | ARINVHEAD column | Notes |
|---|---|---|---|
| Customer code | `CustCode` | `CUSTCODE` | lookup → SMBusiness |
| Customer name | `CustName` | (จาก SMBusiness.BizName) | display + เก็บใน ARINVREM.INVNAME |
| Cust. Group | `CustGroup` | (drives `LOCOVER`) | Local→`LOCOVER=2` · Oversea→`1` |
| Job Ref # | `JobNo` | `JOBNO` | job ของ SF |
| HB/L Ref # | `HblRef` | `REFDOCNO` *(หรือ SUBJOBNO)* | อ้างอิง House B/L |
| Job Group | `JobGroup` | `JOBGROUP` | |
| Refer. Inv | `RefInvNo` | `REFINVNO` | ใบอ้างอิง (CN/DN) + `REFTRANSID` |
| Ref. C/Q # | `RefCQ` | `REFDOCNO` | อ้างอิงใบเสร็จ/quotation (RV…) |
| Sale Person / **Req By** | `SaleCode` / `SaleName` | `SALECODE` (AR) / `REQBY`+`REQBYNAME` (AP) | ช่องเดียวกัน — AP relabel เป็น "Req By" + save คนละคอลัมน์ (frm line 7626-7632, 11497) |
| **ใบเบิกจากวงเงิน** (AP only) | `ReqNo` | `REQNO` | Pg.4 dropdown จาก **`CSREQH`** — filter `DocStat IN ('Paid','Cleared') AND JOBNO=<job> AND REQNO NOT IN (ใบที่ใช้แล้ว)` (frm line 12920). ตอน Approve/Post → update `CSREQH.DocStat 'Paid'→'Cleared'` |

> **`CSREQH`** = ใบเบิกเงินทดรอง/เบิกจากวงเงิน · key `REQNO` (`RQ<E/I><YYMM><NNNN>`) · `FUNDCODE`/`FUNDNAME` = วงเงิน · `REQBY`/`REQBYNAME` = ผู้เบิก · `REQAMT`. mockup masters: `masters.requisitions[]`.

---

## 3. Dates / currency / term (Pg.1 General)

| UI | JSON key | ARINVHEAD column |
|---|---|---|
| Inv. Date | `InvDate` | `INVDATE` |
| Due Date | `DueDate` | `DUEDATE` |
| G/L Date | `GLDate` | `GLDATE` |
| Period | `FisPerd` | `FISPERD` (varchar 2) |
| Year | `FisYear` | `FISYEAR` (varchar 4) |
| Term | `TermCode` | `TERMCODE` → SMTerm (คำนวณ DueDate) |
| VAT Group | `VatCode` | `VATCODE` → SmVat |
| Currency | `SrcCurr` | `SRCCURR` |
| Exchg. Rate | `ExcRate` | `EXCRATE` (decimal 18,6) |
| Description | `InvDesc` | `INVDESC` (varchar 2000) |
| Advance Amount | `AdvAmt` | `ADVAMT` (money) |
| Appoint Date | `AppointDate` | `APPOINTDATE` |
| Bill Placement | `BillNoteDate` | `BILLNOTEDATE` |

---

## 4. Tax invoice tab (Pg.1)

| UI | JSON key | ARINVHEAD column |
|---|---|---|
| Tax Inv. No | `TaxInvNo` | `TAXINVNO` (varchar 30) |
| Receipt No | `RCDocNo` | `RCDOCNO` |
| Ref. G/L # | `GLDocNo` | `GLDOCNO` (set ตอน Post) |
| Tax Description | `rem.TaxDesc` | `TAXDESC` (varchar 1000) |

---

## 5. Invoice address & remarks (Pg.2 / Pg.3) — ARINVREM

PK = `BATCHID + ENTRYNO + INVNO`. ใน JSON เก็บใน object `rem`.

| UI | JSON key | ARINVREM column | Notes |
|---|---|---|---|
| Invoice Address | `rem.ComAdd` | `COMADD` (text) | ที่อยู่ออกใบกำกับ |
| Invoice Name | `rem.InvName` | `INVNAME` (varchar 150) | |
| Branch | `rem.Branch` | `BRANCH` (varchar 5) | สาขา (00000=สนญ.) |
| Tax ID | `rem.TaxID` | `TAXID` (varchar 20) | |
| Description 1 | `rem.Descrip1` | `DESCRIP1` (varchar 200) | บรรทัด print (grdDesc1) |
| Description 2 | `rem.Descrip2` | `DESCRIP2` | |
| Description 3 | `rem.Descrip3` | `DESCRIP3` | |
| W/T Name | `rem.WTName` | `WTNAME` (varchar 150) | |
| W/T Tax ID | `rem.WTTaxID` | `WTTAXID` (varchar 13) | |
| W/T Code | `rem.WTCode` | `WTCODE` (varchar 10) | grid grdCommo |

---

## 6. Line items — `details[]` → ARINVDETAIL

| UI column | JSON key | ARINVDETAIL column | Notes |
|---|---|---|---|
| # | `DetLine` | `DETLINE` (int) | ลำดับ auto |
| Item Type | `ItemType` | `ITEMTYPE` (varchar 5) | REV / COST / ADV |
| Service Code | `ItemCode` | `ITEMCODE` (varchar 20) | → SMItem |
| Description | `ExpDesc1` | `EXPDESC1` (varchar 200) | **required** |
| (line 2) | `ExpDesc2` | `EXPDESC2` (varchar 200) | |
| Account | `AccID` / `AccName` | `ACCID` (varchar 18) / `ACCNAME` (varchar 80) | → SMAccount |
| UOM | `Uom` | `UOM` (varchar 20) | |
| Qty | `Qty` | `QTY` (decimal 18,4) | |
| Price | `Price` | `PRICE` (money) | unit price |
| VAT (type) | `VatType` | `VATTYPE` (int) | 1=VAT7% · 3=No VAT |
| (rate) | `VatRate` | `VATRATE` (money) | 7.00 / 0 |
| (in/ex) | `VatInOut` | `VATINOUT` (int) | 0=exclusive · 1=inclusive |
| Amount | `SrcAmt` | `SRCAMT` (money) | = Qty×Price (ก่อน VAT) |
| VAT Amt | `SrcVat` | `SRCVAT` (money) | |
| Total | `SrcTot` | `SRCTOT` (money) | = SrcAmt+SrcVat |
| (THB) | `ThbAmt`/`ThbVat`/`ThbTot` | `THBAMT`/`THBVAT`/`THBTOT` | = Src × ExcRate |
| D/C | `DcType` | (derived จาก `DOCBAL`) | DN/CN |
| (calc curr) | `CalCurr` | `CALCURR` (varchar 6) | + `CALRATE`/`CALPRICE`/`CALAMT`/`CALVAT`/`CALTOT` |
| W/T Rate / Amt | `WTRate` / `WTAmt` | `WTRATE` / `WTAMT` (money) | |
| Job / Sub-job | `JobNo` / `SubJobNo` | `JOBNO` / `SUBJOBNO` | |
| (link source) | — | `REFDETID` (int) | → OPTransDetail.DETID (ปุ่ม Ref. job charges) |
| (row PK) | `DETID` | `DETID` (varchar 50) | + `SUB_SYSNAME`/`JOBCLASS`/`SRCTYPE`/`BATCHID`/`ENTRYNO`/`INVNO` |

---

## 7. Totals matrix (header snapshot — mirror UpdateHead)

แต่ละบรรทัดคำนวณ:
```
base = Qty × Price
VatInOut=0 (exclude): SrcAmt = base;            SrcVat = base × Rate/100
VatInOut=1 (include): SrcVat = base × Rate/(100+Rate);  SrcAmt = base − SrcVat
SrcTot = SrcAmt + SrcVat
Thb*   = Src* × ExcRate
```
รวมเป็น header:

| Matrix cell | JSON / ARINVHEAD column |
|---|---|
| GROSS · Currency | `SrcAmt` → `SRCAMT` (Σ SrcAmt **ทุกบรรทัด รวม ADV**) |
| ADVANCE · Currency | `SrcAmtNoVatAdv` → `SRCAMTNOVATADV` (breakout ย่อย = Σ SrcAmt ที่ ItemType=ADV) |
| VAT · Currency | `SrcVat` → `SRCVAT` |
| TOTAL · Currency | `SrcTot` → `SRCTOT` (= GROSS + VAT) |
| ADVANCE/GROSS/VAT/TOTAL · THB | `Thb…` → `THBAMTNOVATADV` / `THBAMT` / `THBVAT` / `THBTOT` |

> ✔ ตรวจกับ DB จริง: ใบ Advance (เช่น `AISI25080001`) มี `SRCAMT`=`SRCTOT`=`SRCAMTNOVATADV`=10,000 → ADVANCE เป็น **subset** ของ GROSS ไม่ใช่ยอดแยกบวกเพิ่ม.

นอกจากนี้ UpdateHead ยังแยก `SRCAMTVAT` (Σ ส่วนที่มี VAT), `SRCAMTVAT7`, `SRCAMTNOVAT` สำหรับรายงานภาษี.

---

## 8. Save / workflow flow

```
SAVE (Open/Confirm เท่านั้น):
  validate (ChkValidHead + ChkValidDetailCell)
  BEGIN TRAN
    UPSERT ARINVHEAD WHERE BATCHID=? AND ENTRYNO=?     -- 93 cols, set Lock=now
    UPSERT ARINVREM  WHERE …INVNO=?
    DELETE ARINVDETAIL WHERE …INVNO=? AND DETID NOT IN (kept)
    UPSERT each line (compute SRC*/THB*/CAL*)
  COMMIT

CONFIRM  : DOCSTAT Open→Confirm (และกลับ UnConfirm)
APPROVE  : DOCSTAT Confirm→Approved (+APPBY/APPDATE) — lock การแก้ไข
POST G/L : POSTENTRY→2, gen GLDOCNO, สร้าง GLHEAD/GLDETAIL/GLTAX
CANCEL   : DOCSTAT→Canceled, POSTENTRY→3 (ถ้า posted → reverse G/L)
```

`LOCK` (float) ใช้เป็น optimistic lock เหมือน SFJob/Quotation.

---

## 9. Document numbering (UpdateAROption)

prefix+running ต่อ DocType จาก `AROption`/`SFOption` (`ARINVLEN`/`ARINVPRE`/`ARINVNUM` …) มี token พิเศษ `{Y}{M}{J}{#}`. mockup จำลองด้วย:

```js
InvNo = <DocTypePrefix> + 'SE' + YY + MM + NNNN
```
ตัวอย่าง `INSE17060003` = IN + SE(SF-EX) + 17 + 06 + 0003. เก็บ running จริงใน `SYSID.RUNID`.
