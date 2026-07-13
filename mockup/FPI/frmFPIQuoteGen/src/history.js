/* history.js — Tier 2 "Historical Intelligence" (§5.4 / D11).
   Indicative only. Never auto-fills a confirmed cost — using a history figure
   flags the line as manual and demands a reason. */
window.QG = window.QG || {};
window.QG.history = (function () {
    'use strict';

    const { median, round } = QG.utils;

    /** Reliability tiers, most trustworthy first (§5.4). */
    const TIER = { POSTED: 1, JOB_ENTRY: 2, BOOKING: 3, QUOTE: 4, LEGACY: 5 };

    /** Rows the real data leaves incomplete or absurd — surfaced, never averaged in silently. */
    function classify(r) {
        if (!r.loadPort || !r.disPort) return 'NO_LANE';        // Job เก่าไม่กรอก Port
        if (r.qty > 5000 || Math.abs(r.amtTHB) > 1e6) return 'OUTLIER';  // เช่น Air 11,133 kg
        return 'OK';
    }

    function unitTHB(r) {
        return r.qty ? r.amtTHB / r.qty : r.amtTHB;
    }

    /**
     * Lane history for a POL→POD pair.
     * Returns per-ExpCode stats split by sell / cost, plus the rows that were
     * deliberately excluded so the UI can say *why* the sample is small.
     */
    function lookup(pol, pod) {
        const all = QG.state.db.laneHistory;
        const tagged = all.map(r => Object.assign({ _flag: classify(r) }, r));

        const excluded = tagged.filter(r => r._flag !== 'OK');
        const usable = tagged.filter(r => r._flag === 'OK' && r.loadPort === pol && r.disPort === pod);
        const outliersOnLane = tagged.filter(r => r._flag === 'OUTLIER' && r.loadPort === pol && r.disPort === pod);
        const noLaneCount = tagged.filter(r => r._flag === 'NO_LANE').length;

        const bucket = kind => {
            const rows = usable.filter(r => r.sourceKind === kind);
            const byCode = {};
            rows.forEach(r => {
                (byCode[r.expCode] = byCode[r.expCode] || []).push(r);
            });
            return Object.keys(byCode).sort().map(code => {
                const rs = byCode[code].slice().sort((a, b) => String(b.refDate).localeCompare(String(a.refDate)));
                const units = rs.map(unitTHB);
                return {
                    expCode: code,
                    count: rs.length,
                    lastDate: rs[0].refDate,
                    lastJobNo: rs[0].jobNo,
                    lastUnitTHB: round(unitTHB(rs[0]), 2),
                    medianUnitTHB: round(median(units), 2),
                    reliability: rs.map(r => r.reliability)
                        .sort((a, b) => (TIER[a] || 9) - (TIER[b] || 9))[0],
                    carriers: Array.from(new Set(rs.map(r => r.linerName).filter(Boolean)))
                };
            });
        };

        return {
            pol, pod,
            sell: bucket('JOB_SELL'),
            cost: bucket('JOB_COST'),
            sampleRows: usable.length,
            outliersOnLane,
            noLaneCount,
            excludedTotal: excluded.length
        };
    }

    /** Do we have any usable history at all for this lane? */
    function hasLane(pol, pod) {
        return QG.state.db.laneHistory.some(r =>
            classify(r) === 'OK' && r.loadPort === pol && r.disPort === pod);
    }

    return { TIER, lookup, hasLane, classify, unitTHB };
})();
