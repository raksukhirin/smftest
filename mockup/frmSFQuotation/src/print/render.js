/* Print page renderer — paints a quotation onto the static `paper` template.
 *
 *   FCL is split into 2 sections to mirror the legacy Crystal report:
 *   - OCEAN FREIGHT CHARGE  : SFQRATE rows where LoadPort/FinalPort are filled
 *   - LOCAL CHARGES (FCL)   : surcharge rows; rows with ExpCode='-' render as
 *                              bold-italic dividers that repeat the column
 *                              headers underneath.
 *   For each surcharge row, container columns fall back to XPrice when all
 *   per-container rates are blank (BLFEE / CYCH / AWB pattern).
 */

import { $, escapeHtml, fmtDate, fmtMoney } from './utils.js';

export function paint(q, company) {
    if (!q) return;

    document.title = `Quotation — ${q.DocNo}`;
    $('docTitle').textContent = `${q.DocNo} · ${q.CustName || ''}`;

    /* Letterhead */
    $('coName').textContent     = company?.Name || 'COMPANY NAME';
    $('coAddress').textContent  = company?.Address || '';
    $('coAddress2').textContent = company?.Address2 || '';
    $('coTel').textContent      = company?.Tel || '';
    $('coFax').textContent      = company?.Fax || '';

    /* Title (varies by class) */
    $('docTitleH1').textContent = q.DocClass === 'EX'
        ? 'SEA FREIGHT EXPORT QUOTATION'
        : 'SEA FREIGHT IMPORT QUOTATION';

    /* Customer info block */
    $('infoTo').textContent       = q.CustName || '—';
    $('infoAttn').textContent     = q.CtcName || '—';
    $('infoTel').textContent      = q.Tel || '—';
    $('infoFax').textContent      = q.Fax || '';
    $('infoEmail').textContent    = q.Email || '—';
    $('infoIncoterm').textContent = q.Incoterm || '—';
    $('infoSubject').textContent  = q.DocSubj || '—';
    $('infoRefNo').textContent    = q.RefNo || q.DocNo || '—';
    $('infoDate').textContent     = fmtDate(q.DocDate);
    $('infoEff').textContent      = fmtDate(q.EffDate);
    $('infoExp').textContent      = fmtDate(q.ExpDate);
    $('infoCredit').textContent   = q.CreditDays != null ? `${q.CreditDays} DAYS` : '—';

    /* Opening sentence — slightly different for IM/EX */
    $('opening').textContent = q.DocClass === 'EX'
        ? 'We would like to offer you our following attractive freight and handling charge for your export shipment from origin to destination as below detail :-'
        : 'We would like to offer you our following attractive freight and handling charge your import shipment from port of origin as below detail :-';

    /* ---- FCL ----
     * Split SFQRATE rows into routes (LoadPort/FinalPort filled) vs surcharges
     * (no port info; either price/container rates or "-" divider rows). */

    const fclRows   = q.freightRates || [];
    const routes    = fclRows.filter(isRouteRow);
    const surcharges = fclRows.filter(r => !isRouteRow(r));

    // OCEAN FREIGHT CHARGE — 12 columns matching legacy report
    const routeBody = $('fclRouteBody');
    routeBody.innerHTML = '';
    if (routes.length === 0) {
        routeBody.innerHTML = `<tr><td colspan="12" style="text-align:center;color:#94a3b8;padding:8px">— No routes —</td></tr>`;
    } else {
        routes.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-left">${escapeHtml(r.LoadPort || '')}</td>
                <td class="text-left">${escapeHtml(r.FinalPort || '')}</td>
                <td>${escapeHtml(r.ItemCurr || '')}</td>
                <td>${escapeHtml(r.XCtnType || '')}</td>
                <td>${escapeHtml(r.XCtn20 || '')}</td>
                <td>${escapeHtml(r.XCtn40 || '')}</td>
                <td>${escapeHtml(r.XCtn40HC || '')}</td>
                <td>${escapeHtml(r.XCtn45 || '')}</td>
                <td>${escapeHtml(r.XLcl || '')}</td>
                <td>${escapeHtml(r.Transit || '')}</td>
                <td>${escapeHtml(r.LinerName || r.LinerNo || '')}</td>
                <td class="text-left">${escapeHtml(r.Remark || '')}</td>
            `;
            routeBody.appendChild(tr);
        });
    }

    // LOCAL CHARGES (FCL) — surcharge rows + dividers
    const fclChargeBody  = $('fclChargeBody');
    const fclChargeBlock = document.getElementById('fclChargeBlock');
    fclChargeBody.innerHTML = '';
    if (surcharges.length === 0) {
        if (fclChargeBlock) fclChargeBlock.style.display = 'none';
    } else {
        if (fclChargeBlock) fclChargeBlock.style.display = '';
        surcharges.forEach(r => {
            fclChargeBody.appendChild(isDividerRow(r) ? fclDividerTr(r) : fclChargeTr(r));
        });
    }

    /* Detail-charge tables: LCL (always shown), Customs/Transport (hidden if empty) */
    renderChargeTable($('lclBody'),       q.localCharges,     { showEmptyMsg: '— No local charges —' });
    renderChargeTable($('shippingBody'),  q.shippingCharges,  { hideBlockId: 'shippingTableBlock' });
    renderChargeTable($('transportBody'), q.transportCharges, { hideBlockId: 'transportTableBlock' });

    /* Remarks */
    ['DocDesc', 'DocDesc2', 'DocDesc3', 'DocDesc4'].forEach((k, i) => {
        const el = $(`remark${i + 1}`);
        const text = (q[k] || '').trim();
        const cleaned = text.replace(/^REMARK\s*:\s*\n?/i, '');
        el.textContent = cleaned;
    });

    /* Signatures */
    $('sigSale').textContent = q.SaleName || q.IssueBy || '—';
    $('sigApp').textContent  = q.AppByName || '—';

    /* Status watermark */
    const wm = $('statusWatermark');
    const stat = (q.DocStat || 'Open').toLowerCase();
    wm.className = `status-watermark is-${stat}`;
    wm.textContent = stat === 'open' ? '' : (q.DocStat || '').toUpperCase();
}

/* ---- Helpers ---- */

const trim = (v) => String(v ?? '').trim();
const allEmpty = (...vals) => vals.every(v => trim(v) === '');

/** Route row — has port info filled (Loading or Final destination). */
function isRouteRow(r) {
    return trim(r.LoadPort) !== '' || trim(r.FinalPort) !== '';
}

/** Divider row — ExpCode='-' marker with no rate values; renders as a sub-header. */
function isDividerRow(r) {
    return trim(r.ExpCode) === '-' &&
           trim(r.ExpDesc) !== '' &&
           allEmpty(r.LoadPort, r.FinalPort,
                    r.XCtn20, r.XCtn40, r.XCtn40HC, r.XCtn45,
                    r.XLcl, r.XPrice);
}

/** Container-cell value: prefer XCtn{N}; fall back to XPrice when all
 *  per-container rates are blank (e.g. flat-fee charges like BLFEE). */
function ctnCell(r, key) {
    const direct = trim(r[key]);
    if (direct !== '') return direct;
    const allCtnEmpty = allEmpty(r.XCtn20, r.XCtn40, r.XCtn40HC, r.XCtn45);
    return allCtnEmpty ? trim(r.XPrice) : '';
}

function fclChargeTr(r) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="charge-desc">${escapeHtml(r.ExpDesc || r.ExpCode || '')}</td>
        <td>${escapeHtml(r.ItemCurr || '')}</td>
        <td>${escapeHtml(r.Uom || '')}</td>
        <td>${escapeHtml(ctnCell(r, 'XCtn20'))}</td>
        <td>${escapeHtml(ctnCell(r, 'XCtn40'))}</td>
        <td>${escapeHtml(ctnCell(r, 'XCtn40HC'))}</td>
        <td>${escapeHtml(ctnCell(r, 'XCtn45'))}</td>
        <td class="charge-remark">${escapeHtml(r.Remark || '')}</td>
    `;
    return tr;
}

function fclDividerTr(r) {
    const tr = document.createElement('tr');
    tr.className = 'fcl-divider';
    // Description cell shows the divider label; remaining cells repeat
    // the column headers (mirrors legacy Crystal report sub-section style).
    tr.innerHTML = `
        <td class="charge-desc divider-label">${escapeHtml(r.ExpDesc || '')}</td>
        <td>Curr</td>
        <td>Unit</td>
        <td>20'</td>
        <td>40'</td>
        <td>40'HC</td>
        <td>45'</td>
        <td class="charge-remark">Remark</td>
    `;
    return tr;
}

/** Render a charge table body (LCL/Shipping/Transport — same shape).
 *  If `hideBlockId` is given and `rows` is empty, hide that wrapping table entirely.
 *  Otherwise show `showEmptyMsg` row when empty. */
function renderChargeTable(tbody, rows, { hideBlockId, showEmptyMsg } = {}) {
    if (!tbody) return;
    tbody.innerHTML = '';
    const empty = !Array.isArray(rows) || rows.length === 0;
    if (hideBlockId) {
        const block = document.getElementById(hideBlockId);
        if (block) block.style.display = empty ? 'none' : '';
    }
    if (empty) {
        if (showEmptyMsg) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:8px">${escapeHtml(showEmptyMsg)}</td></tr>`;
        }
        return;
    }
    rows.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="charge-desc">${escapeHtml(c.ExpDesc1 || c.ExpCode || '')}</td>
            <td>${escapeHtml(c.ItemCurr || '')}</td>
            <td>${escapeHtml(c.Uom || '')}</td>
            <td class="text-right">${fmtMoney(c.UnitPrice)}</td>
            <td class="charge-remark">${escapeHtml(c.Remark || '')}</td>
        `;
        tbody.appendChild(tr);
    });
}
