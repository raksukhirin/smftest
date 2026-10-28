/* vessel-app.js — Vessel Master (frmSFVessel v2). window.VSM
 * Based on frmSFVessel.frm (Vessel/Feeder + Call Sign) plus the new fields the
 * voyage/search model needs: IMO, Carrier, Vessel Type, Status.
 * Shares VSI.store (same localStorage 'sfVoyage.input.v1') so vessels added here
 * appear in the Voyage Entry dropdown and the Search screen.
 */
window.VSM = (function () {
    'use strict';
    const U = VSI.util, S = VSI.store;
    const { $, $$, escapeHtml } = U;

    let draft = null;     // { isNew?, ...vessel }
    let dirty = false;
    let filter = '';

    async function boot() {
        await S.load();
        $('#btnNew').onclick = () => { if (confirmLeave()) startDraft(blank()); };
        $('#btnExport').onclick = exportJson;
        const rb = $('#btnReset');
        if (rb) rb.onclick = () => {
            if (!confirm('คืนค่าข้อมูลตั้งต้น (seed)? การแก้ไขที่บันทึกไว้จะถูกล้าง')) return;
            S.resetSeed(); location.reload();
        };
        $('#vSearch').addEventListener('input', e => { filter = e.target.value.toLowerCase(); renderList(); });
        renderList();
    }

    function confirmLeave() { return !dirty || confirm('มีการแก้ไขที่ยังไม่บันทึก — ทิ้งหรือไม่?'); }

    /* ---------------- list ---------------- */
    function renderList() {
        const rows = S.vessels().filter(v => {
            if (!filter) return true;
            const ca = S.carrierById(v.carrierId) || {};
            return [v.vesselName, v.imoNo, ca.carrierCode, ca.carrierName].join(' ').toLowerCase().includes(filter);
        });
        $('#vCount').textContent = rows.length;
        const cur = draft && draft.vesselId;
        $('#vesselList').innerHTML = rows.map(v => {
            const ca = S.carrierById(v.carrierId) || {};
            const inactive = v.status === 'Inactive';
            return `<div class="vessel-card ${v.vesselId===cur?'active':''}" data-id="${escapeHtml(v.vesselId)}">
                <div class="vc-top"><strong>${escapeHtml(v.vesselName||'—')}</strong>
                    <span class="pill ${inactive?'pill-muted':'pill-ok'}">${escapeHtml(v.status||'Active')}</span></div>
                <small>${escapeHtml(v.vslType==='F'?'Feeder':'Vessel')} | ${escapeHtml(v.imoNo||'no IMO')} | ${escapeHtml(ca.carrierCode||'—')}</small>
                <div class="route">${escapeHtml(v.vesselType||'')}</div>
            </div>`;
        }).join('') || `<div class="list-empty">No vessel.</div>`;
        $$('#vesselList .vessel-card').forEach(c =>
            c.addEventListener('click', () => { if (confirmLeave()) startDraft(clone(S.vesselById(c.dataset.id))); }));
    }

    /* ---------------- form ---------------- */
    function blank() {
        return { isNew:true, vesselId:S.newVesselId(), vesselName:'', vslType:'V', callsign:'',
                 imoNo:'', carrierId:'', vesselType:'Container Ship', status:'Active' };
    }
    function clone(v) { return JSON.parse(JSON.stringify(v || {})); }

    function startDraft(d) { draft = d; setDirty(false); renderForm(); renderList(); }

    function renderForm() {
        const root = $('#formRoot');
        root.innerHTML = '';
        root.appendChild($('#tplForm').content.cloneNode(true));

        buildCarrierDatalist();   // Carrier (Owner) is a searchable typeahead

        ['vesselName','vslType','callsign','imoNo','vesselType','status']
            .forEach(f => { const el = $(`[data-h="${f}"]`); if (el) el.value = draft[f] ?? ''; });
        $('[data-h="carrierId"]').value = carrierLabel(draft.carrierId);   // show "CODE — Name"

        $('#fTitle').textContent = draft.isNew ? 'New Vessel' : (draft.vesselName || '(unnamed)');
        const m = $('#fMode'); m.textContent = draft.isNew ? 'NEW' : 'EDIT';
        m.className = 'pill ' + (draft.isNew ? 'pill-warn' : 'pill-info');
        $('#dId').textContent = draft.vesselId;
        updateUsed();

        $$('#formRoot [data-h]').forEach(el => {
            const h = () => {
                if (el.dataset.h === 'carrierId') draft.carrierId = resolveCarrierId(el.value);
                else                              draft[el.dataset.h] = el.value;
                if (el.dataset.h === 'vesselName') $('#fTitle').textContent = el.value || '(unnamed)';
                setDirty(true);
            };
            el.addEventListener('input', h); el.addEventListener('change', h);
        });
        $('#btnSave').onclick = save;
        $('#btnDelete').onclick = del;
        $('#btnCopy').onclick = copy;
    }

    // Carrier (Owner) typeahead helpers
    const carrierLabel = id => { const c = S.carrierById(id); return c ? `${c.carrierCode} — ${c.carrierName}` : ''; };
    function resolveCarrierId(text) {
        const t = (text || '').trim(); if (!t) return '';
        let c = S.carriers().find(x => `${x.carrierCode} — ${x.carrierName}` === t);
        if (!c) { const code = t.split('—')[0].trim().toUpperCase(); c = S.carriers().find(x => (x.carrierCode||'').toUpperCase() === code); }
        if (!c) { const lt = t.toLowerCase(); c = S.carriers().find(x => `${x.carrierCode} ${x.carrierName}`.toLowerCase().includes(lt)); }
        return c ? c.carrierId : '';
    }
    function buildCarrierDatalist() {
        const dl = $('#carrierDatalist'); if (!dl) return;
        dl.innerHTML = S.carriers().map(c => `<option value="${escapeHtml(c.carrierCode+' — '+c.carrierName)}">`).join('');
    }
    function updateUsed() {
        const used = !draft.isNew && S.vesselUsed(draft.vesselId);
        const el = $('#dUsed'); if (!el) return;
        el.textContent = draft.isNew ? '—' : (used ? 'Yes — ลบไม่ได้' : 'No');
        el.style.color = used ? '#b91c1c' : '#0c4a6e';
    }

    /* ---------------- actions ---------------- */
    function setDirty(f) { dirty = f; $('#dirtyFlag').style.display = f ? 'inline' : 'none'; }

    function save() {
        if (!draft.vesselName.trim()) { toast('⚠ ระบุ Vessel Name'); return; }
        // duplicate name + class (mirror SeekExistName in frmSFVessel)
        const dup = S.vessels().some(v => v.vesselId !== draft.vesselId
            && (v.vesselName||'').trim().toUpperCase() === draft.vesselName.trim().toUpperCase()
            && (v.vslType||'V') === draft.vslType);
        if (dup) { toast('⚠ ชื่อเรือนี้ (class เดียวกัน) มีอยู่แล้ว'); return; }

        const rec = clone(draft); delete rec.isNew;
        S.saveVessel(rec);
        draft.isNew = false;
        setDirty(false);
        renderForm(); renderList();
        toast('✓ บันทึก Vessel แล้ว');
    }
    function del() {
        if (draft.isNew) { draft = null; $('#formRoot').innerHTML = '<div class="empty-state">Discarded.</div>'; setDirty(false); renderList(); return; }
        if (S.vesselUsed(draft.vesselId)) { toast('⚠ เรือนี้ถูกใช้ใน voyage — ลบไม่ได้'); return; }
        if (!confirm(`ลบเรือ ${draft.vesselName} ?`)) return;
        S.removeVessel(draft.vesselId);
        draft = null; setDirty(false);
        $('#formRoot').innerHTML = '<div class="empty-state">Vessel deleted. Select another or create New.</div>';
        renderList();
        toast('🗑 ลบแล้ว');
    }
    function copy() {
        const c = clone(draft);
        c.isNew = true;
        c.vesselId = S.newVesselId();
        c.vesselName = (draft.vesselName || '') + ' (COPY)';
        startDraft(c);
        setDirty(true);
        const nm = $('[data-h="vesselName"]'); if (nm) { nm.focus(); nm.select(); }
        toast('📋 คัดลอกแล้ว — แก้ไขแล้ว Save');
    }

    function exportJson() {
        const blob = new Blob([S.exportData()], { type:'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'data.json'; a.click();
        URL.revokeObjectURL(a.href); toast('⬇ Exported data.json');
    }

    let tT;
    function toast(msg) { const t=$('#toast'); $('#toastMsg').textContent=msg; t.style.display='block'; clearTimeout(tT); tT=setTimeout(()=>t.style.display='none',1900); }

    document.addEventListener('DOMContentLoaded', boot);
    return { boot };
}());
