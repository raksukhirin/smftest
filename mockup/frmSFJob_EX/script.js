/* Outbound Master Job — UI mockup with full CRUD + persistence
 *
 * State shape mirrors `OutboundJobController::toUiShape()` 1:1
 * (PascalCase keys). On boot the app loads from localStorage; if empty,
 * it seeds from data.json. All edits persist to localStorage on Save.
 */

(() => {
    const $  = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    const STORAGE_KEY = 'outbound_jobs_v8';

    // ===== State =====
    let state = { jobs: [], currentIndex: 0 };
    let dirty = false;
    let suppressDirty = false;   // set true when programmatically populating fields

    // ===== Boot =====
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
            } catch (_) { /* fall through to seed */ }
        }
        await seedFromJson();
    }

    async function seedFromJson() {
        try {
            // Prefer inline seed (window.SFJOBEX_SEED from data.js — works via file://),
            // then fall back to fetch('data.json') when served over http.
            let data;
            if (window.SFJOBEX_SEED && Array.isArray(window.SFJOBEX_SEED.jobs)) {
                data = window.SFJOBEX_SEED;
            } else {
                const res = await fetch('data.json', { cache: 'no-store' });
                if (!res.ok) throw new Error('data.json not reachable');
                data = await res.json();
            }
            state.jobs = Array.isArray(data.jobs) ? structuredClone(data.jobs) : [];
            state.currentIndex = 0;
            persist();
        } catch (err) {
            console.warn('Could not load seed — starting empty.', err);
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
            JobNo: `NEW${String(now.getTime()).slice(-7)}`,
            JobDate: now.toISOString().slice(0, 10),
            JobStat: 'Open',
            JobType: 'TRUCK',
            JobClass: 'EX',
            Checked: false,
            lock: now.getTime(),
            RecPort: '', RecPortName: '',
            LoadPort: '', LoadPortName: '',
            DisPort: '', DisPortName: '',
            DelPort: '', DelPortName: '',
            FinalPort: '', FinalPortName: '',
            TranPort: null, TranPortName: null,
            Oncarriage: false,
            LinerNo: '', LinerName: '',
            CoLoad: '', CoLoadName: '',
            Feeder: '', FeederVoy: '',
            Vessel: '', VesselVoy: '',
            Etd: null, Eta: null, MasterDate: null, ClosingDate: null,
            CyDate: null, CyPlace: '',
            CfsDate: null, CfsPlace: '',
            ReturnDate: null, ReturnPlace: '',
            Shipper: '', ShipperName: '', ShipperAddress: '',
            Agent: '', AgentName: '', AgentAddress: '',
            Notify: '', NotifyName: '', NotifyAddress: '',
            Consignee: '', ConsigneeName: '', ConsigneeAddress: '',
            Exporter: '', ExporterName: '',
            SoldBy: '', SaleNo: '', SaleName: '',
            HandleBy: '', HandleByName: '',
            JobGroup: '', OPTDept: '',
            ChgTerm: 'CC', LoadType: 'FCL', CyTerm: 'CY/CY', BlType: 'ORIGINAL',
            BookNo: '', MasterNo: '', FwdBlNo: '',
            JobCurr: 'USD', JobRate: 33.0,
            Attn: '', FromName: '', CtcName: '',
            Remark: '', Commodity: '',
            containers: [],
            EditBy: 'ADMIN', EditDate: now.toISOString().slice(0, 19).replace('T', ' '),
            AppBy: null, AppDate: null,
            _isNew: true,
        };
    }

    function blankContainer() {
        return {
            DETID: 'ctn-' + Math.random().toString(36).slice(2, 10),
            Bl: '', CtnNo: '', SealNo: '',
            CtnSize: "20'", CtnType: 'GP',
            Gw: 0, Cbm: 0, PkgQty: 0,
            PkgUnit: '', CtnSizeIso: '',
        };
    }

    // ===== Render =====
    function paintAll() {
        paintHeaderForm();
        paintBanner();
        paintContainers();
        paintBooking();
        paintRevenue();
        paintOption();
        paintBilling();
        paintNav();
        setDirty(false);
    }

    // ===== Page 4 — Option & Summary =====
    // Profit Summary is COMPUTED from the selling/costing charge lines, mirroring
    // frmSFJob.frm CalProfit (Agent View): group by PCType into COLLECT(CC)/PREPAID(PP),
    // ExpCode HAN→Handling, INC→Incentive, PRO→Profit Shared, else Revenue/Cost.
    // For EX jobs COLLECT column = CC, PREPAID column = PP (no swap).
    function paintOption() {
        const job = currentJob();
        const jn = $('#opJobNo'); if (jn) jn.textContent = job?.JobNo || '—';
        const cu = $('#opCurr');  if (cu) cu.textContent = job?.JobCurr || '—';

        // Total CTN box (read-only, like cTxt(TOTCTN))
        const totCtn = (+job?.Ctn20 || 0) + (+job?.Ctn40 || 0) + (+job?.Ctn40HC || 0) + (+job?.Ctn45 || 0);
        const tc = $('#opTotCtn'); if (tc) tc.value = totCtn;

        const p = computeProfit(job);
        const set = (id, v) => { const el = $(id); if (el) el.textContent = fmtMoney(v); };
        set('#opRevCC', p.revCC);   set('#opRevPP', p.revPP);
        set('#opCostCC', p.costCC); set('#opCostPP', p.costPP);
        set('#opGross', p.gross);
        set('#opHandCC', p.handCC); set('#opHandPP', p.handPP);
        set('#opIncenCC', p.incenCC); set('#opIncenPP', p.incenPP);
        set('#opMargin', p.margin);
        set('#opProfit', p.profitShared);
        // negative margin/gross in red
        ['#opGross', '#opMargin'].forEach(id => {
            const el = $(id); if (!el) return;
            const val = id === '#opGross' ? p.gross : p.margin;
            el.classList.toggle('bv-neg', val < 0);
        });
    }

    function computeProfit(job) {
        const isEX = (job?.JobClass || 'EX') === 'EX';
        const sell = job?.selling ?? [];
        const cost = job?.costing ?? [];
        const acc = { revCC: 0, revPP: 0, costCC: 0, costPP: 0,
                      handCC: 0, handPP: 0, incenCC: 0, incenPP: 0, profitShared: 0 };
        const amt = (r) => Number(r.ThbGross) || 0;            // Agent-view P/L amount (THB)
        const isCC = (r) => (r.PC || '').toUpperCase() === 'CC';
        const bucket = (r, kind) => {
            const sfx = isCC(r) ? 'CC' : 'PP';
            switch ((r.Code || '').toUpperCase()) {
                case 'HAN': acc['hand' + sfx]  += amt(r); break;
                case 'INC': acc['incen' + sfx] += amt(r); break;
                case 'PRO': acc.profitShared   += amt(r); break;
                default:    acc[kind + sfx]    += amt(r);
            }
        };
        sell.forEach(r => bucket(r, 'rev'));
        cost.forEach(r => bucket(r, 'cost'));

        const gross  = (acc.revCC + acc.revPP) - (acc.costCC + acc.costPP);
        const margin = gross - (acc.handCC + acc.handPP) - (acc.incenCC + acc.incenPP);
        // For EX, display columns map directly; for IM they swap (mirrors VB6 IIf(EX,...)).
        return isEX
            ? { ...acc, gross, margin }
            : { revCC: acc.revPP, revPP: acc.revCC, costCC: acc.costPP, costPP: acc.costCC,
                handCC: acc.handPP, handPP: acc.handCC, incenCC: acc.incenPP, incenPP: acc.incenCC,
                profitShared: acc.profitShared, gross, margin };
    }

    // "Re-Summary Vol. from HB/L" — recompute Job Summary from container rows
    // (mirrors cmdSum: GW/NW/CBM/PKGQTY/REVTON/CTN counts re-derived).
    function reSummarize() {
        const job = currentJob();
        if (!job) return;
        const cs = job.containers ?? [];
        let gw = 0, cbm = 0, pkg = 0;
        const cnt = { Ctn20: 0, Ctn40: 0, Ctn40HC: 0, Ctn45: 0 };
        const sizeKey = { "20'": 'Ctn20', "40'": 'Ctn40', "40'HC": 'Ctn40HC', "45'": 'Ctn45' };
        cs.forEach(c => {
            gw  += +c.Gw  || 0;
            cbm += +c.Cbm || 0;
            pkg += +c.PkgQty || 0;
            const k = sizeKey[c.CtnSize];
            if (k) cnt[k]++;
        });
        job.Gw = +gw.toFixed(5);
        job.Nw = gw ? +(gw * 0.9).toFixed(5) : 0;
        job.Cbm = +cbm.toFixed(5);
        job.RevTon = (gw || cbm) ? Math.max(gw > cbm * 1000 ? +(gw / 1000).toFixed(3) : +cbm.toFixed(3), 1) : 0;
        job.PkgQty = pkg;
        job.PkgWord = pkg ? `(TOTAL : ${pkg} PACKAGES ONLY)` : '(TOTAL :  PACKAGES ONLY)';
        Object.assign(job, cnt);
        paintHeaderForm();
        paintOption();
        setDirty(true);
        showToast('Job summary re-calculated from HB/L', '∑');
    }

    // ===== Page 3 — Revenue (SELLING) & Cost (COSTING) listings =====
    function paintRevenue() {
        const job = currentJob();
        const sell = job?.selling ?? [];
        const cost = job?.costing ?? [];
        const sellTot = renderRcRows($('#sellingTbody'), sell, $('#sellThbTotal'), $('#sellGrandTotal'));
        const costTot = renderRcRows($('#costingTbody'), cost, $('#costThbTotal'), $('#costGrandTotal'));
        const st = $('#rcSellTotal'); if (st) st.textContent = fmtMoney(sellTot.total);
        const ct = $('#rcCostTotal'); if (ct) ct.textContent = fmtMoney(costTot.total);
        const pf = $('#rcProfit');
        if (pf) {
            const profit = sellTot.total - costTot.total;
            pf.textContent = fmtMoney(profit);
            pf.className = 'font-semibold ' + (profit < 0 ? 'text-rose-700' : 'text-indigo-700');
        }
    }

    function renderRcRows(tbody, rows, thbCell, totalCell) {
        let thbSum = 0, totSum = 0;
        if (tbody) {
            tbody.innerHTML = '';
            if (!rows.length) {
                tbody.innerHTML = `<tr><td colspan="18" class="bv-empty">— ไม่มีรายการ —</td></tr>`;
            } else {
                rows.forEach(r => {
                    thbSum += Number(r.ThbGross) || 0;
                    totSum += Number(r.Total) || 0;
                    tbody.appendChild(rcRowEl(r));
                });
            }
        }
        if (thbCell)   thbCell.textContent   = fmtMoney(thbSum);
        if (totalCell) totalCell.textContent = fmtMoney(totSum);
        return { thb: thbSum, total: totSum };
    }

    function rcRowEl(r) {
        const tr = document.createElement('tr');
        const tyCls = r.TY === 'REV' ? 'bv-ty-ai' : 'bv-ty-dn';
        const num = (v, dp = 2) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
        tr.innerHTML = `
            <td class="rc-code">${escapeHtml(r.Code || '')}</td>
            <td class="text-slate-600">${escapeHtml(r.Desc || '')}</td>
            <td><span class="rc-pc">${escapeHtml(r.PC || '')}</span></td>
            <td><span class="rc-dc">${escapeHtml(r.DC || '')}</span></td>
            <td><span class="bv-ty ${tyCls}">${escapeHtml(r.TY || '')}</span></td>
            <td class="text-slate-500">${escapeHtml(r.Curr || '')}</td>
            <td class="text-right">${num(r.ExRate, 6)}</td>
            <td class="text-slate-500">${escapeHtml(r.Unit || '')}</td>
            <td class="text-right">${escapeHtml(String(r.Qty ?? ''))}</td>
            <td class="text-right">${num(r.Price)}</td>
            <td class="text-right text-slate-500">${num(r.ThbGross)}</td>
            <td class="text-right">${escapeHtml(String(r.VatPct ?? 0))}</td>
            <td class="text-center"><input type="checkbox" class="w-3.5 h-3.5 accent-indigo-500" ${r.IO ? 'checked' : ''} disabled></td>
            <td class="text-right text-slate-500">${escapeHtml(String(r.WtPct ?? 0))}</td>
            <td class="text-right">${num(r.Gross)}</td>
            <td class="text-right text-slate-500">${num(r.Vat)}</td>
            <td class="text-right font-semibold">${num(r.Total)}</td>
            <td class="font-mono text-xs text-indigo-600">${escapeHtml(r.DocNo || '—')}</td>
        `;
        return tr;
    }

    // ===== Page 2 — Sale Booking & House B/L listings =====
    function paintBooking() {
        const job = currentJob();
        const bookings = job?.booking ?? [];
        const hbls     = job?.hbl ?? [];
        const jn = $('#bkJobNo');     if (jn) jn.textContent = job?.JobNo || '—';
        const bc = $('#bkBookCount'); if (bc) bc.textContent = bookings.length;
        const hc = $('#bkHblCount');  if (hc) hc.textContent = hbls.length;
        renderBookingRows($('#bookingTbody'), bookings);
        renderHblRows($('#hblTbody'), hbls);
    }

    function renderBookingRows(tbody, rows) {
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="bv-empty">— ไม่มีรายการ Booking สำหรับ job นี้ —</td></tr>`;
            return;
        }
        rows.forEach(r => {
            const tr = document.createElement('tr');
            const statCls = { Open: 'bv-ac-ready', Confirmed: 'bv-ac-posted', Cancel: 'bv-ac-cancel' }[r.Status] || 'bv-ac-ready';
            tr.innerHTML = `
                <td class="text-center text-slate-300">✕</td>
                <td class="font-mono text-xs font-semibold text-indigo-700">${escapeHtml(r.BookRef || '')}</td>
                <td class="tabular-nums">${escapeHtml(formatDate(r.EtdDate) || '—')}</td>
                <td><span class="bv-acstat ${statCls}">${escapeHtml(r.Status || '')}</span></td>
                <td class="font-mono text-xs">${escapeHtml(r.BookingNo || '—')}</td>
                <td class="text-slate-500">${escapeHtml(r.OrderNo || '—')}</td>
                <td class="text-slate-600">${escapeHtml(r.SalePerson || '—')}</td>
                <td class="text-slate-600 truncate">${escapeHtml(r.Shipper || '—')}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderHblRows(tbody, rows) {
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="11" class="bv-empty">— ไม่มี House B/L สำหรับ job นี้ —</td></tr>`;
            return;
        }
        rows.forEach((r, i) => {
            const tr = document.createElement('tr');
            const statCls = { Open: 'bv-ac-ready', Complete: 'bv-ac-posted', Close: 'bv-ac-posted', Cancel: 'bv-ac-cancel' }[r.Status] || 'bv-ac-ready';
            const docCls = r.DocType === 'Allocated' ? 'bv-ty-ai' : 'bv-ty-dn';
            const yn = (v) => `<span class="${v === 'Yes' ? 'text-emerald-600 font-semibold' : 'text-slate-400'}">${escapeHtml(v || 'No')}</span>`;
            tr.innerHTML = `
                <td class="text-center text-slate-300">✕</td>
                <td class="text-slate-400 tabular-nums">${r.No ?? i + 1}</td>
                <td class="font-mono text-xs font-semibold text-indigo-700">${escapeHtml(r.BlRef || '')}</td>
                <td class="font-mono text-xs text-slate-500">${escapeHtml(r.BookingRef || '')}</td>
                <td><span class="bv-acstat ${statCls}">${escapeHtml(r.Status || '')}</span></td>
                <td>${yn(r.Active)}</td>
                <td>${yn(r.Paid)}</td>
                <td><span class="bv-ty ${docCls}">${escapeHtml(r.DocType || '')}</span></td>
                <td class="text-slate-500">${escapeHtml(r.Term || '')}</td>
                <td class="font-mono text-xs">${escapeHtml(r.BlNo || '—')}</td>
                <td class="text-slate-600">${escapeHtml(r.SalePerson || '—')}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // ===== Page 5 — Billing (A/R) & Voucher (A/P) listings =====
    const ARINVOICE_URL = '../frmARInvoice/index.html';
    function paintBilling() {
        const job = currentJob();
        const bill = job?.billing ?? [];
        const vou  = job?.voucher ?? [];
        const jn = $('#bvJobNo'); if (jn) jn.textContent = job?.JobNo || '—';
        const bc = $('#bvBillCount'); if (bc) bc.textContent = bill.length;
        const vc = $('#bvVouCount'); if (vc) vc.textContent = vou.length;
        renderBVRows($('#billingTbody'), bill, true);
        renderBVRows($('#voucherTbody'), vou, false);
    }

    function renderBVRows(tbody, rows, isBilling) {
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="11" class="bv-empty">— ไม่มีรายการ${isBilling ? ' A/R' : ' A/P'} สำหรับ job นี้ —</td></tr>`;
            return;
        }
        rows.forEach(r => tbody.appendChild(bvRowEl(r, isBilling)));
    }

    function bvRowEl(r, isBilling) {
        const tr = document.createElement('tr');
        const tyCls = { CN: 'bv-ty-cn', DN: 'bv-ty-dn', AI: 'bv-ty-ai' }[r.TY] || '';
        const acCls = { 'Ready to Post': 'bv-ac-ready', 'Posted': 'bv-ac-posted', 'Cancel': 'bv-ac-cancel' }[r.AcStat] || 'bv-ac-ready';
        const tot = Number(r.SrcTot) || 0;
        const totCls = tot < 0 ? 'bv-amt bv-neg' : 'bv-amt';
        // Both A/R invoice and A/P voucher numbers are clickable → open frmARInvoice deep-link
        // (the form is instantiated for A/R or A/P, switched by SrcType).
        const tip = r.linked ? (isBilling ? 'เปิดใน A/R (Outbound)' : 'เปิดใน A/P (Inbound)') : 'ไม่อยู่ในชุดข้อมูล mockup';
        const invCell = `<a class="bv-invno bv-link" data-inv="${escapeHtml(r.InvNo)}" data-linked="${r.linked ? '1' : '0'}" title="${tip}">${escapeHtml(r.InvNo)}</a>`;
        tr.innerHTML = `
            <td><span class="bv-ty ${tyCls}">${escapeHtml(r.TY)}</span></td>
            <td>${invCell}</td>
            <td class="text-slate-400">${escapeHtml((isBilling ? r.RecNo : r.RecNo) || '—')}</td>
            <td class="font-mono text-xs">${escapeHtml(r.Party || '')}</td>
            <td class="text-slate-600">${escapeHtml(r.PartyName || '')}</td>
            <td class="tabular-nums">${escapeHtml(formatDate(r.InvDate) || '')}</td>
            <td class="tabular-nums text-slate-500">${escapeHtml(r.DocPerd || '')}</td>
            <td>${escapeHtml(r.DocStat || '')}</td>
            <td><span class="bv-acstat ${acCls}">${escapeHtml(r.AcStat || '')}</span></td>
            <td class="${totCls}">${fmtMoney(tot)}</td>
            <td class="text-slate-500">${escapeHtml(r.Curr || '')}</td>
        `;
        return tr;
    }

    function openInvoice(invNo, linked) {
        const url = `${ARINVOICE_URL}?inv=${encodeURIComponent(invNo)}`;
        if (!linked) {
            showToast(`${invNo} ไม่อยู่ในชุดข้อมูล mockup — เปิดหน้า Invoice ให้ดูได้`, 'ℹ', 'warn');
        }
        window.open(url, 'arInvoiceWin');
    }

    // View switcher: some tabs replace the whole form with a dedicated section.
    //   'booking' (Pg.2) → only the Booking & House B/L tables
    //   'billing' (Pg.5) → only the Billing & Voucher tables
    // Any other tab shows the form sections and hides those dedicated sections.
    const TAB_SECTIONS = {
        booking: 'bookingSection',
        revenue: 'revenueSection',
        option:  'optionSection',
        billing: 'billingSection',
    };
    function setView(tab) {
        // Keep name-bound fields shared across tabs (e.g. Commodity appears on both
        // General and Option) consistent: flush DOM→state, then repaint state→DOM.
        captureForm();
        paintHeaderForm();
        paintOption();

        const targetSection = TAB_SECTIONS[tab] || null;   // section to show alone, or null = show form
        const main = document.querySelector('main');
        [...main.children].forEach(el => {
            if (el.nodeType !== 1) return;
            const isDedicated = Object.values(TAB_SECTIONS).includes(el.id);
            if (isDedicated) {
                el.classList.toggle('hidden', el.id !== targetSection);
            } else {
                // form sections: visible only when no dedicated section is active
                el.classList.toggle('hidden', !!targetSection);
            }
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
        $('#bannerJobNo').textContent      = job?.JobNo || '—';
        $('#bannerRefDate').textContent    = formatDate(job?.JobDate) || '—';
        $('#bannerJobType').textContent    = job?.JobType || '—';
        $('#bannerJobTypeIcon').textContent = jobTypeIcon(job?.JobType);
        $('#bannerPeriod').textContent     = derivePeriod(job);
        $('#bannerUserGroup').textContent  = `${job?.EditBy ?? '—'} · ${job?.JobGroup || '—'}`;
        $('#lastModified').innerHTML       = job?.EditBy
            ? `Modified by <strong class="text-slate-700">${escapeHtml(job.EditBy)}</strong> · ${escapeHtml(job.EditDate || '')}`
            : '—';
        $('#footerEditInfo').textContent   = job?.EditBy
            ? `${job.EditBy} · ${job.EditDate || ''}`
            : '—';
        applyStatusPill(job?.JobStat);
        // Toggle JobNo readonly: existing jobs lock the PK; new jobs allow edit.
        const jobNoInput = document.querySelector('input[name="JobNo"]');
        // No JobNo input in current UI — JobNo only shown in banner. Skip.
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
            case 'TRUCK': return '🚚';
            case 'SHIP':  return '⛴';
            case 'SEA':   return '⛴';
            case 'AIR':   return '✈';
            default:      return '📦';
        }
    }

    function derivePeriod(job) {
        if (!job) return '—';
        const ref = job.JobClass === 'IM' ? job.Eta : job.Etd;
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

    function fmtMoney(n) {
        return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
            if (el.type === 'checkbox') {
                v = el.checked;
            } else if (el.type === 'number') {
                v = el.value === '' ? null : Number(el.value);
            } else if (el.type === 'date') {
                v = el.value || null;
            } else {
                v = el.value === '' ? '' : el.value;
            }
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
            if (el.type === 'number') {
                row[col] = el.value === '' ? 0 : Number(el.value);
            } else {
                row[col] = el.value;
            }
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
        // capture all container rows to be safe
        $$('#containerTbody tr[data-idx]').forEach(captureContainerRow);

        const job = currentJob();
        job.lock = Date.now();
        job.EditBy = job.EditBy || 'ADMIN';
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
            message: `JOBSTAT will be set to 'Deleted' (soft delete). The record stays in DB for audit.`,
            confirmLabel: 'Delete',
            danger: true,
        });
        if (!ok) return;
        if (job._isNew) {
            // never saved — drop entirely
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
            message: `JOBSTAT will be set to 'Close'. SFHBL allocated row will cascade.`,
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
                message: 'You have unsaved changes on the current job. Continue and create a new job?',
                confirmLabel: 'Discard & New',
                danger: true,
            });
            if (!ok) return;
        }
        state.jobs.push(blankJob());
        state.currentIndex = state.jobs.length - 1;
        persist();
        paintAll();
        showToast('New job — fill in details and Save', '＋');
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
            message: 'Wipe localStorage and reload the original sample jobs from data.json.',
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
        if (!q) {
            dd.classList.add('hidden');
            dd.innerHTML = '';
            return;
        }
        const matches = state.jobs
            .map((j, i) => ({ j, i }))
            .filter(({ j }) =>
                (j.JobNo || '').toLowerCase().includes(q) ||
                (j.MasterNo || '').toLowerCase().includes(q) ||
                (j.BookNo || '').toLowerCase().includes(q) ||
                (j.ShipperName || '').toLowerCase().includes(q) ||
                (j.ConsigneeName || '').toLowerCase().includes(q) ||
                (j.containers || []).some(c => (c.CtnNo || '').toLowerCase().includes(q))
            );
        if (matches.length === 0) {
            dd.innerHTML = `<div class="px-3 py-2 text-sm text-slate-400">No matches</div>`;
        } else {
            dd.innerHTML = matches.map(({ j, i }) => `
                <button type="button" data-go="${i}" class="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-100 last:border-0">
                    <span class="font-mono text-sm font-semibold text-indigo-700">${escapeHtml(j.JobNo)}</span>
                    <span class="status-pill status-${(j.JobStat||'open').toLowerCase()}" style="font-size:9px;padding:1px 6px">${escapeHtml(j.JobStat||'')}</span>
                    <span class="text-xs text-slate-500 ml-auto truncate">${escapeHtml(j.ShipperName || '')} → ${escapeHtml(j.ConsigneeName || j.DisPortName || '')}</span>
                </button>
            `).join('');
        }
        dd.classList.remove('hidden');
    }

    // ===== Bind events =====
    function bindEvents() {
        // Track dirty on any header input change
        document.addEventListener('input', (e) => {
            if (suppressDirty) return;
            const t = e.target;
            if (!(t instanceof HTMLElement)) return;
            // Container cell edits
            const tr = t.closest('tr[data-idx]');
            if (tr && t.dataset.col) {
                captureContainerRow(tr);
                recalcContainerTotals();
                setDirty(true);
                return;
            }
            // Header form
            if (t.name) {
                setDirty(true);
            }
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

        // Tab clicks — "Billing & Voucher" (Pg.5) shows only its tables and hides the form sections;
        // the other tabs show the form sections and hide the billing tables.
        const tabTargets = { revenue: '#containerTable', booking: '#containerTable' };
        $$('.tab').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.tab').forEach(b => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                setView(btn.dataset.tab);
            });
        });

        // Billing/Voucher — click an A/R invoice number to open it in the frmARInvoice mockup.
        ['#billingTbody', '#voucherTbody'].forEach(sel => {
            const el = $(sel);
            if (el) el.addEventListener('click', (e) => {
                const a = e.target.closest('.bv-link');
                if (a) openInvoice(a.dataset.inv, a.dataset.linked === '1');
            });
        });

        // Status pill — read-only, but show next valid transition on click via Close/Delete buttons.
        // (Removed the cycle-on-click from earlier so Save reflects real status.)

        // Containers add / clear / delete
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

        // Page 4 — Option & Summary
        const reBtn = $('#opReSummary');
        if (reBtn) reBtn.addEventListener('click', reSummarize);
        const clrCtn = $('#opClearCtn');
        if (clrCtn) clrCtn.addEventListener('click', () => {
            const job = currentJob();
            if (!job) return;
            ['Ctn20', 'Ctn40', 'Ctn40HC', 'Ctn45', 'Ctn20Ty', 'Ctn40Ty', 'Ctn40HCTy', 'Ctn45Ty']
                .forEach(k => { job[k] = (k.endsWith('Ty') ? '' : 0); });
            paintHeaderForm();
            paintOption();
            setDirty(true);
        });
        // Live Total-CTN box + profit-view repaint
        $('#optionSection')?.addEventListener('input', (e) => {
            const n = e.target.name;
            if (['Ctn20', 'Ctn40', 'Ctn40HC', 'Ctn45'].includes(n)) {
                const sum = ['Ctn20', 'Ctn40', 'Ctn40HC', 'Ctn45']
                    .reduce((a, k) => a + (+document.querySelector(`[name="${k}"]`).value || 0), 0);
                $('#opTotCtn').value = sum;
            }
        });
        $('[name="ProfitView"]')?.addEventListener('change', () => { captureForm(); paintOption(); });

        // Lookup buttons → demo toast
        $$('.lookup-btn').forEach(b => {
            b.addEventListener('click', () => {
                const code = b.previousElementSibling?.value || '—';
                const name = b.nextElementSibling?.value || '(no result)';
                showToast(`Lookup: ${code} → ${name}`, '⌕', 'warn');
            });
        });

        // Bottom & top buttons
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

        // Keyboard: Ctrl+S = Save, Ctrl+ArrowLeft/Right = nav
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                doSave();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') {
                e.preventDefault();
                navigateTo(state.currentIndex - 1);
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') {
                e.preventDefault();
                navigateTo(state.currentIndex + 1);
            }
        });

        // Warn before unload if dirty
        window.addEventListener('beforeunload', (e) => {
            if (dirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }
})();
