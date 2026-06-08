/* state.js — Global state container + localStorage persistence.
 *
 * Single source of truth. All modules read/write via the exported `state`
 * object. Persistence is opt-in via `persist()` so we don't write to
 * localStorage on every keystroke.
 */

import { $ } from './utils.js';

export const STORAGE_KEY = 'sfSeaRate.mockup.v1';

export const state = {
    data: null,           // Working copy (mutated by user)
    seed: null,           // Pristine seed (for Reset Seed)
    activeTab: 'Carrier', // 'Carrier' | 'Agent' | 'Destination'
    currentRateId: null,
    dirty: false,
    addMode: false,       // True while user is filling in a fresh rate (header level)
    cleared: false        // True right after CLEAR SCR
};

/** Load seed data. Prefer inline `window.SEED_DATA` (data.js) so file:// works;
 *  fall back to fetch('data.json') when running through an HTTP server. */
export async function loadSeed() {
    if (window.SEED_DATA) {
        state.seed = window.SEED_DATA;
    } else {
        const res = await fetch('data.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('data.json fetch failed: ' + res.status);
        state.seed = await res.json();
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    state.data = saved ? JSON.parse(saved) : structuredClone(state.seed);
}

export function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

export function setDirty(flag) {
    state.dirty = flag;
    $('#dirtyFlag').classList.toggle('hidden', !flag);
    $('#saveBtn').disabled = !flag;
}

export function getCurrentRate() {
    return state.data.rates.find(r => r.RATEID === state.currentRateId);
}

export function resetSeed() {
    state.data = structuredClone(state.seed);
    localStorage.removeItem(STORAGE_KEY);
    state.currentRateId = null;
    state.addMode = false;
    state.cleared = false;
}
