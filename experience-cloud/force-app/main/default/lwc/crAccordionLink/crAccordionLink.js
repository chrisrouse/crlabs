/**
 * Links an accordion to an Accordion Image Panel placed elsewhere on the page. Both components
 * import this module, and the page loads it once, so they share these channels. The accordion
 * publishes its state under its Link Name, and a panel subscribes under its Linked Accordion.
 */

/** Channels by link name. Each keeps the latest state, so a panel that loads later still gets it. */
const channels = new Map();

/**
 * Reads a name the way authors type it: trimmed, and ignoring case.
 * @param {string} name A link or section name.
 * @returns {string}
 */
export function normalizeName(name) {
    return (name || "").trim().toLowerCase();
}

/**
 * @param {string} linkName The link name.
 * @returns {{state: {open: string[]}, listeners: Set<Function>}}
 */
function channelFor(linkName) {
    if (!channels.has(linkName)) {
        channels.set(linkName, { state: { open: [] }, listeners: new Set() });
    }
    return channels.get(linkName);
}

/**
 * Publishes an accordion's state to its linked panels.
 * @param {string} linkName The accordion's Link Name. Nothing is published without one.
 * @param {{open: string[]}} state The open sections' names, most recently opened last.
 */
export function publishAccordionState(linkName, state) {
    const key = normalizeName(linkName);
    if (!key) {
        return;
    }
    const channel = channelFor(key);
    channel.state = state;
    channel.listeners.forEach((listener) => listener(state));
}

/**
 * Listens for an accordion's state. The listener is called at once with the latest state.
 * @param {string} linkName The Linked Accordion name.
 * @param {Function} listener Called with {open}.
 * @returns {Function} Stops listening.
 */
export function subscribeToAccordion(linkName, listener) {
    const key = normalizeName(linkName);
    if (!key) {
        return () => {};
    }
    const channel = channelFor(key);
    channel.listeners.add(listener);
    listener(channel.state);
    return () => channel.listeners.delete(listener);
}
