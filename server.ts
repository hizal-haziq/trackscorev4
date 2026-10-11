/**
 * TrackScore Full-Stack Server
 * Binds to port 3000 and 0.0.0.0
 * Serves static frontend and mounts Netlify Serverless Functions
 */

import express, { Request, Response, NextFunction } from 'express';
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
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production' || process.env.CONTEXT === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Helper to bridge Express requests to Netlify serverless function handlers
async function invokeNetlifyHandler(handler: any, req: Request, res: Response) {
  try {
    const event = {
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
    console.error('Serverless execution error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// Health check
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

// SSE Status Stream (Feature 2) with Token Authentication & Vendor Scoping
app.get(['/.netlify/functions/status-stream', '/api/status-stream', '/.netlify/functions/stream-status', '/api/stream-status'], (req: Request, res: Response) => {
  const authHeader = (req.headers['authorization'] || req.headers['Authorization']) as string;
  let token = (req.query.token || req.query.auth) as string;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  const decoded = (token ? verifyToken(token) : null) as any;
  if (!decoded || !decoded.role) {
    res.status(401).json({ success: false, error: 'Unauthorized: Valid Bearer token required for status stream.' });
    return;
  }

  const userRole = decoded.role;
  if (![ROLE_MANAGER, ROLE_ASSESSOR, ROLE_VENDOR].includes(userRole)) {
    res.status(403).json({ success: false, error: 'Forbidden: Insufficient privileges for status stream.' });
    return;
  }
  if (userRole === ROLE_ASSESSOR) {
    const assessorId = String(decoded.assessorId || '').trim();
    const requestedAssessor = String(req.query.assessorId || req.query.assessorName || '').trim();
    if (!assessorId || (requestedAssessor && requestedAssessor.toLowerCase() !== assessorId.toLowerCase())) {
      res.status(403).json({ success: false, error: 'Forbidden: Assessor identity is required and status streams are restricted to your own identity.' });
      return;
    }
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  res.write(`: connected\n\n`);

  const vendorLinkedIds = userRole === ROLE_VENDOR
    ? (Array.isArray(decoded.linkedRegistrationIds) ? decoded.linkedRegistrationIds.map(String) : [])
    : null;

  const sanitizeEventForVendor = (e: any) => ({
    id: e.id,
    evaluationId: e.evaluationId,
    companyName: e.companyName,
    deviceModel: e.deviceModel,
    status: e.status || e.newStatus,
    newStatus: e.newStatus,
    note: e.note,
    timestamp: e.timestamp,
    slaDeadline: e.slaDeadline,
    slaStatus: e.slaStatus
  });

  // Stream recent events
  const recent = getRecentStatusEvents();
  recent.forEach((e: any) => {
    if (userRole === ROLE_VENDOR) {
      if (vendorLinkedIds && vendorLinkedIds.includes(String(e.evaluationId || e.id))) {
        res.write(`data: ${JSON.stringify(sanitizeEventForVendor(e))}\n\n`);
      }
    } else if (userRole === ROLE_ASSESSOR) {
      const assessorId = String(decoded.assessorId || '').toLowerCase();
      const eAssessorId = String(e.assessorId || e.assignedAssessorId || '').toLowerCase();
      if (!assessorId || eAssessorId === assessorId) {
        res.write(`data: ${JSON.stringify(e)}\n\n`);
      }
    } else {
      res.write(`data: ${JSON.stringify(e)}\n\n`);
    }
  });

  const listener = (event: any) => {
    if (userRole === ROLE_VENDOR) {
      if (vendorLinkedIds && vendorLinkedIds.includes(String(event.evaluationId || event.id))) {
        res.write(`data: ${JSON.stringify(sanitizeEventForVendor(event))}\n\n`);
      }
      return;
    }
    if (userRole === ROLE_ASSESSOR) {
      const assessorId = String(decoded.assessorId || '').toLowerCase();
      const eAssessorId = String(event.assessorId || event.assignedAssessorId || '').toLowerCase();
      if (assessorId && eAssessorId !== assessorId) {
        return;
      }
    }
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  statusEmitter.on('status-change', listener);

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    statusEmitter.off('status-change', listener);
  });
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

app.get(['/react/manager', '/react/manager.html'], (req: Request, res: Response) => {
  const distReactManager = path.join(distDir, 'react/manager.html');
  if (fs.existsSync(distReactManager)) {
    return res.sendFile(distReactManager);
  }
  const rootReactManager = path.join(rootDir, 'react/manager.html');
  if (fs.existsSync(rootReactManager)) {
    return res.sendFile(rootReactManager);
  }
  res.status(404).send('Not Found');
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
  if (res.headersSent) return next(err);
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Request body exceeds the 10 MB limit.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Invalid request body.' });
  }
  return next(err);
});

// Catch-all: block any missing file requests with an extension; otherwise serve landing.html
app.get('*', (req: Request, res: Response) => {
  if (path.extname(req.path)) {
    return res.status(404).send('Not Found');
  }
  res.sendFile(path.join(publicDir, 'landing.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`TrackScore server running on http://0.0.0.0:${PORT}`);
});
