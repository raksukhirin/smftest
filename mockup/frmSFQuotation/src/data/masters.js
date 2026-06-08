/* Master-data loader + lookup/select helpers.
 *
 * Replaces frm `SeekEmpDesc` / `SeekSMBusinessName` with simple JSON masters
 * loaded from disk on every boot.  Customer + Employee masters live in
 * separate files (15K+ rows each) — too big for localStorage so they're not
 * persisted; the small `masters.agents` block stays inline in data.json.
 *
 * Public API:
 *   loadInitial()                      — boot entry: load state from localStorage
 *                                        or seed from data.json + load externals
 *   lookupCustomer(code, saleNoFilter) — { ok, record }
 *   lookupSale(code)                   — { ok, name }
 *   lookupApprover(code)               — { ok, name }
 *   lookupAgent(code)                  — { ok, record }
 *   selectCustomer(record)             — apply to current quotation (wipe-then-fill)
 *   selectAgent(record), selectSale(record), selectApprover(record)
 */

import { state, setState, persist, current, setDirty } from '../core/state.js';
import { blankQuotation } from '../core/factories.js';
import { paintHeaderForm } from '../ui/paint.js';

/* ---- Boot / load ---- */

export async function loadInitial() {
    const stored = localStorage.getItem('sf_quotation_v1');
    if (stored) {
        try {
            const s = JSON.parse(stored);
            if (s && Array.isArray(s.quotations) && s.quotations.length > 0) {
                setState({
                    quotations: s.quotations,
                    currentIndex: Math.min(s.currentIndex || 0, s.quotations.length - 1),
                    company: s.company,
                    masters: null,
                });
                if (!state.company) await fetchCompany();
                await loadExternalMasters();
                return;
            }
        } catch (_) { /* fall through to seed */ }
    }
    await seedFromJson();
    await loadExternalMasters();
}

async function seedFromJson() {
    try {
        const res = await fetch('data.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('data.json not reachable');
        const data = await res.json();
        setState({
            quotations: Array.isArray(data.quotations) ? data.quotations : [],
            currentIndex: 0,
            company: data.company || null,
            masters: data.masters || null,
        });
        persist();
    } catch (err) {
        console.warn('Could not load data.json — starting empty.', err);
        setState({ quotations: [blankQuotation('IM')], currentIndex: 0, company: null, masters: null });
        persist();
    }
}

async function fetchCompany() {
    try {
        const res = await fetch('data.json', { cache: 'no-store' });
        const data = await res.json();
        state.company = data.company;
        state.masters = data.masters;
        persist();
    } catch (_) { /* leave as null */ }
}

/**
 * Load external master files (full SMBUSINESS / SMEMPL / OPItem / OPPort extracts)
 * and merge into `state.masters`. Replaces the small inline masters that ship in
 * data.json. Field mapping keeps lookup helpers below unchanged.
 *
 * NOT persisted to localStorage — masters are re-fetched on every boot.
 */
export async function loadExternalMasters() {
    state.masters = state.masters || {};

    try {
        const r = await fetch('masters/customers.json', { cache: 'no-store' });
        if (r.ok) {
            const d = await r.json();
            const list = Array.isArray(d.customers) ? d.customers : [];
            state.masters.customers = list.map(c => ({
                CustNo:   c.CustNo,
                CustName: c.CustName,
                Address:  [c.Addr1, c.Addr2, c.Addr3, c.Addr4]
                              .map(s => (s || '').trim()).filter(Boolean).join('\n'),
                Contact:  c.Contact || c.Contact2 || '',
                Tel:      c.Tel || '',
                Fax:      c.Fax || '',
                Email:    c.Email || '',
                CrTerm:   Number(c.CrTermDays) || 0,
            }));
        }
    } catch (e) { console.warn('masters/customers.json load failed', e); }

    try {
        const r = await fetch('masters/employees.json', { cache: 'no-store' });
        if (r.ok) {
            const d = await r.json();
            const emps = Array.isArray(d.employees) ? d.employees : [];
            state.masters.salesPeople = emps.map(e => ({ SaleNo:  e.EmpCode, SaleName:  e.EmpName }));
            state.masters.approvers   = emps.map(e => ({ AppByNo: e.EmpCode, AppByName: e.EmpName }));
        }
    } catch (e) { console.warn('masters/employees.json load failed', e); }

    try {
        const r = await fetch('masters/items.json', { cache: 'no-store' });
        if (r.ok) {
            const d = await r.json();
            const items = Array.isArray(d.items) ? d.items : [];
            state.masters.items = items;
            state.masters.itemsByClass = {
                IM: items.filter(i => i.JobClass === 'IM'),
                EX: items.filter(i => i.JobClass === 'EX'),
            };
        }
    } catch (e) { console.warn('masters/items.json load failed', e); }

    try {
        const r = await fetch('masters/ports.json', { cache: 'no-store' });
        if (r.ok) {
            const d = await r.json();
            state.masters.ports = Array.isArray(d.ports) ? d.ports : [];
        }
    } catch (e) { console.warn('masters/ports.json load failed', e); }
}

/* ---- Lookup helpers (replace SeekEmpDesc / SeekSMBusinessName) ---- */

function masterList(name) { return state.masters?.[name] ?? []; }

/** Look up a sales person by code. Returns { ok, name }. */
export function lookupSale(code) {
    if (!code) return { ok: true, name: '' };
    const m = masterList('salesPeople').find(x => x.SaleNo.toLowerCase() === code.toLowerCase());
    return m ? { ok: true, name: m.SaleName } : { ok: false, name: '' };
}

export function lookupApprover(code) {
    if (!code) return { ok: true, name: '' };
    const m = masterList('approvers').find(x => x.AppByNo.toLowerCase() === code.toLowerCase());
    return m ? { ok: true, name: m.AppByName } : { ok: false, name: '' };
}

/** Customer lookup. `saleNoFilter` mirrors frm `LOCK_CUSTBYSALE`/`{SALECO}` rules
 *  but is informational only here. */
export function lookupCustomer(code, _saleNoFilter) {
    if (!code) return { ok: true, record: null };
    const m = masterList('customers').find(x => x.CustNo.toLowerCase() === code.toLowerCase());
    if (!m) return { ok: false, record: null };
    return { ok: true, record: m };
}

export function lookupAgent(code) {
    if (!code) return { ok: true, record: null };
    const m = masterList('agents').find(x => x.AgentNo.toLowerCase() === code.toLowerCase());
    return m ? { ok: true, record: m } : { ok: false, record: null };
}

/* ---- Side-effects: when a lookup succeeds, fill blank dependent fields ---- */

/** Per ChkValidate — only fill blank fields. */
export function applyCustomerSideEffects(custRecord) {
    const q = current(); if (!q || !custRecord) return;
    if (!q.CustName?.trim()) q.CustName = custRecord.CustName;
    if (!q.CustDesc?.trim()) q.CustDesc = custRecord.Address || '';
    if (!q.CtcName?.trim())  q.CtcName  = custRecord.Contact || '';
    if (!q.Tel?.trim())      q.Tel      = custRecord.Tel || '';
    if (!q.Fax?.trim())      q.Fax      = custRecord.Fax || '';
    if (!q.Email?.trim())    q.Email    = custRecord.Email || '';
    if (!q.CreditDays || q.CreditDays === 0) q.CreditDays = custRecord.CrTerm || 0;
}

export function applyAgentSideEffects(agentRecord) {
    const q = current(); if (!q || !agentRecord) return;
    if (!q.AgentName?.trim()) q.AgentName = agentRecord.AgentName;
    if (!q.AgentDesc?.trim()) q.AgentDesc = agentRecord.Address || '';
}

/* ---- Selection helpers (shared by lookup-button and smart-suggest) ---- */

/** Apply a customer record to the current quotation (wipe-then-fill on new pick). */
export function selectCustomer(record) {
    const q = current(); if (!q || !record) return;
    const isNew = (q.CustNo || '').trim().toLowerCase() !== (record.CustNo || '').toLowerCase();
    q.CustNo = record.CustNo;
    if (isNew) {
        q.CustName = ''; q.CustDesc = ''; q.CtcName = '';
        q.Tel = ''; q.Fax = ''; q.Email = ''; q.CreditDays = 0;
    }
    applyCustomerSideEffects(record);
    paintHeaderForm();
    setDirty(true);
}

export function selectAgent(record) {
    const q = current(); if (!q || !record) return;
    const isNew = (q.AgentNo || '').trim().toLowerCase() !== (record.AgentNo || '').toLowerCase();
    q.AgentNo = record.AgentNo;
    if (isNew) { q.AgentName = ''; q.AgentDesc = ''; }
    applyAgentSideEffects(record);
    paintHeaderForm();
    setDirty(true);
}

export function selectSale(record) {
    const q = current(); if (!q || !record) return;
    q.SaleNo   = record.SaleNo;
    q.SaleName = record.SaleName;
    paintHeaderForm();
    setDirty(true);
}

export function selectApprover(record) {
    const q = current(); if (!q || !record) return;
    q.AppByNo   = record.AppByNo;
    q.AppByName = record.AppByName;
    paintHeaderForm();
    setDirty(true);
}
