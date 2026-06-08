/* core/state.js — Mutable application state + localStorage persistence.
 *
 * NOTE on IIFE pattern: previous version exported `let state` (reassignable
 * live binding). In IIFE world we can't reassign and have other modules see
 * it, so `setState(next)` MUTATES the existing object in-place. UI flags
 * (`dirty`, `suppressDirty`, `activeTab`) are now properties of `state`
 * (excluded from persist).
 */
window.SFQ = window.SFQ || {};
window.SFQ.state = (function () {
    'use strict';

    const STORAGE_KEY = 'sf_quotation_v1';

    // Single state object — mutated in place; other modules read by reference.
    const state = {
        quotations: [],
        currentIndex: 0,
        company: null,
        masters: null,
        // UI flags (transient, not persisted)
        dirty: false,
        suppressDirty: false,
        activeTab: 'general',
    };

    /** Replace persistent shape (4 keys). UI flags are preserved. */
    function setState(next) {
        state.quotations   = next.quotations   ?? [];
        state.currentIndex = next.currentIndex ?? 0;
        state.company      = next.company      ?? null;
        state.masters      = next.masters      ?? null;
    }

    function setDirty(v) {
        state.dirty = !!v;
        const flag = document.getElementById('dirtyFlag');
        if (flag) flag.classList.toggle('hidden', !state.dirty);
    }

    function setSuppressDirty(v) { state.suppressDirty = !!v; }
    function setActiveTab(name)  { state.activeTab = name; }

    /** Persist quotations + currentIndex + company. Excludes masters + UI flags. */
    function persist() {
        const lean = {
            quotations: state.quotations,
            currentIndex: state.currentIndex,
            company: state.company,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lean));
    }

    function current() {
        return state.quotations[state.currentIndex] ?? null;
    }

    return {
        STORAGE_KEY, state,
        setState, setDirty, setSuppressDirty, setActiveTab,
        persist, current,
    };
}());
