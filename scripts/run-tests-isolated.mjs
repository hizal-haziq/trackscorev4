// Test fixtures must never be written to the application's .data or live Atlas.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'trackscore-tests-'));
let exitCode = 1;
try {
  for (const name of ['tests', 'netlify', 'public', 'src']) fs.cpSync(path.join(root, name), path.join(workspace, name), { recursive: true });
  for (const name of fs.readdirSync(root).filter(name => /\.(html|js|css|svg|json)$/.test(name))) {
    if (fs.statSync(path.join(root, name)).isFile()) fs.copyFileSync(path.join(root, name), path.join(workspace, name));
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'), 'junction');
  const files = fs.readdirSync(path.join(workspace, 'tests')).filter(name => name.endsWith('.test.js')).map(name => `tests/${name}`);
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', ...files], {
    cwd: workspace, stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test', CONTEXT: 'test', MONGODB_URI: '', JWT_SECRET: crypto.randomBytes(32).toString('hex'), AUTO_SEED_DEFAULT_USERS: 'false', RESEND_API_KEY: '', SMTP_PASSWORD: '' }
  });
  if (result.error) throw result.error;
  exitCode = result.status ?? 1;
} finally {
  // Unlink the junction first so cleanup cannot traverse shared dependencies.
  const junction = path.join(workspace, 'node_modules');
  if (fs.existsSync(junction)) fs.unlinkSync(junction);
  const target = fs.realpathSync(workspace);
  const tempRoot = fs.realpathSync(os.tmpdir());
  if (path.dirname(target) !== tempRoot || !path.basename(target).startsWith('trackscore-tests-')) throw new Error('Unexpected test cleanup target');
  fs.rmSync(target, { recursive: true, force: true });
}
process.exitCode = exitCode;
