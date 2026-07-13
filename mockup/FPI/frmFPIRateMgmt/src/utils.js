/* utils.js — DOM + formatting helpers (shared shape across FPI mockups). */
window.RM = window.RM || {};
window.RM.utils = (function () {
    'use strict';

    const $  = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

    const el = (tag, cls, html) => {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (html != null) n.innerHTML = html;
        return n;
    };

    const esc = s => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function round(v, n) {
        if (v == null || !isFinite(v)) return 0;
        const f = Math.pow(10, n || 0);
        return Math.round((v + Number.EPSILON) * f) / f;
    }
    function money(v, dec) {
        const d = dec == null ? 2 : dec;
        return round(v, d).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    }

    const todayISO = () => new Date().toISOString().slice(0, 10);

    function inRange(iso, from, to) {
        if (!iso) return false;
        if (from && iso < from) return false;
        if (to && iso > to) return false;
        return true;
    }

    /** Whole days from a→b on ISO date strings (b − a). */
    function daysBetween(aISO, bISO) {
        const a = new Date(aISO + 'T00:00:00Z'), b = new Date(bISO + 'T00:00:00Z');
        return Math.round((b - a) / 86400000);
    }

    function download(name, text, mime) {
        const blob = new Blob([text], { type: mime || 'application/json' });
        const a = el('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    return { $, $$, el, esc, round, money, todayISO, inRange, daysBetween, download };
})();
