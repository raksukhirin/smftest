/* app.js — Entry point: load seed → init search → render list → select first. */
window.VSL = window.VSL || {};
window.VSL.app = (function () {
    'use strict';
    async function boot() {
        try {
            await VSL.state.loadSeed();
        } catch (e) {
            document.querySelector('#detailRoot').innerHTML =
                `<div class="empty-state">Cannot load data — ${e.message}</div>`;
            return;
        }
        VSL.search.init({ onSelect: VSL.detail.show });
        VSL.search.render();
        VSL.search.selectFirst();   // auto-open the first voyage like the preview

        // Stay in sync with the Voyage Entry screen (shared store):
        //  • 'storage' fires when input.html saves in another tab
        //  • 'visibilitychange' catches same-tab navigation back to this page
        window.addEventListener('storage', e => { if (e.key === VSL.state.STORAGE_KEY) refresh(); });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    }

    /** Re-read the shared store and repaint, keeping the current selection. */
    function refresh() {
        VSL.state.reload();
        VSL.search.render();
        const id = VSL.state.state.selectedVoyageId;
        if (id && VSL.state.getVoyage(id)) VSL.detail.show(id);
        else VSL.search.selectFirst();
    }

    document.addEventListener('DOMContentLoaded', boot);
    return { boot, refresh };
}());
