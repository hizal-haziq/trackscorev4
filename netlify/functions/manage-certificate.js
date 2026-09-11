/**
 * Netlify Serverless Function: manage-certificate
 * Proxies to issue-certificate.js to provide dedicated /manage-certificate endpoint
 */
export { handler } from './issue-certificate.js';
import issueCertificateModule from './issue-certificate.js';
export default issueCertificateModule;
