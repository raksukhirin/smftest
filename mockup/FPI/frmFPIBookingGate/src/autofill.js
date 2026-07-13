/* autofill.js — Cost Auto-fill traceability + Delta Alert (no DOM).
   Re-derives, as-of the booking date, the Rate KB source behind each Cost line:
     - walks FPI_RateHeader.SupersededBy (§4.3) to the rate that was valid on DocDate
     - reports the cost snapshot the booking captured and the delta vs the quote (D8)
   The Superseded Chain / delta figures in bookings.json are treated as the source of
   truth; this module reproduces the walk so the UI can show *why* the cost moved. */
window.BG = window.BG || {};
window.BG.autofill = (function () {
    'use strict';

    const { round } = BG.utils;
    const DELTA_PCT = 3;        // D8
    const DELTA_THB = 2000;     // D8

    function inactiveReason(rate, asOf) {
        if (rate.status === 'SUPERSEDED') return 'SUPERSEDED';
        if (rate.status === 'EXPIRED') return 'EXPIRED';
        if (rate.status === 'DRAFT') return 'DRAFT';
        if (asOf < rate.validFrom) return 'NOT_YET_VALID';
        if (asOf > rate.validTo) return 'EXPIRED';
        return null;
    }

    /** Walk SupersededBy until a rate valid as-of `asOf` is found (max depth 10, §4.3). */
    function walkChain(rate, asOf) {
        const chain = [rate.rateId];
        let cur = rate;
        for (let i = 0; i < 10; i++) {
            if (!inactiveReason(cur, asOf)) return { rate: cur, chain, resolved: true };
            if (!cur.supersededBy) break;
            const next = BG.state.rate(cur.supersededBy);
            if (!next || chain.indexOf(next.rateId) !== -1) break;
            chain.push(next.rateId);
            cur = next;
        }
        return { rate: inactiveReason(cur, asOf) ? null : cur, chain, resolved: !inactiveReason(cur, asOf) };
    }

    function rateOfCharge(rateChargeId) {
        const rc = BG.state.db.rateCharges.find(c => c.rateChargeId === rateChargeId);
        return rc ? BG.state.rate(rc.rateId) : null;
    }

    /**
     * Per Cost line with a bookingRateRef, resolve source rate + chain + delta.
     *
     * We read the provenance the booking RECORDED at DocDate (bookingRateRef), not a fresh
     * walk of FPI_RateHeader.SupersededBy: `status` is mutable and reflects TODAY, so a rate
     * that was CONFIRMED on the booking date (e.g. R-0001 on 2026-07-10) now reads SUPERSEDED.
     * Re-walking live would mis-resolve every historical booking. walkChain() is kept for the
     * live path (a booking created now), but the gate trusts the stored snapshot.
     */
    function analyze(booking, profit) {
        const perLine = profit.costs
            .filter(l => l.bookingRateRef)
            .map(l => {
                const ref = l.bookingRateRef;
                const srcRate = ref.rateChargeId ? rateOfCharge(ref.rateChargeId) : null;
                const chain = (ref.supersededChain && ref.supersededChain.length)
                    ? ref.supersededChain
                    : (srcRate ? [srcRate.rateId] : []);
                const resolvedId = chain.length ? chain[chain.length - 1] : (srcRate ? srcRate.rateId : null);
                const resolvedRate = resolvedId ? BG.state.rate(resolvedId) : null;
                const quotedRate = chain.length ? BG.state.rate(chain[0]) : srcRate;

                const currentCostTHB = l.thb;
                const deltaTHB = ref.quoteDeltaTHB || 0;
                const quoteCostTHB = currentCostTHB - deltaTHB;
                const deltaPct = quoteCostTHB ? round(deltaTHB * 100 / quoteCostTHB, 2) : 0;
                return {
                    line: l, ref,
                    sourceRateNo: quotedRate ? quotedRate.rateNo : (ref.tariffId || '—'),
                    chain,
                    superseded: chain.length > 1,
                    currentRateNo: resolvedRate ? resolvedRate.rateNo : (ref.tariffId || null),
                    unconfirmed: false,
                    snapAmount: ref.snapAmount, snapCurrency: ref.snapCurrency,
                    currentCostTHB, quoteCostTHB, deltaTHB, deltaPct
                };
            });

        const totalCurrent = perLine.reduce((s, p) => s + p.currentCostTHB, 0);
        const totalDelta = perLine.reduce((s, p) => s + p.deltaTHB, 0);
        const totalQuote = totalCurrent - totalDelta;
        const pct = totalQuote ? round(totalDelta * 100 / totalQuote, 2) : 0;

        return {
            perLine,
            movedLines: perLine.filter(p => Math.abs(p.deltaTHB) >= 0.005),
            supersededLines: perLine.filter(p => p.superseded),
            unconfirmedLines: perLine.filter(p => p.unconfirmed),
            totalCurrent, totalQuote, totalDelta, deltaPct: pct,
            alert: Math.abs(totalDelta) >= DELTA_THB || Math.abs(pct) >= DELTA_PCT,
            thresholds: { pct: DELTA_PCT, thb: DELTA_THB }
        };
    }

    return { analyze, walkChain, inactiveReason, DELTA_PCT, DELTA_THB };
})();
