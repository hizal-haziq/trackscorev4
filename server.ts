/**
 * TrackScore Full-Stack Server
 * Binds to port 3000 and 0.0.0.0
 * Serves static frontend and mounts Netlify Serverless Functions
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ override: true });
if (!process.env.MONGODB_URI || process.env.MONGODB_URI.includes('<username>')) {
  dotenv.config({ path: path.join(process.cwd(), '.env.example'), override: true });
}

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
import { handler as manageInvoiceHandler } from './netlify/functions/manage-invoice.js';
import { handler as sendPreFinalHandler } from './netlify/functions/send-pre-final.js';
import { handler as verifyPaymentHandler } from './netlify/functions/verify-payment.js';
import { handler as issueCertificateHandler } from './netlify/functions/issue-certificate.js';
import { handler as vendorInviteHandler } from './netlify/functions/vendor-invite.js';
import { handler as vendorLoginHandler } from './netlify/functions/vendor-login.js';
import { handler as vendorPortalDataHandler } from './netlify/functions/vendor-portal-data.js';
import { handler as manageUsersHandler } from './netlify/functions/manage-users.js';
import { handler as changePasswordHandler } from './netlify/functions/change-password.js';
import { handler as submitInquiryHandler } from './netlify/functions/submit-inquiry.js';
import { handler as manageInquiriesHandler } from './netlify/functions/manage-inquiries.js';
import { statusEmitter, getRecentStatusEvents } from './netlify/functions/status-bus.js';

const app = express();
const PORT = 3000;

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
    return res.send(result.body);
  } catch (error: any) {
    console.error('Serverless execution error:', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
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

// Public Assessment Intake & Manager Review Queue
app.all(['/.netlify/functions/submit-inquiry', '/api/submit-inquiry'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(submitInquiryHandler, req, res);
});

app.all(['/.netlify/functions/manage-inquiries', '/api/manage-inquiries'], (req: Request, res: Response) => {
  return invokeNetlifyHandler(manageInquiriesHandler, req, res);
});

// SSE Status Stream (Feature 2)
app.get(['/.netlify/functions/status-stream', '/api/status-stream'], (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  const assessorQuery = (req.query.assessorName as string || req.query.assessorId as string || req.query.assessor as string || '').trim().toLowerCase();
  const normalizedAssessorQuery = assessorQuery || undefined;
  res.write(`: connected\n\n`);

  // Stream recent events
  const recent = getRecentStatusEvents(normalizedAssessorQuery as any);
  recent.forEach((e: any) => {
    res.write(`data: ${JSON.stringify(e)}\n\n`);
  });

  const listener = (event: any) => {
    if (assessorQuery) {
      const eAssessorId = String(event.assessorId || event.assignedAssessorId || '').trim().toLowerCase();
      const eAssessorName = String(event.assessorName || event.assignedAssessor || event.assignedAssessorName || '').trim().toLowerCase();
      const eAssessorEmail = String(event.assessorEmail || event.assignedAssessorEmail || '').trim().toLowerCase();
      const matches = eAssessorId === assessorQuery || 
                      eAssessorName === assessorQuery || 
                      (assessorQuery.length >= 3 && eAssessorName.includes(assessorQuery)) || 
                      (eAssessorName.length >= 3 && assessorQuery.includes(eAssessorName)) ||
                      (assessorQuery.includes('@') && eAssessorEmail === assessorQuery);
      if (!matches) {
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

app.all(['/.netlify/functions/status-stream', '/api/status-stream'], (req: Request, res: Response) => {
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

// Serve ONLY explicitly allowed assets from publicDir (and distDir in production)
// Do NOT serve rootDir!
app.use(express.static(publicDir, { dotfiles: 'ignore', index: false }));
if (isProduction) {
  app.use(express.static(distDir, { dotfiles: 'ignore', index: false }));
}

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
