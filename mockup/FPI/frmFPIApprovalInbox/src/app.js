/* app.js — Approval Inbox bootstrap + actions.
   Writes to the SAME localStorage workflow the Booking Margin Gate reads, so an
   Approve/Reject here shows up there (and vice-versa). */
window.IB = window.IB || {};
window.IB.app = (function () {
    'use strict';

    const { $, $$, esc, money, round, todayISO } = BG.utils;

    const view = { tab: 'pending', sort: 'worst', selected: new Set() };

    const TABS = [
        { id: 'pending',  label: 'รออนุมัติ' },
        { id: 'approved', label: 'อนุมัติแล้ว' },
        { id: 'rejected', label: 'ตีกลับ' },
        { id: 'all',      label: 'ทั้งหมด' }
    ];

    /* ---------------- reason modal ---------------- */

    function askReason(title, desc, okLabel) {
        return new Promise(resolve => {
            const m = $('#reasonModal');
            $('#reasonTitle').textContent = title;
            $('#reasonDesc').innerHTML = desc;
            $('#reasonText').value = '';
            $('#reasonErr').classList.add('hidden');
            $('#reasonOk').textContent = okLabel || 'ยืนยัน';
            m.classList.remove('hidden');
            setTimeout(() => $('#reasonText').focus(), 0);
            const done = v => { m.classList.add('hidden'); $('#reasonOk').onclick = null; $('#reasonCancel').onclick = null; resolve(v); };
            $('#reasonOk').onclick = () => {
                const v = $('#reasonText').value.trim();
                if (v.length < 5) { $('#reasonErr').classList.remove('hidden'); return; }
                done(v);
            };
            $('#reasonCancel').onclick = () => done(null);
        });
    }

    function stamp(docNo, action, note) {
        const w = BG.state.wf(docNo);
        w.log = w.log || [];
        w.log.push({ action, note: note || '', at: todayISO() });
    }

    /* ---------------- actions ---------------- */

    async function approve(it, presetReason) {
        const b = it.booking;
        const reason = presetReason || await askReason(
            'Approve Profit — ' + b.docNo,
            'Margin <b>' + round(it.verdict.marginPct, 2) + '%</b> ต่ำกว่าเกณฑ์ ' + it.rule.minMarginPct + '% (ขาด ' + it.shortfall + ' จุด).' +
            (it.reason.key === 'market' ? ' ต้นทุนขึ้น <b>+' + money(it.af.totalDelta, 0) + ' THB</b> จากตลาด.' : '') +
            ' บันทึกเหตุผลที่อนุมัติให้ผ่านทั้งที่ต่ำกว่าเกณฑ์',
            'อนุมัติ');
        if (!reason) return false;
        const w = BG.state.wf(b.docNo);
        if (w.docStat === 'Open') w.docStat = 'Wait';
        w.isProApp = true;
        w.marginPct = it.verdict.marginPct;
        w.rejected = false; w.rejectReason = null;
        stamp(b.docNo, 'Approve Profit (Inbox)', reason);
        BG.state.saveWorkflow();
        return true;
    }

    async function reject(it) {
        const reason = await askReason(
            'ตีกลับให้ Sales แก้ — ' + it.booking.docNo,
            'ส่งกลับให้ Sales ทบทวน/Revise ใบเสนอราคา (' + esc(it.reason.label) + ')',
            'ตีกลับ');
        if (!reason) return;
        const w = BG.state.wf(it.booking.docNo);
        w.rejected = true; w.rejectReason = reason;
        w.isProApp = false;
        stamp(it.booking.docNo, 'Reject (Inbox)', reason);
        BG.state.saveWorkflow();
        render();
    }

    async function approveOne(it) { if (await approve(it)) render(); }

    async function batchApprove() {
        if (!view.selected.size) return;
        const reason = await askReason(
            'Approve Profit ' + view.selected.size + ' รายการ',
            'อนุมัติทุกรายการที่เลือกด้วยเหตุผลเดียวกัน',
            'อนุมัติทั้งหมด');
        if (!reason) return;
        const items = IB.inbox.buildAll();
        view.selected.forEach(docNo => {
            const it = items.find(x => x.booking.docNo === docNo);
            if (it && it.queue === 'pending') approve(it, reason);
        });
        view.selected.clear();
        render();
    }

    /* ---------------- render ---------------- */

    function render() {
        const items = IB.inbox.buildAll();
        IB.inbox.renderSummary(items);
        $('#statPending').textContent = items.filter(i => i.queue === 'pending').length;

        // tabs
        const tabsBox = $('#tabs');
        tabsBox.innerHTML = '';
        TABS.forEach(t => {
            const n = t.id === 'all' ? items.length : items.filter(i => i.queue === t.id).length;
            const b = document.createElement('div');
            b.className = 'tab' + (view.tab === t.id ? ' on' : '');
            b.textContent = t.label + ' (' + n + ')';
            b.onclick = () => { view.tab = t.id; view.selected.clear(); render(); };
            tabsBox.appendChild(b);
        });

        let shown = view.tab === 'all' ? items : items.filter(i => i.queue === view.tab);
        shown = IB.inbox.sortItems(shown, view.sort);

        IB.inbox.renderList(shown, {
            batch: view.tab === 'pending',
            selected: view.selected,
            emptyText: view.tab === 'pending' ? '🎉 ไม่มีรายการรออนุมัติ' : 'ไม่มีรายการในแท็บนี้',
            onToggleSel: docNo => { view.selected.has(docNo) ? view.selected.delete(docNo) : view.selected.add(docNo); render(); },
            onApprove: approveOne,
            onReject: reject
        });

        // batch bar
        const bar = $('#batchBar');
        if (view.selected.size) {
            bar.classList.remove('hidden'); bar.classList.add('flex');
            $('#batchCount').textContent = 'เลือก ' + view.selected.size + ' รายการ';
        } else {
            bar.classList.add('hidden'); bar.classList.remove('flex');
        }
    }

    /* ---------------- boot ---------------- */

    async function boot() {
        await BG.state.load();
        $('#statSource').textContent = BG.state.state.source;

        $('#sortSel').onchange = e => { view.sort = e.target.value; render(); };
        $('#batchApprove').onclick = batchApprove;
        $('#batchClear').onclick = () => { view.selected.clear(); render(); };
        $('#resetBtn').onclick = () => { BG.state.resetAllWorkflow(); view.selected.clear(); render(); };

        render();
    }

    return { boot, render };
})();

document.addEventListener('DOMContentLoaded', () => IB.app.boot());
