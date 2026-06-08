/* Blank-record factories (new quotation, FCL row, detail row) and the GRIDS
 * config that drives the 3 LCL-style detail grids. */

import { state } from './state.js';

/** Make a fresh blank quotation (used by + New / fallback when data.json fails). */
export function blankQuotation(docClass = 'IM') {
    const now = new Date();
    const yymm = now.toISOString().slice(2, 7).replace('-', '');
    const seq  = String(state.quotations.length + 1).padStart(4, '0');
    const docNo = `QS${docClass === 'IM' ? 'I' : 'E'}${yymm}${seq}`;
    const expDate = new Date(now);
    expDate.setMonth(expDate.getMonth() + 1);
    return {
        DocNo: docNo,
        DocClass: docClass,
        DocType: 'Q',
        JobType: 'FREIGHT',
        DocStat: 'Open',
        DocDate: now.toISOString().slice(0, 10),
        RefNo: '',
        RevNo: 0,
        lock: now.getTime(),
        EffDate: now.toISOString().slice(0, 10),
        ExpDate: expDate.toISOString().slice(0, 10),
        CreditDays: 30,
        CustNo: '', CustName: '', CustDesc: '',
        CtcName: '', Tel: '', Fax: '', Email: '',
        FromName: '', Incoterm: 'FOB',
        DocSubj: '',
        SubjDesc: '', SubjDesc2: '', SubjDesc3: '', SubjDesc4: '',
        DocDesc: '', DocDesc2: '', DocDesc3: '', DocDesc4: '',
        AgentNo: '', AgentName: '', AgentDesc: '',
        SaleNo: '', SaleName: '',
        IssueBy: 'PHUPOOM_MK', UserGroup: 'SALE',
        AppByNo: '', AppByName: '',
        AppDate: null, AppBy: null,
        TotCredit: 0, IsCreditApp: false,
        CreditAppDate: null, CreditAppBy: null,
        freightRates: [],
        localCharges: [],
        shippingCharges: [],
        transportCharges: [],
        EditBy: 'PHUPOOM_MK',
        EditDate: now.toISOString().slice(0, 19).replace('T', ' '),
        _isNew: true,
    };
}

/** Blank SFQRATE row — VARCHAR rate fields stay as empty strings (so 'FREE'/'20-24' parse). */
export function blankFcl() {
    return {
        DETID: 'fcl-' + Math.random().toString(36).slice(2, 10),
        SeqNo: 0,
        // Port info
        LoadPort: '', LoadPortCode: '',
        DisPort: '', TranPort: '',
        FinalPort: '', FinalPortCode: '',
        RecPort: '',
        // Item info
        ExpCode: '', ExpDesc: '',
        ItemCurr: '', Uom: '',
        // Rates (VARCHAR in SFQRATE — text values like "FREE" or "20-24" are valid)
        XPrice: '', XLcl: '',
        XCtnType: '', XCtn20: '', XCtn40: '', XCtn40HC: '', XCtn45: '',
        // Schedule
        Dept: '', Arrv: '', Transit: '', Etd: '',
        // Misc (carried but not in visible grid)
        LinerNo: '', LinerName: '',
        AgentNo: '', AgentName: '',
        Remark: '', RateId: '',
    };
}

/* ---- Detail-grid configuration (LCL/Shipping/Transport share AFQDETAIL columns).
 * EXPTYPE 2 = LCL, 3 = Shipping, 4 = Transport. ---- */
export const GRIDS = {
    lcl: {
        kind: 'lcl', arrayKey: 'localCharges',
        tbodyId: 'lclTbody', totalId: 'lclTotal',
        addBtnId: 'addLclBtn', clearBtnId: 'clearLclBtn',
        label: 'LCL', detidPrefix: 'lcl-',
        clearTitle: 'Clear all charges?',
        addedToast: 'Charge added',
        clearedToast: 'All charges removed',
    },
    shipping: {
        kind: 'shipping', arrayKey: 'shippingCharges',
        tbodyId: 'shippingTbody', totalId: 'shippingTotal',
        addBtnId: 'addShippingBtn', clearBtnId: 'clearShippingBtn',
        label: 'Shipping', detidPrefix: 'shp-',
        clearTitle: 'Clear all shipping charges?',
        addedToast: 'Shipping charge added',
        clearedToast: 'All shipping charges removed',
    },
    transport: {
        kind: 'transport', arrayKey: 'transportCharges',
        tbodyId: 'transportTbody', totalId: 'transportTotal',
        addBtnId: 'addTransportBtn', clearBtnId: 'clearTransportBtn',
        label: 'Transport', detidPrefix: 'trp-',
        clearTitle: 'Clear all transport charges?',
        addedToast: 'Transport charge added',
        clearedToast: 'All transport charges removed',
    },
};

export function gridByKind(kind) { return GRIDS[kind] || null; }

/** Blank detail row (LCL / Shipping / Transport — same shape, different DETID prefix). */
export function blankDetail(cfg) {
    return {
        DETID: cfg.detidPrefix + Math.random().toString(36).slice(2, 10),
        SeqNo: 0,
        ExpCode: '', ExpDesc1: '', ExpDesc2: '',
        PcType: 'CC',
        ItemCurr: 'THB', ItemTextRate: '1', ItemRate: 1,
        Uom: 'SET',
        Qty: 1, UnitPrice: 0, SrcAmt: 0,
        Remark: '',
    };
}
