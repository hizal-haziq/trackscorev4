import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'trackscore-landing-inspect-'));
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

const viewports = [
  { name: 'PHONE-320', width: 320, height: 568 },
  { name: 'PHONE-360', width: 360, height: 800 },
  { name: 'PHONE-390', width: 390, height: 844 },
  { name: 'PHONE-430', width: 430, height: 932 },
  { name: 'TABLET-768', width: 768, height: 1024 },
  { name: 'TABLET-820', width: 820, height: 1180 },
  { name: 'LAPTOP-1024', width: 1024, height: 768 },
  { name: 'LAPTOP-1280', width: 1280, height: 800 },
  { name: 'LAPTOP-1366', width: 1366, height: 768 },
  { name: 'DESKTOP-1440', width: 1440, height: 900 },
  { name: 'DESKTOP-1920', width: 1920, height: 1080 },
];

const inspectionReport = [];

try {
  const context = await browser.newContext();
  const page = await context.newPage();

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${base}/landing.html`, { waitUntil: 'networkidle' });

    const metrics = await page.evaluate(() => {
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      const hasHorizontalScroll = docW > winW;

      // Find any overflowing elements
      const allElements = Array.from(document.querySelectorAll('*'));
      const overflowingElements = [];
      for (const el of allElements) {
        const r = el.getBoundingClientRect();
        if (r.right > winW + 1) { // 1px tolerance for subpixel rounding
          overflowingElements.push({
            tag: el.tagName,
            id: el.id,
            className: typeof el.className === 'string' ? el.className.slice(0, 50) : '',
            right: Math.round(r.right),
            width: Math.round(r.width)
          });
        }
      }

      // Check header
      const headerInner = document.querySelector('.header-inner');
      const headerInnerH = headerInner ? headerInner.getBoundingClientRect().height : 0;
      const brandName = document.querySelector('.brand-name');
      const brandNameFontSize = brandName ? window.getComputedStyle(brandName).fontSize : '';
      const desktopNav = document.querySelector('.desktop-nav');
      const desktopNavDisplay = desktopNav ? window.getComputedStyle(desktopNav).display : '';
      const mobileToggle = document.querySelector('.mobile-toggle');
      const mobileToggleDisplay = mobileToggle ? window.getComputedStyle(mobileToggle).display : '';

      // Check hero
      const heroH1 = document.querySelector('.hero-h1');
      const heroH1Style = heroH1 ? window.getComputedStyle(heroH1) : null;
      const heroH1Rect = heroH1 ? heroH1.getBoundingClientRect() : null;

      const heroH2 = document.querySelector('.hero-h2');
      const heroH2Style = heroH2 ? window.getComputedStyle(heroH2) : null;

      const heroDesc = document.querySelector('.hero-description');
      const heroDescStyle = heroDesc ? window.getComputedStyle(heroDesc) : null;

      const heroBtnRow = document.querySelector('.hero-btn-row');
      const heroBtnRowStyle = heroBtnRow ? window.getComputedStyle(heroBtnRow) : null;
      const heroPrimaryBtn = document.querySelector('.btn-hero-primary');
      const heroPrimaryBtnRect = heroPrimaryBtn ? heroPrimaryBtn.getBoundingClientRect() : null;
      const heroSecondaryBtn = document.querySelector('.btn-hero-secondary');
      const heroSecondaryBtnRect = heroSecondaryBtn ? heroSecondaryBtn.getBoundingClientRect() : null;

      // Check touch targets under 44px
      const clickables = Array.from(document.querySelectorAll('a, button'));
      const smallTouchTargets = [];
      for (const el of clickables) {
        if (window.getComputedStyle(el).display === 'none') continue;
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.height < 44) {
          smallTouchTargets.push({
            text: el.textContent.trim().slice(0, 30),
            className: typeof el.className === 'string' ? el.className : '',
            height: Math.round(r.height)
          });
        }
      }

      // Check metrics grid
      const metricsGrid = document.querySelector('.metrics-grid');
      const metricsGridCols = metricsGrid ? window.getComputedStyle(metricsGrid).gridTemplateColumns.split(' ').length : 0;

      // Check steps grid
      const stepsGrid = document.querySelector('.steps-grid');
      const stepsGridCols = stepsGrid ? window.getComputedStyle(stepsGrid).gridTemplateColumns.split(' ').length : 0;

      // Check equation grid
      const equationGrid = document.querySelector('.equation-grid');
      const equationGridCols = equationGrid ? window.getComputedStyle(equationGrid).gridTemplateColumns.split(' ').length : 0;

      // Check results card
      const resultsCard = document.querySelector('.results-cta-card');
      const resultsCardStyle = resultsCard ? window.getComputedStyle(resultsCard) : null;

      // Check footer grid
      const footerGrid = document.querySelector('.footer-grid');
      const footerGridCols = footerGrid ? window.getComputedStyle(footerGrid).gridTemplateColumns.split(' ').length : 0;

      return {
        docW,
        winW,
        hasHorizontalScroll,
        overflowingElements: overflowingElements.slice(0, 5),
        header: {
          height: headerInnerH,
          brandNameFontSize,
          desktopNavDisplay,
          mobileToggleDisplay
        },
        hero: {
          h1FontSize: heroH1Style ? heroH1Style.fontSize : '',
          h1LineHeight: heroH1Style ? heroH1Style.lineHeight : '',
          h1Width: heroH1Rect ? Math.round(heroH1Rect.width) : 0,
          h2FontSize: heroH2Style ? heroH2Style.fontSize : '',
          descFontSize: heroDescStyle ? heroDescStyle.fontSize : '',
          btnRowFlexDir: heroBtnRowStyle ? heroBtnRowStyle.flexDirection : '',
          btnRowFlexWrap: heroBtnRowStyle ? heroBtnRowStyle.flexWrap : '',
          primaryBtnH: heroPrimaryBtnRect ? Math.round(heroPrimaryBtnRect.height) : 0,
          primaryBtnW: heroPrimaryBtnRect ? Math.round(heroPrimaryBtnRect.width) : 0,
          secondaryBtnH: heroSecondaryBtnRect ? Math.round(heroSecondaryBtnRect.height) : 0,
          secondaryBtnW: heroSecondaryBtnRect ? Math.round(heroSecondaryBtnRect.width) : 0,
        },
        smallTouchTargets: smallTouchTargets.slice(0, 5),
        columns: {
          metrics: metricsGridCols,
          steps: stepsGridCols,
          equation: equationGridCols,
          footer: footerGridCols
        },
        resultsFlexDir: resultsCardStyle ? resultsCardStyle.flexDirection : ''
      };
    });

    inspectionReport.push({ viewport: vp, ...metrics });
  }

  console.log(JSON.stringify(inspectionReport, null, 2));

} finally {
  await browser.close();
  serverChild.kill('SIGTERM');
  fs.rmSync(sandbox, { recursive: true, force: true });
}

