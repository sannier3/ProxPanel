import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env') });

function envBool(key, fallback = false) {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1' || v === 'yes';
}

function envInt(key, fallback) {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function envStr(key, fallback = '') {
  const v = process.env[key];
  return v !== undefined && v !== '' ? v : fallback;
}

function loadJsonConfig() {
  const candidates = [
    path.join(rootDir, 'config.json'),
    path.join(rootDir, 'config', 'config.json'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  }
  return {};
}

const fileConfig = loadJsonConfig();

/** Priorité : variables .env > config.json > défauts */
export const config = {
  prod:
    envBool('PROD', false) ||
    (process.env.NODE_ENV === 'production' && process.env.PROD !== 'false') ||
    fileConfig.prod === true,
  debug: envBool('DEBUG', fileConfig.debug === true),
  port: envInt('PORT', fileConfig.port ?? 8080),
  host: envStr('HOST', fileConfig.host ?? '0.0.0.0'),
  sessionSecret: envStr('SESSION_SECRET', fileConfig.sessionSecret ?? 'proxpanel-dev-secret'),
  cookieSecure: envBool('COOKIE_SECURE', false),
  proxmox: {
    url: envStr('PROXMOX_URL', fileConfig.proxmox?.url ?? ''),
    rootUser: envStr('PROXMOX_ROOT_USER', fileConfig.proxmox?.rootUser ?? 'root'),
    rootPassword: envStr('PROXMOX_ROOT_PASSWORD', fileConfig.proxmox?.rootPassword ?? ''),
  },
  collector: {
    enabled:
      process.env.COLLECTOR_ENABLED !== undefined
        ? envBool('COLLECTOR_ENABLED', true)
        : fileConfig.collector?.enabled !== false,
    resourcesIntervalMs: envInt(
      'COLLECTOR_INTERVAL_MS',
      fileConfig.collector?.resourcesIntervalMs ?? 30000
    ),
    maxParallelProxmoxCalls: envInt(
      'MAX_PARALLEL_PVE',
      fileConfig.collector?.maxParallelProxmoxCalls ?? 20
    ),
  },
  localExec: {
    enabled: envBool('LOCAL_EXEC', fileConfig.localExec?.enabled === true),
    scriptsPath: path.resolve(
      rootDir,
      envStr('MODULES_PATH', fileConfig.localExec?.scriptsPath ?? './modules')
    ),
  },
  vmstats: {
    maxPerRequest: envInt('VMSTATS_MAX', fileConfig.vmstats?.maxPerRequest ?? 80),
    cacheTtlMs: envInt('VMSTATS_CACHE_TTL_MS', fileConfig.vmstats?.cacheTtlMs ?? 4000),
  },
  realtime: {
    enabled:
      process.env.REALTIME_ENABLED !== undefined
        ? envBool('REALTIME_ENABLED', true)
        : fileConfig.realtime?.enabled !== false,
    statsPushIntervalMs: envInt(
      'REALTIME_STATS_MS',
      fileConfig.realtime?.statsPushIntervalMs ?? 5000
    ),
  },
  workspace: {
    dir: path.resolve(
      rootDir,
      envStr('WORKSPACE_DIR', fileConfig.workspace?.dir ?? './data/workspaces')
    ),
  },
  fileExplorer: {
    sshEnabled: envBool('FILE_EXPLORER_SSH', fileConfig.fileExplorer?.sshEnabled === true),
    sshUser: envStr('FILE_EXPLORER_SSH_USER', fileConfig.fileExplorer?.sshUser ?? 'root'),
  },
  rootDir,
  publicDir: path.join(rootDir, 'public'),
};
