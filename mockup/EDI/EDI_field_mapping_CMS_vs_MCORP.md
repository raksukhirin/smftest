# EDI `seajobfile` — ตารางแปลง Field (Mapping) CMS ↔ MCORP

> เปรียบเทียบโครงสร้าง XML สอง profile ของ SMART_REPORT `seajobfile` (EDI)
> - **CMS** = `G:\@SMART_REPORT\DEMO\REPORT\EDI\CMS\EDI.xml`
> - **MCORP** = `G:\@SMART_REPORT\MCORP\EDI\EDI XML Files (2).xml`
>
> อัปเดตล่าสุด: 2026-08-30

## สรุปหลักการ mapping
- **CMS** — ใช้ tag เดียวเก็บ text + มี sub-object ลึก (`port` / `airport` / `countrycode` พร้อม `iddcountrycode`)
- **MCORP** — ใช้คู่ `xxxcode` (รหัส) + `xxx` / `xxxname` (ข้อความ) และเป็นโครงแบน (flat)
- คอลัมน์ **Canonical** = ชื่อกลางที่แนะนำให้ template/parser ใช้ แล้ว map เข้าจากทั้งสองฝั่ง
- root ตรงกันทั้งคู่: `<seajobfile>` → ` > container / billoflading` (วนซ้ำต่อ BL)

---

## 1) Header (ระดับ `<seajobfile>`)

| Canonical (แนะนำ) | CMS path | MCORP path | หมายเหตุการแปลง |
|---|---|---|---|
| masterBlNo | — | `mblno` | CMS ไม่มี → ปล่อยว่าง |
| vessel | `vessel` | `vessel` | ตรง |
| voyage | `voyage` | `voyage` | ตรง |
| liner.name | `liner/name` | `liner/name` | ตรง |
| liner.code | `liner/code` | `liner/code` | ตรง (ลำดับใน XML สลับ ไม่กระทบ) |
| liner.address | `liner/address` | — | MCORP ไม่มี |
| liner.tel / fax / email / attention | `liner/tel`,`fax`,`email`,`attention` | — | MCORP ไม่มี |
| liner.port / liner.airport | `liner/port{...}`,`liner/airport{...}` | — | MCORP ไม่มี |
| cyClosingDate | `cfsclosingdate` | `cyclosingdate` | ⚠️ ชื่อต่าง ความหมายเดียวกัน (วันปิดตู้/CFS) |
| siCutoffDate | `sicutoffdate` | — | MCORP ไม่มี |
| etdDate | `etddate` | `etddate` | ตรง |
| etaDate | `etadate` | `etadate` | ตรง |
| loadingPort.code | `loadingport/code` | `loadingport/code` | ตรง |
| loadingPort.name | `loadingport/name` | `loadingport/name` | ตรง |
| loadingPort.country | `loadingport/countrycode{code,name,iddcountrycode}` | `loadingport/countrycode{code,name}` | MCORP ไม่มี `iddcountrycode` |
| loadingPort.transitTime | `loadingport/transittime` | — | MCORP ไม่มี |
| dischargePort.* | `dischargeport/...` | `dischargeport/...` | เหมือน loadingport |
| deliveryPlace (header) | — | `deliveryplace{code,name,countrycode}` | CMS ไม่มีระดับ header |
| loadingPortAgent.name / address / tel / fax | `loadingportagent/name`,`address`,`tel`,`fax` | เหมือนกัน | ตรง 4 ตัวนี้ |
| loadingPortAgent.code / port / airport | `loadingportagent/code`,`port{}`,`airport{}` | — | MCORP ไม่มี |
| handlingAgent.name / address / tel / fax | `handlingagent/name`,`address`,`tel`,`fax` | เหมือนกัน | ตรง 4 ตัวนี้ |
| handlingAgent.code / email / attention / port / airport | `handlingagent/...` | — | MCORP ไม่มี |

---

## 2) Container (`<container>`)

| Canonical | CMS | MCORP | หมายเหตุ |
|---|---|---|---|
| containerNo | `containerno` | `containerno` | ตรง |
| sealNo | `sealno` | `sealno` | ตรง |
| **sizeType** | `size` | `sizetype` | ⚠️ **ชื่อ tag ต่าง** ต้อง map |
| linerSoNo | `linersono` | `linersono` | ตรง |
| masterBlNo | `masterblno` | — | MCORP ไม่มี |
| coload | `coload` | — | MCORP ไม่มี |
| warehouse{} | `warehouse{...}` | — | MCORP ไม่มี |
| loadPlanRemarks | `loadplanremarks` | — | MCORP ไม่มี |

> **หมายเหตุค่า:** CMS = `40' HC` (มี `&apos;` + เว้นวรรค) vs MCORP = `40&apos;HQ` (ไม่มีเว้นวรรค + HQ) → ถ้าต้อง normalize ต้อง clean ค่าเพิ่ม

---

## 3) Bill of Lading (`<billoflading>`) — จุดต่างเยอะสุด

| Canonical | CMS | MCORP | หมายเหตุการแปลง |
|---|---|---|---|
| blNo | `blno` | `blno` | ตรง |
| vessel / voyage (ใน BL) | — (ใช้ของ header) | `vessel`,`voyage` | MCORP ซ้ำในแต่ละ BL |
| preCarriage | — | `precarriage` | CMS ไม่มี |
| destination.* | `destination{code,name,countrycode{...,iddcountrycode},transittime}` | `destination{code,name,countrycode{code,name}}` | MCORP ไม่มี `iddcountrycode` + `transittime` |
| shipper.details | `shipper/details` | `shipper/details` | ตรง |
| shipper.code{} | `shipper/code{...port,airport}` *(มีบ้าง)* | `shipper/code{name,address,tel,fax}` | โครง `code` ต่างกัน (ดู §4) |
| consignee.details / .code{} | เหมือน shipper | เหมือน shipper | เหมือน shipper |
| notifyParty.details / .code{} | เหมือน shipper | เหมือน shipper | เหมือน shipper |
| releaseMode.code | — | `releasemodecode` | CMS ไม่มีรหัส |
| releaseMode.text | `releasemode` | `releasemode` | ⚠️ ค่าต่างชุด: CMS=`TelexRelease`/`OriginalBL` ; MCORP=`Hold`/ว่าง |
| freightTerm.code | — | `ofppcccode` (เช่น `PP`) | CMS ไม่มีรหัส |
| freightTerm.text | `ofppcc` (`Prepaid`) | `ofppcc` (`FREIGHT PREPAID`) | ⚠️ ค่า text ไม่เท่ากัน |
| serviceMode.code | — | `servicemodecode` (`CFS-CFS`) | CMS ไม่มี |
| serviceMode.from / .to | `servicemodefrom`,`servicemodeto` | — | ⚠️ CMS แยก from/to |
| serviceMode.text | — | `servicemode` (`CFS-CFS`) | MCORP รวมตัวเดียว → ต้อง `split('-')` ถ้าจะได้ from/to |
| referenceCode | — | `referencecode` | CMS ไม่มี |
| marksAndNos | `marksandnos` | `marksandnos` | ตรง |
| noOfPkgs.code | — | `noofpkgscode` | CMS ไม่มี |
| noOfPkgs.text | — | `noofpkgs` | CMS ไม่มี |
| descOfGoods | `descofgoods` | `descofgoods` | ตรง |
| receiptPlace.code | — | `receiptplacecode` | CMS ไม่มีรหัส |
| receiptPlace.name | `receiptplace` | `receiptplace` | ตรง (text) |
| loadingPort.code (BL) | — | `loadingportcode` | CMS ไม่มีรหัส |
| loadingPort.name (BL) | `loadingportname` | `loadingportname` | ตรง (text) |
| dischargePort.code (BL) | — | `dischargeportcode` | CMS ไม่มีรหัส |
| dischargePort.name (BL) | `dischargeportname` | `dischargeportname` | ตรง (text) |
| deliveryPlace.code (BL) | — | `deliveryplacecode` | CMS ไม่มีรหัส |
| deliveryPlace.name (BL) | `deliveryplace` | `deliveryplace` | ตรง (text) |
| finalDestination | `finaldestination` | — | MCORP ไม่มี |
| payableAt | `payableat` | `payableat` | ตรง |
| handlingAgent (BL) | `handlingagent{code{...port,airport},details}` | `handlingagent{code{name,address,tel,fax},details}` | โครง `code` ต่าง (ดู §4) |
| issuePlace | `issueplace` | `issueplace` | ตรง |
| issueDate | `issuedate` | `issuedate` | ตรง |
| onBoardDate | `onboarddate` | `onboarddate` | ตรง |
| totalInWords | — | `totalinwords` | CMS ไม่มี |
| freight | — | `freight` | CMS ไม่มี |
| charges | — | `charges` | CMS ไม่มี |
| noOfCopies | `noofcopies` | — | MCORP ไม่มี |
| printCbm / printKgs / printContainerCbmKgs / printContainerType | `printcbm`,`printkgs`,`printcontainercbmkgs`,`printcontainertype` | — | MCORP ไม่มี (print flags) |

---

## 4) Sub-object `<code>` ใน shipper / consignee / notifyparty / handlingagent

| Field ใน `<code>` | CMS | MCORP |
|---|---|---|
| code (รหัสลูกค้า) | `code/code` (เช่น `C18814`) | — (ไม่มีรหัสจริง, tag `<code>` เป็นแค่ container) |
| name | `code/name` | `code/name` |
| address | `code/address` | `code/address` |
| tel | `code/tel` | `code/tel` |
| fax | `code/fax` | `code/fax` |
| email / attention | `code/email`,`code/attention` | — |
| port{} / airport{} | มี | — |
| **details** (text รวม) | `details` | `details` |

> **ข้อควรระวัง:** ใน CMS บาง party มีแค่ `<details>` (ไม่มี `<code>`) เช่น shipper ของ BL แรก → parser ต้องเผื่อกรณี `<code>` หายไป. ส่วน MCORP มี `<code>` + `<details>` **ทุก party สม่ำเสมอ**

---

## 5) จุดที่ต้องเขียน logic เพิ่ม (ไม่ใช่ map ตรงๆ)

1. **`size` ↔ `sizetype`** — rename tag
2. **serviceMode** — CMS `from`/`to` แยก ; MCORP `CFS-CFS` ตัวเดียว → ต้อง `split('-')` / `join('-')`
3. **release / ofppcc / receiptplace / ports** — MCORP มีคู่ `code`+`text`, CMS มีแต่ `text` → ฝั่ง CMS ปล่อย code ว่าง
4. **ค่า enum ไม่ตรง** — `Prepaid` vs `FREIGHT PREPAID`, `TelexRelease` vs `Hold` → ต้องมีตาราง lookup ค่าถ้าจะ normalize
5. **party ที่ไม่มี `<code>`** (CMS) → fallback ไปใช้ `<details>`

---

## ภาคผนวก — ความต่างเชิงโครงสร้างโดยสรุป

| มิติ | CMS (DEMO) | MCORP |
|---|---|---|
| แนวคิด | แบบละเอียด มี geo lookup (port/airport/country + iddcountrycode) | แบบแบน มีคู่ code+text ต่อ field |
| ระบุรหัส (code) | มีเฉพาะรหัสลูกค้าใน `<code>`; field อื่นเป็น text ล้วน | มี `xxxcode` ควบทุก field สำคัญ |
| ข้อมูลการเงิน (freight/charges/totalinwords) | ไม่มี | มี |
| print flags / จำนวนสำเนา | มี | ไม่มี |
| vessel/voyage ต่อ BL | ใช้ของ header | ซ้ำในทุก BL |
