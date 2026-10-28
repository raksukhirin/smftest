/* business-app.js — Business File, instanced as Carrier Master. window.VSB
 * Based on frmSMBusiness.frm but locked to VENDCLASS='SEALINE' (carriers).
 * Edits the shared store's carriers[] (= SMBUSINESS where VENDCLASS='SEALINE'),
 * keeping the keys voyage/vessel screens rely on (carrierCode / carrierName /
 * scacCode) while adding the wider business-file fields.
 */
window.VSB = (function () {
    'use strict';
    const U = VSI.util, S = VSI.store;
    const { $, $$, escapeHtml } = U;

    // form field (data-h) -> carrier record key (rest map 1:1)
    const ALIAS = { comName: 'carrierName', linerCode: 'carrierCode', scac: 'scacCode' };
    const key = f => ALIAS[f] || f;
    const FIELDS = ['comName','comNameLatin','vendClass','linerCode','scac','shortCode',
                    'ediCode','busGrp','status','address1','country','post','taxId',
                    'contact','tel','fax','email','website','notes'];

    let draft = null, dirty = false, filter = '';

    async function boot() {
        await S.load();
        $('#btnNew').onclick = () => { if (confirmLeave()) startDraft(blank()); };
        $('#btnExport').onclick = exportJson;
        const rb = $('#btnReset');
        if (rb) rb.onclick = () => { if (confirm('คืนค่าข้อมูลตั้งต้น (seed)?')) { S.resetSeed(); location.reload(); } };
        $('#vSearch').addEventListener('input', e => { filter = e.target.value.toLowerCase(); renderList(); });
        renderList();
    }
    function confirmLeave() { return !dirty || confirm('มีการแก้ไขที่ยังไม่บันทึก — ทิ้งหรือไม่?'); }

    /* ---------------- list ---------------- */
    function renderList() {
        const rows = S.carriers().filter(c => {
            if (!filter) return true;
            return [c.carrierName, c.carrierCode, c.scacCode].join(' ').toLowerCase().includes(filter);
        });
        $('#vCount').textContent = rows.length;
        const cur = draft && draft.carrierId;
        $('#bizList').innerHTML = rows.map(c => {
            const inactive = c.status === 'Inactive';
            return `<div class="vessel-card ${c.carrierId===cur?'active':''}" data-id="${escapeHtml(c.carrierId)}">
                <div class="vc-top"><strong>${escapeHtml(c.carrierName||'—')}</strong>
                    <span class="pill ${inactive?'pill-muted':'pill-ok'}">${escapeHtml(c.status||'Active')}</span></div>
                <small>Liner: ${escapeHtml(c.carrierCode||'—')} | SCAC: ${escapeHtml(c.scacCode||'—')}</small>
                <div class="route">SEALINE</div>
            </div>`;
        }).join('') || `<div class="list-empty">No carrier.</div>`;
        $$('#bizList .vessel-card').forEach(el =>
            el.addEventListener('click', () => { if (confirmLeave()) startDraft(clone(S.carrierById(el.dataset.id))); }));
    }

    /* ---------------- form ---------------- */
    function blank() {
        return { isNew:true, carrierId:S.newCarrierId(), carrierCode:'', carrierName:'', scacCode:'',
                 status:'Active', vendClass:'SEALINE', comNameLatin:'', shortCode:'', ediCode:'',
                 busGrp:'', address1:'', country:'', post:'', taxId:'', contact:'', tel:'', fax:'',
                 email:'', website:'', notes:'' };
    }
    const clone = o => JSON.parse(JSON.stringify(o || {}));

    function startDraft(d) { draft = d; if (!draft.vendClass) draft.vendClass = 'SEALINE'; setDirty(false); renderForm(); renderList(); }

    function renderForm() {
        const root = $('#formRoot');
        root.innerHTML = '';
        root.appendChild($('#tplForm').content.cloneNode(true));

        FIELDS.forEach(f => { const el = $(`[data-h="${f}"]`); if (el) el.value = (f==='vendClass') ? 'SEALINE' : (draft[key(f)] ?? ''); });

        $('#fTitle').textContent = draft.isNew ? 'New Carrier' : (draft.carrierName || '(unnamed)');
        const m = $('#fMode'); m.textContent = draft.isNew ? 'NEW' : 'EDIT';
        m.className = 'pill ' + (draft.isNew ? 'pill-warn' : 'pill-info');
        $('#dId').textContent = draft.carrierId;
        updateUsed();

        $$('#formRoot [data-h]').forEach(el => {
            if (el.readOnly) return;
            const h = () => {
                draft[key(el.dataset.h)] = el.value;
                if (el.dataset.h === 'comName') $('#fTitle').textContent = el.value || '(unnamed)';
                setDirty(true);
            };
            el.addEventListener('input', h); el.addEventListener('change', h);
        });
        $('#btnSave').onclick = save;
        $('#btnDelete').onclick = del;
        $('#btnCopy').onclick = copy;
    }

    function updateUsed() {
        const el = $('#usedHint'); if (!el) return;
        if (draft.isNew) { el.textContent = ''; return; }
        const used = S.carrierUsed(draft.carrierId);
        el.textContent = used ? '⚠ carrier นี้ถูกใช้โดย vessel/voyage — ลบไม่ได้' : 'ยังไม่ถูกอ้างอิง — ลบได้';
        el.style.color = used ? '#b91c1c' : '#64748b';
    }

    /* ---------------- actions ---------------- */
    function setDirty(f) { dirty = f; $('#dirtyFlag').style.display = f ? 'inline' : 'none'; }

    function save() {
        if (!draft.carrierName.trim()) { toast('⚠ ระบุ Name'); return; }
        const dup = S.carriers().some(c => c.carrierId !== draft.carrierId
            && (c.carrierName||'').trim().toUpperCase() === draft.carrierName.trim().toUpperCase());
        if (dup) { toast('⚠ ชื่อ carrier นี้มีอยู่แล้ว'); return; }
        draft.vendClass = 'SEALINE';
        const rec = clone(draft); delete rec.isNew;
        S.saveCarrier(rec);
        draft.isNew = false; setDirty(false);
        renderForm(); renderList();
        toast('✓ บันทึก Carrier แล้ว');
    }
    function del() {
        if (draft.isNew) { draft = null; $('#formRoot').innerHTML = '<div class="empty-state">Discarded.</div>'; setDirty(false); renderList(); return; }
        if (S.carrierUsed(draft.carrierId)) { toast('⚠ carrier ถูกใช้โดย vessel/voyage — ลบไม่ได้'); return; }
        if (!confirm(`ลบ carrier ${draft.carrierName} ?`)) return;
        S.removeCarrier(draft.carrierId);
        draft = null; setDirty(false);
        $('#formRoot').innerHTML = '<div class="empty-state">Carrier deleted. Select another or create New.</div>';
        renderList(); toast('🗑 ลบแล้ว');
    }
    function copy() {
        const c = clone(draft); c.isNew = true;
        c.carrierId = S.newCarrierId();
        c.carrierName = (draft.carrierName || '') + ' (COPY)';
        startDraft(c); setDirty(true);
        const nm = $('[data-h="comName"]'); if (nm) { nm.focus(); nm.select(); }
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
