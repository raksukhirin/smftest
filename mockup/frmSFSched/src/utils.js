/* utils.js — Pure helpers (DOM shortcuts + date math). No side effects, no
 * module state. Attached to window.VS.utils so it works on http:// and file://.
 * See README.md → "How modules talk".
 */
window.VS = window.VS || {};
window.VS.utils = (function () {
    'use strict';

    const $  = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    // Day-of-week codes used in SFVSED.DEPDAY / ARRDAY (Sunday-based, like the
    // VB6 form's xWeekdayName()). JS getDay(): 0=Sun..6=Sat.
    const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

    /** "2026-06-08" (or Date) → "MON". Returns '' for blank/invalid. */
    function weekdayCode(s) {
        if (!s) return '';
        const d = (s instanceof Date) ? s : new Date(s + 'T00:00:00');
        return isNaN(d) ? '' : DOW[d.getDay()];
    }

    /** Add `days` to an ISO date string → ISO date string. */
    function addDays(iso, days) {
        if (!iso) return '';
        const d = new Date(iso + 'T00:00:00');
        if (isNaN(d)) return '';
        d.setDate(d.getDate() + (parseInt(days, 10) || 0));
        return toIso(d);
    }

    /** Date → "yyyy-mm-dd". */
    function toIso(d) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${mm}-${dd}`;
    }

    /** ISO date → "dd/mm/yyyy" in Buddhist era (yyyy+543) to match the legacy
     *  form (screenshots show 08/06/2569). Pass be=false for Gregorian. */
    function fmtDate(s, be = true) {
        if (!s) return '';
        const d = new Date(s + 'T00:00:00');
        if (isNaN(d)) return s;
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = d.getFullYear() + (be ? 543 : 0);
        return `${dd}/${mm}/${yy}`;
    }

    /** Next zero-padded DETID (20 chars) from existing schedule rows. */
    function newDetId(rows) {
        const max = rows.reduce((m, r) => Math.max(m, parseInt(r.DETID, 10) || 0), 0);
        return String(max + 1).padStart(20, '0');
    }

    return { $, $$, escapeHtml, DOW, weekdayCode, addDays, toIso, fmtDate, newDetId };
}());
