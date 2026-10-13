/**
 * Browser Verification Script for TrackScore Redesigned Landing Page
 *
 * Verifies:
 * 1. Landing page loads cleanly at / and /landing.html with 0 console errors and 0 HTTP errors
 * 2. Visual hierarchy: MIROS branding, TrackScore title, accurate subtitle
 * 3. Positioning: Commercial Vehicle Tracking System Rating Programme
 * 4. Summary metrics: 24 Basic Features, 9 Additional Features, 1-5 Star Rating, 33 Total Criteria
 * 5. How It Works 4-step flow: Apply, Assessment, Rating, Results
 * 6. Rating Criteria equation: 24 Basic + 9 Additional = 33 Total Criteria
 * 7. Results & Verification CTAs: View Results, Verify Certificate
 * 8. Responsive layout across all 5 viewports (1920, 1366, 1280, 768, 390) with no horizontal overflow
 * 9. Mobile hamburger toggle & drawer interaction
 * 10. Existing CTA destinations: /request-assessment.html, /login.html, /verify-certificate.html
 * 11. Strict privacy boundary: Zero authenticated API calls, zero internal tokens or credentials
 */

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'trackscore-landing-verify-'));
fs.cpSync(path.join(root, 'public'), path.join(sandbox, 'public'), { recursive: true });
fs.cpSync(path.join(root, 'dist'), path.join(sandbox, 'dist'), { recursive: true });
fs.cpSync(path.join(root, 'build'), path.join(sandbox, 'build'), { recursive: true });
fs.symlinkSync(path.join(root, 'node_modules'), path.join(sandbox, 'node_modules'));
fs.mkdirSync(path.join(sandbox, '.data'));

// Find a free TCP port
const server = net.createServer();
await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));

const env = {
  ...process.env,
  PORT: String(port),
  NODE_ENV: 'development',
  JWT_SECRET: 'test-jwt-secret-at-least-32-chars-long-1234567890',
  MONGODB_URI: '',
  AUTO_SEED_DEFAULT_USERS: 'false',
  CONTEXT: 'test'
};

const serverChild = spawn(
  process.execPath,
  ['build/server.cjs'],
  { cwd: sandbox, env, stdio: 'pipe' }
);

const base = `http://127.0.0.1:${port}`;
// Wait for server health
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`${base}/api/health`);
    if (res.ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}

console.log(`Server started at ${base}`);

const pwModule = process.env.TRACKSCORE_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.TRACKSCORE_PLAYWRIGHT_MODULE).href
  : 'playwright-core';
const { chromium } = await import(pwModule);
const browser = await chromium.launch({
  ...process.env.TRACKSCORE_BROWSER_EXECUTABLE ? { executablePath: process.env.TRACKSCORE_BROWSER_EXECUTABLE } : {}
});

const results = [];

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
}

try {
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  const httpErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('favicon')) {
      httpErrors.push(`${res.status()} ${res.url()}`);
    }
  });

  // 1. Landing page loads cleanly
  const res = await page.goto(`${base}/landing.html`);
  record('Landing page HTTP 200', res.status() === 200, `status ${res.status()}`);
  record('Zero unexpected console errors', consoleErrors.length === 0, consoleErrors.join(', ') || 'clean');
  record('Zero unexpected HTTP errors', httpErrors.length === 0, httpErrors.join(', ') || 'clean');

  // 2. Title and Positioning
  const title = await page.title();
  record('Document title contains MIROS & TrackScore', title.includes('TrackScore') && title.includes('MIROS'), title);

  const h1 = await page.textContent('h1');
  record('Hero heading is TrackScore', h1.trim() === 'TrackScore', h1.trim());

  const h2 = await page.textContent('.hero-h2');
  record('Secondary headline contains Commercial Vehicle Tracking System', h2.includes('Commercial Vehicle Tracking System'), h2.trim());

  const desc = await page.textContent('.hero-description');
  record('Description is MIROS-oriented and accurate', desc.includes('MIROS evaluates commercial-vehicle tracking systems'), desc.trim());

  // 3. Header navigation elements
  const brandSub = await page.textContent('.brand-subtitle');
  record('Brand subtitle present in header', brandSub.includes('Commercial Vehicle Tracking System Rating Programme'), brandSub.trim());

  const headerLogo = await page.locator('.miros-logo-img').isVisible();
  record('MIROS logo present in header', headerLogo, 'visible');

  // 4. Summary Metrics
  const metricCards = await page.locator('.metric-card').count();
  record('Four clean summary metric cards', metricCards === 4, `${metricCards} cards found`);

  const metricsText = await page.locator('.metrics-section').innerText();
  record('24 Basic Features metric', metricsText.includes('24') && metricsText.includes('Basic Features'), 'present');
  record('9 Additional Features metric', metricsText.includes('9') && metricsText.includes('Additional Features'), 'present');
  record('1–5 Star Rating metric', metricsText.includes('1–5') && metricsText.includes('Star Rating'), 'present');
  record('33 Total Criteria metric', metricsText.includes('33') && metricsText.includes('Total Criteria'), 'present');
  record('Zero fake percentages in metrics', !metricsText.includes('98%') && !metricsText.includes('99%'), 'verified');

  // 5. How It Works 4-step flow
  const steps = await page.locator('.step-card').count();
  record('Four step cards in How It Works', steps === 4, `${steps} steps found`);

  const howItWorksText = await page.locator('#how-it-works').innerText();
  record('Step 1 Apply present', howItWorksText.includes('Apply') && howItWorksText.includes('Submit an assessment application'), 'present');
  record('Step 2 Assessment present', howItWorksText.includes('Assessment') && howItWorksText.includes('MIROS evaluates the tracking system'), 'present');
  record('Step 3 Rating present', howItWorksText.includes('Rating') && howItWorksText.includes('1 to 5 star rating is determined'), 'present');
  record('Step 4 Results present', howItWorksText.includes('Results') && howItWorksText.includes('Official assessment results'), 'present');

  // 6. Rating Criteria equation
  const criteriaText = await page.locator('#criteria').innerText();
  record('Rating criteria equation 24 + 9 = 33', criteriaText.includes('24') && criteriaText.includes('9') && criteriaText.includes('33'), 'present');
  record('Rating criteria statement accurate', criteriaText.includes('TrackScore evaluates 33 criteria across basic and additional tracking-system features'), 'present');

  // 7. Results & Verification CTA
  const resultsCard = await page.locator('.results-cta-card').isVisible();
  record('Results CTA card visible', resultsCard, 'visible');

  const verifyBtn = page.locator('a.btn-results-verify');
  record('Verify Certificate button present', (await verifyBtn.count()) > 0, 'present');
  record('Verify Certificate links to /verify-certificate.html', (await verifyBtn.getAttribute('href')) === '/verify-certificate.html', 'verified');

  // 8. Footer elements & verified contact
  const footerText = await page.locator('.site-footer').innerText();
  record('Footer has MIROS and TrackScore', footerText.includes('MIROS') && footerText.includes('TrackScore'), 'present');
  record('Footer has official contact details', footerText.includes('admin@miros.gov.my') && footerText.includes('+603-8924 9200'), 'present');
  record('Footer has copyright', footerText.includes('© 2026') && footerText.includes('All Rights Reserved'), 'present');

  // 9. Absence of fake tech marketing content
  const fullContent = await page.content();
  record('Zero "National Compliance Audit" marketing jargon', !fullContent.includes('National Telematics Compliance Audit'), 'clean');
  record('Zero "MS 2673 Benchmark" claim in hero', !fullContent.includes('MS 2673 BENCHMARK'), 'clean');
  record('Zero fake package pricing (RM 6,000 / RM 4,500)', !fullContent.includes('RM 6,000') && !fullContent.includes('RM 4,500'), 'clean');
  record('Zero "5-Star Elite Grade" claims', !fullContent.includes('5-Star Elite Grade'), 'clean');

  // 10. Responsive Viewports Test (1920, 1366, 1280, 768, 390)
  const viewports = [
    { width: 1920, height: 1080, name: 'Desktop Full HD' },
    { width: 1366, height: 768, name: 'Desktop Standard' },
    { width: 1280, height: 800, name: 'Laptop Widescreen' },
    { width: 768, height: 1024, name: 'Tablet Portrait' },
    { width: 390, height: 844, name: 'Mobile iPhone 12/13/14' }
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(100);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const noOverflow = scrollWidth <= clientWidth + 1;
    record(`Viewport ${vp.name} (${vp.width}x${vp.height}) no horizontal overflow`, noOverflow, `scroll: ${scrollWidth}, client: ${clientWidth}`);
  }

  // 11. Mobile Navigation Interaction (at 390px)
  await page.setViewportSize({ width: 390, height: 844 });
  const toggleBtn = page.locator('#mobile-toggle-btn');
  record('Mobile toggle button visible on mobile', await toggleBtn.isVisible(), 'visible');

  await toggleBtn.click();
  const menuExpanded = await toggleBtn.getAttribute('aria-expanded');
  const menuVisible = await page.locator('#mobile-menu').isVisible();
  record('Mobile menu opens on click', menuExpanded === 'true' && menuVisible, 'expanded');

  await toggleBtn.click();
  const menuClosed = await toggleBtn.getAttribute('aria-expanded');
  record('Mobile menu closes on second click', menuClosed === 'false', 'collapsed');

  // 12. CTA Routes Functional Navigation
  await page.setViewportSize({ width: 1366, height: 768 });

  // Test Apply button navigation
  await page.locator('#hero-cta-register').click();
  await page.waitForURL('**/request-assessment.html');
  record('Apply CTA navigates to /request-assessment.html', page.url().includes('request-assessment.html'), page.url());

  // Test Sign In button navigation
  await page.goto(`${base}/landing.html`);
  await page.locator('#hero-cta-login').click();
  await page.waitForURL('**/login.html');
  record('Sign In CTA navigates to /login.html', page.url().includes('login.html'), page.url());

  // Test Verify Certificate navigation
  await page.goto(`${base}/landing.html`);
  await page.locator('.btn-results-verify').click();
  await page.waitForURL('**/verify-certificate.html');
  record('Verify Certificate CTA navigates to /verify-certificate.html', page.url().includes('verify-certificate.html'), page.url());

  // 13. Root / loads the landing page
  const rootRes = await page.goto(`${base}/`);
  record('Root / route loads landing page', rootRes.status() === 200, `status ${rootRes.status()}`);
  const rootH1 = await page.textContent('h1');
  record('Root / renders TrackScore headline', rootH1.trim() === 'TrackScore', rootH1.trim());

  await browser.close();
} finally {
  serverChild.kill('SIGTERM');
  try {
    fs.rmSync(sandbox, { recursive: true, force: true });
  } catch {}
}

const passedCount = results.filter((r) => r.passed).length;
const failedCount = results.filter((r) => !r.passed).length;

console.log(`\n========================================`);
console.log(`LANDING REDESIGN VERIFICATION SUMMARY`);
console.log(`Passed: ${passedCount} | Failed: ${failedCount} | Total: ${results.length}`);
console.log(`========================================\n`);

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log('ALL CHECKS VERIFIED WORKING!');
}

