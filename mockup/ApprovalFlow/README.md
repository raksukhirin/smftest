# Approval Workflow — Mockup (Web App)

UI layout for approving SMF requests on the web (desktop and phone). Static HTML/CSS/JS, no backend; state is kept in `localStorage` (`AF_STATE_v1`) and **↺ Reset** re-seeds from `data.js`. Preview: `launch.json` → `approvalflow-mockup` (port 8772), or open `index.html`.

Based on the current system: the request form in SMF (VB6 "Update Timeline": DocNo, Deadline, Remark, files, Send Request) and the web pages *Approval Requests* / *Timeline* (list with APP./REJ., Wait, Working Step, Remark, Attached, Deadline; per-document step timeline with progress %).

## Layout
| Area | What it does |
|---|---|
| Sidebar | Modules (Sea Export / Sea Import / Air Export / Air Import) with a red count of requests **waiting for the signed-in user** |
| List | Tabs Pending / Approved / Rejected / All · search (Docno, customer, requester) · filter by working step · "Waiting for me / Everyone" · Overdue only · checkbox + **Approve selected** · quick **APP. / REJ.** per row |
| Detail panel | Right side on wide screens, full-height sheet on narrow screens. Progress bar and a 13-step stepper, the current request (requester, approver, deadline, remark), attachments, document summary, history of every action |
| Action bar | One remark box + **Approve** / **Reject**. Reject needs a reason. Requests that wait for someone else are read-only ("Waiting for JACK") |
| Toast | Every approve/reject shows **UNDO** for 6 s |

### Timeline Mgt view (switch at the top right: Inbox | Timeline Mgt)
For tracking and controlling the whole workflow rather than deciding one request:
- **KPI boxes** — in progress, on track, at risk, stalled/overdue, rejected, completed, average cycle time (click a box to filter).
- **Waiting at step** row — number of documents currently waiting at each of the 13 steps (amber/red when any of them is at risk/stalled): shows the bottleneck.
- **Matrix** — one row per document × 13 steps: ✓ approved, coloured cell = waiting with its age (indigo on track · amber ≥ 24 h · red ≥ 48 h or past deadline), ✕ rejected; plus progress %, waiting time and owner. Hover a cell for approver and timing, click a row for the detail panel.
- Filters: status, owner, search; group by risk / job type / none; **⬇ CSV** export. The SLA (24 h / 48 h) is a placeholder.

The list turns into cards when its column is narrow (phone / split with the detail panel), so the same page works as a phone approval screen.

## Decisions kept simple (to confirm when the tables arrive)
- **Who may approve**: each workflow step has one approver (`AF_STEPS[].approver`). Real rule may be by role, by amount, or several levels per step.
- **After approve**: the request becomes *Approved* and that step is done. Whether the next step is requested automatically (and by whom) is not modelled.
- **Step names**: only 01 Vessel Booking, 02 Job Order, 03 Advance Expense are known from the screenshots; 04-13 are placeholders.
- **Attachments**: "View" is a stub (toast). Real version needs the file location used by SMF (`File Location` / Paste Link / Quick Attach).
- Not drawn yet: delegation / out-of-office, notifications (the bell), reject → resubmit flow, audit/export, the "Fully Timeline" view of all documents with the % bars.

## Data shape (`data.js`)
`{ id, doc, module, type, step, status: Wait|Approved|Rejected, requestedBy, requestedAt, deadline, remark, files[{name,kb}], sum{shipper,consignee,pol,pod,jobType,sale}, history[{step,action,by,at,remark}], doneSteps }` — to be mapped to the real tables once provided (a `mapping.md` will follow, as with the other mockups).
