/* state.js — Global state + localStorage persistence.
 * Mirrors the working/seed split of frmSFSeaRate so Reset Seed is cheap.
 */
window.VS = window.VS || {};
window.VS.state = (function () {
    'use strict';
    const { $ } = VS.utils;

    const STORAGE_KEY = 'sfSched.mockup.v1';

    const state = {
        data: null,            // working copy (mutated by user)
        seed: null,            // pristine seed (for Reset Seed)
        searchMode: 'LOCATION', // 'LOCATION' | 'VESSEL'
        activeFilterTab: 'Date',// 'Date' | 'Port' | 'Carrier'
        currentDetId: null,
        filtered: [],          // result set currently shown in the grid
        draft: null,           // unsaved add/copy record shown as a grid row
        dirty: false,
        addMode: false
    };

    /** Prefer inline window.SEED_DATA (data.js → file:// works); fall back to
     *  fetch('data.json') over http://. */
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

    function getCurrent() {
        return state.data.schedules.find(r => r.DETID === state.currentDetId);
    }

    function resetSeed() {
        state.data = structuredClone(state.seed);
        localStorage.removeItem(STORAGE_KEY);
        state.currentDetId = null;
        state.draft = null;
        state.addMode = false;
    }

    return { state, STORAGE_KEY, loadSeed, persist, setDirty, getCurrent, resetSeed };
}());
