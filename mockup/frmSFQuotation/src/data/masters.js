/* data/masters.js — Master-data loader + lookup/select helpers.
 *
 * Replaces frm `SeekEmpDesc` / `SeekSMBusinessName` with JSON master extracts.
 *
 * In IIFE mode, masters are inlined as `window.SFQ_MASTERS_RAW.*` from
 * masters/*.js files loaded before this script. Seed comes from
 * `window.SFQ_SEED` (data.js) — falls back to fetch('data.json') if absent.
 */
window.SFQ = window.SFQ || {};
window.SFQ.masters = (function () {
    'use strict';
    const { state, setState, persist, current, setDirty } = SFQ.state;
    const { blankQuotation } = SFQ.factories;

    /* ---- Boot / load ---- */

    async function loadInitial() {
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
                    loadExternalMasters();
                    return;
                }
            } catch (_) { /* fall through to seed */ }
        }
        await seedFromJson();
        loadExternalMasters();
    }

    async function seedFromJson() {
        try {
            let data = window.SFQ_SEED;
            if (!data) {
                const res = await fetch('data.json', { cache: 'no-store' });
                if (!res.ok) throw new Error('data.json not reachable');
                data = await res.json();
            }
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
            let data = window.SFQ_SEED;
            if (!data) {
                const res = await fetch('data.json', { cache: 'no-store' });
                data = await res.json();
            }
            state.company = data.company;
            state.masters = data.masters;
            persist();
        } catch (_) { /* leave as null */ }
    }

    /** Load external master extracts (full SMBUSINESS / SMEMPL / OPItem / OPPort).
     *  In IIFE mode, masters come from window.SFQ_MASTERS_RAW (set by masters/*.js).
     *  NOT persisted to localStorage — re-loaded on every boot. */
    function loadExternalMasters() {
        state.masters = state.masters || {};
        const raw = window.SFQ_MASTERS_RAW || {};

        if (raw.customers) {
            const list = Array.isArray(raw.customers.customers) ? raw.customers.customers : [];
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

        if (raw.employees) {
            const emps = Array.isArray(raw.employees.employees) ? raw.employees.employees : [];
            state.masters.salesPeople = emps.map(e => ({ SaleNo:  e.EmpCode, SaleName:  e.EmpName }));
            state.masters.approvers   = emps.map(e => ({ AppByNo: e.EmpCode, AppByName: e.EmpName }));
        }

        if (raw.items) {
            const items = Array.isArray(raw.items.items) ? raw.items.items : [];
            state.masters.items = items;
            state.masters.itemsByClass = {
                IM: items.filter(i => i.JobClass === 'IM'),
                EX: items.filter(i => i.JobClass === 'EX'),
            };
        }

        if (raw.ports) {
            state.masters.ports = Array.isArray(raw.ports.ports) ? raw.ports.ports : [];
        }
    }

    /* ---- Lookup helpers ---- */

    function masterList(name) { return state.masters?.[name] ?? []; }

    function lookupSale(code) {
        if (!code) return { ok: true, name: '' };
        const m = masterList('salesPeople').find(x => x.SaleNo.toLowerCase() === code.toLowerCase());
        return m ? { ok: true, name: m.SaleName } : { ok: false, name: '' };
    }

    function lookupApprover(code) {
        if (!code) return { ok: true, name: '' };
        const m = masterList('approvers').find(x => x.AppByNo.toLowerCase() === code.toLowerCase());
        return m ? { ok: true, name: m.AppByName } : { ok: false, name: '' };
    }

    function lookupCustomer(code, _saleNoFilter) {
        if (!code) return { ok: true, record: null };
        const m = masterList('customers').find(x => x.CustNo.toLowerCase() === code.toLowerCase());
        if (!m) return { ok: false, record: null };
        return { ok: true, record: m };
    }

    function lookupAgent(code) {
        if (!code) return { ok: true, record: null };
        const m = masterList('agents').find(x => x.AgentNo.toLowerCase() === code.toLowerCase());
        return m ? { ok: true, record: m } : { ok: false, record: null };
    }

    /* ---- Side-effects: fill blank dependent fields ---- */

    function applyCustomerSideEffects(custRecord) {
        const q = current(); if (!q || !custRecord) return;
        if (!q.CustName?.trim()) q.CustName = custRecord.CustName;
        if (!q.CustDesc?.trim()) q.CustDesc = custRecord.Address || '';
        if (!q.CtcName?.trim())  q.CtcName  = custRecord.Contact || '';
        if (!q.Tel?.trim())      q.Tel      = custRecord.Tel || '';
        if (!q.Fax?.trim())      q.Fax      = custRecord.Fax || '';
        if (!q.Email?.trim())    q.Email    = custRecord.Email || '';
        if (!q.CreditDays || q.CreditDays === 0) q.CreditDays = custRecord.CrTerm || 0;
    }

    function applyAgentSideEffects(agentRecord) {
        const q = current(); if (!q || !agentRecord) return;
        if (!q.AgentName?.trim()) q.AgentName = agentRecord.AgentName;
        if (!q.AgentDesc?.trim()) q.AgentDesc = agentRecord.Address || '';
    }

    /* ---- Selection helpers ---- */

    function selectCustomer(record) {
        const q = current(); if (!q || !record) return;
        const isNew = (q.CustNo || '').trim().toLowerCase() !== (record.CustNo || '').toLowerCase();
        q.CustNo = record.CustNo;
        if (isNew) {
            q.CustName = ''; q.CustDesc = ''; q.CtcName = '';
            q.Tel = ''; q.Fax = ''; q.Email = ''; q.CreditDays = 0;
        }
        applyCustomerSideEffects(record);
        SFQ.paint.paintHeaderForm();
        setDirty(true);
    }

    function selectAgent(record) {
        const q = current(); if (!q || !record) return;
        const isNew = (q.AgentNo || '').trim().toLowerCase() !== (record.AgentNo || '').toLowerCase();
        q.AgentNo = record.AgentNo;
        if (isNew) { q.AgentName = ''; q.AgentDesc = ''; }
        applyAgentSideEffects(record);
        SFQ.paint.paintHeaderForm();
        setDirty(true);
    }

    function selectSale(record) {
        const q = current(); if (!q || !record) return;
        q.SaleNo   = record.SaleNo;
        q.SaleName = record.SaleName;
        SFQ.paint.paintHeaderForm();
        setDirty(true);
    }

    function selectApprover(record) {
        const q = current(); if (!q || !record) return;
        q.AppByNo   = record.AppByNo;
        q.AppByName = record.AppByName;
        SFQ.paint.paintHeaderForm();
        setDirty(true);
    }

    return {
        loadInitial, loadExternalMasters,
        lookupSale, lookupApprover, lookupCustomer, lookupAgent,
        selectCustomer, selectAgent, selectSale, selectApprover,
        applyCustomerSideEffects, applyAgentSideEffects,
    };
}());
