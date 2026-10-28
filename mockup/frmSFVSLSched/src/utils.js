/* utils.js — Pure helpers. Attached to window.VSL.utils (works on file://). */
window.VSL = window.VSL || {};
window.VSL.utils = (function () {
    'use strict';
    const $  = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    // Parse the *literal* clock written in the ISO string (keep the port-local
    // time from its offset; do NOT shift to the browser timezone).
    function parts(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso || '');
        return m ? { y:+m[1], mo:+m[2], d:+m[3], h:m[4]??null, mi:m[5]??null } : null;
    }
    function fmtDate(iso)     { const p=parts(iso); return p ? `${p.d} ${MON[p.mo-1]} ${p.y}` : '—'; }
    function fmtDateShort(iso){ const p=parts(iso); return p ? `${p.d} ${MON[p.mo-1]}` : '—'; }
    function fmtTime(iso)     { const p=parts(iso); return (p&&p.h!=null) ? `${p.h}:${p.mi}` : ''; }
    function fmtDateTime(iso) { const p=parts(iso); if(!p) return '—'; const t=fmtTime(iso); return `${fmtDate(iso)}${t?' '+t:''}`; }
    function dateOnly(iso)    { return (iso||'').slice(0,10); }          // YYYY-MM-DD for range compare

    /** epoch ms honouring the offset in the ISO string (for sorting cut-offs). */
    function epoch(iso) { const t = Date.parse(iso || ''); return isNaN(t) ? Infinity : t; }

    return { $, $$, escapeHtml, fmtDate, fmtDateShort, fmtTime, fmtDateTime, dateOnly, epoch };
}());
