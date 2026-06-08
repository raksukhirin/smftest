/* Print preview entry — load quotation (localStorage → data.json fallback)
 * then render via paint(). Loaded from print.html as <script type="module">. */

import { paint } from './render.js';

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
        try {
            const res = await fetch('data.json', { cache: 'no-store' });
            store = await res.json();
        } catch (e) {
            console.error('Could not load any quotation data.', e);
            return null;
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

const store = await load();
paint(findQuotation(store), store?.company);
