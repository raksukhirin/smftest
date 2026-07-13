# frmFPIKnowledgeSearch — AI Knowledge Search

หน้าจอที่ 6 จาก 6 ของ **FPI (Freight Pricing Intelligence)** — ดู [`../CLAUDE.md`](../CLAUDE.md)
อ้างอิงหลัก: [`../FPI_Design_v0.3_Freeze_Candidate.md`](../FPI_Design_v0.3_Freeze_Candidate.md) §5.4 / §8 · D11

> **ถามภาษาธรรมชาติ → ตอบพร้อมอ้างอิงเสมอ** (RateNo / เลขเอกสาร / วันที่)
> Traceability ทั้ง **Tier 1 (Rate KB, authoritative)** และ **Tier 2 (ประวัติ, indicative · ห้าม Auto-fill · D11)**

| | |
|---|---|
| Theme accent | 🟣 Purple (`bg-purple-700`) |
| Namespace | `window.KB` (view + engine) — reuse `RM` + `BG` |
| Data | `../data/*.json` · fallback `../frmFPIQuoteGen/data.js` (มีครบ 9 ไฟล์) |
| Persistence | ไม่มี — read-only |

---

## รัน

```bash
cd D:/DEV.AI/SMP.AI/mockup/FPI
python -m http.server 8763
# → http://localhost:8763/frmFPIKnowledgeSearch/index.html
```

---

## "AI" คืออะไรในเฟส mockup

**Rule-based intent matcher ที่โปร่งใส** (ไม่มี LLM) — เลือกเพราะ:
1. ตรวจสอบได้ 100% (ทุกคำตอบมาจาก data จริง + citation)
2. รันได้ทันทีไม่ต้องต่อ API
3. บังคับวินัย "ตอบพร้อมอ้างอิงเสมอ" ตั้งแต่ mockup

```
query(q) → extract entities (port/carrier/customer/doc/mode/service)
         → classify intent (keyword rules)
         → handler → { title, html, citations[], tier, followups[] }
```

### จุดต่อ LLM/MCP จริง (ออกแบบไว้แล้ว)

`KB.engine.query()` คืน shape เดียว — เปลี่ยน classifier/handlers เป็น
**LLM + tool-calls** (เช่น query `smfdb` ผ่าน MCP) ที่คืน shape เดิม → **UI ไม่ต้องแก้**
ความต้องการ "ทุกคำตอบต้องมี `citations[]`" คือ contract ที่ LLM ต้องทำตาม (grounding + traceability)

---

## Intent ที่รองรับ (mockup)

| Intent | ตัวอย่างคำถาม | Tier | อ้างอิง |
|---|---|---|---|
| `rate_availability` | "มี rate FCL Laem Chabang ไป Hamburg ไหม" | 1 | RateNo + validity + source |
| `compare` | "THLCH DEHAM rate ไหนถูกสุด" | 1 | RateNo แต่ละใบ |
| `history` | "THLCH SGSIN เคยจ่ายเท่าไหร่" | **2** | JobNo + วันที่ + reliability (⚠ indicative) |
| `margin_reco` | "C-BRAVO ควรบวก margin เท่าไหร่" | 1 | MarginRule + CustomerProfile |
| `expiry` | "rate ไหนใกล้หมดอายุ" | 1 | RateNo + AlertType |
| `at_risk` | "quote ไหน rate ตายแล้ว" | 1 | Quote + Rate (D2) |
| `rate_lookup` | "FR-2607-00007 คืออะไร" | 1 | RateNo |
| `quote_lookup` | "QSE26080001" | 1 | Quote |
| `booking_lookup` | "BSE26090004 margin เท่าไหร่" | 1 | Booking |
| `unknown` | (อื่น ๆ) | — | แนะนำคำถามที่ตอบได้ |

รองรับชื่อเมือง (Laem Chabang→THLCH, Hamburg→DEHAM, ...) และ carrier/customer เป็นภาษาคน

---

## Reuse — ไม่มี engine ซ้ำ

| ใช้จาก | ทำอะไร |
|---|---|
| `RM.alerts` (Rate Mgmt) | expiry / active |
| `BG.profit` (Booking Gate) | margin ของ booking |
| `BG.autofill.walkChain` (Booking Gate) | D2 chain walk |
| `BG.state.marginRule` | เกณฑ์ margin ต่อลูกค้า |

`src/kb.js` = intent + handlers · `src/helpers.js` = Tier-2 history lookup (compact) + D2 risk
`app.js` = chat UI

> Tier-2 history helper เขียนใหม่แบบย่อ (QuoteGen `QG.history` ผูกกับ `QG.state` โหลดแยกไม่คุ้ม) — logic เดียวกัน (classify outlier/no-lane + median + reliability)

---

## ไฟล์

```
frmFPIKnowledgeSearch/
├── index.html   chat UI (input + suggestions + messages)
├── style.css    theme purple + citation chips + tier badges
├── mapping.md   intent ↔ data source
└── src/
    ├── kb.js       ⭐ query engine: entity extract + intent classify + handlers (คืน citations เสมอ)
    ├── helpers.js  Tier-2 history + D2 risk (reuse BG.autofill)
    └── app.js      chat render + boot
```

---

## Data

ไม่แก้ `../data/` — ใช้ที่มีอยู่ทั้งหมด (rates 9, quotes 4, bookings 7, lane_history 31)
โหลดผ่าน loader ของตัวเอง (KB.engine.load) แล้ว share `db` ให้ `BG.state` เห็น (ไม่ fetch ซ้ำ)

---

## ยังไม่ได้ทำ (จุดต่อ LLM จริง)

- **LLM/MCP** — ตอนนี้ rule-based; ต่อ `smfdb` ผ่าน `mcp__smfdb__execute-readonly-sql` ได้ที่ `KB.engine.query()`
- **Multi-hop / คำถามซับซ้อน** — เช่น "ลูกค้ารายนี้ lane ไหนกำไรดีสุด" (ต้อง join หลายชั้น) — rule matcher ทำ single-intent
- **ความกำกวม** — ยังไม่ถามกลับเมื่อ entity ไม่ครบ (เช่น margin โดยไม่ระบุลูกค้า → แสดง chip ให้เลือก)
- **สะกดผิด / ภาษาปน** — keyword match ตรงตัว ยังไม่มี fuzzy
