import {secureHandler, logSecurityFailure} from './security.js';
// Retired workflow: retained route returns 410 and never reads or mutates storage.
const rawHandler = async () => ({ statusCode: 410, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: 'This action is no longer available.' }) });
export const handler = secureHandler(rawHandler, 'send-pre-final');

export default { handler };
