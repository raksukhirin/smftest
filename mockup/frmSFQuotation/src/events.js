/* DOM event wiring — connect HTML elements to action handlers + suggest installers.
 *
 * Called once at boot. Subsequent grid re-renders rely on event delegation,
 * so listeners attached here keep working after `paintFcl` / `paintDetail`
 * rebuild the table contents. */

import { $, $$ } from './core/utils.js';
import { state, suppressDirty, setActiveTab, setDirty, current } from './core/state.js';
import { GRIDS, gridByKind, blankFcl, blankDetail } from './core/factories.js';
import { paintFcl } from './grids/fcl.js';
import { paintDetail, captureGridRow } from './grids/detail.js';
import { paintTab, renderSearch } from './ui/paint.js';
import { showToast, confirmDialog } from './ui/toast.js';
import { hideErrorModal } from './ui/errors.js';
import {
    lookupSale, lookupApprover, lookupCustomer, lookupAgent,
    selectSale, selectApprover, selectCustomer, selectAgent,
} from './data/masters.js';
import { msg } from './core/messages.js';
import {
    doSave, doDelete, doApprove, doNew, doReset, doPrint, navigateTo, switchClass,
} from './actions.js';
import { installSmartSuggest } from './suggest/field.js';
import { installItemCellSuggest } from './suggest/item-cell.js';
import { installPortCellSuggest } from './suggest/port-cell.js';

export function bindEvents() {
    /* ----- Dirty tracking + grid input capture ----- */

    document.addEventListener('input', (e) => {
        if (suppressDirty) return;
        const t = e.target;
        if (!(t instanceof HTMLElement)) return;
        const tr = t.closest('tr[data-idx]');
        if (tr && t.dataset.col) {
            captureGridRow(tr);
            setDirty(true);
            return;
        }
        if (t.name) setDirty(true);
    });
    document.addEventListener('change', (e) => {
        if (suppressDirty) return;
        const t = e.target;
        const tr = t.closest('tr[data-idx]');
        if (tr && t.dataset && t.dataset.col) {
            captureGridRow(tr);
            setDirty(true);
        }
    });

    /* ----- Tabs ----- */

    $$('.tab').forEach(btn => {
        btn.addEventListener('click', () => {
            setActiveTab(btn.dataset.tab);
            paintTab();
        });
    });

    /* ----- Class toggle ----- */

    $('#classIM').addEventListener('click', () => switchClass('IM'));
    $('#classEX').addEventListener('click', () => switchClass('EX'));

    /* ----- FCL grid ----- */

    $('#addFclBtn').addEventListener('click', () => {
        const q = current(); if (!q) return;
        q.freightRates.push(blankFcl());
        paintFcl();
        setDirty(true);
        showToast('Route added');
    });
    $('#clearFclBtn').addEventListener('click', async () => {
        const q = current();
        if (!q?.freightRates?.length) return;
        const ok = await confirmDialog({
            title: 'Clear all freight rates?',
            message: `Remove all ${q.freightRates.length} route(s)?`,
            confirmLabel: 'Clear All',
            danger: true,
        });
        if (!ok) return;
        q.freightRates = [];
        paintFcl();
        setDirty(true);
        showToast('All freight rates removed', '🗑');
    });
    $('#loadRateBtn').addEventListener('click', () => {
        showToast('Load Rate from Master — would query master rate sheet', '⬇', 'warn');
    });

    /* ----- Detail grids (LCL / Shipping / Transport) ----- */

    Object.values(GRIDS).forEach(cfg => {
        const addBtn = $(`#${cfg.addBtnId}`);
        if (addBtn) addBtn.addEventListener('click', () => {
            const q = current(); if (!q) return;
            if (!Array.isArray(q[cfg.arrayKey])) q[cfg.arrayKey] = [];
            q[cfg.arrayKey].push(blankDetail(cfg));
            paintDetail(cfg);
            setDirty(true);
            showToast(cfg.addedToast);
        });
        const clearBtn = $(`#${cfg.clearBtnId}`);
        if (clearBtn) clearBtn.addEventListener('click', async () => {
            const q = current();
            if (!q?.[cfg.arrayKey]?.length) return;
            const ok = await confirmDialog({
                title: cfg.clearTitle,
                message: `Remove all ${q[cfg.arrayKey].length} charge(s)?`,
                confirmLabel: 'Clear All',
                danger: true,
            });
            if (!ok) return;
            q[cfg.arrayKey] = [];
            paintDetail(cfg);
            setDirty(true);
            showToast(cfg.clearedToast, '🗑');
        });
    });

    /* ----- Row delete (FCL + all detail grids) ----- */

    const tbodyIds = ['fclTbody', ...Object.values(GRIDS).map(c => c.tbodyId)];
    tbodyIds.forEach(id => {
        const tb = $(`#${id}`);
        if (!tb) return;
        tb.addEventListener('click', (e) => {
            if (!e.target.classList.contains('row-del')) return;
            const tr = e.target.closest('tr');
            const idx = +tr.dataset.idx;
            const kind = tr.dataset.kind;
            const q = current(); if (!q) return;
            if (kind === 'fcl') {
                q.freightRates.splice(idx, 1);
                paintFcl();
            } else {
                const cfg = gridByKind(kind);
                if (!cfg) return;
                q[cfg.arrayKey].splice(idx, 1);
                paintDetail(cfg);
            }
            setDirty(true);
        });
    });

    /* ----- Lookup buttons (header CustNo / SaleNo / AppByNo / AgentNo) ----- */

    $$('.lookup-btn').forEach(b => {
        b.addEventListener('click', () => {
            const codeEl = b.previousElementSibling;
            const nameEl = b.nextElementSibling;
            if (!codeEl || !nameEl) return;
            const codeName = codeEl.name;
            const code = (codeEl.value || '').trim();
            if (!code) { showToast('Enter a code first', '⌕', 'warn'); return; }
            const q = current(); if (!q) return;

            let ok = false;
            let errMsg = '';

            switch (codeName) {
                case 'SaleNo': {
                    const r = lookupSale(code);
                    ok = r.ok;
                    if (ok) selectSale({ SaleNo: code, SaleName: r.name });
                    else    errMsg = msg('saleNoNotFound');
                    break;
                }
                case 'AppByNo': {
                    const r = lookupApprover(code);
                    ok = r.ok;
                    if (ok) selectApprover({ AppByNo: code, AppByName: r.name });
                    else    errMsg = msg('appNoNotFound');
                    break;
                }
                case 'CustNo': {
                    const r = lookupCustomer(code);
                    ok = r.ok;
                    if (ok && r.record)      selectCustomer(r.record);
                    else if (!ok)            errMsg = msg('custNoNotFound');
                    break;
                }
                case 'AgentNo': {
                    const r = lookupAgent(code);
                    ok = r.ok;
                    if (ok && r.record)      selectAgent(r.record);
                    else if (!ok)            errMsg = msg('agentNoNotFound');
                    break;
                }
                default:
                    showToast(`Lookup not configured for ${codeName}`, '⌕', 'warn');
                    return;
            }

            if (ok) {
                setDirty(true);
                showToast(`Lookup: ${code} → ${nameEl.value || '(populated)'}`, '✓');
            } else {
                showToast(errMsg, '✕', 'error');
            }
        });
    });

    /* ----- Real-time lookup on blur (matches frm Validate event) -----
     * Skipped if user just picked from suggest dropdown — the same code would
     * re-resolve on side-effects we already applied. */

    ['SaleNo', 'AppByNo', 'CustNo', 'AgentNo'].forEach(field => {
        const codeEl = document.querySelector(`[name="${field}"]`);
        if (!codeEl) return;
        codeEl.addEventListener('blur', () => {
            if (codeEl._suggestJustPicked) { codeEl._suggestJustPicked = false; return; }
            const btn = codeEl.parentElement?.querySelector('.lookup-btn');
            if (btn && (codeEl.value || '').trim()) btn.click();
        });
    });

    /* ----- Smart-suggest (header lookup fields) ----- */

    installSmartSuggest(document.querySelector('[name="CustNo"]'), {
        source: () => state.masters?.customers || [],
        fields: ['CustNo', 'CustName'],
        label:  'customer',
        countLabel: (n) => `${n.toLocaleString()} customers`,
        render: (r) => ({
            code: r.CustNo,
            name: r.CustName,
            meta: [r.Tel, (r.Address || '').split('\n')[0]].filter(Boolean).join(' · '),
        }),
        onSelect: (r) => selectCustomer(r),
    });

    installSmartSuggest(document.querySelector('[name="SaleNo"]'), {
        source: () => state.masters?.salesPeople || [],
        fields: ['SaleNo', 'SaleName'],
        label:  'sale person',
        countLabel: (n) => `${n} sales`,
        render: (r) => ({ code: r.SaleNo, name: r.SaleName }),
        onSelect: (r) => selectSale(r),
    });

    installSmartSuggest(document.querySelector('[name="AppByNo"]'), {
        source: () => state.masters?.approvers || [],
        fields: ['AppByNo', 'AppByName'],
        label:  'approver',
        countLabel: (n) => `${n} approvers`,
        render: (r) => ({ code: r.AppByNo, name: r.AppByName }),
        onSelect: (r) => selectApprover(r),
    });

    installSmartSuggest(document.querySelector('[name="AgentNo"]'), {
        source: () => state.masters?.agents || [],
        fields: ['AgentNo', 'AgentName'],
        label:  'agent',
        countLabel: (n) => `${n} agents`,
        render: (r) => ({
            code: r.AgentNo,
            name: r.AgentName,
            meta: (r.Address || '').split('\n')[0],
        }),
        onSelect: (r) => selectAgent(r),
    });

    /* ----- Cell-level suggests ----- */

    installItemCellSuggest();   // LCL / Shipping / Transport ExpCode + ExpDesc1
    installPortCellSuggest();   // FCL Port-of-* + paired *Code cells

    /* ----- Error modal ----- */

    $('#errOk').addEventListener('click', hideErrorModal);
    $('#errorModal').addEventListener('click', (e) => {
        if (e.target.id === 'errorModal') hideErrorModal();
    });

    /* ----- Action buttons ----- */

    ['saveBtn', 'saveBtn2'].forEach(id => $(`#${id}`).addEventListener('click', doSave));
    ['printBtn', 'printBtn2'].forEach(id => $(`#${id}`).addEventListener('click', doPrint));
    $('#deleteBtn').addEventListener('click', doDelete);
    $('#approveBtn').addEventListener('click', doApprove);
    $('#newBtn').addEventListener('click', () => doNew());
    $('#resetSeedBtn').addEventListener('click', doReset);

    /* ----- Navigation ----- */

    $('#navFirst').addEventListener('click', () => navigateTo(0));
    $('#navPrev').addEventListener('click',  () => navigateTo(state.currentIndex - 1));
    $('#navNext').addEventListener('click',  () => navigateTo(state.currentIndex + 1));
    $('#navLast').addEventListener('click',  () => navigateTo(state.quotations.length - 1));

    /* ----- Top-bar search ----- */

    $('#searchInput').addEventListener('input', (e) => renderSearch(e.target.value));
    $('#searchInput').addEventListener('focus', (e) => renderSearch(e.target.value));
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#searchInput') && !e.target.closest('#searchDropdown')) {
            $('#searchDropdown').classList.add('hidden');
        }
    });
    $('#searchDropdown').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-go]');
        if (!btn) return;
        const idx = +btn.dataset.go;
        $('#searchInput').value = '';
        $('#searchDropdown').classList.add('hidden');
        navigateTo(idx);
    });

    /* ----- Keyboard shortcuts ----- */

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault(); doSave();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
            e.preventDefault(); doPrint();
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') {
            e.preventDefault(); navigateTo(state.currentIndex - 1);
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') {
            e.preventDefault(); navigateTo(state.currentIndex + 1);
        }
    });

    window.addEventListener('beforeunload', (e) => {
        const flag = document.getElementById('dirtyFlag');
        const isDirty = flag && !flag.classList.contains('hidden');
        if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    });
}
