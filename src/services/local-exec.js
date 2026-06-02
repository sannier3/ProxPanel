import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';

/**
 * Exécution locale de scripts modules (sur l'hôte Proxmox).
 * À activer uniquement sur le nœud PVE avec LOCAL_EXEC=true.
 */
export function isLocalExecEnabled() {
  return config.localExec.enabled;
}

export async function runModuleScript(moduleName, args = [], stdin = null) {
  if (!config.localExec.enabled) {
    throw new Error('Exécution locale désactivée');
  }

  const scriptPath = path.join(config.localExec.scriptsPath, moduleName, 'script.sh');
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Script introuvable: ${moduleName}`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn('bash', [scriptPath, ...args.map(String)], {
      cwd: path.dirname(scriptPath),
      timeout: 120000,
      env: { ...process.env, FE_MAX_READ: String(config.fileExplorer?.maxReadBytes ?? 2097152) },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    if (stdin != null) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `Exit ${code}`));
    });
  });
}
