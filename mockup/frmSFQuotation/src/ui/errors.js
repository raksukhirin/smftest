/* Error UI: clear, mark, modal. Validation logic itself lives in validation.js. */

import { $, escapeHtml } from '../core/utils.js';
import { gridByKind } from '../core/factories.js';

export function clearErrors() {
    document.querySelectorAll('.is-error').forEach(el => el.classList.remove('is-error'));
    document.querySelectorAll('.field-error, .cell-error').forEach(el => el.remove());
}

/** Apply error markers to inputs + show summary modal. */
export function applyErrors(errors) {
    clearErrors();
    if (!errors.length) return;

    errors.forEach(err => {
        // Header field error
        if (err.field) {
            const el = document.querySelector(`[name="${err.field}"]`);
            if (el) {
                el.classList.add('is-error');
                const wrap = el.closest('.field, .field-with-lookup');
                if (wrap && !wrap.querySelector('.field-error')) {
                    const span = document.createElement('span');
                    span.className = 'field-error';
                    span.textContent = err.msg;
                    wrap.appendChild(span);
                }
            }
        }
        // Grid cell error
        if (err.gridKind) {
            const cfg = gridByKind(err.gridKind);
            const tbody = err.gridKind === 'fcl' ? '#fclTbody' : (cfg ? `#${cfg.tbodyId}` : null);
            if (!tbody) return;
            const tr = document.querySelector(`${tbody} tr[data-idx="${err.gridIdx}"]`);
            if (tr) {
                const cell = tr.querySelector(`[data-col="${err.col}"]`);
                if (cell) {
                    cell.classList.add('is-error');
                    const td = cell.closest('td');
                    if (td && !td.querySelector('.cell-error')) {
                        const div = document.createElement('div');
                        div.className = 'cell-error';
                        div.textContent = err.msg;
                        td.appendChild(div);
                    }
                }
            }
        }
    });

    showErrorModal(errors);
}

export function showErrorModal(errors) {
    const list = $('#errorList');
    list.innerHTML = errors.map(e => `
        <li><span class="err-loc">${escapeHtml(e.loc)}</span>${escapeHtml(e.msg)}</li>
    `).join('');
    $('#errCount').textContent = errors.length;
    const modal = $('#errorModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

export function hideErrorModal() {
    const modal = $('#errorModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}
