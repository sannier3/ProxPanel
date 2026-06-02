import { spawnSync } from 'child_process';
import fs from 'fs';
import { proxmoxApiCall } from '../services/proxmox-client.js';
import { config } from '../config.js';
import { isLocalExecEnabled, runModuleScript } from '../services/local-exec.js';

export const IN_DOCKER = fs.existsSync('/.dockerenv');

const REMOTE_LIST_SCRIPT = `set -euo pipefail
TARGET="\${1:-/}"
if [[ "\$TARGET" != /* ]]; then TARGET="/\$TARGET"; fi
TARGET="\$(printf '%s' "\$TARGET" | sed 's|//|/|g')"
if [[ "\$TARGET" != "/" ]]; then TARGET="\${TARGET%/}"; fi
if [[ "\$TARGET" == *".."* ]]; then echo '{"error":"invalid_path"}'; exit 1; fi
json_escape() { printf '%s' "\$1" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g'; }
if [[ ! -e "\$TARGET" ]]; then printf '{"entries":[]}\\n'; exit 0; fi
if [[ ! -d "\$TARGET" ]]; then
  n="\$(basename "\$TARGET")"
  s="\$(stat -c '%s' "\$TARGET" 2>/dev/null || echo 0)"
  m="\$(stat -c '%Y' "\$TARGET" 2>/dev/null || echo null)"
  printf '{"entries":[{"name":"%s","type":"file","path":"%s","size":%s,"mtime":%s}]}\\n' "\$(json_escape "\$n")" "\$(json_escape "\$TARGET")" "\$s" "\$m"
  exit 0
fi
printf '{"entries":['
FIRST=1
add() {
  local p="\$1" n t s m
  n="\$(basename "\$p")"
  [[ "\$n" == "." || "\$n" == ".." ]] && return 0
  if [[ -d "\$p" ]]; then t="dir"; s="null"; m="null"
  elif [[ -f "\$p" || -L "\$p" ]]; then
    t="file"; s="\$(stat -c '%s' "\$p" 2>/dev/null || echo 0)"; m="\$(stat -c '%Y' "\$p" 2>/dev/null || echo null)"
  else return 0; fi
  [[ "\$FIRST" -eq 1 ]] && FIRST=0 || printf ','
  if [[ "\$t" == "dir" ]]; then
    printf '{"name":"%s","type":"dir","path":"%s","size":null,"mtime":null}' "\$(json_escape "\$n")" "\$(json_escape "\$p")"
  else
    printf '{"name":"%s","type":"file","path":"%s","size":%s,"mtime":%s}' "\$(json_escape "\$n")" "\$(json_escape "\$p")" "\$s" "\$m"
  fi
}
shopt -s nullglob dotglob
for e in "\$TARGET"/* "\$TARGET"/.[!.]* "\$TARGET"/..?*; do [[ -e "\$e" ]] || continue; add "\$e"; done
printf ']}\\n'
`;

function mapRawEntries(entries, fallbackPath) {
  return (entries || []).map((e) => ({
    name: e.name,
    type: e.type || 'file',
    path: e.path || fallbackPath,
    size: e.size ?? null,
    mtime: e.mtime ?? null,
  }));
}

async function resolveNodeSshHost(url, ticket, node) {
  const nets = await proxmoxApiCall(url, ticket, `/nodes/${encodeURIComponent(node)}/network`);
  if (Array.isArray(nets)) {
    for (const iface of nets) {
      const addr = iface.address;
      if (addr && typeof addr === 'string' && !addr.includes(':')) {
        return addr;
      }
    }
  }
  return node;
}

function listViaSshSpawn(host, user, dirPath) {
  const result = spawnSync(
    'ssh',
    [
      '-o',
      'BatchMode=yes',
      '-o',
      'StrictHostKeyChecking=accept-new',
      '-o',
      'ConnectTimeout=12',
      `${user}@${host}`,
      'bash',
      '-s',
      '--',
      dirPath,
    ],
    {
      input: REMOTE_LIST_SCRIPT,
      encoding: 'utf8',
      timeout: 25000,
      maxBuffer: 8 * 1024 * 1024,
    }
  );

  if (result.error || result.status !== 0) return null;
  try {
    const data = JSON.parse(result.stdout.trim());
    if (data.error || data.ok === false) return null;
    return {
      entries: mapRawEntries(data.entries || [], dirPath),
      source: IN_DOCKER ? 'ssh' : 'ssh-cluster',
    };
  } catch {
    return null;
  }
}

async function listViaModuleScript(node, dirPath) {
  if (!isLocalExecEnabled()) return null;
  try {
    const { stdout } = await runModuleScript('file-browser', ['list', node, dirPath]);
    const data = JSON.parse(stdout.trim());
    if (data.error || data.ok === false) return null;
    return {
      entries: mapRawEntries(data.entries || [], dirPath),
      source: 'local-exec',
    };
  } catch {
    return null;
  }
}

/**
 * Liste un répertoire sur un nœud PVE via script (hôte) ou SSH (cluster / Docker).
 */
export async function listDirectoryOnNode(ctx, node, dirPath) {
  const sshUser = config.fileExplorer.sshUser;
  const trySsh = () =>
    listViaSshSpawn(
      ctx?.url && ctx?.ticket ? resolveNodeSshHost(ctx.url, ctx.ticket, node) : node,
      sshUser,
      dirPath
    );

  // Docker : le script local lit le conteneur, pas le nœud PVE → SSH uniquement
  if (IN_DOCKER) {
    if (!config.fileExplorer.sshEnabled) return null;
    const host = await resolveNodeSshHost(ctx.url, ctx.ticket, node);
    return listViaSshSpawn(host, sshUser, dirPath);
  }

  if (isLocalExecEnabled()) {
    const moduleResult = await listViaModuleScript(node, dirPath);
    if (moduleResult && (moduleResult.entries.length > 0 || dirPath !== '/')) {
      return moduleResult;
    }
    if (config.fileExplorer.sshEnabled) {
      const host = await resolveNodeSshHost(ctx.url, ctx.ticket, node);
      const sshResult = listViaSshSpawn(host, sshUser, dirPath);
      if (sshResult) return sshResult;
    }
    return moduleResult;
  }

  if (config.fileExplorer.sshEnabled) {
    const host = await resolveNodeSshHost(ctx.url, ctx.ticket, node);
    return listViaSshSpawn(host, sshUser, dirPath);
  }

  return null;
}
