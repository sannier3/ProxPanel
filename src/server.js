import express from 'express';
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import realtimeRoutes from './routes/realtime.js';
import workspaceRoutes from './routes/workspace.js';
import { registerCollectorSession } from './services/collector.js';

/** Désactive le cache navigateur pour l’UI (HTML, JS, CSS) après déploiement. */
function setNoCacheHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

export function createApp() {
  const app = express();

  const sessionMiddleware = session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.cookieSecure,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  });

  app.use(sessionMiddleware);

  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    if (req.session?.proxmoxTicket && req.session?.proxmoxUrl) {
      registerCollectorSession(req.sessionID, req.session.proxmoxUrl, req.session.proxmoxTicket);
    }
    next();
  });

  app.use('/api/auth', express.json(), authRoutes);
  app.use('/api/realtime', realtimeRoutes);
  app.use('/api/workspace', workspaceRoutes);
  app.use('/api', apiRoutes);

  const publicDir = config.publicDir;
  if (fs.existsSync(publicDir)) {
    app.use(
      express.static(publicDir, {
        etag: false,
        lastModified: false,
        setHeaders(res) {
          setNoCacheHeaders(res);
        },
      })
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      const indexPath = path.join(publicDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        setNoCacheHeaders(res);
        return res.sendFile(indexPath);
      }
      next();
    });
  } else {
    app.get('/', (req, res) => {
      res.type('text/plain').send(
        'ProxPanel Node.js - exécutez npm run extract-frontend puis redémarrez.'
      );
    });
  }

  return { app, sessionMiddleware };
}
