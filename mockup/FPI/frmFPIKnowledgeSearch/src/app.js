/* app.js — chat UI for the Knowledge Search. Renders question + cited answer. */
window.KB = window.KB || {};
window.KB.app = (function () {
    'use strict';

    const { $, el, esc } = BG.utils;
    let asOf = '2026-09-15';

    const STARTERS = [
        'มี rate FCL Laem Chabang ไป Hamburg ไหม',
        'C-BRAVO ควรบวก margin เท่าไหร่',
        'THLCH SGSIN เคยจ่ายเท่าไหร่',
        'THLCH DEHAM rate ไหนถูกสุด',
        'rate ไหนใกล้หมดอายุ',
        'quote ไหน rate ตายแล้ว'
    ];

    /* ---------------- render ---------------- */

    function addUser(text) {
        const row = el('div', 'msg-user');
        row.innerHTML = '<div class="bubble">' + esc(text) + '</div>';
        $('#chat').appendChild(row);
    }

    function tierBadge(tier) {
        const label = tier === 'TIER1' ? 'Tier 1 · Rate KB' : tier === 'TIER2' ? 'Tier 2 · ประวัติ' : 'ไม่มีแหล่ง';
        return '<span class="tier tier-' + tier + '">' + label + '</span>';
    }

    function citeChip(c) {
        return '<span class="cite"><span class="c-t ' + c.tier + '">' + (c.tier === 'TIER1' ? 'T1' : 'T2') + '</span>' +
            '<span class="c-ref">' + esc(c.ref) + '</span>' +
            (c.date ? '<span class="c-date">' + esc(c.date) + '</span>' : '') +
            (c.note ? '<span class="c-date">· ' + esc(c.note) + '</span>' : '') + '</span>';
    }

    function addAnswer(res) {
        const row = el('div', 'msg-ai');
        const card = el('div', 'answer');
        let html = '<div class="answer-hd">' + tierBadge(res.tier) +
            '<span class="title">' + esc(res.title) + '</span></div>' +
            '<div class="answer-body">' + res.html + '</div>';

        if (res.citations && res.citations.length) {
            html += '<div class="cites"><div class="cites-lbl">อ้างอิง (' + res.citations.length + ')</div>' +
                res.citations.map(citeChip).join('') + '</div>';
        } else if (res.tier !== 'NONE') {
            html += '<div class="cites"><span class="hint">— ไม่มีรายการอ้างอิง —</span></div>';
        }

        if (res.followups && res.followups.length) {
            html += '<div class="followups"><span class="f-lbl">ถามต่อ</span>' +
                res.followups.map(f => '<span class="chip" data-q="' + esc(f) + '">' + esc(f) + '</span>').join('') + '</div>';
        }
        card.innerHTML = html;
        row.appendChild(card);
        $('#chat').appendChild(row);

        card.querySelectorAll('[data-q]').forEach(c => c.onclick = () => ask(c.getAttribute('data-q')));
        row.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    function ask(text) {
        const q = (text || $('#q').value).trim();
        if (!q) return;
        $('#q').value = '';
        addUser(q);
        // deterministic; a real LLM call would await here
        const res = KB.engine.query(q, asOf);
        addAnswer(res);
    }

    function renderSuggestions() {
        $('#suggestions').innerHTML = STARTERS.map(s => '<span class="chip" data-q="' + esc(s) + '">' + esc(s) + '</span>').join('');
        $('#suggestions').querySelectorAll('[data-q]').forEach(c => c.onclick = () => ask(c.getAttribute('data-q')));
    }

    /* ---------------- boot ---------------- */

    async function boot() {
        await KB.engine.load();
        $('#statSource').textContent = KB.engine.source();
        $('#asOf').value = asOf;
        $('#asOf').onchange = e => { asOf = e.target.value || asOf; };
        $('#sendBtn').onclick = () => ask();
        $('#q').onkeydown = e => { if (e.key === 'Enter') ask(); };
        renderSuggestions();

        // greeting
        addAnswer({
            tier: 'NONE',
            title: 'ถามเกี่ยวกับ Rate KB / Quote / Booking ได้เลย',
            html: '<p>ผมตอบจาก <b>Rate KB (Tier 1)</b> และ <b>ประวัติจริง (Tier 2)</b> พร้อมอ้างอิงเลขเอกสาร/วันที่เสมอ ' +
                '(Tier 2 เป็น Indicative — ห้าม Auto-fill · D11)</p><p class="hint">ลองกดคำถามด้านล่าง หรือพิมพ์เอง</p>',
            citations: [], followups: []
        });
    }

    return { boot, ask };
})();

document.addEventListener('DOMContentLoaded', () => KB.app.boot());
