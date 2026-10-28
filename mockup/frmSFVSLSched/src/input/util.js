/* util.js — helpers for the Voyage Entry screen. window.VSI.util */
window.VSI = window.VSI || {};
window.VSI.util = (function () {
    'use strict';
    const $  = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    function parts(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso || '');
        return m ? { y:+m[1], mo:+m[2], d:+m[3], h:m[4]??null, mi:m[5]??null } : null;
    }
    const fmtDateShort = iso => { const p=parts(iso); return p?`${p.d} ${MON[p.mo-1]}`:'—'; };
    const fmtDateTime  = iso => { const p=parts(iso); if(!p) return '—'; return `${p.d} ${MON[p.mo-1]} ${p.y}${p.h!=null?` ${p.h}:${p.mi}`:''}`; };

    // <input type=datetime-local> <-> stored ISO-ish string (keep naive local clock)
    const isoToLocal = iso => (iso || '').slice(0, 16);          // "2026-06-12T18:00:00+07:00" -> "2026-06-12T18:00"
    const localToIso = v => v ? v : null;                        // store the literal local value

    function daysBetween(etd, eta) {
        const a = Date.parse(etd), b = Date.parse(eta);
        if (isNaN(a) || isNaN(b)) return null;
        return Math.max(0, Math.round((b - a) / 86400000));
    }

    return { $, $$, escapeHtml, parts, fmtDateShort, fmtDateTime, isoToLocal, localToIso, daysBetween };
}());
