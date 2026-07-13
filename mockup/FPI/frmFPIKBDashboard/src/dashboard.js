/* dashboard.js — KB roll-up (no DOM). Reuses the engines from the other FPI screens:
     RM.alerts       — vFPI_RateAlert / vFPI_ActiveRate      (from frmFPIRateMgmt)
     BG.profit       — vFPI_BookProfit / evaluate            (from frmFPIBookingGate)
     BG.autofill     — Superseded Chain walk (§4.3)          (from frmFPIBookingGate)
     BG.state        — dataset + marginRule + rate/quote     (from frmFPIBookingGate)
   Nothing here re-implements margin, alert, or chain logic. */
window.KB = window.KB || {};
window.KB.dashboard = (function () {
    'use strict';

    const round = (v, n) => { const f = Math.pow(10, n || 0); return Math.round((v + Number.EPSILON) * f) / f; };

    function db() { return BG.state.db; }

    function freightOf(rateId, containerType) {
        const c = db().rateCharges.find(x => x.rateId === rateId && x.category === 'FREIGHT' &&
            (!x.containerType || x.containerType === containerType));
        return c ? { amount: c.amount, currency: c.currencyCode } : null;
    }

    /* ---------------- Rate health ---------------- */

    function rateHealth(asOf) {
        const rates = db().rateHeaders;
        const byStatus = {};
        rates.forEach(r => { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });
        const active = rates.filter(r => RM.alerts.isActive(r, asOf));
        const scan = RM.alerts.scan(rates, asOf);
        return {
            total: rates.length, byStatus,
            active: active.length,
            expiring: scan.EXPIRING_7D.length,
            expired: scan.EXPIRED.length,
            staleDraft: scan.STALE_DRAFT_30D.length,
            noSource: scan.NO_SOURCE_REF.length,
            scan
        };
    }

    /* ---------------- Quotes at risk (D2) ----------------
       Active quotation whose source Rate is EXPIRED/SUPERSEDED as-of the date.
       Walk the chain to the current rate and show the cost delta the customer's
       locked sell price now has to absorb. */

    function quotesAtRisk(asOf) {
        const out = [];
        db().quotations.forEach(q => {
            const quoteActive = asOf >= q.validFrom && asOf <= q.validTo;
            if (!quoteActive) return;
            (q.options || []).forEach(opt => {
                const rate = BG.state.rate(opt.rateId);
                if (!rate) return;
                const reason = BG.autofill.inactiveReason(rate, asOf);
                if (!reason) return;                       // rate still usable → not at risk

                const walk = BG.autofill.walkChain(rate, asOf);
                const cur = walk.resolved ? walk.rate : null;

                // freight cost delta per container (native currency of the freight line)
                const container = firstContainer(opt);
                const quoteFreight = quoteFreightCost(opt);
                const curFreight = cur ? freightOf(cur.rateId, container) : null;
                let deltaNative = null, deltaTHB = null;
                if (quoteFreight && curFreight && quoteFreight.currency === curFreight.currency) {
                    deltaNative = round(curFreight.amount - quoteFreight.amount, 2);
                    deltaTHB = round(deltaNative * (quoteFreight.fx || 1), 2);
                }

                out.push({
                    quote: q, option: opt, rate, reason,
                    daysQuoteLeft: RM.utils.daysBetween(asOf, q.validTo),
                    chain: walk.chain,
                    currentRate: cur,                       // null = no replacement (cost unconfirmed)
                    container,
                    deltaNative, deltaCurrency: quoteFreight ? quoteFreight.currency : null, deltaTHB
                });
            });
        });
        // worst first: no-replacement, then biggest positive delta
        out.sort((a, b) => {
            if (!a.currentRate !== !b.currentRate) return a.currentRate ? 1 : -1;
            return (b.deltaTHB || 0) - (a.deltaTHB || 0);
        });
        return out;
    }

    function firstContainer(opt) {
        const l = (opt.lines || []).find(x => /40|20|45|RF/.test(x.expCode) || x.expCode.indexOf('FRT') === 0);
        // map freight expCode to a container guess
        if (!l) return '40HQ';
        return l.expCode.indexOf('40H') !== -1 ? '40HQ' : l.expCode.indexOf('40') !== -1 ? '40GP' :
               l.expCode.indexOf('20') !== -1 ? '20GP' : '40HQ';
    }
    function quoteFreightCost(opt) {
        const l = (opt.lines || []).find(x => x.expCode.indexOf('FRT') === 0);
        if (!l || !l.rateRef) return null;
        return { amount: l.rateRef.costRefAmount, currency: l.rateRef.costRefCurrency, fx: l.rateRef.costRefFxToTHB };
    }

    /* ---------------- Margin health (over bookings) ---------------- */

    function marginHealth() {
        const byVerdict = { PASS: 0, NEED_APPROVE: 0, BLOCKED: 0 };
        const pctList = [];
        db().bookings.forEach(b => {
            const p = BG.profit.bookProfit(b);
            const v = BG.profit.evaluate(p, BG.state.marginRule(b), null);
            byVerdict[v.result] = (byVerdict[v.result] || 0) + 1;
            if (v.result !== 'BLOCKED') pctList.push(v.marginPct);
        });
        const avg = pctList.length ? round(pctList.reduce((s, x) => s + x, 0) / pctList.length, 2) : null;
        return {
            count: db().bookings.length, byVerdict,
            avgPct: avg,
            minPct: pctList.length ? round(Math.min.apply(null, pctList), 2) : null,
            maxPct: pctList.length ? round(Math.max.apply(null, pctList), 2) : null,
            pending: byVerdict.NEED_APPROVE
        };
    }

    /* ---------------- Top lanes ---------------- */

    function topLanes(asOf) {
        const m = {};
        const key = (a, b) => a + ' → ' + b;
        db().rateHeaders.forEach(r => {
            const k = key(r.pol, r.pod);
            (m[k] = m[k] || { lane: k, rates: 0, active: 0, bookings: 0 });
            m[k].rates++;
            if (RM.alerts.isActive(r, asOf)) m[k].active++;
        });
        db().bookings.forEach(b => {
            const k = key(b.loadPort, b.finalPort);
            (m[k] = m[k] || { lane: k, rates: 0, active: 0, bookings: 0 });
            m[k].bookings++;
        });
        return Object.values(m).sort((a, b) => (b.bookings - a.bookings) || (b.rates - a.rates));
    }

    /* ---------------- Win rate ---------------- */

    function winRate() {
        const quotes = db().quotations;
        const bookedQuoteNos = new Set(db().bookings.map(b => b.refQtNo).filter(Boolean));
        const won = quotes.filter(q => bookedQuoteNos.has(q.docNo)).length;
        return { won, total: quotes.length, pct: quotes.length ? round(won * 100 / quotes.length, 0) : 0 };
    }

    /* ---------------- top-level ---------------- */

    function build(asOf) {
        return {
            asOf,
            rate: rateHealth(asOf),
            atRisk: quotesAtRisk(asOf),
            margin: marginHealth(),
            lanes: topLanes(asOf),
            win: winRate()
        };
    }

    return { build, rateHealth, quotesAtRisk, marginHealth, topLanes, winRate, freightOf };
})();
