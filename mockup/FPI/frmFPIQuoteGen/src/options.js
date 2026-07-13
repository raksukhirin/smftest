/* options.js — panel 2: one card per candidate Rate, grouped by POD.
   Rank stripe = §5.1 ordering (D6). GBB badge = computed from real cost/transit. */
window.QG = window.QG || {};
window.QG.options = (function () {
    'use strict';

    const { $, el, esc, money } = QG.utils;
    const { state } = QG.state;

    const INACTIVE_LABEL = {
        SUPERSEDED: 'ถูกแทนที่',
        EXPIRED: 'หมดอายุ',
        NOT_YET_VALID: 'ยังไม่ถึงกำหนด',
        DRAFT: 'ยังไม่ Confirm'
    };

    let _onSelect = () => {};

    function gbbClass(k) {
        return k === 'best' ? 'gbb-best' : k === 'better' ? 'gbb-better' : 'gbb-good';
    }

    function card(opt, lane, laneIdx) {
        const r = opt.rate;
        const selected = lane.selectedRateId === r.rateId;
        const c = el('div', 'opt rank' + opt.rank + (selected ? ' sel' : '') + (opt.active ? '' : ' inactive'));

        /* --- line 1: rank + carrier + badges --- */
        const head = el('div', 'flex items-start gap-2');
        const left = el('div', 'min-w-0 flex-1');

        const t1 = el('div', 'flex items-center gap-1.5 flex-wrap');
        t1.appendChild(el('span', 'text-[10px] font-bold text-slate-400', '#' + opt.rank));
        t1.appendChild(el('span', 'font-semibold text-[13px] text-slate-800 truncate', esc(r.carrierName)));
        if (opt.historyOption) t1.appendChild(el('span', 'pill pill-warn', 'Tier 2 · อิงประวัติ'));
        if (opt.recommended && !opt.historyOption) t1.appendChild(el('span', 'pill pill-teal', '⭐ แนะนำ (D6)'));
        if (opt.gbb) t1.appendChild(el('span', 'pill ' + gbbClass(opt.gbb.key), esc(opt.gbb.label)));
        if (!opt.active) t1.appendChild(el('span', 'pill pill-warn', esc(INACTIVE_LABEL[opt.inactiveReason] || opt.inactiveReason)));
        if (opt.rank === 4) t1.appendChild(el('span', 'pill pill-danger', 'Contract ลูกค้ารายอื่น'));
        left.appendChild(t1);

        const t2 = el('div', 'text-[11px] text-slate-500 mt-0.5');
        t2.innerHTML = '<span class="font-mono">' + esc(r.rateNo) + '</span> · ' + esc(opt.rankLabel) +
            (r.routing ? ' · ' + esc(r.routing) : '') +
            (r.validFrom ? ' · <span class="font-mono">' + esc(r.validFrom) + '→' + esc(r.validTo) + '</span>' : '');
        left.appendChild(t2);
        head.appendChild(left);

        const radio = el('input', 'mt-1 accent-teal-700');
        radio.type = 'radio';
        radio.name = 'lane-' + laneIdx;
        radio.checked = selected;
        head.appendChild(radio);
        c.appendChild(head);

        /* --- line 2: the numbers that matter --- */
        const stats = el('div', 'mt-2 grid grid-cols-4 gap-2 text-[11px]');
        const stat = (lbl, val, cls) => {
            const d = el('div');
            d.appendChild(el('div', 'text-slate-400 text-[10px]', lbl));
            d.appendChild(el('div', 'font-semibold tabular ' + (cls || 'text-slate-700'), val));
            return d;
        };
        const m = opt.margin;
        stats.appendChild(stat('ทุน all-in', m.badFxLines ? '—' : money(m.cost, 0)));
        stats.appendChild(stat('ขายแนะนำ', m.badFxLines ? '—' : money(m.sold, 0)));
        stats.appendChild(stat('Margin', m.pct == null || m.badFxLines ? '—' : money(m.pct, 1) + '%',
            m.badFxLines ? 'text-rose-600' : m.verdict === 'PASS' ? 'text-emerald-700' : 'text-amber-700'));
        stats.appendChild(stat('Transit', opt.historyOption ? '—'
            : (r.transitDaysMin || '?') + '–' + (r.transitDaysMax || '?') + ' d' +
              (r.freeTimeDest ? ' · FT' + r.freeTimeDest : '')));
        c.appendChild(stats);

        /* --- line 3: chain / hint --- */
        if (opt.historyOption) {
            c.appendChild(el('div', 'mt-2 alert alert-warn',
                '<span>ⓘ</span><span>Margin ที่แสดงเป็น <b>ตัวเลขคร่าว</b> จากประวัติ — บางบรรทัดอาจไม่มีคู่ต้นทุน ทำให้ Margin ดูสูงเกินจริง. ยืนยันจริงตอน Confirm Booking (D1)</span>'));
        }
        if (opt.gbb) {
            c.appendChild(el('div', 'mt-1.5 text-[10px] text-slate-400', esc(opt.gbb.hint)));
        }
        if (opt.inactiveReason === 'SUPERSEDED') {
            const box = el('div', 'mt-2 alert alert-warn');
            if (opt.chain && opt.chain.rate) {
                box.innerHTML = '<span>⛓</span><span>เดิน Superseded chain (§4.3): <b class="font-mono">' +
                    esc(opt.chain.chain.join(' → ')) + '</b> → <b class="font-mono">' + esc(opt.chainTargetNo) + '</b><br>' +
                    'ถ้าจองวันนี้ ทุนจะเป็น <b>' + (opt.chainDelta >= 0 ? '+' : '') + money(opt.chainDelta, 0) +
                    ' THB</b> จากทุนบนใบเสนอราคานี้</span>';
            } else {
                box.innerHTML = '<span>⛓</span><span>Rate ถูกแทนที่ และ<b>เดิน chain ไม่เจอตัวที่ Valid</b> ณ ' +
                    esc(state.shipment.asOf) + ' — Booking จะ BLOCKED (§4.3 ข้อ 4)</span>';
            }
            c.appendChild(box);
        }

        const pick = () => {
            if (lane.selectedRateId === r.rateId) return;
            _onSelect(laneIdx, r.rateId, opt);
        };
        c.onclick = pick;
        radio.onclick = e => { e.stopPropagation(); pick(); };
        return c;
    }

    function laneHeader(lane) {
        const h = el('div', 'flex items-baseline justify-between mb-1.5');
        const l = el('div');
        l.innerHTML = '<span class="font-semibold text-[13px] text-slate-800">' +
            esc(state.shipment.pol) + ' → ' + esc(lane.pod) + '</span>' +
            ' <span class="text-[11px] text-slate-400">Option ' + (state.lanes.indexOf(lane) + 1) + '</span>';
        h.appendChild(l);
        h.appendChild(el('span', 'text-[10px] text-slate-500',
            lane.activeCount + ' active / ' + lane.candidates.length + ' rate'));
        return h;
    }

    function render(onSelect) {
        if (onSelect) _onSelect = onSelect;
        const box = $('#lanePanels');
        box.innerHTML = '';

        state.lanes.forEach((lane, i) => {
            const wrap = el('div', i === state.activeLaneIdx ? '' : 'opacity-70');
            wrap.appendChild(laneHeader(lane));

            const visible = lane.candidates.filter(o => o.active || state.shipment.showInactive);
            if (!visible.length) {
                const empty = el('div', 'alert alert-info');
                empty.innerHTML = '<span>ⓘ</span><span>ไม่มี Rate ใน Rate KB สำหรับ lane นี้' +
                    (lane.candidates.length ? ' ที่ยัง Active ณ ' + esc(state.shipment.asOf) +
                        ' — ติ๊ก “แสดง Rate ที่ SUPERSEDED / EXPIRED” เพื่อดู ' + lane.candidates.length + ' ใบ' : '') +
                    '<br>' + (QG.history.hasLane(state.shipment.pol, lane.pod)
                        ? 'ดูราคาอ้างอิงจากประวัติ (Tier 2) ด้านขวา →'
                        : 'และไม่มีประวัติจริงใน lane นี้ด้วย') + '</span>';
                wrap.appendChild(empty);
            } else {
                const list = el('div', 'space-y-2');
                visible.forEach(o => list.appendChild(card(o, lane, i)));
                wrap.appendChild(list);
            }

            // clicking anywhere in the lane makes it the active lane for the charge grid
            wrap.onclick = () => {
                if (state.activeLaneIdx !== i) { state.activeLaneIdx = i; QG.app.rerender(); }
            };
            box.appendChild(wrap);
        });
    }

    return { render, INACTIVE_LABEL };
})();
