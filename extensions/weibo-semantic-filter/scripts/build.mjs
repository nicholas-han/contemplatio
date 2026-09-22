import {build} from 'esbuild';
import {mkdir,copyFile,rm} from 'node:fs/promises';
await rm(new URL('../dist/',import.meta.url),{recursive:true,force:true});
await mkdir(new URL('../dist/',import.meta.url),{recursive:true});
await build({entryPoints:{content:'src/content/index.ts',background:'src/background/service-worker.ts',popup:'src/ui/popup.ts',options:'src/ui/options.ts'},bundle:true,outdir:'dist',format:'iife',target:'chrome120',sourcemap:false,legalComments:'none'});
for(const file of ['popup.html','options.html','ui.css'])await copyFile('src/ui/'+file,'dist/'+file);
await copyFile('manifest.json','dist/manifest.json');
console.log('Built extension: dist/');
