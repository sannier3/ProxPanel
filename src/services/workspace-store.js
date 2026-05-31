import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';

function userKey(username, realm) {
  const raw = `${username}@${realm || 'pam'}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function filePath(username, realm) {
  return path.join(config.workspace.dir, `${userKey(username, realm)}.json`);
}

export async function loadWorkspace(username, realm) {
  try {
    const data = await fs.readFile(filePath(username, realm), 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function saveWorkspace(username, realm, workspace) {
  await fs.mkdir(config.workspace.dir, { recursive: true });
  const payload = {
    username,
    realm: realm || 'pam',
    updatedAt: Date.now(),
    ...workspace,
  };
  await fs.writeFile(filePath(username, realm), JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}
