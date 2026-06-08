/* validation.js — Validation rules. Port of `Sub ChkValidate` + `Sub ChkValidDetailCell`.
 * Returns an array of error objects; rendered by SFQ.errors.applyErrors. */
window.SFQ = window.SFQ || {};
window.SFQ.validation = (function () {
    'use strict';
    const { state } = SFQ.state;
    const { msg }   = SFQ.messages;
    const { GRIDS } = SFQ.factories;
    const { lookupSale, lookupApprover, lookupCustomer, lookupAgent } = SFQ.masters;

    function validate() {
        const q = state.quotations[state.currentIndex];
        const errors = [];
        if (!q) return errors;

        const saleNo = (q.SaleNo || '').trim();
        if (!saleNo) {
            errors.push({ field: 'SaleNo', loc: 'Sale Person', msg: msg('saleNoBlank') });
        } else if (!lookupSale(saleNo).ok) {
            errors.push({ field: 'SaleNo', loc: 'Sale Person', msg: msg('saleNoNotFound') });
        }

        const appNo = (q.AppByNo || '').trim();
        if (appNo && !lookupApprover(appNo).ok) {
            errors.push({ field: 'AppByNo', loc: 'Approve By', msg: msg('appNoNotFound') });
        }

        const custNo = (q.CustNo || '').trim();
        if (!custNo) {
            errors.push({ field: 'CustNo', loc: 'Customer', msg: msg('custBlank') });
        } else if (!lookupCustomer(custNo).ok) {
            errors.push({ field: 'CustNo', loc: 'Customer', msg: msg('custNoNotFound') });
        }

        const agentNo = (q.AgentNo || '').trim();
        if (agentNo && !lookupAgent(agentNo).ok) {
            errors.push({ field: 'AgentNo', loc: 'Agent', msg: msg('agentNoNotFound') });
        }

        if (!['IM', 'EX'].includes(q.DocClass)) {
            errors.push({ field: 'DocClass', loc: 'Class', msg: msg('classRequired') });
        }

        if (!(q.DocNo || '').trim()) {
            errors.push({ field: 'DocNo', loc: 'Doc Number', msg: msg('docNoBlank') });
        } else {
            const dup = state.quotations.some((other, i) =>
                i !== state.currentIndex &&
                (other.DocNo || '').toLowerCase() === (q.DocNo || '').toLowerCase());
            if (dup) errors.push({ field: 'DocNo', loc: 'Doc Number', msg: msg('docNoDup') });
        }

        if (!(q.DocSubj || '').trim()) {
            errors.push({ field: 'DocSubj', loc: 'Subject', msg: msg('subjBlank') });
        }

        if (!(q.JobType || '').trim()) {
            errors.push({ field: 'JobType', loc: 'Job Type', msg: msg('jobTypeBlank') });
        }

        if (q.EffDate && q.ExpDate) {
            const eff = new Date(q.EffDate);
            const exp = new Date(q.ExpDate);
            if (!isNaN(eff) && !isNaN(exp) && eff > exp) {
                errors.push({ field: 'ExpDate', loc: 'Expiry Date', msg: msg('effGtExp') });
            }
        }

        if (q.CreditDays != null && q.CreditDays !== '' && Number(q.CreditDays) < 0) {
            errors.push({ field: 'CreditDays', loc: 'Credit Days', msg: msg('creditNeg') });
        }

        if (q.Email && q.Email.trim() && !/^\S+@\S+\.\S+$/.test(q.Email.trim())) {
            errors.push({ field: 'Email', loc: 'Email', msg: msg('emailBad') });
        }

        // ChkValidDetailCell — ExpDesc1 required for LCL/Shipping/Transport
        Object.values(GRIDS).forEach(cfg => {
            (q[cfg.arrayKey] || []).forEach((row, i) => {
                if (!(row.ExpDesc1 || '').trim()) {
                    errors.push({
                        gridKind: cfg.kind, gridIdx: i, col: 'ExpDesc1',
                        loc: `${cfg.label} Row ${i + 1} · Description`,
                        msg: msg('expDescBlank'),
                    });
                }
            });
        });
        // FCL grid — frm has NO validation (Case 0, 1 is empty body).

        return errors;
    }

    return { validate };
}());
