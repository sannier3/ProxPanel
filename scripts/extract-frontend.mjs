/**
 * Extrait HTML/CSS/JS depuis pve.php vers public/
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const srcCandidates = [
  path.join(root, 'legacy', 'php', 'pve.php'),
  path.join(root, 'pve.php'),
];
const srcFile = srcCandidates.find((f) => fs.existsSync(f));
if (!srcFile) {
  console.error('pve.php introuvable (legacy/php/ ou racine)');
  process.exit(1);
}
const publicDir = path.join(root, 'public');
const cssDir = path.join(publicDir, 'css');
const jsDir = path.join(publicDir, 'js');

const content = fs.readFileSync(srcFile, 'utf8');
const lines = content.split(/\r?\n/);

let htmlStart = lines.findIndex((l) => l.trim().startsWith('<!DOCTYPE'));
if (htmlStart < 0) htmlStart = lines.findIndex((l) => l.includes('<html'));

const styleEnd = lines.findIndex((l, i) => i > htmlStart && l.trim() === '</style>');
const scriptMainStart = lines.findIndex((l, i) =>
  i > htmlStart && l.includes('PROXMOX DATA FROM PHP')
);

let scriptTagStart = scriptMainStart;
while (scriptTagStart > styleEnd && !lines[scriptTagStart].trim().startsWith('<script')) {
  scriptTagStart--;
}

const bodyIdx = lines.findIndex((l, i) => i > scriptMainStart && /^<\/body>/i.test(l.trim()));
let scriptEndIdx = bodyIdx - 1;
while (scriptEndIdx > scriptTagStart && lines[scriptEndIdx].trim() !== '</script>') {
  scriptEndIdx--;
}

if (htmlStart < 0 || styleEnd < 0 || scriptMainStart < 0 || bodyIdx < 0) {
  console.error('Sections introuvables dans pve.php');
  process.exit(1);
}

const styleStart = lines.findIndex((l, i) => i > htmlStart && l.trim() === '<style>');
const htmlBeforeStyle = lines.slice(htmlStart, styleStart + 1).join('\n').replace(/<style>\s*$/, '');
const css = lines.slice(styleStart + 1, styleEnd).join('\n');
const htmlMiddle = lines.slice(styleEnd + 1, scriptTagStart).join('\n');

let jsBody = lines.slice(scriptMainStart + 1, scriptEndIdx).join('\n');
jsBody = jsBody
  .replace(
    /const proxmoxData = <\?php echo json_encode\(\$proxmoxData\); \?>;\s*/,
    "const proxmoxData = await fetch('/api/bootstrap').then((r) => r.json());\n"
  )
  .replace(/\/\/ --- PROXMOX DATA FROM PHP ---\s*/, '// Bootstrap Node.js\n')
  .trim();

const htmlAfterScripts = lines.slice(scriptEndIdx + 1, bodyIdx + 2).join('\n');

fs.mkdirSync(cssDir, { recursive: true });
fs.mkdirSync(jsDir, { recursive: true });
fs.mkdirSync(path.join(jsDir, 'core'), { recursive: true });

const apiPatch = `
const API_BASE = '/api';
function apiUrl(action, query = '') {
  const q = query ? (query.startsWith('?') ? '&' + query.replace(/^\\?/, '') : '&' + query) : '';
  return \`\${API_BASE}/data?action=\${encodeURIComponent(action)}\${q}\`;
}
`;

let patchedJs = apiPatch + '\n' + jsBody
  .replace(/fetch\(`\?api=data&action=\$\{action\}`/g, 'fetch(apiUrl(action)')
  .replace(/fetch\(`\?api=data&action=/g, 'fetch(`/api/data?action=')
  .replace(/fetch\('\?api=data&action=/g, "fetch('/api/data?action=")
  .replace(/fetch\("\?api=data&action=/g, 'fetch("/api/data?action=')
  .replace(
    /const formData = new FormData\(\);\s*formData\.append\('action', 'validate-proxmox-url'\);\s*formData\.append\('url', url\);\s*try \{\s*const response = await fetch\('', \{\s*method: 'POST',\s*body: formData\s*\}\);/s,
    `try {
                const response = await fetch('/api/auth/validate-proxmox-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });`
  )
  .replace(
    /const formData = new FormData\(\);\s*formData\.append\('action', 'login'\);\s*formData\.append\('username', username\);\s*formData\.append\('password', password\);\s*formData\.append\('realm', realm\);\s*fetch\('', \{\s*method: 'POST',\s*body: formData\s*\}\)/s,
    `fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, realm })
                })`
  )
  .replace(
    /const formData = new FormData\(\);\s*formData\.append\('action', 'logout'\);\s*fetch\('', \{\s*method: 'POST',\s*body: formData\s*\}\)/s,
    `fetch('/api/auth/logout', { method: 'POST' })`
  );

const existingApp = path.join(jsDir, 'app.js');
if (fs.existsSync(existingApp)) {
  const manualMarkers = [
    'ProxPanelCore',
    'realtimeClient',
    'onRealtimeResources',
    'buildRunningStatsScope',
  ];
  const current = fs.readFileSync(existingApp, 'utf8');
  if (manualMarkers.some((m) => current.includes(m))) {
    console.log('app.js conserve les patchs manuels (ProxPanelCore) - non écrasé');
  } else {
    fs.writeFileSync(existingApp, patchedJs);
  }
} else {
  fs.writeFileSync(existingApp, patchedJs);
}

fs.writeFileSync(path.join(cssDir, 'app.css'), css);

const indexHtml = `${htmlBeforeStyle}
    <link rel="stylesheet" href="/css/app.css">
${htmlMiddle}
    <script type="module" src="https://cdn.jsdelivr.net/npm/@novnc/novnc@1.4.0/core/rfb.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm-addon-attach@0.9.0/lib/xterm-addon-attach.js"></script>
    <script src="/js/core/proxpanel-core.js"></script>
    <script type="module" src="/js/app.js"></script>
${htmlAfterScripts}`;

fs.writeFileSync(path.join(publicDir, 'index.html'), indexHtml);

console.log('Frontend extrait vers public/');
