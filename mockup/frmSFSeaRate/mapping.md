# Sea Freight Rate Control — Field Mapping

แมป field จาก `frmSFSeaRate.frm` (VB6) → `data.json` (mockup) → DB tables (`SFRATE`, `SFRATED`, `SFRATED2`).

## โครงสร้าง JSON

```
data.json
├── company                  → Company-level settings
├── masters                  → Lookup lists (ports, businesses, services, ...)
│   ├── ports[]              → OPPORT (PortType='SF')
│   ├── businesses[]         → SMBUSINESS (VendClass ∈ FORWARDER/SEALINE/SEA-AIR)
│   ├── currencies[]         → fixed list (USD/THB/...)
│   ├── containerTypes[]     → fixed list (Dry/DC/OT/...)
│   ├── cyTerms[]            → CYTERM combo (CY/CY, CY/CFS, ...)
│   ├── jobClasses[]         → EX/IM
│   └── services[]           → OPItem + hardcoded (FRT/AMS/CAF/BAF)
└── rates[]                  → SFRATE (header) + nested `costs[]` (SFRATED) + `sellings[]` (SFRATED2)
```

## SFRATE → rates[i]

| VB6 field (Enum) | JSON field   | DB column     | Type / Notes                                |
|------------------|--------------|---------------|---------------------------------------------|
| `RATEID` (18)    | `RATEID`     | RATEID        | PK, 20-char zero-padded (auto-generated)    |
| `Cmb(2)`         | `JOBCLASS`   | JOBCLASS      | `EX` / `IM`                                 |
| `AgentNo` (0)    | `AGENTNO`    | AGENTNO       | Lookup → masters.businesses.ComNo           |
| `AgentName` (1)  | `AGENTNAME`  | AGENTNAME     | Auto-filled from lookup                     |
| `CTCNAME` (2)    | `CTCNAME`    | CTCNAME       | Free text                                   |
| `LinerNo` (3)    | `LINERNO`    | LINERNO       | Lookup (Carrier — SEALINE only)             |
| `LinerName` (4)  | `LINERNAME`  | LINERNAME     |                                             |
| `DEPT` (5)       | `DEPT`       | DEPT          | Free text (`SAT,MON`)                       |
| `ARRV` (6)       | `ARRV`       | ARRV          | Free text                                   |
| `dtPick(0)`      | `VALIDITY`   | VALIDITY      | ISO date (YYYY-MM-DD)                       |
| `dtChk(0)`       | `LASTUPD`    | LASTUPD       | ISO date or `null`                          |
| `TRANSIT` (9)    | `TRANSIT`    | TRANSIT       | Integer (days)                              |
| `LOADPORT` (11)  | `LOADPORT`   | LOADPORT      | Port code (lookup OPPORT)                   |
| (12)             | `LOADPORTNAME` | LOADPORTNAME |                                             |
| `DISPORT` (13)   | `DISPORT`    | DISPORT       |                                             |
| (14)             | `DISPORTNAME` | DISPORTNAME  |                                             |
| `FINALPORT` (15) | `FINALPORT`  | FINALPORT     | **Required**                                |
| (16)             | `FINALPORTNAME` | FINALPORTNAME |                                          |
| `TRANPORT` (17)  | `TRANPORT`   | TRANPORT      | Transhipment port                           |
| `TRANPORTNAME` (7) | `TRANPORTNAME` | TRANPORTNAME |                                          |
| `Country` (19)   | `COUNTRY`    | COUNTRY       | (auto from FINAL port country)              |
| `USERID` (10)    | `USERID`     | USERID        | Created by                                  |
| `GROUPID` (20)   | `GROUPID`    | GROUPID       |                                             |
| `xMemo(0)`       | `REMFCL`     | REMFCL        | TEXT — FCL remark                           |
| `xMemo(1)`       | `REMLCL`     | REMLCL        | TEXT — LCL remark                           |
| `Cmb(1)`         | `XCTNTYPE`   | XCTNTYPE      | Header container type (Dry/RF/...)          |
| `xCTN20` (21)    | `XCTN20`     | XCTN20        | String (sum from costs[] via Apply to total)|
| `xCTN40` (22)    | `XCTN40`     | XCTN40        |                                             |
| `xCTN40HC` (23)  | `XCTN40HC`   | XCTN40HC      |                                             |
| `xCTN45` (24)    | `XCTN45`     | XCTN45        |                                             |
| `XLCL` (25)      | `XLCL`       | XLCL          |                                             |
| `Cmb(4)`         | `CYTERM`     | CYTERM        | Shown for SLN/AEL/SLN2/ALP companies only   |
| `Lock`           | `LOCK`       | LOCK          | Optimistic-lock timestamp (Number)          |

## SFRATED → rates[i].costs[]

| VB6 (ColGrd1)   | JSON         | DB        | Notes                                  |
|-----------------|--------------|-----------|----------------------------------------|
| `colPMKEY`      | `PMKEY`      | PMKEY     | IDENTITY                               |
| `colMode`       | (in-memory)  | —         | `A`/`O`/`E`/`D` — only used in UI      |
| (seq)           | `SEQNO`      | SEQNO     | Set on save (1..n)                     |
| `colExpCode`    | `EXPCODE`    | EXPCODE   | Service code (combo)                   |
| `colEXPDESC1`   | `EXPDESC1`   | EXPDESC1  | Auto-filled from `services[]`          |
| `colITEMCURR`   | `ITEMCURR`   | ITEMCURR  | USD / THB                              |
| `colUOM`        | `UOM`        | UOM       | CTN / BL / KG / etc.                   |
| `colCTNType`    | `CTNTYPE`    | CTNTYPE   | Dry / OT / FR / ...                    |
| `colCTN20`      | `CTN20`      | CTN20     | Integer                                |
| `colCTN40`      | `CTN40`      | CTN40     |                                        |
| `colCTN40HC`    | `CTN40HC`    | CTN40HC   |                                        |
| `colCTN45`      | `CTN45`      | CTN45     |                                        |
| `colLCL`        | `LCL`        | LCL       |                                        |
| `colVatRate`    | `VATRATE`    | VATRATE   | Money                                  |
| `colVATINOUT`   | `VATINOUT`   | VATINOUT  | 1 = include, 0 = exclude               |
| `colWTRATE`     | `WTRATE`     | WTRATE    | Money                                  |

## SFRATED2 → rates[i].sellings[]

โครงสร้างเหมือน `costs[]` ทั้งหมด — ใช้เฉพาะบริษัทที่เป็น Liner (`gcCompanyID ∈ SLN/AEL/SLN2/ALP`).
สำหรับ DEMO ปิดด้วย `company.EnableSelling = false` → ตัวอย่าง mockup ไม่แสดง Selling tab.

## พฤติกรรมสำคัญที่จำลองไว้

| ฟอร์มเดิม                            | Mockup                                                     |
|--------------------------------------|------------------------------------------------------------|
| Tab `Carrier/Agent/Destination`     | Tab strip ด้านบน + filter ตาม LINERNAME / AGENTNAME / FINALPORT |
| Search ตาม `VALIDITY` range          | Checkbox + 2 date pickers (เปิด/ปิดได้)                    |
| Master grid + DblClick → Detail pane | `ondblclick` row → เปิด `#detailPane` (slide-in ขวา)       |
| Optimistic lock (Lock = CDbl(Now))   | `LOCK` field (number) อัปเดตทุกครั้งที่ Save                |
| Copy = duplicate + mark Add          | `copyDetail()` → ใหม่ RATEID + `state.addMode = true`      |
| Apply to total >>>                   | `applyToTotal()` รวม costs[].CTN20..LCL → XCTN20..XLCL     |
| Save transaction (3 tables)          | ทำใน object เดียว แล้ว persist → localStorage              |
| Delete = delete SFRATED + D2 + RATE  | `deleteDetail()` ลบ rate object ออกจาก `rates[]`           |
| Validation: FINAL PORT required      | เช็คก่อน save, ขึ้น toast + red border                     |
| Auto-fill port name on code change   | onInput → ค้น `masters.ports` → เติม *PORTNAME              |
| F5 / Popup lookup (frmSMBusiness, frmOPPort) | ปุ่ม 🔍 → เปิด lookup modal                            |

## Persist

- บันทึกอัตโนมัติเข้า `localStorage` key `sfSeaRate.mockup.v1`
- ปุ่ม **⬇ Export JSON** ดาวน์โหลด `data.json` ปัจจุบัน
- ปุ่ม **↺ Reset Seed** ล้าง localStorage + reload จาก `data.json`
