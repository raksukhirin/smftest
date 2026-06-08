/* suggest/field.js — Field-level smart-suggest for the 4 header lookup inputs
 * (CustNo, SaleNo, AppByNo, AgentNo). */
window.SFQ = window.SFQ || {};
window.SFQ.suggestField = (function () {
    'use strict';
    const { escapeHtml } = SFQ.utils;
    const { showToast }  = SFQ.toast;

    const SUGGEST_MAX = 8;
    const SUGGEST_DEBOUNCE_MS = 60;

    function installSmartSuggest(codeInput, opts) {
        if (!codeInput) return;
        const wrap = codeInput.closest('.field-with-lookup');
        if (!wrap) return;

        const dd = document.createElement('div');
        dd.className = 'suggest-dropdown hidden';
        dd.setAttribute('role', 'listbox');
        wrap.appendChild(dd);

        let lastResults = [];
        let activeIdx = 0;
        let debounceT = null;

        function close() {
            dd.classList.add('hidden');
            activeIdx = 0;
        }

        function highlight(text, q) {
            const t = String(text ?? '');
            if (!q) return escapeHtml(t);
            const idx = t.toLowerCase().indexOf(q.toLowerCase());
            if (idx === -1) return escapeHtml(t);
            return escapeHtml(t.slice(0, idx))
                + `<span class="suggest-mark">${escapeHtml(t.slice(idx, idx + q.length))}</span>`
                + escapeHtml(t.slice(idx + q.length));
        }

        function filter(query) {
            const all = opts.source() || [];
            const q = (query || '').trim();
            if (!q) return all.slice(0, SUGGEST_MAX);
            const ql = q.toLowerCase();
            const out = [];
            for (const r of all) {
                for (const f of opts.fields) {
                    const v = (r[f] ?? '').toString().toLowerCase();
                    if (v.startsWith(ql)) { out.push(r); break; }
                }
                if (out.length >= SUGGEST_MAX) break;
            }
            if (out.length < SUGGEST_MAX) {
                const seen = new Set(out);
                for (const r of all) {
                    if (seen.has(r)) continue;
                    for (const f of opts.fields) {
                        const v = (r[f] ?? '').toString().toLowerCase();
                        if (v.includes(ql)) { out.push(r); break; }
                    }
                    if (out.length >= SUGGEST_MAX) break;
                }
            }
            return out;
        }

        function render(query) {
            const all = opts.source() || [];
            lastResults = filter(query);
            const q = (query || '').trim();

            const headerLabel = opts.countLabel
                ? opts.countLabel(all.length)
                : `${all.length.toLocaleString()} ${opts.label}${all.length === 1 ? '' : 's'}`;

            let html = `<div class="suggest-header">
                <span>${escapeHtml(headerLabel)}</span>
                <span>${q ? `match "${escapeHtml(q)}"` : 'showing top ' + SUGGEST_MAX}</span>
            </div>`;

            if (lastResults.length === 0) {
                html += `<div class="suggest-empty">No ${escapeHtml(opts.label)} matches "${escapeHtml(q)}"</div>`;
            } else {
                html += lastResults.map((r, i) => {
                    const v = opts.render(r);
                    return `<div class="suggest-item${i === activeIdx ? ' is-active' : ''}" data-idx="${i}" role="option">
                        <span class="suggest-code">${highlight(v.code, q)}</span>
                        <div class="suggest-body">
                            <div class="suggest-name">${highlight(v.name, q)}</div>
                            ${v.meta ? `<div class="suggest-meta">${escapeHtml(v.meta)}</div>` : ''}
                        </div>
                    </div>`;
                }).join('');
            }

            html += `<div class="suggest-footer">
                <span class="suggest-key">↑</span> <span class="suggest-key">↓</span> navigate ·
                <span class="suggest-key">↵</span> select ·
                <span class="suggest-key">Esc</span> close
            </div>`;

            dd.innerHTML = html;
            dd.classList.remove('hidden');
        }

        function updateActive() {
            dd.querySelectorAll('.suggest-item').forEach((el, i) => {
                el.classList.toggle('is-active', i === activeIdx);
            });
            dd.querySelector('.suggest-item.is-active')?.scrollIntoView({ block: 'nearest' });
        }

        function pick(i) {
            const r = lastResults[i];
            if (!r) return;
            codeInput._suggestJustPicked = true;
            opts.onSelect(r);
            const v = opts.render(r);
            showToast(`Selected ${v.code} — ${v.name}`, '✓');
            close();
        }

        codeInput.addEventListener('focus', () => render(codeInput.value));
        codeInput.addEventListener('input', () => {
            clearTimeout(debounceT);
            debounceT = setTimeout(() => {
                activeIdx = 0;
                render(codeInput.value);
            }, SUGGEST_DEBOUNCE_MS);
        });
        codeInput.addEventListener('keydown', (e) => {
            if (dd.classList.contains('hidden')) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    render(codeInput.value);
                }
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIdx = Math.min(activeIdx + 1, lastResults.length - 1);
                updateActive();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIdx = Math.max(activeIdx - 1, 0);
                updateActive();
            } else if (e.key === 'Enter') {
                if (lastResults.length > 0) {
                    e.preventDefault();
                    pick(activeIdx);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
            } else if (e.key === 'Tab') {
                close();
            }
        });

        dd.addEventListener('mousedown', (e) => {
            const item = e.target.closest('.suggest-item[data-idx]');
            if (!item) return;
            e.preventDefault();
            pick(+item.dataset.idx);
        });

        document.addEventListener('mousedown', (e) => {
            if (!wrap.contains(e.target)) close();
        });
    }

    return { installSmartSuggest };
}());
