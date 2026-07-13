/* helpers.js — Tier-2 history lookup + D2 quote-at-risk, for the Knowledge Search.
   Kept compact and separate so kb.js stays about intents. Reuses BG.autofill for
   the Superseded Chain walk (§4.3) — no chain logic duplicated. */
window.KB = window.KB || {};

/* ---------------- Tier 2 lane history (§5.4 / D11) ---------------- */
window.KB.history = (function () {
    'use strict';
    const round = (v, n) => BG.utils.round(v, n);
    const median = arr => {
        if (!arr.length) return null;
        const s = arr.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    const classify = r => (!r.loadPort || !r.disPort) ? 'NO_LANE'
        : (r.qty > 5000 || Math.abs(r.amtTHB) > 1e6) ? 'OUTLIER' : 'OK';
    const unit = r => (r.qty ? r.amtTHB / r.qty : r.amtTHB);
    const TIER = { POSTED: 1, JOB_ENTRY: 2, BOOKING: 3, QUOTE: 4, LEGACY: 5 };

    function lookup(pol, pod) {
        const all = (KB.engine.db().laneHistory || []).map(r => Object.assign({ _flag: classify(r) }, r));
        const usable = all.filter(r => r._flag === 'OK' && r.loadPort === pol && r.disPort === pod);
        const bucket = kind => {
            const by = {};
            usable.filter(r => r.sourceKind === kind).forEach(r => (by[r.expCode] = by[r.expCode] || []).push(r));
            return Object.keys(by).sort().map(code => {
                const rs = by[code].slice().sort((a, b) => String(b.refDate).localeCompare(String(a.refDate)));
                const u = rs.map(unit);
                return {
                    expCode: code, count: rs.length, lastDate: rs[0].refDate, lastJobNo: rs[0].jobNo,
                    lastUnitTHB: round(unit(rs[0]), 2), medianUnitTHB: round(median(u), 2),
                    reliability: rs.map(r => r.reliability).sort((a, b) => (TIER[a] || 9) - (TIER[b] || 9))[0]
                };
            });
        };
        return {
            sell: bucket('JOB_SELL'), cost: bucket('JOB_COST'),
            outliersOnLane: all.filter(r => r._flag === 'OUTLIER' && r.loadPort === pol && r.disPort === pod),
            noLaneCount: all.filter(r => r._flag === 'NO_LANE').length
        };
    }
    return { lookup, classify };
})();

/* ---------------- D2: quotes whose source rate is dead as-of ---------------- */
window.KB.dashRisk = function (asOf) {
    'use strict';
    const db = KB.engine.db();
    const round = (v, n) => BG.utils.round(v, n);
    const out = [];
    (db.quotations || []).forEach(q => {
        if (!(asOf >= q.validFrom && asOf <= q.validTo)) return;
        (q.options || []).forEach(opt => {
            const rate = BG.state.rate(opt.rateId);
            if (!rate) return;
            const reason = BG.autofill.inactiveReason(rate, asOf);
            if (!reason) return;
            const walk = BG.autofill.walkChain(rate, asOf);
            const cur = walk.resolved ? walk.rate : null;
            const ql = (opt.lines || []).find(l => l.expCode.indexOf('FRT') === 0);
            const container = ql && ql.expCode.indexOf('40H') !== -1 ? '40HQ' : ql && ql.expCode.indexOf('20') !== -1 ? '20GP' : '40HQ';
            let deltaTHB = null;
            if (cur && ql && ql.rateRef) {
                const cf = db.rateCharges.find(c => c.rateId === cur.rateId && c.category === 'FREIGHT' &&
                    (!c.containerType || c.containerType === container));
                if (cf && cf.currencyCode === ql.rateRef.costRefCurrency)
                    deltaTHB = round((cf.amount - ql.rateRef.costRefAmount) * (ql.rateRef.costRefFxToTHB || 1), 2);
            }
            out.push({ quote: q, option: opt, rate, reason, currentRate: cur, deltaTHB });
        });
    });
    return out.sort((a, b) => (!a.currentRate !== !b.currentRate) ? (a.currentRate ? 1 : -1) : (b.deltaTHB || 0) - (a.deltaTHB || 0));
};
