/* print/utils.js — Print-specific formatters. */
window.SFQ_PRINT = window.SFQ_PRINT || {};
window.SFQ_PRINT.utils = (function () {
    'use strict';

    const $ = (id) => document.getElementById(id);

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, ch =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function fmtDate(s) {
        if (!s) return '—';
        const d = new Date(s);
        if (isNaN(d)) return s;
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function fmtMoney(n) {
        return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    return { $, escapeHtml, fmtDate, fmtMoney };
}());
