/* ===== Outbound Billing Entry (frmARInvoice) — script.js =====
 *
 * Standalone mockup: HTML + Tailwind CDN + vanilla JS + localStorage.
 * Ports frmARInvoice.frm (SRCTYPE=AR, SUB_SYSNAME=SF, JOBCLASS=EX).
 *
 * Save 1 doc == ARINVHEAD (header) + ARINVDETAIL (lines) + ARINVREM (remarks).
 * Totals mirror Sub UpdateHead: GROSS / VAT / TOTAL in Src currency + THB.
 */
(() => {
    const $  = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    const STORAGE_KEY = 'arinv_v4';

    let state = { docs: [], currentIndex: 0, masters: null };
    let dirty = false;
    let suppressDirty = false;

    // ===== Bilingual messages (mirror frm SysCode / ChkValidHead) =====
    const MSG = {
        invNoBlank:  { th: 'เลขที่เอกสารห้ามว่าง',        en: 'Doc No cannot be blank' },
        invNoDup:    { th: 'เลขที่เอกสารซ้ำ',             en: 'Doc No already exists' },
        custBlank:   { th: 'รหัสลูกค้าห้ามว่าง',           en: 'Customer Code cannot be blank' },
        custNotFound:{ th: 'ไม่พบรหัสลูกค้า',             en: 'Customer Code not found' },
        currBlank:   { th: 'สกุลเงินห้ามว่าง',            en: 'Currency cannot be blank' },
        excZero:     { th: 'อัตราแลกเปลี่ยนต้องมากกว่า 0', en: 'Exchange Rate must be greater than 0' },
        excThb:      { th: 'สกุล THB อัตราต้องเท่ากับ 1',  en: 'For THB, Exchange Rate must be 1' },
        excNotThb:   { th: 'สกุลต่างประเทศ อัตราต้องไม่เท่ากับ 1', en: 'For foreign currency, rate must not be 1' },
        noLines:     { th: 'ต้องมีรายการอย่างน้อย 1 บรรทัด', en: 'Document must contain at least one line' },
        descBlank:   { th: 'คำอธิบายห้ามว่าง',            en: 'Description cannot be blank' },
        cnNegative:  { th: 'Credit Note ยอดรวมต้องติดลบ',  en: 'Credit Note total must be negative' },
    };
    let locale = 'en';
    const msg = (k) => (MSG[k] ? (MSG[k][locale] || MSG[k].en) : k);

    // ===== Boot =====
    boot();
    async function boot() {
        await loadInitial();
        populateSelects();
        bindEvents();
        applyDeepLink();   // honor ?inv=<InvNo> (e.g. opened from frmSFJob_EX Billing listing)
        paintAll();
    }

    // Open a specific invoice when navigated with ?inv=INVNO. Falls back to a toast if not in this dataset.
    function applyDeepLink() {
        try {
            const inv = new URLSearchParams(window.location.search).get('inv');
            if (!inv) return;
            const i = state.docs.findIndex(d => (d.InvNo || '').toUpperCase() === inv.toUpperCase());
            if (i >= 0) {
                state.currentIndex = i;
                setTimeout(() => showToast(`เปิดจาก Job: ${state.docs[i].InvNo}`, '🔗'), 300);
            } else {
                setTimeout(() => showToast(`ไม่พบ ${inv} ในชุดข้อมูลนี้ (แสดงใบแรกแทน)`, 'ℹ', 'warn'), 300);
            }
        } catch (_) {}
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

    // Prefer inline seed (window.ARINV_SEED from data.js — works via file://),
    // then fall back to fetch('data.json') when served over http.
    async function loadSeed() {
        if (window.ARINV_SEED && Array.isArray(window.ARINV_SEED.docs)) {
            return window.ARINV_SEED;
        }
        const res = await fetch('data.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('data.json not reachable');
        return res.json();
    }

    async function seedFromJson() {
        try {
            const data = await loadSeed();
            state.docs = Array.isArray(data.docs) ? structuredClone(data.docs) : [];
            state.masters = data.masters || null;
            state.currentIndex = 0;
            persist();
        } catch (err) {
            console.warn('Could not load seed — starting empty.', err);
            state = { docs: [blankDoc()], currentIndex: 0, masters: null };
            persist();
        }
    }

    async function fetchMastersOnly() {
        try {
            const data = await loadSeed();
            state.masters = data.masters;
            persist();
        } catch (_) {}
    }

    const persist = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const current = () => state.docs[state.currentIndex] ?? null;
    const M = () => state.masters || {};

    // ===== Factories =====
    function blankDoc() {
        const now = new Date();
        const d = {
            BookNo: 'SF-LEX-1706', Descrip: 'LOCAL-SF-EX-1706',
            EntryNo: nextEntryNo(),
            SrcType: 'AR', SubSysName: 'SF', JobClass: 'EX',
            DocType: 'IN', DocBal: 1,
            InvNo: '', TaxInvNo: '', RCDocNo: '', GLDocNo: '',
            CustCode: '', CustName: '', CustGroup: 'Local', LocOver: 2,
            JobNo: '', HblRef: '', JobGroup: '', ReferInv: '', RefInvNo: '', RefCQ: '',
            InvDate: now.toISOString().slice(0, 10),
            DueDate: now.toISOString().slice(0, 10),
            GLDate: now.toISOString().slice(0, 10),
            FisPerd: String(now.getMonth() + 1).padStart(2, '0'),
            FisYear: String(now.getFullYear()),
            TermCode: '0', VatCode: 'VOC', SrcCurr: 'THB', ExcRate: 1.0,
            SaleCode: '', SaleName: '', InvDesc: '',
            AppointDate: null, BillNoteDate: null, OtherRef: '',
            Checked: false, DocStat: 'Open', PostEntry: 0, AdvAmt: 0,
            Lock: now.getTime(), EditBy: 'SYSTEM',
            EditDate: now.toISOString().slice(0, 19).replace('T', ' '),
            rem: { Descrip1: '', Descrip2: '', Descrip3: '', InvName: '', ComAdd: '', Branch: '', TaxID: '', WTName: '', WTTaxID: '', WTCode: '' },
            details: [],
            _isNew: true,
        };
        d.InvNo = genDocNo(d);
        return d;
    }

    function blankDetailRow() {
        return {
            DETID: 'row-' + Math.random().toString(36).slice(2, 10),
            ItemType: 'REV', ItemCode: '', ExpDesc1: '', ExpDesc2: '',
            AccID: '', AccName: '', Uom: 'SET', Qty: 1, Price: 0, DcType: 'DN',
            CalCurr: current()?.SrcCurr || 'THB',
            VatType: 1, VatRate: 7, VatInOut: 0,
            SrcAmt: 0, SrcVat: 0, SrcTot: 0, ThbAmt: 0, ThbVat: 0, ThbTot: 0,
            WTRate: 0, WTAmt: 0, JobNo: current()?.JobNo || '', SubJobNo: '',
        };
    }

    function nextEntryNo() {
        const same = state.docs.filter(d => d.BookNo === 'SF-LEX-1706');
        return same.length ? Math.max(...same.map(d => +d.EntryNo || 0)) + 1 : 1;
    }

    // ===== Document numbering (mirror UpdateAROption) =====
    // Pattern: <prefix><YY><MM><NNNN>  e.g. INSE1706 0003  (prefix carries sub-system)
    function genDocNo(d) {
        const dt = (M().docTypes || []).find(x => x.code === d.DocType);
        // A/P vouchers use the VI/VA prefix; A/R uses the DocType prefix (IN/CN/DN/AI/FI).
        const base = d.SrcType === 'AP' ? (d.DocType === 'AI' ? 'VA' : 'VI') : (dt?.prefix || 'IN');
        const prefix = base + 'SE';
        const yy = String(d.FisYear || '').slice(-2);
        const mm = String(d.FisPerd || '').padStart(2, '0');
        const head = `${prefix}${yy}${mm}`;
        let max = 0;
        state.docs.forEach(o => {
            if (o !== d && typeof o.InvNo === 'string' && o.InvNo.startsWith(head)) {
                const n = parseInt(o.InvNo.slice(head.length), 10);
                if (!isNaN(n) && n > max) max = n;
            }
        });
        return head + String(max + 1).padStart(4, '0');
    }

    // ===== Selects =====
    function populateSelects() {
        const m = M();
        fill('#docTypeSel', m.docTypes, x => x.code, x => `${x.code} · ${x.name}`);
        fill('#termSel', m.terms, x => x.TermCode, x => `${x.TermCode} · ${x.TermDesc}`);
        fill('#vatSel', m.vatCodes, x => x.VatCode, x => `${x.VatCode} · ${x.VatDesc}`);
        fill('#currSel', m.currencies, x => x.CurrCode, x => `${x.CurrCode} · ${x.CurrDesc}`);
        fill('#wtSel', [{ code: '', rate: 0, desc: '— none —' }].concat(m.wtCodes || []), x => x.code, x => x.code ? `${x.code} · ${x.desc}` : x.desc);
    }
    function fill(sel, arr, valFn, txtFn) {
        const el = $(sel); if (!el || !arr) return;
        el.innerHTML = arr.map(x => `<option value="${escapeHtml(valFn(x))}">${escapeHtml(txtFn(x))}</option>`).join('');
    }

    // ===== Render =====
    function paintAll() {
        clearErrors();
        paintHeaderForm();
        paintBanner();
        paintDetail();
        recalcTotals();
        paintWorkflow();
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
                const has = q && getPath(q, key) !== undefined;
                const v = has ? getPath(q, key) : '';
                if (el.type === 'checkbox') el.checked = !!v;
                else if (el.type === 'date') el.value = v ? String(v).slice(0, 10) : '';
                else el.value = (v === null || v === undefined) ? '' : v;
            });
        } finally { suppressDirty = false; }
    }

    // Mode-aware: the real frmARInvoice is one form instantiated for A/R (Outbound) or A/P (Inbound),
    // switched by SRCTYPE. Mirror that — relabel UI based on the current doc's SrcType.
    function applyMode(srcType) {
        const ap = srcType === 'AP';
        const logo = $('#modeLogo');
        if (logo) { logo.textContent = ap ? 'AP' : 'AR'; logo.classList.toggle('bg-rose-600', !ap); logo.classList.toggle('bg-indigo-600', ap); }
        const sub = $('#modeSubtitle'); if (sub) sub.textContent = ap ? 'SMP · A/P Billing' : 'SMP · A/R Billing';
        const title = $('#modeTitle'); if (title) title.textContent = ap ? 'Inbound Billing Entry' : 'Outbound Billing Entry';
        const partyWord = ap ? 'Vendor' : 'Customer';
        const bl = $('#bannerCustLabel'); if (bl) bl.textContent = partyWord;
        const fl = $('#custFieldLabel'); if (fl) fl.textContent = partyWord;
        document.title = `${ap ? 'Inbound' : 'Outbound'} Billing Entry — frmARInvoice`;
        // Pg.4: A/P relabels "Sale Person" → "Req By" (mirror frm lbl(6)) and shows ใบเบิกจากวงเงิน.
        const scl = $('#saleCodeLabel'); if (scl) scl.textContent = ap ? 'Req By Code' : 'Sale Person Code';
        const snl = $('#saleNameLabel'); if (snl) snl.textContent = ap ? 'Req By Name' : 'Sale Person Name';
        const p4 = $('#pg4Title'); if (p4) p4.innerHTML = ap ? '🧾 Req By &amp; requisition' : '🧑‍💼 Sales person &amp; agent';
        const reqField = $('#reqNoField');
        if (reqField) {
            reqField.classList.toggle('hidden', !ap);
            if (ap) populateReq(current());
        }
    }

    // Fill ใบเบิกจากวงเงิน dropdown (mirror frm cmbREQNo fill, line 12920):
    // requisitions of this job with DocStat Paid/Cleared, not already used by another live invoice.
    function populateReq(q) {
        const sel = $('#reqNoSel'); if (!sel) return;
        const all = M().requisitions || [];
        const usedElsewhere = new Set(state.docs.filter(d => d !== q && d.PostEntry !== 3 && d.ReqNo).map(d => d.ReqNo));
        const avail = all.filter(r => r.JobNo === q?.JobNo && ['Paid', 'Cleared'].includes(r.DocStat) && (!usedElsewhere.has(r.ReqNo) || r.ReqNo === q?.ReqNo));
        sel.innerHTML = `<option value="">— เลือกใบเบิก —</option>` +
            avail.map(r => `<option value="${escapeHtml(r.ReqNo)}">${escapeHtml(r.ReqNo)} · ${escapeHtml(r.FundName)} · ${fmtMoney(r.ReqAmt)}</option>`).join('');
        sel.value = q?.ReqNo || '';
        paintReqFund(q?.ReqNo);
    }
    function paintReqFund(reqNo) {
        const info = $('#reqFundInfo'); if (!info) return;
        const r = (M().requisitions || []).find(x => x.ReqNo === reqNo);
        info.textContent = r ? `ผู้เบิก ${r.ReqByName} · วงเงิน ${r.FundName} (${r.FundCode}) · ${fmtMoney(r.ReqAmt)} · ${r.DocStat}` : '';
    }

    function paintBanner() {
        const q = current();
        applyMode(q?.SrcType);
        $('#bannerBookNo').textContent = q ? `${q.BookNo || '—'} · ${q.Descrip || ''}` : '—';
        $('#bannerDocNo').textContent  = q?.InvNo || '—';
        $('#bannerCust').textContent   = q ? `${q.CustCode || ''} — ${q.CustName || ''}` : '—';
        $('#footerEditInfo').textContent = q?.EditBy ? `${q.EditBy} · ${q.EditDate || ''}` : '—';
        const lastEl = $('#lastModified');
        if (lastEl) lastEl.innerHTML = q?.EditBy
            ? `Modified by <strong>${escapeHtml(q.EditBy)}</strong> · ${escapeHtml(q.EditDate || '')}`
            : '—';
        applyStatusPill(q?.DocStat);
        applyPostPill(q?.PostEntry);
        $('#jobStatus').textContent = q?.DocStat === 'Canceled' ? 'Canceled' : 'Open';
    }

    function applyStatusPill(stat) {
        const map = { Open: 'status-open', Confirm: 'status-confirm', Approved: 'status-approved', Paid: 'status-paid', Cleared: 'status-cleared', Canceled: 'status-canceled', Deleted: 'status-deleted' };
        const pill = $('#statusPill');
        pill.className = `status-pill ${map[stat] || 'status-open'}`;
        pill.textContent = `● ${stat || 'Open'}`;
    }
    function applyPostPill(pe) {
        const pill = $('#postPill');
        if (pe === 2) { pill.className = 'status-pill status-posted'; pill.textContent = 'Posted'; }
        else if (pe === 3) { pill.className = 'status-pill status-canceled'; pill.textContent = 'Post canceled'; }
        else if (pe === 1) { pill.className = 'status-pill status-confirm'; pill.textContent = 'Ready to post'; }
        else { pill.className = 'status-pill status-close'; pill.textContent = 'Not posted'; }
    }

    function paintDetail() {
        const q = current();
        const tbody = $('#detailTbody');
        tbody.innerHTML = '';
        const rows = q?.details ?? [];
        rows.forEach((r, i) => tbody.appendChild(detailRowEl(r, i)));
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="13" class="text-center text-slate-400 py-4 text-sm">No lines — click "+ Add Line" to start.</td></tr>`;
        }
    }

    function detailRowEl(row, idx) {
        const tr = document.createElement('tr');
        tr.dataset.detid = row.DETID;
        tr.dataset.idx = String(idx);
        const itOpts = (M().itemTypes || []).map(t => `<option value="${t.code}" ${t.code === row.ItemType ? 'selected' : ''}>${t.code}</option>`).join('');
        const vtOpts = (M().vatTypes || []).map(t => `<option value="${t.code}" ${+t.code === +row.VatType ? 'selected' : ''}>${t.name}</option>`).join('');
        tr.innerHTML = `
            <td class="px-2 py-1 text-slate-400 text-xs">${idx + 1}</td>
            <td class="px-2 py-1"><select class="cell-input" data-col="ItemType">${itOpts}</select></td>
            <td class="px-2 py-1"><input class="cell-input font-mono uppercase" data-col="ItemCode" value="${escapeHtml(row.ItemCode ?? '')}" placeholder="code"></td>
            <td class="px-2 py-1"><input class="cell-input" data-col="ExpDesc1" value="${escapeHtml(row.ExpDesc1 ?? '')}"></td>
            <td class="px-2 py-1"><input class="cell-input font-mono" data-col="AccID" value="${escapeHtml(row.AccID ?? '')}" title="${escapeHtml(row.AccName ?? '')}"></td>
            <td class="px-2 py-1"><input class="cell-input uppercase" data-col="Uom" value="${escapeHtml(row.Uom ?? '')}"></td>
            <td class="px-2 py-1"><input type="number" step="0.01" class="cell-input text-right tabular-nums" data-col="Qty" value="${row.Qty ?? 0}"></td>
            <td class="px-2 py-1"><input type="number" step="0.01" class="cell-input text-right tabular-nums" data-col="Price" value="${row.Price ?? 0}"></td>
            <td class="px-2 py-1"><select class="cell-input" data-col="VatType">${vtOpts}</select></td>
            <td class="px-2 py-1 text-right tabular-nums cell-readonly" data-col="SrcAmt">${fmtMoney(row.SrcAmt)}</td>
            <td class="px-2 py-1 text-right tabular-nums cell-readonly" data-col="SrcVat">${fmtMoney(row.SrcVat)}</td>
            <td class="px-2 py-1 text-right tabular-nums cell-readonly font-medium" data-col="SrcTot">${fmtMoney(row.SrcTot)}</td>
            <td class="px-2 py-1 text-center"><button type="button" class="row-del" title="Delete line">✕</button></td>
        `;
        return tr;
    }

    function paintNav() {
        const total = state.docs.length, idx = state.currentIndex;
        $('#navCounter').textContent = total ? `${idx + 1} / ${total}` : '0 / 0';
        $('#navFirst').disabled = idx <= 0;
        $('#navPrev').disabled  = idx <= 0;
        $('#navNext').disabled  = idx >= total - 1;
        $('#navLast').disabled  = idx >= total - 1;
    }

    // ===== Capture =====
    function captureForm() {
        const q = current(); if (!q) return;
        $$('[name]').forEach(el => {
            const key = el.name;
            let v;
            if (el.type === 'checkbox') v = el.checked;
            else if (el.type === 'number') v = el.value === '' ? null : Number(el.value);
            else if (el.type === 'date') v = el.value || null;
            else v = el.value;
            setPath(q, key, v);
        });
        // keep DocBal in sync with DocType
        const dt = (M().docTypes || []).find(x => x.code === q.DocType);
        if (dt) q.DocBal = dt.docBal;
        // keep LocOver in sync with CustGroup
        q.LocOver = q.CustGroup === 'Oversea' ? 1 : 2;
    }

    function captureDetailRow(tr) {
        const q = current(); if (!q) return;
        const row = q.details[+tr.dataset.idx]; if (!row) return;
        $$('[data-col]', tr).forEach(el => {
            const col = el.dataset.col;
            if (['SrcAmt', 'SrcVat', 'SrcTot'].includes(col)) return;
            if (el.tagName === 'SELECT' && (col === 'VatType')) row[col] = Number(el.value);
            else if (el.type === 'number') row[col] = el.value === '' ? 0 : Number(el.value);
            else row[col] = el.value;
        });
        // VatRate follows VatType (1 => 7%, 3 => 0)
        row.VatRate = row.VatType === 1 ? 7 : 0;
        // lookup account name from master when AccID typed
        const acc = (M().accounts || []).find(a => a.AccID === row.AccID);
        if (acc) row.AccName = acc.AccName;
        recalcRow(row, q);
        // repaint computed cells
        ['SrcAmt', 'SrcVat', 'SrcTot'].forEach(c => {
            const cell = tr.querySelector(`[data-col="${c}"]`);
            if (cell) cell.textContent = fmtMoney(row[c]);
        });
        recalcTotals();
    }

    // ===== Calculations (mirror RecalAmount + UpdateHead) =====
    function recalcRow(row, q) {
        const qty = Number(row.Qty) || 0;
        const price = Number(row.Price) || 0;
        const base = qty * price;
        const rate = row.VatType === 1 ? (Number(row.VatRate) || 0) : 0;
        let amt, vat;
        if (row.VatInOut === 1) {            // VAT included in price
            vat = rate ? base * rate / (100 + rate) : 0;
            amt = base - vat;
        } else {                             // VAT excluded
            amt = base;
            vat = base * rate / 100;
        }
        row.SrcAmt = round2(amt);
        row.SrcVat = round2(vat);
        row.SrcTot = round2(amt + vat);
        const ex = Number(q?.ExcRate) || 1;
        row.ThbAmt = round2(row.SrcAmt * ex);
        row.ThbVat = round2(row.SrcVat * ex);
        row.ThbTot = round2(row.SrcTot * ex);
        row.WTAmt  = round2(row.SrcAmt * (Number(row.WTRate) || 0) / 100);
    }

    function recalcTotals() {
        const q = current();
        const rows = q?.details || [];
        let srcAdv = 0, srcGross = 0, srcVat = 0;
        rows.forEach(r => {
            recalcRow(r, q);
            srcGross += r.SrcAmt;                       // GROSS รวมทุกบรรทัด (รวม advance)
            if (r.ItemType === 'ADV') srcAdv += r.SrcAmt; // ADVANCE = breakout ย่อยของ gross
            srcVat += r.SrcVat;
        });
        const srcTot = srcGross + srcVat;
        const ex = Number(q?.ExcRate) || 1;
        // persist header amount snapshot
        if (q) {
            q.SrcAmtNoVatAdv = round2(srcAdv);
            q.SrcAmt = round2(srcGross); q.SrcVat = round2(srcVat); q.SrcTot = round2(srcTot);
            q.ThbAmt = round2(srcGross * ex); q.ThbVat = round2(srcVat * ex); q.ThbTot = round2(srcTot * ex);
        }
        const curr = q?.SrcCurr || 'THB';
        $('#totCurrLbl').textContent = `(${curr})`;
        $('#srcAdv').textContent   = fmtMoney(srcAdv);
        $('#srcGross').textContent = fmtMoney(srcGross);
        $('#srcVat').textContent   = fmtMoney(srcVat);
        $('#srcTot').textContent   = fmtMoney(srcTot);
        $('#thbAdv').textContent   = fmtMoney(srcAdv * ex);
        $('#thbGross').textContent = fmtMoney(srcGross * ex);
        $('#thbVat').textContent   = fmtMoney(srcVat * ex);
        $('#thbTot').textContent   = fmtMoney(srcTot * ex);
    }

    // ===== Lookups =====
    function applyCustomer(rec) {
        const q = current(); if (!q || !rec) return;
        q.CustCode = rec.CustCode; q.CustName = rec.CustName;
        q.CustGroup = rec.Group || q.CustGroup;
        q.LocOver = q.CustGroup === 'Oversea' ? 1 : 2;
        if (rec.TermCode) q.TermCode = rec.TermCode;
        q.rem = q.rem || {};
        q.rem.InvName = rec.CustName; q.rem.ComAdd = rec.Address || '';
        q.rem.TaxID = rec.TaxID || ''; q.rem.Branch = rec.Branch || '';
    }

    // ===== Validation (mirror ChkValidHead / ChkValidDetailCell) =====
    function validate() {
        const q = current(); const errors = [];
        if (!q) return errors;
        if (!(q.InvNo || '').trim()) errors.push({ field: 'InvNo', loc: 'Doc No', msg: msg('invNoBlank') });
        else {
            const dup = state.docs.some((o, i) => i !== state.currentIndex && (o.InvNo || '').toLowerCase() === (q.InvNo || '').toLowerCase());
            if (dup) errors.push({ field: 'InvNo', loc: 'Doc No', msg: msg('invNoDup') });
        }
        if (!(q.CustCode || '').trim()) errors.push({ field: 'CustCode', loc: 'Customer', msg: msg('custBlank') });
        else if (!(M().customers || []).some(c => c.CustCode.toLowerCase() === q.CustCode.toLowerCase()))
            errors.push({ field: 'CustCode', loc: 'Customer', msg: msg('custNotFound') });
        if (!(q.SrcCurr || '').trim()) errors.push({ field: 'SrcCurr', loc: 'Currency', msg: msg('currBlank') });
        const ex = Number(q.ExcRate) || 0;
        if (ex <= 0) errors.push({ field: 'ExcRate', loc: 'Exchange Rate', msg: msg('excZero') });
        else if (q.SrcCurr === 'THB' && ex !== 1) errors.push({ field: 'ExcRate', loc: 'Exchange Rate', msg: msg('excThb') });
        else if (q.SrcCurr !== 'THB' && ex === 1) errors.push({ field: 'ExcRate', loc: 'Exchange Rate', msg: msg('excNotThb') });
        if (!(q.details || []).length) errors.push({ field: 'InvNo', loc: 'Line items', msg: msg('noLines') });
        (q.details || []).forEach((row, i) => {
            if (!(row.ExpDesc1 || '').trim())
                errors.push({ gridKind: 'detail', gridIdx: i, col: 'ExpDesc1', loc: `Line ${i + 1} · Description`, msg: msg('descBlank') });
        });
        // Credit Note must net negative
        if (q.DocType === 'CN' && (q.SrcTot || 0) > 0)
            errors.push({ field: 'InvNo', loc: 'Credit Note', msg: msg('cnNegative') });
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
                        span.className = 'field-error'; span.textContent = err.msg;
                        wrap.appendChild(span);
                    }
                }
            }
            if (err.gridKind) {
                const tr = document.querySelector(`#detailTbody tr[data-idx="${err.gridIdx}"]`);
                const cell = tr?.querySelector(`[data-col="${err.col}"]`);
                if (cell) {
                    cell.classList.add('is-error');
                    const td = cell.closest('td');
                    if (td && !td.querySelector('.cell-error')) {
                        const div = document.createElement('div');
                        div.className = 'cell-error'; div.textContent = err.msg;
                        td.appendChild(div);
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
        $('#errorList').innerHTML = errors.map(e => `<li><span class="err-loc">${escapeHtml(e.loc)}</span>${escapeHtml(e.msg)}</li>`).join('');
        const m = $('#errorModal'); m.classList.remove('hidden'); m.classList.add('flex');
    }
    function hideErrorModal() { const m = $('#errorModal'); m.classList.add('hidden'); m.classList.remove('flex'); }

    // ===== Workflow / read-only =====
    function isLocked(q) {
        return !!q && (q.DocStat === 'Approved' || q.DocStat === 'Paid' || q.DocStat === 'Canceled' || q.PostEntry === 2);
    }
    function applyReadOnly() {
        const q = current();
        const locked = isLocked(q);
        document.body.classList.toggle('is-readonly', locked);
        const banner = $('#readonlyBanner');
        if (!q) { banner.className = 'readonly-banner'; return; }
        if (q.DocStat === 'Canceled') { banner.className = 'readonly-banner is-canceled'; $('#readonlyText').textContent = 'Ø This document is CANCELED — read-only.'; }
        else if (q.PostEntry === 2) { banner.className = 'readonly-banner is-posted'; $('#readonlyText').textContent = '✓ Posted to G/L — read-only.'; }
        else if (q.DocStat === 'Approved' || q.DocStat === 'Paid') { banner.className = 'readonly-banner is-approved'; $('#readonlyText').textContent = `🔒 This document is ${q.DocStat} — read-only.`; }
        else banner.className = 'readonly-banner';
    }
    function paintWorkflow() {
        const q = current(); if (!q) return;
        const st = q.DocStat, pe = q.PostEntry;
        const cBtn = $('#confirmBtn'), aBtn = $('#approveBtn'), pBtn = $('#postBtn'), xBtn = $('#cancelBtn');
        // Confirm <-> UnConfirm
        cBtn.textContent = st === 'Confirm' ? '↺ UnConfirm' : '✓ Confirm';
        cBtn.className = st === 'Confirm' ? 'btn-secondary' : 'btn-success';
        cBtn.disabled = !(st === 'Open' || st === 'Confirm');
        // Approve <-> UnApprove
        aBtn.textContent = st === 'Approved' ? '↺ UnApprove' : 'Approve';
        aBtn.disabled = !(st === 'Confirm' || st === 'Approved') || pe === 2;
        // Post <-> UnPost
        pBtn.textContent = pe === 2 ? '↺ UnPost G/L' : 'Post G/L';
        pBtn.disabled = !(st === 'Approved');
        // Cancel
        xBtn.disabled = st === 'Canceled' || pe === 2;
    }

    // ===== Toast + dialog =====
    function showToast(text, icon = '✓', kind = 'success') {
        $('#toastMsg').textContent = text; $('#toastIcon').textContent = icon;
        const inner = $('#toast').firstElementChild;
        inner.className = 'px-4 py-3 rounded-lg shadow-lg text-sm flex items-center gap-2 ' + ({ success: 'bg-slate-900 text-white', warn: 'bg-amber-500 text-white', error: 'bg-red-600 text-white' }[kind] || 'bg-slate-900 text-white');
        $('#toast').classList.remove('hidden');
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => $('#toast').classList.add('hidden'), 2500);
    }
    function confirmDialog({ title, message, confirmLabel = 'OK', danger = false }) {
        return new Promise(resolve => {
            $('#dlgTitle').textContent = title; $('#dlgMsg').textContent = message;
            const btn = $('#dlgConfirm'); btn.textContent = confirmLabel;
            btn.className = danger ? 'btn-danger' : 'btn-primary';
            const dlg = $('#dialog'); dlg.classList.remove('hidden'); dlg.classList.add('flex');
            const cleanup = v => { dlg.classList.add('hidden'); dlg.classList.remove('flex'); btn.onclick = null; $('#dlgCancel').onclick = null; resolve(v); };
            btn.onclick = () => cleanup(true);
            $('#dlgCancel').onclick = () => cleanup(false);
        });
    }

    // ===== Actions =====
    function doSave() {
        const q0 = current(); if (!q0) return;
        if (isLocked(q0)) { showToast(`Cannot save — document is ${q0.DocStat}`, '🔒', 'warn'); return; }
        captureForm();
        $$('#detailTbody tr[data-idx]').forEach(captureDetailRow);
        const errors = validate();
        if (errors.length) { applyErrors(errors); showToast(`${errors.length} validation error(s)`, '⚠', 'error'); return; }
        clearErrors();
        const q = current();
        q.details.forEach((r, i) => { r.DetLine = i + 1; });
        recalcTotals();
        q.Lock = Date.now();
        q.EditBy = q.EditBy === 'SYSTEM' ? 'ADMIN' : q.EditBy;
        q.EditDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
        delete q._isNew;
        persist(); setDirty(false); paintBanner();
        showToast(`Saved ${q.InvNo}`, '💾');
    }

    function setStatus(newStat, opts = {}) {
        const q = current(); if (!q) return;
        q.DocStat = newStat;
        if (opts.post !== undefined) q.PostEntry = opts.post;
        if (newStat === 'Approved') { q.AppBy = 'ADMIN'; q.AppDate = today(); }
        q.Lock = Date.now();
        q.EditDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
        persist(); paintAll();
    }

    function doConfirm() {
        const q = current(); if (!q) return;
        if (q.DocStat === 'Confirm') { setStatus('Open'); showToast('Un-confirmed', '↺', 'warn'); }
        else { captureForm(); $$('#detailTbody tr[data-idx]').forEach(captureDetailRow);
               const e = validate(); if (e.length) { applyErrors(e); showToast('Fix errors before confirming', '⚠', 'error'); return; }
               persist(); setStatus('Confirm'); showToast('Confirmed', '✓'); }
    }
    function doApprove() {
        const q = current(); if (!q) return;
        if (q.DocStat === 'Approved') { setStatus('Confirm'); showToast('Un-approved', '↺', 'warn'); }
        else { setStatus('Approved'); showToast(`Approved ${q.InvNo}`, '✓'); }
    }
    function doPost() {
        const q = current(); if (!q) return;
        if (q.PostEntry === 2) { q.GLDocNo = ''; setStatus('Approved', { post: 0 }); showToast('Un-posted from G/L', '↺', 'warn'); }
        else { q.GLDocNo = 'GL' + q.InvNo.slice(2); setStatus('Approved', { post: 2 }); showToast(`Posted → ${q.GLDocNo}`, '✓'); }
    }
    async function doCancel() {
        const q = current(); if (!q) return;
        if (q.DocStat === 'Canceled') { showToast('Already canceled', '🔒', 'warn'); return; }
        const ok = await confirmDialog({ title: `Cancel ${q.InvNo}?`, message: `DocStat → 'Canceled', PostEntry → 3 (mirror frm cmdDelete).`, confirmLabel: 'Cancel Doc', danger: true });
        if (!ok) return;
        if (q._isNew) {
            state.docs.splice(state.currentIndex, 1);
            state.currentIndex = Math.max(0, state.currentIndex - 1);
            if (!state.docs.length) state.docs.push(blankDoc());
            persist(); paintAll();
        } else { setStatus('Canceled', { post: 3 }); }
        showToast(`Canceled ${q.InvNo}`, 'Ø', 'error');
    }

    async function doNew() {
        if (dirty && !(await confirmDiscard())) return;
        state.docs.push(blankDoc());
        state.currentIndex = state.docs.length - 1;
        persist(); paintAll(); goPage(1);
        showToast('New entry', '＋');
    }
    async function navigateTo(i) {
        if (i < 0 || i >= state.docs.length || i === state.currentIndex) return;
        if (dirty && !(await confirmDiscard())) return;
        state.currentIndex = i; persist(); paintAll();
    }
    const confirmDiscard = () => confirmDialog({ title: 'Unsaved changes', message: 'Discard unsaved edits and continue?', confirmLabel: 'Discard', danger: true });

    async function doReset() {
        const ok = await confirmDialog({ title: 'Reset to seed data?', message: 'Wipe localStorage and reload from data.json.', confirmLabel: 'Reset', danger: true });
        if (!ok) return;
        localStorage.removeItem(STORAGE_KEY);
        state = { docs: [], currentIndex: 0, masters: null };
        await seedFromJson(); populateSelects(); paintAll();
        showToast('Reset complete', '↺');
    }

    function renderSearch(query) {
        const dd = $('#searchDropdown');
        const t = (query || '').trim().toLowerCase();
        if (!t) { dd.classList.add('hidden'); dd.innerHTML = ''; return; }
        const matches = state.docs.map((d, i) => ({ d, i })).filter(({ d }) =>
            (d.InvNo || '').toLowerCase().includes(t) || (d.CustName || '').toLowerCase().includes(t) || (d.CustCode || '').toLowerCase().includes(t));
        dd.innerHTML = matches.length ? matches.map(({ d, i }) => `
            <button type="button" data-go="${i}" class="w-full text-left px-3 py-2 hover:bg-rose-50 flex items-center gap-3 border-b border-slate-100 last:border-0">
                <span class="font-mono text-sm font-semibold">${escapeHtml(d.InvNo)}</span>
                <span class="text-xs text-slate-500 truncate flex-1">${escapeHtml(d.CustName || '')}</span>
                <span class="status-pill status-${(d.DocStat || 'open').toLowerCase()}" style="font-size:9px;padding:1px 6px">${escapeHtml(d.DocStat || '')}</span>
            </button>`).join('') : `<div class="px-3 py-2 text-sm text-slate-400">No matches</div>`;
        dd.classList.remove('hidden');
    }

    // ===== Customer lookup modal =====
    function openCustLookup() {
        renderLookup('');
        const m = $('#lookupModal'); m.classList.remove('hidden'); m.classList.add('flex');
        $('#lookupSearch').value = ''; $('#lookupSearch').focus();
    }
    function closeCustLookup() { const m = $('#lookupModal'); m.classList.add('hidden'); m.classList.remove('flex'); }
    function renderLookup(q) {
        const t = (q || '').toLowerCase();
        const rows = (M().customers || []).filter(c => c.CustCode.toLowerCase().includes(t) || c.CustName.toLowerCase().includes(t));
        $('#lookupTbody').innerHTML = rows.map(c => `
            <tr data-code="${escapeHtml(c.CustCode)}">
                <td class="font-mono font-semibold w-24">${escapeHtml(c.CustCode)}</td>
                <td>${escapeHtml(c.CustName)}</td>
                <td class="text-xs text-slate-400">${escapeHtml(c.Group || '')}</td>
            </tr>`).join('') || `<tr><td class="text-slate-400 py-4 text-center">No customers</td></tr>`;
    }

    // ===== Page rail + sub-tabs =====
    function goPage(n) {
        $$('#pageRail .page-tab').forEach(b => b.classList.toggle('is-active', +b.dataset.page === n));
        $$('.page-panel').forEach(p => p.classList.toggle('hidden', +p.dataset.page !== n));
    }
    function goSubTab(name) {
        $$('#subTabs .sub-tab').forEach(b => b.classList.toggle('is-active', b.dataset.subtab === name));
        $$('.sub-panel').forEach(p => p.classList.toggle('hidden', p.dataset.subtab !== name));
    }

    // ===== Bind =====
    function bindEvents() {
        document.addEventListener('input', (e) => {
            if (suppressDirty) return;
            const t = e.target; if (!(t instanceof HTMLElement)) return;
            const tr = t.closest('tr[data-idx]');
            if (tr && t.dataset.col) { captureDetailRow(tr); setDirty(true); return; }
            if (t.name) {
                // live header fields that affect calc/labels
                if (['ExcRate', 'SrcCurr'].includes(t.name)) { captureForm(); recalcTotals(); }
                if (t.name === 'DocType') { captureForm(); if (current()?._isNew) { current().InvNo = genDocNo(current()); paintHeaderForm(); paintBanner(); } }
                setDirty(true);
            }
        });
        document.addEventListener('change', (e) => {
            const t = e.target;
            if (t.matches?.('select.cell-input')) { const tr = t.closest('tr[data-idx]'); if (tr) { captureDetailRow(tr); paintDetail(); } }
        });

        $('#addDetailBtn').addEventListener('click', () => {
            const q = current(); if (!q || isLocked(q)) return;
            q.details = q.details || []; q.details.push(blankDetailRow());
            paintDetail(); recalcTotals(); setDirty(true);
        });
        $('#clearDetailBtn').addEventListener('click', async () => {
            const q = current(); if (!q?.details?.length) return;
            const ok = await confirmDialog({ title: 'Clear all lines?', message: `Remove all ${q.details.length} line(s)?`, confirmLabel: 'Clear All', danger: true });
            if (!ok) return;
            q.details = []; paintDetail(); recalcTotals(); setDirty(true);
        });
        $('#refAdvBtn').addEventListener('click', () => showToast('Ref. job charges — pulls from OPTransDetail (backend only)', 'ℹ', 'warn'));
        $('#detailTbody').addEventListener('click', (e) => {
            if (e.target.classList.contains('row-del')) {
                const q = current(); if (!q || isLocked(q)) return;
                q.details.splice(+e.target.closest('tr').dataset.idx, 1);
                paintDetail(); recalcTotals(); setDirty(true);
            }
        });

        ['saveBtn', 'saveBtn2'].forEach(id => $(`#${id}`).addEventListener('click', doSave));
        $('#confirmBtn').addEventListener('click', doConfirm);
        $('#approveBtn').addEventListener('click', doApprove);
        $('#postBtn').addEventListener('click', doPost);
        $('#cancelBtn').addEventListener('click', doCancel);
        $('#subTransBtn').addEventListener('click', () => showToast('Update Sub-Transactions — links OPTransDetail.DocNo (backend only)', 'ℹ', 'warn'));
        $('#printBtn').addEventListener('click', () => showToast('Print — Crystal report (not in mockup)', '🖨', 'warn'));
        $('#exportBtn').addEventListener('click', () => showToast('Export to interface (backend only)', 'ℹ', 'warn'));
        $('#closeBtn').addEventListener('click', () => showToast('Close (no-op in mockup)', 'ℹ', 'warn'));
        $('#loadAddrBtn').addEventListener('click', () => {
            const q = current(); const rec = (M().customers || []).find(c => c.CustCode === q?.CustCode);
            if (rec) { applyCustomer(rec); paintHeaderForm(); setDirty(true); showToast('Address loaded', '↧'); }
            else showToast('Select a valid customer first', '⚠', 'warn');
        });

        $('#newBtn').addEventListener('click', doNew);
        $('#resetSeedBtn').addEventListener('click', doReset);
        $('#navFirst').addEventListener('click', () => navigateTo(0));
        $('#navPrev').addEventListener('click', () => navigateTo(state.currentIndex - 1));
        $('#navNext').addEventListener('click', () => navigateTo(state.currentIndex + 1));
        $('#navLast').addEventListener('click', () => navigateTo(state.docs.length - 1));

        $('#pageRail').addEventListener('click', e => { const b = e.target.closest('.page-tab'); if (b) goPage(+b.dataset.page); });
        $('#subTabs').addEventListener('click', e => { const b = e.target.closest('.sub-tab'); if (b) goSubTab(b.dataset.subtab); });

        // customer lookup
        // ใบเบิกจากวงเงิน — select a requisition to link (mirror cmbREQNo_Click)
        $('#reqNoSel').addEventListener('change', e => {
            const q = current(); if (!q) return;
            q.ReqNo = e.target.value;
            paintReqFund(q.ReqNo);
            setDirty(true);
        });

        $('#custLookupBtn').addEventListener('click', openCustLookup);
        $('#lookupClose').addEventListener('click', closeCustLookup);
        $('#lookupSearch').addEventListener('input', e => renderLookup(e.target.value));
        $('#lookupModal').addEventListener('click', e => { if (e.target.id === 'lookupModal') closeCustLookup(); });
        $('#lookupTbody').addEventListener('click', e => {
            const tr = e.target.closest('tr[data-code]'); if (!tr) return;
            const rec = (M().customers || []).find(c => c.CustCode === tr.dataset.code);
            applyCustomer(rec); closeCustLookup(); paintHeaderForm(); paintBanner(); setDirty(true);
        });
        // customer code typed directly
        document.querySelector('[name="CustCode"]').addEventListener('blur', e => {
            const rec = (M().customers || []).find(c => c.CustCode.toLowerCase() === e.target.value.trim().toLowerCase());
            if (rec) { applyCustomer(rec); paintHeaderForm(); paintBanner(); setDirty(true); }
        });

        // search
        $('#searchInput').addEventListener('input', e => renderSearch(e.target.value));
        $('#searchInput').addEventListener('focus', e => renderSearch(e.target.value));
        document.addEventListener('click', e => { if (!e.target.closest('#searchInput') && !e.target.closest('#searchDropdown')) $('#searchDropdown').classList.add('hidden'); });
        $('#searchDropdown').addEventListener('click', e => {
            const btn = e.target.closest('[data-go]');
            if (btn) { $('#searchInput').value = ''; $('#searchDropdown').classList.add('hidden'); navigateTo(+btn.dataset.go); }
        });

        $('#errOk').addEventListener('click', hideErrorModal);
        $('#errorModal').addEventListener('click', e => { if (e.target.id === 'errorModal') hideErrorModal(); });

        document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); doSave(); }
            else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') { e.preventDefault(); navigateTo(state.currentIndex - 1); }
            else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') { e.preventDefault(); navigateTo(state.currentIndex + 1); }
        });
        window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
    }

    // ===== Helpers =====
    function setDirty(v) { dirty = !!v; $('#dirtyFlag').classList.toggle('hidden', !dirty); }
    function getPath(o, path) { return path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o); }
    function setPath(o, path, v) {
        const ks = path.split('.'); let t = o;
        for (let i = 0; i < ks.length - 1; i++) { if (t[ks[i]] == null || typeof t[ks[i]] !== 'object') t[ks[i]] = {}; t = t[ks[i]]; }
        t[ks[ks.length - 1]] = v;
    }
    function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
    const today = () => new Date().toISOString().slice(0, 10);
    function fmtMoney(n) { return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
})();
