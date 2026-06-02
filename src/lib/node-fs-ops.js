import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { isLocalExecEnabled, runModuleScript } from '../services/local-exec.js';
import { proxmoxApiCall } from '../services/proxmox-client.js';
import { IN_DOCKER } from './node-directory-list.js';

const FILE_BROWSER_SCRIPT = path.join(config.localExec.scriptsPath, 'file-browser', 'script.sh');

export const MAX_READ_BYTES = config.fileExplorer.maxReadBytes;
export const MAX_UPLOAD_BYTES = config.fileExplorer.maxUploadBytes;

export function normalizeFsPath(p) {
  if (!p || p === '/') return '/';
  let n = String(p).replace(/\\/g, '/').trim();
  if (!n.startsWith('/')) n = `/${n}`;
  n = n.replace(/\/+/g, '/');
  if (n.length > 1 && n.endsWith('/')) n = n.slice(0, -1);
  if (n.includes('..')) return null;
  return n || '/';
}

export function joinPath(dir, name) {
  const base = normalizeFsPath(dir) || '/';
  const seg = String(name || '').replace(/[/\\]/g, '');
  if (!seg || seg.includes('..')) return null;
  return base === '/' ? `/${seg}` : `${base}/${seg}`;
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

async function resolveNodeSshHost(url, ticket, node) {
  const nets = await proxmoxApiCall(url, ticket, `/nodes/${encodeURIComponent(node)}/network`);
  if (Array.isArray(nets)) {
    for (const iface of nets) {
      const addr = iface.address;
      if (addr && typeof addr === 'string' && !addr.includes(':')) return addr;
    }
  }
  return node;
}

export function shellAccessAvailable() {
  if (IN_DOCKER) return config.fileExplorer.sshEnabled;
  return isLocalExecEnabled() || config.fileExplorer.sshEnabled;
}

function parseJsonOut(stdout) {
  const raw = (stdout || '').trim();
  if (!raw) return { ok: false, error: 'empty_response' };
  try {
    return JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid_json', raw: raw.slice(0, 200) };
  }
}

function readScriptBody() {
  if (fs.existsSync(FILE_BROWSER_SCRIPT)) {
    return fs.readFileSync(FILE_BROWSER_SCRIPT, 'utf8');
  }
  return '';
}

async function prepareHost(ctx, node) {
  if (ctx?.url && ctx?.ticket) {
    return resolveNodeSshHost(ctx.url, ctx.ticket, node);
  }
  return node;
}

function sshBase(user, host) {
  return [
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-o',
    'ConnectTimeout=15',
    `${user}@${host}`,
  ];
}

async function runViaModule(node, action, args, stdin = null) {
  try {
    const out = await runModuleScript('file-browser', [action, node, ...args], stdin);
    return parseJsonOut(out.stdout);
  } catch (err) {
    return { ok: false, error: err.message || 'module_failed' };
  }
}

async function runViaSshScript(host, node, action, args) {
  const user = config.fileExplorer.sshUser;
  const scriptBody = readScriptBody();
  if (!scriptBody) return { ok: false, error: 'script_missing' };

  const result = spawnSync(
    'ssh',
    [...sshBase(user, host), 'bash', '-s', '--', action, node, ...args.map(String)],
    {
      input: scriptBody,
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, FE_MAX_READ: String(MAX_READ_BYTES) },
    }
  );

  if (result.error || result.status !== 0) {
    return { ok: false, error: (result.stderr || result.stdout || '').trim() || `ssh_${result.status}` };
  }
  return parseJsonOut(result.stdout);
}

async function sshReadFile(host, filePath) {
  const user = config.fileExplorer.sshUser;
  const q = shellQuote(filePath);
  const result = spawnSync(
    'ssh',
    [...sshBase(user, host), `size=$(stat -c %s ${q} 2>/dev/null || echo 0); if [ "$size" -gt ${MAX_READ_BYTES} ]; then exit 2; fi; base64 -w0 ${q} 2>/dev/null || base64 ${q} | tr -d '\\n'`],
    { encoding: 'utf8', timeout: 60000, maxBuffer: MAX_READ_BYTES * 2 + 4096 }
  );
  if (result.status === 2) return { ok: false, error: 'file_too_large' };
  if (result.error || result.status !== 0) {
    return { ok: false, error: (result.stderr || '').trim() || 'read_failed' };
  }
  const b64 = (result.stdout || '').replace(/\s/g, '');
  const buf = Buffer.from(b64, 'base64');
  return {
    ok: true,
    path: filePath,
    size: buf.length,
    encoding: 'base64',
    content: b64,
    text: buf.toString('utf8'),
    binary: false,
  };
}

async function sshWriteFile(host, filePath, content, isBase64 = false) {
  const user = config.fileExplorer.sshUser;
  const q = shellQuote(filePath);
  const payload = isBase64 ? content : Buffer.from(content, 'utf8').toString('base64');
  const result = spawnSync(
    'ssh',
    [...sshBase(user, host), `base64 -d > ${q}`],
    {
      input: payload,
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: MAX_UPLOAD_BYTES + 1024,
    }
  );
  if (result.error || result.status !== 0) {
    return { ok: false, error: (result.stderr || '').trim() || 'write_failed' };
  }
  return { ok: true, path: filePath };
}

export async function runNodeFsOp(ctx, node, action, args = [], stdin = null) {
  if (!node || !action) return { ok: false, error: 'invalid_params' };
  if (!shellAccessAvailable()) {
    return {
      ok: false,
      error: 'shell_access_disabled',
      message: 'LOCAL_EXEC ou FILE_EXPLORER_SSH requis',
    };
  }

  const useSshOnly = IN_DOCKER || (!isLocalExecEnabled() && config.fileExplorer.sshEnabled);
  const host = useSshOnly || config.fileExplorer.sshEnabled ? await prepareHost(ctx, node) : null;

  if (action === 'read' && (useSshOnly || (IN_DOCKER && config.fileExplorer.sshEnabled))) {
    return sshReadFile(host, args[0]);
  }
  if (action === 'write' && (useSshOnly || (IN_DOCKER && config.fileExplorer.sshEnabled))) {
    return sshWriteFile(host, args[0], stdin, args[1] === 'b64');
  }

  if (!IN_DOCKER && isLocalExecEnabled()) {
    const local = await runViaModule(node, action, args, stdin);
    if (local.ok !== false && !local.error) return local;
    if (local.error === 'node_mismatch' && host && config.fileExplorer.sshEnabled) {
      if (action === 'read') return sshReadFile(host, args[0]);
      if (action === 'write') return sshWriteFile(host, args[0], stdin, args[1] === 'b64');
      return runViaSshScript(host, node, action, args);
    }
    return local;
  }

  if (host && config.fileExplorer.sshEnabled) {
    if (action === 'read') return sshReadFile(host, args[0]);
    if (action === 'write') return sshWriteFile(host, args[0], stdin, args[1] === 'b64');
    return runViaSshScript(host, node, action, args);
  }

  return { ok: false, error: 'shell_access_disabled' };
}

export async function readFileOnNode(ctx, node, filePath) {
  const p = normalizeFsPath(filePath);
  if (!p || p === '/') return { ok: false, error: 'invalid_path' };
  const res = await runNodeFsOp(ctx, node, 'read', [p]);
  if (res.ok && res.content && res.encoding === 'base64' && !res.text) {
    const buf = Buffer.from(res.content, 'base64');
    res.text = buf.toString('utf8');
  }
  return res;
}

export async function writeFileOnNode(ctx, node, filePath, content, isUtf8 = true) {
  const p = normalizeFsPath(filePath);
  if (!p) return { ok: false, error: 'invalid_path' };
  if (isUtf8) {
    return runNodeFsOp(ctx, node, 'write', [p, 'raw'], content);
  }
  const b64 = Buffer.isBuffer(content) ? content.toString('base64') : content;
  return runNodeFsOp(ctx, node, 'write', [p, 'b64'], b64);
}

export async function mkdirOnNode(ctx, node, dirPath) {
  const p = normalizeFsPath(dirPath);
  if (!p) return { ok: false, error: 'invalid_path' };
  return runNodeFsOp(ctx, node, 'mkdir', [p]);
}

export async function removeOnNode(ctx, node, targetPath, recursive = false) {
  const p = normalizeFsPath(targetPath);
  if (!p) return { ok: false, error: 'invalid_path' };
  return runNodeFsOp(ctx, node, 'rm', recursive ? [p, '-r'] : [p]);
}

export async function moveOnNode(ctx, node, fromPath, toPath) {
  const a = normalizeFsPath(fromPath);
  const b = normalizeFsPath(toPath);
  if (!a || !b) return { ok: false, error: 'invalid_path' };
  return runNodeFsOp(ctx, node, 'mv', [a, b]);
}

export function canModifyFilesystem() {
  return shellAccessAvailable();
}
