import { Router } from 'express';
import express from 'express';
import { config } from '../config.js';
import { requireAuth, getProxmoxContext } from '../middleware/require-auth.js';
import { handleDataAction } from '../handlers/data-handler.js';
import { fetchRealms } from '../services/proxmox-client.js';
import { isLocalExecEnabled, runModuleScript } from '../services/local-exec.js';

const router = Router();

router.get('/bootstrap', async (req, res) => {
  let realms = req.session?.proxmoxRealms ?? [];
  if (config.prod && realms.length === 0 && config.proxmox.url) {
    realms = await fetchRealms(
      config.proxmox.url,
      config.proxmox.rootUser,
      config.proxmox.rootPassword
    );
  }

  const userLoggedIn =
    config.prod &&
    !!req.session?.proxmoxTicket &&
    !!req.session?.proxmoxUsername &&
    !!req.session?.proxmoxUrl;

  res.json({
    isProduction: config.prod,
    realms,
    userLoggedIn,
    username: req.session?.proxmoxUsername ?? null,
    realm: req.session?.proxmoxRealm ?? null,
    proxmoxUrl: req.session?.proxmoxUrl ?? null,
    proxmoxConfigUrl: config.proxmox.url ?? '',
    validatedUrl: req.session?.proxmoxValidatedUrl ?? null,
    nodes: [],
    vms: [],
    localExecEnabled: isLocalExecEnabled(),
    realtimeEnabled: config.realtime.enabled,
    vmstatsMaxPerRequest: config.vmstats.maxPerRequest,
  });
});

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    version: process.env.PROXPANEL_VERSION || 'dev',
    channel: process.env.PROXPANEL_VERSION?.includes('alpha') ? 'alpha' : 'stable',
    prod: config.prod,
    uptime: process.uptime(),
    collector: config.collector.enabled,
    realtime: config.realtime.enabled,
  });
});

router.get('/data', requireAuth, async (req, res) => {
  try {
    const ctx = getProxmoxContext(req);
    const result = await handleDataAction(ctx, req.query.action, req);
    res.json(result);
  } catch (err) {
    console.error('GET /api/data:', err);
    res.status(500).json({
      error: 'Erreur serveur',
      ...(config.debug ? { debug: err.message } : {}),
    });
  }
});

router.post('/data', requireAuth, express.json(), async (req, res) => {
  try {
    const ctx = getProxmoxContext(req);
    const result = await handleDataAction(ctx, req.query.action, req);
    res.json(result);
  } catch (err) {
    console.error('POST /api/data:', err);
    res.status(500).json({
      error: 'Erreur serveur',
      ...(config.debug ? { debug: err.message } : {}),
    });
  }
});

router.post('/modules/:module/run', requireAuth, express.json(), async (req, res) => {
  if (!isLocalExecEnabled()) {
    return res.status(403).json({ error: 'Exécution locale désactivée' });
  }
  try {
    const args = req.body?.args ?? [];
    const out = await runModuleScript(req.params.module, args);
    res.json({ success: true, ...out });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
