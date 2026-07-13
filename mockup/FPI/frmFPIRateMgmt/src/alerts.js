/* alerts.js — port of vFPI_RateAlert + vFPI_ActiveRate (no DOM) + charge rollups.
   Alert thresholds and predicates are copied verbatim from FPI_DDL_v1.0.sql §Views. */
window.RM = window.RM || {};
window.RM.alerts = (function () {
    'use strict';

    const { daysBetween, inRange } = RM.utils;

    const EXPIRY_WARN_DAYS = 7;     // vFPI_RateAlert: ValidTo within 7 days
    const STALE_DRAFT_DAYS = 30;    // vFPI_RateAlert: DRAFT older than 30 days

    /** DaysToExpiry as-of the given date (vFPI_ActiveRate). Negative = already lapsed. */
    function daysToExpiry(rate, asOf) {
        return daysBetween(asOf, rate.validTo);
    }

    /** Is the rate usable right now? (vFPI_ActiveRate: CONFIRMED and asOf within validity) */
    function isActive(rate, asOf) {
        return rate.status === 'CONFIRMED' && inRange(asOf, rate.validFrom, rate.validTo);
    }

    /**
     * vFPI_RateAlert for one rate as-of `asOf`. Returns an alert code or null.
     * The DDL lumps "CONFIRMED & ValidTo ≤ today+7" into EXPIRING_7D (includes already-lapsed);
     * we split EXPIRED (past) from EXPIRING_7D (ahead) for a clearer UI, both from that predicate.
     */
    function alertOf(rate, asOf) {
        const createdISO = (rate.createdAtUtc || '').slice(0, 10);

        if (rate.status === 'CONFIRMED' && rate.validTo <= addDays(asOf, EXPIRY_WARN_DAYS)) {
            return rate.validTo < asOf
                ? { type: 'EXPIRED', label: 'หมดอายุแล้ว', cls: 'danger', days: daysToExpiry(rate, asOf) }
                : { type: 'EXPIRING_7D', label: 'ใกล้หมดอายุ ≤7 วัน', cls: 'warn', days: daysToExpiry(rate, asOf) };
        }
        if (rate.status === 'DRAFT' && createdISO && createdISO < addDays(asOf, -STALE_DRAFT_DAYS)) {
            return { type: 'STALE_DRAFT_30D', label: 'Draft ค้าง >30 วัน', cls: 'warn',
                     days: createdISO ? daysBetween(createdISO, asOf) : null };
        }
        if ((rate.sourceRef == null || rate.sourceRef === '') && rate.rateSource !== 'LEGACY_IMPORT') {
            return { type: 'NO_SOURCE_REF', label: 'ไม่มีแหล่งอ้างอิง', cls: 'info', days: null };
        }
        return null;
    }

    function addDays(iso, d) {
        const dt = new Date(iso + 'T00:00:00Z');
        dt.setUTCDate(dt.getUTCDate() + d);
        return dt.toISOString().slice(0, 10);
    }

    /** All alerts across the current rate set, grouped by type. */
    function scan(rates, asOf) {
        const out = { EXPIRED: [], EXPIRING_7D: [], STALE_DRAFT_30D: [], NO_SOURCE_REF: [] };
        rates.forEach(r => {
            const a = alertOf(r, asOf);
            if (a) out[a.type].push({ rate: r, alert: a });
        });
        return out;
    }

    /* ---------- charge rollup (for detail + compare) ---------- */

    /** Sum a rate's charges per currency, split by category, for one container type. */
    function summarize(charges, containerType) {
        const applies = c => !c.containerType || !containerType || c.containerType === containerType ||
            c.basis === 'PER_BL' || c.basis === 'PER_SHPT' || c.basis === 'PER_SET';
        const rows = charges.filter(applies);
        const byCat = {};
        const totals = {};
        rows.forEach(c => {
            byCat[c.category] = (byCat[c.category] || 0) + 0;   // ensure key
            totals[c.currencyCode] = (totals[c.currencyCode] || 0) + c.amount;
        });
        return { rows, totals };
    }

    /** Freight-only amount for a container (for quick compare), in its native currency. */
    function freightFor(charges, containerType) {
        const f = charges.find(c => c.category === 'FREIGHT' &&
            (!c.containerType || c.containerType === containerType));
        return f ? { amount: f.amount, currency: f.currencyCode, name: f.chargeName } : null;
    }

    return { EXPIRY_WARN_DAYS, STALE_DRAFT_DAYS, daysToExpiry, isActive, alertOf, scan, summarize, freightFor, addDays };
})();
