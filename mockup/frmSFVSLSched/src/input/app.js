/* app.js — Voyage Entry orchestration (frmSFSched v2). window.VSI.app */
window.VSI = window.VSI || {};
window.VSI.app = (function () {
    'use strict';
    const U = VSI.util, S = VSI.store;
    const { $, $$, escapeHtml } = U;

    let draft = null;        // { isNew?, voyage, ports[], cutoffs[] }
    let dirty = false;
    let filter = '';

    const MOVE   = ['Load','Transshipment','Discharge'];
    const PSTAT  = ['Scheduled','Delayed','Completed'];
    const COTYPE = ['SI Closing','VGM Closing','CY Closing','Customs Closing'];
    const COSTAT = ['Open','Today','Closed'];

    async function boot() {
        await S.load();
        $('#btnNew').onclick    = () => { if (confirmLeave()) startDraft(S.blankDraft()); };
        $('#btnExport').onclick = exportJson;
        const rb = $('#btnReset');
        if (rb) rb.onclick = () => {
            if (!confirm('คืนค่าข้อมูลตั้งต้น (seed)? การแก้ไขที่บันทึกไว้จะถูกล้าง')) return;
            S.resetSeed(); draft = null; setDirty(false); location.reload();
        };
        $('#vSearch').addEventListener('input', e => { filter = e.target.value.toLowerCase(); renderList(); });
        renderList();
    }

    /* ---------------- sidebar list ---------------- */
    function renderList() {
        const vms = S.voyages().filter(v => {
            if (!filter) return true;
            const ve = S.vesselById(v.vesselId) || {}, ca = S.carrierById(v.carrierId) || {};
            return [ve.vesselName, v.voyageNo, ca.carrierCode, ca.carrierName].join(' ').toLowerCase().includes(filter);
        });
        $('#vCount').textContent = vms.length;
        const cur = draft && draft.voyage.voyageId;
        $('#voyageList').innerHTML = vms.map(v => {
            const ve = S.vesselById(v.vesselId) || {}, ca = S.carrierById(v.carrierId) || {};
            const pol = S.portById(v.polPortId) || {}, pod = S.portById(v.podPortId) || {};
            return `<div class="vessel-card ${v.voyageId===cur?'active':''}" data-id="${escapeHtml(v.voyageId)}">
                <div class="vc-top"><strong>${escapeHtml(ve.vesselName||'—')}</strong>
                    <span class="pill ${v.scheduleStatus==='Delayed'?'pill-warn':'pill-ok'}">${escapeHtml(v.scheduleStatus||'')}</span></div>
                <small>Voyage ${escapeHtml(v.voyageNo)} | ${escapeHtml(ca.carrierCode||'?')} | ${escapeHtml(v.direction||'')}</small>
                <div class="route">${escapeHtml(pol.portCode||'?')} → ${escapeHtml(pod.portCode||'?')}</div>
            </div>`;
        }).join('') || `<div class="list-empty">No voyage.</div>`;
        $$('#voyageList .vessel-card').forEach(c =>
            c.addEventListener('click', () => { if (confirmLeave()) startDraft(S.draftOf(c.dataset.id)); }));
    }

    function confirmLeave() {
        return !dirty || confirm('มีการแก้ไขที่ยังไม่บันทึก — ทิ้งการแก้ไขหรือไม่?');
    }

    /* ---------------- form ---------------- */
    function startDraft(d) {
        draft = d;
        setDirty(false);
        renderForm();
        renderList();
    }

    function renderForm() {
        const tpl = $('#tplForm').content.cloneNode(true);
        const root = $('#formRoot');
        root.innerHTML = '';
        root.appendChild(tpl);

        // Carrier & Vessel are searchable typeaheads (datalist); Service Lane stays a select.
        buildHeaderDatalists();
        fillSelect($('[data-h="serviceLaneId"]'), S.serviceLanes().map(s => [s.serviceLaneId, `${s.serviceCode} — ${s.serviceName}`]), '—');

        // header values
        const v = draft.voyage;
        $('[data-h="carrierId"]').value = carrierLabel(v.carrierId);   // show "CODE — Name"
        $('[data-h="vesselId"]').value  = vesselName(v.vesselId);      // show vessel name
        ['serviceLaneId','voyageNo','direction','scheduleStatus','bookingStatus']
            .forEach(f => { const el = $(`[data-h="${f}"]`); if (el) el.value = v[f] ?? ''; });
        setImo();

        $('#fTitle').textContent = draft.isNew ? 'New Voyage' : `${(S.vesselById(v.vesselId)||{}).vesselName||''} / ${v.voyageNo||''}`;
        const mode = $('#fMode'); mode.textContent = draft.isNew ? 'NEW' : 'EDIT';
        mode.className = 'pill ' + (draft.isNew ? 'pill-warn' : 'pill-info');

        // header change wiring (listen on both input + change so typed text and
        // dropdown picks both commit immediately — no blur required)
        $$('#formRoot [data-h]').forEach(el => {
            if (el.readOnly) return;
            const handler = (ev) => {
                const f = el.dataset.h;
                if (f === 'carrierId') {                      // typeahead → resolve to id
                    v.carrierId = resolveCarrierId(el.value);
                } else if (f === 'vesselId') {               // typeahead → resolve + IMO
                    v.vesselId = resolveVesselId(el.value);
                    setImo();
                    // Auto-fill Carrier ONLY on commit (change / datalist pick), so typing
                    // in Vessel doesn't overwrite a manually-set Carrier mid-keystroke.
                    if (ev && ev.type === 'change') {
                        const ve = S.vesselById(v.vesselId);
                        if (ve && ve.carrierId) { v.carrierId = ve.carrierId; $('[data-h="carrierId"]').value = carrierLabel(ve.carrierId); }
                    }
                } else {
                    v[f] = el.value;
                }
                setDirty(true);
            };
            el.addEventListener('input', handler);
            el.addEventListener('change', handler);
        });

        // buttons
        $('#btnSave').onclick   = save;
        $('#btnDelete').onclick = del;
        $('#btnCopy').onclick   = copy;
        $('#btnAddPort').onclick = addPort;
        $('#btnAddCut').onclick  = addCut;

        renderRotation();
        renderCutoffs();
        derive();
    }

    function fillSelect(el, pairs, blank) {
        if (!el) return;
        el.innerHTML = (blank !== undefined ? `<option value="">${escapeHtml(blank)}</option>` : '')
            + pairs.map(([val, txt]) => `<option value="${escapeHtml(val)}">${escapeHtml(txt)}</option>`).join('');
    }
    function setImo() {
        const ve = S.vesselById(draft.voyage.vesselId);
        const el = $('[data-h="imo"]'); if (el) el.value = ve ? (ve.imoNo || '') : '';
    }

    // Carrier / Vessel typeahead helpers
    const carrierLabel = id => { const c = S.carrierById(id); return c ? `${c.carrierCode} — ${c.carrierName}` : ''; };
    const vesselName   = id => { const v = S.vesselById(id); return v ? v.vesselName : ''; };
    function resolveCarrierId(text) {
        const t = (text || '').trim(); if (!t) return '';
        let c = S.carriers().find(x => `${x.carrierCode} — ${x.carrierName}` === t);
        if (!c) { const code = t.split('—')[0].trim().toUpperCase(); c = S.carriers().find(x => (x.carrierCode||'').toUpperCase() === code); }
        if (!c) { const lt = t.toLowerCase(); c = S.carriers().find(x => `${x.carrierCode} ${x.carrierName}`.toLowerCase().includes(lt)); }
        return c ? c.carrierId : '';
    }
    function resolveVesselId(text) {
        const t = (text || '').trim(); if (!t) return '';
        let v = S.vessels().find(x => (x.vesselName||'') === t);
        if (!v) { const lt = t.toLowerCase(); v = S.vessels().find(x => (x.vesselName||'').toLowerCase().includes(lt)); }
        return v ? v.vesselId : '';
    }
    function buildHeaderDatalists() {
        const cd = $('#carrierDatalist'); if (cd) cd.innerHTML = S.carriers().map(c => `<option value="${escapeHtml(c.carrierCode+' — '+c.carrierName)}">`).join('');
        const vd = $('#vesselDatalist');  if (vd) vd.innerHTML  = S.vessels().map(v => `<option value="${escapeHtml(v.vesselName)}">`).join('');
    }

    /* ---------------- port rotation ---------------- */
    // Port cell is a searchable typeahead: <input list="portDatalist">.
    const portLabel = p => `${p.portCode} — ${p.portName}`;
    function portDisplay(portId) { const p = S.portById(portId); return p ? portLabel(p) : ''; }
    /** Resolve typed text ("THLCH", "THLCH — Laem Chabang", or a name) → portId. */
    function resolvePortId(text) {
        const t = (text || '').trim(); if (!t) return '';
        let p = S.ports().find(x => portLabel(x) === t);                          // exact label
        if (!p) { const code = t.split('—')[0].trim().toUpperCase();
                  p = S.ports().find(x => (x.portCode || '').toUpperCase() === code); }  // by code
        if (!p) { const lt = t.toLowerCase();                                      // contains code/name
                  p = S.ports().find(x => `${x.portCode} ${x.portName}`.toLowerCase().includes(lt)); }
        return p ? p.portId : '';
    }
    function buildPortDatalist() {
        const dl = $('#portDatalist'); if (!dl) return;
        dl.innerHTML = S.ports().map(p => `<option value="${escapeHtml(portLabel(p))}">`).join('');
    }
    function optList(arr, sel) {
        return arr.map(o => `<option ${o===sel?'selected':''}>${escapeHtml(o)}</option>`).join('');
    }
    function renderRotation() {
        buildPortDatalist();
        $('#rotCount').textContent = draft.ports.length;
        $('#rotBody').innerHTML = draft.ports.map((p, i) => `<tr data-i="${i}">
            <td style="text-align:center">${i+1}</td>
            <td><input class="cell" data-f="portId" list="portDatalist" placeholder="type code / name…" value="${escapeHtml(portDisplay(p.portId))}"></td>
            <td><select class="cell" data-f="moveType">${optList(MOVE, p.moveType)}</select></td>
            <td><input type="datetime-local" class="cell" data-f="eta" value="${U.isoToLocal(p.eta)}"></td>
            <td><input type="datetime-local" class="cell" data-f="etd" value="${U.isoToLocal(p.etd)}"></td>
            <td><input class="cell" data-f="terminalName" value="${escapeHtml(p.terminalName||'')}"></td>
            <td><input class="cell" data-f="berth" value="${escapeHtml(p.berth||'')}"></td>
            <td><select class="cell" data-f="status">${optList(PSTAT, p.status)}</select></td>
            <td><button class="row-del" title="remove">✕</button></td>
        </tr>`).join('') || `<tr><td colspan="9" class="edit-empty">No port call — click “+ Add Call”.</td></tr>`;

        $$('#rotBody tr[data-i]').forEach(tr => {
            const i = +tr.dataset.i;
            $$('.cell', tr).forEach(cell => cell.addEventListener('input', () => {
                const f = cell.dataset.f;
                if (f === 'portId')             draft.ports[i].portId = resolvePortId(cell.value);
                else if (f==='eta'||f==='etd')  draft.ports[i][f] = U.localToIso(cell.value);
                else                            draft.ports[i][f] = cell.value;
                if (['portId','moveType','eta','etd'].includes(f)) derive();
                setDirty(true);
            }));
            tr.querySelector('.row-del').addEventListener('click', () => { draft.ports.splice(i,1); renderRotation(); derive(); setDirty(true); });
        });
    }
    function addPort() {
        draft.ports.push({ voyagePortId:'', voyageId:draft.voyage.voyageId, sequenceNo:draft.ports.length+1,
            portId:'', moveType: draft.ports.length?'Discharge':'Load', eta:null, etd:null,
            terminalName:'', berth:'', status:'Scheduled' });
        renderRotation(); setDirty(true);
    }

    /* ---------------- cut-offs ---------------- */
    function renderCutoffs() {
        $('#coCount').textContent = draft.cutoffs.length;
        $('#coBody').innerHTML = draft.cutoffs.map((c, i) => `<tr data-i="${i}">
            <td><select class="cell" data-f="cutOffType">${optList(COTYPE, c.cutOffType)}</select></td>
            <td><input type="datetime-local" class="cell" data-f="cutOffDateTime" value="${U.isoToLocal(c.cutOffDateTime)}"></td>
            <td><select class="cell" data-f="status">${optList(COSTAT, c.status)}</select></td>
            <td><input class="cell" data-f="remark" value="${escapeHtml(c.remark||'')}"></td>
            <td><button class="row-del" title="remove">✕</button></td>
        </tr>`).join('') || `<tr><td colspan="5" class="edit-empty">No cut-off — click “+ Add Cut-off”.</td></tr>`;

        $$('#coBody tr[data-i]').forEach(tr => {
            const i = +tr.dataset.i;
            $$('.cell', tr).forEach(cell => cell.addEventListener('input', () => {
                const f = cell.dataset.f;
                draft.cutoffs[i][f] = (f==='cutOffDateTime') ? U.localToIso(cell.value) : cell.value;
                setDirty(true);
            }));
            tr.querySelector('.row-del').addEventListener('click', () => { draft.cutoffs.splice(i,1); renderCutoffs(); setDirty(true); });
        });
    }
    function addCut() {
        draft.cutoffs.push({ cutOffId:'', voyageId:draft.voyage.voyageId, voyagePortId:'',
            cutOffType:'SI Closing', cutOffDateTime:null, status:'Open', remark:'' });
        renderCutoffs(); setDirty(true);
    }

    /* ---------------- derive POL/POD/ETD/ETA/Transit ---------------- */
    function derive() {
        const loads = draft.ports.filter(p => p.moveType === 'Load' && p.portId);
        const discs = draft.ports.filter(p => p.moveType === 'Discharge' && p.portId);
        const first = loads[0], last = discs[discs.length - 1];
        const v = draft.voyage;
        v.polPortId = first ? first.portId : '';
        v.podPortId = last  ? last.portId  : '';
        v.etd = first ? first.etd : null;
        v.eta = last  ? last.eta  : null;
        v.transitDays = U.daysBetween(v.etd, v.eta) ?? 0;

        const pol = S.portById(v.polPortId) || {}, pod = S.portById(v.podPortId) || {};
        $('#dPol').textContent = first ? `${pol.portCode||''} — ${pol.portName||''}` : '—';
        $('#dPod').textContent = last  ? `${pod.portCode||''} — ${pod.portName||''}` : '—';
        $('#dWhen').textContent = (v.etd && v.eta)
            ? `${U.fmtDateTime(v.etd)}  →  ${U.fmtDateTime(v.eta)}   ·   ${v.transitDays} days`
            : '—';
    }

    /* ---------------- actions ---------------- */
    function setDirty(f) { dirty = f; $('#dirtyFlag').style.display = f ? 'inline' : 'none'; }

    function genChildIds() {
        draft.ports.forEach((p, i) => {
            p.voyageId = draft.voyage.voyageId; p.sequenceNo = i + 1;
            if (!p.voyagePortId) p.voyagePortId = `${draft.voyage.voyageId}-P${i+1}`;
        });
        draft.cutoffs.forEach((c, i) => {
            c.voyageId = draft.voyage.voyageId;
            if (!c.cutOffId) c.cutOffId = `${draft.voyage.voyageId}-C${i+1}`;
        });
    }

    function save() {
        const v = draft.voyage;
        const errs = [];
        if (!v.carrierId)  errs.push('เลือก Carrier');
        if (!v.vesselId)   errs.push('เลือก Vessel');
        if (!v.voyageNo.trim()) errs.push('ระบุ Voyage No');
        if (!draft.ports.some(p => p.moveType==='Load' && p.portId))      errs.push('ต้องมี Load อย่างน้อย 1 ท่า');
        if (!draft.ports.some(p => p.moveType==='Discharge' && p.portId)) errs.push('ต้องมี Discharge อย่างน้อย 1 ท่า');
        if (errs.length) { toast('⚠ ' + errs[0]); return; }

        derive(); genChildIds();
        S.commit(draft);
        draft.isNew = false;
        setDirty(false);
        renderForm();
        renderList();
        toast('✓ บันทึก Voyage แล้ว');
    }
    function del() {
        if (draft.isNew) { draft = null; $('#formRoot').innerHTML = '<div class="empty-state">Deleted.</div>'; setDirty(false); renderList(); return; }
        if (!confirm(`ลบ voyage ${draft.voyage.voyageId} ?`)) return;
        S.remove(draft.voyage.voyageId);
        draft = null; setDirty(false);
        $('#formRoot').innerHTML = '<div class="empty-state">Voyage deleted. Select another or create New.</div>';
        renderList();
        toast('🗑 ลบแล้ว');
    }
    function copy() {
        const clone = JSON.parse(JSON.stringify(draft));
        clone.isNew = true;
        clone.voyage.voyageId = S.newVoyageId();
        clone.voyage.voyageNo = (clone.voyage.voyageNo || '') + '-COPY';
        clone.ports.forEach(p => { p.voyagePortId = ''; p.voyageId = clone.voyage.voyageId; });
        clone.cutoffs.forEach(c => { c.cutOffId = ''; c.voyageId = clone.voyage.voyageId; });
        startDraft(clone);
        setDirty(true);
        toast('📋 คัดลอกแล้ว — แก้ไขแล้ว Save');
    }
    function exportJson() {
        const blob = new Blob([S.exportData()], { type:'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'data.json'; a.click();
        URL.revokeObjectURL(a.href);
        toast('⬇ Exported data.json');
    }

    let toastT;
    function toast(msg) {
        const t = $('#toast'); $('#toastMsg').textContent = msg; t.style.display = 'block';
        clearTimeout(toastT); toastT = setTimeout(() => t.style.display = 'none', 1900);
    }

    document.addEventListener('DOMContentLoaded', boot);
    return { boot };
}());
