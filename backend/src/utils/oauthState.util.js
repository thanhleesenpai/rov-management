// Encodes/decodes the `state` param round-tripped through Google's OAuth redirect,
// carrying the originating client URL (for multi-origin deploys) and a CSRF nonce
// the frontend generated before starting the flow (see frontend/src/lib/oauthNonce.js).
const DEFAULT_CLIENT_URL = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',')[0] : 'http://localhost:5173';

const encodeOAuthState = (clientUrl, nonce) =>
  Buffer.from(JSON.stringify({ clientUrl, nonce })).toString('base64');

const decodeOAuthState = (state) => {
  if (!state) return { clientUrl: DEFAULT_CLIENT_URL, nonce: '' };
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString('ascii'));
    return { clientUrl: decoded.clientUrl || DEFAULT_CLIENT_URL, nonce: decoded.nonce || '' };
  } catch {
    return { clientUrl: DEFAULT_CLIENT_URL, nonce: '' };
  }
};

module.exports = { encodeOAuthState, decodeOAuthState, DEFAULT_CLIENT_URL };
