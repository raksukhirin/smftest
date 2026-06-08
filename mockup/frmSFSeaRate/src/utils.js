/* utils.js — Pure helpers (DOM shortcuts + formatters).
 * No side effects. No module state. Safe to import anywhere.
 */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

export function fmtDate(s) {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d)) return s;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
}

export function num(v) {
    const n = parseFloat(String(v ?? '').replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
}

/** Generate next zero-padded RATEID (20 chars) from existing rates. */
export function newRateId(rates) {
    const max = rates.reduce((m, r) => Math.max(m, parseInt(r.RATEID, 10) || 0), 0);
    return String(max + 1).padStart(20, '0');
}

/** Next PMKEY for an in-memory detail list (cost / selling). */
export function nextPmKey(arr) {
    return arr.reduce((m, r) => Math.max(m, r.PMKEY || 0), 0) + 1;
}
