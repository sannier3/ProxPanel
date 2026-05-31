import { Router } from 'express';
import { config } from '../config.js';
import { getProxmoxTicket, fetchRealms } from '../services/proxmox-client.js';
import {
  registerCollectorSession,
  unregisterCollectorSession,
} from '../services/collector.js';
import { clearSessionCache } from '../services/cache.js';
import { clearSessionStatsCache } from '../services/stats-cache.js';
import { clearStatsScope } from '../services/realtime-hub.js';

const router = Router();

router.post('/logout', (req, res) => {
  const sid = req.sessionID;
  unregisterCollectorSession(sid);
  clearSessionCache(sid);
  clearSessionStatsCache(sid);
  clearStatsScope(sid);
  req.session.destroy(() => {
    res.json({ success: true, message: 'Déconnexion réussie' });
  });
});

router.post('/validate-proxmox-url', async (req, res) => {
  if (!config.prod) {
    return res.json({ success: false, message: 'Mode développement' });
  }
  if (config.proxmox.url) {
    return res.json({
      success: false,
      message: 'L\'URL Proxmox est définie dans la configuration',
    });
  }

  let url = (req.body?.url ?? '').replace(/\/$/, '').replace(/\/api2\/json\/?$/, '');
  if (!url) return res.json({ success: false, message: 'URL requise' });

  const rootTicket = await getProxmoxTicket(
    url,
    `${config.proxmox.rootUser}@pam`,
    config.proxmox.rootPassword
  );
  if (!rootTicket) {
    return res.json({
      success: false,
      message: 'Impossible de se connecter au serveur Proxmox',
    });
  }

  const realms = await fetchRealms(url, config.proxmox.rootUser, config.proxmox.rootPassword);
  req.session.proxmoxValidatedUrl = url;
  req.session.proxmoxRealms = realms;

  res.json({
    success: true,
    message: 'Connexion au serveur Proxmox réussie',
    url,
    realms,
  });
});

router.post('/login', async (req, res) => {
  if (!config.prod) {
    return res.json({ success: false, message: 'Mode développement - pas de login API' });
  }

  const { username, password, realm = 'pam' } = req.body ?? {};
  const proxmoxUrl = config.proxmox.url || req.session.proxmoxValidatedUrl || '';

  if (!username || !password || !proxmoxUrl) {
    return res.json({ success: false, message: 'Paramètres manquants' });
  }

  const ticket = await getProxmoxTicket(proxmoxUrl, `${username}@${realm}`, password);
  if (!ticket) {
    return res.json({ success: false, message: 'Identifiants incorrects' });
  }

  req.session.proxmoxTicket = ticket;
  req.session.proxmoxUrl = proxmoxUrl;
  req.session.proxmoxUsername = username;
  req.session.proxmoxRealm = realm;
  req.session.proxmoxFullUsername = `${username}@${realm}`;

  registerCollectorSession(req.sessionID, proxmoxUrl, ticket);

  res.json({ success: true, message: 'Connexion réussie' });
});

export default router;
