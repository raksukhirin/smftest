/* Bilingual validation messages — port of `SysCode(thai, eng)` from frm.
 * Default locale = 'en'. Switch via `setLocale('th')`. */

export const MSG = {
    // ChkValidate (frm line 3575-3684)
    saleNoBlank:     { th: 'รหัสพนักงานขายห้ามว่าง',  en: 'Sale Number cannot be blank' },
    saleNoNotFound:  { th: 'ไม่พบรหัสพนักงาน',        en: 'Sale Number not found' },
    appNoNotFound:   { th: 'ไม่พบรหัสผู้อนุมัติ',     en: 'Approval Person Code not found' },
    custNoNotFound:  { th: 'ไม่พบรหัส Customer',      en: 'Customer Number not found' },
    agentNoNotFound: { th: 'ไม่พบรหัส Agent',         en: 'Agent Number not found' },

    // ChkValidDetailCell (frm line 6874-6912)
    expDescBlank:    { th: 'ข้อธิบายรายการห้ามว่าง',   en: 'Description cannot be blank' },

    // SaveData orchestration (frm line 3700-3854)
    classRequired:   { th: 'กรุณาเลือกประเภทงาน',      en: 'Job Class is invalid. Cannot save' },
    optimisticLock:  { th: 'ข้อมูลถูกแก้โดยผู้ใช้อื่น', en: 'Record was modified by another user. Reloading…' },

    // Required fields beyond frm (per UX spec)
    docNoBlank:      { th: 'เลขที่เอกสารห้ามว่าง',     en: 'Doc Number cannot be blank' },
    docNoDup:        { th: 'เลขที่เอกสารซ้ำกับฉบับที่มีอยู่', en: 'Doc Number already exists' },
    subjBlank:       { th: 'หัวข้อ Quotation ห้ามว่าง', en: 'Subject cannot be blank' },
    custBlank:       { th: 'ต้องระบุรหัสลูกค้า',       en: 'Customer is required' },
    jobTypeBlank:    { th: 'ต้องเลือก Job Type',       en: 'Job Type is required' },

    // Date / numeric sanity
    effGtExp:        { th: 'วันมีผลต้อง ≤ วันหมดอายุ',  en: 'Effective Date must be on or before Expiry Date' },
    creditNeg:       { th: 'Credit Days ต้อง ≥ 0',     en: 'Credit Days must be ≥ 0' },
    emailBad:        { th: 'รูปแบบ Email ไม่ถูกต้อง',   en: 'Invalid email format' },
};

let locale = 'en';

export function setLocale(loc) {
    if (loc === 'th' || loc === 'en') locale = loc;
}

export function msg(key) {
    const m = MSG[key];
    if (!m) return key;
    return m[locale] || m.en;
}
