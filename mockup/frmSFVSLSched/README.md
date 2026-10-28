# Vessel Schedule — Search & Detail (`frmSFVSLSched`)

Interactive **search/lookup** mock for Vessel Schedules — the read side that
complements the data-entry screen `../frmSFSched`. Built from the attached
relational model (`vessel_schedule_mockup.json`) and the `preview.html` layout,
made fully interactive (filtering + voyage selection + joined detail view).

> Sister mockups: `../frmSFSched` (schedule entry), `../frmSFSeaRate`, `../frmSFQuotation`.
> Same architecture (plain IIFE modules, inline `data.js`). Namespace: **`VSL`**.

## Run it
- **file://** — open `index.html` (seed inlined via `data.js`).
- **http://** — `python -m http.server 8754 --directory mockup/frmSFVSLSched`
  (launch config `vsl-sched-mockup`). `state.js` then `fetch('data.json')`.

## What it does
- **Left sidebar = search**: free text (vessel / voyage / carrier / service / port),
  Carrier, Schedule status, POL, POD, ETD date range, Clear. Results render as
  voyage cards (sorted by ETD), with live count.
- **Click a voyage** → main panel shows the joined detail:
  - **Header** — vessel / voyage / carrier / direction / service / IMO + status pills
  - **Summary cards** — POL, POD, Transit (ETD→ETA), Next Closing (earliest open cut-off)
  - **Route Timeline** — voyage ports in sequence (Load → Transshipment → Discharge)
  - **VoyagePort / Schedule** — ETA/ETD/move/status per call
  - **CutOff Control** — SI / VGM / CY / Customs with status pills; next cut-off flagged ▶
  - **Booking Usage** — bookings on the voyage with CBM / gross-weight totals (console planning)

## Data model (relational seed → joined in `state.js`)
```
carriers ─┐
vessels ──┤ (carrierId)
ports     │
serviceLanes
voyages ──┼─ vesselId, carrierId, serviceLaneId, polPortId, podPortId, etd, eta, transitDays,
          │   bookingStatus, scheduleStatus
voyagePorts ─ voyageId, sequenceNo, portId, moveType, eta, etd, terminal, berth, status
cutOffs    ── voyageId, voyagePortId, cutOffType, cutOffDateTime, status, remark
bookings   ── voyageId, customer, shipmentMode/container, pol, pod, cbm, weight, status, si, customs
```
`state.js` indexes each master by id and exposes resolvers + `voyageVM()` (the
join used by cards/header). See `mapping.md`.

## Five screens in this folder (shared data store)
| Page | Purpose | Namespace |
|---|---|---|
| **index.html** | Search & detail (read-only) — sidebar filters + voyage detail | `VSL` |
| **input.html** | **Voyage Entry (frmSFSched v2)** — master-detail data entry | `VSI` |
| **vessel.html** | **Vessel Master (frmSFVessel v2)** — vessel CRUD (IMO/Carrier/Type/Status) | `VSM` |
| **business.html** | **Business File (frmSMBusiness instance = Carrier/SEALINE)** — carrier CRUD | `VSB` |
| **port.html** | **Port Master (frmOPPort instance = PortType SF)** — port CRUD | `VSP` |

All five read/write the **same** store (`localStorage: sfVoyage.input.v1`,
seed-fallback). Masters flow downstream into the voyage:
**Business (carrier) + Vessel + Port → Voyage → Search.**
Add a carrier in `business.html` → it shows in the Vessel & Voyage carrier
dropdowns; add a port in `port.html` → it shows in the Voyage rotation dropdown;
add a vessel in `vessel.html` → it shows in the Voyage dropdown (auto-fills
Carrier+IMO); save a voyage in `input.html` → it shows in Search.
Cross-links sit in each sidebar header.

- `vessel.html` — based on `frmSFVessel.frm` (Vessel/Feeder + Call Sign) plus
  **IMO No, Carrier (→ SMBUSINESS), Vessel Type, Status**; delete guard mirrors
  `UseVessel()` (a vessel used by a voyage can't be deleted).
- `business.html` — based on `frmSMBusiness.frm`, **instanced to
  `VENDCLASS='SEALINE'`** so it is the Carrier Master. Edits `carriers[]` while
  preserving the keys other screens rely on (`carrierCode`=LINERCODE,
  `carrierName`=COMNAME, `scacCode`=SCAC) plus wider business fields
  (latin name, short code, EDI, business group, address/contact, notes).
  Delete guard: a carrier used by any vessel/voyage can't be deleted.
- `port.html` — based on `frmOPPort.frm` (itself an instanced form SF/AF/TS),
  **instanced to `PORTTYPE='SF'`** as the Sea-Freight port master. Edits
  `ports[]` (`portCode`=PORTCODE, `portName`=PORTNAME, `countryCode`=COUNTRYCODE,
  `country`=COUNTRY, `status`=INACTIVE) + a model-only `timezone` (not in OPPORT).
  AF/TS-only fields (Airport Name, Warehouse) are omitted. Real key is the
  composite (PORTTYPE, PORTCODE); the mockup keeps a `portId` surrogate. Delete
  guard: a port used by any voyage/rotation can't be deleted.

`input.html` is the re-worked input screen from `analysis.md`: a Voyage **header**
plus two editable sub-grids — **Port Rotation** (→ SFVOYAGEPORT) and **Cut-offs**
(→ SFCUTOFF). POL / POD / ETD / ETA / Transit **auto-derive** from the first Load
and last Discharge calls; selecting a vessel auto-fills Carrier + IMO. Add / edit /
delete / copy / export, persisted to its own localStorage key
(`sfVoyage.input.v1`) so it never disturbs the search mockup or `../frmSFSched`.

## Files
```
frmSFVSLSched/
├── index.html        # SEARCH shell: sidebar filters + #voyageList, main #detailRoot
├── input.html        # VOYAGE ENTRY shell (master-detail) + <template> form
├── style.css         # shared theme (dark sidebar, cards, timeline, status pills)
├── input.css         # entry-screen extras (form grid, editable sub-grids, toast)
├── data.json         # relational seed (the attached model)
├── data.js           # window.SEED_DATA (file:// support)
├── analysis.md       # schema redesign analysis (input → search model)
├── schema_voyage.sql # DDL + ALTER + migration from SFVSED (validated on live DB)
├── README.md / mapping.md
└── src/
    ├── utils.js      # VSL.utils  — DOM + ISO date formatting (keeps port-local clock)
    ├── state.js      # VSL.state  — seed, id-indexes, resolvers, voyageVM()
    ├── search.js     # VSL.search — filters, voyage list, selection
    ├── detail.js     # VSL.detail — header/summary/timeline/ports/cutoffs
    ├── app.js        # VSL.app    — search boot
    └── input/        # Voyage Entry + Vessel Master apps
        ├── util.js       # VSI.util   — DOM + datetime-local <-> stored ISO
        ├── store.js      # VSI.store  — shared store: voyages/ports/cutoffs + vessel CRUD
        ├── app.js          # VSI.app — Voyage Entry: header + 2 sub-grids + derive + save
        ├── vessel-app.js   # VSM     — Vessel Master: vessel CRUD + delete guard
        ├── business-app.js # VSB     — Business File (Carrier/SEALINE): carrier CRUD + delete guard
        └── port-app.js     # VSP     — Port Master (PortType SF): port CRUD + delete guard
```
Load order (vessel)   = `data.js → input/util → input/store → input/vessel-app`.
Load order (business) = `data.js → input/util → input/store → input/business-app`.
Load order (port)     = `data.js → input/util → input/store → input/port-app`.
Load order (search) = `utils → state → search → detail → app`.
Load order (input)  = `data.js → input/util → input/store → input/app`.

Run input screen: `python -m http.server 8754 --directory mockup/frmSFVSLSched`
then open `/input.html` (or open the file directly for file://).

## Wiring to back-end
Replace `state.loadSeed()` with your API. The relational shape maps to real
tables (Carrier, Vessel, ServiceLane, Voyage, VoyagePort, CutOff, Booking).
Search filters in `search.js → applyFilters()` are the query contract; the
detail joins in `state.js`/`detail.js` define the read model. ETD/ETA/cut-off
times are shown in their **port-local** clock (the ISO offset is preserved, not
converted to the browser timezone).
