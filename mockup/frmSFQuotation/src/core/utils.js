/* core/utils.js — Generic DOM + formatting helpers (no app state).
 * Loaded as a plain script and attached to window.SFQ.utils. */
window.SFQ = window.SFQ || {};
window.SFQ.utils = (function () {
    'use strict';

    const $  = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, ch =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function formatDate(s) {
        if (!s) return '';
        const d = new Date(s);
        if (isNaN(d)) return s;
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    return { $, $$, escapeHtml, formatDate };
}());
