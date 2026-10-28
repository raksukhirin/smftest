# Vessel Schedule — Schema Redesign Analysis

How to evolve the **input** screen (`frmSFSched` → `SFVSED`, flat) so it can feed
the **search/detail** screen (`frmSFVSLSched`, relational voyage model).
**Scope: schedule only — bookings (SFBOOK/SFBOOKDETAIL) are out of scope.**

DDL + migration: see **`schema_voyage.sql`** (validated against the live DB).

---

## 1. Reuse what already exists

| Search-model entity | Existing table | Key / notes |
|---|---|---|
| `vessels` | **SFVESSEL** | PMKEY, VSLCODE, VESSEL, VSLTYPE (V/F), CALLSIGN — **extend** (IMO/carrier/type/status) |
| `carriers` | **SMBUSINESS** where `VENDCLASS='SEALINE'` | COMNO (key), COMNAME, **SCAC**, **LINERCODE** — no new table |
| `ports` | **OPPORT** where `PORTTYPE='SF'` (34,240 rows) | PORTCODE, PORTNAME, COUNTRYCODE, COUNTRY, INACTIVE — no SFPORT |
| flat schedule line | **SFVSED** | becomes the source for migration → SFVOYAGE |

Confirmed against live data:
- `SFVSED.LINERNO` already holds a real `SMBUSINESS.COMNO` (e.g. `201526`).
- `SFVSED.*PORTNAME` is denormalised and **dirty** (e.g. `SINGAPORE,ZZZZZZZZZZ`)
  → resolve names from **OPPORT** going forward.

> OPPORT has `COUNTRYCODE`/`COUNTRY` but **no TIMEZONE**. The search UI shows each
> port's local clock from the ISO offset stored on the voyage/cut-off times, so a
> timezone master column is optional (`schema_voyage.sql` adds `OPPORT.TIMEZONE`
> only if you prefer mastering it).

## 2. New tables (4)

```
SFSERVICELANE ─┐ (optional service/string master)
               │
SFVOYAGE ──────┤  header: vessel, carrier(LINERNO→SMBUSINESS), service,
   1            │  voyageNo, direction, POL/POD, ETD, ETA, transitDays, scheduleStatus
   │            │
   │ 1..*       └── refs OPPORT(SF) for POL/POD, SFVESSEL for VSLCODE
   ▼
SFVOYAGEPORT      rotation: seq, port(→OPPORT), moveType(Load/Transship/Discharge),
   │              ETA, ETD, terminal, berth, status
   │ 0..*
   ▼
SFCUTOFF          deadlines: type(SI/VGM/CY/Customs), datetime, status, remark
                  (VOYAGEID + optional VOYAGEPORTID = the Load call)
```

- **SFVOYAGE** — voyage header; replaces the flat SFVSED row. POL/POD/Transit are
  *derived* (first Load / last Discharge) but cached for fast search & legacy view.
- **SFVOYAGEPORT** — the genuinely new capability: multi-leg rotation with
  transshipment, per-call ETA/ETD, terminal & berth (none of this exists today).
- **SFCUTOFF** — structured SI/VGM/CY/Customs deadlines (today only CY/CFS dates
  exist, and only at booking level — out of scope here).
- **SFSERVICELANE** — service master (optional; voyage can also store free text).

## 3. Extend existing tables

| Table | Add | Why |
|---|---|---|
| **SFVESSEL** | `IMONO`, `CARRIERNO`(→SMBUSINESS.COMNO), `VESSELTYPE`, `STATUS` | vessel lookup must auto-fill carrier + IMO on the voyage header |
| **OPPORT** | `TIMEZONE` *(optional)* | only if mastering port-local time |

## 4. `frmSFSched` input-screen changes → Voyage master-detail

Today: one flat row (1 carrier + 1 vessel/voyage + 1 origin→final + dep/arr/transit).
Target: a **header + two sub-grids**.

1. **Header = Voyage** — Carrier (lookup SMBUSINESS `VENDCLASS='SEALINE'`),
   Vessel (lookup SFVESSEL → auto Carrier + IMO), Voyage No, Direction,
   Service Lane, Schedule status.
2. **Sub-grid 1 · Port Rotation** → `SFVOYAGEPORT`. Add/remove calls: Seq, Port
   (lookup **OPPORT PORTTYPE='SF'**), Move Type, ETA, ETD, Terminal, Berth,
   Status. **POL / POD / Transit auto-derive** from first Load / last Discharge.
3. **Sub-grid 2 · Cut-offs** → `SFCUTOFF`. SI / VGM / CY / Customs + datetime +
   status, linked to the Load call.
4. **ETD/ETA become datetime (date + time)** — current UI is date-only + transit.
5. Add **Schedule status** (On Schedule / Delayed).
6. **frmSFVessel** (vessel master) gains IMO / Carrier / Type / Status fields.

## 5. Migration & backward compatibility

`schema_voyage.sql` does, idempotently:
1. ALTER masters (SFVESSEL, OPPORT).
2. CREATE SFSERVICELANE, SFVOYAGE, SFVOYAGEPORT, SFCUTOFF.
3. **Migrate** every `SFVSED` row → 1 `SFVOYAGE` + 2 `SFVOYAGEPORT`
   (Load = LOADPORT @ DEPDATE, Discharge = FINALPORT @ ARRDATE), reusing `DETID`
   as `VOYAGEID` to preserve linkage. Cut-offs start empty (entered going forward).

**Legacy readers of SFVSED**: a read-only view (commented in `schema_voyage.sql`)
re-projects SFVOYAGE back to the old SFVSED shape (DEPDAY/ARRDAY via `DATENAME`).
Because a join-view isn't updatable, the recommended cut-over is:
- **Phase 1** — keep `SFVSED` as a real table; new `frmSFSched` writes BOTH SFVSED
  (summary) and SFVOYAGE/SFVOYAGEPORT, so nothing breaks.
- **Phase 2** — once all writers use the voyage model, rename `SFVSED` → `SFVSED_OLD`
  and replace it with the view (read-only) for any remaining reports/rate links.

## 6. Net change

| | Count |
|---|---|
| New tables | **4** (SFVOYAGE, SFVOYAGEPORT, SFCUTOFF, SFSERVICELANE) |
| Extended tables | **1–2** (SFVESSEL; OPPORT optional) |
| Reused as-is | SMBUSINESS (carriers), OPPORT (ports) |
| Screens reworked | `frmSFSched` → master-detail; `frmSFVessel` → +4 fields |
