/* Entry point — boots the mockup.
 *
 *   1. Load state from localStorage (or seed from data.json)
 *   2. Fetch external master files (customers / employees / items / ports)
 *   3. Bind DOM events
 *   4. Paint the UI for the first time
 *
 * Loaded as a module from index.html:
 *   <script type="module" src="src/app.js"></script>
 */

import { loadInitial } from './data/masters.js';
import { paintAll } from './ui/paint.js';
import { bindEvents } from './events.js';

async function boot() {
    await loadInitial();
    bindEvents();
    paintAll();
}

boot();
