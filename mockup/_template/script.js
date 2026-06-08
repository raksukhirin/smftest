/* ===== Module Template — script.js =====
 *
 * Skeleton for a new mockup module. Copy & rename, then fill in TODOs.
 *
 * Sections (top → bottom):
 *   1. Constants & state
 *   2. Bilingual messages (MSG)
 *   3. Boot + persistence
 *   4. Factories (blank record, blank detail row)
 *   5. Render (paint*) — DOM ← state
 *   6. Capture — DOM → state
 *   7. Lookups & side-effects (when masters available)
 *   8. Validation
 *   9. Read-only mode
 *  10. Toast + dialog helpers
 *  11. Actions (save / delete / approve / new / nav / reset / search)
 *  12. Bind events
 */

(() => {
    const $  = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    // ===== 1. Constants & state =====
    // TODO: เปลี่ยน STORAGE_KEY ให้ unique per module
    const STORAGE_KEY = 'your_module_v1';

    let state = { docs: [], currentIndex: 0, masters: null };
    let dirty = false;
    let suppressDirty = false;

    // ===== 2. Bilingual messages (mirrors frm SysCode) =====
    const MSG = {
        docNoBlank: { th: 'เลขที่เอกสารห้ามว่าง', en: 'Doc Number cannot be blank' },
        docNoDup:   { th: 'เลขที่เอกสารซ้ำ',     en: 'Doc Number already exists' },
        // TODO: เพิ่ม message ตามที่ port มาจาก Sub ChkValidate
    };
    let locale = 'en';
    function msg(key) {
        const m = MSG[key];
        return m ? (m[locale] || m.en) : key;
    }

    // ===== 3. Boot + persistence =====
    boot();

    async function boot() {
        await loadInitial();
        bindEvents();
        paintAll();
    }

    async function loadInitial() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const s = JSON.parse(raw);
                if (s?.docs?.length) {
                    state = {
                        docs: s.docs,
                        currentIndex: Math.min(s.currentIndex || 0, s.docs.length - 1),
                        masters: s.masters,
                    };
                    if (!state.masters) await fetchMastersOnly();
                    return;
                }
            }
        } catch (_) {}
        await seedFromJson();
    }

    async function seedFromJson() {
        try {
            const res = await fetch('data.json', { cache: 'no-store' });
            if (!res.ok) throw new Error('data.json not reachable');
            const data = await res.json();
            state.docs = Array.isArray(data.docs) ? data.docs : [];
            state.masters = data.masters || null;
            state.currentIndex = 0;
            persist();
        } catch (err) {
            console.warn('Could not load data.json — starting empty.', err);
            state = { docs: [blankDoc()], currentIndex: 0, masters: null };
            persist();
        }
    }

    async function fetchMastersOnly() {
        try {
            const res = await fetch('data.json', { cache: 'no-store' });
            const data = await res.json();
            state.masters = data.masters;
            persist();
        } catch (_) {}
    }

    function persist() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function current() {
        return state.docs[state.currentIndex] ?? null;
    }

    // ===== 4. Factories =====
    function blankDoc() {
        const now = new Date();
        return {
            // TODO: เพิ่ม field ตาม schema ของ form
            DocNo: `NEW${String(now.getTime()).slice(-7)}`,
            DocDate: now.toISOString().slice(0, 10),
            DocStat: 'Open',
            lock: now.getTime(),
            EditBy: 'SYSTEM',
            EditDate: now.toISOString().slice(0, 19).replace('T', ' '),
            details: [],
            _isNew: true,
        };
    }

    function blankDetailRow() {
        return {
            DETID: 'row-' + Math.random().toString(36).slice(2, 10),
            // TODO: เพิ่ม column ตาม detail table schema
            Description: '',
            Qty: 1,
            Price: 0,
        };
    }

    // ===== 5. Render =====
    function paintAll() {
        clearErrors();
        paintHeaderForm();
        paintBanner();
        paintDetail();
        paintNav();
        applyReadOnly();
        setDirty(false);
    }

    function paintHeaderForm() {
        const q = current();
        suppressDirty = true;
        try {
            $$('[name]').forEach(el => {
                const key = el.name;
                if (!q || !(key in q)) {
                    if (el.type === 'checkbox') el.checked = false;
                    else el.value = '';
                    return;
                }
                const v = q[key];
                if (el.type === 'checkbox') el.checked = !!v;
                else if (el.type === 'date') el.value = v ? String(v).slice(0, 10) : '';
                else el.value = (v === null || v === undefined) ? '' : v;
            });
        } finally {
            suppressDirty = false;
        }
    }

    function paintBanner() {
        const q = current();
        $('#bannerDocNo').textContent    = q?.DocNo || '—';
        $('#bannerDocDate').textContent  = formatDate(q?.DocDate) || '—';
        $('#footerEditInfo').textContent = q?.EditBy ? `${q.EditBy} · ${q.EditDate || ''}` : '—';
        const lastEl = $('#lastModified');
        if (lastEl) {
            lastEl.innerHTML = q?.EditBy
                ? `Modified by <strong>${escapeHtml(q.EditBy)}</strong> · ${escapeHtml(q.EditDate || '')}`
                : '—';
        }
        applyStatusPill(q?.DocStat);
    }

    function applyStatusPill(stat) {
        const map = {
            Open:     'status-open',
            Approved: 'status-approved',
            Close:    'status-close',
            Complete: 'status-complete',
            Deleted:  'status-deleted',
            Rejected: 'status-rejected',
        };
        const cls = map[stat] || 'status-open';
        const pill = $('#statusPill');
        pill.className = `status-pill ${cls}`;
        pill.textContent = `● ${stat || 'Open'}`;
    }

    function paintDetail() {
        const q = current();
        const tbody = $('#detailTbody');
        tbody.innerHTML = '';
        const rows = q?.details ?? [];
        rows.forEach((r, i) => tbody.appendChild(detailRowEl(r, i)));
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-slate-400 py-4 text-sm">No rows — click "+ Add Row" to start.</td></tr>`;
        }
    }

    function detailRowEl(row, idx) {
        const tr = document.createElement('tr');
        tr.dataset.detid = row.DETID;
        tr.dataset.idx = String(idx);
        const total = (Number(row.Qty) || 0) * (Number(row.Price) || 0);
        tr.innerHTML = `
            <td class="px-2 py-1 text-slate-400 text-xs">${idx + 1}</td>
            <td class="px-2 py-1"><input class="cell-input" data-col="Description" value="${escapeHtml(row.Description ?? '')}"></td>
            <td class="px-2 py-1"><input type="number" step="0.01" class="cell-input text-right tabular-nums" data-col="Qty" value="${row.Qty ?? 0}"></td>
            <td class="px-2 py-1"><input type="number" step="0.01" class="cell-input text-right tabular-nums" data-col="Price" value="${row.Price ?? 0}"></td>
            <td class="px-2 py-1 text-right tabular-nums" data-col="Total">${fmtMoney(total)}</td>
            <td class="px-2 py-1 text-center"><button type="button" class="row-del" title="Delete row">✕</button></td>
        `;
        return tr;
    }

    function paintNav() {
        const total = state.docs.length;
        const idx = state.currentIndex;
        $('#navCounter').textContent = total ? `${idx + 1} / ${total}` : '0 / 0';
        $('#navFirst').disabled = idx <= 0;
        $('#navPrev').disabled  = idx <= 0;
        $('#navNext').disabled  = idx >= total - 1;
        $('#navLast').disabled  = idx >= total - 1;
    }

    // ===== 6. Capture =====
    function captureForm() {
        const q = current(); if (!q) return;
        $$('[name]').forEach(el => {
            const key = el.name;
            let v;
            if (el.type === 'checkbox') v = el.checked;
            else if (el.type === 'number') v = el.value === '' ? null : Number(el.value);
            else if (el.type === 'date') v = el.value || null;
            else v = el.value === '' ? '' : el.value;
            q[key] = v;
        });
    }

    function captureDetailRow(tr) {
        const q = current(); if (!q) return;
        const idx = +tr.dataset.idx;
        const row = q.details[idx]; if (!row) return;
        $$('[data-col]', tr).forEach(el => {
            const col = el.dataset.col;
            if (col === 'Total') return;
            if (el.type === 'number') row[col] = el.value === '' ? 0 : Number(el.value);
            else row[col] = el.value;
        });
        // Live recalc Total
        const total = (Number(row.Qty) || 0) * (Number(row.Price) || 0);
        const cell = tr.querySelector('[data-col="Total"]');
        if (cell) cell.textContent = fmtMoney(total);
    }

    // ===== 7. Lookups & side-effects =====
    // TODO: implement ตาม master ที่ module ใช้
    // function lookupCustomer(code) {
    //     if (!code) return { ok: true, record: null };
    //     const m = (state.masters?.customers || []).find(x => x.CustNo.toLowerCase() === code.toLowerCase());
    //     return m ? { ok: true, record: m } : { ok: false, record: null };
    // }
    // function applyCustomerSideEffects(rec) { ... }

    // ===== 8. Validation =====
    function validate() {
        const q = current();
        const errors = [];
        if (!q) return errors;

        // TODO: port กฎจาก Sub ChkValidate ของ frm
        if (!(q.DocNo || '').trim()) {
            errors.push({ field: 'DocNo', loc: 'Doc Number', msg: msg('docNoBlank') });
        } else {
            const dup = state.docs.some((other, i) =>
                i !== state.currentIndex &&
                (other.DocNo || '').toLowerCase() === (q.DocNo || '').toLowerCase());
            if (dup) errors.push({ field: 'DocNo', loc: 'Doc Number', msg: msg('docNoDup') });
        }

        // TODO: detail row validation (port จาก Sub ChkValidDetailCell)
        // (q.details || []).forEach((row, i) => {
        //     if (!(row.Description || '').trim()) {
        //         errors.push({ gridKind: 'detail', gridIdx: i, col: 'Description',
        //                       loc: `Row ${i+1} · Description`, msg: msg('descBlank') });
        //     }
        // });

        return errors;
    }

    function applyErrors(errors) {
        clearErrors();
        if (!errors.length) return;
        errors.forEach(err => {
            if (err.field) {
                const el = document.querySelector(`[name="${err.field}"]`);
                if (el) {
                    el.classList.add('is-error');
                    const wrap = el.closest('.field, .field-with-lookup');
                    if (wrap && !wrap.querySelector('.field-error')) {
                        const span = document.createElement('span');
                        span.className = 'field-error';
                        span.textContent = err.msg;
                        wrap.appendChild(span);
                    }
                }
            }
            if (err.gridKind) {
                const tr = document.querySelector(`#detailTbody tr[data-idx="${err.gridIdx}"]`);
                if (tr) {
                    const cell = tr.querySelector(`[data-col="${err.col}"]`);
                    if (cell) {
                        cell.classList.add('is-error');
                        const td = cell.closest('td');
                        if (td && !td.querySelector('.cell-error')) {
                            const div = document.createElement('div');
                            div.className = 'cell-error';
                            div.textContent = err.msg;
                            td.appendChild(div);
                        }
                    }
                }
            }
        });
        showErrorModal(errors);
    }

    function clearErrors() {
        $$('.is-error').forEach(el => el.classList.remove('is-error'));
        $$('.field-error, .cell-error').forEach(el => el.remove());
    }

    function showErrorModal(errors) {
        $('#errCount').textContent = errors.length;
        $('#errorList').innerHTML = errors.map(e => `
            <li><span class="err-loc">${escapeHtml(e.loc)}</span>${escapeHtml(e.msg)}</li>
        `).join('');
        const modal = $('#errorModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function hideErrorModal() {
        const modal = $('#errorModal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    // ===== 9. Read-only =====
    function applyReadOnly() {
        const q = current();
        const locked = !!q && (q.DocStat === 'Approved' || q.DocStat === 'Deleted');
        document.body.classList.toggle('is-readonly', locked);
        const banner = $('#readonlyBanner');
        if (!q) { banner.className = 'readonly-banner'; return; }
        if (q.DocStat === 'Approved') {
            banner.className = 'readonly-banner is-approved';
            $('#readonlyText').textContent = '🔒 This document is APPROVED — read-only.';
        } else if (q.DocStat === 'Deleted') {
            banner.className = 'readonly-banner is-deleted';
            $('#readonlyText').textContent = '🗑 This document is DELETED — read-only.';
        } else {
            banner.className = 'readonly-banner';
        }
    }

    // ===== 10. Toast + dialog =====
    function showToast(msgText, icon = '✓', kind = 'success') {
        $('#toastMsg').textContent = msgText;
        $('#toastIcon').textContent = icon;
        const inner = $('#toast').firstElementChild;
        inner.className = 'px-4 py-3 rounded-lg shadow-lg text-sm flex items-center gap-2 ' + ({
            success: 'bg-slate-900 text-white',
            warn:    'bg-amber-500 text-white',
            error:   'bg-red-600 text-white',
        }[kind] || 'bg-slate-900 text-white');
        $('#toast').classList.remove('hidden');
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => $('#toast').classList.add('hidden'), 2500);
    }

    function confirmDialog({ title, message, confirmLabel = 'OK', danger = false }) {
        return new Promise(resolve => {
            $('#dlgTitle').textContent = title;
            $('#dlgMsg').textContent   = message;
            const btn = $('#dlgConfirm');
            btn.textContent = confirmLabel;
            btn.className = danger ? 'btn-danger' : 'btn-primary';
            const dlg = $('#dialog');
            dlg.classList.remove('hidden');
            dlg.classList.add('flex');
            const cleanup = (val) => {
                dlg.classList.add('hidden');
                dlg.classList.remove('flex');
                btn.onclick = null;
                $('#dlgCancel').onclick = null;
                resolve(val);
            };
            btn.onclick = () => cleanup(true);
            $('#dlgCancel').onclick = () => cleanup(false);
        });
    }

    // ===== 11. Actions =====
    function doSave() {
        if (!current()) return;
        const q0 = current();
        if (q0.DocStat === 'Approved' || q0.DocStat === 'Deleted') {
            showToast(`Cannot save — document is ${q0.DocStat}`, '🔒', 'warn');
            return;
        }
        captureForm();
        $$('#detailTbody tr[data-idx]').forEach(captureDetailRow);

        const errors = validate();
        if (errors.length) {
            applyErrors(errors);
            showToast(`${errors.length} validation error(s)`, '⚠', 'error');
            return;
        }
        clearErrors();

        const q = current();
        q.details.forEach((r, i) => { r.SeqNo = i + 1; });
        q.lock = Date.now();
        q.EditDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
        delete q._isNew;
        persist();
        setDirty(false);
        paintBanner();
        showToast(`Saved ${q.DocNo}`, '💾');
    }

    async function doDelete() {
        const q = current(); if (!q) return;
        if (q.DocStat === 'Deleted') {
            showToast('Already deleted', '🔒', 'warn');
            return;
        }
        const ok = await confirmDialog({
            title: `Delete ${q.DocNo}?`,
            message: `DocStat will be set to 'Deleted' (soft delete).`,
            confirmLabel: 'Delete',
            danger: true,
        });
        if (!ok) return;
        if (q._isNew) {
            state.docs.splice(state.currentIndex, 1);
            state.currentIndex = Math.max(0, state.currentIndex - 1);
            if (!state.docs.length) state.docs.push(blankDoc());
        } else {
            q.DocStat = 'Deleted';
            q.lock = Date.now();
            q.EditDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
        }
        persist();
        paintAll();
        showToast(`Deleted ${q.DocNo}`, '🗑', 'error');
    }

    async function doNew() {
        if (dirty) {
            const ok = await confirmDialog({
                title: 'Discard unsaved changes?',
                message: 'You have unsaved changes. Continue?',
                confirmLabel: 'Discard & New',
                danger: true,
            });
            if (!ok) return;
        }
        state.docs.push(blankDoc());
        state.currentIndex = state.docs.length - 1;
        persist();
        paintAll();
        showToast('New document', '＋');
    }

    async function navigateTo(i) {
        if (i < 0 || i >= state.docs.length || i === state.currentIndex) return;
        if (dirty) {
            const ok = await confirmDialog({
                title: 'Unsaved changes',
                message: 'Switch and discard unsaved edits?',
                confirmLabel: 'Discard & Switch',
                danger: true,
            });
            if (!ok) return;
        }
        state.currentIndex = i;
        persist();
        paintAll();
    }

    async function doReset() {
        const ok = await confirmDialog({
            title: 'Reset to seed data?',
            message: 'Wipe localStorage and reload from data.json.',
            confirmLabel: 'Reset',
            danger: true,
        });
        if (!ok) return;
        localStorage.removeItem(STORAGE_KEY);
        state = { docs: [], currentIndex: 0, masters: null };
        await seedFromJson();
        paintAll();
        showToast('Reset complete', '↺');
    }

    function renderSearch(query) {
        const dd = $('#searchDropdown');
        const q = (query || '').trim().toLowerCase();
        if (!q) { dd.classList.add('hidden'); dd.innerHTML = ''; return; }
        const matches = state.docs
            .map((d, i) => ({ d, i }))
            .filter(({ d }) => (d.DocNo || '').toLowerCase().includes(q));
        if (matches.length === 0) {
            dd.innerHTML = `<div class="px-3 py-2 text-sm text-slate-400">No matches</div>`;
        } else {
            dd.innerHTML = matches.map(({ d, i }) => `
                <button type="button" data-go="${i}" class="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-100 last:border-0">
                    <span class="font-mono text-sm font-semibold">${escapeHtml(d.DocNo)}</span>
                    <span class="status-pill status-${(d.DocStat||'open').toLowerCase()}" style="font-size:9px;padding:1px 6px">${escapeHtml(d.DocStat || '')}</span>
                </button>
            `).join('');
        }
        dd.classList.remove('hidden');
    }

    // ===== 12. Bind events =====
    function bindEvents() {
        document.addEventListener('input', (e) => {
            if (suppressDirty) return;
            const t = e.target;
            if (!(t instanceof HTMLElement)) return;
            const tr = t.closest('tr[data-idx]');
            if (tr && t.dataset.col) {
                captureDetailRow(tr);
                setDirty(true);
                return;
            }
            if (t.name) setDirty(true);
        });

        $('#addDetailBtn').addEventListener('click', () => {
            const q = current(); if (!q) return;
            q.details = q.details || [];
            q.details.push(blankDetailRow());
            paintDetail();
            setDirty(true);
        });

        $('#clearDetailBtn').addEventListener('click', async () => {
            const q = current();
            if (!q?.details?.length) return;
            const ok = await confirmDialog({
                title: 'Clear all rows?',
                message: `Remove all ${q.details.length} row(s)?`,
                confirmLabel: 'Clear All',
                danger: true,
            });
            if (!ok) return;
            q.details = [];
            paintDetail();
            setDirty(true);
        });

        $('#detailTbody').addEventListener('click', (e) => {
            if (e.target.classList.contains('row-del')) {
                const tr = e.target.closest('tr');
                const idx = +tr.dataset.idx;
                const q = current(); if (!q) return;
                q.details.splice(idx, 1);
                paintDetail();
                setDirty(true);
            }
        });

        ['saveBtn', 'saveBtn2'].forEach(id => $(`#${id}`).addEventListener('click', doSave));
        $('#deleteBtn').addEventListener('click', doDelete);
        $('#newBtn').addEventListener('click', doNew);
        $('#resetSeedBtn').addEventListener('click', doReset);

        $('#navFirst').addEventListener('click', () => navigateTo(0));
        $('#navPrev').addEventListener('click',  () => navigateTo(state.currentIndex - 1));
        $('#navNext').addEventListener('click',  () => navigateTo(state.currentIndex + 1));
        $('#navLast').addEventListener('click',  () => navigateTo(state.docs.length - 1));

        $('#searchInput').addEventListener('input', (e) => renderSearch(e.target.value));
        $('#searchInput').addEventListener('focus', (e) => renderSearch(e.target.value));
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#searchInput') && !e.target.closest('#searchDropdown')) {
                $('#searchDropdown').classList.add('hidden');
            }
        });
        $('#searchDropdown').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-go]');
            if (btn) {
                $('#searchInput').value = '';
                $('#searchDropdown').classList.add('hidden');
                navigateTo(+btn.dataset.go);
            }
        });

        $('#errOk').addEventListener('click', hideErrorModal);
        $('#errorModal').addEventListener('click', (e) => {
            if (e.target.id === 'errorModal') hideErrorModal();
        });

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); doSave(); }
            else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft')  { e.preventDefault(); navigateTo(state.currentIndex - 1); }
            else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') { e.preventDefault(); navigateTo(state.currentIndex + 1); }
        });

        window.addEventListener('beforeunload', (e) => {
            if (dirty) { e.preventDefault(); e.returnValue = ''; }
        });
    }

    // ===== Helpers =====
    function setDirty(v) {
        dirty = !!v;
        $('#dirtyFlag').classList.toggle('hidden', !dirty);
    }

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, ch =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function formatDate(s) {
        if (!s) return '';
        const d = new Date(s);
        if (isNaN(d)) return s;
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function fmtMoney(n) {
        return Number(n || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2, maximumFractionDigits: 2,
        });
    }
})();
