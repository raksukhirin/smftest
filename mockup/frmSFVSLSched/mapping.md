# Field Mapping — Vessel Schedule Search (`frmSFVSLSched`)

UI element → seed entity/field. Seed = the attached relational model.

## Sidebar — search filters (`search.js → applyFilters`)
| Control | Filters on | Match |
|---|---|---|
| Search (text) | vessel, voyageNo, carrierCode/Name, serviceName/Code, polCode, podCode | contains (case-insensitive) |
| Carrier | `voyages.carrierId` | equals |
| Schedule | `voyages.scheduleStatus` | equals (On Schedule / Delayed) |
| POL (Origin) | `voyages.polPortId` | equals |
| POD (Dest.) | `voyages.podPortId` | equals |
| ETD From / To | `voyages.etd` (date part) | range (≥ / ≤) |

Voyage card: `vesselName`, `voyageNo`, `carrierCode`, `direction`, `polCode → podCode`,
`transitDays`, ETD, booking count, `scheduleStatus` pill.

## Detail — joined view (`state.voyageVM` + `detail.js`)
| Section | Source | Notes |
|---|---|---|
| Header | `voyages` + `vessels` + `carriers` + `serviceLanes` | vessel/voyage/carrier/direction/IMO/service + status pills |
| Summary · POL/POD | `ports[voyages.polPortId / podPortId]` | code + name |
| Summary · Transit | `voyages.transitDays`, `etd`, `eta` | |
| Summary · Next Closing | earliest `cutOffs` where `status ≠ Closed` | `state.nextCutOff()` |
| Route Timeline | `voyagePorts` (sorted by `sequenceNo`) | Load=green, Discharge=red, else transship |
| VoyagePort table | `voyagePorts` | seq, port, eta, etd, moveType, status |
| CutOff table | `cutOffs` (sorted by datetime) | type, datetime, status pill, remark; next row flagged ▶ |
| Booking table | `bookings` (where `voyageId`) | bookingNo, customer, mode (FCL qty×type / LCL), pol, pod, cbm, gross; **totals in tfoot** |

## Status → pill colour
| Field | Value → class |
|---|---|
| scheduleStatus / voyagePort.status | Delayed → warn; else ok/muted |
| cutOff.status | Closed → danger; Today → warn; Open → ok |
| booking status / siStatus / customsStatus | Confirmed → ok; Pending* → warn; Draft/Not Started → muted; else info |

## Date/time
All ETD/ETA/cut-off times render in the **port-local clock** taken literally from
the ISO offset (e.g. `2026-06-15T08:00:00+08:00` → `15 Jun 2026 08:00`), not
converted to the browser timezone (`utils.parts/fmtDateTime`).

---

## Booking Usage / Console Planning → `SFBOOK`
The detail panel's bookings come from the mockup `data.json → bookings[]`
(filtered by `voyageId` in `detail.bookingsHtml` / `state.bookingsOf`).
In production this is **`SFBOOK`** (header; `SFBOOKDETAIL` holds line goods, not
needed by the panel), linked to the voyage by **`SFBOOK.VOYAGEID`** (new FK; see
`booking_console.sql`). DDL + the projection/summary views are in
**`booking_console.sql`** (validated against the live DB).

| Panel field (`bookings[]`) | `SFBOOK` column | Note |
|---|---|---|
| `voyageId` | `VOYAGEID` (new FK → SFVOYAGE) | back-fill by `VESSEL`+`V_VOY`; set at entry going forward |
| `bookingNo` | `BOOKNO` | |
| `customerName` | `SHIPPERNAME` (EX) / `CONSIGNEENAME` (IM), fallback `CONAME` | `CONO/CONAME` often blank/`N/A` |
| `shipmentMode` | `LOADTYPE` | `%FCL%`→FCL, `%LCL%`/`CONSOLE`→LCL |
| `containerType` / `containerQty` | `CTNSIZE` / `CTNQTY` | or `CTN20/40/40HC/45` |
| `polPortId` / `podPortId` | `LOADPORT` / `FINALPORT` | port code (→ OPPORT) |
| `cbm` | `CBM` | |
| `grossWeightKg` | `GW` | |
| `status` | `DOCSTAT` | Open / Close / Confirm / Wait / Deleted |
| `siStatus` | ⚠️ **derived** — no native column | placeholder from `DOCSTAT`; add `SI_STATUS` if needed |
| `customsStatus` | ⚠️ **derived** from `CLEARDATE` | Cleared/Pending; add `CUSTOMS_STATUS` if needed |

Console totals (panel footer) = per-voyage roll-up in `vw_SFVOYAGE_CONSOLE`
(bookingCount, totalCbm, totalGrossKg, totalCtnQty).

> Scope note: bookings were excluded from the *schedule* schema redesign
> (`analysis.md`). This binding is additive — it only adds `SFBOOK.VOYAGEID` +
> read-only views, leaving the booking entry screens untouched.
