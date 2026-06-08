/* state.js — Global state + localStorage persistence. */
window.RC = window.RC || {};
window.RC.state = (function () {
    'use strict';
    const { $ } = RC.utils;

    const STORAGE_KEY = 'sfSeaRate.mockup.v1';

    const state = {
        data: null,           // Working copy (mutated by user)
        seed: null,           // Pristine seed (for Reset Seed)
        activeTab: 'Carrier', // 'Carrier' | 'Agent' | 'Destination'
        currentRateId: null,
        dirty: false,
        addMode: false,
        cleared: false
    };

    /** Load seed data. Prefers inline `window.SEED_DATA` (data.js) so file://
     *  works; falls back to fetch('data.json') when running through HTTP. */
    async function loadSeed() {
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

    function persist() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
    }

    function setDirty(flag) {
        state.dirty = flag;
        $('#dirtyFlag').classList.toggle('hidden', !flag);
        $('#saveBtn').disabled = !flag;
    }

    function getCurrentRate() {
        return state.data.rates.find(r => r.RATEID === state.currentRateId);
    }

    function resetSeed() {
        state.data = structuredClone(state.seed);
        localStorage.removeItem(STORAGE_KEY);
        state.currentRateId = null;
        state.addMode = false;
        state.cleared = false;
    }

    return { state, STORAGE_KEY, loadSeed, persist, setDirty, getCurrentRate, resetSeed };
}());
