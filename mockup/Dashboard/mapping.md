# SMF Dashboard — Widget ↔ DB Mapping

อ้างอิง: `mockup/Dashboard/index.html` · `data.js` (ข้อมูลตัวอย่าง) · schema จาก `smfdb` (`INFORMATION_SCHEMA`, ตรวจเฉพาะชื่อตาราง/คอลัมน์ ไม่ได้ดึงตัวเลขจริงมาเทียบ)

สถานะของแต่ละแถว:

- ✅ **ยืนยัน** — ตารางและคอลัมน์มีอยู่จริงใน `smfdb`
- ⚠️ **ต้องยืนยัน** — คอลัมน์มีอยู่ แต่ค่า/ความหมาย (status code, SUB_SYSNAME ฯลฯ) ยังต้องอ่านจาก frm ต้นฉบับหรือถามผู้ใช้
- ❓ **ยังหาแหล่งไม่ได้** — ไม่พบตารางที่ชัดเจน

> `smfdb` ที่ต่ออยู่คือ **SMF_DEMO** — ใช้ยืนยัน schema ได้ แต่ห้ามใช้ตัวเลขจากมันเป็นหลักฐานทางสถิติ (ดู memory)

---

## 0. Filter กลาง (ทุก module)

| UI | แหล่งข้อมูล | หมายเหตุ |
|---|---|---|
| Period (month / quarter / ytd) | ตัวแปร `@from`, `@to` ใช้กับวันที่ของแต่ละ widget (ระบุข้างล่าง) | คำนวณฝั่ง client/API |
| Branch | `SMBRANCH` (`BRCODE`, `BRNAME`) ✅ | ⚠️ ยังไม่พบคอลัมน์ branch ใน `SFJOB`/`ARSUBTRANS`/`CBHEAD` ที่ดึงมาดู — ต้องหาว่า branch ผูกกับเอกสารผ่านคอลัมน์ไหน (อาจเป็น `DEPTNO` / book prefix) |
| Customer / Vendor name | `SMBUSINESS` (`COMNO`, `COMNAME`, `SHORTNAME`) ✅ | join จาก `CUSTCODE` / `COMNO` |

---

## 1. Operations

โมดูลแยกด้วย `SFJOB.JOBCLASS` (`IM`/`EX`), `JOBTYPE`, `SUBJOBTYPE`, `PORTTYPE` ✅ — ⚠️ ค่าที่ใช้แยก **Sea / Air / Customs / Truck** ต้องยืนยัน (ใบเสนอราคาใช้ `JOBTYPE = FREIGHT / LOGISTICS / CUSTOMS`; Air มีตาราง `AF*` แยก)

### 1.1 Overview (All)

| Widget | แหล่ง | Query / เงื่อนไข | สถานะ |
|---|---|---|---|
| Open jobs | `SFJOB` | `COUNT(*) WHERE JOBSTAT NOT IN (ปิดงาน/ยกเลิก)` | ⚠️ ค่า `JOBSTAT` |
| Departing this week | `SFJOB` | `ETD BETWEEN today AND today+7` | ✅ |
| Delayed / at risk | `SFJOB` + `SFVSED` | `ETD < today AND ยังไม่ Loaded` หรือ `SFVSED.DEPDATE` เลื่อนจาก `SFJOB.ETD` | ⚠️ นิยาม "delay" |
| Docs pending | `SFHBL` | `DOCSTAT <> Approved` หรือ `DOSTAT` ว่าง | ⚠️ |
| Needs attention (ตาราง) | `SFJOB` ⟕ `SMBUSINESS` | รวมเงื่อนไข delay/docs; `Due` = `ETD` หรือ `CLEARDATE` | ⚠️ |
| Jobs by mode (donut) | `SFJOB` | `GROUP BY` ตัวแยก mode ข้างบน | ⚠️ |
| Jobs opened per week | `SFJOB.JOBDATE` | `GROUP BY DATEPART(week, JOBDATE)` 12 สัปดาห์ | ✅ |

### 1.2 Sea

| Widget | แหล่ง | Query / เงื่อนไข | สถานะ |
|---|---|---|---|
| Open sea jobs | `SFJOB` | `JOBTYPE`/`PORTTYPE` = sea, `JOBSTAT` เปิดอยู่ | ⚠️ |
| TEU this month | `SFCONT` ⟕ `SFJOB` | `SUM(CASE CTNSIZE WHEN '20' THEN 1 WHEN '40','40HC' THEN 2 ...)` กรองด้วย `SFJOB.JOBDATE`/`ETD` | ⚠️ รูปแบบ `CTNSIZE` (ดู `SFCTNSIZE`) |
| Vessels due ≤7d | `SFVSED` ⟕ `SFVESSEL` | `DEPDATE`/`ARRDATE` ภายใน 7 วัน | ✅ |
| Delayed | `SFJOB` + `SFVSED` | เหมือน 1.1 | ⚠️ |
| Workflow Booked→Delivered | `SFBOOK.DOCSTAT`, `SFJOB.JOBSTAT`, `SFJOB.LOADDATE/CYDATE/CFSDATE/ETD/ETA`, `SFHBL.DOSTAT/RELEASEDATE` | นับตามวันที่ที่ถูกกรอกแล้ว: Booked=`SFBOOK`, Loaded=`LOADDATE`, Sailing=`ETD<=today<ETA`, Arrived=`ETA<=today`, Delivered=`DODATE`/`RELEASEDATE` | ⚠️ ลำดับ stage |
| TEU per week | `SFCONT` ⟕ `SFJOB` | group ตามสัปดาห์ของ `ETD` | ⚠️ |
| Top trade lanes | `SFJOB` + `OPPORT` | port code ใน job → ชื่อท่าใน `OPPORT` (ชื่อคอลัมน์ port ใน `SFJOB` ยังไม่ได้ตรวจ) | ⚠️ |
| Upcoming vessels (ตาราง) | `SFVSED` ⟕ `SFVESSEL` ⟕ `SFJOB` | vessel/voyage, `DEPDATE`, `JOBNO` | ✅ / ⚠️ join key |

### 1.3 Air

| Widget | แหล่ง | หมายเหตุ | สถานะ |
|---|---|---|---|
| Open air jobs / Delayed | `SFJOB` (+`FLIGHTDATE2/3`) | มี `MAWBNO`, `IATAAMT` ใน `SFJOB` แสดงว่า air ใช้ `SFJOB` ร่วม | ⚠️ ตัวแยก air |
| Chargeable kg | ❓ | ยังไม่พบคอลัมน์น้ำหนัก chargeable ใน `SFJOB`/`SFHBL` ที่ดึงมา (ต้องดูคอลัมน์ GW/CW ของ `SFHBL`/`SFCARGO*`) | ❓ |
| AWB issued today | `SFHBL.ISSUDATE`, `MAWBNO`, `SFMAWBSTOCK` | `ISSUDATE = today` | ✅ / ⚠️ |
| Top airlines | `SFJOB.LINERNO` → `SMBUSINESS` | liner = สายการบิน ในงาน air | ⚠️ |
| Recent AWB (ตาราง) | `SFHBL` (`MAWBNO`, `BLNO`, `DOCSTAT`) | | ⚠️ |
| (ฝั่ง quotation air) | `AFQHEAD`, `AFQDETAIL`, `AFRATE` | ใช้ใน Marketing ไม่ใช่ Ops | ✅ |

### 1.4 Customs

| Widget | แหล่ง | หมายเหตุ | สถานะ |
|---|---|---|---|
| Declarations open / Cleared today | `SFJOB` / `SFBOOK` ที่ `JOBTYPE = CUSTOMS` ; `CLEARDATE` | `Cleared today = CLEARDATE = today` | ⚠️ |
| Entry no., Office, Inspection, Duty | ❓ | ไม่พบตารางใบขนโดยเฉพาะ (`CS*` = Cash/Requisition ไม่ใช่ Customs) — ต้องถามว่าเลขใบขนเก็บที่ไหน (`SFXML` / `SFXMLPO` น่าจะเกี่ยวกับ EDI) | ❓ |
| Declarations per week | `SFJOB.JOBDATE` กรอง customs | | ⚠️ |

### 1.5 Truck

| Widget | แหล่ง | หมายเหตุ | สถานะ |
|---|---|---|---|
| Trips today / Late / Empty return | `TSORDERH` (`ORDERHNO`, `JOBNO`, `HBLREF`, `DOCDATE`) + `TSORDER`, `TSCONT`, `TSITEM` | `TSORDER`/`TSITEM` เก็บรายละเอียดเที่ยว (ยังไม่ได้ดูคอลัมน์) | ⚠️ |
| Fleet utilisation | `TSTRUCK`, `TSTRUCKCLASS` ÷ รถที่มีเที่ยววันนี้ | | ⚠️ |
| Today's trips (ตาราง) | `TSORDER` + `TSTRUCK` | ETA/Status ต้องหาคอลัมน์ | ⚠️ |
| By vehicle type | `TSTRUCKCLASS`, `SFBOOK.TRUCKTYPE/TRUCKREGNO` | | ⚠️ |
| หมายเหตุ | `TSTRUCKSCHED` เป็นตาราง import แบบ `F1..F17` (ชีตตารางรถ) — **ไม่ควรใช้เป็นแหล่งหลัก** | | ✅ |

---

## 2. Accounting

เอกสารบัญชีมาจาก `ARINVHEAD` (invoice), `ARSUBTRANS` / `APSUBTRANS` (รายการเปิด/ตัดหนี้), `CBHEAD`/`CBDETAIL` (Cash Book), `GLHEAD`/`GLDETAIL`/`GLHISTORY` (GL).

### 2.1 KPI + Cash Book

| Widget | แหล่ง | Query / เงื่อนไข | สถานะ |
|---|---|---|---|
| Cash & bank | `SMBANKACC.BANKBAL` ✅ | `SUM(BANKBAL)` แยกตาม `BANKTYPE` (เงินสด/ธนาคาร) | ⚠️ ว่า `BANKBAL` อัปเดต realtime หรือไม่ — ทางเลือก: `GLHISTORY.ACCBAL` ของ `SMBANKACC.ACCID` |
| Bank balances (ตาราง) | `SMBANKACC` (`BANKNAME`, `BANKACCNO`, `BANKBAL`) | สกุล USD → ดู `SMCURRENCY`/`SMEXCHANGE` | ✅ |
| Cash in vs out (รายสัปดาห์) | `CBHEAD` ⟕ `CBDETAIL` | `ENTRYTYPE` (RV=รับ / PV=จ่าย) `GROUP BY week(CBDOCDATE)`, `SUM(THBAMT)`; ตัด `POSTENTRY=3` (ยกเลิก) | ⚠️ ค่า `ENTRYTYPE` |
| Unreconciled bank lines | `CBHEAD` (`COLDATE`, `CHQSTATUS`, `CHQAMT`) / `CBCHQSUBTRANS` | เช็คที่ยังไม่ clear | ⚠️ |

### 2.2 AR

| Widget | แหล่ง | Query / เงื่อนไข | สถานะ |
|---|---|---|---|
| AR outstanding | `ARSUBTRANS` | `SUM(THBAMT * DOCBAL)` เฉพาะรายการยังไม่ตัด (`CBDOCNO IS NULL`) | ⚠️ ต้องยืนยันวิธีนับ open item |
| AR aging | `ARSUBTRANS.DUEDATE` | bucket: Current / 1-30 / 31-60 / 61-90 / >90 วันจาก `DUEDATE` เทียบ today | ✅ |
| Top receivables | `ARSUBTRANS` ⟕ `SMBUSINESS` | `GROUP BY CUSTCODE ORDER BY SUM DESC TOP 4` + bucket เก่าสุด | ✅ |
| Invoice ที่รอวางบิล/นัดชำระ | `ARSUBTRANS.BILLNOTEDATE`, `APPOINTDATE` | ใช้ต่อยอดภายหลัง | ✅ |

### 2.3 AP

| Widget | แหล่ง | Query / เงื่อนไข | สถานะ |
|---|---|---|---|
| AP outstanding / aging | `APSUBTRANS` | โครงสร้างเหมือน AR (`DUEDATE`, `THBAMT`, `DOCBAL`) | ⚠️ |
| Payables due this week | `APSUBTRANS` ⟕ `SMBUSINESS` | `DUEDATE BETWEEN today AND today+7`, ยังไม่จ่าย | ✅ |
| เบิกทดรอง/วงเงิน (ต่อยอด) | `CSREQH`, `CSFUND` | ตามที่อธิบายใน `frmARInvoice/mapping.md` | ✅ |

### 2.4 GL

| Widget | แหล่ง | Query / เงื่อนไข | สถานะ |
|---|---|---|---|
| Net profit (MTD) / Revenue vs cost | `GLHISTORY` (`ACCID`, `ACCTYPE`, `ACCBAL`) ⟕ `SMACCOUNT` (`ACCTYPE`, `ACCGROUP`, `NATURE`) | รายได้ = ACCTYPE รายได้, ต้นทุน = ACCTYPE ค่าใช้จ่าย; รายเดือนจาก history ตาม period | ⚠️ ค่า `ACCTYPE`; ทางเลือก: sum `GLDETAIL` ตาม `GLHEAD.GLDATE` |
| Unposted journals | `GLHEAD.POSTENTRY` / `GLBATCH.BATCHSTATUS`, `POSTNOW` | `COUNT(*) WHERE POSTENTRY <> 2` | ⚠️ (AR ใช้ 0/1/2/3 — GL อาจต่าง) |
| Period status | `SMLOCK` / `SMLOCKPERD` | งวดที่ปิดแล้วหรือยัง | ⚠️ |
| Trial balance (balanced?) | `GLDETAIL` | `SUM(debit) = SUM(credit)` ในงวด | ⚠️ ชื่อคอลัมน์ debit/credit |

---

## 3. Marketing

### 3.1 Quotation

| Widget | แหล่ง | Query / เงื่อนไข | สถานะ |
|---|---|---|---|
| Quotations (MTD) | `AFQHEAD` | `COUNT(*) WHERE DOCDATE in period AND DOCSTAT <> 'Deleted'` | ✅ (ตามที่ `frmSFQuotation/mapping.md` ระบุว่า header อยู่ใน `AFQHEAD`) |
| Quoted value | `AFQDETAIL` / `SFQRATE` | รวมค่าเฟรทต่อ doc — ต้องตกลงนิยาม "มูลค่า" ของใบเสนอราคา | ⚠️ |
| Funnel Draft→Sent→Won/Lost | `AFQHEAD.DOCSTAT` (`Open`/`Approved`/`Deleted`) | ⚠️ **ไม่มีสถานะ Sent/Won/Lost ใน AFQHEAD** — ทางเลือก: Won = ใบเสนอราคาที่ถูกอ้างจาก `SFBOOK.REFQTNO`; หรือใช้ CRM (`Opportunities`, `Pipelines`, `PipelineStages`, `CRM_QUOTATION_REVIEWS`, `SalesQuotations`) | ⚠️ ต้องตัดสินใจ |
| Win rate | `AFQHEAD` ⟕ `SFBOOK.REFQTNO` | `COUNT(DISTINCT quotations ที่มี booking) / COUNT(quotations ที่ส่ง)` | ⚠️ |
| Quotes expiring soon | `AFQHEAD` (`EFFDATE`, `EXPDATE`, `CUSTNO`, `CUSTNAME`) | `EXPDATE BETWEEN today AND today+7 AND DOCSTAT='Approved'` | ✅ |
| Quotations vs Bookings (รายเดือน) | `AFQHEAD.DOCDATE`, `SFBOOK.DOCDATE` | `GROUP BY month` | ✅ |
| Top customers | `SFBOOK` / `SFJOB` ⟕ `SMBUSINESS` | จำนวน booking; revenue = `SUM(ARINVHEAD ยอด)` ผ่าน `JOBNO` | ⚠️ ต้อง join ผ่าน `JOBNO` |

### 3.2 Booking

| Widget | แหล่ง | Query / เงื่อนไข | สถานะ |
|---|---|---|---|
| Bookings (MTD) | `SFBOOK` | `DOCDATE in period AND DOCSTAT <> 'Deleted'` | ✅ / ⚠️ ค่า DOCSTAT |
| Bookings by mode | `SFBOOK` (`LOADTYPE` FCL/LCL, `SHIPTYPE`, `BLTYPE`, `TRUCKTYPE`) + `AFBOOKLIST` (air) | FCL/LCL จาก `LOADTYPE`; Air จาก `AFBOOKLIST`; Truck จาก `TRUCKTYPE` | ⚠️ |
| Bookings waiting | `SFBOOK` | รอ: rate approval (`CREDITAPPDATE`, `PROAPPDATE` ว่าง), space (`CONFDATE` ว่าง), SI (`BLNO` ว่าง) | ⚠️ นิยาม |

---

## 4. สรุปที่ต้องตัดสินใจก่อนต่อข้อมูลจริง

1. **ตัวแยก Sea / Air / Customs / Truck** — ใช้คอลัมน์ไหนของ `SFJOB` (หรือแยกตามตาราง `SF*` / `AF*` / `TS*`)
2. **Customs** — เลขใบขน/ด่านศุลกากร/สถานะตรวจ เก็บที่ไหน (ยังไม่พบตาราง)
3. **Air chargeable weight** — คอลัมน์น้ำหนักใน `SFHBL` / ตาราง cargo
4. **Quotation Won/Lost/Sent** — `AFQHEAD` มีแค่ `Open/Approved/Deleted`; จะใช้การอ้างจาก `SFBOOK.REFQTNO` หรือ CRM pipeline
5. **Branch** — เอกสารผูกสาขาด้วยคอลัมน์ไหน
6. **นิยาม open-item AR/AP และ GL ACCTYPE** — ให้ฝ่ายบัญชียืนยัน
7. **ชั้นข้อมูล** — แนะนำสร้าง read-only API/view (เช่น `vw_dash_*`) ต่อ widget แทนให้ browser query ตรง; มี `SMBANKACC.BANKBAL`, `GLHISTORY` ที่ aggregate แล้วช่วยให้เร็ว

## 5. ลำดับต่อยอดที่แนะนำ

ทำ widget ที่ ✅ ล้วนก่อน (Vessels due, AR/AP aging, Top receivables, Payables due, Bank balances, Quotes expiring, Quotations vs Bookings) → ค่อยยืนยันข้อ 1–6 แล้วเติม widget ที่ ⚠️ / ❓
