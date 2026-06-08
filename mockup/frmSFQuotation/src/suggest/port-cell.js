/* Cell-level Port smart-suggest for the 4 port cells in the FCL grid
 * (Port of Loading, Port of Discharge, Port of Tranship, Final Destination)
 * plus the 2 paired *Code cells.
 *
 * Source: OPPort WHERE PORTTYPE='SF'.
 * On pick: fills the port-name field and (for Load/Final) the paired *Code field.
 */

import { $, escapeHtml } from '../core/utils.js';
import { state, current, setDirty } from '../core/state.js';
import { paintFcl } from '../grids/fcl.js';
import { showToast } from '../ui/toast.js';

const PORT_CELL_MAP = {
    'LoadPort':      { name: 'LoadPort',  code: 'LoadPortCode'  },
    'LoadPortCode':  { name: 'LoadPort',  code: 'LoadPortCode'  },
    'DisPort':       { name: 'DisPort',   code: null            },
    'TranPort':      { name: 'TranPort',  code: null            },
    'FinalPort':     { name: 'FinalPort', code: 'FinalPortCode' },
    'FinalPortCode': { name: 'FinalPort', code: 'FinalPortCode' },
};
const PORT_SUGGEST_MAX = 10;

export function installPortCellSuggest() {
    const dd = document.createElement('div');
    dd.id = 'portCellSuggest';
    dd.className = 'suggest-dropdown hidden';
    dd.style.position = 'fixed';
    dd.style.right = 'auto';
    dd.setAttribute('role', 'listbox');
    document.body.appendChild(dd);

    let activeInput = null;
    let lastResults = [];
    let activeIdx = 0;

    function getPorts() { return state.masters?.ports || []; }

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
        const ports = getPorts();
        const q = (query || '').trim().toLowerCase();
        if (!q) return ports.slice(0, PORT_SUGGEST_MAX);
        const out = [];
        const seen = new Set();
        for (const p of ports) {
            if ((p.PortCode || '').toLowerCase().startsWith(q)) { out.push(p); seen.add(p); }
            if (out.length >= PORT_SUGGEST_MAX) return out;
        }
        for (const p of ports) {
            if (seen.has(p)) continue;
            if ((p.PortName || '').toLowerCase().startsWith(q)) { out.push(p); seen.add(p); }
            if (out.length >= PORT_SUGGEST_MAX) return out;
        }
        for (const p of ports) {
            if (seen.has(p)) continue;
            if ((p.PortCode || '').toLowerCase().includes(q) ||
                (p.PortName || '').toLowerCase().includes(q)) { out.push(p); seen.add(p); }
            if (out.length >= PORT_SUGGEST_MAX) return out;
        }
        return out;
    }

    function render(query) {
        if (!activeInput) return;
        const all = getPorts();
        lastResults = filter(query);
        const q = (query || '').trim();

        const header = `<div class="suggest-header">
            <span>${all.length.toLocaleString()} ports</span>
            <span>${q ? `match "${escapeHtml(q)}"` : 'showing top ' + Math.min(PORT_SUGGEST_MAX, all.length)}</span>
        </div>`;

        const body = lastResults.length === 0
            ? `<div class="suggest-empty">No ports match "${escapeHtml(q)}"</div>`
            : lastResults.map((p, i) => {
                const meta = [p.Country, p.CountryCode].filter(Boolean).join(' · ');
                return `<div class="suggest-item${i === activeIdx ? ' is-active' : ''}" data-idx="${i}" role="option">
                    <span class="suggest-code">${highlight(p.PortCode, q)}</span>
                    <div class="suggest-body">
                        <div class="suggest-name">${highlight(p.PortName, q)}</div>
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
        dd.style.minWidth = Math.max(280, r.width * 1.2) + 'px';
        dd.style.maxWidth = '380px';
    }

    function updateActive() {
        dd.querySelectorAll('.suggest-item').forEach((el, i) => {
            el.classList.toggle('is-active', i === activeIdx);
        });
        dd.querySelector('.suggest-item.is-active')?.scrollIntoView({ block: 'nearest' });
    }

    function pick(i) {
        const p = lastResults[i];
        if (!p || !activeInput) return;
        const tr = activeInput.closest('tr[data-idx]');
        if (!tr || tr.dataset.kind !== 'fcl') return;
        const q = current(); if (!q) return;
        const idx = +tr.dataset.idx;
        const row = q.freightRates?.[idx];
        if (!row) return;
        const map = PORT_CELL_MAP[activeInput.dataset.col];
        if (!map) return;
        row[map.name] = p.PortName;
        if (map.code) row[map.code] = p.PortCode;
        paintFcl();
        setDirty(true);
        showToast(`Selected ${p.PortCode} — ${p.PortName}`, '✓');
        close();
        const newRow = $(`#fclTbody tr[data-idx="${idx}"]`);
        const nextCol = activeInput.dataset.col === 'LoadPort'  ? 'LoadPortCode'
                      : activeInput.dataset.col === 'FinalPort' ? 'FinalPortCode'
                      : 'ExpCode';
        newRow?.querySelector(`[data-col="${nextCol}"]`)?.focus();
    }

    document.addEventListener('focusin', (e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement)) return;
        const col = t.dataset?.col;
        if (!PORT_CELL_MAP[col]) {
            if (dd.contains(e.target) || dd.contains(document.activeElement)) return;
            close();
            return;
        }
        const tr = t.closest('tr[data-kind]');
        if (!tr || tr.dataset.kind !== 'fcl') { close(); return; }
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
            if (lastResults.length > 0) { e.preventDefault(); pick(activeIdx); }
        } else if (e.key === 'Escape') {
            e.preventDefault(); close();
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
