# Inbound Master Reference (IM) — UI ↔ DB Field Mapping

อ้างอิง: `mockup/frmSFJob_IM/index.html` ↔ `data.json` ↔ `frmSFJob.frm`
(`Sub UpdateData` line 10839, `Sub UpdateDataHBL` line 11041, `Sub UpdateDetailCont` line 11210)

UI นี้คือ **import (IM)** — ใช้ `JOBCLASS = 'IM'` ใน DB.
Save 1 ครั้งเขียน 3 ตารางใน transaction เดียว: `SFJob` + `SFHBL` (DocType='Allocated') + `SFCont`.

---

## ⚠ IM-specific behaviour (จาก frm)

| สิ่งที่ต่างจาก EX | จัดการตรงไหน |
|---|---|
| `ETDETA = ETA` (EX ใช้ ETD) | controller: `mapToSFJob()` |
| `FISYEAR/FISPERD` derive จาก ETA | controller |
| `SFJob.RECPORT = SFJob.LOADPORT` (UI Port of Loading เก็บลง 2 column) | controller branch บน JobClass |
| `SFJob.DISPORT = SFJob.DELPORT = SFJob.FINALPORT` (UI Final Destination เก็บลง 3 column) | controller branch |
| UI ไม่มี Place of Receipt / Port of Discharge / Place of Delivery (ซ่อน) | UI |
| UI ไม่มี CY Date / CFS Date / Return Date / Closing Date | UI (ถ้าต้องใช้ค่อยแสดง) |
| Label "Exporter" → "Importer" | UI label เท่านั้น (column ยังเป็น `EXPORTER`/`EXPORTERNAME`) |
| Label "Master B/L" → "Ocean B/L" | UI label เท่านั้น (column = `MASTERNO`) |
| Label "Master B/L Date" → "OB/L Date" | UI label เท่านั้น (column = `MASTERDATE`) |

---

## 1. Banner

| UI | JSON key | SFJob | SFHBL |
|---|---|---|---|
| Job Ref No | `JobNo` | `JobNo` (PK) | `JobNo`, `DocNo` |
| Ref Date | `JobDate` | `JobDate` | `DocDate` |
| Status | `JobStat` | `JOBSTAT` | `DOCSTAT` |
| Job Type | `JobType` | `JOBTYPE` | `JOBTYPE` |
| (constant) | `JobClass` = `"IM"` | `JOBCLASS` | `JOBCLASS` |
| Period | derived | `FISYEAR`, `FISPERD` (จาก ETA) | — |
| User · Group | session | `USERID`, `GROUPID` | `UserID`, `GroupID` |
| Checked ☑ | `Checked` (bool) | `CHECKJOB` ('Y'/null), `CHECKBY`, `CHECKDATE` | — |

---

## 2. Routing (3 nodes สำหรับ IM)

| UI label | JSON key | SFJob (IM logic) | SFHBL |
|---|---|---|---|
| **Port of Loading** code | `LoadPort` | `RECPORT` AND `LOADPORT` (force same) | `RECPORT`, `LOADPORT` |
| Port of Loading name | `LoadPortName` | — | `RECPORTNAME`, `LOADPORTNAME` |
| **Final Destination** code | `FinalPort` | `DISPORT` AND `DELPORT` AND `FINALPORT` (force ทั้ง 3 เท่ากัน) | same 3 columns |
| Final Destination name | `FinalPortName` | — | `DISPORTNAME`, `DELPORTNAME`, `FINALPORTNAME` |
| Tranship Port code | `TranPort` | `TRANPORT` | `TRANPORT` |
| Tranship Port name | `TranPortName` | — | `TRANPORTNAME` |
| ☑ Oncarriage by Consignee | `Oncarriage` (bool) | `CHKOPT` (0/1) | `CHKOPT` |
| Shed | `Shed` | `SHED` | `SHED` |
| Terminal | `Terminal` | `Terminal` | — |

---

## 3. Vessel & Voyage

| UI | JSON key | SFJob | SFHBL |
|---|---|---|---|
| Liner code | `LinerNo` | `LINERNO` | — |
| Liner name | `LinerName` | `LINERNAME` | — |
| Co-Load code | `CoLoad` | — | `COLOAD` |
| Co-Load name | `CoLoadName` | — | `COLOADNAME` |
| Feeder | `Feeder` | `FEEDER` | `FEEDER` |
| Feeder Voy | `FeederVoy` | `F_VOY` | `F_VOY` |
| Vessel | `Vessel` | `VESSEL` | `VESSEL` |
| Vessel Voy | `VesselVoy` | `V_VOY` | `V_VOY` |

---

## 4. Schedule

| UI | JSON key | SFJob | SFHBL |
|---|---|---|---|
| ETD | `Etd` | `ETD` | `ETD` |
| ETA *(drives Period for IM)* | `Eta` | `ETA` | `ETA` |
| (auto) | — | `ETDETA = ETA` (IM) | `ETDETA` |
| **OB/L Date** | `OblDate` | `MASTERDATE` ⚠ | — |

---

## 5. Parties

| UI label | JSON key | SFJob | SFHBL |
|---|---|---|---|
| Agent code | `Agent` | `AGENTNO` | `AGENTNO` |
| Agent name | `AgentName` | `AGENTNAME` | `AGENTNAME` |
| Agent address | `AgentAddress` | `A_ADD` | `A_ADD` |
| Shipper code | `Shipper` | `SHIPPER` | `SHIPPER` |
| Shipper name | `ShipperName` | `SHIPPERNAME` | `SHIPPERNAME` |
| Shipper address | `ShipperAddress` | `S_ADD` | `S_ADD` |
| **Importer** code | `Importer` | **`EXPORTER`** ⚠ (column shared) | `EXPORTER` |
| Importer name | `ImporterName` | `EXPORTERNAME` | `EXPORTERNAME` |
| Importer address | `ImporterAddress` | (no col) | `C_ADD` (frm copies from agent) |
| Notify code | `Notify` | — | `NOTIFY` |
| Notify name | `NotifyName` | — | `NOTIFYNAME` |
| Notify address | `NotifyAddress` | — | `N_ADD` |

> สำหรับ IM: frm จะ copy `CONSIGNEE = AGENTNO` ถ้า UI ไม่ได้ระบุ Consignee แยก. Mock UI ไม่มี Consignee field — ใช้ค่า Importer สำหรับ logic นี้ได้.

---

## 6. Sales

| UI | JSON key | SFJob | SFHBL |
|---|---|---|---|
| **Sold By** dropdown | `SoldBy` | `JOBOWNER` ⚠ | — |
| Sale Person code | `SaleNo` | — | `SALENO` |
| Sale Person name | `SaleName` | — | `SALENAME` |
| Handle By code | `HandleBy` | `HANDLEBY` | — |
| Handle By name | `HandleByName` | `HANDLEBYNAME` | — |
| Job Group | `JobGroup` | `JOBGROUP` | — |
| OPT Dept | `OPTDept` | `OPTDept` | — |

Sold By options: `FREEHAND`, `NOMINATE`, `OFFICE`, `HOUSE`.

---

## 7. Cargo Terms & Booking

| UI | JSON key | SFJob | SFHBL |
|---|---|---|---|
| Charge Term | `ChgTerm` | `CHGTERM` | `CHGTERM` |
| Load Type | `LoadType` | `LOADTYPE` | `LOADTYPE` |
| CY / CFS | `CyTerm` | `CYTERM` | `CYTERM` |
| **B/L Type** | `BlType` | — | `BLTYPE` |
| Booking No | `BookNo` | `BOOKNO` | `BOOKNO` |
| **Ocean B/L** | `OceanBl` | `MASTERNO` ⚠ | `MASTERNO` |
| Forwarder B/L | `FwdBlNo` | `FWDBLNO` | `FWDBLNO` |

---

## 8. Currency & Contact

| UI | JSON key | SFJob | SFHBL |
|---|---|---|---|
| Currency | `JobCurr` | `JOBCURR` | — |
| Exc. Rate | `JobRate` | `JOBRATE` | — |
| To | `ToName` | (ไม่มี column ตรง — แนะนำใช้ `OPTION1` หรือสร้างใหม่) | — |
| Attn | `Attn` | `ATTN` | — |
| From | `FromName` | `FROMNAME` | `FROMNAME` |
| Contact | `CtcName` | `CTCNAME` | `CTCNAME` |
| Commodity | `Commodity` | — | `COMMODITY` |
| Remark | `Remark` | `REMARK` | `REMARK` |

---

## 9. Containers grid → SFCont

แต่ละ row ใน `containers[]` → 1 row ใน SFCont.

| UI column | JSON key | SFCont column |
|---|---|---|
| BL | `Bl` | `BookNo` (or `BLNo`) |
| Container No | `CtnNo` | `CTNNO` |
| Seal No | `SealNo` | `SEALNO` |
| Size | `CtnSize` | `CTNSIZE` ("20'", "40'", "40'HC", "45'") |
| Type | `CtnType` | `CTNTYPE` (GP/HC/RF/OT/FR) |
| GW | `Gw` | `GW` |
| CBM | `Cbm` | `CBM` |
| Total Pkgs | `PkgQty` | `PKGQTY` |
| Pkg Unit | `PkgUnit` | `PKGUNIT` |
| ISO Size | `CtnSizeIso` | `CTNSizeISO` |
| (auto) | `DETID` | `DETID`, plus `JOBNO`, `SEQNO`, `Lock` |

**Aggregate counts** (compute หลัง insert SFCont):
- `SFJob.CTN20` / `CTN40` / `CTN40HC` / `CTN45` = COUNT แต่ละ size
- `SFJob.GW` / `CBM` / `PKGQTY` = SUM แต่ละ column

---

## 10. Save flow (IM)

```
BEGIN TRAN
  -- 1. SFJob header (with IM-specific port duplication)
  RECPORT  := UI.LoadPort
  LOADPORT := UI.LoadPort        -- force same
  DISPORT  := UI.FinalPort       -- force same
  DELPORT  := UI.FinalPort       -- force same
  FINALPORT:= UI.FinalPort       -- force same
  TRANPORT := UI.TranPort
  ETDETA   := UI.Eta             -- IM uses ETA
  FISYEAR  := YEAR(UI.Eta)
  FISPERD  := MONTH(UI.Eta) zero-padded
  EXPORTER := UI.Importer        -- column reuse
  EXPORTERNAME := UI.ImporterName
  JOBOWNER := UI.SoldBy
  MASTERNO := UI.OceanBl
  MASTERDATE := UI.OblDate
  CHKOPT   := UI.Oncarriage ? 1 : 0
  ... (rest of fields per mapping above)
  INSERT/UPDATE SFJob

  -- 2. SFHBL allocated row (mirror header + Notify/SaleNo/CoLoad/BLType + port names)
  UPSERT SFHBL WHERE Sub_SysName='SF' AND JobNo=? AND DocType='Allocated'

  -- 3. SFCont rows — diff sync by DETID
COMMIT
```

ใช้ `SFJob.Lock` (`microtime(true)` token) เป็น optimistic lock เหมือนเดิม.

---

## 11. Reusable controller

`OutboundJobController` ที่มีอยู่แล้วที่ [laravel-smp/app/Http/Controllers/OutboundJobController.php](../../laravel-smp/app/Http/Controllers/OutboundJobController.php) สามารถใช้กับ IM ได้ถ้า:
1. เพิ่ม branch IM ใน `mapToSFJob()` — ตอนนี้มี `$jobClass === 'EX'` check แล้ว แค่ต้อง:
   - Force `RECPORT`, `LOADPORT`, `DISPORT`, `DELPORT`, `FINALPORT` ตาม IM rule
   - Map `Importer*` → `EXPORTER*` columns (ปัจจุบัน mapToSFJob รับ `Exporter*` keys ตรง ๆ)
2. ปรับ `StoreOutboundJobRequest` เพิ่ม `Importer`/`OceanBl`/`OblDate`/`ToName` keys (หรือสร้าง `StoreInboundJobRequest` แยก + `InboundJobController`)

แนะนำ: สร้าง `InboundJobController` แยก เพราะ IM/EX มี logic เฉพาะตัวพอสมควร — ป้องกันการสับสนใน controller เดียวที่ต้อง branch หลายจุด.
