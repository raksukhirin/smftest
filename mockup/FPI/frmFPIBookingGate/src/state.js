/* state.js — dataset loader + margin-rule resolution + booking workflow state.
   Data loads from ../data/*.json when served over http(s); falls back to the
   embedded copy in data.js so the mockup also runs by double-clicking index.html. */
window.BG = window.BG || {};
window.BG.state = (function () {
    'use strict';

    const DATA_FILES = [
        'charge_policy', 'customer_profiles', 'local_charge_tariff', 'margin_rules',
        'rate_charges', 'rate_headers', 'quotations', 'bookings'
    ];
    const camel = s => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const LS_KEY = 'fpi_booking_gate_v1';

    const db = {};
    const state = {
        source: 'embedded',
        activeDocNo: null,
        /** Simulated "previously approved" context for the tolerance demo (§6.2 PASS-Tol). */
        prevSim: { on: false, pct: 8.0 }
    };

    /** Per-booking workflow state, persisted so a Confirm/Approve survives reload.
        Shape: { [docNo]: { docStat, marginPct, isProApp, isCreditApp, log:[{action,at,note}] } } */
    let workflow = {};

    function loadWorkflow() {
        try { workflow = JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
        catch (_) { workflow = {}; }
    }
    function saveWorkflow() {
        try { localStorage.setItem(LS_KEY, JSON.stringify(workflow)); } catch (_) {}
    }
    function wf(docNo) {
        if (!workflow[docNo]) {
            workflow[docNo] = { docStat: 'Open', marginPct: null, isProApp: false, isCreditApp: false, log: [] };
        }
        return workflow[docNo];
    }
    function resetWorkflow(docNo) {
        delete workflow[docNo];
        saveWorkflow();
    }
    function resetAllWorkflow() {
        workflow = {};
        saveWorkflow();
    }

    async function load() {
        loadWorkflow();
        try {
            const parts = await Promise.all(DATA_FILES.map(f =>
                fetch('../data/' + f + '.json').then(r => {
                    if (!r.ok) throw new Error(r.status);
                    return r.json();
                })
            ));
            DATA_FILES.forEach((f, i) => { db[camel(f)] = parts[i]; });
            state.source = '../data/*.json';
        } catch (_) {
            Object.assign(db, BG.seed);
            state.source = 'data.js (embedded)';
        }
        return db;
    }

    /* ---------- lookups ---------- */

    const booking  = no => db.bookings.find(b => b.docNo === no) || null;
    const customer = no => db.customerProfiles.find(c => c.customerNo === no) || null;
    const rate     = id => db.rateHeaders.find(r => r.rateId === id) || null;
    const quote    = no => db.quotations.find(q => q.docNo === no) || null;

    /** IsRebate for a charge (KB/REB). vFPI_BookProfit keys on (SubSysName,JobClass,ExpCode);
        the booking lines omit SubSysName, and IsRebate is consistent across subsystems for a
        given ExpCode, so match on (JobClass, ExpCode). */
    function isRebateCharge(jobClass, expCode) {
        return db.chargePolicy.some(p => p.jobClass === jobClass && p.expCode === expCode && p.isRebate);
    }

    /**
     * Resolve the MarginRule for a booking (§6.2 proc: customer = SHIPPER when EX, CONSIGNEE when IM).
     * Evaluated as-of TODAY (the gate runs at Confirm time), priority ascending.
     */
    function marginRule(booking) {
        const custNo = booking.jobClass === 'IM' ? booking.consignee : booking.shipper;
        const cust = customer(custNo);
        const asOf = BG.utils.todayISO();
        const scoped = db.marginRules.filter(r => {
            if (!r.isActive) return false;
            if (!BG.utils.inRange(asOf, r.validFrom, r.validTo)) return false;
            if (r.scopeCustomerNo && r.scopeCustomerNo !== custNo) return false;
            if (r.scopeTier && (!cust || r.scopeTier !== cust.tier)) return false;
            if (r.scopeJobClass && r.scopeJobClass !== booking.jobClass) return false;
            if (r.scopePOL && r.scopePOL !== booking.loadPort) return false;
            if (r.scopePOD && r.scopePOD !== booking.finalPort) return false;
            return true;
        });
        scoped.sort((a, b) => a.priority - b.priority);

        let rule = scoped[0];
        if (!rule) {
            rule = Object.assign({}, db.marginRules.find(r => r.ruleId === 'MR-DEFAULT'), { _outOfValidity: true });
        }
        if (cust && cust.marginOverridePct != null) {
            return Object.assign({}, rule, { minMarginPct: cust.marginOverridePct, _overriddenBy: custNo, _cust: cust });
        }
        return Object.assign({}, rule, { _cust: cust });
    }

    return {
        db, state, load,
        booking, customer, rate, quote, isRebateCharge, marginRule,
        wf, saveWorkflow, resetWorkflow, resetAllWorkflow
    };
})();
