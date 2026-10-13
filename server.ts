import {headersFor, ENDPOINT_SECURITY, authoritativeVendor, projectStatusEvent,checkRateLimit} from './netlify/functions/security.js';
/**
 * TrackScore Full-Stack Server
 * Binds to port 3000 and 0.0.0.0
 * Serves static frontend and mounts Netlify Serverless Functions
 */

import express, { Request, Response, NextFunction } from 'express';
import {handler as verifySessionHandler} from './netlify/functions/verify-session.js';
import {spawn, type ChildProcess} from 'node:child_process';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

// Import Netlify function handlers (ESM)
import { handler as saveEvaluationHandler } from './netlify/functions/save-evaluation.js';
import { handler as getEvaluationsHandler } from './netlify/functions/get-evaluations.js';
import { handler as updateEvaluationHandler } from './netlify/functions/update-evaluation.js';
import { handler as deleteEvaluationHandler } from './netlify/functions/delete-evaluation.js';
import { handler as exportEvaluationsHandler } from './netlify/functions/export-evaluations.js';
import { handler as approveEvaluationHandler } from './netlify/functions/approve-evaluation.js';
import { handler as lookupEvaluationHandler } from './netlify/functions/lookup-evaluation.js';
import { handler as statusStreamHandler } from './netlify/functions/status-stream.js';
import { handler as getNotificationsHandler } from './netlify/functions/get-notifications.js';
import { handler as loginHandler } from './netlify/functions/login.js';
import { handler as packagesHandler } from './netlify/functions/packages.js';
import { handler as registerCustomerHandler } from './netlify/functions/register-customer.js';
import { handler as scheduleAssessmentHandler } from './netlify/functions/schedule-assessment.js';
import { handler as assignAssessorHandler } from './netlify/functions/assign-assessor.js';
import { handler as getAssessorWorkloadHandler } from './netlify/functions/get-assessor-workload.js';
import { handler as manageInvoiceHandler } from './netlify/functions/manage-invoice.js';
import { handler as sendPreFinalHandler } from './netlify/functions/send-pre-final.js';
import { handler as verifyPaymentHandler } from './netlify/functions/verify-payment.js';
import { handler as issueCertificateHandler } from './netlify/functions/issue-certificate.js';
import { handler as vendorInviteHandler } from './netlify/functions/vendor-invite.js';
import { handler as vendorLoginHandler } from './netlify/functions/vendor-login.js';
import { handler as vendorPortalDataHandler } from './netlify/functions/vendor-portal-data.js';
import { handler as vendorDocumentsHandler } from './netlify/functions/vendor-documents.js';
import { handler as vendorSubmitPaymentHandler } from './netlify/functions/vendor-submit-payment.js';
import { handler as vendorResubmitHandler } from './netlify/functions/vendor-resubmit.js';
import { handler as vendorProfileHandler } from './netlify/functions/vendor-profile.js';
import { handler as verifyCertificateHandler } from './netlify/functions/verify-certificate.js';
import { handler as manageUsersHandler } from './netlify/functions/manage-users.js';
import { handler as changePasswordHandler } from './netlify/functions/change-password.js';
import { handler as submitInquiryHandler } from './netlify/functions/submit-inquiry.js';
import { handler as manageInquiriesHandler } from './netlify/functions/manage-inquiries.js';
import { handler as getAssessmentHistoryHandler } from './netlify/functions/get-assessment-history.js';
import { handler as getAssessmentVersionHandler } from './netlify/functions/get-assessment-version.js';
import { handler as addCommentHandler } from './netlify/functions/add-comment.js';
import { handler as getAssessmentRiskHandler } from './netlify/functions/get-assessment-risk.js';
import { verifyToken, ROLE_MANAGER, ROLE_ASSESSOR, ROLE_VENDOR } from './netlify/functions/auth.js';
import { statusEmitter, getRecentStatusEvents } from './netlify/functions/status-bus.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://*.hf.co; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production' || process.env.CONTEXT === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '14mb' }));
app.use(express.urlencoded({ extended: false, limit:'14mb', parameterLimit:100 }));

// Helper to bridge Express requests to Netlify serverless function handlers
async function invokeNetlifyHandler(handler: any, req: Request, res: Response) {
  try {
    const event = {
      clientIp: req.ip || req.socket.remoteAddress,
      httpMethod: req.method,
      path: req.path,
      headers: req.headers,
      queryStringParameters: req.query,
      body: typeof req.body === 'object' ? JSON.stringify(req.body) : req.body,
    };
    const context = {};
    const result = await handler(event, context);

    res.status(result.statusCode || 200);
    if (result.headers) {
      for (const [key, value] of Object.entries(result.headers)) {
        res.setHeader(key, value as string);
      }
    }
    if (result.isBase64Encoded) {
      return res.send(Buffer.from(result.body || '', 'base64'));
    }
    return res.send(result.body);
  } catch (error: any) {
    console.error('[server] INTERNAL_ERROR');
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// Health check
app.all(['/api/verify-session','/.netlify/functions/verify-session'],(req: Request,res: Response)=>invokeNetlifyHandler(verifySessionHandler,req,res));

app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    system: 'TrackScore Digital Assessor Evaluation System',
    mongodbConfigured: !!(process.env.MONGODB_URI && process.env.MONGODB_URI.trim().length > 0),
    timestamp: new Date().toISOString()
  });
});

// Client configuration endpoint providing non-secret frontend configuration
app.get(['/api/config.js', '/config.js'], (req: Request, res: Response) => {
  res.type('application/javascript');
  res.send('window.APP_CONFIG = {};');
});

app.get(['/api/config', '/.netlify/functions/config'], (req: Request, res: Response) => {
  res.json({});
});

// Netlify Functions routing
app.all('/.netlify/functions/save-evaluation', (req: Request, res: Response) => {
  return invokeNetlifyHandler(saveEvaluationHandler, req, res);
});

app.all('/.netlify/functions/get-evaluations', (req: Request, res: Response) => {
  return invokeNetlifyHandler(getEvaluationsHandler, req, res);
});

app.all('/.netlify/functions/update-evaluation', (req: Request, res: Response) => {
  return invokeNetlifyHandler(updateEvaluationHandler, req, res);
});

app.all('/.netlify/functions/delete-evaluation', (req: Request, res: Response) => {
  return invokeNetlifyHandler(deleteEvaluationHandler, req, res);
});

app.all('/.netlify/functions/export-evaluations', (req: Request, res: Response) => {
  return invokeNetlifyHandler(exportEvaluationsHandler, req, res);
});

app.all('/.netlify/functions/approve-evaluation', (req: Request, res: Response) => {
  return invokeNetlifyHandler(approveEvaluationHandler, req, res);
});

app.all('/.netlify/functions/lookup-evaluation', (req: Request, res: Response) => {
  return invokeNetlifyHandler(lookupEvaluationHandler, req, res);
});

// Authentication & Users
app.all(['/.netlify/functions/login', '/api/login'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(loginHandler, req, res);
});

app.all(['/.netlify/functions/vendor-login', '/api/vendor-login'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(vendorLoginHandler, req, res);
});

app.all(['/.netlify/functions/manage-users', '/api/manage-users'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(manageUsersHandler, req, res);
});

app.all(['/.netlify/functions/change-password', '/api/change-password'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(changePasswordHandler, req, res);
});

// Full Lifecycle Workflow Handlers
app.all(['/.netlify/functions/packages', '/api/packages'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(packagesHandler, req, res);
});

app.all(['/.netlify/functions/register-customer', '/api/register-customer'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(registerCustomerHandler, req, res);
});

app.all(['/.netlify/functions/schedule-assessment', '/api/schedule-assessment'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(scheduleAssessmentHandler, req, res);
});

app.all(['/.netlify/functions/assign-assessor', '/api/assign-assessor'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(assignAssessorHandler, req, res);
});

app.all(['/.netlify/functions/get-assessor-workload', '/api/get-assessor-workload'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(getAssessorWorkloadHandler, req, res);
});

app.all(['/.netlify/functions/manage-invoice', '/api/manage-invoice'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(manageInvoiceHandler, req, res);
});

app.all(['/.netlify/functions/send-pre-final', '/api/send-pre-final'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(sendPreFinalHandler, req, res);
});

app.all(['/.netlify/functions/verify-payment', '/api/verify-payment'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(verifyPaymentHandler, req, res);
});

app.all(['/.netlify/functions/issue-certificate', '/api/issue-certificate', '/.netlify/functions/manage-certificate', '/api/manage-certificate'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(issueCertificateHandler, req, res);
});

// Vendor Portal & Invitations
app.all(['/.netlify/functions/vendor-invite', '/api/vendor-invite'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(vendorInviteHandler, req, res);
});

app.all(['/.netlify/functions/vendor-portal-data', '/api/vendor-portal-data'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(vendorPortalDataHandler, req, res);
});

app.all(['/.netlify/functions/vendor-documents', '/api/vendor-documents'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(vendorDocumentsHandler, req, res);
});

app.all(['/.netlify/functions/vendor-submit-payment', '/api/vendor-submit-payment'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(vendorSubmitPaymentHandler, req, res);
});

app.all(['/.netlify/functions/vendor-resubmit', '/api/vendor-resubmit'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(vendorResubmitHandler, req, res);
});

app.all(['/.netlify/functions/vendor-profile', '/api/vendor-profile'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(vendorProfileHandler, req, res);
});

app.all(['/.netlify/functions/verify-certificate', '/api/verify-certificate'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(verifyCertificateHandler, req, res);
});

// Public Assessment Intake & Manager Review Queue
app.all(['/.netlify/functions/submit-inquiry', '/api/submit-inquiry'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(submitInquiryHandler, req, res);
});

app.all(['/.netlify/functions/manage-inquiries', '/api/manage-inquiries'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(manageInquiriesHandler, req, res);
});

// Assessment History & Versioning Endpoints
app.all(['/.netlify/functions/get-assessment-history', '/api/get-assessment-history', '/api/assessment-history'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(getAssessmentHistoryHandler, req, res);
});

app.all(['/.netlify/functions/get-assessment-version', '/api/get-assessment-version', '/api/assessment-version'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(getAssessmentVersionHandler, req, res);
});

// Peer Commentary Endpoint
app.all(['/.netlify/functions/add-comment', '/api/add-comment'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(addCommentHandler, req, res);
});

// Assessment Risk & Anomaly Intelligence Endpoint
app.all(['/.netlify/functions/get-assessment-risk', '/api/get-assessment-risk', '/api/assessment-risk'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(getAssessmentRiskHandler, req, res);
});

const activeStatusStreams = new Map<string,number>();
// SSE Status Stream (Feature 2) with Token Authentication & Vendor Scoping
app.get(['/.netlify/functions/status-stream', '/api/status-stream', '/.netlify/functions/stream-status', '/api/stream-status'], async (req: Request, res: Response) => {
  const headers=headersFor({headers:req.headers},ENDPOINT_SECURITY['status-stream']);
  if(!headers)return res.status(403).json({success:false,error:'Access denied for this origin.'});
  for(const [key,value] of Object.entries(headers))res.setHeader(key,String(value));
  const token=String(req.headers.authorization?.replace(/^Bearer\s+/,'')||req.query.token||req.query.auth||'');
  const decoded=verifyToken(token) as any;
  if(!decoded)return res.status(401).json({success:false,error:'Session expired or invalid.'});
  if(decoded.mustChangePassword)return res.status(403).json({success:false,mustChangePassword:true,error:'Password change required.'});
  const requested=String(req.query.assessorId||req.query.assessorName||'').trim().toLowerCase();
  if(decoded.role===ROLE_ASSESSOR && requested && requested!==String(decoded.assessorId||'').toLowerCase()) return res.status(403).json({success:false,error:'Access denied for this status stream.'});
  let account:any=null;
  try {if(decoded.role===ROLE_VENDOR){account=await authoritativeVendor(decoded);if(!account)return res.status(403).json({success:false,error:'Vendor account unavailable.'});}}
  catch {return res.status(503).json({success:false,error:'Server unavailable. Please try again later.'});}
  const streamKey=[decoded.role,decoded.userId||decoded.vendorId||decoded.assessorId||decoded.email||req.ip].join(':');
  if((activeStatusStreams.get(streamKey)||0)>=6 || !checkRateLimit('stream:'+streamKey,600,600000))return res.status(429).json({success:false,error:'Too many status streams. Please try again later.'});
  activeStatusStreams.set(streamKey,(activeStatusStreams.get(streamKey)||0)+1);
  res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-store');res.setHeader('Connection','keep-alive');res.flushHeaders();res.write(': connected\n\n');
  let stopped=false;
  const listener=async(event:any)=>{if(stopped)return;if(decoded.role===ROLE_VENDOR){try{account=await authoritativeVendor(decoded);if(!account){cleanup();res.end();return;}}catch{cleanup();res.end();return;}}if(stopped)return;const projected=projectStatusEvent(event,decoded,account);if(projected)res.write(`data: ${JSON.stringify(projected)}\n\n`);};
  getRecentStatusEvents().forEach(listener);
  statusEmitter.on('status-change',listener);
  const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),25000);
  const expire=setTimeout(()=>{cleanup();res.end();},Math.min(2_147_483_647,Math.max(0,decoded.exp*1000-Date.now())));
  // Recheck Vendor membership during long-lived streams so account changes revoke access.
  const membership=setInterval(async()=>{if(decoded.role!==ROLE_VENDOR||stopped)return;try{const current=await authoritativeVendor(decoded);if(!current){cleanup();res.end();}else account=current;}catch{cleanup();res.end();}},25000);
  function cleanup(){if(stopped)return;stopped=true;const active=(activeStatusStreams.get(streamKey)||1)-1;if(active)activeStatusStreams.set(streamKey,active);else activeStatusStreams.delete(streamKey);clearInterval(heartbeat);clearInterval(membership);clearTimeout(expire);statusEmitter.off('status-change',listener);}
  res.on('close',cleanup);
});

app.all(['/.netlify/functions/status-stream', '/api/status-stream', '/.netlify/functions/stream-status', '/api/stream-status'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(statusStreamHandler, req, res);
});

// Polling notification check (Feature 2 fallback & complement)
app.all(['/.netlify/functions/get-notifications', '/api/get-notifications'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(getNotificationsHandler, req, res);
});

// Aliases for standard API paths
app.all('/api/save-evaluation', (req: Request, res: Response) => {
  return invokeNetlifyHandler(saveEvaluationHandler, req, res);
});

app.all('/api/get-evaluations', (req: Request, res: Response) => {
  return invokeNetlifyHandler(getEvaluationsHandler, req, res);
});

app.all('/api/update-evaluation', (req: Request, res: Response) => {
  return invokeNetlifyHandler(updateEvaluationHandler, req, res);
});

app.all('/api/delete-evaluation', (req: Request, res: Response) => {
  return invokeNetlifyHandler(deleteEvaluationHandler, req, res);
});

app.all('/api/export-evaluations', (req: Request, res: Response) => {
  return invokeNetlifyHandler(exportEvaluationsHandler, req, res);
});

app.all('/api/approve-evaluation', (req: Request, res: Response) => {
  return invokeNetlifyHandler(approveEvaluationHandler, req, res);
});

app.all('/api/lookup-evaluation', (req: Request, res: Response) => {
  return invokeNetlifyHandler(lookupEvaluationHandler, req, res);
});

// Static files serving
const isProduction = process.env.NODE_ENV === 'production';
const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const publicDir = path.join(rootDir, 'public');

// Explicit security middleware to strictly block sensitive paths and internal project files
app.use((req: Request, res: Response, next: NextFunction) => {
  const p = req.path.toLowerCase();
  if (
    p.startsWith('/.') ||
    p.includes('/.') ||
    p === '/package.json' ||
    p === '/bun.lock' ||
    p === '/tsconfig.json' ||
    p === '/server.ts' ||
    p === '/server.cjs' ||
    p === '/server.cjs.map' ||
    p.startsWith('/build/') ||
    p.startsWith('/scripts') ||
    p.startsWith('/tests') ||
    p.startsWith('/netlify') ||
    p.startsWith('/node_modules') ||
    p.startsWith('/src')
  ) {
    return res.status(404).send('Not Found');
  }
  next();
});

// Specific HTML route shortcuts
// Serve generated React output only. Source and repository paths remain blocked.
app.use('/react', (req: Request, res: Response) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(404).send('Not Found');
  if (req.path === '/manager') return res.redirect('/react/manager.html');
  if (req.path === '/assessor') return res.redirect('/react/assessor.html');
  if (req.path === '/vendor') return res.redirect('/react/vendor.html');
  const allowed = req.path === '/manager.html' || req.path === '/assessor.html' || req.path === '/vendor.html' || /^\/assets\/[a-zA-Z0-9_-]+\.(js|css|svg|png|woff2)$/.test(req.path);
  if (!allowed) return res.status(404).send('Not Found');
  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(path.join(distDir, 'react', req.path), err => {
    if (err && !res.headersSent) res.status(404).send('Not Found');
  });
});

app.get(['/', '/landing', '/landing.html'], (req: Request, res: Response) => {
  const target = isProduction && path.join(distDir, 'landing.html');
  res.sendFile(target && path.resolve(target) ? target : path.join(publicDir, 'landing.html'));
});

app.get(['/index.html', '/evaluation', '/evaluation.html', '/eval', '/assessor', '/assessor.html', '/assessor-portal', '/assessor-portal.html'], (req: Request, res: Response) => {
  const target = isProduction && path.join(distDir, 'index.html');
  res.sendFile(target && path.resolve(target) ? target : path.join(publicDir, 'index.html'));
});

app.get(['/request-assessment', '/request-assessment.html'], (req: Request, res: Response) => {
  const target = isProduction && path.join(distDir, 'request-assessment.html');
  res.sendFile(target && path.resolve(target) ? target : path.join(publicDir, 'request-assessment.html'));
});

app.get('/dashboard', (req: Request, res: Response) => {
  const target = isProduction && path.join(distDir, 'dashboard.html');
  res.sendFile(target && path.resolve(target) ? target : path.join(publicDir, 'dashboard.html'));
});

app.get('/dashboard.html', (req: Request, res: Response) => {
  const target = isProduction && path.join(distDir, 'dashboard.html');
  res.sendFile(target && path.resolve(target) ? target : path.join(publicDir, 'dashboard.html'));
});

app.get('/login', (req: Request, res: Response) => {
  const target = isProduction && path.join(distDir, 'login.html');
  res.sendFile(target && path.resolve(target) ? target : path.join(publicDir, 'login.html'));
});

app.get('/login.html', (req: Request, res: Response) => {
  const target = isProduction && path.join(distDir, 'login.html');
  res.sendFile(target && path.resolve(target) ? target : path.join(publicDir, 'login.html'));
});

app.get('/vendor-portal', (req: Request, res: Response) => {
  const target = isProduction && path.join(distDir, 'vendor-portal.html');
  res.sendFile(target && path.resolve(target) ? target : path.join(publicDir, 'vendor-portal.html'));
});

app.get('/vendor-portal.html', (req: Request, res: Response) => {
  const target = isProduction && path.join(distDir, 'vendor-portal.html');
  res.sendFile(target && path.resolve(target) ? target : path.join(publicDir, 'vendor-portal.html'));
});

app.get(['/change-password', '/change-password.html'], (req: Request, res: Response) => {
  const target = isProduction && path.join(distDir, 'change-password.html');
  res.sendFile(target && path.resolve(target) ? target : path.join(publicDir, 'change-password.html'));
});

app.get(['/verify-certificate', '/verify-certificate.html', '/verify', '/verify.html'], (req: Request, res: Response) => {
  const target = isProduction && path.join(distDir, 'verify-certificate.html');
  res.sendFile(target && path.resolve(target) ? target : path.join(publicDir, 'verify-certificate.html'));
});

// Serve ONLY explicitly allowed assets from publicDir (and distDir in production)
// Do NOT serve rootDir!
app.use(express.static(publicDir, { dotfiles: 'ignore', index: false }));
if (fs.existsSync(path.join(distDir, 'assets'))) {
  app.use('/assets', express.static(path.join(distDir, 'assets'), { dotfiles: 'ignore', index: false }));
}
if (isProduction) {
  app.use(express.static(distDir, { dotfiles: 'ignore', index: false }));
}

// Keep JSON parser failures on the same safe API surface as other validation
// errors. Express's default HTML error page includes a stack trace in dev mode.
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return res.end();
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Request body exceeds the 10 MB limit.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Invalid request body.' });
  }
  console.error('[server] REQUEST_FAILED');
  return res.status(500).json({success:false,error:'Server error. Please try again later.'});
});

// Catch-all: block any missing file requests with an extension; otherwise serve landing.html
app.get('*', (req: Request, res: Response) => {
  if (path.extname(req.path)) {
    return res.status(404).send('Not Found');
  }
  res.sendFile(path.join(publicDir, 'landing.html'));
});

async function startServer() {
  let reactWatcher: ChildProcess | undefined;
  const watcherScript = path.join(rootDir, 'scripts/watch-react.mjs');
  if (process.env.NODE_ENV === 'development' && process.env.CONTEXT !== 'production' && fs.existsSync(watcherScript) && fs.existsSync(path.join(rootDir, 'vite.react.config.ts'))) {
    reactWatcher = spawn(process.execPath, [watcherScript], {cwd: rootDir, env: {...process.env, NODE_ENV: 'development'}, stdio: ['ignore', 'inherit', 'inherit', 'ipc']});
    const stopWatcher = () => reactWatcher?.kill('SIGTERM');
    process.on('exit', stopWatcher);
    process.on('SIGINT', () => {stopWatcher(); process.exit(0);});
    process.on('SIGTERM', () => {stopWatcher(); process.exit(0);});
    await new Promise<void>((resolve, reject) => {
      reactWatcher!.on('message', message => {
        if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'react-ready') resolve();
      });
      reactWatcher!.once('error', reject);
      reactWatcher!.once('exit', code => reject(new Error(`React build watcher exited (${code}).`)));
    });
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`TrackScore server running on http://0.0.0.0:${PORT}`));
}
startServer().catch(error => {console.error('Server startup failed:', error.message); process.exit(1);});
