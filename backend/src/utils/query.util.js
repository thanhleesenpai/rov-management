// Escapes RegExp special characters so user search input can't be used to inject
// arbitrary regex patterns (ReDoS) or unintended matches into $regex queries.
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { escapeRegex };
