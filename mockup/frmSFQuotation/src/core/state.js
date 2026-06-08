/* Mutable application state + localStorage persistence.
 *
 * State shape mirrors what an AFQHEAD/SFQRATE/AFQDETAIL controller would emit.
 * - state.quotations  : array of quotation objects
 * - state.currentIndex: index into quotations
 * - state.company     : letterhead info (from data.json)
 * - state.masters     : lookup datasets (customers, salesPeople, approvers, agents,
 *                       items, itemsByClass{IM,EX}, ports). NOT persisted —
 *                       too large for localStorage; reloaded on every boot.
 *
 * Other modules import `state`, `dirty`, etc. as live bindings.  Only this
 * module reassigns the variables (via `setState`, `setDirty`, …).
 */

export const STORAGE_KEY = 'sf_quotation_v1';

export let state = {
    quotations: [],
    currentIndex: 0,
    company: null,
    masters: null,
};

export let dirty = false;
export let suppressDirty = false;
export let activeTab = 'general';

export function setState(next) { state = next; }

export function setDirty(v) {
    dirty = !!v;
    const flag = document.getElementById('dirtyFlag');
    if (flag) flag.classList.toggle('hidden', !dirty);
}

export function setSuppressDirty(v) { suppressDirty = !!v; }
export function setActiveTab(name) { activeTab = name; }

/** Persist quotations + currentIndex + company. Excludes `masters` (too large). */
export function persist() {
    const { masters: _omit, ...lean } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lean));
}

export function current() {
    return state.quotations[state.currentIndex] ?? null;
}
