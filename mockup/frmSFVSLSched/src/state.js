/* state.js — Seed loading + relational lookups + voyage view-model builder.
 * The seed is the attached relational model (carriers, ports, serviceLanes,
 * vessels, voyages, voyagePorts, cutOffs, bookings). This module joins them.
 */
window.VSL = window.VSL || {};
window.VSL.state = (function () {
    'use strict';
    const U = VSL.utils;

    // Shared store: the Voyage Entry screen (input.html / VSI.store) persists the
    // working dataset here. Query reads the SAME key so both screens stay in sync;
    // falls back to the seed (data.js / data.json) when nothing has been saved yet.
    const STORAGE_KEY = 'sfVoyage.input.v1';

    const state = {
        data: null,
        idx: {},                 // id → object maps
        selectedVoyageId: null,
        filters: { text: '', carrier: '', schedule: '', pol: '', pod: '', etdFrom: '', etdTo: '' }
    };

    async function loadSeed() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            state.data = JSON.parse(saved);
        } else if (window.SEED_DATA) {
            state.data = window.SEED_DATA;
        } else {
            const res = await fetch('data.json', { cache: 'no-store' });
            if (!res.ok) throw new Error('data.json fetch failed: ' + res.status);
            state.data = await res.json();
        }
        buildIndex();
    }

    /** Re-read from the shared store (called when Voyage Entry saves). */
    function reload() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) state.data = JSON.parse(saved);
        buildIndex();
    }

    function buildIndex() {
        const d = state.data;
        const map = (arr, key) => Object.fromEntries((arr || []).map(o => [o[key], o]));
        state.idx = {
            carrier:  map(d.carriers,     'carrierId'),
            port:     map(d.ports,        'portId'),
            service:  map(d.serviceLanes, 'serviceLaneId'),
            vessel:   map(d.vessels,      'vesselId')
        };
    }

    // ---- resolvers ----
    const carrier = id => state.idx.carrier[id] || {};
    const port    = id => state.idx.port[id]    || {};
    const service = id => state.idx.service[id] || {};
    const vessel  = id => state.idx.vessel[id]  || {};

    function voyagePortsOf(voyageId) {
        return (state.data.voyagePorts || [])
            .filter(vp => vp.voyageId === voyageId)
            .sort((a, b) => a.sequenceNo - b.sequenceNo);
    }
    function cutOffsOf(voyageId) {
        return (state.data.cutOffs || [])
            .filter(c => c.voyageId === voyageId)
            .sort((a, b) => U.epoch(a.cutOffDateTime) - U.epoch(b.cutOffDateTime));
    }
    function bookingsOf(voyageId) {
        return (state.data.bookings || []).filter(b => b.voyageId === voyageId);
    }

    /** Earliest not-yet-closed cut-off (Open/Today), used for "Next Closing". */
    function nextCutOff(voyageId) {
        return cutOffsOf(voyageId).find(c => c.status !== 'Closed') || null;
    }

    /** Joined display object for one voyage (everything a card/header needs). */
    function voyageVM(v) {
        const ve = vessel(v.vesselId), ca = carrier(v.carrierId), sl = service(v.serviceLaneId);
        const pol = port(v.polPortId), pod = port(v.podPortId);
        const nc = nextCutOff(v.voyageId);
        return {
            voyageId: v.voyageId, voyageNo: v.voyageNo, direction: v.direction,
            vesselName: ve.vesselName || '—', imoNo: ve.imoNo || '',
            carrierCode: ca.carrierCode || '', carrierName: ca.carrierName || '',
            serviceCode: sl.serviceCode || '', serviceName: sl.serviceName || '',
            tradeLane: sl.tradeLane || '',
            polCode: pol.portCode || '', polName: pol.portName || '',
            podCode: pod.portCode || '', podName: pod.portName || '',
            etd: v.etd, eta: v.eta, transitDays: v.transitDays,
            bookingStatus: v.bookingStatus, scheduleStatus: v.scheduleStatus,
            nextCutOffType: nc ? nc.cutOffType : null,
            nextCutOffDateTime: nc ? nc.cutOffDateTime : null,
            bookingCount: bookingsOf(v.voyageId).length
        };
    }

    function allVoyageVMs() { return (state.data.voyages || []).map(voyageVM); }
    function getVoyage(id)  { return (state.data.voyages || []).find(v => v.voyageId === id); }

    return {
        state, STORAGE_KEY, loadSeed, reload, carrier, port, service, vessel,
        voyagePortsOf, cutOffsOf, bookingsOf, nextCutOff,
        voyageVM, allVoyageVMs, getVoyage
    };
}());
