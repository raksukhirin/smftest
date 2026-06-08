/* print/main.js — Print preview entry.
 * Load quotation (localStorage → window.SFQ_SEED → fetch fallback) then paint. */
window.SFQ_PRINT = window.SFQ_PRINT || {};
window.SFQ_PRINT.main = (function () {
    'use strict';
    const { paint } = SFQ_PRINT.render;

    const STORAGE_KEY = 'sf_quotation_v1';
    const params = new URLSearchParams(window.location.search);
    const docNo  = params.get('doc');

    async function load() {
        let store = null;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) store = JSON.parse(raw);
        } catch (_) { /* ignore */ }
        if (!store?.quotations?.length) {
            if (window.SFQ_SEED) {
                store = window.SFQ_SEED;
            } else {
                try {
                    const res = await fetch('data.json', { cache: 'no-store' });
                    store = await res.json();
                } catch (e) {
                    console.error('Could not load any quotation data.', e);
                    return null;
                }
            }
        }
        return store;
    }

    function findQuotation(store) {
        if (!store?.quotations?.length) return null;
        if (docNo) {
            const m = store.quotations.find(q => q.DocNo === docNo);
            if (m) return m;
        }
        return store.quotations[0];
    }

    async function boot() {
        const store = await load();
        paint(findQuotation(store), store?.company);
    }

    document.addEventListener('DOMContentLoaded', boot);

    return { boot };
}());
