/* Inbound Master Reference — UI mockup with full CRUD + persistence
 *
 * State shape mirrors what an IM-aware controller would emit. JobClass='IM'.
 * Data persists to localStorage; first load seeds from data.json.
 */

(() => {
    const $  = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    const STORAGE_KEY = 'sfjob_im_v1';

    let state = { jobs: [], currentIndex: 0 };
    let dirty = false;
    let suppressDirty = false;

    boot();

    async function boot() {
        await loadInitial();
        bindEvents();
        paintAll();
    }

    async function loadInitial() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const s = JSON.parse(stored);
                if (s && Array.isArray(s.jobs) && s.jobs.length > 0) {
                    state = { jobs: s.jobs, currentIndex: Math.min(s.currentIndex || 0, s.jobs.length - 1) };
                    return;
                }
            } catch (_) { /* fall through */ }
        }
        await seedFromJson();
    }

    async function seedFromJson() {
        try {
            const res = await fetch('data.json', { cache: 'no-store' });
            if (!res.ok) throw new Error('data.json not reachable');
            const data = await res.json();
            state.jobs = Array.isArray(data.jobs) ? data.jobs : [];
            state.currentIndex = 0;
            persist();
        } catch (err) {
            console.warn('Could not load data.json — starting empty.', err);
            state = { jobs: [blankJob()], currentIndex: 0 };
            persist();
        }
    }

    function persist() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function currentJob() {
        return state.jobs[state.currentIndex] ?? null;
    }

    // ===== Blank record =====
    function blankJob() {
        const now = new Date();
        return {
            JobNo: `SI${String(now.getTime()).slice(-7)}`,
            JobDate: now.toISOString().slice(0, 10),
            JobStat: 'Open',
            JobType: 'SEA',
            JobClass: 'IM',
            Checked: false,
            lock: now.getTime(),

            LoadPort: '', LoadPortName: '',
            FinalPort: '', FinalPortName: '',
            TranPort: '', TranPortName: '',
            Oncarriage: false,
            Shed: '', Terminal: '',

            LinerNo: '', LinerName: '',
            CoLoad: '', CoLoadName: '',
            Feeder: '', FeederVoy: '',
            Vessel: '', VesselVoy: '',

            Etd: null, Eta: null, OblDate: null,

            Agent: '', AgentName: '', AgentAddress: '',
            Shipper: '', ShipperName: '', ShipperAddress: '',
            Importer: '', ImporterName: '', ImporterAddress: '',
            Notify: '', NotifyName: '', NotifyAddress: '',

            SoldBy: '', SaleNo: '', SaleName: '',
            HandleBy: '', HandleByName: '',
            JobGroup: '', OPTDept: '',

            ChgTerm: 'CC', LoadType: 'FCL', CyTerm: 'CY/CY', BlType: 'ORIGINAL',
            BookNo: '', OceanBl: '', FwdBlNo: '',

            JobCurr: 'THB', JobRate: 1.0,
            ToName: '', Attn: '', FromName: '', CtcName: '',
            Remark: '', Commodity: '',

            containers: [],

            EditBy: 'MANEERAT_CS',
            EditDate: now.toISOString().slice(0, 19).replace('T', ' '),
            AppBy: null, AppDate: null,

            _isNew: true,
        };
    }

    function blankContainer() {
        return {
            DETID: 'ctn-' + Math.random().toString(36).slice(2, 10),
            Bl: '', CtnNo: '', SealNo: '',
            CtnSize: "40'HC", CtnType: 'HC',
            Gw: 0, Cbm: 0, PkgQty: 0,
            PkgUnit: '', CtnSizeIso: '',
        };
    }

    // ===== Render =====
    function paintAll() {
        paintHeaderForm();
        paintBanner();
        paintContainers();
        paintNav();
        setDirty(false);
    }

    function paintHeaderForm() {
        const job = currentJob();
        suppressDirty = true;
        try {
            $$('[name]').forEach(el => {
                const key = el.name;
                if (!job || !(key in job)) {
                    if (el.type === 'checkbox') el.checked = false;
                    else el.value = '';
                    return;
                }
                const v = job[key];
                if (el.type === 'checkbox') {
                    el.checked = !!v;
                } else if (el.type === 'date') {
                    el.value = v ? String(v).slice(0, 10) : '';
                } else if (el.type === 'number') {
                    el.value = (v === null || v === undefined) ? '' : v;
                } else {
                    el.value = (v === null || v === undefined) ? '' : v;
                }
            });
        } finally {
            suppressDirty = false;
        }
    }

    function paintBanner() {
        const job = currentJob();
        $('#bannerJobNo').textContent       = job?.JobNo || '—';
        $('#bannerRefDate').textContent     = formatDate(job?.JobDate) || '—';
        $('#bannerJobType').textContent     = job?.JobType || '—';
        $('#bannerJobTypeIcon').textContent = jobTypeIcon(job?.JobType);
        $('#bannerPeriod').textContent      = derivePeriod(job);
        $('#bannerUserGroup').textContent   = `${job?.EditBy ?? '—'} · ${job?.JobGroup || 'CSM'}`;
        $('#lastModified').innerHTML        = job?.EditBy
            ? `Modified by <strong class="text-slate-700">${escapeHtml(job.EditBy)}</strong> · ${escapeHtml(job.EditDate || '')}`
            : '—';
        $('#footerEditInfo').textContent    = job?.EditBy
            ? `${job.EditBy} · ${job.EditDate || ''}`
            : '—';
        applyStatusPill(job?.JobStat);
    }

    function paintContainers() {
        const job = currentJob();
        const tbody = $('#containerTbody');
        tbody.innerHTML = '';
        const rows = job?.containers ?? [];
        rows.forEach((c, i) => tbody.appendChild(containerRowEl(c, i)));
        if (rows.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="12" class="text-center text-slate-400 py-4 text-sm">No containers — click "+ Add Row" to start.</td>`;
            tbody.appendChild(tr);
        }
        recalcContainerTotals();
    }

    function paintNav() {
        const total = state.jobs.length;
        const idx = state.currentIndex;
        $('#navCounter').textContent = total ? `${idx + 1} / ${total}` : '0 / 0';
        $('#navFirst').disabled = idx <= 0;
        $('#navPrev').disabled  = idx <= 0;
        $('#navNext').disabled  = idx >= total - 1;
        $('#navLast').disabled  = idx >= total - 1;
    }

    function applyStatusPill(stat) {
        const map = {
            'Open':     { cls: 'status-open',     label: '● Open' },
            'Approved': { cls: 'status-approved', label: '● Approved' },
            'Close':    { cls: 'status-close',    label: '● Close' },
            'Complete': { cls: 'status-complete', label: '● Complete' },
            'Deleted':  { cls: 'status-deleted',  label: '● Deleted' },
        };
        const m = map[stat] || map['Open'];
        const pill = $('#statusPill');
        pill.className = `status-pill ${m.cls}`;
        pill.textContent = m.label;
    }

    function jobTypeIcon(type) {
        switch ((type || '').toUpperCase()) {
            case 'SEA':   return '⛴';
            case 'TRUCK': return '🚚';
            case 'AIR':   return '✈';
            default:      return '📦';
        }
    }

    /** IM derives Period (FISYEAR/FISPERD) from ETA, not ETD. */
    function derivePeriod(job) {
        if (!job) return '—';
        const ref = job.JobClass === 'EX' ? job.Etd : job.Eta;
        if (!ref) return '—';
        const d = new Date(ref);
        if (isNaN(d)) return '—';
        return `${d.getFullYear()} / ${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    function formatDate(s) {
        if (!s) return '';
        const d = new Date(s);
        if (isNaN(d)) return s;
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, ch =>
            ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
    }

    // ===== Container row =====
    function containerRowEl(row, idx) {
        const tr = document.createElement('tr');
        tr.dataset.detid = row.DETID;
        tr.dataset.idx = String(idx);
        tr.innerHTML = `
            <td class="px-3 py-2 text-slate-400">${idx + 1}</td>
            <td class="px-3 py-2"><input class="cell-input" data-col="Bl" value="${escapeHtml(row.Bl ?? '')}"></td>
            <td class="px-3 py-2"><input class="cell-input font-mono" data-col="CtnNo" value="${escapeHtml(row.CtnNo ?? '')}"></td>
            <td class="px-3 py-2"><input class="cell-input" data-col="SealNo" value="${escapeHtml(row.SealNo ?? '')}"></td>
            <td class="px-3 py-2">
                <select class="cell-input" data-col="CtnSize">
                    ${["20'","40'","40'HC","45'"].map(s => `<option ${s === row.CtnSize ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </td>
            <td class="px-3 py-2">
                <select class="cell-input" data-col="CtnType">
                    ${["GP","HC","RF","OT","FR"].map(t => `<option ${t === row.CtnType ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
            </td>
            <td class="px-3 py-2"><input type="number" step="0.01" class="cell-input text-right tabular-nums" data-col="Gw" value="${row.Gw ?? 0}"></td>
            <td class="px-3 py-2"><input type="number" step="0.01" class="cell-input text-right tabular-nums" data-col="Cbm" value="${row.Cbm ?? 0}"></td>
            <td class="px-3 py-2"><input type="number" step="1" class="cell-input text-right tabular-nums" data-col="PkgQty" value="${row.PkgQty ?? 0}"></td>
            <td class="px-3 py-2"><input class="cell-input" data-col="PkgUnit" value="${escapeHtml(row.PkgUnit ?? '')}"></td>
            <td class="px-3 py-2"><input class="cell-input" data-col="CtnSizeIso" value="${escapeHtml(row.CtnSizeIso ?? '')}"></td>
            <td class="px-3 py-2 text-center"><button type="button" class="row-del" title="Delete row">✕</button></td>
        `;
        return tr;
    }

    function recalcContainerTotals() {
        const job = currentJob();
        let gw = 0, cbm = 0, pkg = 0;
        const sizes = { "20'": 0, "40'": 0, "40'HC": 0, "45'": 0 };
        (job?.containers ?? []).forEach(c => {
            gw  += +c.Gw  || 0;
            cbm += +c.Cbm || 0;
            pkg += +c.PkgQty || 0;
            if (sizes[c.CtnSize] !== undefined) sizes[c.CtnSize]++;
        });
        $('#totalGW').textContent  = gw.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        $('#totalCBM').textContent = cbm.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        $('#totalPkg').textContent = pkg.toLocaleString();
        $('#ctn20').textContent    = sizes["20'"];
        $('#ctn40').textContent    = sizes["40'"];
        $('#ctn40hc').textContent  = sizes["40'HC"];
        $('#ctn45').textContent    = sizes["45'"];
    }

    // ===== Capture form → state =====
    function captureForm() {
        const job = currentJob();
        if (!job) return;
        $$('[name]').forEach(el => {
            const key = el.name;
            let v;
            if (el.type === 'checkbox') v = el.checked;
            else if (el.type === 'number') v = el.value === '' ? null : Number(el.value);
            else if (el.type === 'date') v = el.value || null;
            else v = el.value === '' ? '' : el.value;
            job[key] = v;
        });
    }

    function captureContainerRow(tr) {
        const job = currentJob();
        if (!job) return;
        const idx = +tr.dataset.idx;
        const row = job.containers[idx];
        if (!row) return;
        $$('[data-col]', tr).forEach(el => {
            const col = el.dataset.col;
            if (el.type === 'number') row[col] = el.value === '' ? 0 : Number(el.value);
            else row[col] = el.value;
        });
    }

    // ===== Dirty tracking =====
    function setDirty(v) {
        dirty = !!v;
        $('#dirtyFlag').classList.toggle('hidden', !dirty);
    }

    // ===== Toast =====
    function showToast(msg, icon = '✓', kind = 'success') {
        $('#toastMsg').textContent = msg;
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

    // ===== Confirm dialog =====
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

    // ===== Actions =====
    function doSave() {
        if (!currentJob()) return;
        captureForm();
        $$('#containerTbody tr[data-idx]').forEach(captureContainerRow);

        const job = currentJob();
        job.lock = Date.now();
        job.EditBy = job.EditBy || 'MANEERAT_CS';
        job.EditDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
        delete job._isNew;
        persist();
        setDirty(false);
        paintBanner();
        showToast(`Saved ${job.JobNo}`, '💾');
    }

    async function doDelete() {
        const job = currentJob();
        if (!job) return;
        const ok = await confirmDialog({
            title: `Delete job ${job.JobNo}?`,
            message: `JOBSTAT will be set to 'Deleted' (soft delete). The record stays for audit.`,
            confirmLabel: 'Delete',
            danger: true,
        });
        if (!ok) return;
        if (job._isNew) {
            state.jobs.splice(state.currentIndex, 1);
            state.currentIndex = Math.max(0, state.currentIndex - 1);
            if (state.jobs.length === 0) state.jobs.push(blankJob());
            persist();
            paintAll();
            showToast('New (unsaved) job discarded', '🗑');
            return;
        }
        job.JobStat = 'Deleted';
        job.lock = Date.now();
        job.EditDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
        persist();
        paintAll();
        showToast(`Job ${job.JobNo} deleted`, '🗑', 'error');
    }

    async function doCloseJob() {
        const job = currentJob();
        if (!job) return;
        const ok = await confirmDialog({
            title: `Close job ${job.JobNo}?`,
            message: `JOBSTAT will be set to 'Close'.`,
            confirmLabel: 'Close Job',
        });
        if (!ok) return;
        job.JobStat = 'Close';
        job.lock = Date.now();
        job.EditDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
        persist();
        paintAll();
        showToast(`Job ${job.JobNo} closed`, '🔒');
    }

    async function doNewJob() {
        if (dirty) {
            const ok = await confirmDialog({
                title: 'Discard unsaved changes?',
                message: 'You have unsaved changes. Continue and create a new IM job?',
                confirmLabel: 'Discard & New',
                danger: true,
            });
            if (!ok) return;
        }
        state.jobs.push(blankJob());
        state.currentIndex = state.jobs.length - 1;
        persist();
        paintAll();
        showToast('New IM job — fill in details and Save', '＋');
    }

    async function navigateTo(targetIndex) {
        if (targetIndex < 0 || targetIndex >= state.jobs.length) return;
        if (targetIndex === state.currentIndex) return;
        if (dirty) {
            const ok = await confirmDialog({
                title: 'Unsaved changes',
                message: 'Switch to another job and discard unsaved edits?',
                confirmLabel: 'Discard & Switch',
                danger: true,
            });
            if (!ok) return;
        }
        state.currentIndex = targetIndex;
        persist();
        paintAll();
    }

    async function doReset() {
        const ok = await confirmDialog({
            title: 'Reset to seed data?',
            message: 'Wipe localStorage and reload original sample IM jobs from data.json.',
            confirmLabel: 'Reset',
            danger: true,
        });
        if (!ok) return;
        localStorage.removeItem(STORAGE_KEY);
        state = { jobs: [], currentIndex: 0 };
        await seedFromJson();
        paintAll();
        showToast('Reset complete', '↺');
    }

    // ===== Search dropdown =====
    function renderSearchDropdown(query) {
        const dd = $('#searchDropdown');
        const q = (query || '').trim().toLowerCase();
        if (!q) { dd.classList.add('hidden'); dd.innerHTML = ''; return; }
        const matches = state.jobs
            .map((j, i) => ({ j, i }))
            .filter(({ j }) =>
                (j.JobNo || '').toLowerCase().includes(q) ||
                (j.OceanBl || '').toLowerCase().includes(q) ||
                (j.BookNo || '').toLowerCase().includes(q) ||
                (j.ShipperName || '').toLowerCase().includes(q) ||
                (j.ImporterName || '').toLowerCase().includes(q) ||
                (j.AgentName || '').toLowerCase().includes(q) ||
                (j.containers || []).some(c => (c.CtnNo || '').toLowerCase().includes(q))
            );
        if (matches.length === 0) {
            dd.innerHTML = `<div class="px-3 py-2 text-sm text-slate-400">No matches</div>`;
        } else {
            dd.innerHTML = matches.map(({ j, i }) => `
                <button type="button" data-go="${i}" class="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-100 last:border-0">
                    <span class="font-mono text-sm font-semibold text-emerald-700">${escapeHtml(j.JobNo)}</span>
                    <span class="status-pill status-${(j.JobStat||'open').toLowerCase()}" style="font-size:9px;padding:1px 6px">${escapeHtml(j.JobStat||'')}</span>
                    <span class="text-xs text-slate-500 ml-auto truncate">${escapeHtml(j.LoadPortName || j.LoadPort || '')} → ${escapeHtml(j.FinalPortName || j.FinalPort || '')}</span>
                </button>
            `).join('');
        }
        dd.classList.remove('hidden');
    }

    // ===== Bind events =====
    function bindEvents() {
        // Track dirty
        document.addEventListener('input', (e) => {
            if (suppressDirty) return;
            const t = e.target;
            if (!(t instanceof HTMLElement)) return;
            const tr = t.closest('tr[data-idx]');
            if (tr && t.dataset.col) {
                captureContainerRow(tr);
                recalcContainerTotals();
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
                captureContainerRow(tr);
                recalcContainerTotals();
                setDirty(true);
            }
        });

        // Tabs
        $$('.tab').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.tab').forEach(b => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                if (btn.dataset.tab !== 'general') {
                    showToast(`Tab "${btn.textContent.trim().replace(/^\d+/, '').trim()}" — not implemented in mockup`, 'ℹ', 'warn');
                }
            });
        });

        // Containers
        $('#addContainerBtn').addEventListener('click', () => {
            const job = currentJob();
            if (!job) return;
            job.containers = job.containers || [];
            job.containers.push(blankContainer());
            paintContainers();
            setDirty(true);
            showToast('Container row added');
        });

        $('#clearContainersBtn').addEventListener('click', async () => {
            const job = currentJob();
            if (!job?.containers?.length) return;
            const ok = await confirmDialog({
                title: 'Clear all containers?',
                message: `Remove all ${job.containers.length} container row(s) from this job?`,
                confirmLabel: 'Clear All',
                danger: true,
            });
            if (!ok) return;
            job.containers = [];
            paintContainers();
            setDirty(true);
            showToast('All containers removed', '🗑');
        });

        $('#calcVolumeBtn').addEventListener('click', () => {
            recalcContainerTotals();
            showToast('Volume recalculated', '∑');
        });

        $('#containerTbody').addEventListener('click', (e) => {
            if (e.target.classList.contains('row-del')) {
                const tr = e.target.closest('tr');
                const idx = +tr.dataset.idx;
                const job = currentJob();
                if (!job) return;
                job.containers.splice(idx, 1);
                paintContainers();
                setDirty(true);
            }
        });

        // Lookup → toast
        $$('.lookup-btn').forEach(b => {
            b.addEventListener('click', () => {
                const code = b.previousElementSibling?.value || '—';
                const name = b.nextElementSibling?.value || '(no result)';
                showToast(`Lookup: ${code} → ${name}`, '⌕', 'warn');
            });
        });

        // Buttons
        ['saveBtn', 'saveBtn2'].forEach(id => $(`#${id}`).addEventListener('click', doSave));
        $('#deleteBtn').addEventListener('click', doDelete);
        $('#closeJobBtn').addEventListener('click', doCloseJob);
        $('#newJobBtn').addEventListener('click', doNewJob);
        $('#resetSeedBtn').addEventListener('click', doReset);

        // Navigation
        $('#navFirst').addEventListener('click', () => navigateTo(0));
        $('#navPrev').addEventListener('click',  () => navigateTo(state.currentIndex - 1));
        $('#navNext').addEventListener('click',  () => navigateTo(state.currentIndex + 1));
        $('#navLast').addEventListener('click',  () => navigateTo(state.jobs.length - 1));

        // Search
        $('#searchInput').addEventListener('input', (e) => renderSearchDropdown(e.target.value));
        $('#searchInput').addEventListener('focus', (e) => renderSearchDropdown(e.target.value));
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

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault(); doSave();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') {
                e.preventDefault(); navigateTo(state.currentIndex - 1);
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') {
                e.preventDefault(); navigateTo(state.currentIndex + 1);
            }
        });

        window.addEventListener('beforeunload', (e) => {
            if (dirty) { e.preventDefault(); e.returnValue = ''; }
        });
    }
})();
