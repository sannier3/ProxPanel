import { config } from '../config.js';

export function requireAuth(req, res, next) {
  if (!config.prod) return next();
  if (req.session?.proxmoxTicket && req.session?.proxmoxUrl) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

export function getProxmoxContext(req) {
  return {
    url: req.session.proxmoxUrl,
    ticket: req.session.proxmoxTicket,
    sessionId: req.sessionID,
    debug: config.debug,
  };
}
