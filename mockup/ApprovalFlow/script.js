// SMF Approval Workflow mockup — vanilla JS. State lives in localStorage (key AF_STATE); Reset re-seeds from data.js.
(function () {
    var KEY = 'AF_STATE_v1', ME = window.AF_ME, NOW = window.AF_NOW, STEPS = window.AF_STEPS, MODS = window.AF_MODULES;
    var $ = function (s) { return document.querySelector(s); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

    var data;
    try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { data = null; }
    if (!data) data = JSON.parse(JSON.stringify(window.AF_SEED));
    function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }

    var st = { mod: 'SE', tab: 'pending', q: '', step: 'all', mine: 'mine', late: false, sel: {}, open: null };

    /* ---------- helpers ---------- */
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function fmt(iso) { var d = new Date(iso); return ('0' + d.getDate()).slice(-2) + ' ' + MON[d.getMonth()] + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
    function ago(iso) {
        var m = Math.round((NOW - new Date(iso)) / 60000);
        return m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago';
    }
    function step(r) { return STEPS[r.step - 1]; }
    function canAct(r) { return r.status === 'Wait' && step(r).approver === ME; }
    function isLate(r) { return r.status === 'Wait' && r.deadline && new Date(r.deadline + 'T23:59') < NOW; }
    function pct(r) { return Math.round(r.doneSteps / STEPS.length * 100); }
    function byId(id) { return data.filter(function (r) { return r.id === id; })[0]; }
    function statusChip(r) {
        if (r.status === 'Approved') return '<span class="chip c-ok">Approved</span>';
        if (r.status === 'Rejected') return '<span class="chip c-bad">Rejected</span>';
        return '<span class="chip c-wait">Wait</span>' + (canAct(r) ? '' : '<div class="sub mt-0.5">for ' + esc(step(r).approver) + '</div>');
    }
    function toast(msg, undo) {
        var t = $('#toast'); t.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button id="undo">UNDO</button>' : ''); t.classList.remove('hidden');
        if (undo) $('#undo').onclick = function () { undo(); t.classList.add('hidden'); };
        clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.add('hidden'); }, 6000);
    }

    /* ---------- actions ---------- */
    function decide(r, action, remark) {
        var before = JSON.stringify(r);
        r.status = action; if (action === 'Approved') r.doneSteps = r.step;
        r.history.push({ step: r.step, action: action, by: ME, at: NOW.toISOString().slice(0, 16), remark: remark || '' });
        delete st.sel[r.id]; save();
        return function undo() { Object.assign(r, JSON.parse(before)); save(); render(); };
    }
    function approveMany(ids) {
        var undos = ids.map(function (id) { return decide(byId(id), 'Approved', ''); });
        toast(ids.length + ' request(s) approved', function () { undos.forEach(function (u) { u(); }); });
        render();
    }

    /* ---------- list ---------- */
    function inMod(r) { return r.module === st.mod; }
    function visible() {
        var q = st.q.toLowerCase();
        return data.filter(function (r) {
            if (!inMod(r)) return false;
            if (st.tab === 'pending' && r.status !== 'Wait') return false;
            if (st.tab === 'approved' && r.status !== 'Approved') return false;
            if (st.tab === 'rejected' && r.status !== 'Rejected') return false;
            if (st.step !== 'all' && String(r.step) !== st.step) return false;
            if (st.mine === 'mine' && st.tab === 'pending' && !canAct(r)) return false;
            if (st.late && !isLate(r)) return false;
            if (q && (r.doc + ' ' + r.sum.shipper + ' ' + r.sum.consignee + ' ' + r.requestedBy + ' ' + r.remark).toLowerCase().indexOf(q) < 0) return false;
            return true;
        }).sort(function (a, b) { return new Date(b.requestedAt) - new Date(a.requestedAt); });
    }

    function rowHtml(r) {
        var act = canAct(r);
        return '<div class="row ' + (st.sel[r.id] ? 'sel' : '') + '" data-id="' + r.id + '">' +
            '<div class="ck">' + (act ? '<input type="checkbox" data-ck="' + r.id + '"' + (st.sel[r.id] ? ' checked' : '') + '>' : '') + '</div>' +
            '<div class="c-doc"><div class="docno">' + esc(r.doc) + '</div><div class="sub">' + esc(r.type) + ' · ' + esc(r.requestedBy) + '</div></div>' +
            '<div class="c-st">' + statusChip(r) + '</div>' +
            '<div class="c-date"><div class="text-xs">' + fmt(r.requestedAt) + '</div><div class="sub">' + ago(r.requestedAt) +
                (isLate(r) ? ' · <span class="chip c-late">overdue</span>' : r.deadline ? ' · due ' + esc(r.deadline.slice(5)) : '') + '</div></div>' +
            '<div class="c-step"><div class="step-name">' + String(r.step).padStart(2, '0') + ' ' + esc(step(r).name) + '</div>' +
                '<div class="sub truncate">' + esc(r.remark || r.sum.shipper + ' → ' + r.sum.consignee) + '</div></div>' +
            '<div class="c-file"><span class="files ' + (r.files.length ? '' : 'none') + '">' + (r.files.length ? '📎 ' + r.files.length + (r.files.length > 1 ? ' FILES' : ' FILE') : 'NO FILE') + '</span></div>' +
            '<div class="c-act">' + (act ? '<span class="quick"><button class="a" data-q="A" data-id="' + r.id + '">APP.</button><button class="r" data-q="R" data-id="' + r.id + '">REJ.</button></span>' : '') + '</div>' +
            '</div>';
    }

    function renderList() {
        var rows = visible(), tabs = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']];
        var m = data.filter(inMod);
        var cnt = { pending: m.filter(function (r) { return r.status === 'Wait'; }).length, approved: m.filter(function (r) { return r.status === 'Approved'; }).length,
                    rejected: m.filter(function (r) { return r.status === 'Rejected'; }).length, all: m.length };
        $('#tabs').innerHTML = tabs.map(function (t) { return '<button class="tab ' + (st.tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '<span class="c">' + cnt[t[0]] + '</span></button>'; }).join('');
        var mod = MODS.filter(function (x) { return x.id === st.mod; })[0];
        var mineN = m.filter(function (r) { return canAct(r); }).length;
        $('#listTitle').textContent = mod.name + ' — Approval Requests';
        $('#listSub').textContent = mineN + ' waiting for you · ' + cnt.pending + ' pending in total';
        $('#fStep').innerHTML = '<option value="all">All working steps</option>' + STEPS.map(function (s) { return '<option value="' + s.no + '"' + (st.step === String(s.no) ? ' selected' : '') + '>' + String(s.no).padStart(2, '0') + ' ' + s.name + '</option>'; }).join('');
        $('#fMine').value = st.mine; $('#fLate').checked = st.late;

        var head = '<div class="row head"><div></div><div>Docno</div><div>Status</div><div>Requested</div><div>Working step / remark</div><div>Attached</div><div></div></div>';
        $('#list').innerHTML = rows.length ? head + rows.map(rowHtml).join('') : '<div class="empty">No requests match.</div>';

        var n = Object.keys(st.sel).length; $('#bulk').classList.toggle('hidden', !n); $('#bulkN').textContent = n;
    }

    function renderNav() {
        $('#modNav').innerHTML = MODS.map(function (x) {
            var n = data.filter(function (r) { return r.module === x.id && canAct(r); }).length;
            return '<button class="nav-i ' + (st.mod === x.id ? 'on' : '') + '" data-mod="' + x.id + '"><span>' + x.icon + '</span>' + x.name + '<span class="n ' + (n ? '' : 'z') + '">' + n + '</span></button>';
        }).join('');
    }

    /* ---------- detail ---------- */
    function renderDetail() {
        var el = $('#detail'), r = st.open && byId(st.open);
        if (!r) { el.classList.add('hidden'); return; }
        el.classList.remove('hidden');
        var cur = step(r), act = canAct(r);
        var stepper = STEPS.map(function (s) {
            var cls = s.no <= r.doneSteps ? 'done' : s.no === r.step ? (r.status === 'Rejected' ? 'rej' : r.status === 'Approved' ? 'done' : 'cur') : '';
            return '<div class="st ' + cls + '"><div class="dot">' + (cls === 'done' ? '✓' : cls === 'rej' ? '✕' : s.no) + '</div><span>' + esc(s.name) + '</span></div>';
        }).join('');
        var hist = r.history.slice().reverse().map(function (h) {
            var c = h.action === 'Approved' ? 'ok' : h.action === 'Rejected' ? 'bad' : 'req';
            return '<div class="' + c + '"><b>' + esc(h.action) + '</b> · ' + String(h.step).padStart(2, '0') + ' ' + esc(STEPS[h.step - 1].name) +
                '<div class="sub">' + esc(h.by) + ' · ' + fmt(h.at) + '</div>' + (h.remark ? '<div class="mt-0.5">“' + esc(h.remark) + '”</div>' : '') + '</div>';
        }).join('');
        var files = r.files.length ? r.files.map(function (f) {
            return '<a href="#" class="file" data-file="' + esc(f.name) + '"><span class="ic">' + (/\.pdf$/i.test(f.name) ? '📄' : /\.xlsx?$/i.test(f.name) ? '📊' : '🖼️') + '</span><span class="flex-1 truncate">' + esc(f.name) + '</span><span class="sub">' + f.kb + ' KB</span><span class="text-indigo-600 font-semibold">View</span></a>';
        }).join('') : '<div class="sub">No attachments</div>';

        var foot;
        if (act) foot = '<textarea id="remark" rows="2" class="field w-full mb-2" placeholder="Remark (required when rejecting)"></textarea>' +
            '<div id="remarkErr" class="text-xs text-red-600 mb-1 hidden">Please enter a reason before rejecting.</div>' +
            '<div class="flex gap-2"><button id="dApprove" class="btn-ok flex-1">✓ Approve</button><button id="dReject" class="btn-bad flex-1">✕ Reject</button></div>';
        else foot = '<div class="text-sm text-slate-600">' + (r.status === 'Wait' ? '⏳ Waiting for <b>' + esc(cur.approver) + '</b> to approve step ' + cur.no + ' — you can view only.' :
            r.status === 'Approved' ? '✅ Approved' : '❌ Rejected') + '</div>';

        el.innerHTML =
            '<div class="px-4 py-3 border-b border-slate-200 flex items-start gap-2"><div class="flex-1 min-w-0"><div class="text-[11px] text-slate-500">' + esc(r.type) + ' · ' + (MODS.filter(function (x) { return x.id === r.module; })[0].name) + '</div>' +
                '<div class="text-lg font-semibold truncate">' + esc(r.doc) + '</div></div>' + statusChip(r) + '<button id="dClose" class="btn-ghost !px-2" aria-label="Close">✕</button></div>' +
            '<div class="d-body">' +
                '<div class="flex items-center justify-between text-xs mb-1"><span class="text-slate-500">Progress</span><b>' + pct(r) + '%</b></div><div class="pbar"><i style="width:' + pct(r) + '%"></i></div>' +
                '<div class="sect">Workflow</div><div class="stepper">' + stepper + '</div>' +
                '<div class="sect">This request</div><div class="rounded-lg border border-slate-200 p-3">' +
                    '<div class="step-name text-base">' + String(cur.no).padStart(2, '0') + ' ' + esc(cur.name) + '</div>' +
                    '<dl class="kv mt-2"><dt>Requested by</dt><dd>' + esc(r.requestedBy) + ' · ' + fmt(r.requestedAt) + '</dd><dt>Approver</dt><dd>' + esc(cur.approver) + '</dd>' +
                    '<dt>Deadline</dt><dd>' + (r.deadline ? esc(r.deadline) + (isLate(r) ? ' <span class="chip c-late">overdue</span>' : '') : '—') + '</dd><dt>Remark</dt><dd>' + (esc(r.remark) || '—') + '</dd></dl></div>' +
                '<div class="sect">Attachments</div>' + files +
                '<div class="sect">Document</div><dl class="kv"><dt>Shipper</dt><dd>' + esc(r.sum.shipper) + '</dd><dt>Consignee</dt><dd>' + esc(r.sum.consignee) + '</dd>' +
                    '<dt>Route</dt><dd>' + esc(r.sum.pol) + ' → ' + esc(r.sum.pod) + '</dd><dt>Job type</dt><dd>' + esc(r.sum.jobType) + '</dd><dt>Sale</dt><dd>' + esc(r.sum.sale) + '</dd></dl>' +
                '<div class="sect">History</div><div class="hist">' + hist + '</div>' +
            '</div><div class="d-foot">' + foot + '</div>';

        $('#dClose').onclick = function () { st.open = null; render(); };
        if (act) {
            $('#dApprove').onclick = function () { var u = decide(r, 'Approved', $('#remark').value.trim()); toast(r.doc + ' approved', u); render(); };
            $('#dReject').onclick = function () {
                var v = $('#remark').value.trim();
                if (!v) { $('#remarkErr').classList.remove('hidden'); $('#remark').focus(); return; }
                var u = decide(r, 'Rejected', v); toast(r.doc + ' rejected', u); render();
            };
        }
    }

    function render() { renderNav(); renderList(); renderDetail(); }

    /* ---------- events ---------- */
    document.addEventListener('click', function (e) {
        var t;
        if ((t = e.target.closest('[data-mod]'))) { st.mod = t.dataset.mod; st.open = null; st.sel = {}; $('#side').classList.remove('open'); $('#scrim').classList.add('hidden'); return render(); }
        if ((t = e.target.closest('[data-tab]'))) { st.tab = t.dataset.tab; st.sel = {}; return render(); }
        if ((t = e.target.closest('[data-ck]'))) { if (t.checked) st.sel[t.dataset.ck] = 1; else delete st.sel[t.dataset.ck]; e.stopPropagation(); return renderList(); }
        if ((t = e.target.closest('[data-q]'))) {
            var r = byId(+t.dataset.id);
            if (t.dataset.q === 'A') { var u = decide(r, 'Approved', ''); toast(r.doc + ' approved', u); render(); }
            else { st.open = r.id; render(); setTimeout(function () { var rm = $('#remark'); if (rm) { rm.focus(); $('#remarkErr').classList.remove('hidden'); } }, 0); }
            return;
        }
        if ((t = e.target.closest('[data-file]'))) { e.preventDefault(); return toast('Preview of ' + t.dataset.file + ' (mockup)'); }
        if ((t = e.target.closest('.row[data-id]'))) { st.open = +t.dataset.id; return render(); }
    });
    $('#q').oninput = function () { st.q = this.value; renderList(); };
    $('#fStep').onchange = function () { st.step = this.value; renderList(); };
    $('#fMine').onchange = function () { st.mine = this.value; renderList(); };
    $('#fLate').onchange = function () { st.late = this.checked; renderList(); };
    $('#btnRefresh').onclick = render;
    $('#bulkApprove').onclick = function () { approveMany(Object.keys(st.sel).map(Number)); };
    $('#bulkClear').onclick = function () { st.sel = {}; renderList(); };
    $('#btnReset').onclick = function () { data = JSON.parse(JSON.stringify(window.AF_SEED)); st.open = null; st.sel = {}; save(); render(); toast('Demo data re-seeded'); };
    $('#btnMenu').onclick = function () { $('#side').classList.add('open'); $('#scrim').classList.remove('hidden'); };
    $('#scrim').onclick = function () { $('#side').classList.remove('open'); $('#scrim').classList.add('hidden'); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && st.open) { st.open = null; render(); } });

    $('#meName').textContent = 'Signed in as ' + ME;
    render();
})();
