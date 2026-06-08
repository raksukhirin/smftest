/* core/messages.js — Bilingual validation messages.
 * Port of `SysCode(thai, eng)` from the VB6 form. Default locale = 'en'. */
window.SFQ = window.SFQ || {};
window.SFQ.messages = (function () {
    'use strict';

    const MSG = {
        saleNoBlank:     { th: 'รหัสพนักงานขายห้ามว่าง',  en: 'Sale Number cannot be blank' },
        saleNoNotFound:  { th: 'ไม่พบรหัสพนักงาน',        en: 'Sale Number not found' },
        appNoNotFound:   { th: 'ไม่พบรหัสผู้อนุมัติ',     en: 'Approval Person Code not found' },
        custNoNotFound:  { th: 'ไม่พบรหัส Customer',      en: 'Customer Number not found' },
        agentNoNotFound: { th: 'ไม่พบรหัส Agent',         en: 'Agent Number not found' },
        expDescBlank:    { th: 'ข้อธิบายรายการห้ามว่าง',   en: 'Description cannot be blank' },
        classRequired:   { th: 'กรุณาเลือกประเภทงาน',      en: 'Job Class is invalid. Cannot save' },
        optimisticLock:  { th: 'ข้อมูลถูกแก้โดยผู้ใช้อื่น', en: 'Record was modified by another user. Reloading…' },
        docNoBlank:      { th: 'เลขที่เอกสารห้ามว่าง',     en: 'Doc Number cannot be blank' },
        docNoDup:        { th: 'เลขที่เอกสารซ้ำกับฉบับที่มีอยู่', en: 'Doc Number already exists' },
        subjBlank:       { th: 'หัวข้อ Quotation ห้ามว่าง', en: 'Subject cannot be blank' },
        custBlank:       { th: 'ต้องระบุรหัสลูกค้า',       en: 'Customer is required' },
        jobTypeBlank:    { th: 'ต้องเลือก Job Type',       en: 'Job Type is required' },
        effGtExp:        { th: 'วันมีผลต้อง ≤ วันหมดอายุ',  en: 'Effective Date must be on or before Expiry Date' },
        creditNeg:       { th: 'Credit Days ต้อง ≥ 0',     en: 'Credit Days must be ≥ 0' },
        emailBad:        { th: 'รูปแบบ Email ไม่ถูกต้อง',   en: 'Invalid email format' },
    };

    let locale = 'en';

    function setLocale(loc) {
        if (loc === 'th' || loc === 'en') locale = loc;
    }

    function msg(key) {
        const m = MSG[key];
        if (!m) return key;
        return m[locale] || m.en;
    }

    return { MSG, setLocale, msg };
}());
