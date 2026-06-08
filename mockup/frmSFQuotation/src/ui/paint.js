/* All `paint*` functions — re-render UI from current state.
 *
 * Convention: paint* never mutate state; they only push state values into the
 * DOM. The reverse direction (form → state) is `captureForm` in actions.js
 * and `captureGridRow` in grids/detail.js.
 */

import { $, $$, escapeHtml, formatDate } from '../core/utils.js';
import { state, current, activeTab, suppressDirty, setSuppressDirty, setDirty } from '../core/state.js';
import { paintFcl } from '../grids/fcl.js';
import { paintDetail } from '../grids/detail.js';
import { GRIDS } from '../core/factories.js';
import { clearErrors } from './errors.js';

export function paintAll() {
    clearErrors();
    paintHeaderForm();
    paintBanner();
    paintFcl();
    paintDetail(GRIDS.lcl);
    paintDetail(GRIDS.shipping);
    paintDetail(GRIDS.transport);
    paintNav();
    paintClassToggle();
    paintTab();
    paintApproveBtn();
    applyReadOnly();
    setDirty(false);
}

export function paintHeaderForm() {
    const q = current();
    setSuppressDirty(true);
    try {
        $$('[name]').forEach(el => {
            const key = el.name;
            if (!q || !(key in q)) {
                if (el.type === 'checkbox') el.checked = false;
                else el.value = '';
                return;
            }
            const v = q[key];
            if (el.type === 'checkbox') {
                el.checked = !!v;
            } else if (el.type === 'date') {
                el.value = v ? String(v).slice(0, 10) : '';
            } else if (el.tagName === 'SELECT' && el.name === 'IsCreditApp') {
                el.value = v ? 'true' : 'false';
            } else if (el.type === 'number') {
                el.value = (v === null || v === undefined) ? '' : v;
            } else {
                el.value = (v === null || v === undefined) ? '' : v;
            }
        });
    } finally {
        setSuppressDirty(false);
    }
}

export function paintBanner() {
    const q = current();
    $('#bannerDocNo').textContent      = q?.DocNo || '—';
    $('#bannerDocDate').textContent    = formatDate(q?.DocDate) || '—';
    $('#bannerEffective').textContent  = formatDate(q?.EffDate) || '—';
    $('#bannerExpiry').textContent     = formatDate(q?.ExpDate) || '—';
    $('#bannerCredit').textContent     = q?.CreditDays != null ? `${q.CreditDays} days` : '—';
    $('#bannerClass').textContent      = q?.DocClass === 'EX' ? 'EXPORT' : 'IMPORT';
    $('#bannerClassIcon').textContent  = q?.DocClass === 'EX' ? '📤' : '📥';
    $('#lastModified').innerHTML       = q?.EditBy
        ? `Modified by <strong class="text-slate-700">${escapeHtml(q.EditBy)}</strong> · ${escapeHtml(q.EditDate || '')}`
        : '—';
    $('#footerEditInfo').textContent   = q?.EditBy
        ? `${q.EditBy} · ${q.EditDate || ''}`
        : '—';
    applyStatusPill(q?.DocStat);
}

export function paintNav() {
    const total = state.quotations.length;
    const idx = state.currentIndex;
    $('#navCounter').textContent = total ? `${idx + 1} / ${total}` : '0 / 0';
    $('#navFirst').disabled = idx <= 0;
    $('#navPrev').disabled  = idx <= 0;
    $('#navNext').disabled  = idx >= total - 1;
    $('#navLast').disabled  = idx >= total - 1;
}

export function paintClassToggle() {
    const q = current();
    const cls = q?.DocClass || 'IM';
    $('#classIM').classList.toggle('is-active', cls === 'IM');
    $('#classEX').classList.toggle('is-active', cls === 'EX');
}

export function paintTab() {
    $$('.tab').forEach(b => b.classList.toggle('is-active', b.dataset.tab === activeTab));
    $$('[data-panel]').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== activeTab));
}

export function paintApproveBtn() {
    const q = current();
    const btn = $('#approveBtn');
    if (!q) return;
    if (q.DocStat === 'Approved') {
        btn.textContent = '↺ Un-Approve';
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-ghost');
    } else if (q.DocStat === 'Deleted') {
        btn.textContent = '✓ Approve';
        btn.disabled = true;
    } else {
        btn.textContent = '✓ Approve';
        btn.classList.remove('btn-ghost');
        btn.classList.add('btn-secondary');
        btn.disabled = false;
    }
}

export function applyStatusPill(stat) {
    const map = {
        'Open':     { cls: 'status-open',     label: '● Open' },
        'Approved': { cls: 'status-approved', label: '● Approved' },
        'Deleted':  { cls: 'status-deleted',  label: '● Deleted' },
    };
    const m = map[stat] || map['Open'];
    const pill = $('#statusPill');
    pill.className = `status-pill ${m.cls}`;
    pill.textContent = m.label;
}

/* ---- Read-only mode (mirrors frm `mblnPosted` flag) ---- */

export function applyReadOnly() {
    const q = current();
    const isReadOnly = q && (q.DocStat === 'Approved' || q.DocStat === 'Deleted');
    document.body.classList.toggle('is-readonly', !!isReadOnly);
    const banner = $('#readonlyBanner');
    if (!q) {
        banner.className = 'readonly-banner';
        return;
    }
    if (q.DocStat === 'Approved') {
        banner.className = 'readonly-banner is-approved';
        $('#readonlyText').textContent = `🔒 This quotation is APPROVED — read-only. Click "Un-Approve" to enable editing.`;
    } else if (q.DocStat === 'Deleted') {
        banner.className = 'readonly-banner is-deleted';
        $('#readonlyText').textContent = `🗑 This quotation is DELETED — read-only.`;
    } else {
        banner.className = 'readonly-banner';
    }
}

/* ---- Header search dropdown (top-bar) ---- */

export function renderSearch(query) {
    const dd = $('#searchDropdown');
    const q = (query || '').trim().toLowerCase();
    if (!q) { dd.classList.add('hidden'); dd.innerHTML = ''; return; }
    const matches = state.quotations
        .map((j, i) => ({ j, i }))
        .filter(({ j }) =>
            (j.DocNo || '').toLowerCase().includes(q) ||
            (j.RefNo || '').toLowerCase().includes(q) ||
            (j.CustName || '').toLowerCase().includes(q) ||
            (j.CustNo || '').toLowerCase().includes(q) ||
            (j.DocSubj || '').toLowerCase().includes(q));
    if (matches.length === 0) {
        dd.innerHTML = `<div class="px-3 py-2 text-sm text-slate-400">No matches</div>`;
    } else {
        dd.innerHTML = matches.map(({ j, i }) => `
            <button type="button" data-go="${i}" class="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-100 last:border-0">
                <span class="font-mono text-sm font-semibold text-violet-700">${escapeHtml(j.DocNo)}</span>
                <span class="status-pill status-${(j.DocStat||'open').toLowerCase()}" style="font-size:9px;padding:1px 6px">${escapeHtml(j.DocStat||'')}</span>
                <span class="text-[10px] uppercase tracking-wider text-slate-400">${j.DocClass}</span>
                <span class="text-xs text-slate-500 ml-auto truncate">${escapeHtml(j.CustName || '')} · ${escapeHtml(j.DocSubj || '')}</span>
            </button>
        `).join('');
    }
    dd.classList.remove('hidden');
}
