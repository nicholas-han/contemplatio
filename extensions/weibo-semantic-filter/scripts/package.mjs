import {mkdir,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
await mkdir('artifacts',{recursive:true});
const {version}=JSON.parse(await readFile('dist/manifest.json','utf8'));
const artifact=`artifacts/weibo-semantic-filter-${version}.zip`;
execFileSync('zip',['-q','-r','../'+artifact,'.'],{cwd:'dist'});
console.log('Packaged '+artifact);
