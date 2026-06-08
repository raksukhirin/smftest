/* Validation rules — port of `Sub ChkValidate` + `Sub ChkValidDetailCell`
 * (frm line 3575-3684 + 6874-6912) plus a few UX-driven extras documented in
 * validation-spec.md §6.
 *
 * `validate()` returns an array of error objects:
 *   { field?, gridKind?, gridIdx?, col?, loc, msg }
 * Header errors set `field`; grid errors set `gridKind` + `gridIdx` + `col`.
 * The returned list is rendered by `applyErrors()` (ui/errors.js).
 */

import { state } from './core/state.js';
import { msg } from './core/messages.js';
import { GRIDS } from './core/factories.js';
import { lookupSale, lookupApprover, lookupCustomer, lookupAgent } from './data/masters.js';

export function validate() {
    const q = state.quotations[state.currentIndex];
    const errors = [];
    if (!q) return errors;

    /* ----- ChkValidate (line 3575-3684) — port 1:1 ----- */

    // SALENO — required (frm: blnAllowBlank=False on save) + must lookup
    const saleNo = (q.SaleNo || '').trim();
    if (!saleNo) {
        errors.push({ field: 'SaleNo', loc: 'Sale Person', msg: msg('saleNoBlank') });
    } else if (!lookupSale(saleNo).ok) {
        errors.push({ field: 'SaleNo', loc: 'Sale Person', msg: msg('saleNoNotFound') });
    }

    // APPBYNO — optional, but if filled must lookup
    const appNo = (q.AppByNo || '').trim();
    if (appNo && !lookupApprover(appNo).ok) {
        errors.push({ field: 'AppByNo', loc: 'Approve By', msg: msg('appNoNotFound') });
    }

    // CUSTNO — frm optional, but per UX spec REQUIRED + must lookup
    const custNo = (q.CustNo || '').trim();
    if (!custNo) {
        errors.push({ field: 'CustNo', loc: 'Customer', msg: msg('custBlank') });
    } else if (!lookupCustomer(custNo).ok) {
        errors.push({ field: 'CustNo', loc: 'Customer', msg: msg('custNoNotFound') });
    }

    // AGENTNO — optional, but if filled must lookup
    const agentNo = (q.AgentNo || '').trim();
    if (agentNo && !lookupAgent(agentNo).ok) {
        errors.push({ field: 'AgentNo', loc: 'Agent', msg: msg('agentNoNotFound') });
    }

    /* ----- SaveData orchestration extras (line 3700-3854) ----- */

    if (!['IM', 'EX'].includes(q.DocClass)) {
        errors.push({ field: 'DocClass', loc: 'Class', msg: msg('classRequired') });
    }

    /* ----- Required additions per UX spec ----- */

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

    /* ----- Date / numeric sanity ----- */

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

    /* ----- ChkValidDetailCell (line 6874-6912) — Index 2/3/4 ExpDesc required.
     * EXPTYPE 2=LCL, 3=Shipping, 4=Transport — same rule, three grids. ----- */

    Object.values(GRIDS).forEach(cfg => {
        (q[cfg.arrayKey] || []).forEach((row, i) => {
            if (!(row.ExpDesc1 || '').trim()) {
                errors.push({
                    gridKind: cfg.kind, gridIdx: i, col: 'ExpDesc1',
                    loc: `${cfg.label} Row ${i + 1} · Description`, msg: msg('expDescBlank'),
                });
            }
        });
    });

    // FCL grid — frm has NO validation (line 6890 `Case 0, 1` is empty body).

    return errors;
}
