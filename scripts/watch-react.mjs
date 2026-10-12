// Isolate Vite's development environment from Express authentication.
import {build} from 'vite';
import path from 'node:path';
const watcher = await build({configFile: path.resolve('vite.react.config.ts'), mode: 'development', build: {watch: {}, emptyOutDir: false}});
if (!watcher || !('on' in watcher)) throw new Error('React build watcher did not start.');
let ready = false;
watcher.on('event', event => {
  if (event.code === 'END' && !ready) {ready = true; process.send?.({type: 'react-ready'});}
  if (event.code === 'ERROR') {
    console.error('React build failed:', event.error.message);
    if (!ready) watcher.close().finally(() => process.exit(1));
  }
});
const stop = async () => {await watcher.close(); process.exit();};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.on('disconnect', stop);
