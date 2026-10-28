/* port-app.js — Port Master, instanced as PortType='SF'. window.VSP
 * Based on frmOPPort.frm (which is itself an instanced form: SF / AF / TS).
 * Edits the shared store's ports[] (= OPPORT where PORTTYPE='SF'), keeping the
 * keys the voyage/search screens rely on (portId / portCode / portName).
 * AF/TS-only fields (Airport Name, Warehouse) are omitted from this SF instance.
 */
window.VSP = (function () {
    'use strict';
    const U = VSI.util, S = VSI.store;
    const { $, $$, escapeHtml } = U;

    const FIELDS = ['portCode','portName','countryCode','country','timezone','status'];
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
        const rows = S.ports().filter(p => {
            if (!filter) return true;
            return [p.portCode, p.portName, p.country, p.countryCode].join(' ').toLowerCase().includes(filter);
        });
        $('#vCount').textContent = rows.length;
        const cur = draft && draft.portId;
        $('#portList').innerHTML = rows.map(p => {
            const inactive = p.status === 'Inactive';
            return `<div class="vessel-card ${p.portId===cur?'active':''}" data-id="${escapeHtml(p.portId)}">
                <div class="vc-top"><strong class="mono">${escapeHtml(p.portCode||'—')}</strong>
                    <span class="pill ${inactive?'pill-muted':'pill-ok'}">${escapeHtml(p.status||'Active')}</span></div>
                <small>${escapeHtml(p.portName||'')}</small>
                <div class="route">${escapeHtml(p.countryCode||'')} ${escapeHtml(p.country?('· '+p.country):'')}</div>
            </div>`;
        }).join('') || `<div class="list-empty">No port.</div>`;
        $$('#portList .vessel-card').forEach(el =>
            el.addEventListener('click', () => { if (confirmLeave()) startDraft(clone(S.portById(el.dataset.id))); }));
    }

    /* ---------------- form ---------------- */
    function blank() {
        return { isNew:true, portId:S.newPortId(), portCode:'', portName:'',
                 countryCode:'', country:'', timezone:'', status:'Active' };
    }
    const clone = o => JSON.parse(JSON.stringify(o || {}));

    function startDraft(d) { draft = d; if (!draft.status) draft.status = 'Active'; setDirty(false); renderForm(); renderList(); }

    function renderForm() {
        const root = $('#formRoot');
        root.innerHTML = '';
        root.appendChild($('#tplForm').content.cloneNode(true));

        FIELDS.forEach(f => { const el = $(`[data-h="${f}"]`); if (el) el.value = draft[f] ?? ''; });
        $('#fTitle').textContent = draft.isNew ? 'New Port' : (draft.portCode || '(no code)');
        const m = $('#fMode'); m.textContent = draft.isNew ? 'NEW' : 'EDIT';
        m.className = 'pill ' + (draft.isNew ? 'pill-warn' : 'pill-info');
        $('#dId').textContent = draft.portId;
        updateUsed();

        $$('#formRoot [data-h]').forEach(el => {
            const h = () => {
                let v = el.value;
                if (el.dataset.h === 'portCode' || el.dataset.h === 'countryCode') v = v.toUpperCase();
                draft[el.dataset.h] = v;
                if (el.dataset.h === 'portCode') $('#fTitle').textContent = v || '(no code)';
                setDirty(true);
            };
            el.addEventListener('input', h); el.addEventListener('change', h);
        });
        $('#btnSave').onclick = save;
        $('#btnDelete').onclick = del;
        $('#btnCopy').onclick = copy;
    }
    function updateUsed() {
        const el = $('#dUsed'); if (!el) return;
        const used = !draft.isNew && S.portUsed(draft.portId);
        el.textContent = draft.isNew ? '—' : (used ? 'Yes — ลบไม่ได้' : 'No');
        el.style.color = used ? '#b91c1c' : '#0c4a6e';
    }

    /* ---------------- actions ---------------- */
    function setDirty(f) { dirty = f; $('#dirtyFlag').style.display = f ? 'inline' : 'none'; }

    function save() {
        if (!draft.portCode.trim()) { toast('⚠ ระบุ Port Code'); return; }
        if (!draft.portName.trim()) { toast('⚠ ระบุ Port Name'); return; }
        // duplicate PortCode within SF (mirror SeekExistName per PortType)
        const dup = S.ports().some(p => p.portId !== draft.portId
            && (p.portCode||'').trim().toUpperCase() === draft.portCode.trim().toUpperCase());
        if (dup) { toast('⚠ Port Code นี้มีอยู่แล้ว (PortType SF)'); return; }
        const rec = clone(draft); delete rec.isNew;
        S.savePort(rec);
        draft.isNew = false; setDirty(false);
        renderForm(); renderList();
        toast('✓ บันทึก Port แล้ว');
    }
    function del() {
        if (draft.isNew) { draft = null; $('#formRoot').innerHTML = '<div class="empty-state">Discarded.</div>'; setDirty(false); renderList(); return; }
        if (S.portUsed(draft.portId)) { toast('⚠ port ถูกใช้ใน voyage — ลบไม่ได้'); return; }
        if (!confirm(`ลบ port ${draft.portCode} ?`)) return;
        S.removePort(draft.portId);
        draft = null; setDirty(false);
        $('#formRoot').innerHTML = '<div class="empty-state">Port deleted. Select another or create New.</div>';
        renderList(); toast('🗑 ลบแล้ว');
    }
    function copy() {
        const c = clone(draft); c.isNew = true;
        c.portId = S.newPortId();
        c.portCode = (draft.portCode || '') + '2';
        startDraft(c); setDirty(true);
        const el = $('[data-h="portCode"]'); if (el) { el.focus(); el.select(); }
        toast('📋 คัดลอกแล้ว — แก้ Port Code แล้ว Save');
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
