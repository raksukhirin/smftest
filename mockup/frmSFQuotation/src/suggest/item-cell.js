/* Cell-level Item smart-suggest for ExpCode + ExpDesc1 across the 3 detail
 * grids (LCL / Shipping / Transport).
 *
 * One shared floating dropdown that opens on focus/input of any matching cell
 * and filters OPItem master by the current quotation's `DocClass` (IM/EX).
 * Search matches code OR description; on pick: fills ExpCode + ExpDesc1, plus
 * Uom + ItemCurr from the master record (overrides blank-template defaults).
 */

import { $, escapeHtml } from '../core/utils.js';
import { state, current, setDirty } from '../core/state.js';
import { gridByKind } from '../core/factories.js';
import { paintDetail } from '../grids/detail.js';
import { showToast } from '../ui/toast.js';

const ITEM_CELL_TBODIES = ['lclTbody', 'shippingTbody', 'transportTbody'];
const ITEM_CELL_COLS    = new Set(['ExpCode', 'ExpDesc1']);
const ITEM_SUGGEST_MAX  = 10;

export function installItemCellSuggest() {
    const dd = document.createElement('div');
    dd.id = 'itemCellSuggest';
    dd.className = 'suggest-dropdown hidden';
    dd.style.position = 'fixed';
    dd.style.right = 'auto';
    dd.setAttribute('role', 'listbox');
    document.body.appendChild(dd);

    let activeInput = null;
    let lastResults = [];
    let activeIdx = 0;

    function getItems() {
        const cls = current()?.DocClass || 'IM';
        return state.masters?.itemsByClass?.[cls] || [];
    }

    function close() {
        dd.classList.add('hidden');
        activeInput = null;
        activeIdx = 0;
    }

    function highlight(text, q) {
        const t = String(text ?? '');
        if (!q) return escapeHtml(t);
        const idx = t.toLowerCase().indexOf(q.toLowerCase());
        if (idx === -1) return escapeHtml(t);
        return escapeHtml(t.slice(0, idx))
            + `<span class="suggest-mark">${escapeHtml(t.slice(idx, idx + q.length))}</span>`
            + escapeHtml(t.slice(idx + q.length));
    }

    function filter(query) {
        const items = getItems();
        const q = (query || '').trim().toLowerCase();
        if (!q) return items.slice(0, ITEM_SUGGEST_MAX);
        const out = [];
        const seen = new Set();
        for (const it of items) {
            if ((it.ExpCode || '').toLowerCase().startsWith(q)) { out.push(it); seen.add(it); }
            if (out.length >= ITEM_SUGGEST_MAX) return out;
        }
        for (const it of items) {
            if (seen.has(it)) continue;
            if ((it.ExpDesc1 || '').toLowerCase().startsWith(q)) { out.push(it); seen.add(it); }
            if (out.length >= ITEM_SUGGEST_MAX) return out;
        }
        for (const it of items) {
            if (seen.has(it)) continue;
            if ((it.ExpCode || '').toLowerCase().includes(q) ||
                (it.ExpDesc1 || '').toLowerCase().includes(q)) { out.push(it); seen.add(it); }
            if (out.length >= ITEM_SUGGEST_MAX) return out;
        }
        return out;
    }

    function render(query) {
        if (!activeInput) return;
        const all = getItems();
        lastResults = filter(query);
        const cls = current()?.DocClass || 'IM';
        const q = (query || '').trim();

        const header = `<div class="suggest-header">
            <span>${all.length.toLocaleString()} ${cls === 'IM' ? 'import' : 'export'} items</span>
            <span>${q ? `match "${escapeHtml(q)}"` : 'showing top ' + Math.min(ITEM_SUGGEST_MAX, all.length)}</span>
        </div>`;

        const body = lastResults.length === 0
            ? `<div class="suggest-empty">No items match "${escapeHtml(q)}"</div>`
            : lastResults.map((it, i) => {
                const meta = [it.Unit, it.Currency].filter(Boolean).join(' · ');
                return `<div class="suggest-item${i === activeIdx ? ' is-active' : ''}" data-idx="${i}" role="option">
                    <span class="suggest-code">${highlight(it.ExpCode, q)}</span>
                    <div class="suggest-body">
                        <div class="suggest-name">${highlight(it.ExpDesc1, q)}</div>
                        ${meta ? `<div class="suggest-meta">${escapeHtml(meta)}</div>` : ''}
                    </div>
                </div>`;
            }).join('');

        const footer = `<div class="suggest-footer">
            <span class="suggest-key">↑</span> <span class="suggest-key">↓</span> navigate ·
            <span class="suggest-key">↵</span> select ·
            <span class="suggest-key">Esc</span> close
        </div>`;

        dd.innerHTML = header + body + footer;
        position();
        dd.classList.remove('hidden');
    }

    function position() {
        if (!activeInput) return;
        const r = activeInput.getBoundingClientRect();
        dd.style.left = r.left + 'px';
        dd.style.top  = (r.bottom + 2) + 'px';
        dd.style.minWidth = Math.max(320, r.width * 1.2) + 'px';
        dd.style.maxWidth = '420px';
    }

    function updateActive() {
        dd.querySelectorAll('.suggest-item').forEach((el, i) => {
            el.classList.toggle('is-active', i === activeIdx);
        });
        dd.querySelector('.suggest-item.is-active')?.scrollIntoView({ block: 'nearest' });
    }

    function pick(i) {
        const it = lastResults[i];
        if (!it || !activeInput) return;
        const tr = activeInput.closest('tr[data-idx]');
        if (!tr) return;
        const q = current(); if (!q) return;
        const cfg = gridByKind(tr.dataset.kind);
        if (!cfg) return;
        const idx = +tr.dataset.idx;
        const row = q[cfg.arrayKey]?.[idx];
        if (!row) return;
        row.ExpCode  = it.ExpCode;
        row.ExpDesc1 = it.ExpDesc1;
        // Master record wins — picking from suggest is an explicit "use this item"
        // signal so its Unit and Currency override blank-template defaults.
        if (it.Unit)     row.Uom      = it.Unit;
        if (it.Currency) row.ItemCurr = it.Currency;
        paintDetail(cfg);
        setDirty(true);
        showToast(`Selected ${it.ExpCode} — ${it.ExpDesc1}`, '✓');
        close();
        // Jump focus to Qty in the same row for fast data entry
        const newTr = $(`#${cfg.tbodyId} tr[data-idx="${idx}"]`);
        newTr?.querySelector('[data-col="Qty"]')?.focus();
    }

    document.addEventListener('focusin', (e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement)) return;
        const col = t.dataset?.col;
        if (!ITEM_CELL_COLS.has(col)) {
            if (dd.contains(e.target) || dd.contains(document.activeElement)) return;
            close();
            return;
        }
        const tbody = t.closest('tbody');
        if (!tbody || !ITEM_CELL_TBODIES.includes(tbody.id)) { close(); return; }
        activeInput = t;
        activeIdx = 0;
        render(t.value);
    });

    document.addEventListener('input', (e) => {
        if (e.target !== activeInput) return;
        activeIdx = 0;
        render(activeInput.value);
    });

    document.addEventListener('keydown', (e) => {
        if (!activeInput || dd.classList.contains('hidden')) return;
        if (e.target !== activeInput) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIdx = Math.min(activeIdx + 1, lastResults.length - 1);
            updateActive();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIdx = Math.max(activeIdx - 1, 0);
            updateActive();
        } else if (e.key === 'Enter') {
            if (lastResults.length > 0) {
                e.preventDefault();
                pick(activeIdx);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
        } else if (e.key === 'Tab') {
            close();
        }
    });

    dd.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.suggest-item[data-idx]');
        if (!item) return;
        e.preventDefault();
        pick(+item.dataset.idx);
    });

    document.addEventListener('mousedown', (e) => {
        if (dd.classList.contains('hidden')) return;
        if (dd.contains(e.target)) return;
        if (e.target === activeInput) return;
        close();
    });

    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
}
