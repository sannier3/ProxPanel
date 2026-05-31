import http from 'http';
import { config } from './config.js';
import { createApp } from './server.js';
import { startCollector, stopCollector } from './services/collector.js';
import { attachConsoleWebSocket } from './services/console-proxy.js';

const { app, sessionMiddleware } = createApp();
const collectorTimers = startCollector();

const server = http.createServer(app);
attachConsoleWebSocket(server, sessionMiddleware);

server.listen(config.port, config.host, () => {
  console.log(`ProxPanel écoute sur http://${config.host}:${config.port}`);
  console.log(`Mode: ${config.prod ? 'production' : 'développement'}`);
  if (config.localExec.enabled) {
    console.log(`Exécution locale activée (${config.localExec.scriptsPath})`);
  }
});

function shutdown() {
  stopCollector(collectorTimers);
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
