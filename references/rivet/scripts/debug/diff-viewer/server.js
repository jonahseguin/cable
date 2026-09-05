import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const d2hJs = readFileSync(require.resolve('diff2html/bundles/js/diff2html.min.js'), 'utf8');
const d2hCss = readFileSync(require.resolve('diff2html/bundles/css/diff2html.min.css'), 'utf8');

const args = process.argv.slice(2);
let portArg = 3737;
const positional = [];
for (let i = 0; i < args.length; i++) {
	if (args[i] === '--port' || args[i] === '-p') portArg = +args[++i];
	else positional.push(args[i]);
}

if (positional.length === 0) {
	console.error('usage: node server.js <patch-file | git-range | dir> [--port N]');
	console.error('  patch-file: path to a unified diff file');
	console.error('  git-range:  e.g. "abc123..HEAD" or "main..HEAD" — runs git diff in cwd');
	console.error('  dir:        path to a git repo, diffs HEAD vs working tree');
	process.exit(1);
}

const target = positional[0];
let patch;
try {
	const st = statSync(target);
	if (st.isDirectory()) {
		patch = execFileSync('git', ['-C', resolve(target), 'diff', 'HEAD'], { maxBuffer: 1024 ** 3 }).toString('utf8');
	} else {
		patch = readFileSync(target, 'utf8');
	}
} catch {
	patch = execFileSync('git', ['diff', target], { maxBuffer: 1024 ** 3 }).toString('utf8');
}

if (!patch.trim()) {
	console.error('empty diff');
	process.exit(1);
}

const files = [];
{
	const lines = patch.split('\n');
	let current = null;
	for (const line of lines) {
		if (line.startsWith('diff --git ')) {
			if (current) files.push(current);
			const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
			const path = m ? m[2] : line;
			current = { path, content: line + '\n', adds: 0, dels: 0 };
		} else if (current) {
			current.content += line + '\n';
			if (line.startsWith('+') && !line.startsWith('+++')) current.adds++;
			else if (line.startsWith('-') && !line.startsWith('---')) current.dels++;
		}
	}
	if (current) files.push(current);
}

const app = new Hono();

app.get('/diff2html.js', (c) => c.body(d2hJs, 200, { 'content-type': 'application/javascript' }));
app.get('/diff2html.css', (c) => c.body(d2hCss, 200, { 'content-type': 'text/css' }));

app.get('/', (c) => {
	const items = files
		.map((f, i) => `<li><a href="/file/${i}"><span class="p">${escape(f.path)}</span> <span class="a">+${f.adds}</span> <span class="d">-${f.dels}</span></a></li>`)
		.join('');
	return c.html(`<!doctype html><html><head><title>Diff Viewer</title>
<style>
body{font-family:system-ui;margin:0;padding:20px;background:#0d1117;color:#c9d1d9}
h1{font-size:18px}
ul{list-style:none;padding:0;font-family:ui-monospace,monospace;font-size:13px}
li{padding:2px 0}
a{color:#58a6ff;text-decoration:none}
a:hover{text-decoration:underline}
.a{color:#3fb950}.d{color:#f85149}
.search{width:100%;padding:8px;background:#161b22;color:#c9d1d9;border:1px solid #30363d;border-radius:6px;margin-bottom:10px;font-family:inherit}
</style></head><body>
<h1>Diff Viewer — ${files.length} files</h1>
<input class="search" placeholder="filter files..." oninput="document.querySelectorAll('li').forEach(li=>{li.style.display=li.textContent.toLowerCase().includes(this.value.toLowerCase())?'':'none'})">
<ul>${items}</ul>
</body></html>`);
});

app.get('/file/:i', (c) => {
	const i = +c.req.param('i');
	const f = files[i];
	if (!f) return c.text('not found', 404);
	const prev = i > 0 ? `<a href="/file/${i - 1}">← prev</a>` : '';
	const next = i < files.length - 1 ? `<a href="/file/${i + 1}">next →</a>` : '';
	return c.html(`<!doctype html><html><head><title>${escape(f.path)}</title>
<link rel="stylesheet" href="/diff2html.css">
<style>
body{margin:0;font-family:system-ui;background:#0d1117;color:#c9d1d9}
.bar{padding:10px 20px;background:#161b22;border-bottom:1px solid #30363d;display:flex;gap:20px;align-items:center;position:sticky;top:0;z-index:10}
.bar a{color:#58a6ff;text-decoration:none}
.path{font-family:ui-monospace,monospace;font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis}
#out{padding:10px}
.d2h-wrapper{color:#c9d1d9}
.d2h-file-header{background:#161b22!important;border-color:#30363d!important;color:#c9d1d9}
.d2h-file-name{color:#c9d1d9}
.d2h-file-wrapper{border-color:#30363d!important;background:#0d1117}
.d2h-code-line,.d2h-code-side-line{color:#c9d1d9}
.d2h-code-linenumber,.d2h-code-side-linenumber{background:#161b22!important;border-color:#30363d!important;color:#7d8590!important}
.d2h-diff-table{color:#c9d1d9}
.d2h-diff-tbody{background:#0d1117}
.d2h-ins{background:#033a16!important;border-color:#196c2e!important}
.d2h-ins.d2h-change{background:#0c3a1c!important}
.d2h-del{background:#67060c!important;border-color:#8e1519!important}
.d2h-del.d2h-change{background:#3a1115!important}
.d2h-cntx{background:#0d1117!important}
.d2h-info{background:#0c2d6b!important;color:#79c0ff!important;border-color:#1f6feb!important}
.d2h-code-line del,.d2h-code-side-line del{background:#8e1519;color:#ffdcd7;text-decoration:none}
.d2h-code-line ins,.d2h-code-side-line ins{background:#196c2e;color:#aff5b4;text-decoration:none}
.d2h-emptyplaceholder{background:#161b22!important;border-color:#30363d!important}
.d2h-code-side-emptyplaceholder{background:#161b22!important;border-color:#30363d!important}
.d2h-tag{background:#161b22!important;color:#7d8590!important;border-color:#30363d!important}
.d2h-moved-tag{background:#0c2d6b!important;color:#79c0ff!important}
</style></head><body>
<div class="bar">
<a href="/">← all files</a>
<span class="path">${escape(f.path)}</span>
${prev} ${next}
</div>
<div id="out">rendering...</div>
<script src="/diff2html.js"></script>
<script>
const patch = ${JSON.stringify(f.content)};
document.getElementById('out').innerHTML = window.Diff2Html.html(patch, {
  drawFileList: false,
  outputFormat: 'side-by-side',
  matching: 'lines'
});
</script>
</body></html>`);
});

function escape(s) {
	return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

serve({ fetch: app.fetch, port: portArg }, (info) => {
	console.log(`http://localhost:${info.port}  (${files.length} files)`);
});
