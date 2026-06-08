/* app.js — Entry point. Plain script loaded last in index.html. */
window.SFQ = window.SFQ || {};
window.SFQ.app = (function () {
    'use strict';

    async function boot() {
        await SFQ.masters.loadInitial();
        SFQ.events.bindEvents();
        SFQ.paint.paintAll();
    }

    document.addEventListener('DOMContentLoaded', boot);

    return { boot };
}());
