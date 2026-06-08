/* events.js — DOM event wiring (connect HTML to handlers + suggest installers).
 * Called once at boot. Subsequent grid re-renders rely on event delegation. */
window.SFQ = window.SFQ || {};
window.SFQ.events = (function () {
    'use strict';
    const { $, $$ }                              = SFQ.utils;
    const { state, setActiveTab, setDirty, current } = SFQ.state;
    const { GRIDS, gridByKind, blankFcl, blankDetail } = SFQ.factories;
    const { showToast, confirmDialog }           = SFQ.toast;

    function bindEvents() {

        /* ----- Dirty tracking + grid input capture ----- */

        document.addEventListener('input', (e) => {
            if (state.suppressDirty) return;
            const t = e.target;
            if (!(t instanceof HTMLElement)) return;
            const tr = t.closest('tr[data-idx]');
            if (tr && t.dataset.col) {
                SFQ.gridDetail.captureGridRow(tr);
                setDirty(true);
                return;
            }
            if (t.name) setDirty(true);
        });
        document.addEventListener('change', (e) => {
            if (state.suppressDirty) return;
            const t = e.target;
            const tr = t.closest('tr[data-idx]');
            if (tr && t.dataset && t.dataset.col) {
                SFQ.gridDetail.captureGridRow(tr);
                setDirty(true);
            }
        });

        /* ----- Tabs ----- */

        $$('.tab').forEach(btn => {
            btn.addEventListener('click', () => {
                setActiveTab(btn.dataset.tab);
                SFQ.paint.paintTab();
            });
        });

        /* ----- Class toggle ----- */

        $('#classIM').addEventListener('click', () => SFQ.actions.switchClass('IM'));
        $('#classEX').addEventListener('click', () => SFQ.actions.switchClass('EX'));

        /* ----- FCL grid ----- */

        $('#addFclBtn').addEventListener('click', () => {
            const q = current(); if (!q) return;
            q.freightRates.push(blankFcl());
            SFQ.gridFcl.paintFcl();
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
            SFQ.gridFcl.paintFcl();
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
                SFQ.gridDetail.paintDetail(cfg);
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
                SFQ.gridDetail.paintDetail(cfg);
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
                    SFQ.gridFcl.paintFcl();
                } else {
                    const cfg = gridByKind(kind);
                    if (!cfg) return;
                    q[cfg.arrayKey].splice(idx, 1);
                    SFQ.gridDetail.paintDetail(cfg);
                }
                setDirty(true);
            });
        });

        /* ----- Lookup buttons ----- */

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
                const m = SFQ.masters;
                const messages = SFQ.messages;

                switch (codeName) {
                    case 'SaleNo': {
                        const r = m.lookupSale(code);
                        ok = r.ok;
                        if (ok) m.selectSale({ SaleNo: code, SaleName: r.name });
                        else    errMsg = messages.msg('saleNoNotFound');
                        break;
                    }
                    case 'AppByNo': {
                        const r = m.lookupApprover(code);
                        ok = r.ok;
                        if (ok) m.selectApprover({ AppByNo: code, AppByName: r.name });
                        else    errMsg = messages.msg('appNoNotFound');
                        break;
                    }
                    case 'CustNo': {
                        const r = m.lookupCustomer(code);
                        ok = r.ok;
                        if (ok && r.record)      m.selectCustomer(r.record);
                        else if (!ok)            errMsg = messages.msg('custNoNotFound');
                        break;
                    }
                    case 'AgentNo': {
                        const r = m.lookupAgent(code);
                        ok = r.ok;
                        if (ok && r.record)      m.selectAgent(r.record);
                        else if (!ok)            errMsg = messages.msg('agentNoNotFound');
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

        const installSmartSuggest = SFQ.suggestField.installSmartSuggest;
        const m = SFQ.masters;

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
            onSelect: (r) => m.selectCustomer(r),
        });

        installSmartSuggest(document.querySelector('[name="SaleNo"]'), {
            source: () => state.masters?.salesPeople || [],
            fields: ['SaleNo', 'SaleName'],
            label:  'sale person',
            countLabel: (n) => `${n} sales`,
            render: (r) => ({ code: r.SaleNo, name: r.SaleName }),
            onSelect: (r) => m.selectSale(r),
        });

        installSmartSuggest(document.querySelector('[name="AppByNo"]'), {
            source: () => state.masters?.approvers || [],
            fields: ['AppByNo', 'AppByName'],
            label:  'approver',
            countLabel: (n) => `${n} approvers`,
            render: (r) => ({ code: r.AppByNo, name: r.AppByName }),
            onSelect: (r) => m.selectApprover(r),
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
            onSelect: (r) => m.selectAgent(r),
        });

        /* ----- Cell-level suggests ----- */

        SFQ.suggestItemCell.installItemCellSuggest();
        SFQ.suggestPortCell.installPortCellSuggest();

        /* ----- Error modal ----- */

        $('#errOk').addEventListener('click', SFQ.errors.hideErrorModal);
        $('#errorModal').addEventListener('click', (e) => {
            if (e.target.id === 'errorModal') SFQ.errors.hideErrorModal();
        });

        /* ----- Action buttons ----- */

        const a = SFQ.actions;
        ['saveBtn', 'saveBtn2'].forEach(id => $(`#${id}`).addEventListener('click', a.doSave));
        ['printBtn', 'printBtn2'].forEach(id => $(`#${id}`).addEventListener('click', a.doPrint));
        $('#deleteBtn').addEventListener('click', a.doDelete);
        $('#approveBtn').addEventListener('click', a.doApprove);
        $('#newBtn').addEventListener('click', () => a.doNew());
        $('#resetSeedBtn').addEventListener('click', a.doReset);

        /* ----- Navigation ----- */

        $('#navFirst').addEventListener('click', () => a.navigateTo(0));
        $('#navPrev').addEventListener('click',  () => a.navigateTo(state.currentIndex - 1));
        $('#navNext').addEventListener('click',  () => a.navigateTo(state.currentIndex + 1));
        $('#navLast').addEventListener('click',  () => a.navigateTo(state.quotations.length - 1));

        /* ----- Top-bar search ----- */

        $('#searchInput').addEventListener('input', (e) => SFQ.paint.renderSearch(e.target.value));
        $('#searchInput').addEventListener('focus', (e) => SFQ.paint.renderSearch(e.target.value));
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
            a.navigateTo(idx);
        });

        /* ----- Keyboard shortcuts ----- */

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault(); a.doSave();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
                e.preventDefault(); a.doPrint();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') {
                e.preventDefault(); a.navigateTo(state.currentIndex - 1);
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') {
                e.preventDefault(); a.navigateTo(state.currentIndex + 1);
            }
        });

        window.addEventListener('beforeunload', (e) => {
            const flag = document.getElementById('dirtyFlag');
            const isDirty = flag && !flag.classList.contains('hidden');
            if (isDirty) { e.preventDefault(); e.returnValue = ''; }
        });
    }

    return { bindEvents };
}());
