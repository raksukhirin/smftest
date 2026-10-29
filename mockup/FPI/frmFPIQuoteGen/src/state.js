/* state.js — dataset + app state + demo scenarios.
   Data loads from ../data/*.json when served over http(s); falls back to the
   embedded copy in data.js so the mockup also runs by double-clicking index.html. */
window.QG = window.QG || {};
window.QG.state = (function () {
    'use strict';

    const DATA_FILES = [
        'charge_policy', 'customer_profiles', 'lane_history', 'local_charge_tariff',
        'margin_rules', 'rate_charges', 'rate_headers', 'quotations', 'bookings'
    ];
    const camel = s => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

    /** Dataset — keys are camelCase of the JSON filenames. */
    const db = {};

    /** UI/working state. */
    const state = {
        source: 'embedded',      // 'fetch' | 'embedded'
        shipment: null,          // see input.js buildShipment()
        lanes: [],               // [{ pod, candidates:[opt], selectedRateId, reason, historyOnly }]
        activeLaneIdx: 0,
        overrides: {},           // `${rateId}|${lineKey}` -> { sellUnit, reason }
        addons: {},              // `${pod}|${tariffId}` -> true
        rateReason: {},          // `${pod}|${rateId}` -> reason (rank-skip / inactive rate)
        historyPicks: {},        // `${pod}` -> [expCode] chosen from Tier 2 history (D11)
        historyReason: {}        // `${pod}` -> reason for building the quote from history
    };

    /** Demo scenarios — each one exercises a specific decision in the design doc. */
    const SCENARIOS = [
        {
            id: 'A',
            label: 'A · Sea multi-lane — reproduce QSE26080001',
            note: 'C-BRAVO เลือก R-0001 (Contract ของ C-ALPHA + SUPERSEDED) → ต้องระบุเหตุผล 2 ชั้น',
            shipment: {
                customerNo: 'C-BRAVO', asOf: '2026-07-05', mode: 'SEA', jobClass: 'EX',
                serviceType: 'FCL', incoterm: 'FOB', pol: 'THLCH', pods: ['DEHAM', 'NLRTM'],
                containers: { '40HQ': 2 }, validFrom: '2026-07-05', validTo: '2026-09-30',
                showInactive: true, fx: { USD: 36.5 }
            },
            pick: { DEHAM: 'R-0001', NLRTM: 'R-0002' }
        },
        {
            id: 'B',
            label: 'B · Good / Better / Best — 3 carrier บน lane เดียว',
            note: 'DEHAM มี 3 Rate Active → Best=ทุนต่ำสุด, Good=เร็วสุด, Better=สมดุล; ⭐ = อันดับ D6',
            shipment: {
                customerNo: 'C-BRAVO', asOf: '2026-07-05', mode: 'SEA', jobClass: 'EX',
                serviceType: 'FCL', incoterm: 'FOB', pol: 'THLCH', pods: ['DEHAM'],
                containers: { '40HQ': 2 }, validFrom: '2026-07-05', validTo: '2026-09-30',
                showInactive: false, fx: { USD: 36.5 }
            }
        },
        {
            id: 'C',
            label: 'C · Superseded chain — as-of ก.ย. (R-0001 → R-0003)',
            note: 'R-0005/R-0006 หมดอายุ, R-0001 ถูกแทนที่ → เหลือ R-0003 + R-0007; ทุน OF ขึ้น 120 USD',
            shipment: {
                customerNo: 'C-BRAVO', asOf: '2026-09-12', mode: 'SEA', jobClass: 'EX',
                serviceType: 'FCL', incoterm: 'FOB', pol: 'THLCH', pods: ['DEHAM'],
                containers: { '40HQ': 2 }, validFrom: '2026-07-05', validTo: '2026-09-30',
                showInactive: true, fx: { USD: 36.5 }
            },
            pick: { DEHAM: 'R-0003' }
        },
        {
            id: 'D',
            label: 'D · Air take-lower + กับดัก AF/EX/FRT = PASS',
            note: '480 kg → ดันเป็น 500 kg × 138 = 69,000 (ถูกกว่า 480 × 150); ทุก charge เป็น PASS → Margin 0%',
            shipment: {
                customerNo: 'C-NOVA', asOf: '2026-07-08', mode: 'AIR', jobClass: 'EX',
                serviceType: 'AIRGEN', incoterm: 'FOB', pol: 'THBKK', pods: ['USLAX'],
                grossKg: 480, cbm: 0, containers: {}, validFrom: '2026-07-08', validTo: '2026-08-31',
                showInactive: false, fx: { USD: 36.5 }
            },
            pick: { USLAX: 'R-0004' }
        },
        {
            id: 'E',
            label: 'E · ไม่มี Rate ใน lane → ตกไป Tier 2 (ประวัติจริง)',
            note: 'THLCH→SGSIN ไม่มี Rate KB → แสดงราคาอ้างอิงจาก vFPI_LaneHistory (D11 ห้าม Auto-fill)',
            shipment: {
                customerNo: 'C-NOVA', asOf: '2026-07-08', mode: 'SEA', jobClass: 'EX',
                serviceType: 'FCL', incoterm: 'FOB', pol: 'THLCH', pods: ['SGSIN'],
                containers: { '20GP': 1 }, validFrom: '2026-07-08', validTo: '2026-08-31',
                showInactive: true, fx: { USD: 36.5 }
            }
        },
        {
            id: 'F',
            label: 'F · BadFx — สกุลต่างประเทศที่ FX = 0',
            note: 'ระบบเดิมเงินหายเงียบ; FPI ตี BLOCKED ตั้งแต่ตอนเสนอราคา (§6.2)',
            shipment: {
                customerNo: 'C-BRAVO', asOf: '2026-07-05', mode: 'SEA', jobClass: 'EX',
                serviceType: 'FCL', incoterm: 'FOB', pol: 'THLCH', pods: ['DEHAM'],
                containers: { '40HQ': 2 }, validFrom: '2026-07-05', validTo: '2026-09-30',
                showInactive: false, fx: { USD: 0 }
            }
        }
    ];

    async function load() {
        // Try the canonical JSON first so the mockup never silently drifts from ../data/
        try {
            const parts = await Promise.all(DATA_FILES.map(f =>
                fetch('../data/' + f + '.json').then(r => {
                    if (!r.ok) throw new Error(r.status);
                    return r.json();
                })
            ));
            DATA_FILES.forEach((f, i) => { db[camel(f)] = parts[i]; });
            state.source = '../data/*.json';
            return db;
        } catch (_) {
            Object.assign(db, QG.seed);
            state.source = 'data.js (embedded)';
            return db;
        }
    }

    /* ---------- indexed lookups ---------- */

    function policy(subSysName, jobClass, expCode) {
        return db.chargePolicy.find(p =>
            p.subSysName === subSysName && p.jobClass === jobClass && p.expCode === expCode) || null;
    }
    function customer(no) { return db.customerProfiles.find(c => c.customerNo === no) || null; }
    function rate(id)     { return db.rateHeaders.find(r => r.rateId === id) || null; }
    function chargesOf(rateId) {
        return db.rateCharges.filter(c => c.rateId === rateId).sort((a, b) => a.seqNo - b.seqNo);
    }

    /** Resolve the MarginRule for a customer (§3.4 priority: lowest number wins). */
    function marginRule(cust, shipment) {
        const asOf = shipment ? shipment.asOf : QG.utils.todayISO();
        const scoped = db.marginRules.filter(r => {
            if (!r.isActive) return false;
            if (!QG.utils.inRange(asOf, r.validFrom, r.validTo)) return false;
            if (r.scopeCustomerNo && (!cust || r.scopeCustomerNo !== cust.customerNo)) return false;
            if (r.scopeTier && (!cust || r.scopeTier !== cust.tier)) return false;
            if (shipment) {
                if (r.scopeMode && r.scopeMode !== shipment.mode) return false;
                if (r.scopeJobClass && r.scopeJobClass !== shipment.jobClass) return false;
                if (r.scopeServiceType && r.scopeServiceType !== shipment.serviceType) return false;
                if (r.scopePOL && r.scopePOL !== shipment.pol) return false;
            }
            return true;
        });
        scoped.sort((a, b) => a.priority - b.priority);

        let rule = scoped[0];
        if (!rule) {
            // No rule is in validity as-of this date. Never fail silently — MR-DEFAULT is used
            // but the UI must say so (a rule that starts after the quote it governs is a data bug).
            rule = Object.assign({}, db.marginRules.find(r => r.ruleId === 'MR-DEFAULT'), {
                _outOfValidity: true
            });
        }
        // FPI_CustomerProfile.MarginOverridePct overrides the rule's floor (C-STRAT = 6%)
        if (cust && cust.marginOverridePct != null) {
            return Object.assign({}, rule, {
                minMarginPct: cust.marginOverridePct,
                _overriddenBy: cust.customerNo
            });
        }
        return rule;
    }

    return { db, state, SCENARIOS, load, policy, customer, rate, chargesOf, marginRule };
})();
