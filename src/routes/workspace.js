import { Router } from 'express';
import express from 'express';
import { requireAuth } from '../middleware/require-auth.js';
import { loadWorkspace, saveWorkspace } from '../services/workspace-store.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const username = req.session.proxmoxUsername;
    const realm = req.session.proxmoxRealm;
    const data = await loadWorkspace(username, realm);
    res.json({ workspace: data });
  } catch (err) {
    console.error('GET workspace:', err);
    res.status(500).json({ error: 'Impossible de charger le workspace' });
  }
});

router.put('/', requireAuth, express.json(), async (req, res) => {
  try {
    const username = req.session.proxmoxUsername;
    const realm = req.session.proxmoxRealm;
    const saved = await saveWorkspace(username, realm, req.body ?? {});
    res.json({ success: true, workspace: saved });
  } catch (err) {
    console.error('PUT workspace:', err);
    res.status(500).json({ error: 'Impossible de sauvegarder le workspace' });
  }
});

export default router;
