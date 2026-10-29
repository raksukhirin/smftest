/* state.js — dataset loader + as-of date + status overrides (Confirm/Supersede).
   Data loads from ../data/*.json over http(s); falls back to embedded data.js for file://.
   Confirm/Supersede actions persist to localStorage as overrides on top of the seed. */
window.RM = window.RM || {};
window.RM.state = (function () {
    'use strict';

    const DATA_FILES = ['charge_policy', 'customer_profiles', 'local_charge_tariff', 'rate_charges', 'rate_headers'];
    const camel = s => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const LS_KEY = 'fpi_rate_mgmt_v1';

    const db = {};
    const state = {
        source: 'embedded',
        asOf: RM.utils.todayISO(),   // "GETDATE()" for vFPI_RateAlert / vFPI_ActiveRate
        filters: {},
        selected: new Set(),         // rateIds ticked for Compare
        activeRateId: null
    };

    /** Per-rate mutations from Confirm/Supersede — { [rateId]: { status, confirmedBy, confirmedAtUtc, supersededBy } } */
    let overrides = {};
    function loadOverrides() { try { overrides = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (_) { overrides = {}; } }
    function saveOverrides() { try { localStorage.setItem(LS_KEY, JSON.stringify(overrides)); } catch (_) {} }
    function resetOverrides() { overrides = {}; saveOverrides(); }

    async function load() {
        loadOverrides();
        try {
            const parts = await Promise.all(DATA_FILES.map(f =>
                fetch('../data/' + f + '.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })));
            DATA_FILES.forEach((f, i) => { db[camel(f)] = parts[i]; });
            state.source = '../data/*.json';
        } catch (_) {
            Object.assign(db, RM.seed);
            state.source = 'data.js (embedded)';
        }
        return db;
    }

    /** A rate with any Confirm/Supersede override applied on top of the seed. */
    function rate(rateId) {
        const base = db.rateHeaders.find(r => r.rateId === rateId);
        if (!base) return null;
        return overrides[rateId] ? Object.assign({}, base, overrides[rateId]) : base;
    }
    function rates() {
        return db.rateHeaders.map(r => (overrides[r.rateId] ? Object.assign({}, r, overrides[r.rateId]) : r));
    }
    function chargesOf(rateId) {
        return db.rateCharges.filter(c => c.rateId === rateId).sort((a, b) => a.seqNo - b.seqNo);
    }
    function customer(no) { return db.customerProfiles.find(c => c.customerNo === no) || null; }

    /* ---------- mutations ---------- */

    function confirm(rateId, user) {
        overrides[rateId] = Object.assign({}, overrides[rateId], {
            status: 'CONFIRMED', confirmedBy: user || 'PRICING_MGR',
            confirmedAtUtc: RM.utils.todayISO() + 'T00:00:00'
        });
        saveOverrides();
    }
    function cancel(rateId) {
        overrides[rateId] = Object.assign({}, overrides[rateId], { status: 'CANCELLED' });
        saveOverrides();
    }
    function setOverride(rateId, patch) {
        overrides[rateId] = Object.assign({}, overrides[rateId], patch);
        saveOverrides();
    }
    function hasOverride(rateId) { return !!overrides[rateId]; }

    return {
        db, state, load, rate, rates, chargesOf, customer,
        confirm, cancel, setOverride, hasOverride, resetOverrides
    };
})();
