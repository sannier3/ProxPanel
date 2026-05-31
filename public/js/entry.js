/**
 * Point d'entrée : bootstrap API puis chargement de l'application.
 */
let proxmoxData;
try {
  const res = await fetch('/api/bootstrap');
  proxmoxData = await res.json();
} catch (err) {
  console.error('Bootstrap ProxPanel:', err);
  proxmoxData = {
    isProduction: false,
    realms: [],
    userLoggedIn: false,
    proxmoxConfigUrl: '',
  };
}

window.__PROXPANEL_BOOTSTRAP__ = proxmoxData;
await import('./app.js');
