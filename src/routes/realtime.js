import { Router } from 'express';
import express from 'express';
import { config } from '../config.js';
import { requireAuth } from '../middleware/require-auth.js';
import { subscribeSession, setStatsScope } from '../services/realtime-hub.js';

const router = Router();

router.get('/events', requireAuth, (req, res) => {
  if (!config.realtime.enabled) {
    return res.status(404).json({ error: 'Realtime désactivé' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sessionId = req.sessionID;
  subscribeSession(sessionId, res);

  res.write(`event: connected\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 25000);

  req.on('close', () => clearInterval(heartbeat));
});

router.post('/scope', requireAuth, express.json(), (req, res) => {
  const running = req.body?.running ?? [];
  if (!Array.isArray(running)) {
    return res.status(400).json({ error: 'running doit être un tableau' });
  }
  setStatsScope(req.sessionID, running);
  res.json({ success: true, count: running.length });
});

export default router;
