// Bundle the audited PDF dependencies locally; legacy loaders keep their API.
import {build} from 'esbuild';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
await build({stdin:{contents:"import html2pdf from 'html2pdf.js'; window.html2pdf = html2pdf;",resolveDir:root,loader:'js'},bundle:true,platform:'browser',format:'iife',target:'es2020',minify:true,sourcemap:false,outfile:path.join(root,'public/pdf-engine.js'),logLevel:'info'});
