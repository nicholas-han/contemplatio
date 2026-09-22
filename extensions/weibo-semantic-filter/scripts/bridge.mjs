// Development only. Talks to the installed Kimi WebBridge; never included in the extension.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const [action, argument, output] = process.argv.slice(2);
const args = action === 'evaluate-file' ? { code: await readFile(argument, 'utf8') } : JSON.parse(argument ?? '{}');
const response = await fetch('http://127.0.0.1:10086/command', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: action === 'evaluate-file' ? 'evaluate' : action, args, session: 'weibo-extension-build' }), signal: AbortSignal.timeout(30000) });
const result = await response.json();
if (!result.ok) throw new Error(JSON.stringify(result.error));
if (output) { await mkdir(new URL('../.local/', import.meta.url), { recursive: true }); await writeFile(output, JSON.stringify(result.data.value ?? result.data)); console.log('Saved browser result to', output); }
else console.log(JSON.stringify(result.data));
