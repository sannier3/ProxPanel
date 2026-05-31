
const API_BASE = '/api';
function apiUrl(action, query = '') {
  const q = query ? (query.startsWith('?') ? '&' + query.replace(/^\?/, '') : '&' + query) : '';
  return `${API_BASE}/data?action=${encodeURIComponent(action)}${q}`;
}

// Bootstrap (chargé par entry.js avant import)
        const proxmoxData = window.__PROXPANEL_BOOTSTRAP__ || {};
        const isProduction = proxmoxData.isProduction || false;
        const proxmoxRealms = proxmoxData.realms || [];
        const userLoggedInProxmox = proxmoxData.userLoggedIn || false;
        const proxmoxUsername = proxmoxData.username || null;
        const proxmoxRealm = proxmoxData.realm || null;
        const proxmoxUrl = proxmoxData.proxmoxUrl || null;

        // --- CLUSTER & NODES DATA ---
        // Use Proxmox data if available, otherwise use mock data
        let clusterNodes = [
            {
                id: 'pve-01',
                name: 'pve-01',
                status: 'online',
                uptime: '14j',
                cpu: 12,
                ram: { used: 14, total: 32 },
                machines: [
                    {
                        id: 100, name: 'Windows 11', type: 'vm', status: 'running', cpu: 15, ram: 40, disk: 0, ip: '192.168.1.100', node: 'pve-01', config: { vcpu: 4, memory: 8192, iso: 'windows-11-pro.iso', bootOrder: 'order=ide2;scsi0', autostart: true }, backups: [
                            { id: 'b1', date: new Date('2024-01-15T10:30:00'), size: '12.5 GB', storage: 'nas-data', status: 'completed' },
                            { id: 'b2', date: new Date('2024-01-14T10:30:00'), size: '12.3 GB', storage: 'nas-data', status: 'completed' }
                        ]
                    },
                    {
                        id: 101, name: 'Ubuntu Server', type: 'vm', status: 'running', cpu: 5, ram: 20, disk: 0, ip: '192.168.1.101', node: 'pve-01', config: { vcpu: 2, memory: 4096, iso: '', bootOrder: 'order=scsi0', autostart: false }, backups: [
                            { id: 'b3', date: new Date('2024-01-15T11:00:00'), size: '8.2 GB', storage: 'local', status: 'completed' }
                        ]
                    },
                    { id: 102, name: 'Nginx Proxy', type: 'lxc', status: 'running', cpu: 2, ram: 5, disk: 12, ip: '192.168.1.102', node: 'pve-01', config: { vcpu: 1, memory: 1024, iso: '', bootOrder: '', autostart: true }, backups: [] },
                    { id: 103, name: 'PiHole DNS', type: 'lxc', status: 'stopped', cpu: 0, ram: 0, disk: 4, ip: '192.168.1.103', node: 'pve-01', config: { vcpu: 1, memory: 512, iso: '', bootOrder: '', autostart: false }, backups: [] }
                ]
            },
            {
                id: 'pve-02',
                name: 'pve-02',
                status: 'online',
                uptime: '28j',
                cpu: 18,
                ram: { used: 22, total: 64 },
                machines: [
                    {
                        id: 200, name: 'Database Server', type: 'vm', status: 'running', cpu: 25, ram: 60, disk: 0, ip: '192.168.1.200', node: 'pve-02', config: { vcpu: 8, memory: 16384, iso: '', bootOrder: 'order=scsi0', autostart: true }, backups: [
                            { id: 'b4', date: new Date('2024-01-15T12:00:00'), size: '45.8 GB', storage: 'nas-data', status: 'completed' }
                        ]
                    },
                    { id: 201, name: 'Web Server', type: 'vm', status: 'running', cpu: 12, ram: 35, disk: 0, ip: '192.168.1.201', node: 'pve-02', config: { vcpu: 4, memory: 8192, iso: '', bootOrder: 'order=scsi0', autostart: true }, backups: [] }
                ]
            },
            {
                id: 'pve-03',
                name: 'pve-03',
                status: 'offline',
                uptime: '0j',
                cpu: 0,
                ram: { used: 0, total: 32 },
                machines: []
            }
        ];

        // Use Proxmox data if available and user is logged in
        // IMPORTANT: Inclure tous les nodes, même ceux qui sont offline
        if (isProduction && userLoggedInProxmox && proxmoxData.nodes && proxmoxData.nodes.length > 0) {
            clusterNodes = proxmoxData.nodes.map((node, index) => ({
                id: node.name,
                name: node.name,
                status: node.status === 'online' ? 'online' : 'offline',
                uptime: 'N/A', // Could be fetched from Proxmox API
                cpu: 0, // Will be updated
                ram: { used: 0, total: 0 }, // Will be updated
                machines: node.vms || []
            }));
            sortClusterNodes();
        }

        function sortClusterNodes() {
            clusterNodes.sort((a, b) => {
                const aRank = a.status === 'online' ? 0 : 1;
                const bRank = b.status === 'online' ? 0 : 1;
                if (aRank !== bRank) return aRank - bRank;
                return (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' });
            });
        }

        let currentNodeId = 'all'; // Default to "all nodes"
        let machines = [];

        // --- DATA STATE ---

        // User permissions (example - can be fetched from server)
        const userPermissions = {
            cpu: true,
            memory: true,
            iso: true,
            boot: true,
            autostart: true,
            vmid: true
        };

        let filteredMachines = [...machines];

        // Mock Storage Data
        const storages = {
            'local': ['debian-12.iso', 'ubuntu-22.04.iso', 'proxmox-ve-8.iso'],
            'nas-data': ['windows-11-pro.iso', 'windows-server-2022.iso', 'rhel-9.iso']
        };

        // --- REQUEST LOCKING ---
        // Éviter les requêtes multiples en parallèle
        const pendingRequests = {
            'nodes': false,
            'vmstats': false,
            'vms': false,
            'storage': false,
            'all': false
        };

        let allowProxmoxRequests = userLoggedInProxmox === true;
        let authInvalidated = false;
        const refreshIntervals = {
            nodes: null,
            vmstats: null,
            statuses: null,
            metrics: null
        };

        let windows = []; // Stores open window objects
        let workspaceRestored = false;
        let workspaceRestoreTimer = null;
        let workspaceRestoreAttempts = 0;
        const WORKSPACE_RESTORE_MAX_ATTEMPTS = 40;
        let desktopWidgetLayout = null;
        let desktopWallpaper = 'default';
        let desktopWidgetNotes = '';

        function workspaceStorageKey() {
            if (!currentUser?.username) return null;
            const realm = currentUser.realm || proxmoxRealm || currentUser.role || 'pam';
            return `proxpanel_workspace_${currentUser.username}@${realm}`;
        }

        function buildWorkspacePayload() {
            const windowsData = windows.map((win) => {
                const winKey = win.winKey || resolveWinKey(win.id);
                const winEl = document.getElementById(`win-${winKey}`);
                if (!winEl) return null;

                const rect = winEl.getBoundingClientRect();
                const windowLayer = document.getElementById('window-layer');
                const layerRect = windowLayer?.getBoundingClientRect() || { left: 0, top: 0 };

                const vm = win.kind === 'console' || win.kind === 'config'
                    ? machines.find((m) => m.id === win.id && (!win.node || m.node === win.node))
                    : null;
                const node = win.node || (vm ? vm.node : null);

                return {
                    winKey,
                    kind: win.kind || 'console',
                    appId: win.appId,
                    id: win.id,
                    type: win.type,
                    name: win.name,
                    node,
                    state: win.state,
                    layoutMode: win.layoutMode || (winEl.classList.contains('maximized') ? 'maximized' : 'floating'),
                    snapZone: win.snapZone || null,
                    position: {
                        left: `${rect.left - layerRect.left}px`,
                        top: `${rect.top - layerRect.top}px`,
                        width: `${rect.width}px`,
                        height: `${rect.height}px`,
                    },
                    isMaximized: winEl.classList.contains('maximized'),
                };
            }).filter((w) => w !== null);

            return {
                username: currentUser.username,
                realm: currentUser.realm || proxmoxRealm || currentUser.role || 'pam',
                windows: windowsData,
                timestamp: Date.now(),
                currentView,
                selectedVM: selectedVM ? { id: selectedVM.id, node: selectedVM.node, type: selectedVM.type } : null,
                desktop: {
                    widgets: desktopWidgetLayout || (globalThis.ProxPanelDesktop?.getWidgetLayout?.() || null),
                    wallpaper: desktopWallpaper,
                    notes: desktopWidgetNotes,
                },
            };
        }

        function applySavedWindowLayout(winData) {
            const winKey = winData.winKey || (winData.id ? `console-${winData.id}` : null);
            if (!winKey) return;
            const winEl = document.getElementById(`win-${winKey}`);
            if (!winEl || !winData.position) return;
            const winObj = windows.find((w) => w.winKey === winKey);
            if (winObj) {
                winObj.savedRect = winData.position;
                if (winData.layoutMode) winObj.layoutMode = winData.layoutMode;
                if (winData.snapZone) winObj.snapZone = winData.snapZone;
            }

            const applySnapLayout = () => {
                const layer = document.getElementById('window-layer');
                const lr = layer?.getBoundingClientRect();
                if (!lr?.width || !globalThis.ProxPanelWindowManager?.applySnap) return;
                ProxPanelWindowManager.applySnap(winEl, winData.snapZone, lr.width, lr.height, { skipSaveRect: true });
            };

            if (winData.snapZone && (winData.layoutMode === 'snapped' || winData.snapZone === 'top')) {
                setTimeout(applySnapLayout, 80);
            } else {
                ProxPanelWindowManager.applyRect(winEl, winData.position);
                if (winData.isMaximized || winData.layoutMode === 'maximized') {
                    setTimeout(() => maximizeWindow(winKey), 80);
                }
            }

            if (winData.state === 'minimized') {
                setTimeout(() => minimizeWindow(winKey), 80);
            }
        }

        async function restoreOneWindow(winData) {
            const winKey = winData.winKey || (winData.id ? `console-${winData.id}` : null);
            if (!winKey) return;

            const isApp = winData.kind === 'app'
                || (winData.winKey && String(winData.winKey).startsWith('app-'));
            const appId = winData.appId
                || (winData.winKey?.startsWith('app-') ? winData.winKey.slice(4) : null);

            if (isApp && appId) {
                await ProxPanelDesktop.launchApp(appId);
            } else if (winData.kind === 'config' && winData.id) {
                const vm = machines.find((m) => m.id === winData.id && (!winData.node || m.node === winData.node));
                if (vm) await openConfig(vm.id, vm.node);
            } else if (winData.kind === 'node-shell' && winData.node) {
                await openNodeShell(winData.node);
            } else if (winData.kind === 'console' || (winData.id && !isApp)) {
                const vm = machines.find((m) => m.id === winData.id && (!winData.node || m.node === winData.node));
                if (!vm) return;
                await openConsole(
                    winData.id,
                    winData.type || vm.type,
                    winData.name || vm.name,
                    winData.node || vm.node
                );
            } else {
                return;
            }
            applySavedWindowLayout(winData);
        }

        function hasDashboardWindow() {
            return windows.some((w) => w.kind === 'app' && w.appId === 'dashboard');
        }

        async function ensureDashboardWindow() {
            if (!globalThis.ProxPanelDesktop) return;
            if (hasDashboardWindow()) {
                const win = windows.find((w) => w.appId === 'dashboard');
                if (win?.state === 'minimized') {
                    restoreWindow(win.winKey || 'app-dashboard');
                }
                return;
            }
            await switchView('dashboard');
        }

        async function loadSavedWorkspace() {
            const key = workspaceStorageKey();
            if (!key) return null;

            let local = null;
            try {
                const raw = localStorage.getItem(key);
                if (raw) local = JSON.parse(raw);
            } catch (_) { /* ignore */ }

            // Migration ancienne clé (username seul)
            if (!local && currentUser?.username) {
                try {
                    const legacy = localStorage.getItem(`console_windows_${currentUser.username}`);
                    if (legacy) local = JSON.parse(legacy);
                } catch (_) { /* ignore */ }
            }

            let remote = null;
            if (isProduction && userLoggedInProxmox) {
                remote = await ProxPanelCore.loadWorkspace();
            }

            if (local && remote?.windows) {
                const localTs = local.timestamp || 0;
                const remoteTs = remote.updatedAt || remote.timestamp || 0;
                if (remoteTs > localTs) {
                    return {
                        username: currentUser.username,
                        windows: remote.windows,
                        currentView: remote.currentView,
                        selectedVM: remote.selectedVM,
                        desktop: remote.desktop || local.desktop,
                        timestamp: remoteTs,
                    };
                }
            }

            if (local?.windows?.length) return local;

            if (remote?.windows?.length) {
                return {
                    username: currentUser.username,
                    windows: remote.windows,
                    currentView: remote.currentView,
                    selectedVM: remote.selectedVM,
                    desktop: remote.desktop,
                    timestamp: remote.updatedAt || Date.now(),
                };
            }

            return local;
        }

        function loadSavedDesktopFromStorage() {
            const key = workspaceStorageKey();
            if (!key) return;
            try {
                const raw = localStorage.getItem(key);
                if (raw) applySavedDesktop(JSON.parse(raw));
            } catch (_) { /* ignore */ }
        }

        function applySavedDesktop(data) {
            const desktop = data?.desktop;
            if (!desktop) return;
            if (Array.isArray(desktop.widgets)) {
                desktopWidgetLayout = desktop.widgets.map((w) => ({
                    widgetId: w.widgetId || w.id,
                    key: w.key || w.widgetId || w.id,
                }));
            }
            if (desktop.wallpaper) desktopWallpaper = desktop.wallpaper;
            if (typeof desktop.notes === 'string') desktopWidgetNotes = desktop.notes;
        }

        async function restoreWorkspace() {
            if (workspaceRestored || !currentUser?.username) return;
            if (!globalThis.ProxPanelDesktop) return;

            const data = await loadSavedWorkspace();
            if (data && data.username && data.username !== currentUser.username) {
                localStorage.removeItem(workspaceStorageKey());
                workspaceRestored = true;
                workspaceRestoreAttempts = 0;
                await ensureDashboardWindow();
                return;
            }

            applySavedDesktop(data);
            if (globalThis.ProxPanelDesktop?.reloadSettings) {
                ProxPanelDesktop.reloadSettings();
            }

            const winList = Array.isArray(data?.windows) ? data.windows : [];
            const appWins = winList.filter((w) => w.kind === 'app' || (w.winKey && String(w.winKey).startsWith('app-')));
            const otherWins = winList.filter((w) => !appWins.includes(w));

            const needsMachines = otherWins.some(
                (w) => w.kind === 'console' || w.kind === 'config' || (!w.kind && w.id)
            );

            const appsAlreadyRestored = appWins.every((w) => {
                const appId = w.appId || (w.winKey?.startsWith('app-') ? w.winKey.slice(4) : null);
                return appId && windows.some((win) => win.winKey === `app-${appId}`);
            });

            if (!appsAlreadyRestored && appWins.length) {
                for (const winData of appWins) {
                    await restoreOneWindow(winData);
                }
            }

            if (needsMachines && (!machines || machines.length === 0)) {
                workspaceRestoreAttempts += 1;
                if (workspaceRestoreAttempts < WORKSPACE_RESTORE_MAX_ATTEMPTS) {
                    clearTimeout(workspaceRestoreTimer);
                    workspaceRestoreTimer = setTimeout(() => restoreWorkspace(), 400);
                    return;
                }
            }

            workspaceRestored = true;
            workspaceRestoreAttempts = 0;

            if (!winList.length) {
                await ensureDashboardWindow();
                renderTaskbar();
                return;
            }

            for (const winData of otherWins) {
                await restoreOneWindow(winData);
            }

            await ensureDashboardWindow();
            renderTaskbar();
            if (globalThis.ProxPanelWindowManager?.relayoutManagedWindows) {
                setTimeout(() => ProxPanelWindowManager.relayoutManagedWindows(), 120);
            }
        }

        // --- AUTHENTICATION ---
        let currentUser = null;

        // Initialize currentUser from Proxmox data if logged in (do this IMMEDIATELY)
        if (isProduction && userLoggedInProxmox && proxmoxUsername) {
            currentUser = {
                username: proxmoxUsername,
                name: proxmoxUsername === 'admin' ? 'Administrateur' : proxmoxUsername.charAt(0).toUpperCase() + proxmoxUsername.slice(1),
                role: proxmoxRealm || 'pam',
                realm: proxmoxRealm || 'pam',
                avatar: proxmoxUsername.charAt(0).toUpperCase()
            };
        }

        // Variables pour la gestion de l'URL Proxmox
        const proxmoxConfigUrl = proxmoxData.proxmoxConfigUrl || '';
        const validatedUrl = proxmoxData.validatedUrl || null;
        let currentProxmoxRealms = proxmoxData.realms || [];

        // Initialiser l'affichage du formulaire de login
        function setAuthUiState(loggedIn) {
            document.body.classList.toggle('app-authenticated', loggedIn);
            document.body.classList.toggle('app-guest', !loggedIn);
            const loginModal = document.getElementById('login-modal');
            if (!loginModal) return;
            if (loggedIn) {
                loginModal.classList.remove('show');
                loginModal.style.display = 'none';
            } else {
                loginModal.classList.add('show');
                loginModal.style.display = 'flex';
                initLoginForm();
            }
        }

        function initLoginForm() {
            const urlSection = document.getElementById('proxmox-url-section');
            const loginSection = document.getElementById('login-form-section');
            if (!urlSection || !loginSection) return;

            // Si on est en prod et que l'URL de config est vide, afficher le champ URL
            if (isProduction && !proxmoxConfigUrl && !validatedUrl) {
                urlSection.style.display = 'block';
                loginSection.style.display = 'none';
            } else if (isProduction && (validatedUrl || (proxmoxConfigUrl && currentProxmoxRealms.length > 0))) {
                // Afficher le formulaire de connexion avec l'URL
                urlSection.style.display = 'none';
                loginSection.style.display = 'block';
                const urlText = validatedUrl || proxmoxConfigUrl;
                document.getElementById('proxmox-url-text').textContent = urlText;
                updateRealmSelect(currentProxmoxRealms);
            } else if (isProduction && proxmoxConfigUrl) {
                // URL dans .env : afficher le formulaire (realms optionnels)
                urlSection.style.display = 'none';
                loginSection.style.display = 'block';
                const urlText = document.getElementById('proxmox-url-text');
                if (urlText) urlText.textContent = proxmoxConfigUrl;
                const urlDisplay = document.getElementById('proxmox-url-display');
                if (urlDisplay) urlDisplay.style.display = 'none';
                updateRealmSelect(currentProxmoxRealms);
            } else if (!isProduction) {
                // Mode dev, afficher directement le formulaire
                urlSection.style.display = 'none';
                loginSection.style.display = 'block';
            } else {
                // Prod sans URL configurée : saisie manuelle
                urlSection.style.display = 'block';
                loginSection.style.display = 'none';
            }
        }

        // Fonction pour valider l'URL Proxmox
        async function handleProxmoxUrlValidation() {
            // Ne pas permettre la validation si l'URL est déjà dans la config
            if (proxmoxConfigUrl) {
                showNotification('L\'URL Proxmox est définie dans la configuration et ne peut pas être modifiée depuis l\'interface', 'info');
                return;
            }

            const urlInput = document.getElementById('proxmox-url-input');
            const url = urlInput.value.trim();

            if (!url) {
                showNotification('Veuillez entrer une URL Proxmox', 'error');
                return;
            }

            try {
                const response = await fetch('/api/auth/validate-proxmox-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });

                const data = await response.json();

                if (data.success) {
                    currentProxmoxRealms = data.realms || [];
                    
                    // Afficher le formulaire de connexion
                    document.getElementById('proxmox-url-section').style.display = 'none';
                    document.getElementById('login-form-section').style.display = 'block';
                    const urlDisplay = document.getElementById('proxmox-url-display');
                    if (urlDisplay) {
                        urlDisplay.style.display = 'flex';
                    }
                    document.getElementById('proxmox-url-text').textContent = data.url;
                    
                    // Mettre à jour le select des realms
                    updateRealmSelect(currentProxmoxRealms);
                    
                    showNotification(data.message, 'success');
                } else {
                    showNotification(data.message || 'Erreur lors de la validation de l\'URL', 'error');
                }
            } catch (error) {
                console.error('Erreur:', error);
                showNotification('Erreur de connexion au serveur', 'error');
            }
        }

        // Fonction pour afficher à nouveau le champ URL
        function showProxmoxUrlInput() {
            // Ne permettre la modification que si l'URL n'est pas dans la config
            if (proxmoxConfigUrl) {
                showNotification('L\'URL Proxmox est définie dans la configuration et ne peut pas être modifiée depuis l\'interface', 'info');
                return;
            }
            
            document.getElementById('login-form-section').style.display = 'none';
            document.getElementById('proxmox-url-section').style.display = 'block';
            
            // Récupérer l'URL actuelle et la mettre dans le champ
            const currentUrl = document.getElementById('proxmox-url-text').textContent;
            document.getElementById('proxmox-url-input').value = currentUrl;
            
            // Nettoyer les realms et le formulaire
            currentProxmoxRealms = [];
            updateRealmSelect([]);
        }

        // Fonction pour mettre à jour le select des realms
        function updateRealmSelect(realms) {
            const realmSelect = document.getElementById('login-realm');
            const realmGroup = document.getElementById('login-realm-group');
            if (!realmSelect || !realmGroup) return;

            realmSelect.innerHTML = '';
            
            if (realms && realms.length > 0) {
                realmGroup.style.display = 'block';
                realms.forEach(realm => {
                    const option = document.createElement('option');
                    option.value = realm.realm;
                    option.textContent = realm.realm;
                    realmSelect.appendChild(option);
                });
            } else {
                realmGroup.style.display = 'none';
            }
        }

        function handleLogin() {
            const username = document.getElementById('login-username').value;
            const password = document.getElementById('login-password').value;
            const realm = document.getElementById('login-realm') ? document.getElementById('login-realm').value : 'pam';

            if (!username || !password) {
                showNotification('Veuillez remplir tous les champs', 'error');
                return;
            }

            // Si en production, authentification Proxmox
            if (isProduction) {
                fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, realm })
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            currentUser = {
                                username: username,
                                name: username === 'admin' ? 'Administrateur' : username.charAt(0).toUpperCase() + username.slice(1),
                                role: realm || 'pam',
                                realm: realm || 'pam',
                                avatar: username.charAt(0).toUpperCase()
                            };
                            updateUserProfile();
                            const loginModal = document.getElementById('login-modal');
                            if (loginModal) {
                                loginModal.style.display = 'none';
                                loginModal.classList.remove('show');
                            }
                            showNotification(`Bienvenue, ${currentUser.name} !`, 'success');
                            // Recharger la page pour obtenir les données Proxmox
                            // Les fenêtres seront restaurées automatiquement après le rechargement
                            setTimeout(() => location.reload(), 500);
                        } else {
                            showNotification(data.message || 'Identifiants incorrects', 'error');
                        }
                    })
                    .catch(error => {
                        console.error('Erreur:', error);
                        showNotification('Erreur de connexion au serveur', 'error');
                    });
            } else {
                // Mode simulation
                currentUser = {
                    username: username,
                    name: username === 'admin' ? 'Administrateur' : username.charAt(0).toUpperCase() + username.slice(1),
                    role: username === 'admin' ? 'Admin' : 'Utilisateur',
                    realm: 'local',
                    avatar: username.charAt(0).toUpperCase()
                };

                updateUserProfile();
                showNotification(`Bienvenue, ${currentUser.name} !`, 'success');
                allowProxmoxRequests = false;
                setAuthUiState(true);
                init();
            }
        }

        function updateUserProfile() {
            if (currentUser) {
                const avatar = document.getElementById('taskbar-user-avatar');
                if (avatar) avatar.textContent = currentUser.avatar;
            }
            if (globalThis.ProxPanelDesktop?.updateLauncherAccount) {
                ProxPanelDesktop.updateLauncherAccount();
            }
        }

        function showUserMenu() {
            if (!currentUser) return;

            const actions = [
                { icon: 'fa-user', label: 'Profil', action: () => showNotification('Menu profil - À implémenter', 'info') },
                { icon: 'fa-cog', label: 'Paramètres', action: () => showNotification('Menu paramètres - À implémenter', 'info') },
                { icon: 'fa-sign-out-alt', label: 'Déconnexion', action: logout, danger: true }
            ];

            // Simple menu pour l'instant - peut être amélioré avec un dropdown
            const action = confirm(`Profil: ${currentUser.name}\nRôle: ${currentUser.role}\n\nVoulez-vous vous déconnecter ?`);
            if (action) {
                logout();
            }
        }

        function logout() {
            if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
                // Si en production, déconnexion via le serveur
                if (isProduction) {
                    fetch('/api/auth/logout', { method: 'POST' })
                        .then(response => response.json())
                        .then(data => {
                            currentUser = null;
                            const loginModal = document.getElementById('login-modal');
                            if (loginModal) {
                                loginModal.style.display = 'flex';
                                loginModal.classList.add('show');
                            }
                            document.getElementById('login-username').value = '';
                            document.getElementById('login-password').value = '';
                            showNotification('Vous avez été déconnecté', 'info');
                            // Recharger la page pour réinitialiser
                            setTimeout(() => location.reload(), 500);
                        })
                        .catch(error => {
                            console.error('Erreur:', error);
                            location.reload();
                        });
                } else {
                    currentUser = null;
                    const loginModal = document.getElementById('login-modal');
                    if (loginModal) {
                        loginModal.style.display = 'flex';
                        loginModal.classList.add('show');
                    }
                    document.getElementById('login-username').value = '';
                    document.getElementById('login-password').value = '';
                    showNotification('Vous avez été déconnecté', 'info');
                }
            }
        }

        // --- VIEW / DESKTOP MANAGEMENT ---
        let currentView = 'dashboard';
        let taskbarClockTimer = null;

        function resolveWinKey(idOrKey) {
            if (idOrKey == null) return '';
            const s = String(idOrKey);
            if (s.startsWith('win-')) return s.slice(4);
            if (/^(console|app|config|shell)-/.test(s)) return s;
            const n = Number(s);
            if (!Number.isNaN(n) && n > 0) return `console-${n}`;
            return s;
        }

        function viewContainer(viewId) {
            const id = viewId || currentView;
            if (!id) return null;
            return document.querySelector(`.app-view-body[data-app-id="${id}"]`);
        }

        function escWinHtml(s) {
            return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        }

        function getClusterSummary() {
            const ctx = getDesktopContext();
            return ctx.cluster;
        }

        function getDesktopContext() {
            const onlineNodes = clusterNodes.filter((n) => n.status === 'online');
            const nodes = clusterNodes.length;
            const online = onlineNodes.length;
            const vms = machines.length;
            const running = machines.filter((m) => m.status === 'running').length;
            const stopped = machines.filter((m) => m.status === 'stopped').length;
            const offline = nodes - online;

            let avgCpu = 0;
            let avgRam = 0;
            let avgLoad = 0;
            let ramUsedGb = 0;
            let ramTotalGb = 0;
            if (onlineNodes.length) {
                avgCpu = onlineNodes.reduce((s, n) => s + (n.cpu || 0), 0) / onlineNodes.length;
                const ramPcts = onlineNodes.map((n) => {
                    const used = n.ram?.used || 0;
                    const total = n.ram?.total || 0;
                    ramUsedGb += used;
                    ramTotalGb += total;
                    return total > 0 ? (used / total) * 100 : 0;
                });
                avgRam = ramPcts.reduce((s, p) => s + p, 0) / ramPcts.length;
                avgLoad = onlineNodes.reduce((s, n) => s + (n.loadavg?.[0] || 0), 0) / onlineNodes.length;
            }

            const tasksRunning = tasksData.filter((t) => t.status === 'running').length;
            const tasksErrors = tasksData.filter((t) => t.status === 'error').length;

            const topVms = [...machines]
                .filter((m) => m.status === 'running')
                .sort((a, b) => (b.cpu || 0) - (a.cpu || 0));

            const topRamVms = [...machines]
                .filter((m) => m.status === 'running')
                .sort((a, b) => (b.ram || 0) - (a.ram || 0));

            const runningVms = machines.filter((m) => m.status === 'running');
            const stoppedVms = machines.filter((m) => m.status === 'stopped');
            const vmCount = machines.filter((m) => m.type === 'vm' && !m.template).length;
            const lxcCount = machines.filter((m) => m.type === 'lxc').length;
            const templateCount = machines.filter((m) => m.template).length;
            const autostartCount = machines.filter((m) => m.config?.autostart).length;
            let backupsTotal = 0;
            let vmsWithBackup = 0;
            machines.forEach((m) => {
                const b = m.backups?.length || 0;
                if (b > 0) { backupsTotal += b; vmsWithBackup += 1; }
            });

            const nodeRamList = onlineNodes.map((n) => {
                const used = n.ram?.used || 0;
                const total = n.ram?.total || 0;
                return { name: n.name, used, total, pct: total > 0 ? (used / total) * 100 : 0 };
            });

            const nodeUptimes = clusterNodes.map((n) => ({
                name: n.name,
                uptime: n.uptime || 'N/A',
            }));

            const vmIps = runningVms.filter((m) => m.ip).map((m) => ({ name: m.name, ip: m.ip }));

            const recentTasks = [...tasksData]
                .sort((a, b) => (b.starttime || 0) - (a.starttime || 0))
                .slice(0, 6)
                .map((t) => ({
                    status: t.status,
                    label: `${t.type || 'task'} ${t.id ? `#${t.id}` : ''}`.trim(),
                }));

            const now = new Date();
            const traffic = getClusterTrafficRates();

            let healthScore = 100;
            if (offline > 0) healthScore -= offline * 15;
            if (stopped > 0) healthScore -= Math.min(30, stopped * 3);
            if (tasksErrors > 0) healthScore -= tasksErrors * 10;
            healthScore = Math.max(0, Math.min(100, healthScore));

            const quotes = [
                'Pensez à tester vos sauvegardes avant une mise à jour majeure.',
                'Un snapshot rapide peut vous sauver avant un changement risqué.',
                'Surveillez le load average si le CPU reste bas mais les perfs chutent.',
                'Documentez vos VMID et vos mappings réseau dans les notes du bureau.',
            ];
            const quote = quotes[now.getDate() % quotes.length];
            const pinnedApps = globalThis.ProxPanelAppRegistry?.pinnedApps?.() || [];

            return {
                cluster: {
                    nodes,
                    online,
                    offline,
                    vms,
                    running,
                    stopped,
                    avgCpu,
                    avgRam,
                    avgLoad,
                    ramUsedGb,
                    ramTotalGb,
                    tasksRunning,
                    tasksErrors,
                    storageSummary: `${nodes} nœud(s) · ${vms} instance(s)`,
                    netRxMbps: traffic.netRxMbps,
                    netTxMbps: traffic.netTxMbps,
                    diskReadMbps: traffic.diskReadMbps,
                    diskWriteMbps: traffic.diskWriteMbps,
                    swapPct: avgRam > 85 ? avgRam - 70 : 0,
                    healthScore,
                    density: online > 0 ? vms / online : 0,
                },
                nodes: clusterNodes.map((n) => ({
                    name: n.name,
                    status: n.status,
                    cpu: n.cpu || 0,
                    ram: n.ram,
                })),
                topVms,
                topRamVms,
                runningVms,
                stoppedVms,
                vmTypes: { vm: vmCount, lxc: lxcCount, templates: templateCount },
                templateCount,
                autostartCount,
                backups: { total: backupsTotal, vmsWithBackup },
                nodeRamList,
                nodeUptimes,
                vmIps,
                recentTasks,
                allVmsShort: machines.map((m) => ({ id: m.id, name: m.name, type: m.type, node: m.node })),
                maintenanceCount: offline,
                hypervisor: { version: 'Proxmox VE', nodesLabel: `${nodes} nœud(s) dans le cluster` },
                quote,
                pinnedApps,
                clock: {
                    time: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                    date: now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
                    dayNum: now.getDate(),
                    monthShort: now.toLocaleDateString('fr-FR', { month: 'short' }),
                    weekdayShort: now.toLocaleDateString('fr-FR', { weekday: 'short' }),
                },
            };
        }

        function saveDesktopPreferences() {
            saveWindowsToLocalStorage();
        }

        function setupTaskbarClock() {
            const tick = () => {
                const el = document.getElementById('taskbar-clock');
                if (el) {
                    el.textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                }
            };
            tick();
            if (taskbarClockTimer) clearInterval(taskbarClockTimer);
            taskbarClockTimer = setInterval(tick, 30000);
        }

        function createAppWindow(app, winKey) {
            const layer = document.getElementById('window-layer');
            if (!layer || !app) return null;
            const winEl = document.createElement('div');
            winEl.className = 'window window-app';
            winEl.id = `win-${winKey}`;
            winEl.style.zIndex = ++zIndexCounter;
            const offset = windows.filter((w) => w.kind === 'app').length;
            const dw = app.defaultRect?.width || 900;
            const dh = app.defaultRect?.height || 600;
            winEl.style.left = `${56 + offset * 26}px`;
            winEl.style.top = `${32 + offset * 26}px`;
            winEl.style.width = `${dw}px`;
            winEl.style.height = `${dh}px`;
            winEl.innerHTML = `
                <div class="win-header" onmousedown="startDrag(event, 'win-${winKey}')" ondblclick="handleDoubleClick(event, 'win-${winKey}')">
                    <div class="win-title"><i class="fa-solid ${escWinHtml(app.icon)}"></i> ${escWinHtml(app.title)}</div>
                    <div class="win-controls">
                        <button type="button" onclick="minimizeWindow('${winKey}')"><i class="fa-solid fa-minus"></i></button>
                        <button type="button" onclick="maximizeWindow('${winKey}')"><i class="fa-regular fa-square"></i></button>
                        <button class="win-close" onclick="closeWindow('${winKey}')"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </div>
                <div class="win-content app-view-content" onclick="focusWindow('win-${winKey}')">
                    <div class="app-view-body" data-app-id="${escWinHtml(app.id)}"><p class="cfg-empty">Chargement…</p></div>
                </div>`;
            layer.appendChild(winEl);
            if (globalThis.ProxPanelWindowManager) {
                ProxPanelWindowManager.decorate(winEl, winKey);
            }
            const winObj = {
                winKey,
                kind: 'app',
                appId: app.id,
                name: app.title,
                icon: app.icon,
                type: 'app',
                state: 'normal',
                layoutMode: 'floating',
            };
            windows.push(winObj);
            new ResizeObserver(() => saveWindowsToLocalStorage()).observe(winEl);
            renderTaskbar();
            return winObj;
        }

        function focusAppWindow(winKey) {
            const key = resolveWinKey(winKey);
            restoreWindow(key);
        }

        async function loadAppContent(appId, container) {
            if (!container) return;
            currentView = appId;
            try {
                switch (appId) {
                    case 'dashboard':
                        container.innerHTML = await getDashboardView();
                        renderGrid();
                        break;
                    case 'nodes':
                        container.innerHTML = await getNodesView();
                        setTimeout(() => {
                            initNodeCharts();
                            startNodeChartsRefresh();
                        }, 100);
                        break;
                    case 'vms':
                        container.innerHTML = await getVMsManagementView();
                        initVMsManagementView();
                        break;
                    case 'storage':
                        container.innerHTML = await getStorageView();
                        break;
                    case 'file-explorer':
                        container.innerHTML = '<div class="file-explorer-host"></div>';
                        if (globalThis.ProxPanelFileExplorer) {
                            ProxPanelFileExplorer.init(container.querySelector('.file-explorer-host'));
                        } else {
                            container.innerHTML = '<p class="cfg-empty">Explorateur indisponible.</p>';
                        }
                        break;
                    case 'monitor':
                        container.innerHTML = await getMonitorView();
                        initMonitorView();
                        break;
                    case 'tasks':
                        container.innerHTML = await getTasksView();
                        initTasksView();
                        break;
                    case 'control-panel':
                        if (globalThis.ProxPanelControlPanel) {
                            ProxPanelControlPanel.init(container);
                        } else {
                            container.innerHTML = '<p class="cfg-empty">Panneau de configuration indisponible.</p>';
                        }
                        break;
                    case 'settings':
                        container.innerHTML = getSettingsView();
                        break;
                    case 'tools':
                        container.innerHTML = getToolsAppView();
                        break;
                    default:
                        container.innerHTML = '<p class="cfg-empty">Application inconnue.</p>';
                }
            } catch (err) {
                console.error(`Erreur chargement app ${appId}:`, err);
                container.innerHTML = '<p class="cfg-empty">Erreur de chargement. Réessayez.</p>';
            }
        }

        function getSettingsView() {
            return `
                <h3 style="margin:0 0 1rem;">Paramètres</h3>
                <div class="settings-panel">
                    <div class="settings-tile" onclick="ProxPanelDesktop.setWidgetEditMode(true)">
                        <span class="settings-tile-icon"><i class="fa-solid fa-puzzle-piece"></i></span>
                        <div><strong>Widgets bureau</strong><br><small style="color:#6b7280;">Ajouter, retirer et réorganiser</small></div>
                    </div>
                    <div class="settings-tile" onclick="showUserMenu()">
                        <span class="settings-tile-icon"><i class="fa-solid fa-user"></i></span>
                        <div><strong>Compte</strong><br><small style="color:#6b7280;">${escWinHtml(currentUser?.name || 'Utilisateur')}</small></div>
                    </div>
                    <div class="settings-tile" onclick="openToolsMenu('vmid')">
                        <span class="settings-tile-icon"><i class="fa-solid fa-wrench"></i></span>
                        <div><strong>Outils Proxmox</strong><br><small style="color:#6b7280;">Changer VMID, etc.</small></div>
                    </div>
                    <div class="settings-tile" onclick="logout()">
                        <span class="settings-tile-icon" style="background:#fee2e2;color:#dc2626;"><i class="fa-solid fa-sign-out-alt"></i></span>
                        <div><strong>Déconnexion</strong></div>
                    </div>
                </div>`;
        }

        function getToolsAppView() {
            return `
                <h3 style="margin:0 0 1rem;">Outils</h3>
                <div class="settings-panel">
                    <div class="settings-tile" onclick="ProxPanelDesktop.setWidgetEditMode(true)">
                        <span class="settings-tile-icon"><i class="fa-solid fa-puzzle-piece"></i></span>
                        <div><strong>Personnaliser le bureau</strong><br><small style="color:#6b7280;">Widgets et disposition</small></div>
                    </div>
                    <div class="settings-tile" onclick="openToolsMenu('vmid')">
                        <span class="settings-tile-icon"><i class="fa-solid fa-hashtag"></i></span>
                        <div><strong>Changer VMID</strong><br><small style="color:#6b7280;">Migration d'identifiant VM/CT</small></div>
                    </div>
                    <div class="settings-tile" onclick="ProxPanelDesktop.launchApp('monitor')">
                        <span class="settings-tile-icon"><i class="fa-solid fa-chart-line"></i></span>
                        <div><strong>Moniteur temps réel</strong><br><small style="color:#6b7280;">Métriques des instances</small></div>
                    </div>
                    <div class="settings-tile" onclick="ProxPanelDesktop.launchApp('tasks')">
                        <span class="settings-tile-icon"><i class="fa-solid fa-list-check"></i></span>
                        <div><strong>Journal des tâches</strong><br><small style="color:#6b7280;">Opérations Proxmox</small></div>
                    </div>
                </div>`;
        }

        function switchView(view) {
            currentView = view;
            if (globalThis.ProxPanelDesktop) {
                return ProxPanelDesktop.launchApp(view);
            }
            return Promise.resolve();
        }

        function setupDesktopShell() {
            if (!globalThis.ProxPanelDesktop) return;
            ProxPanelDesktop.configure({
                loadApp: loadAppContent,
                renderTaskbar,
                getDesktopContext,
                getWidgetLayout: () => desktopWidgetLayout,
                saveWidgetLayout: (layout) => {
                    desktopWidgetLayout = layout;
                    saveDesktopPreferences();
                },
                getWallpaper: () => desktopWallpaper,
                saveWallpaper: (id) => {
                    desktopWallpaper = id;
                    saveDesktopPreferences();
                },
                getWidgetNotes: () => desktopWidgetNotes,
                saveWidgetNotes: (text) => {
                    desktopWidgetNotes = text;
                    saveDesktopPreferences();
                },
                openDesktopNotesEditor: () => {
                    openNotesEditorWindow({
                        winKey: 'notes-desktop',
                        title: 'Notes du bureau',
                        initialText: desktopWidgetNotes,
                        hint: 'Bloc-notes personnel : markdown, HTML ou texte brut sur plusieurs lignes.',
                        onSave: async (text) => {
                            desktopWidgetNotes = text ?? '';
                            saveDesktopPreferences();
                            if (globalThis.ProxPanelDesktop) {
                                ProxPanelDesktop.refreshWidgets({ force: true });
                            }
                            showNotification('Notes du bureau enregistrées', 'success');
                            return true;
                        },
                    });
                },
                openConsole: (id, type, name, node) => openConsole(id, type, name, node),
                getWindows: () => windows,
                createAppWindow,
                focusAppWindow,
                openTools: (tool) => openToolsMenu(tool),
                showUserMenu,
                switchNode,
                getClusterSummary,
                getCurrentUser: () => currentUser,
                logout,
            });
            ProxPanelDesktop.init();
            setupTaskbarClock();
            setupTaskbarTasksFlyout();
            setupTaskbarWindowMenu();
            refreshTasksForWidgets();
            if (widgetRefreshTimer) clearInterval(widgetRefreshTimer);
            widgetRefreshTimer = setInterval(() => {
                if (globalThis.ProxPanelDesktop) ProxPanelDesktop.refreshWidgets();
            }, 10000);
        }

        let widgetRefreshTimer = null;

        async function refreshTasksForWidgets() {
            if (isProduction && userLoggedInProxmox) {
                try {
                    const data = await loadProxmoxData('tasks');
                    if (data?.tasks) tasksData = data.tasks;
                } catch (_) { /* ignore */ }
            } else if (!tasksData.length) {
                tasksData = [
                    { status: 'running' },
                    { status: 'stopped' },
                    { status: 'error' },
                ];
            }
            if (globalThis.ProxPanelDesktop) ProxPanelDesktop.refreshWidgets();
            updateTaskbarTasksBadge();
        }

        async function getDashboardView() {
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3 style="margin: 0;">Mes Instances</h3>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <div style="position: relative;">
                            <input type="text" id="vm-filter" placeholder="Rechercher une VM..." style="padding: 8px 35px 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; width: 250px; font-size: 0.9rem;" oninput="filterVMs()">
                            <i class="fa-solid fa-search" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: #9ca3af;"></i>
                        </div>
                        <select id="filter-type" style="padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.9rem; cursor: pointer;" onchange="filterVMs()">
                            <option value="">Tous les types</option>
                            <option value="vm">VM</option>
                            <option value="lxc">LXC</option>
                        </select>
                        <select id="filter-status" style="padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.9rem; cursor: pointer;" onchange="filterVMs()">
                            <option value="">Tous les statuts</option>
                            <option value="running">En cours</option>
                            <option value="stopped">Arrêté</option>
                        </select>
                    </div>
                </div>
                <div class="vm-grid" id="vm-grid"></div>
            `;
        }

        // Historique des métriques pour les graphiques
        let nodeMetricsHistory = {};
        const nodeLastRamMetrics = {};

        function getNodeRamDisplay(node) {
            const used = node.ram?.used || 0;
            const total = node.ram?.total || 0;
            if (total > 0) {
                const snapshot = {
                    percent: (used / total) * 100,
                    used,
                    total,
                };
                nodeLastRamMetrics[node.name] = snapshot;
                return snapshot;
            }
            return nodeLastRamMetrics[node.name] || { percent: 0, used: 0, total: 0 };
        }

        function addNodeMetric(nodeName, snapshot) {
            if (!nodeMetricsHistory[nodeName]) {
                nodeMetricsHistory[nodeName] = {
                    cpu: [],
                    ram: [],
                    loadavg: [],
                    timestamps: []
                };
            }
            const history = nodeMetricsHistory[nodeName];
            const now = new Date();
            history.cpu.push(snapshot.cpu ?? 0);
            history.ram.push(snapshot.ram ?? 0);
            history.loadavg.push(snapshot.loadavg ?? 0);
            history.timestamps.push(now);

            if (history.timestamps.length > 30) {
                history.cpu.shift();
                history.ram.shift();
                history.loadavg.shift();
                history.timestamps.shift();
            }
        }

        async function getNodesView() {
            // Load real node data if in production
            if (isProduction && userLoggedInProxmox) {
                const data = await loadProxmoxData('nodes');
                if (data && data.nodes) {
                    // Merge real data with existing nodes
                    data.nodes.forEach(nodeData => {
                        const node = clusterNodes.find(n => n.name === nodeData.name);
                        if (node) {
                            node.cpu = nodeData.cpu || 0;
                            node.ram = nodeData.ram || { used: 0, total: 0 };
                            node.uptime = formatUptime(nodeData.uptime);
                            node.loadavg = nodeData.loadavg || [0, 0, 0];
                            node.kversion = nodeData.kversion || '';
                            node.maxcpu = nodeData.maxcpu || 1;
                            node.maxmem = nodeData.maxmem || 0;
                            if (nodeData.netin != null) node.netin = nodeData.netin;
                            if (nodeData.netout != null) node.netout = nodeData.netout;
                            if (nodeData.diskread != null) node.diskread = nodeData.diskread;
                            if (nodeData.diskwrite != null) node.diskwrite = nodeData.diskwrite;

                            // Ajouter aux historiques pour les graphiques
                            if (node.status === 'online') {
                                const ramDisplay = getNodeRamDisplay(node);
                                addNodeMetric(node.name, {
                                    cpu: node.cpu || 0,
                                    ram: ramDisplay.percent,
                                    loadavg: node.loadavg && node.loadavg[0] ? node.loadavg[0] : 0,
                                });
                            }
                        }
                    });
                }
            }

            sortClusterNodes();

            const nodesHtml = clusterNodes.map((node, index) => {
                const ramDisplay = getNodeRamDisplay(node);
                const ramPercent = ramDisplay.percent.toFixed(1);
                const statusColor = node.status === 'online' ? '#10b981' : '#ef4444';
                const machineCount = node.machines ? node.machines.length : 0;
                const loadAvg = node.loadavg || [0, 0, 0];
                const runningVMs = node.machines ? node.machines.filter(m => m.status === 'running').length : 0;
                const stoppedVMs = machineCount - runningVMs;
                const ramUsedGB = ramDisplay.used.toFixed(2);
                const ramTotalGB = ramDisplay.total.toFixed(2);
                const ramFreeGB = (ramDisplay.total - ramDisplay.used).toFixed(2);
                const chartId = `node-chart-${index}`;
                const cpuChartId = `node-cpu-chart-${index}`;
                const ramChartId = `node-ram-chart-${index}`;
                const loadChartId = `node-load-chart-${index}`;

                // Préparer les données pour les graphiques
                const history = nodeMetricsHistory[node.name] || { cpu: [], ram: [], loadavg: [], timestamps: [] };
                const labels = history.timestamps.map(t => {
                    const d = new Date(t);
                    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                });

                return `
                    <div style="background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #f3f4f6; grid-column: span 2;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.75rem;">
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                <div style="width: 14px; height: 14px; border-radius: 50%; background: ${statusColor}; box-shadow: 0 0 8px ${statusColor}40;"></div>
                                <h3 style="margin: 0; font-size: 1.3rem; font-weight: 700;">${node.name}</h3>
                                <span style="font-size: 0.75rem; color: #6b7280; background: #f9fafb; padding: 4px 10px; border-radius: 12px; font-weight: 600;">
                                    ${machineCount} machines (${runningVMs} actives, ${stoppedVMs} arrêtées)
                                </span>
                            </div>
                            ${node.status === 'online' ? `
                            <button type="button" onclick="openNodeShell('${escapeHtml(node.name)}')" style="padding: 8px 14px; background: #111827; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; font-size: 0.85rem;">
                                <i class="fa-solid fa-terminal"></i> Shell hyperviseur
                            </button>` : ''}
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 1rem; border-radius: 10px; color: white;">
                                <div style="font-size: 0.75rem; opacity: 0.9; margin-bottom: 0.5rem;">CPU Utilisation</div>
                                <div style="font-size: 2rem; font-weight: 700;">${(node.cpu || 0).toFixed(1)}%</div>
                                <div style="font-size: 0.7rem; opacity: 0.8; margin-top: 0.25rem;">${node.maxcpu || 1} cores</div>
                            </div>
                            <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 1rem; border-radius: 10px; color: white;">
                                <div style="font-size: 0.75rem; opacity: 0.9; margin-bottom: 0.5rem;">RAM Utilisée</div>
                                <div style="font-size: 2rem; font-weight: 700;">${ramPercent}%</div>
                                <div style="font-size: 0.7rem; opacity: 0.8; margin-top: 0.25rem;">${ramUsedGB}GB / ${ramTotalGB}GB</div>
                            </div>
                            <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 1rem; border-radius: 10px; color: white;">
                                <div style="font-size: 0.75rem; opacity: 0.9; margin-bottom: 0.5rem;">Load Average</div>
                                <div style="font-size: 2rem; font-weight: 700;">${loadAvg[0] ? loadAvg[0].toFixed(2) : '0.00'}</div>
                                <div style="font-size: 0.7rem; opacity: 0.8; margin-top: 0.25rem;">1m, 5m, 15m</div>
                        </div>
                            <div style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); padding: 1rem; border-radius: 10px; color: white;">
                                <div style="font-size: 0.75rem; opacity: 0.9; margin-bottom: 0.5rem;">Uptime</div>
                                <div style="font-size: 1.5rem; font-weight: 700; line-height: 1.2;">${node.uptime || 'N/A'}</div>
                                <div style="font-size: 0.7rem; opacity: 0.8; margin-top: 0.25rem;">${node.status === 'online' ? '● En ligne' : '○ Hors ligne'}</div>
                            </div>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                            <div style="background: #f9fafb; padding: 1rem; border-radius: 8px;">
                                <div style="font-size: 0.85rem; font-weight: 600; color: #6b7280; margin-bottom: 0.75rem;">CPU - Évolution</div>
                                <canvas id="${cpuChartId}" style="max-height: 150px;"></canvas>
                            </div>
                            <div style="background: #f9fafb; padding: 1rem; border-radius: 8px;">
                                <div style="font-size: 0.85rem; font-weight: 600; color: #6b7280; margin-bottom: 0.75rem;">RAM - Évolution</div>
                                <canvas id="${ramChartId}" style="max-height: 150px;"></canvas>
                            </div>
                        </div>
                        
                        <div style="background: #f9fafb; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                            <div style="font-size: 0.85rem; font-weight: 600; color: #6b7280; margin-bottom: 0.75rem;">Load Average - Évolution</div>
                            <canvas id="${loadChartId}" style="max-height: 150px;"></canvas>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1rem;">
                            <div style="padding: 0.75rem; background: #f9fafb; border-radius: 8px;">
                                <div style="font-size: 0.7rem; color: #6b7280; margin-bottom: 0.25rem;">RAM Libre</div>
                                <div style="font-size: 1.1rem; font-weight: 700; color: #10b981;">${ramFreeGB} GB</div>
                            </div>
                            <div style="padding: 0.75rem; background: #f9fafb; border-radius: 8px;">
                                <div style="font-size: 0.7rem; color: #6b7280; margin-bottom: 0.25rem;">RAM Totale</div>
                                <div style="font-size: 1.1rem; font-weight: 700; color: #3b82f6;">${ramTotalGB} GB</div>
                            </div>
                            <div style="padding: 0.75rem; background: #f9fafb; border-radius: 8px;">
                                <div style="font-size: 0.7rem; color: #6b7280; margin-bottom: 0.25rem;">Kernel</div>
                                <div style="font-size: 0.9rem; font-weight: 600; color: #6b7280; word-break: break-all;">${node.kversion || 'N/A'}</div>
                            </div>
                            <div style="padding: 0.75rem; background: #f9fafb; border-radius: 8px;">
                                <div style="font-size: 0.7rem; color: #6b7280; margin-bottom: 0.25rem;">Load (1m, 5m, 15m)</div>
                                <div style="font-size: 0.9rem; font-weight: 600; color: #6b7280;">${loadAvg[0] ? loadAvg[0].toFixed(2) : '0.00'}, ${loadAvg[1] ? loadAvg[1].toFixed(2) : '0.00'}, ${loadAvg[2] ? loadAvg[2].toFixed(2) : '0.00'}</div>
                            </div>
                        </div>
                        
                        <div class="metric-pill" style="margin-bottom: 8px;">
                            <span class="metric-label">CPU</span>
                            <div class="metric-bar-bg"><div class="metric-bar-fill" style="width: ${Math.min(100, node.cpu || 0)}%"></div></div>
                            <span style="font-size:0.65rem; align-self:flex-end; margin-top:2px;">${(node.cpu || 0).toFixed(1)}%</span>
                        </div>
                        <div class="metric-pill">
                            <span class="metric-label">RAM</span>
                            <div class="metric-bar-bg"><div class="metric-bar-fill" style="width: ${ramPercent}%; background: #8b5cf6;"></div></div>
                            <span style="font-size:0.65rem; align-self:flex-end; margin-top:2px;">${ramUsedGB}GB / ${ramTotalGB}GB</span>
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <h3 style="margin: 0;">Gestion des Nœuds Proxmox</h3>
                        <button onclick="refreshNodeData()" style="padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                            <i class="fa-solid fa-sync-alt"></i> Actualiser
                        </button>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem;">
                        ${nodesHtml}
                    </div>
                </div>
            `;
        }

        let nodeChartsRefreshInterval = null;
        let nodeCharts = {};

        function startNodeChartsRefresh() {
            // Arrêter l'intervalle précédent si il existe
            if (nodeChartsRefreshInterval) {
                clearInterval(nodeChartsRefreshInterval);
            }

            // Rafraîchir les données et graphiques toutes les 10 secondes
            nodeChartsRefreshInterval = setInterval(async () => {
                if (currentView !== 'nodes') {
                    clearInterval(nodeChartsRefreshInterval);
                    nodeChartsRefreshInterval = null;
                    return;
                }

                await refreshNodeData();
            }, 10000);
        }

        function initNodeCharts() {
            // Détruire les graphiques existants
            Object.values(nodeCharts).forEach(chart => {
                if (chart && typeof chart.destroy === 'function') {
                    chart.destroy();
                }
            });
            nodeCharts = {};

            // Initialiser les graphiques après le rendu
            clusterNodes.forEach((node, index) => {
                const history = nodeMetricsHistory[node.name] || { cpu: [], ram: [], loadavg: [], timestamps: [] };
                const labels = history.timestamps.map(t => {
                    const d = new Date(t);
                    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                });

                // Graphique CPU
                const cpuCtx = document.getElementById(`node-cpu-chart-${index}`);
                if (cpuCtx && typeof Chart !== 'undefined') {
                    nodeCharts[`cpu-${index}`] = new Chart(cpuCtx, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: [{
                                label: 'CPU %',
                                data: history.cpu,
                                borderColor: '#667eea',
                                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                                tension: 0.4,
                                fill: true
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false }
                            },
                            scales: {
                                y: { beginAtZero: true, max: 100 }
                            }
                        }
                    });
                }

                // Graphique RAM
                const ramCtx = document.getElementById(`node-ram-chart-${index}`);
                if (ramCtx && typeof Chart !== 'undefined') {
                    nodeCharts[`ram-${index}`] = new Chart(ramCtx, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: [{
                                label: 'RAM %',
                                data: history.ram,
                                borderColor: '#f5576c',
                                backgroundColor: 'rgba(245, 87, 108, 0.1)',
                                tension: 0.4,
                                fill: true
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false }
                            },
                            scales: {
                                y: { beginAtZero: true, max: 100 }
                            }
                        }
                    });
                }

                // Graphique Load Average
                const loadCtx = document.getElementById(`node-load-chart-${index}`);
                if (loadCtx && typeof Chart !== 'undefined') {
                    nodeCharts[`load-${index}`] = new Chart(loadCtx, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: [{
                                label: 'Load Average',
                                data: history.loadavg,
                                borderColor: '#4facfe',
                                backgroundColor: 'rgba(79, 172, 254, 0.1)',
                                tension: 0.4,
                                fill: true
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false }
                            },
                            scales: {
                                y: { beginAtZero: true }
                            }
                        }
                    });
                }
            });
        }

        function updateNodeCharts() {
            // Mettre à jour les données des graphiques existants
            clusterNodes.forEach((node, index) => {
                const history = nodeMetricsHistory[node.name] || { cpu: [], ram: [], loadavg: [], timestamps: [] };
                const labels = history.timestamps.map(t => {
                    const d = new Date(t);
                    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                });

                // Mettre à jour le graphique CPU
                const cpuChart = nodeCharts[`cpu-${index}`];
                if (cpuChart) {
                    cpuChart.data.labels = labels;
                    cpuChart.data.datasets[0].data = history.cpu;
                    cpuChart.update('none');
                }

                // Mettre à jour le graphique RAM
                const ramChart = nodeCharts[`ram-${index}`];
                if (ramChart) {
                    ramChart.data.labels = labels;
                    ramChart.data.datasets[0].data = history.ram;
                    ramChart.update('none');
                }

                // Mettre à jour le graphique Load Average
                const loadChart = nodeCharts[`load-${index}`];
                if (loadChart) {
                    loadChart.data.labels = labels;
                    loadChart.data.datasets[0].data = history.loadavg;
                    loadChart.update('none');
                }
            });
        }

        let storageData = [];

        async function getStorageView() {
            // Load real storage data if in production
            if (isProduction && userLoggedInProxmox) {
                const data = await loadProxmoxData('storage');
                if (data && data.storage) {
                    storageData = data.storage;
                }
            } else {
                // Mock data for dev
                storageData = [
                    { name: 'local', type: 'directory', total: 400, used: 180, available: 220, active: 1, enabled: 1 },
                    { name: 'nas-data', type: 'nfs', total: 1000, used: 280, available: 720, active: 1, enabled: 1 }
                ];
            }

            const storageHtml = storageData.map(storage => {
                const usedPercent = storage.total > 0 ? ((storage.used / storage.total) * 100).toFixed(1) : 0;
                const icon = storage.type === 'nfs' || storage.type === 'cifs' ? 'fa-network-wired' : 'fa-hard-drive';
                const iconColor = storage.type === 'nfs' || storage.type === 'cifs' ? 'var(--accent)' : 'var(--primary)';
                const statusColor = storage.active && storage.enabled ? '#10b981' : '#ef4444';

                return `
                    <div style="background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #f3f4f6;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
                            <h4 style="margin: 0; font-size: 1.1rem;">
                                <i class="fa-solid ${icon}" style="color: ${iconColor};"></i> ${storage.name}
                            </h4>
                            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor};"></div>
                        </div>
                        <div style="font-size: 0.85rem; color: #6b7280; margin-bottom: 12px;">
                            Type: ${storage.type || 'unknown'} ${storage.active && storage.enabled ? '<span style="color: #10b981;">● Actif</span>' : '<span style="color: #ef4444;">○ Inactif</span>'}
                        </div>
                        <div class="metric-pill" style="margin-bottom: 8px;">
                            <span class="metric-label">Utilisé</span>
                            <div class="metric-bar-bg"><div class="metric-bar-fill" style="width: ${usedPercent}%; background: #10b981;"></div></div>
                            <span style="font-size:0.65rem; align-self:flex-end; margin-top:2px;">${usedPercent}%</span>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; font-size: 0.8rem; color: #6b7280;">
                            <div><i class="fa-solid fa-database"></i> Total: ${(storage.total || 0).toFixed(1)} GB</div>
                            <div><i class="fa-solid fa-check-circle"></i> Disponible: ${(storage.available || 0).toFixed(1)} GB</div>
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <h3 style="margin: 0;">Gestion du Stockage</h3>
                        <button onclick="refreshStorageData()" style="padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                            <i class="fa-solid fa-sync-alt"></i> Actualiser
                        </button>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 1.5rem;">
                        ${storageHtml || '<div style="text-align:center; padding:3rem; color:#6b7280;">Aucun stockage disponible</div>'}
                    </div>
                </div>
            `;
        }

        async function refreshStorageData() {
            if (isProduction && userLoggedInProxmox) {
                const data = await loadProxmoxData('storage');
                if (data && data.storage) {
                    storageData = data.storage;
                    if (currentView === 'storage') {
                        const dashboardContent = viewContainer();
                        dashboardContent.innerHTML = await getStorageView();
                    }
                }
            }
        }

        // --- MONITOR VIEW ---
        let monitorSortBy = 'name';
        let monitorSortOrder = 'asc';
        let networkStatsPrev = {};
        let diskStatsPrev = {};
        let nodeNetworkStatsPrev = {};
        let nodeDiskStatsPrev = {};

        function vmStatsKey(vm) {
            if (!vm) return '';
            return `${vm.node || ''}:${vm.type || 'vm'}:${vm.id}`;
        }

        function measureCounterRate(prevStore, key, currentIn, currentOut, inKey, outKey) {
            const now = Date.now();
            const prev = prevStore[key];
            const curIn = Number(currentIn) || 0;
            const curOut = Number(currentOut) || 0;

            if (!prev) {
                prevStore[key] = { [inKey]: curIn, [outKey]: curOut, timestamp: now };
                return { inSpeed: 0, outSpeed: 0 };
            }

            const timeDiff = (now - prev.timestamp) / 1000;
            if (timeDiff <= 0) {
                return { inSpeed: 0, outSpeed: 0 };
            }

            let inDiff = curIn - (prev[inKey] ?? 0);
            let outDiff = curOut - (prev[outKey] ?? 0);
            if (inDiff < 0 || outDiff < 0) {
                prevStore[key] = { [inKey]: curIn, [outKey]: curOut, timestamp: now };
                return { inSpeed: 0, outSpeed: 0 };
            }

            const inSpeed = (inDiff * 8) / timeDiff;
            const outSpeed = (outDiff * 8) / timeDiff;
            prevStore[key] = { [inKey]: curIn, [outKey]: curOut, timestamp: now };
            return { inSpeed, outSpeed };
        }

        function updateNetworkSpeedsForVms(vms) {
            let totalRxBps = 0;
            let totalTxBps = 0;
            (vms || []).forEach((vm) => {
                const key = vmStatsKey(vm);
                if (!key || vm.status !== 'running') return;
                const { inSpeed, outSpeed } = measureCounterRate(
                    networkStatsPrev,
                    key,
                    vm.netin || 0,
                    vm.netout || 0,
                    'netin',
                    'netout'
                );
                vm.netinSpeed = inSpeed;
                vm.netoutSpeed = outSpeed;
                totalRxBps += inSpeed;
                totalTxBps += outSpeed;
            });
            return { totalRxBps, totalTxBps };
        }

        function updateDiskSpeedsForVms(vms) {
            let totalReadBps = 0;
            let totalWriteBps = 0;
            (vms || []).forEach((vm) => {
                const key = vmStatsKey(vm);
                if (!key || vm.status !== 'running') return;
                const { inSpeed, outSpeed } = measureCounterRate(
                    diskStatsPrev,
                    key,
                    vm.diskread || 0,
                    vm.diskwrite || 0,
                    'diskread',
                    'diskwrite'
                );
                vm.diskreadSpeed = inSpeed / 8;
                vm.diskwriteSpeed = outSpeed / 8;
                totalReadBps += inSpeed / 8;
                totalWriteBps += outSpeed / 8;
            });
            return { totalReadBps, totalWriteBps };
        }

        function updateNetworkSpeedsForNodes(nodes) {
            let totalRxBps = 0;
            let totalTxBps = 0;
            (nodes || []).forEach((node) => {
                if (node.status !== 'online') return;
                const key = node.name || node.id;
                if (!key) return;
                const { inSpeed, outSpeed } = measureCounterRate(
                    nodeNetworkStatsPrev,
                    key,
                    node.netin || 0,
                    node.netout || 0,
                    'netin',
                    'netout'
                );
                node.netinSpeed = inSpeed;
                node.netoutSpeed = outSpeed;
                totalRxBps += inSpeed;
                totalTxBps += outSpeed;
            });
            return { totalRxBps, totalTxBps };
        }

        function updateDiskSpeedsForNodes(nodes) {
            let totalReadBps = 0;
            let totalWriteBps = 0;
            (nodes || []).forEach((node) => {
                if (node.status !== 'online') return;
                const key = node.name || node.id;
                if (!key) return;
                const { inSpeed, outSpeed } = measureCounterRate(
                    nodeDiskStatsPrev,
                    key,
                    node.diskread || 0,
                    node.diskwrite || 0,
                    'diskread',
                    'diskwrite'
                );
                node.diskreadSpeed = inSpeed / 8;
                node.diskwriteSpeed = outSpeed / 8;
                totalReadBps += inSpeed / 8;
                totalWriteBps += outSpeed / 8;
            });
            return { totalReadBps, totalWriteBps };
        }

        /** Débits cluster pour widgets : agrégat des nœuds en ligne (pas des VM). */
        function getClusterTrafficRates() {
            const onlineNodes = clusterNodes.filter((n) => n.status === 'online');
            const net = updateNetworkSpeedsForNodes(onlineNodes);
            const disk = updateDiskSpeedsForNodes(onlineNodes);
            return {
                netRxMbps: net.totalRxBps / 1e6,
                netTxMbps: net.totalTxBps / 1e6,
                diskReadMbps: disk.totalReadBps / 1e6,
                diskWriteMbps: disk.totalWriteBps / 1e6,
            };
        }

        async function getMonitorView() {
            // Charger les resources pour avoir les données à jour
            if (isProduction && userLoggedInProxmox) {
                // Charger resources pour avoir les VMs et leurs stats
                const resourcesData = await loadProxmoxData('resources');
                if (resourcesData && resourcesData.resources) {
                    // Mettre à jour machines depuis resources
                    await refreshVMData();
                }
                // Charger les stats détaillées pour les VMs running
                await refreshVMStats();
            }

            const activeVMs = machines.filter((vm) => vm.status === 'running');
            updateNetworkSpeedsForVms(activeVMs);
            return generateMonitorHTML(activeVMs);
        }

        function formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        function formatBitrate(bps) {
            if (bps === 0 || isNaN(bps) || !isFinite(bps)) return '0 bps';
            const k = 1000; // Pour les bits, on utilise 1000
            const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
            const i = Math.max(0, Math.min(sizes.length - 1, Math.floor(Math.log(bps) / Math.log(k))));
            const value = bps / Math.pow(k, i);
            return parseFloat(value.toFixed(2)) + ' ' + sizes[i];
        }

        function generateMonitorHTML(vms) {
            if (vms.length === 0) {
                return `
                    <div class="pulse-view">
                        <div class="pulse-header">
                            <h2><i class="fa-solid fa-chart-line"></i> Moniteur - Machines Actives</h2>
                            <div class="pulse-stats">
                                <div class="pulse-stat">
                                    <div class="pulse-stat-label">Machines Actives</div>
                                    <div class="pulse-stat-value">0</div>
                                </div>
                            </div>
                        </div>
                        <div class="pulse-empty">
                            <i class="fa-solid fa-server"></i>
                            <h3>Aucune machine active</h3>
                            <p>Toutes les machines sont arrêtées</p>
                        </div>
                    </div>
                `;
            }

            // Calculer les statistiques globales
            const totalCPU = vms.reduce((sum, vm) => sum + (vm.cpu || 0), 0);
            const totalRAM = vms.reduce((sum, vm) => sum + (vm.ram || 0), 0);
            const avgCPU = (totalCPU / vms.length).toFixed(1);
            const avgRAM = (totalRAM / vms.length).toFixed(1);

            // Trier les VMs
            const sortedVMs = [...vms].sort((a, b) => {
                let aVal, bVal;
                switch (monitorSortBy) {
                    case 'name':
                        aVal = a.name.toLowerCase();
                        bVal = b.name.toLowerCase();
                        return monitorSortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    case 'id':
                        aVal = a.id || 0;
                        bVal = b.id || 0;
                        return monitorSortOrder === 'asc' ? aVal - bVal : bVal - aVal;
                    case 'cpu':
                        aVal = a.cpu || 0;
                        bVal = b.cpu || 0;
                        return monitorSortOrder === 'asc' ? aVal - bVal : bVal - aVal;
                    case 'ram':
                        aVal = a.ram || 0;
                        bVal = b.ram || 0;
                        return monitorSortOrder === 'asc' ? aVal - bVal : bVal - aVal;
                    case 'node':
                        aVal = (a.node || '').toLowerCase();
                        bVal = (b.node || '').toLowerCase();
                        return monitorSortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    case 'netout':
                        // Trier par débit actif (netoutSpeed) - ordre décroissant par défaut
                        aVal = a.netoutSpeed || 0;
                        bVal = b.netoutSpeed || 0;
                        // Par défaut, trier du plus grand au plus petit pour le réseau
                        if (monitorSortOrder === 'asc') {
                            return aVal - bVal;
                        } else {
                            return bVal - aVal;
                        }
                    case 'netin':
                        // Trier par débit actif (netinSpeed) - ordre décroissant par défaut
                        aVal = a.netinSpeed || 0;
                        bVal = b.netinSpeed || 0;
                        // Par défaut, trier du plus grand au plus petit pour le réseau
                        if (monitorSortOrder === 'asc') {
                            return aVal - bVal;
                        } else {
                            return bVal - aVal;
                        }
                    default:
                        return 0;
                }
            });

            const vmItems = sortedVMs.map(vm => {
                // Utiliser les débits déjà calculés
                const netinFormatted = formatBitrate(vm.netinSpeed || 0);
                const netoutFormatted = formatBitrate(vm.netoutSpeed || 0);

                return `
                    <div class="pulse-vm-item ${vm.type}" onclick="openConfig(${vm.id})">
                        <div class="pulse-vm-header">
                            <div>
                                <div class="pulse-vm-name">${vm.name}</div>
                                <div class="pulse-vm-node" style="font-size: 0.75rem; color: #9ca3af; margin-top: 2px;">
                                    ID: ${vm.id} | <i class="fa-solid fa-server"></i> ${vm.node || 'N/A'}
                                </div>
                            </div>
                            <span class="pulse-vm-badge ${vm.type}">
                                <i class="fa-solid fa-${vm.type === 'vm' ? 'cube' : 'box'}"></i>
                                ${vm.type.toUpperCase()}
                            </span>
                        </div>
                        <div class="pulse-vm-metrics">
                            <div class="pulse-metric">
                                <div class="pulse-metric-label">CPU</div>
                                <div class="pulse-metric-value">${(vm.cpu || 0).toFixed(1)}%</div>
                                <div class="pulse-metric-bar">
                                    <div class="pulse-metric-fill cpu" style="width: ${Math.min(100, vm.cpu || 0)}%"></div>
                                </div>
                            </div>
                            <div class="pulse-metric">
                                <div class="pulse-metric-label">Mémoire</div>
                                <div class="pulse-metric-value">${(vm.ram || 0).toFixed(1)}%</div>
                                <div class="pulse-metric-bar">
                                    <div class="pulse-metric-fill ram" style="width: ${Math.min(100, vm.ram || 0)}%"></div>
                                </div>
                            </div>
                            <div class="pulse-metric">
                                <div class="pulse-metric-label">Réseau ↑</div>
                                <div class="pulse-metric-value" style="font-size: 0.9rem;">${netoutFormatted}</div>
                            </div>
                            <div class="pulse-metric">
                                <div class="pulse-metric-label">Réseau ↓</div>
                                <div class="pulse-metric-value" style="font-size: 0.9rem;">${netinFormatted}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="pulse-view">
                    <div class="pulse-header">
                        <h2><i class="fa-solid fa-chart-line"></i> Moniteur - Machines Actives</h2>
                        <div class="pulse-controls">
                            <button class="pulse-sort-btn ${monitorSortBy === 'name' ? 'active' : ''}" onclick="monitorSort('name')">
                                <i class="fa-solid fa-${monitorSortBy === 'name' && monitorSortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}"></i>
                                Nom
                            </button>
                            <button class="pulse-sort-btn ${monitorSortBy === 'id' ? 'active' : ''}" onclick="monitorSort('id')">
                                <i class="fa-solid fa-${monitorSortBy === 'id' && monitorSortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}"></i>
                                ID
                            </button>
                            <button class="pulse-sort-btn ${monitorSortBy === 'cpu' ? 'active' : ''}" onclick="monitorSort('cpu')">
                                <i class="fa-solid fa-${monitorSortBy === 'cpu' && monitorSortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}"></i>
                                CPU
                            </button>
                            <button class="pulse-sort-btn ${monitorSortBy === 'ram' ? 'active' : ''}" onclick="monitorSort('ram')">
                                <i class="fa-solid fa-${monitorSortBy === 'ram' && monitorSortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}"></i>
                                RAM
                            </button>
                            <button class="pulse-sort-btn ${monitorSortBy === 'netout' ? 'active' : ''}" onclick="monitorSort('netout')">
                                <i class="fa-solid fa-${monitorSortBy === 'netout' && monitorSortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}"></i>
                                Upload
                            </button>
                            <button class="pulse-sort-btn ${monitorSortBy === 'netin' ? 'active' : ''}" onclick="monitorSort('netin')">
                                <i class="fa-solid fa-${monitorSortBy === 'netin' && monitorSortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}"></i>
                                Download
                            </button>
                            <button class="pulse-sort-btn ${monitorSortBy === 'node' ? 'active' : ''}" onclick="monitorSort('node')">
                                <i class="fa-solid fa-${monitorSortBy === 'node' && monitorSortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}"></i>
                                Nœud
                            </button>
                        </div>
                        <div class="pulse-stats">
                            <div class="pulse-stat">
                                <div class="pulse-stat-label">Machines Actives</div>
                                <div class="pulse-stat-value">${vms.length}</div>
                            </div>
                            <div class="pulse-stat">
                                <div class="pulse-stat-label">CPU Moyen</div>
                                <div class="pulse-stat-value">${avgCPU}%</div>
                            </div>
                            <div class="pulse-stat">
                                <div class="pulse-stat-label">RAM Moyenne</div>
                                <div class="pulse-stat-value">${avgRAM}%</div>
                            </div>
                        </div>
                    </div>
                    <div class="pulse-list">
                        ${vmItems}
                    </div>
                </div>
            `;
        }

        function monitorSort(sortBy) {
            if (monitorSortBy === sortBy) {
                // Inverser l'ordre si on clique sur le même critère
                monitorSortOrder = monitorSortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                monitorSortBy = sortBy;
                monitorSortOrder = 'asc';
            }

            // Re-générer la vue
            if (currentView === 'monitor') {
                const dashboardContent = viewContainer();
                if (dashboardContent) {
                    dashboardContent.innerHTML = generateMonitorHTML(machines.filter(vm => vm.status === 'running'));
                }
            }
        }

        function initMonitorView() {
            // Actualiser les stats toutes les 10 secondes
            if (currentView === 'monitor') {
                const intervalId = setInterval(async () => {
                    if (currentView !== 'monitor') {
                        clearInterval(intervalId);
                        return;
                    }
                    await refreshVMStats();
                    updateNetworkSpeedsForVms(machines.filter((vm) => vm.status === 'running'));
                    const dashboardContent = viewContainer();
                    if (dashboardContent) {
                        dashboardContent.innerHTML = generateMonitorHTML(machines.filter(vm => vm.status === 'running'));
                    }
                }, 10000);
            }
        }

        // --- VMs MANAGEMENT VIEW ---
        let selectedVM = null;
        let vmsManagementRefreshInterval = null;
        let vmSortBy = 'id';
        let vmSortOrder = 'asc';

        async function getVMsManagementView() {
            // Charger les données VMs si nécessaire
            if (machines.length === 0) {
                await refreshVMData();
            }

            return generateVMsManagementHTML();
        }

        function getVmStatusColor(status) {
            if (status === 'running') return '#10b981';
            if (status === 'stopped') return '#6b7280';
            if (status === 'paused' || status === 'suspended') return '#f59e0b';
            return '#6b7280';
        }

        function getVmStatusLabel(status) {
            if (status === 'running') return 'En cours';
            if (status === 'stopped') return 'Arrêtée';
            if (status === 'paused' || status === 'suspended') return 'Suspendue';
            return 'Inconnue';
        }

        function getVmDetailsActionsHTML(vm) {
            const isPaused = vm.status === 'paused' || vm.status === 'suspended';
            const canStart = vm.status === 'stopped';
            const canStop = vm.status === 'running';
            return `
                ${vm.template ? `
                    <button onclick="cloneVM(${vm.id})" style="padding: 8px 16px; background: var(--accent); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-copy"></i> Cloner
                    </button>
                ` : `
                    <div class="power-split">
                        ${isPaused ? `
                            <button onclick="vmAction('resume', ${vm.id}, '${vm.node}', '${vm.type}')" style="padding: 8px 16px; background: #f59e0b; color: white; border: none; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-play"></i> Reprendre
                            </button>
                        ` : canStart ? `
                            <button onclick="vmAction('start', ${vm.id}, '${vm.node}', '${vm.type}')" style="padding: 8px 16px; background: #10b981; color: white; border: none; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-play"></i> Démarrer
                            </button>
                        ` : `
                            <button onclick="vmAction('shutdown', ${vm.id}, '${vm.node}', '${vm.type}')" style="padding: 8px 12px; background: #6366f1; color: white; border: none; cursor: pointer; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;" title="Arrêt propre (ACPI)">
                                <i class="fa-solid fa-power-off"></i> Arrêt
                            </button>
                        `}
                        ${!canStart ? `
                            <button class="btn-caret" onclick="togglePowerMenu(${vm.id}, event)" title="Autres actions">
                                <i class="fa-solid fa-caret-down"></i>
                            </button>
                            <div class="power-actions-dropdown" id="power-menu-${vm.id}">
                                ${!isPaused ? `<button class="power-action-item" onclick="vmAction('suspend', ${vm.id}, '${vm.node}', '${vm.type}'); closePowerMenu(${vm.id});">Suspendre</button>` : ''}
                                <button class="power-action-item" onclick="vmAction('stop', ${vm.id}, '${vm.node}', '${vm.type}'); closePowerMenu(${vm.id});">Arrêter</button>
                            </div>
                        ` : ''}
                    </div>
                    <button onclick="openConsole(${vm.id}, '${vm.type}', '${vm.name}', '${vm.node}')" style="padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-terminal"></i> Console
                    </button>
                `}
            `;
        }

        function getVmCardActionsHTML(vm, isRun) {
            const isPaused = vm.status === 'paused' || vm.status === 'suspended';
            const isTemplate = vm.template === true;
            return `
                ${isTemplate ? 
                    `<button class="btn" style="background: var(--accent); color: white; flex: 1;" onclick="cloneVM(${vm.id})" title="Cloner ce modèle">
                        <i class="fa-solid fa-copy"></i> Cloner
                    </button>` :
                    `
                    <div class="power-split">
                        ${isPaused ? `
                            <button class="btn" style="background: #f59e0b; color: white; flex: 1;" onclick="vmAction('resume', ${vm.id}, '${vm.node}', '${vm.type}')" title="Reprendre">
                                <i class="fa-solid fa-play"></i> Reprendre
                            </button>
                        ` : !isRun ? `
                            <button class="btn" style="background: #10b981; color: white; flex: 1;" onclick="vmAction('start', ${vm.id}, '${vm.node}', '${vm.type}')" title="Démarrer">
                                <i class="fa-solid fa-play"></i> Démarrer
                            </button>
                        ` : `
                            <button class="btn btn-power" onclick="vmAction('shutdown', ${vm.id}, '${vm.node}', '${vm.type}')" title="Arrêt propre (ACPI)">
                                <i class="fa-solid fa-power-off"></i> Arrêt
                            </button>
                        `}
                        ${isRun || isPaused ? `
                            <button class="btn btn-caret" onclick="togglePowerMenu(${vm.id}, event)" title="Autres actions">
                                <i class="fa-solid fa-caret-down"></i>
                            </button>
                            <div class="power-actions-dropdown" id="power-menu-${vm.id}">
                                ${!isPaused ? `<button class="power-action-item" onclick="vmAction('suspend', ${vm.id}, '${vm.node}', '${vm.type}'); closePowerMenu(${vm.id});">Suspendre</button>` : ''}
                                <button class="power-action-item" onclick="vmAction('stop', ${vm.id}, '${vm.node}', '${vm.type}'); closePowerMenu(${vm.id});">Arrêter</button>
                            </div>
                        ` : ''}
                    </div>
                    <button class="btn btn-console" onclick="openConsole(${vm.id}, '${vm.type}', '${vm.name}', '${vm.node || ''}')" ${!isRun ? 'disabled style="opacity:0.5"' : ''} title="Ouvrir la console" style="flex: 1;">
                        <i class="fa-solid fa-terminal"></i> Console
                    </button>
                    `
                }
            `;
        }

        function generateVMsManagementHTML() {
            // Trier les VMs comme Proxmox (par ID par défaut)
            const sortedVMs = [...machines].sort((a, b) => {
                let aVal, bVal;
                switch (vmSortBy) {
                    case 'id':
                        aVal = a.id || 0;
                        bVal = b.id || 0;
                        return vmSortOrder === 'asc' ? aVal - bVal : bVal - aVal;
                    case 'name':
                        aVal = (a.name || '').toLowerCase();
                        bVal = (b.name || '').toLowerCase();
                        return vmSortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    case 'status':
                        aVal = a.status || '';
                        bVal = b.status || '';
                        return vmSortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    case 'node':
                        aVal = (a.node || '').toLowerCase();
                        bVal = (b.node || '').toLowerCase();
                        return vmSortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    case 'type':
                        aVal = a.type || '';
                        bVal = b.type || '';
                        return vmSortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    default:
                        return 0;
                }
            });

            const vmListItems = sortedVMs.map(vm => {
                const isSelected = selectedVM && selectedVM.id === vm.id && selectedVM.node === vm.node;
                const statusColor = getVmStatusColor(vm.status);

                return `
                    <div class="vm-list-item ${isSelected ? 'selected' : ''}" onclick="selectVM(${vm.id}, '${vm.node || ''}', '${vm.type || 'vm'}')">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div data-vm-status-dot="${vm.id}-${vm.node}" style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor}; flex-shrink: 0;"></div>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 600; color: #111827; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${vm.name || `VM ${vm.id}`}</div>
                                <div style="font-size: 0.75rem; color: #6b7280; margin-top: 2px;">ID: ${vm.id} | ${vm.type === 'vm' ? 'VM' : 'LXC'}</div>
                            </div>
                            <div style="font-size: 0.75rem; color: #9ca3af; flex-shrink: 0;">${vm.node || ''}</div>
                        </div>
                    </div>
                `;
            }).join('');

            const vmDetails = selectedVM ? generateVMDetailsHTML(selectedVM) : `
                <div style="text-align: center; padding: 4rem 2rem; color: #6b7280;">
                    <i class="fa-solid fa-cube" style="font-size: 4rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                    <h3>Sélectionnez une VM</h3>
                    <p>Sélectionnez une VM dans la liste pour voir ses détails</p>
                </div>
            `;

            return `
                <div style="display: flex; gap: 1rem;">
                    <!-- Liste des VMs à gauche -->
                    <div style="width: 300px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); display: flex; flex-direction: column;">
                        <div style="padding: 1rem; border-bottom: 1px solid #e5e7eb;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                                <h3 style="margin: 0; font-size: 1.1rem;">VMs & Containers</h3>
                                <span style="font-size: 0.75rem; color: #6b7280;">${sortedVMs.length}</span>
                            </div>
                            <input type="text" id="vm-search" placeholder="Rechercher..." style="width: 100%; padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.85rem;" oninput="filterVMList()">
                        </div>
                        <div style="flex: 1; overflow-y: auto; padding: 0.5rem;">
                            <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem; padding: 0 0.5rem;">
                                <button onclick="sortVMList('id')" style="flex: 1; padding: 4px 8px; font-size: 0.75rem; border: 1px solid #d1d5db; background: ${vmSortBy === 'id' ? '#f3f4f6' : 'white'}; border-radius: 4px; cursor: pointer;">
                                    ID <i class="fa-solid fa-${vmSortBy === 'id' && vmSortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}"></i>
                                </button>
                                <button onclick="sortVMList('name')" style="flex: 1; padding: 4px 8px; font-size: 0.75rem; border: 1px solid #d1d5db; background: ${vmSortBy === 'name' ? '#f3f4f6' : 'white'}; border-radius: 4px; cursor: pointer;">
                                    Nom <i class="fa-solid fa-${vmSortBy === 'name' && vmSortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}"></i>
                                </button>
                                <button onclick="sortVMList('status')" style="flex: 1; padding: 4px 8px; font-size: 0.75rem; border: 1px solid #d1d5db; background: ${vmSortBy === 'status' ? '#f3f4f6' : 'white'}; border-radius: 4px; cursor: pointer;">
                                    Statut <i class="fa-solid fa-${vmSortBy === 'status' && vmSortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}"></i>
                                </button>
                            </div>
                            <div id="vm-list-container">
                                ${vmListItems}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Détails de la VM à droite -->
                    <div style="flex: 1; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); overflow-y: auto;">
                        ${vmDetails}
                    </div>
                </div>
            `;
        }

        function generateVMDetailsHTML(vm) {
            const statusColor = getVmStatusColor(vm.status);
            const statusText = getVmStatusLabel(vm.status);

            return `
                <div style="padding: 1.5rem;">
                    <!-- En-tête avec nom et statut -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid #e5e7eb;">
                        <div>
                            <h2 style="margin: 0; font-size: 1.5rem; color: #111827;">${vm.name || `VM ${vm.id}`}</h2>
                            <div style="display: flex; align-items: center; gap: 0.75rem; margin-top: 0.5rem; font-size: 0.85rem; color: #6b7280;">
                                <span>ID: ${vm.id}</span>
                                <span>•</span>
                                <span>${vm.type === 'vm' ? 'VM' : 'LXC'}</span>
                                <span>•</span>
                                <span style="display: flex; align-items: center; gap: 0.5rem;">
                                    <div id="vm-detail-status-dot-${vm.id}" style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor};"></div>
                                    <span id="vm-detail-status-text-${vm.id}">${statusText}</span>
                                </span>
                                <span>•</span>
                                <span><i class="fa-solid fa-server"></i> ${vm.node || 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Boutons d'actions -->
                    <div id="vm-detail-actions-${vm.id}" style="display: flex; gap: 0.75rem; margin-bottom: 1.5rem; flex-wrap: wrap; align-items: center;">
                        ${getVmDetailsActionsHTML(vm)}
                        <button onclick="openConfig(${vm.id}, '${vm.node || ''}')" style="padding: 8px 16px; background: #f3f4f6; color: #111827; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; white-space: nowrap;">
                            <i class="fa-solid fa-sliders"></i> Configurer
                        </button>
                    </div>
                    
                    <!-- Statistiques -->
                    <div style="margin-bottom: 1.5rem;">
                        <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; color: #111827;">Statistiques</h3>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                            <div style="background: #f9fafb; padding: 1rem; border-radius: 8px;">
                                <div style="font-size: 0.75rem; color: #6b7280; margin-bottom: 0.5rem;">CPU</div>
                                <div id="vm-stats-${vm.id}" class="stat-cpu" style="font-size: 1.5rem; font-weight: 600; color: #111827;">${(vm.cpu || 0).toFixed(1)}%</div>
                            </div>
                            <div style="background: #f9fafb; padding: 1rem; border-radius: 8px;">
                                <div style="font-size: 0.75rem; color: #6b7280; margin-bottom: 0.5rem;">RAM</div>
                                <div class="stat-ram" style="font-size: 1.5rem; font-weight: 600; color: #111827;">${(vm.ram || 0).toFixed(1)} GB</div>
                            </div>
                            ${vm.type === 'lxc' && vm.diskUsed !== undefined && vm.diskTotal !== undefined ? `
                                <div style="background: #f9fafb; padding: 1rem; border-radius: 8px;">
                                    <div style="font-size: 0.75rem; color: #6b7280; margin-bottom: 0.5rem;">Disque</div>
                                    <div class="stat-disk" style="font-size: 1.5rem; font-weight: 600; color: #111827;">${((vm.diskUsed || 0) / 1024 / 1024 / 1024).toFixed(2)} GB / ${((vm.diskTotal || 0) / 1024 / 1024 / 1024).toFixed(2)} GB</div>
                                </div>
                            ` : vm.type === 'vm' ? `
                                <div style="background: #f9fafb; padding: 1rem; border-radius: 8px;">
                                    <div style="font-size: 0.75rem; color: #6b7280; margin-bottom: 0.5rem;">Disque</div>
                                    <div class="stat-disk" style="font-size: 1.5rem; font-weight: 600; color: #111827;">${(vm.disk || 0).toFixed(1)}%</div>
                                </div>
                            ` : ''}
                            ${vm.ip ? `
                                <div style="background: #f9fafb; padding: 1rem; border-radius: 8px;">
                                    <div style="font-size: 0.75rem; color: #6b7280; margin-bottom: 0.5rem;">Adresse IP</div>
                                    <div class="stat-ip" style="font-size: 1.5rem; font-weight: 600; color: #111827;">${vm.ip}</div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    <!-- Monitor -->
                    <div style="margin-bottom: 1.5rem;">
                        <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; color: #111827;">Monitor</h3>
                        <div id="vm-monitor-${vm.id}" style="background: #1e1e1e; color: #10b981; padding: 1rem; border-radius: 8px; font-family: monospace; font-size: 0.85rem; min-height: 200px; max-height: 400px; overflow-y: auto; white-space: pre-wrap;">
                            Chargement du monitor...
                        </div>
                    </div>
                    
                    <!-- Notes -->
                    <div style="margin-bottom: 1.5rem;">
                        <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; color: #111827;">Notes</h3>
                        <div id="vm-notes-${vm.id}" style="background: #f9fafb; padding: 1rem; border-radius: 8px; min-height: 100px; color: #374151;">
                            Chargement des notes...
                        </div>
                        <button onclick="editVMNotes(${vm.id}, '${vm.node}', '${vm.type}')" style="margin-top: 0.75rem; padding: 6px 12px; background: var(--primary); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem;">
                            <i class="fa-solid fa-edit"></i> Modifier les notes
                        </button>
                    </div>
                    
                    <!-- Configuration -->
                    <div>
                        <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; color: #111827;">Configuration</h3>
                        <div id="vm-config-${vm.id}" style="max-height: 400px; overflow-y: auto;">
                            Chargement de la configuration...
                        </div>
                    </div>
                </div>
            `;
        }

        function selectVM(vmid, node, type) {
            const vm = machines.find(m => m.id === vmid && m.node === node);
            if (vm) {
                selectedVM = vm;
                const listContainer = document.getElementById('vm-list-container');
                const scrollTop = listContainer ? listContainer.scrollTop : 0;
                const dashboardContent = viewContainer();
                dashboardContent.innerHTML = generateVMsManagementHTML();
                setTimeout(() => {
                    const newList = document.getElementById('vm-list-container');
                    if (newList) newList.scrollTop = scrollTop;
                }, 0);
                loadVMDetails(vm);
            }
        }

        async function loadVMDetails(vm) {
            // Charger les notes
            try {
                const notesResponse = await fetch(`/api/data?action=vm-notes&vmid=${vm.id}&node=${vm.node}&type=${vm.type}`);
                const notesData = await notesResponse.json();
                const notesEl = document.getElementById(`vm-notes-${vm.id}`);
                if (notesEl && notesData.notes !== undefined) {
                    const key = vmNotesCacheKey(vm.id, vm.node, vm.type);
                    vmNotesRawCache.set(key, notesData.notes ?? '');
                    renderVmNotesPreview(notesEl, notesData.notes);
                }
            } catch (error) {
                console.error('Erreur lors du chargement des notes:', error);
            }

            // Charger la configuration
            try {
                const configResponse = await fetch(`/api/data?action=vm-config&vmid=${vm.id}&node=${vm.node}&type=${vm.type}`);
                const configData = await configResponse.json();
                const configEl = document.getElementById(`vm-config-${vm.id}`);
                if (configEl && configData.config) {
                    // Formatter la configuration en UI/UX
                    configEl.innerHTML = formatVMConfig(configData.config, vm.type);
                }
            } catch (error) {
                console.error('Erreur lors du chargement de la configuration:', error);
            }

            // Charger le monitor (stats en temps réel)
            if (vm.status === 'running') {
                await refreshVMStats();
                updateVMMonitor(vm);
            }
        }

        function formatVMConfig(config, type) {
            // Formatter la configuration en interface utilisateur
            let html = '<div style="display: grid; gap: 1rem;">';

            // Informations générales
            if (config.name) {
                html += `<div style="background: white; padding: 1rem; border-radius: 8px; border-left: 3px solid var(--primary);">
                    <div style="font-size: 0.75rem; color: #6b7280; margin-bottom: 0.25rem;">Nom</div>
                    <div style="font-weight: 600; color: #111827;">${config.name}</div>
                </div>`;
            }

            // CPU et Mémoire
            if (config.cores || config.memory) {
                html += `<div style="background: white; padding: 1rem; border-radius: 8px; border-left: 3px solid #10b981;">
                    <div style="font-size: 0.75rem; color: #6b7280; margin-bottom: 0.5rem;">Ressources</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                        ${config.cores ? `<div><div style="font-size: 0.7rem; color: #9ca3af;">CPU</div><div style="font-weight: 600;">${config.cores} cores</div></div>` : ''}
                        ${config.memory ? `<div><div style="font-size: 0.7rem; color: #9ca3af;">RAM</div><div style="font-weight: 600;">${(parseInt(config.memory, 10) / 1024).toFixed(1)} GB</div></div>` : ''}
                    </div>
                </div>`;
            }

            // Réseau (IP)
            const networkKeys = Object.keys(config).filter(k => k.startsWith('net'));
            if (networkKeys.length > 0) {
                html += `<div style="background: white; padding: 1rem; border-radius: 8px; border-left: 3px solid #6366f1;">
                    <div style="font-size: 0.75rem; color: #6b7280; margin-bottom: 0.5rem;">Réseau</div>`;
                networkKeys.forEach(key => {
                    const netValue = config[key];
                    // Extraire l'IP si présente
                    let ip = '';
                    if (netValue && typeof netValue === 'string') {
                        const ipMatch = netValue.match(/(\d+\.\d+\.\d+\.\d+)/);
                        if (ipMatch) ip = ipMatch[1];
                    }
                    html += `<div style="margin-bottom: 0.5rem;">
                        <div style="font-size: 0.7rem; color: #9ca3af;">${key}</div>
                        <div style="font-weight: 600; font-size: 0.85rem; color: #111827;">${ip || netValue || 'N/A'}</div>
                    </div>`;
                });
                html += `</div>`;
            }

            // Disques
            const diskKeys = Object.keys(config).filter(k => k.startsWith('scsi') || k.startsWith('virtio') || k.startsWith('sata') || k.startsWith('ide') || (type === 'lxc' && k.startsWith('rootfs')));
            if (diskKeys.length > 0) {
                html += `<div style="background: white; padding: 1rem; border-radius: 8px; border-left: 3px solid #f59e0b;">
                    <div style="font-size: 0.75rem; color: #6b7280; margin-bottom: 0.5rem;">Disques</div>`;
                diskKeys.forEach(key => {
                    const diskValue = config[key];
                    html += `<div style="margin-bottom: 0.5rem;">
                        <div style="font-size: 0.7rem; color: #9ca3af;">${key}</div>
                        <div style="font-weight: 600; font-size: 0.85rem; color: #111827; word-break: break-all;">${diskValue || 'N/A'}</div>
                    </div>`;
                });
                html += `</div>`;
            }

            // Autres paramètres
            const otherKeys = Object.keys(config).filter(k =>
                !['name', 'cores', 'memory'].includes(k) &&
                !k.startsWith('net') &&
                !k.startsWith('scsi') &&
                !k.startsWith('virtio') &&
                !k.startsWith('sata') &&
                !k.startsWith('ide') &&
                !k.startsWith('rootfs') &&
                k !== 'description'
            );
            if (otherKeys.length > 0) {
                html += `<div style="background: white; padding: 1rem; border-radius: 8px; border-left: 3px solid #6b7280;">
                    <div style="font-size: 0.75rem; color: #6b7280; margin-bottom: 0.5rem;">Autres paramètres</div>`;
                otherKeys.forEach(key => {
                    html += `<div style="margin-bottom: 0.5rem;">
                        <div style="font-size: 0.7rem; color: #9ca3af;">${key}</div>
                        <div style="font-weight: 600; font-size: 0.85rem; color: #111827; word-break: break-all;">${config[key] || 'N/A'}</div>
                    </div>`;
                });
                html += `</div>`;
            }

            html += '</div>';
            return html;
        }

        function updateVMMonitor(vm) {
            const monitorEl = document.getElementById(`vm-monitor-${vm.id}`);
            if (monitorEl) {
                const stats = machines.find(m => m.id === vm.id && m.node === vm.node);
                if (stats) {
                    monitorEl.textContent = `CPU: ${(stats.cpu || 0).toFixed(1)}%\nRAM: ${(stats.ram || 0).toFixed(1)}%\nStatut: ${stats.status || 'N/A'}\nNode: ${stats.node || 'N/A'}`;
                }
            }
        }

        function updateVMDetails(vm) {
            // Mise à jour transparente sans regénérer toute la vue
            if (!selectedVM || selectedVM.id !== vm.id || selectedVM.node !== vm.node) {
                return;
            }

            // Mettre à jour les statistiques
            const statsContainer = document.querySelector(`#vm-stats-${vm.id}`);
            if (statsContainer) {
                const cpuEl = statsContainer.querySelector('.stat-cpu');
                const ramEl = statsContainer.querySelector('.stat-ram');
                const diskEl = statsContainer.querySelector('.stat-disk');
                const ipEl = statsContainer.querySelector('.stat-ip');

                if (cpuEl) cpuEl.textContent = `${(vm.cpu || 0).toFixed(1)}%`;
                if (ramEl) ramEl.textContent = `${(vm.ram || 0).toFixed(1)} GB`;

                if (vm.type === 'lxc' && vm.diskUsed !== undefined && vm.diskTotal !== undefined) {
                    if (diskEl) diskEl.textContent = `${((vm.diskUsed || 0) / 1024 / 1024 / 1024).toFixed(2)} GB / ${((vm.diskTotal || 0) / 1024 / 1024 / 1024).toFixed(2)} GB`;
                } else if (vm.type === 'vm') {
                    if (diskEl) diskEl.textContent = `${(vm.disk || 0).toFixed(1)}%`;
                }

                if (ipEl && vm.ip) ipEl.textContent = vm.ip;
            }

            // Mettre à jour le monitor
            updateVMMonitor(vm);

            // Mettre à jour selectedVM
            selectedVM = vm;
        }

        function updateVMStatusDisplay() {
            machines.forEach(vm => {
                const statusColor = getVmStatusColor(vm.status);
                const statusText = getVmStatusLabel(vm.status);
                const key = `${vm.id}-${vm.node}`;
                const cacheKey = `${vm.id}-${vm.node}-${vm.type}`;
                if (!window.vmStatusCache) {
                    window.vmStatusCache = new Map();
                }
                const prev = window.vmStatusCache.get(cacheKey);
                const current = `${vm.status}|${vm.template ? 'template' : 'normal'}`;
                const statusChanged = prev !== current;
                if (statusChanged) {
                    window.vmStatusCache.set(cacheKey, current);
                }

                const listDot = document.querySelector(`[data-vm-status-dot="${key}"]`);
                if (listDot) listDot.style.background = statusColor;

                const detailDot = document.getElementById(`vm-detail-status-dot-${vm.id}`);
                if (detailDot) detailDot.style.background = statusColor;

                const detailText = document.getElementById(`vm-detail-status-text-${vm.id}`);
                if (detailText) detailText.textContent = statusText;

                const detailActions = document.getElementById(`vm-detail-actions-${vm.id}`);
                if (detailActions && statusChanged) {
                    detailActions.innerHTML = getVmDetailsActionsHTML(vm);
                }

                const cardDot = document.getElementById(`vm-card-dot-${vm.id}-${vm.node}`);
                if (cardDot) cardDot.style.background = statusColor;

                const cardActions = document.getElementById(`vm-card-actions-${vm.id}`);
                if (cardActions && statusChanged) {
                    const isRun = vm.status === 'running';
                    cardActions.innerHTML = getVmCardActionsHTML(vm, isRun);
                }
            });
        }

        async function vmAction(action, vmid, node, type) {
            const actionLabel = action === 'start' ? 'démarrer'
                : action === 'stop' ? 'arrêter'
                : action === 'restart' ? 'redémarrer'
                : action === 'shutdown' ? 'arrêter proprement'
                : action === 'suspend' ? 'suspendre'
                : action === 'resume' ? 'reprendre'
                : 'exécuter cette action sur';
            if (!confirm(`Êtes-vous sûr de vouloir ${actionLabel} cette VM ?`)) {
                return;
            }

            try {
                const formData = new FormData();
                formData.append('vmid', vmid);
                formData.append('node', node);
                formData.append('type', type);
                formData.append('action', action);

                const response = await fetch('/api/data?action=vm-action', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                if (data && data.success) {
                    showNotification(data.message || 'Action exécutée avec succès', 'success');
                    // Rafraîchir les données
                    await refreshVMData();
                    await refreshVMStats();
                    // Re-générer la vue
                    if (currentView === 'vms') {
                        const listContainer = document.getElementById('vm-list-container');
                        const searchValue = document.getElementById('vm-search')?.value || '';
                        const scrollTop = listContainer ? listContainer.scrollTop : 0;
                        const dashboardContent = viewContainer();
                        dashboardContent.innerHTML = generateVMsManagementHTML();
                        setTimeout(() => {
                            const newList = document.getElementById('vm-list-container');
                            if (newList) {
                                newList.scrollTop = scrollTop;
                            }
                            const searchInput = document.getElementById('vm-search');
                            if (searchInput) {
                                searchInput.value = searchValue;
                                filterVMList();
                            }
                        }, 0);
                        if (selectedVM) {
                            loadVMDetails(selectedVM);
                        }
                    }
                } else {
                    showNotification(data.message || 'Erreur lors de l\'exécution de l\'action', 'error');
                }
            } catch (error) {
                console.error('Erreur lors de l\'exécution de l\'action:', error);
                showNotification('Erreur lors de l\'exécution de l\'action', 'error');
            }
        }

        const vmNotesRawCache = new Map();

        function vmNotesCacheKey(vmid, node, type) {
            return `${node || ''}:${type || 'vm'}:${vmid}`;
        }

        function renderVmNotesPreview(notesEl, raw) {
            if (!notesEl) return;
            const text = raw ?? '';
            if (!text.trim()) {
                notesEl.innerHTML = '<span class="notes-preview-empty">Aucune note</span>';
                return;
            }
            notesEl.innerHTML = text;
        }

        /**
         * Fenêtre d'édition de texte multiligne (markdown / HTML / texte brut).
         * @returns {Promise<boolean>} true si enregistré
         */
        function openNotesEditorWindow({ winKey, title, initialText = '', hint = '', onSave }) {
            if (!winKey) return Promise.resolve(false);

            const existing = document.getElementById(`win-${winKey}`);
            if (existing) {
                focusWindow(`win-${winKey}`);
                const ta = existing.querySelector('[data-notes-editor-text]');
                if (ta) {
                    ta.value = initialText ?? '';
                    ta.focus();
                }
                return Promise.resolve(false);
            }

            const layer = document.getElementById('window-layer');
            if (!layer) return Promise.resolve(false);

            return new Promise((resolve) => {
                const winEl = document.createElement('div');
                winEl.className = 'window window-notes-editor';
                winEl.id = `win-${winKey}`;
                winEl.style.zIndex = ++zIndexCounter;
                const offset = windows.length;
                winEl.style.left = `${120 + offset * 24}px`;
                winEl.style.top = `${64 + offset * 24}px`;
                winEl.style.width = '640px';
                winEl.style.height = '520px';
                winEl.innerHTML = `
                    <div class="win-header" onmousedown="startDrag(event, 'win-${winKey}')" ondblclick="handleDoubleClick(event, 'win-${winKey}')">
                        <div class="win-title"><i class="fa-solid fa-note-sticky"></i> ${escWinHtml(title)}</div>
                        <div class="win-controls">
                            <button type="button" onclick="minimizeWindow('${winKey}')"><i class="fa-solid fa-minus"></i></button>
                            <button type="button" onclick="maximizeWindow('${winKey}')"><i class="fa-regular fa-square"></i></button>
                            <button type="button" class="win-close" onclick="closeWindow('${winKey}')"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    </div>
                    <div class="win-content notes-editor-win-content" onclick="focusWindow('win-${winKey}')">
                        ${hint ? `<p class="notes-editor-hint">${escWinHtml(hint)}</p>` : ''}
                        <textarea class="notes-editor-textarea" data-notes-editor-text spellcheck="true" placeholder="Saisissez vos notes…"></textarea>
                        <div class="notes-editor-toolbar">
                            <span class="notes-editor-shortcut-hint"><kbd>Ctrl</kbd>+<kbd>S</kbd> pour enregistrer</span>
                            <div class="notes-editor-toolbar-actions">
                                <button type="button" class="notes-editor-btn notes-editor-btn-cancel" data-notes-editor-cancel>Annuler</button>
                                <button type="button" class="notes-editor-btn notes-editor-btn-save" data-notes-editor-save>
                                    <i class="fa-solid fa-check"></i> Enregistrer
                                </button>
                            </div>
                        </div>
                    </div>`;

                layer.appendChild(winEl);
                if (globalThis.ProxPanelWindowManager) {
                    ProxPanelWindowManager.decorate(winEl, winKey);
                }

                windows.push({
                    winKey,
                    kind: 'notes-editor',
                    name: title,
                    icon: 'fa-note-sticky',
                    state: 'normal',
                    layoutMode: 'floating',
                });
                renderTaskbar();
                new ResizeObserver(() => saveWindowsToLocalStorage()).observe(winEl);

                const ta = winEl.querySelector('[data-notes-editor-text]');
                const saveBtn = winEl.querySelector('[data-notes-editor-save]');
                const cancelBtn = winEl.querySelector('[data-notes-editor-cancel]');
                if (ta) ta.value = initialText ?? '';

                let saving = false;
                const finish = (saved) => {
                    resolve(saved);
                };
                const doCancel = () => {
                    closeWindow(winKey);
                    finish(false);
                };
                const doSave = async () => {
                    if (saving || !onSave) return;
                    saving = true;
                    saveBtn.disabled = true;
                    cancelBtn.disabled = true;
                    try {
                        const result = await onSave(ta?.value ?? '');
                        if (result !== false) {
                            closeWindow(winKey);
                            finish(true);
                        }
                    } finally {
                        saving = false;
                        saveBtn.disabled = false;
                        cancelBtn.disabled = false;
                    }
                };

                saveBtn?.addEventListener('click', () => doSave());
                cancelBtn?.addEventListener('click', () => doCancel());
                ta?.addEventListener('keydown', (e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                        e.preventDefault();
                        doSave();
                    }
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        doCancel();
                    }
                });

                setTimeout(() => {
                    ta?.focus();
                    if (ta) {
                        ta.selectionStart = ta.value.length;
                        ta.selectionEnd = ta.value.length;
                    }
                }, 60);
            });
        }

        function editVMNotes(vmid, node, type) {
            const key = vmNotesCacheKey(vmid, node, type);
            const raw = vmNotesRawCache.get(key) ?? '';
            const vm = machines.find((m) => m.id === vmid && m.node === node && m.type === type);
            openNotesEditorWindow({
                winKey: `notes-pve-${vmid}-${String(node).replace(/[^a-zA-Z0-9]/g, '_')}`,
                title: `Notes Proxmox - ${vm?.name || `VM ${vmid}`}`,
                initialText: raw,
                hint: 'Texte multiligne, markdown ou HTML. Le rendu s’affiche dans l’aperçu après enregistrement.',
                onSave: (text) => updateVMNotes(vmid, node, type, text),
            });
        }

        async function updateVMNotes(vmid, node, type, notes) {
            try {
                const formData = new FormData();
                formData.append('vmid', vmid);
                formData.append('node', node);
                formData.append('type', type);
                formData.append('notes', notes);

                const response = await fetch('/api/data?action=vm-notes', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                if (data && data.success) {
                    const key = vmNotesCacheKey(vmid, node, type);
                    vmNotesRawCache.set(key, notes ?? '');
                    showNotification('Notes mises à jour avec succès', 'success');
                    const notesEl = document.getElementById(`vm-notes-${vmid}`);
                    renderVmNotesPreview(notesEl, notes);
                    return true;
                }
                showNotification(data.message || 'Erreur lors de la mise à jour des notes', 'error');
                return false;
            } catch (error) {
                console.error('Erreur lors de la mise à jour des notes:', error);
                showNotification('Erreur lors de la mise à jour des notes', 'error');
                return false;
            }
        }

        function sortVMList(sortBy) {
            if (vmSortBy === sortBy) {
                vmSortOrder = vmSortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                vmSortBy = sortBy;
                vmSortOrder = 'asc';
            }

            if (currentView === 'vms') {
                const listContainer = document.getElementById('vm-list-container');
                const scrollTop = listContainer ? listContainer.scrollTop : 0;
                const dashboardContent = viewContainer();
                dashboardContent.innerHTML = generateVMsManagementHTML();
                setTimeout(() => {
                    const newList = document.getElementById('vm-list-container');
                    if (newList) newList.scrollTop = scrollTop;
                }, 0);
                if (selectedVM) {
                    loadVMDetails(selectedVM);
                }
            }
        }

        function filterVMList() {
            const searchTerm = document.getElementById('vm-search')?.value.toLowerCase() || '';
            const vmListContainer = document.getElementById('vm-list-container');
            if (vmListContainer) {
                const items = vmListContainer.querySelectorAll('.vm-list-item');
                items.forEach(item => {
                    const text = item.textContent.toLowerCase();
                    item.style.display = text.includes(searchTerm) ? 'block' : 'none';
                });
            }
        }

        function initVMsManagementView() {
            // Rafraîchir les stats toutes les 10 secondes
            if (vmsManagementRefreshInterval) {
                clearInterval(vmsManagementRefreshInterval);
            }

            vmsManagementRefreshInterval = setInterval(async () => {
                if (currentView !== 'vms') {
                    clearInterval(vmsManagementRefreshInterval);
                    vmsManagementRefreshInterval = null;
                    return;
                }
                await refreshVMStats();
                if (selectedVM) {
                    // Mise à jour transparente
                    const updatedVM = machines.find(m => m.id === selectedVM.id && m.node === selectedVM.node);
                    if (updatedVM) {
                        updateVMDetails(updatedVM);
                    }
                }
            }, 10000);
        }

        // Exposer les fonctions globalement
        window.selectVM = selectVM;
        window.vmAction = vmAction;
        window.togglePower = togglePower;
        window.editVMNotes = editVMNotes;
        window.sortVMList = sortVMList;
        window.filterVMList = filterVMList;
        window.refreshConsole = refreshConsole;
        window.openConsole = openConsole;
        window.openNodeShell = openNodeShell;
        window.refreshNodeShell = refreshNodeShell;
        window.togglePowerMenu = togglePowerMenu;
        window.closePowerMenu = closePowerMenu;
        window.closeWindow = closeWindow;
        window.minimizeWindow = minimizeWindow;
        window.minimizeAllWindows = minimizeAllWindows;
        window.maximizeWindow = maximizeWindow;
        window.restoreWindow = restoreWindow;
        window.startDrag = startDrag;
        window.handleDoubleClick = handleDoubleClick;
        window.focusWindow = focusWindow;
        window.startWinResize = (e, winId, dir) =>
            ProxPanelWindowManager.startResize(e, winId, dir);

        // --- TASKS VIEW ---
        let tasksData = [];
        let expandedTasks = new Set();
        let tasksRefreshInterval = null;
        let tasksFilter = 'all';
        let taskbarTasksFlyoutOpen = false;
        let taskbarTasksFlyoutTimer = null;

        async function getTasksView() {
            if (isProduction && userLoggedInProxmox) {
                const data = await loadProxmoxData('tasks');
                if (data && Array.isArray(data.tasks)) {
                    tasksData = data.tasks;
                }
            } else {
                tasksData = [
                    { upid: 'UPID:pve-r730:00001234:12345678:ABCDEF12:qmstart:root@pam:', type: 'qmstart', status: 'running', user: 'root@pam', starttime: Math.floor(Date.now() / 1000) - 120, node: 'pve-r730', id: '100' },
                    { upid: 'UPID:pve-r730:00001235:12345679:ABCDEF13:vzdump:root@pam:', type: 'vzdump', status: 'stopped', exitstatus: 'OK', user: 'root@pam', starttime: Math.floor(Date.now() / 1000) - 3600, endtime: Math.floor(Date.now() / 1000) - 3500, node: 'pve-r730', id: 'vzdump' },
                    { upid: 'UPID:pve-r730:00001236:12345680:ABCDEF14:qmstop:root@pam:', type: 'qmstop', status: 'error', exitstatus: 'VM 100 not running', user: 'root@pam', starttime: Math.floor(Date.now() / 1000) - 7200, endtime: Math.floor(Date.now() / 1000) - 7190, node: 'pve-r730', id: '100' }
                ];
            }

            return generateTasksHTML();
        }

        function parseTaskNode(task) {
            if (task?.node) return task.node;
            const upid = task?.upid || '';
            if (upid.startsWith('UPID:')) return upid.split(':')[1] || '';
            return '';
        }

        function filterTasks(list) {
            if (tasksFilter === 'running') return list.filter((t) => t.status === 'running');
            if (tasksFilter === 'finished') return list.filter((t) => t.status === 'stopped');
            if (tasksFilter === 'errors') return list.filter((t) => t.status === 'error');
            return list;
        }

        function setTasksFilter(filter) {
            tasksFilter = filter;
            if (currentView === 'tasks') {
                const dashboardContent = viewContainer();
                if (dashboardContent) dashboardContent.innerHTML = generateTasksHTML();
                initTasksView();
            }
        }

        function formatTaskType(type) {
            const types = {
                qmstart: 'Démarrage VM',
                qmstop: 'Arrêt VM',
                qmshutdown: 'Extinction VM',
                qmreboot: 'Redémarrage VM',
                qmreset: 'Reset VM',
                qmclone: 'Clonage VM',
                qmcreate: 'Création VM',
                qmdestroy: 'Suppression VM',
                qmmove: 'Déplacement disque VM',
                qmrestore: 'Restauration VM',
                qmrollback: 'Rollback VM',
                qmsnapshot: 'Snapshot VM',
                qmtemplate: 'Template VM',
                qmigrate: 'Migration VM',
                qmconfig: 'Configuration VM',
                vzdump: 'Sauvegarde',
                vzrestore: 'Restauration',
                vncproxy: 'Console VNC',
                spicproxy: 'Console SPICE',
                lxcstart: 'Démarrage LXC',
                lxcstop: 'Arrêt LXC',
                lxcshutdown: 'Extinction LXC',
                lxcclone: 'Clonage LXC',
                lxccreate: 'Création LXC',
                lxcdestroy: 'Suppression LXC',
                lxcmigrate: 'Migration LXC',
                startall: 'Démarrage global',
                stopall: 'Arrêt global',
                migrateall: 'Migration globale',
                imgcopy: 'Copie d\'image',
                download: 'Téléchargement',
                acmedeactivate: 'ACME',
                acmenewcert: 'Certificat ACME',
                authkey: 'Clé API',
                cephcreatepool: 'Pool Ceph',
                clustercreate: 'Création cluster',
                clusterjoin: 'Join cluster',
                diridx: 'Index répertoire',
                hwscan: 'Scan matériel',
                pull_file: 'Pull fichier',
                push_file: 'Push fichier',
                resize: 'Redimensionnement',
                spiceupgrade: 'Upgrade SPICE',
                unknownimg: 'Image inconnue',
            };
            return types[type] || type || 'Tâche';
        }

        function formatTaskStatus(status, exitstatus) {
            const s = String(status || 'unknown').toLowerCase();
            if (s === 'running') {
                return { text: 'En cours', color: '#10b981', icon: 'fa-spinner fa-spin' };
            }
            if (s === 'error') {
                return {
                    text: exitstatus ? `Erreur - ${exitstatus}` : 'Erreur',
                    color: '#ef4444',
                    icon: 'fa-circle-xmark',
                };
            }
            if (s === 'stopped' || s === 'ok') {
                const ok = !exitstatus || String(exitstatus).toUpperCase() === 'OK';
                return {
                    text: ok ? 'Terminée' : String(exitstatus),
                    color: ok ? '#6b7280' : '#f59e0b',
                    icon: ok ? 'fa-circle-check' : 'fa-triangle-exclamation',
                };
            }
            return { text: status || 'Inconnue', color: '#9ca3af', icon: 'fa-circle-question' };
        }

        function formatTimestamp(timestamp) {
            if (!timestamp) return 'N/A';
            const date = new Date(timestamp * 1000);
            return date.toLocaleString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        }

        function formatDuration(starttime, endtime) {
            if (!starttime) return 'N/A';
            const end = endtime || Math.floor(Date.now() / 1000);
            const duration = Math.max(0, end - starttime);
            const hours = Math.floor(duration / 3600);
            const minutes = Math.floor((duration % 3600) / 60);
            const seconds = duration % 60;

            if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
            if (minutes > 0) return `${minutes}m ${seconds}s`;
            return `${seconds}s`;
        }

        function escapeHtml(str) {
            return String(str ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function generateTasksHTML() {
            const visible = filterTasks(tasksData);
            const counts = {
                all: tasksData.length,
                running: tasksData.filter((t) => t.status === 'running').length,
                finished: tasksData.filter((t) => t.status === 'stopped').length,
                errors: tasksData.filter((t) => t.status === 'error').length,
            };

            const filterBtn = (id, label) => {
                const active = tasksFilter === id;
                return `<button type="button" class="tasks-filter-btn${active ? ' active' : ''}" onclick="setTasksFilter('${id}')">${label} (${counts[id]})</button>`;
            };

            if (visible.length === 0) {
                return `
                    <div class="tasks-view">
                        <div class="tasks-toolbar">
                            <h3>Tâches Proxmox</h3>
                            <div class="tasks-toolbar-actions">${tasksToolbarActions()}</div>
                        </div>
                        <div class="tasks-filters">
                            ${filterBtn('all', 'Toutes')}
                            ${filterBtn('running', 'En cours')}
                            ${filterBtn('finished', 'Terminées')}
                            ${filterBtn('errors', 'Erreurs')}
                        </div>
                        <div class="tasks-empty">
                            <i class="fa-solid fa-tasks"></i>
                            <h3>Aucune tâche</h3>
                            <p>${tasksData.length ? 'Aucune tâche ne correspond au filtre sélectionné.' : 'Aucune tâche visible pour votre compte (permissions Proxmox).'}</p>
                        </div>
                    </div>`;
            }

            const tasksHtml = visible.map((task) => {
                const upid = task.upid || '';
                const taskId = upid.replace(/[^a-zA-Z0-9]/g, '_');
                const node = parseTaskNode(task);
                const statusInfo = formatTaskStatus(task.status, task.exitstatus);
                const isExpanded = expandedTasks.has(upid);
                const duration = formatDuration(task.starttime, task.endtime);
                const startDate = formatTimestamp(task.starttime);
                const endDate = task.endtime ? formatTimestamp(task.endtime) : null;
                const typeLabel = formatTaskType(task.type);
                const idLabel = task.id ? escapeHtml(task.id) : '';

                return `
                    <div class="task-item-card" style="border-left-color: ${statusInfo.color};">
                        <div class="task-item-main">
                            <div class="task-item-body">
                                <div class="task-item-title">
                                    <i class="fa-solid ${statusInfo.icon}" style="color: ${statusInfo.color};"></i>
                                    <span class="task-item-type">${escapeHtml(typeLabel)}</span>
                                    <span class="task-item-badge">${escapeHtml(node || 'N/A')}</span>
                                    <span class="task-item-status" style="color: ${statusInfo.color};">${escapeHtml(statusInfo.text)}</span>
                                </div>
                                <div class="task-item-meta">
                                    <div><i class="fa-solid fa-user"></i> ${escapeHtml(task.user || 'N/A')}</div>
                                    <div><i class="fa-solid fa-clock"></i> ${startDate}${endDate ? ` → ${endDate}` : ''} (${duration})</div>
                                    ${idLabel ? `<div><i class="fa-solid fa-hashtag"></i> ${idLabel}</div>` : ''}
                                </div>
                            </div>
                            <div class="task-item-actions">
                                ${task.status === 'running' && node ? `
                                    <button type="button" class="task-btn task-btn-danger" data-task-stop="${escapeHtml(upid)}" data-task-node="${escapeHtml(node)}">
                                        <i class="fa-solid fa-stop"></i> Arrêter
                                    </button>` : ''}
                                <button type="button" class="task-btn" data-task-toggle="${escapeHtml(upid)}" data-task-node="${escapeHtml(node)}">
                                    <i class="fa-solid fa-${isExpanded ? 'chevron-up' : 'chevron-down'}"></i> ${isExpanded ? 'Masquer' : 'Détails'}
                                </button>
                            </div>
                        </div>
                        <div id="task-details-${taskId}" class="task-details" style="display: ${isExpanded ? 'block' : 'none'};" data-task-upid="${escapeHtml(upid)}" data-task-node="${escapeHtml(node)}">
                            <div><strong>UPID:</strong> <code>${escapeHtml(upid)}</code></div>
                            <div class="task-details-status" data-task-detail-status>
                                ${isExpanded ? '<i class="fa-solid fa-spinner fa-spin"></i> Chargement des détails…' : ''}
                            </div>
                            <div class="task-log" data-task-detail-log style="display: none;">
                                <div class="task-log-title">Journal</div>
                                <pre class="task-log-pre" data-task-detail-log-pre></pre>
                            </div>
                        </div>
                    </div>`;
            }).join('');

            return `
                <div class="tasks-view">
                    <div class="tasks-toolbar">
                        <h3>Tâches Proxmox</h3>
                        <div class="tasks-toolbar-actions">${tasksToolbarActions()}</div>
                    </div>
                    <div class="tasks-filters">
                        ${filterBtn('all', 'Toutes')}
                        ${filterBtn('running', 'En cours')}
                        ${filterBtn('finished', 'Terminées')}
                        ${filterBtn('errors', 'Erreurs')}
                    </div>
                    <p class="tasks-hint">Liste filtrée selon vos droits Proxmox (comme dans l'interface native).</p>
                    <div class="tasks-list">${tasksHtml}</div>
                </div>`;
        }

        function tasksToolbarActions() {
            return `
                <label class="tasks-auto-label">
                    <input type="checkbox" id="tasks-auto-refresh" checked onchange="toggleTasksAutoRefresh()">
                    <span>Actualisation auto</span>
                </label>
                <button type="button" onclick="refreshTasksData()" class="tasks-refresh-btn">
                    <i class="fa-solid fa-sync-alt"></i> Actualiser
                </button>`;
        }

        function taskDetailWinKey(upid) {
            return `task-${String(upid).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 96)}`;
        }

        const taskDetailRefreshTimers = new Map();

        function stopTaskDetailRefresh(winKey) {
            const t = taskDetailRefreshTimers.get(winKey);
            if (t) {
                clearInterval(t);
                taskDetailRefreshTimers.delete(winKey);
            }
        }

        function buildTaskDetailSummaryHTML(task) {
            const upid = task.upid || '';
            const node = parseTaskNode(task);
            const statusInfo = formatTaskStatus(task.status, task.exitstatus);
            const typeLabel = formatTaskType(task.type);
            const duration = formatDuration(task.starttime, task.endtime);
            const startDate = formatTimestamp(task.starttime);
            const endDate = task.endtime ? formatTimestamp(task.endtime) : null;
            const isRunning = task.status === 'running';

            return `
                <div class="task-detail-summary" style="border-left-color:${statusInfo.color}">
                    <div class="task-detail-summary-head">
                        <i class="fa-solid ${statusInfo.icon}" style="color:${statusInfo.color}"></i>
                        <strong>${escapeHtml(typeLabel)}</strong>
                        <span class="task-detail-badge">${escapeHtml(node || '—')}</span>
                        <span class="task-detail-status-pill" style="color:${statusInfo.color}">${escapeHtml(statusInfo.text)}</span>
                    </div>
                    <dl class="task-detail-meta">
                        <div><dt>Utilisateur</dt><dd>${escapeHtml(task.user || 'N/A')}</dd></div>
                        <div><dt>Début</dt><dd>${startDate}</dd></div>
                        ${endDate ? `<div><dt>Fin</dt><dd>${endDate}</dd></div>` : ''}
                        <div><dt>Durée</dt><dd>${duration}</dd></div>
                        ${task.id ? `<div><dt>ID</dt><dd>${escapeHtml(task.id)}</dd></div>` : ''}
                        <div><dt>UPID</dt><dd><code class="task-detail-upid">${escapeHtml(upid)}</code></dd></div>
                    </dl>
                    <div class="task-detail-toolbar">
                        ${isRunning && node ? `
                        <button type="button" class="task-btn task-btn-danger" data-task-detail-stop data-upid="${escapeHtml(upid)}" data-node="${escapeHtml(node)}">
                            <i class="fa-solid fa-stop"></i> Arrêter la tâche
                        </button>` : ''}
                        <button type="button" class="task-btn" data-task-detail-refresh>
                            <i class="fa-solid fa-rotate"></i> Actualiser
                        </button>
                    </div>
                </div>
                <div class="task-details-status" data-task-detail-status>
                    <i class="fa-solid fa-spinner fa-spin"></i> Chargement du journal…
                </div>
                <div class="task-log" data-task-detail-log style="display:none">
                    <div class="task-log-title">Journal Proxmox</div>
                    <pre class="task-log-pre" data-task-detail-log-pre></pre>
                </div>`;
        }

        async function loadTaskDetailsInto(rootEl, upid, nodeHint) {
            if (!rootEl) return;
            const statusEl = rootEl.querySelector('[data-task-detail-status]');
            const logEl = rootEl.querySelector('[data-task-detail-log]');
            const task = tasksData.find((t) => t.upid === upid);
            const node = nodeHint || parseTaskNode(task);

            if (!node) {
                if (statusEl) statusEl.innerHTML = '<span class="task-details-error">Nœud introuvable pour cette tâche.</span>';
                return;
            }

            if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Chargement des détails…';

            try {
                const response = await fetch(`/api/data?action=task-details&upid=${encodeURIComponent(upid)}&node=${encodeURIComponent(node)}`);
                const data = await response.json();

                if (data?.task) {
                    const status = data.task.status || {};
                    const log = data.task.log || [];

                    if (statusEl) {
                        statusEl.innerHTML = `
                            <div><strong>Statut API:</strong> ${escapeHtml(status.status || 'N/A')}</div>
                            ${status.exitstatus != null ? `<div><strong>Sortie:</strong> ${escapeHtml(status.exitstatus)}</div>` : ''}
                            ${status.pid ? `<div><strong>PID:</strong> ${escapeHtml(status.pid)}</div>` : ''}
                            ${status.pstart != null ? `<div><strong>Démarrage processus:</strong> ${formatTimestamp(status.pstart)}</div>` : ''}
                        `;
                    }

                    if (logEl && Array.isArray(log)) {
                        const logText = log.map((line) => {
                            const n = line.n ?? '';
                            const t = line.t ?? '';
                            return `[${n}] ${t}`;
                        }).join('\n');
                        const pre = logEl.querySelector('[data-task-detail-log-pre]') || logEl.querySelector('.task-log-pre');
                        if (pre) pre.textContent = logText || 'Aucun journal disponible.';
                        logEl.style.display = 'block';
                    }
                } else if (statusEl) {
                    statusEl.innerHTML = `<span class="task-details-error">${escapeHtml(data?.error || 'Impossible de charger les détails')}</span>`;
                }
            } catch (error) {
                console.error('Erreur lors du chargement des détails:', error);
                if (statusEl) statusEl.innerHTML = '<span class="task-details-error">Erreur lors du chargement des détails</span>';
            }
        }

        async function loadTaskDetails(upid, nodeHint) {
            const taskId = upid.replace(/[^a-zA-Z0-9]/g, '_');
            const detailsEl = document.getElementById(`task-details-${taskId}`);
            await loadTaskDetailsInto(detailsEl, upid, nodeHint);
        }

        function bindTaskDetailPanel(rootEl, upid, node) {
            if (!rootEl || rootEl.dataset.taskDetailBound === '1') return;
            rootEl.dataset.taskDetailBound = '1';
            rootEl.addEventListener('click', async (e) => {
                const stopBtn = e.target.closest('[data-task-detail-stop]');
                if (stopBtn) {
                    await stopTask(stopBtn.dataset.upid, stopBtn.dataset.node);
                    await refreshTasksData();
                    const task = tasksData.find((t) => t.upid === upid) || { upid, status: 'stopped' };
                    rootEl.innerHTML = buildTaskDetailSummaryHTML(task);
                    await loadTaskDetailsInto(rootEl, upid, node);
                    return;
                }
                if (e.target.closest('[data-task-detail-refresh]')) {
                    await loadTaskDetailsInto(rootEl, upid, node);
                }
            });
        }

        async function openTaskDetailWindow(upid, nodeHint) {
            if (!upid) return;
            const task = tasksData.find((t) => t.upid === upid) || { upid, status: 'running' };
            const node = nodeHint || parseTaskNode(task);
            const winKey = taskDetailWinKey(upid);
            const typeLabel = formatTaskType(task.type);
            const title = `Tâche - ${typeLabel}`;

            const existing = document.getElementById(`win-${winKey}`);
            if (existing) {
                focusWindow(`win-${winKey}`);
                const body = existing.querySelector('.task-detail-panel');
                if (body) {
                    body.innerHTML = buildTaskDetailSummaryHTML(task);
                    bindTaskDetailPanel(body, upid, node);
                    await loadTaskDetailsInto(body, upid, node);
                }
                return;
            }

            closeTaskbarTasksFlyout();

            const layer = document.getElementById('window-layer');
            if (!layer) return;

            const winEl = document.createElement('div');
            winEl.className = 'window window-task-detail';
            winEl.id = `win-${winKey}`;
            winEl.style.zIndex = ++zIndexCounter;
            const offset = windows.length;
            winEl.style.left = `${100 + offset * 24}px`;
            winEl.style.top = `${56 + offset * 24}px`;
            winEl.style.width = '520px';
            winEl.style.height = '480px';
            winEl.innerHTML = `
                <div class="win-header" onmousedown="startDrag(event, 'win-${winKey}')" ondblclick="handleDoubleClick(event, 'win-${winKey}')">
                    <div class="win-title"><i class="fa-solid fa-list-check"></i> ${escWinHtml(title)}</div>
                    <div class="win-controls">
                        <button type="button" onclick="minimizeWindow('${winKey}')"><i class="fa-solid fa-minus"></i></button>
                        <button type="button" onclick="maximizeWindow('${winKey}')"><i class="fa-regular fa-square"></i></button>
                        <button class="win-close" onclick="closeWindow('${winKey}')"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </div>
                <div class="win-content task-detail-win-content" onclick="focusWindow('win-${winKey}')">
                    <div class="task-detail-panel"></div>
                </div>`;
            layer.appendChild(winEl);
            if (globalThis.ProxPanelWindowManager) {
                ProxPanelWindowManager.decorate(winEl, winKey);
            }

            windows.push({
                winKey,
                kind: 'task-detail',
                name: title,
                icon: 'fa-list-check',
                upid,
                node,
                state: 'normal',
                layoutMode: 'floating',
            });
            renderTaskbar();
            new ResizeObserver(() => saveWindowsToLocalStorage()).observe(winEl);

            const panel = winEl.querySelector('.task-detail-panel');
            panel.innerHTML = buildTaskDetailSummaryHTML(task);
            bindTaskDetailPanel(panel, upid, node);
            await loadTaskDetailsInto(panel, upid, node);

            if (task.status === 'running') {
                stopTaskDetailRefresh(winKey);
                taskDetailRefreshTimers.set(
                    winKey,
                    setInterval(async () => {
                        const w = windows.find((x) => x.winKey === winKey);
                        if (!w || !document.getElementById(`win-${winKey}`)) {
                            stopTaskDetailRefresh(winKey);
                            return;
                        }
                        await refreshTasksData();
                        const fresh = tasksData.find((t) => t.upid === upid);
                        if (!fresh) return;
                        const body = document.getElementById(`win-${winKey}`)?.querySelector('.task-detail-panel');
                        if (!body) return;
                        const summary = body.querySelector('.task-detail-summary');
                        if (summary) {
                            const tmp = document.createElement('div');
                            tmp.innerHTML = buildTaskDetailSummaryHTML(fresh);
                            const newSummary = tmp.querySelector('.task-detail-summary');
                            if (newSummary) summary.replaceWith(newSummary);
                        }
                        await loadTaskDetailsInto(body, upid, node);
                        if (fresh.status !== 'running') {
                            stopTaskDetailRefresh(winKey);
                        }
                    }, 4000)
                );
            }
        }

        async function toggleTaskDetails(upid, nodeHint) {
            const taskId = upid.replace(/[^a-zA-Z0-9]/g, '_');
            const detailsEl = document.getElementById(`task-details-${taskId}`);

            if (expandedTasks.has(upid)) {
                expandedTasks.delete(upid);
                if (detailsEl) detailsEl.style.display = 'none';
            } else {
                expandedTasks.add(upid);
                if (detailsEl) detailsEl.style.display = 'block';
                await loadTaskDetails(upid, nodeHint);
            }

            if (currentView === 'tasks') {
                const dashboardContent = viewContainer();
                if (dashboardContent) {
                    dashboardContent.innerHTML = generateTasksHTML();
                    initTasksView();
                }
            }
        }

        async function stopTask(upid, node) {
            if (!confirm('Êtes-vous sûr de vouloir arrêter cette tâche ?')) {
                return;
            }

            try {
                const response = await fetch(`/api/data?action=task-stop&upid=${encodeURIComponent(upid)}&node=${encodeURIComponent(node)}`);
                const data = await response.json();

                if (data && data.success) {
                    showNotification('Tâche arrêtée avec succès', 'success');
                    await refreshTasksData();
                } else {
                    showNotification(data.message || 'Erreur lors de l\'arrêt de la tâche', 'error');
                }
            } catch (error) {
                console.error('Erreur lors de l\'arrêt de la tâche:', error);
                showNotification('Erreur lors de l\'arrêt de la tâche', 'error');
            }
        }

        async function refreshTasksData() {
            if (isProduction && userLoggedInProxmox) {
                const data = await loadProxmoxData('tasks');
                if (data && Array.isArray(data.tasks)) {
                    tasksData = data.tasks;
                }
            }
            updateTaskbarTasksBadge();
            if (taskbarTasksFlyoutOpen) {
                renderTaskbarTasksFlyout();
            }
            if (currentView === 'tasks') {
                const dashboardContent = viewContainer();
                if (dashboardContent) {
                    dashboardContent.innerHTML = generateTasksHTML();
                    initTasksView();
                    for (const upid of expandedTasks) {
                        const task = tasksData.find((t) => t.upid === upid);
                        await loadTaskDetails(upid, parseTaskNode(task));
                    }
                }
            }
        }

        function toggleTasksAutoRefresh() {
            const checkbox = document.getElementById('tasks-auto-refresh');
            if (checkbox && checkbox.checked) {
                startTasksAutoRefresh();
            } else {
                stopTasksAutoRefresh();
            }
        }

        function startTasksAutoRefresh() {
            stopTasksAutoRefresh(); // Arrêter l'intervalle précédent si il existe
            tasksRefreshInterval = setInterval(async () => {
                if (currentView === 'tasks') {
                    await refreshTasksData();
                } else {
                    stopTasksAutoRefresh();
                }
            }, 5000); // Rafraîchir toutes les 5 secondes
        }

        function stopTasksAutoRefresh() {
            if (tasksRefreshInterval) {
                clearInterval(tasksRefreshInterval);
                tasksRefreshInterval = null;
            }
        }

        function initTasksView() {
            const container = viewContainer();
            if (container && container.dataset.tasksBound !== '1') {
                container.dataset.tasksBound = '1';
                container.addEventListener('click', (e) => {
                    if (!e.target.closest('.tasks-view')) return;
                    const stopBtn = e.target.closest('[data-task-stop]');
                    if (stopBtn) {
                        stopTask(stopBtn.dataset.taskStop, stopBtn.dataset.taskNode);
                        return;
                    }
                    const toggleBtn = e.target.closest('[data-task-toggle]');
                    if (toggleBtn) {
                        toggleTaskDetails(toggleBtn.dataset.taskToggle, toggleBtn.dataset.taskNode);
                    }
                });
            }

            const checkbox = document.getElementById('tasks-auto-refresh');
            if (checkbox && checkbox.checked) {
                startTasksAutoRefresh();
            }
        }

        // Exposer les fonctions globalement pour les appels onclick
        window.stopTask = stopTask;
        window.toggleTaskDetails = toggleTaskDetails;
        window.refreshTasksData = refreshTasksData;
        window.toggleTasksAutoRefresh = toggleTasksAutoRefresh;
        window.setTasksFilter = setTasksFilter;
        window.toggleTaskbarTasksFlyout = toggleTaskbarTasksFlyout;
        window.openTasksManagerWindow = openTasksManagerWindow;
        window.openTaskDetailWindow = openTaskDetailWindow;
        window.resetWindowPosition = resetWindowPosition;

        // --- API DATA LOADING ---
        function parseResourcesRaw(rawResources) {
            const nodes = [];
            const vms = [];
            const containers = [];

            if (!Array.isArray(rawResources)) {
                return { nodes, vms, containers };
            }

            rawResources.forEach(resource => {
                const type = resource?.type || '';
                const id = resource?.id || '';

                if (type === 'node') {
                    const nodeName = resource?.node || id || '';
                    nodes.push({
                        node: nodeName,
                        status: resource?.status || 'unknown',
                        maxcpu: resource?.maxcpu || 1,
                        maxmem: resource?.maxmem || 0,
                        uptime: resource?.uptime || 0,
                        cpu: (resource?.cpu || 0) * 100,
                        mem: resource?.mem || 0,
                        loadavg: resource?.loadavg || [0, 0, 0],
                        kversion: resource?.kversion || '',
                        netin: parseFloat(resource?.netin ?? 0),
                        netout: parseFloat(resource?.netout ?? 0),
                        diskread: parseFloat(resource?.diskread ?? 0),
                        diskwrite: parseFloat(resource?.diskwrite ?? 0),
                    });
                } else if (type === 'qemu') {
                    const nodeName = resource?.node || '';
                    const vmid = resource?.vmid || 0;
                    if (nodeName && vmid > 0) {
                        vms.push({
                            node: nodeName,
                            vmid,
                            name: resource?.name || '',
                            status: resource?.status || 'stopped',
                            cpu: (resource?.cpu || 0) * 100,
                            mem: resource?.mem || 0,
                            maxmem: resource?.maxmem || 0,
                            disk: resource?.disk || 0,
                            uptime: resource?.uptime || 0,
                            template: resource?.template === 1 || resource?.template === true
                        });
                    }
                } else if (type === 'lxc') {
                    const nodeName = resource?.node || '';
                    const vmid = resource?.vmid || 0;
                    if (nodeName && vmid > 0) {
                        containers.push({
                            node: nodeName,
                            vmid,
                            name: resource?.name || '',
                            status: resource?.status || 'stopped',
                            cpu: (resource?.cpu || 0) * 100,
                            mem: resource?.mem || 0,
                            maxmem: resource?.maxmem || 0,
                            disk: resource?.disk || 0,
                            diskread: resource?.diskread || 0,
                            diskwrite: resource?.diskwrite || 0,
                            uptime: resource?.uptime || 0
                        });
                    }
                }
            });

            return { nodes, vms, containers };
        }

        function getResourcesRaw(data) {
            if (data?.resourcesRaw?.all && Array.isArray(data.resourcesRaw.all)) {
                return data.resourcesRaw.all;
            }
            if (Array.isArray(data?.resourcesRaw)) {
                return data.resourcesRaw;
            }
            return null;
        }

        let lastResourcesParsed = null;
        function stopProxmoxAutoRefresh() {
            if (refreshIntervals.nodes) {
                clearInterval(refreshIntervals.nodes);
                refreshIntervals.nodes = null;
            }
            if (refreshIntervals.vmstats) {
                clearInterval(refreshIntervals.vmstats);
                refreshIntervals.vmstats = null;
            }
            if (refreshIntervals.statuses) {
                clearInterval(refreshIntervals.statuses);
                refreshIntervals.statuses = null;
            }
            if (typeof realtimeClient !== 'undefined') realtimeClient.stop();
        }

        function handleNotAuthenticated() {
            if (authInvalidated) return;
            authInvalidated = true;
            allowProxmoxRequests = false;
            currentUser = null;
            stopProxmoxAutoRefresh();
            setAuthUiState(false);
        }

        async function loadProxmoxData(action = 'all', payload = null) {
            if (!isProduction || !allowProxmoxRequests) {
                return null;
            }

            // Vérifier si une requête est déjà en cours pour cette action
            if (pendingRequests[action]) {
                return pendingRequests[action];
            }

            const promise = (async () => {
                try {
                    const fetchOptions = payload ? {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    } : {};
                    const response = await fetch(apiUrl(action), fetchOptions);
                    const data = await response.json();
                    if (data && data.error === 'Not authenticated') {
                        handleNotAuthenticated();
                        return null;
                    }
                    return data;
                } catch (error) {
                    console.error('Error loading Proxmox data:', error);
                    showNotification('Erreur lors du chargement des données', 'error');
                    return null;
                }
            })();

            pendingRequests[action] = promise;

            try {
                return await promise;
            } finally {
                if (pendingRequests[action] === promise) {
                    pendingRequests[action] = false;
                }
            }
        }

        async function refreshVMData() {
            // Charger les resources (nodes, vms) en une seule requête
            const resourcesData = await loadProxmoxData('resources');
            let nodesData = null;
            let vmsData = null;

            const rawResources = resourcesData ? getResourcesRaw(resourcesData) : null;
            let parsedResources = rawResources ? parseResourcesRaw(rawResources) : null;
            if (parsedResources && typeof ProxPanelCore !== 'undefined') {
                parsedResources = ProxPanelCore.filterGuestsOnOfflineNodes(parsedResources);
            }

            if (parsedResources) {
                lastResourcesParsed = parsedResources;

                // Utiliser les données depuis resources
                // Construire nodesData depuis resources.nodes
                const nodes = parsedResources.nodes || [];
                const onlineNodeNames = new Set(
                    nodes.filter((n) => n.status === 'online').map((n) => n.node || '')
                );
                nodesData = {
                    nodes: nodes.map(node => ({
                        name: node.node || '',
                        status: node.status || 'unknown',
                        uptime: node.uptime || 0,
                        cpu: node.cpu || 0,
                        ram: {
                            used: (node.mem || 0) > 0 ? (node.mem / 1024 / 1024 / 1024) : 0,
                            total: (node.maxmem || 0) > 0 ? (node.maxmem / 1024 / 1024 / 1024) : 0
                        },
                        loadavg: node.loadavg || [0, 0, 0],
                        kversion: node.kversion || '',
                        maxcpu: node.maxcpu || 1,
                        netin: node.netin ?? 0,
                        netout: node.netout ?? 0,
                        diskread: node.diskread ?? 0,
                        diskwrite: node.diskwrite ?? 0,
                    }))
                };

                // Construire nodesWithVms depuis resources.vms et resources.containers
                const vms = parsedResources.vms || [];
                const containers = parsedResources.containers || [];

                // Grouper VMs et containers par node
                const nodesWithVmsMap = new Map();

                // Ajouter tous les nodes (même sans VMs)
                nodes.forEach(node => {
                    const nodeName = node.node || '';
                    if (nodeName) {
                        nodesWithVmsMap.set(nodeName, {
                            name: nodeName,
                            status: node.status || 'unknown',
                            vms: []
                        });
                    }
                });

                // Ajouter les VMs (nœuds online uniquement)
                vms.forEach(vm => {
                    const nodeName = vm.node || '';
                    if (!onlineNodeNames.has(nodeName)) return;
                    if (nodeName && nodesWithVmsMap.has(nodeName)) {
                        nodesWithVmsMap.get(nodeName).vms.push({
                            vmid: vm.vmid || 0,
                            id: vm.vmid || 0,
                            name: vm.name || 'VM-' + (vm.vmid || 0),
                            type: 'vm',
                            status: vm.status || 'stopped',
                            cpu: 0,
                            ram: 0,
                            disk: 0,
                            ip: '',
                            node: nodeName,
                            template: vm.template || false
                        });
                    }
                });

                // Ajouter les containers (nœuds online uniquement)
                containers.forEach(ct => {
                    const nodeName = ct.node || '';
                    if (!onlineNodeNames.has(nodeName)) return;
                    if (nodeName && nodesWithVmsMap.has(nodeName)) {
                        nodesWithVmsMap.get(nodeName).vms.push({
                            vmid: ct.vmid || 0,
                            id: ct.vmid || 0,
                            name: ct.name || 'CT-' + (ct.vmid || 0),
                            type: 'lxc',
                            status: ct.status || 'stopped',
                            cpu: 0,
                            ram: 0,
                            disk: 0,
                            ip: '',
                            node: nodeName,
                            template: false
                        });
                    }
                });

                vmsData = {
                    vms: [...vms, ...containers].map(item => ({
                        vmid: item.vmid || 0,
                        id: item.vmid || 0,
                        name: item.name || (item.type === 'qemu' ? 'VM-' : 'CT-') + (item.vmid || 0),
                        type: item.type === 'qemu' ? 'vm' : 'lxc',
                        status: item.status || 'stopped',
                        node: item.node || '',
                        template: item.template || false
                    })),
                    nodesWithVms: Array.from(nodesWithVmsMap.values())
                };
            } else {
                return;
            }

            // Créer un map de tous les nodes depuis l'endpoint nodes (inclut les nodes offline)
            const allNodesMap = new Map();
            if (nodesData && nodesData.nodes) {
                nodesData.nodes.forEach(nodeData => {
                    allNodesMap.set(nodeData.name, {
                        id: nodeData.name,
                        name: nodeData.name,
                        status: nodeData.status === 'online' ? 'online' : 'offline',
                        uptime: formatUptime(nodeData.uptime),
                        cpu: nodeData.cpu || 0,
                        ram: nodeData.ram || { used: 0, total: 0 },
                        loadavg: nodeData.loadavg || [0, 0, 0],
                        kversion: nodeData.kversion || '',
                        maxcpu: nodeData.maxcpu || 1,
                        netin: nodeData.netin ?? 0,
                        netout: nodeData.netout ?? 0,
                        diskread: nodeData.diskread ?? 0,
                        diskwrite: nodeData.diskwrite ?? 0,
                        machines: []
                    });
                });
            }

            // Mettre à jour avec les VMs depuis l'endpoint vms
            if (vmsData && vmsData.nodesWithVms) {
                vmsData.nodesWithVms.forEach(nodeWithVms => {
                    const nodeName = nodeWithVms.name;
                    if (allNodesMap.has(nodeName)) {
                        // Mettre à jour le node existant avec les VMs
                        allNodesMap.get(nodeName).machines = nodeWithVms.vms || [];
                    } else {
                        // Ajouter un nouveau node (cas où le node n'est pas dans l'endpoint nodes mais a des VMs)
                        allNodesMap.set(nodeName, {
                            id: nodeName,
                            name: nodeName,
                            status: nodeWithVms.status === 'online' ? 'online' : 'offline',
                            uptime: 'N/A',
                            cpu: 0,
                            ram: { used: 0, total: 0 },
                            machines: nodeWithVms.vms || []
                        });
                    }
                });
            }

            // Convertir le Map en array
            clusterNodes = Array.from(allNodesMap.values());
            sortClusterNodes();

            // Liste globale : uniquement les invités sur nœuds online
            machines = [];
            clusterNodes.forEach(node => {
                if (node.status !== 'online') {
                    node.machines = [];
                    return;
                }
                if (node.machines?.length) {
                    machines = machines.concat(node.machines);
                }
            });
            filteredMachines = [...machines];

            // Re-render
            initializeNodes();
            if (currentNodeId === 'all') {
                loadAllNodes();
            } else {
                loadNode(currentNodeId);
            }
            renderGrid();
            updateVMStatusDisplay();

            // Charger les stats séparément pour les VMs running uniquement
            await refreshVMStats();
        }

        const realtimeClient =
            typeof ProxPanelCore !== 'undefined'
                ? new ProxPanelCore.RealtimeClient()
                : { start() {}, stop() {}, publishScope: async () => {} };
        const vmstatsMaxPerRequest = proxmoxData.vmstatsMaxPerRequest || 80;

        window.onRealtimeResources = () => {
            if (isProduction && userLoggedInProxmox) refreshVMStatuses();
        };
        window.onRealtimeVmStats = (vmstats) => {
            ProxPanelCore.applyVmStats(vmstats, machines, clusterNodes);
            const running = machines.filter((m) => m.status === 'running');
            updateNetworkSpeedsForVms(running);
            updateDiskSpeedsForVms(running);
            updateVMStatsDisplay();
            updateVMStatusDisplay();
        };

        async function refreshVMStats() {
            if (pendingRequests['vmstats']) return;
            const parsedResources = lastResourcesParsed;
            if (!parsedResources) return;

            const runningList = ProxPanelCore.buildRunningStatsScope({
                parsedResources,
                machines,
                currentView,
                selectedVM,
                windows,
                maxCount: vmstatsMaxPerRequest,
            });

            if (runningList.length === 0) return;

            if (realtimeClient.enabled) {
                await realtimeClient.publishScope(runningList);
            }

            const statsData = await loadProxmoxData('vmstats', { running: runningList });
            if (statsData?.vmstats) {
                ProxPanelCore.applyVmStats(statsData.vmstats, machines, clusterNodes);
                const running = machines.filter((m) => m.status === 'running');
                updateNetworkSpeedsForVms(running);
                updateDiskSpeedsForVms(running);
                updateVMStatsDisplay();
                updateVMStatusDisplay();
            }
        }

        async function refreshVMStatuses() {
            const resourcesData = await loadProxmoxData('resources');
            const rawResources = resourcesData ? getResourcesRaw(resourcesData) : null;
            if (!rawResources) return;

            let parsedResources = parseResourcesRaw(rawResources);
            if (typeof ProxPanelCore !== 'undefined') {
                parsedResources = ProxPanelCore.filterGuestsOnOfflineNodes(parsedResources);
            }
            lastResourcesParsed = parsedResources;

            const resourceNodes = parsedResources.nodes || [];
            const resourceNodeMap = new Map();
            resourceNodes.forEach(node => {
                const nodeName = node.node || node.id || '';
                if (nodeName) {
                    resourceNodeMap.set(nodeName, node);
                }
            });

            // Mettre à jour les métriques des nodes depuis /cluster/resources
            clusterNodes.forEach(node => {
                const resourceNode = resourceNodeMap.get(node.name);
                if (!resourceNode) return;

                node.status = resourceNode.status || node.status || 'unknown';
                node.cpu = resourceNode.cpu ? resourceNode.cpu : (node.cpu || 0);
                node.uptime = formatUptime(resourceNode.uptime || node.uptime);
                node.loadavg = resourceNode.loadavg || node.loadavg || [0, 0, 0];
                node.kversion = resourceNode.kversion || node.kversion || '';
                node.maxcpu = resourceNode.maxcpu || node.maxcpu || 1;
                node.maxmem = resourceNode.maxmem || node.maxmem || 0;
                node.ram = {
                    used: (resourceNode.mem || 0) > 0 ? (resourceNode.mem / 1024 / 1024 / 1024) : (node.ram?.used || 0),
                    total: (resourceNode.maxmem || 0) > 0 ? (resourceNode.maxmem / 1024 / 1024 / 1024) : (node.ram?.total || 0)
                };
                if (resourceNode.netin != null) node.netin = resourceNode.netin;
                if (resourceNode.netout != null) node.netout = resourceNode.netout;
                if (resourceNode.diskread != null) node.diskread = resourceNode.diskread;
                if (resourceNode.diskwrite != null) node.diskwrite = resourceNode.diskwrite;

                if (node.status === 'online') {
                    const ramDisplay = getNodeRamDisplay(node);
                    addNodeMetric(node.name, {
                        cpu: node.cpu || 0,
                        ram: ramDisplay.percent,
                        loadavg: node.loadavg && node.loadavg[0] ? node.loadavg[0] : 0,
                    });
                }
            });

            sortClusterNodes();

            const statusMap = new Map();
            const templateMap = new Map();

            const addStatus = (item, type) => {
                if (!item) return;
                const node = item.node || '';
                const vmid = item.vmid || item.id || 0;
                if (!node || !vmid) return;
                const key = `${node}-${vmid}-${type}`;
                statusMap.set(key, item.status || 'unknown');
                if (type === 'vm') {
                    templateMap.set(key, item.template === true || item.template === 1);
                }
            };

            (parsedResources.vms || []).forEach(vm => addStatus(vm, 'vm'));
            (parsedResources.containers || []).forEach(ct => addStatus(ct, 'lxc'));

            const updateStatus = (vm) => {
                const key = `${vm.node || ''}-${vm.id}-${vm.type}`;
                if (statusMap.has(key)) {
                    vm.status = statusMap.get(key);
                }
                if (templateMap.has(key)) {
                    vm.template = templateMap.get(key);
                }
            };

            machines.forEach(updateStatus);
            clusterNodes.forEach(node => {
                if (node.machines) {
                    node.machines.forEach(updateStatus);
                }
            });

            updateNetworkSpeedsForNodes(clusterNodes.filter((n) => n.status === 'online'));

            updateVMStatusDisplay();
            updateNodeMetrics();
            if (currentView === 'nodes') {
                updateNodeCharts();
            }
            if (globalThis.ProxPanelDesktop) {
                ProxPanelDesktop.refreshWidgets({ force: true });
            }
        }

        function updateVMStatsDisplay() {
            // Mettre à jour les stats affichées dans la grille
            machines.forEach(vm => {
                if (vm.status === 'running') {
                    const cpuBar = document.getElementById(`cpu-bar-${vm.id}`);
                    const cpuVal = document.getElementById(`cpu-val-${vm.id}`);
                    const ramBar = document.getElementById(`ram-bar-${vm.id}`);
                    const ramVal = document.getElementById(`ram-val-${vm.id}`);
                    const diskBar = document.getElementById(`disk-bar-${vm.id}`);
                    const diskVal = document.getElementById(`disk-val-${vm.id}`);

                    if (cpuBar) cpuBar.style.width = `${Math.max(0, Math.min(100, vm.cpu ?? 0))}%`;
                    if (cpuVal) cpuVal.textContent = `${(vm.cpu ?? 0).toFixed(1)}%`;
                    if (ramBar) ramBar.style.width = `${Math.max(0, Math.min(100, vm.ram ?? 0))}%`;
                    if (ramVal) ramVal.textContent = `${(vm.ram ?? 0).toFixed(1)}%`;
                    if (diskBar) diskBar.style.width = `${Math.max(0, Math.min(100, vm.disk ?? 0))}%`;

                    // Pour LXC, afficher l'espace occupé/disponible au lieu du pourcentage
                    if (diskVal) {
                        if (vm.type === 'lxc' && vm.diskUsed !== undefined && vm.diskTotal !== undefined && vm.diskTotal > 0) {
                            const diskUsedGB = (vm.diskUsed / 1024 / 1024 / 1024).toFixed(2);
                            const diskTotalGB = (vm.diskTotal / 1024 / 1024 / 1024).toFixed(2);
                            diskVal.textContent = `${diskUsedGB}GB / ${diskTotalGB}GB`;
                        } else if (vm.type === 'vm') {
                            // Pour VM, afficher le pourcentage d'utilisation du disque
                            diskVal.textContent = `${(vm.disk ?? 0).toFixed(1)}%`;
                        } else {
                            diskVal.textContent = 'N/A';
                        }
                    }
                }
            });
        }

        async function refreshNodeData() {
            await refreshVMStatuses();
            if (currentView !== 'nodes') return;
            const dashboardContent = viewContainer();
            if (!dashboardContent) return;
            dashboardContent.innerHTML = await getNodesView();
            setTimeout(() => initNodeCharts(), 100);
        }

        function formatUptime(seconds) {
            if (!seconds) return 'N/A';
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            if (days > 0) return `${days}j ${hours}h`;
            return `${hours}h`;
        }

        // --- INIT ---
        function init() {
            // Ensure currentUser is set for Proxmox
            if (isProduction && userLoggedInProxmox && proxmoxUsername && !currentUser) {
                currentUser = {
                    username: proxmoxUsername,
                    name: proxmoxUsername === 'admin' ? 'Administrateur' : proxmoxUsername.charAt(0).toUpperCase() + proxmoxUsername.slice(1),
                    role: proxmoxRealm || 'pam',
                    realm: proxmoxRealm || 'pam',
                    avatar: proxmoxUsername.charAt(0).toUpperCase()
                };
            }

            // Update user profile if currentUser exists
            if (currentUser) {
                updateUserProfile();
            }

            // Check if user is logged in
            let isLoggedIn = false;
            if (isProduction) {
                isLoggedIn = userLoggedInProxmox === true;
            } else {
                isLoggedIn = currentUser !== null;
            }

            if (!isLoggedIn) {
                setAuthUiState(false);
                return;
            }

            setAuthUiState(true);
            loadSavedDesktopFromStorage();
            setupDesktopShell();

            // Load data via AJAX if in production
            if (isProduction && userLoggedInProxmox) {
                refreshVMData()
                    .then(() => {
                        initializeNodes();
                        if (currentNodeId === 'all') {
                            loadAllNodes();
                        } else {
                            loadNode(currentNodeId);
                        }
                    })
                    .catch((err) => console.error('Erreur chargement VM:', err))
                    .finally(() => {
                        restoreWorkspace();
                    });

                realtimeClient.start(proxmoxData.realtimeEnabled, vmstatsMaxPerRequest);

                if (proxmoxData.realtimeEnabled) {
                    refreshIntervals.statuses = setInterval(refreshVMStatuses, 30000);
                    refreshIntervals.vmstats = setInterval(refreshVMStats, 8000);
                } else {
                    refreshIntervals.statuses = setInterval(refreshVMStatuses, 10000);
                    refreshIntervals.vmstats = setInterval(refreshVMStats, 5000);
                }
            } else {
                // Dev mode - use mock data
                initializeNodes();
                if (currentNodeId === 'all') {
                    loadAllNodes();
                } else {
                    loadNode(currentNodeId);
                }
                setInterval(simulateMetrics, 1000);
                restoreWorkspace();
            }
            refreshIntervals.metrics = setInterval(updateNodeMetrics, 1000);
        }

        function initializeNodes() {
            sortClusterNodes();
            const selector = document.getElementById('node-selector');
            if (!selector) return;
            selector.innerHTML = '';

            // Add "All nodes" option first
            const allOption = document.createElement('option');
            allOption.value = 'all';
            allOption.textContent = 'Tous les nœuds';
            allOption.selected = currentNodeId === 'all';
            selector.appendChild(allOption);

            clusterNodes.forEach(node => {
                const option = document.createElement('option');
                option.value = node.id;
                option.textContent = `${node.name} (${node.status === 'online' ? '●' : '○'})`;
                if (node.id === currentNodeId) option.selected = true;
                selector.appendChild(option);
            });
        }

        function switchNode(nodeId) {
            currentNodeId = nodeId;
            if (nodeId === 'all') {
                loadAllNodes();
            } else {
                loadNode(nodeId);
            }
            renderGrid();
        }

        function loadAllNodes() {
            // Agréger uniquement les invités des nœuds online
            machines = [];
            clusterNodes.forEach(node => {
                if (node.status !== 'online') return;
                if (node.machines?.length) {
                    machines = machines.concat(node.machines);
                }
            });
            filteredMachines = [...machines];

            // Show all nodes info (widgets desktop à la place du header)
            const singleInfo = document.getElementById('single-node-info');
            const singleMetrics = document.getElementById('single-node-metrics');
            const allNodesInfo = document.getElementById('all-nodes-info');
            if (singleInfo) singleInfo.style.display = 'none';
            if (singleMetrics) singleMetrics.style.display = 'none';
            if (allNodesInfo) allNodesInfo.style.display = 'block';

            renderAllNodesMetrics();
            if (globalThis.ProxPanelDesktop) ProxPanelDesktop.refreshWidgets();
        }

        function renderAllNodesMetrics() {
            const container = document.getElementById('all-nodes-metrics');
            if (!container) {
                if (globalThis.ProxPanelDesktop) ProxPanelDesktop.refreshWidgets();
                return;
            }

            container.innerHTML = '';

            clusterNodes.forEach(node => {
                const ramDisplay = getNodeRamDisplay(node);
                const ramPercent = ramDisplay.percent.toFixed(1);
                const statusColor = node.status === 'online' ? '#10b981' : '#ef4444';
                const machineCount = node.machines ? node.machines.length : 0;

                container.innerHTML += `
                    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; min-width: 180px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <span style="color: ${statusColor}; font-size: 0.75rem;">${node.status === 'online' ? '●' : '○'}</span>
                            <span style="font-weight: 600; font-size: 0.9rem;">${node.name}</span>
                            <span style="font-size: 0.7rem; color: #6b7280;">(${machineCount})</span>
                        </div>
                        <div class="metric-pill" style="min-width: auto; margin-bottom: 5px;">
                            <span class="metric-label">CPU</span>
                            <div class="metric-bar-bg"><div class="metric-bar-fill" style="width: ${(node.cpu || 0).toFixed(1)}%"></div></div>
                            <span style="font-size:0.65rem; align-self:flex-end; margin-top:2px;">${(node.cpu || 0).toFixed(1)}%</span>
                        </div>
                        <div class="metric-pill" style="min-width: auto;">
                            <span class="metric-label">RAM</span>
                            <div class="metric-bar-bg"><div class="metric-bar-fill" style="width: ${ramPercent}%; background: #8b5cf6;"></div></div>
                            <span style="font-size:0.65rem; align-self:flex-end; margin-top:2px;">${ramDisplay.used.toFixed(2)}/${ramDisplay.total.toFixed(2)}GB</span>
                        </div>
                    </div>
                `;
            });
        }

        function loadNode(nodeId) {
            const node = clusterNodes.find(n => n.id === nodeId);
            if (!node) return;

            machines = node.machines || [];
            filteredMachines = [...machines];

            const singleInfo = document.getElementById('single-node-info');
            const singleMetrics = document.getElementById('single-node-metrics');
            const allNodesInfo = document.getElementById('all-nodes-info');
            const nodeNameEl = document.getElementById('current-node-name');
            const statusEl = document.getElementById('node-status');
            if (singleInfo) singleInfo.style.display = 'block';
            if (singleMetrics) singleMetrics.style.display = 'flex';
            if (allNodesInfo) allNodesInfo.style.display = 'none';

            if (nodeNameEl) nodeNameEl.textContent = node.name;
            if (statusEl) {
                if (node.status === 'online') {
                    statusEl.textContent = `● Online (Uptime: ${node.uptime})`;
                    statusEl.style.color = '#10b981';
                } else {
                    statusEl.textContent = '○ Offline';
                    statusEl.style.color = '#ef4444';
                }
            }

            updateNodeMetrics();
        }

        function updateNodeMetrics() {
            if (currentNodeId === 'all') {
                renderAllNodesMetrics();
                if (globalThis.ProxPanelDesktop) ProxPanelDesktop.refreshWidgets();
                return;
            }

            const node = clusterNodes.find(n => n.id === currentNodeId);
            if (!node || node.status !== 'online') return;

            // Les métriques sont mises à jour par refreshNodeData(), juste mettre à jour l'affichage
            const cpuEl = document.getElementById('node-cpu');
            if (cpuEl) {
                cpuEl.style.width = (node.cpu || 0).toFixed(1) + '%';
                const cpuLabel = cpuEl.parentElement.nextElementSibling;
                if (cpuLabel) cpuLabel.textContent = (node.cpu || 0).toFixed(1) + '%';
            }

            const ramEl = document.getElementById('node-ram');
            if (ramEl) {
                const ramDisplay = getNodeRamDisplay(node);
                const ramPercent = ramDisplay.percent.toFixed(1);
                ramEl.style.width = ramPercent + '%';
                const ramLabel = ramEl.parentElement.nextElementSibling;
                if (ramLabel) {
                    ramLabel.textContent = `${ramDisplay.used.toFixed(2)}/${ramDisplay.total.toFixed(2)}GB`;
                }
            }
        }

        // --- FILTER VMs ---
        function filterVMs() {
            const searchTerm = document.getElementById('vm-filter').value.toLowerCase();
            const typeFilter = document.getElementById('filter-type').value;
            const statusFilter = document.getElementById('filter-status').value;

            filteredMachines = machines.filter(vm => {
                const matchName = vm.name.toLowerCase().includes(searchTerm) || vm.id.toString().includes(searchTerm);
                const matchType = !typeFilter || vm.type === typeFilter;
                const matchStatus = !statusFilter || vm.status === statusFilter;
                return matchName && matchType && matchStatus;
            });

            renderGrid();
        }

        // --- RENDER GRID ---
        function renderGrid() {
            const container = viewContainer('dashboard');
            const grid = container?.querySelector('#vm-grid') || document.getElementById('vm-grid');
            if (!grid) return;
            grid.innerHTML = '';

            filteredMachines.forEach(vm => {
                const isRun = vm.status === 'running';
                const isPaused = vm.status === 'paused' || vm.status === 'suspended';
                const isTemplate = vm.template === true;
                const badge = vm.type === 'vm' ? '<span class="vm-badge badge-vm">VM</span>' : '<span class="vm-badge badge-lxc">LXC</span>';
                const templateBadge = isTemplate ? '<span class="vm-badge" style="background: #fbbf24; color: #92400e; margin-left: 8px;" title="Modèle (Template)"><i class="fa-solid fa-layer-group"></i> Modèle</span>' : '';

                // LXC show Disk, VM show nothing specific in 3rd bar for now (or Swap)
                const diskLabel = vm.type === 'lxc' ? 'Disk (Rootfs)' : 'Disk I/O';

                // Pour LXC, afficher l'espace occupé/disponible au lieu du pourcentage
                let diskDisplay = '';
                if (vm.type === 'lxc' && vm.diskUsed !== undefined && vm.diskTotal !== undefined) {
                    const diskUsedGB = (vm.diskUsed / 1024 / 1024 / 1024).toFixed(2);
                    const diskTotalGB = (vm.diskTotal / 1024 / 1024 / 1024).toFixed(2);
                    const diskPercent = vm.disk || 0;
                    diskDisplay = `${diskUsedGB}GB / ${diskTotalGB}GB`;
                } else {
                    diskDisplay = `${(vm.disk ?? 0).toFixed(1)}%`;
                }

                grid.innerHTML += `
                <div class="card" data-vmid="${vm.id}" data-node="${vm.node || ''}" data-type="${vm.type}">
                    <div class="card-header">
                        <div style="font-weight:600; display:flex; align-items:center; gap:8px;">
                            <div id="vm-card-dot-${vm.id}-${vm.node}" style="width:10px; height:10px; border-radius:50%; background:${getVmStatusColor(vm.status)}"></div>
                            ${vm.name}
                        </div>
                        <div style="display:flex; align-items:center;">
                            ${badge}
                            ${templateBadge}
                        </div>
                    </div>
                    
                    <div class="mini-stats">
                        <div class="stat-row">
                            CPU <span class="stat-val" id="cpu-val-${vm.id}">${(vm.cpu ?? 0).toFixed(1)}%</span>
                            <div class="progress-sm"><div class="progress-fill fill-cpu" id="cpu-bar-${vm.id}" style="width:${Math.max(0, Math.min(100, vm.cpu ?? 0))}%"></div></div>
                        </div>
                        <div class="stat-row">
                            RAM <span class="stat-val" id="ram-val-${vm.id}">${(vm.ram ?? 0).toFixed(1)}%</span>
                            <div class="progress-sm"><div class="progress-fill fill-ram" id="ram-bar-${vm.id}" style="width:${Math.max(0, Math.min(100, vm.ram ?? 0))}%"></div></div>
                        </div>
                        <div class="stat-row" style="grid-column: span 2;">
                            ${diskLabel} <span class="stat-val" id="disk-val-${vm.id}">${diskDisplay}</span>
                            <div class="progress-sm"><div class="progress-fill fill-disk" id="disk-bar-${vm.id}" style="width:${Math.max(0, Math.min(100, vm.disk ?? 0))}%"></div></div>
                        </div>
                    </div>

                    ${vm.note ? `<div class="vm-note"><i class="fa-solid fa-note-sticky note-icon" onclick="editVMNote(${vm.id})" title="Modifier la note"></i><span>${vm.note}</span></div>` : ''}
                    <div class="vm-actions-wrapper">
                        <div class="vm-actions-primary" id="vm-card-actions-${vm.id}">
                            ${getVmCardActionsHTML(vm, isRun)}
                        </div>
                        <div class="vm-actions-menu">
                            <button class="vm-actions-btn" onclick="toggleActionsMenu(${vm.id}, event)" title="Plus d'actions">
                                <i class="fa-solid fa-ellipsis-vertical"></i>
                            </button>
                            <div class="vm-actions-dropdown" id="actions-menu-${vm.id}">
                                <button class="vm-action-item" onclick="openConfig(${vm.id}); closeActionsMenu(${vm.id});">
                                    <i class="fa-solid fa-sliders"></i> <span>Configuration</span>
                                </button>
                                <button class="vm-action-item" onclick="openBackups(${vm.id}); closeActionsMenu(${vm.id});">
                                    <i class="fa-solid fa-floppy-disk"></i> <span>Sauvegardes</span>
                                </button>
                                ${isTemplate ? `<button class="vm-action-item" onclick="cloneVM(${vm.id}); closeActionsMenu(${vm.id});" title="Cloner ce modèle (linked clone uniquement)">
                                    <i class="fa-solid fa-copy"></i> <span>Cloner (Linked)</span>
                                </button>` : `<button class="vm-action-item" onclick="cloneVM(${vm.id}); closeActionsMenu(${vm.id});" style="opacity: 0.5; cursor: not-allowed;" disabled title="Le clonage est uniquement disponible pour les modèles">
                                    <i class="fa-solid fa-copy"></i> <span>Cloner</span>
                                </button>`}
                                <button class="vm-action-item" onclick="editVMName(${vm.id}); closeActionsMenu(${vm.id});">
                                    <i class="fa-solid fa-pen"></i> <span>Renommer</span>
                                </button>
                                <button class="vm-action-item" onclick="editVMNote(${vm.id}); closeActionsMenu(${vm.id});">
                                    <i class="fa-solid fa-note-sticky"></i> <span>Notes</span>
                                </button>
                                <div style="height: 1px; background: #e5e7eb; margin: 4px 0;"></div>
                                <button class="vm-action-item danger" onclick="deleteVM(${vm.id}); closeActionsMenu(${vm.id});">
                                    <i class="fa-solid fa-trash"></i> <span>Supprimer</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>`;
            });
        }

        // --- METRICS SIMULATION ---
        function simulateMetrics() {
            // Update VM Stats
            machines.forEach(vm => {
                if (vm.status === 'running') {
                    // Random variations
                    vm.cpu = Math.max(1, Math.min(100, vm.cpu + (Math.random() * 10 - 5))).toFixed(1);
                    vm.ram = Math.max(10, Math.min(90, vm.ram + (Math.random() * 5 - 2.5))).toFixed(1);

                    if (vm.type === 'lxc') {
                        // Disk usage stable for LXC
                    } else {
                        // IO simulation for VM
                        vm.disk = Math.floor(Math.random() * 30);
                    }

                    // DOM Updates
                    const cpuBar = document.getElementById(`cpu-bar-${vm.id}`);
                    if (cpuBar) {
                        const cpuVal = parseFloat(vm.cpu) || 0;
                        const ramVal = parseFloat(vm.ram) || 0;
                        const diskVal = parseFloat(vm.disk) || 0;

                        cpuBar.style.width = Math.max(0, Math.min(100, cpuVal)) + '%';
                        const cpuValEl = document.getElementById(`cpu-val-${vm.id}`);
                        if (cpuValEl) cpuValEl.innerText = cpuVal.toFixed(1) + '%';

                        const ramBarEl = document.getElementById(`ram-bar-${vm.id}`);
                        if (ramBarEl) ramBarEl.style.width = Math.max(0, Math.min(100, ramVal)) + '%';
                        const ramValEl = document.getElementById(`ram-val-${vm.id}`);
                        if (ramValEl) ramValEl.innerText = ramVal.toFixed(1) + '%';

                        const diskBarEl = document.getElementById(`disk-bar-${vm.id}`);
                        if (diskBarEl) diskBarEl.style.width = Math.max(0, Math.min(100, diskVal)) + '%';
                        const diskValEl = document.getElementById(`disk-val-${vm.id}`);
                        if (diskValEl) diskValEl.innerText = diskVal.toFixed(1) + '%';
                    }
                }
            });
        }

        // --- WINDOW MANAGER ---
        let zIndexCounter = 100;
        const consoleInstances = {}; // Store console instances

        function normalizeConsoleType(type) {
            const t = String(type ?? 'vm').toLowerCase();
            if (t === 'qemu' || t === 'vm') return 'vm';
            if (t === 'lxc' || t === 'ct') return 'lxc';
            return t;
        }

        function getVncRfb(vmid) {
            const inst = consoleInstances[vmid];
            return inst && typeof inst.sendCtrlAltDel === 'function' ? inst : null;
        }

        const vncVmClipboard = {};

        function buildVmConsoleInnerHtml(id) {
            return `
                <div class="console-vm-layout">
                    <div class="console-vnc-toolbar">
                        <button type="button" class="vnc-tb-btn" onclick="consoleVncCtrlAltDel(${id})" title="Ctrl+Alt+Suppr">
                            <i class="fa-solid fa-keyboard"></i> Ctrl+Alt+Suppr
                        </button>
                        <button type="button" class="vnc-tb-btn" onclick="consoleVncCopy(${id})" title="Copier le presse-papiers de la VM">
                            <i class="fa-solid fa-copy"></i>
                        </button>
                        <button type="button" class="vnc-tb-btn" onclick="consoleVncPaste(${id})" title="Coller vers la VM">
                            <i class="fa-solid fa-paste"></i>
                        </button>
                        <button type="button" class="vnc-tb-btn" onclick="consoleVncFullscreen(${id})" title="Plein écran">
                            <i class="fa-solid fa-expand"></i> Plein écran
                        </button>
                        <label class="vnc-tb-check" title="Afficher le pointeur de la souris (utile si le curseur est masqué)">
                            <input type="checkbox" id="vnc-cursor-${id}" onchange="consoleVncShowCursor(${id}, this.checked)">
                            Curseur visible
                        </label>
                        <label class="vnc-tb-check" title="Adapter la résolution de la VM à la fenêtre">
                            <input type="checkbox" id="vnc-resize-${id}" onchange="consoleVncResizeSession(${id}, this.checked)">
                            Résolution auto
                        </label>
                        <label class="vnc-tb-check" title="Mettre à l'échelle l'affichage">
                            <input type="checkbox" id="vnc-scale-${id}" checked onchange="consoleVncScaleViewport(${id}, this.checked)">
                            Échelle auto
                        </label>
                    </div>
                    <div id="novnc-${id}" class="console-novnc" tabindex="0"></div>
                </div>
            `;
        }

        function consoleVncCtrlAltDel(vmid) {
            const rfb = getVncRfb(vmid);
            if (!rfb) return;
            rfb.sendCtrlAltDel();
        }

        function consoleVncCopy(vmid) {
            const text = vncVmClipboard[vmid];
            if (!text) {
                showNotification('Rien à copier - utilisez Ctrl+C dans la VM ou attendez la synchro presse-papiers', 'info');
                return;
            }
            navigator.clipboard?.writeText(text).then(
                () => showNotification('Copié depuis la VM', 'success'),
                () => showNotification('Copie refusée par le navigateur', 'error')
            );
        }

        function consoleVncPaste(vmid) {
            const rfb = getVncRfb(vmid);
            if (!rfb?.clipboardPasteFrom) {
                showNotification('Coller non disponible', 'error');
                return;
            }
            navigator.clipboard?.readText().then(
                (text) => {
                    if (text) {
                        rfb.clipboardPasteFrom(text);
                        rfb.focus();
                    }
                },
                () => showNotification('Accès presse-papiers refusé', 'error')
            );
        }

        function consoleVncShowCursor(vmid, enabled) {
            const rfb = getVncRfb(vmid);
            if (rfb) rfb.showDotCursor = !!enabled;
        }

        function consoleVncFullscreen(vmid) {
            const el = document.getElementById(`novnc-${vmid}`)?.closest('.console-vm-layout')
                || document.getElementById(`win-${vmid}`);
            if (!el) return;
            if (!document.fullscreenElement) {
                el.requestFullscreen?.().catch(() => showNotification('Plein écran non disponible', 'error'));
            } else {
                document.exitFullscreen?.();
            }
        }

        function consoleVncResizeSession(vmid, enabled) {
            const rfb = getVncRfb(vmid);
            if (rfb) rfb.resizeSession = !!enabled;
        }

        function consoleVncScaleViewport(vmid, enabled) {
            const rfb = getVncRfb(vmid);
            if (rfb) rfb.scaleViewport = !!enabled;
        }

        /** WebSocket relaie par ProxPanel (évite certificat / cookie sur :8006). */
        function buildConsoleProxyWsUrl(node, vmid, type, port, vncticket) {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const params = new URLSearchParams({
                node,
                vmid: String(vmid),
                type: normalizeConsoleType(type),
                port: String(port),
                vncticket,
            });
            return `${wsProtocol}//${window.location.host}/api/console/ws?${params}`;
        }

        function nodeShellWinKey(nodeName) {
            return `shell-${String(nodeName).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        }

        function createConsoleWindowShell(id, type, name, vmNode, innerHtml, options = {}) {
            const winKey = options.winKey || `console-${id}`;
            const winDomId = `win-${winKey}`;
            const kind = options.kind || 'console';
            const titleIcon = options.titleIcon || 'fa-terminal';
            const titleText = options.titleText || `Console: ${escWinHtml(name)}`;
            const refreshAttr = options.onRefresh
                ? `onclick="${options.onRefresh}"`
                : `onclick="refreshConsole(${id}, '${type}', '${escWinHtml(name)}', '${escWinHtml(vmNode)}')"`;
            const winEl = document.createElement('div');
            winEl.className = 'window';
            winEl.id = winDomId;
            winEl.style.zIndex = ++zIndexCounter;
            const windowCount = windows.length;
            winEl.style.left = `${50 + windowCount * 30}px`;
            winEl.style.top = `${50 + windowCount * 30}px`;
            if (options.width) winEl.style.width = options.width;
            if (options.height) winEl.style.height = options.height;
            winEl.innerHTML = `
                <div class="win-header" onmousedown="startDrag(event, '${winDomId}')" ondblclick="handleDoubleClick(event, '${winDomId}')">
                    <div class="win-title"><i class="fa-solid ${titleIcon}"></i> ${titleText}</div>
                    <div class="win-controls">
                        <button type="button" ${refreshAttr} title="Rafraîchir"><i class="fa-solid fa-rotate"></i></button>
                        <button type="button" onclick="minimizeWindow('${winKey}')"><i class="fa-solid fa-minus"></i></button>
                        <button type="button" onclick="maximizeWindow('${winKey}')"><i class="fa-regular fa-square"></i></button>
                        <button type="button" class="win-close" onclick="closeWindow('${winKey}')"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </div>
                <div class="win-content" onclick="focusWindow('${winDomId}')" style="padding:0; overflow:hidden; background:#000;">
                    ${innerHtml}
                </div>
            `;
            document.getElementById('window-layer').appendChild(winEl);
            if (globalThis.ProxPanelWindowManager) {
                ProxPanelWindowManager.decorate(winEl, winKey);
            }
            windows.push({
                winKey,
                id: options.id ?? id,
                name,
                type,
                kind,
                state: 'normal',
                node: vmNode,
                layoutMode: 'floating',
            });
            renderTaskbar();
            saveWindowsToLocalStorage();
            new ResizeObserver(() => saveWindowsToLocalStorage()).observe(winEl);
            return winEl;
        }

        async function openNodeShell(nodeName) {
            if (!nodeName) return;
            const winKey = nodeShellWinKey(nodeName);
            const existing = windows.find((w) => w.winKey === winKey);
            if (existing) {
                restoreWindow(winKey);
                return;
            }

            const node = clusterNodes.find((n) => n.name === nodeName);
            if (!node) {
                showNotification('Nœud introuvable', 'error');
                return;
            }
            if (node.status !== 'online') {
                showNotification('Le nœud doit être en ligne pour ouvrir un shell', 'error');
                return;
            }

            if (!isProduction || !userLoggedInProxmox) {
                showNotification('Shell hyperviseur disponible uniquement en mode production', 'info');
                return;
            }

            const safeNode = encodeURIComponent(nodeName);
            const frameSrc = `/lxc-console.html?type=node&node=${safeNode}`;
            createConsoleWindowShell(null, 'node', nodeName, nodeName, `<iframe class="console-lxc-frame" src="${frameSrc}" title="Shell ${escWinHtml(nodeName)}" allow="clipboard-read; clipboard-write"></iframe>`, {
                winKey,
                kind: 'node-shell',
                titleIcon: 'fa-server',
                titleText: `Shell — ${escWinHtml(nodeName)}`,
                onRefresh: `refreshNodeShell('${escapeHtml(nodeName)}')`,
                width: '720px',
                height: '480px',
                id: nodeName,
            });
        }

        function refreshNodeShell(nodeName) {
            closeWindow(nodeShellWinKey(nodeName));
            setTimeout(() => openNodeShell(nodeName), 150);
        }

        async function openConsole(id, type, name, node = null) {
            const winKey = `console-${id}`;
            const existing = windows.find((w) => w.winKey === winKey);
            if (existing) {
                restoreWindow(winKey);
                return;
            }

            const vm = machines.find(m => m.id === id);
            if (!vm) return;

            const vmNode = node || vm.node;
            if (!vmNode) {
                showNotification('Nœud non trouvé pour cette VM', 'error');
                return;
            }

            try {
                const response = await fetch(
                    `/api/data?action=console&vmid=${id}&node=${encodeURIComponent(vmNode)}&type=${encodeURIComponent(type)}`
                );
                const consoleData = await response.json();

                if (!consoleData?.console?.ticket || consoleData.console.port == null) {
                    showNotification(consoleData?.error || 'Impossible d\'ouvrir la console', 'error');
                    return;
                }

                const c = consoleData.console;
                const consoleType = normalizeConsoleType(type);
                const isVm = consoleType === 'vm';

                if (isVm) {
                    createConsoleWindowShell(id, type, name, vmNode, buildVmConsoleInnerHtml(id));
                    await initNoVNC(id, vmNode, c);
                } else {
                    const frameSrc = `/lxc-console.html?vmid=${encodeURIComponent(id)}&node=${encodeURIComponent(vmNode)}`;
                    createConsoleWindowShell(
                        id,
                        type,
                        name,
                        vmNode,
                        `<iframe class="console-lxc-frame" src="${frameSrc}" title="Console ${name}" allow="clipboard-read; clipboard-write"></iframe>`
                    );
                }
            } catch (error) {
                console.error('Erreur console:', error);
                showNotification('Erreur lors de l\'ouverture de la console', 'error');
            }
        }

        async function initNoVNC(vmid, node, vncData) {
            const container = document.getElementById(`novnc-${vmid}`);
            if (!container) return;

            try {
                if (!vncData?.proxmoxUrl || !vncData.ticket) {
                    container.innerHTML =
                        '<div style="color:white;padding:20px;text-align:center;">Données VNC manquantes</div>';
                    return;
                }

                const wsUrl = buildConsoleProxyWsUrl(node, vmid, 'vm', vncData.port, vncData.ticket);

                const { default: RFB } = await import('https://cdn.jsdelivr.net/npm/@novnc/novnc@1.4.0/core/rfb.js');
                const rfb = new RFB(container, wsUrl, {
                    credentials: { password: vncData.ticket },
                });

                rfb.viewOnly = false;
                rfb.focusOnClick = true;
                rfb.showDotCursor = false;
                rfb.scaleViewport = true;
                rfb.resizeSession = false;
                rfb.clipViewport = false;

                const layout = container.closest('.console-vm-layout');
                layout?.addEventListener('mousedown', (e) => {
                    if (e.target.closest('.console-vnc-toolbar')) return;
                    rfb.focus();
                    focusWindow(`win-${vmid}`);
                });

                rfb.addEventListener('clipboard', (e) => {
                    const text = e.detail?.text;
                    if (text) vncVmClipboard[vmid] = text;
                });

                rfb.addEventListener('connect', () => {
                    rfb.focus();
                    const cursorCb = document.getElementById(`vnc-cursor-${vmid}`);
                    if (cursorCb) rfb.showDotCursor = cursorCb.checked;
                });

                rfb.addEventListener('disconnect', (e) => {
                    if (!e.detail.clean) {
                        container.innerHTML =
                            '<div style="color:white;padding:20px;text-align:center;">Connexion VNC perdue</div>';
                    }
                });

                consoleInstances[vmid] = rfb;
            } catch (error) {
                console.error('Error initializing noVNC:', error);
                container.innerHTML =
                    `<div style="color:white;padding:20px;text-align:center;">Erreur VNC: ${error.message}</div>`;
            }
        }

        /** Longueur d'octets comme pve-xtermjs (Proxmox). */
        function pveTerminalByteLength(str) {
            return unescape(encodeURIComponent(str)).length;
        }

        function pveTerminalOnMessage(term, event, state) {
            if (typeof event.data === 'string') {
                if (!state.connected) {
                    if (event.data.startsWith('OK')) {
                        state.connected = true;
                        if (event.data.length > 2) term.write(event.data.slice(2));
                        return true;
                    }
                    term.writeln('Connexion terminal refusée');
                    state.socket?.close();
                    return false;
                }
                term.write(event.data);
                return true;
            }

            const answer = new Uint8Array(event.data);
            if (!state.connected) {
                if (answer.length >= 2 && answer[0] === 79 && answer[1] === 75) {
                    state.connected = true;
                    if (answer.length > 2) term.write(answer.subarray(2));
                    return true;
                }
                term.writeln('Connexion terminal refusée (mode VNC ? redémarrez ProxPanel)');
                state.socket?.close();
                return false;
            }
            term.write(answer);
            return true;
        }

        async function initXTerm(vmid, node, consoleData) {
            const container = document.getElementById(`xterm-${vmid}`);
            if (!container) return;

            const state = { connected: false, socket: null };

            try {
                const term = new Terminal({
                    cursorBlink: true,
                    fontSize: 14,
                    fontFamily: "'Consolas', 'Courier New', monospace",
                    theme: {
                        background: '#0c0c0c',
                        foreground: '#cccccc',
                        cursor: '#ffffff',
                    },
                });

                const fitAddon = new FitAddon.FitAddon();
                term.loadAddon(fitAddon);
                term.open(container);
                fitAddon.fit();

                if (consoleData.port == null || !consoleData.ticket) {
                    term.writeln('Erreur: données de connexion manquantes');
                    return;
                }

                const wsUrl = buildConsoleProxyWsUrl(node, vmid, 'lxc', consoleData.port, consoleData.ticket);
                const socket = new WebSocket(wsUrl, ['binary']);
                socket.binaryType = 'arraybuffer';
                state.socket = socket;

                socket.addEventListener('open', () => {
                    /* Auth user:ticket envoyée par le proxy Node à l'ouverture upstream */
                });

                socket.addEventListener('message', (event) => {
                    const wasConnected = state.connected;
                    const ok = pveTerminalOnMessage(term, event, state);
                    if (ok && state.connected && !wasConnected) {
                        fitAddon.fit();
                        socket.send(`1:${term.cols}:${term.rows}:`);
                        term.focus();
                    }
                });

                socket.addEventListener('error', () => {
                    term.writeln('\r\nÉchec WebSocket (droits VM.Console ?)');
                });

                socket.addEventListener('close', (ev) => {
                    state.connected = false;
                    if (!ev.wasClean) {
                        term.writeln(`\r\nConnexion fermée (${ev.code})`);
                    }
                });

                term.onData((data) => {
                    if (state.connected && socket.readyState === WebSocket.OPEN) {
                        socket.send(`0:${pveTerminalByteLength(data)}:${data}`);
                    }
                });

                term.onResize((size) => {
                    if (state.connected && socket.readyState === WebSocket.OPEN) {
                        socket.send(`1:${size.cols}:${size.rows}:`);
                    }
                });

                const pingInterval = setInterval(() => {
                    if (state.connected && socket.readyState === WebSocket.OPEN) {
                        socket.send('2');
                    }
                }, 30000);

                let resizeTimer;
                const resizeHandler = () => {
                    clearTimeout(resizeTimer);
                    resizeTimer = setTimeout(() => {
                        fitAddon.fit();
                        if (state.connected && socket.readyState === WebSocket.OPEN) {
                            socket.send(`1:${term.cols}:${term.rows}:`);
                        }
                    }, 200);
                };
                window.addEventListener('resize', resizeHandler);
                const ro = new ResizeObserver(resizeHandler);
                ro.observe(container);

                consoleInstances[vmid] = {
                    term,
                    dispose() {
                        clearInterval(pingInterval);
                        clearTimeout(resizeTimer);
                        window.removeEventListener('resize', resizeHandler);
                        ro.disconnect();
                        try {
                            socket.close();
                        } catch {
                            /* ignore */
                        }
                        term.dispose();
                    },
                };
            } catch (error) {
                console.error('Error initializing xterm:', error);
            }
        }

        function closeWindow(idOrKey) {
            const winKey = resolveWinKey(idOrKey);
            const winObj = windows.find((w) => w.winKey === winKey);
            const vmid = winObj?.id;

            if (winObj?.kind === 'console' && vmid != null) {
                if (consoleInstances[vmid]) {
                    const inst = consoleInstances[vmid];
                    if (inst._resizeHandler) {
                        window.removeEventListener('resize', inst._resizeHandler);
                    }
                    if (inst.disconnect) {
                        inst.disconnect();
                    } else if (typeof inst.dispose === 'function') {
                        inst.dispose();
                    } else if (inst.term?.dispose) {
                        inst.term.dispose();
                    }
                    delete consoleInstances[vmid];
                }
                delete vncVmClipboard[vmid];
            }

            if (winObj?.kind === 'config') {
                const cfgRoot = document.querySelector(`#win-${winKey} .config-window-body`);
                if (cfgRoot && guestConfigEditor?.root === cfgRoot) {
                    guestConfigEditor = null;
                }
            }

            if (winObj?.kind === 'task-detail') {
                stopTaskDetailRefresh(winKey);
            }

            document.getElementById(`win-${winKey}`)?.remove();
            windows = windows.filter((w) => w.winKey !== winKey);
            renderTaskbar();
            saveWindowsToLocalStorage();
        }

        function minimizeWindow(idOrKey) {
            const winKey = resolveWinKey(idOrKey);
            const winEl = document.getElementById(`win-${winKey}`);
            if (!winEl) return;
            winEl.classList.add('minimized');
            const winObj = windows.find((w) => w.winKey === winKey);
            if (winObj) winObj.state = 'minimized';
            renderTaskbar();
            saveWindowsToLocalStorage();
        }

        function minimizeAllWindows() {
            if (windows.length === 0) return;
            const allMinimized = windows.every((w) => w.state === 'minimized');
            if (allMinimized) {
                windows.forEach((w) => restoreWindow(w.winKey || w.id));
            } else {
                windows.forEach((w) => {
                    if (w.state !== 'minimized') minimizeWindow(w.winKey || w.id);
                });
            }
        }

        function restoreWindow(idOrKey) {
            const winKey = resolveWinKey(idOrKey);
            const winEl = document.getElementById(`win-${winKey}`);
            if (!winEl) return;
            winEl.classList.remove('minimized');
            focusWindow(`win-${winKey}`);
            const winObj = windows.find((w) => w.winKey === winKey);
            if (winObj) winObj.state = 'normal';
            renderTaskbar();
            saveWindowsToLocalStorage();
        }

        function maximizeWindow(idOrKey) {
            ProxPanelWindowManager.maximizeWindow(resolveWinKey(idOrKey));
            saveWindowsToLocalStorage();
        }

        // --- FONCTIONS DE RAFRAÎCHISSEMENT ET SAUVEGARDE ---
        async function refreshConsole(id, type, name, node) {
            closeWindow(`console-${id}`);
            setTimeout(() => openConsole(id, type, name, node), 150);
        }

        window.consoleVncCtrlAltDel = consoleVncCtrlAltDel;
        window.consoleVncCopy = consoleVncCopy;
        window.consoleVncPaste = consoleVncPaste;
        window.consoleVncShowCursor = consoleVncShowCursor;
        window.consoleVncFullscreen = consoleVncFullscreen;
        window.consoleVncResizeSession = consoleVncResizeSession;
        window.consoleVncScaleViewport = consoleVncScaleViewport;

        // Sauvegarder les fenêtres ouvertes (localStorage + workspace serveur)
        function saveWindowsToLocalStorage() {
            if (!currentUser || !currentUser.username) return;

            try {
                const payload = buildWorkspacePayload();
                const storageKey = workspaceStorageKey();
                if (storageKey) {
                    localStorage.setItem(storageKey, JSON.stringify(payload));
                }
                if (isProduction && userLoggedInProxmox) {
                    ProxPanelCore.saveWorkspaceDebounced({
                        windows: payload.windows,
                        currentView: payload.currentView,
                        selectedVM: payload.selectedVM,
                        desktop: payload.desktop,
                    });
                }
            } catch (error) {
                console.error('Erreur lors de la sauvegarde des fenêtres:', error);
            }
        }

        function saveWindowsBeforeUnload() {
            if (!currentUser?.username) return;
            try {
                const payload = buildWorkspacePayload();
                const storageKey = workspaceStorageKey();
                if (storageKey) {
                    localStorage.setItem(storageKey, JSON.stringify(payload));
                }
                if (isProduction && userLoggedInProxmox) {
                    fetch('/api/workspace', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            windows: payload.windows,
                            currentView: payload.currentView,
                            selectedVM: payload.selectedVM,
                            desktop: payload.desktop,
                        }),
                        keepalive: true,
                    }).catch(() => {});
                }
            } catch (_) { /* ignore */ }
        }

        async function restoreWindowsFromLocalStorage() {
            await restoreWorkspace();
        }

        function focusWindow(eleId) {
            const el = document.getElementById(eleId);
            if (el) el.style.zIndex = ++zIndexCounter;
        }

        // --- TASKBAR ---
        function getTaskbarWindowLabel(w) {
            if (!w) return { short: '', full: '' };
            let short = '';
            let full = w.name || w.winKey || '';

            if (w.kind === 'app' && w.appId) {
                const app = globalThis.ProxPanelAppRegistry?.getApp?.(w.appId);
                short = app?.title || w.name || w.appId;
                full = short;
            } else if (w.kind === 'console') {
                const vm = machines.find((m) => m.id === w.id && (!w.node || m.node === w.node));
                short = vm?.name || w.name || `Console ${w.id}`;
                full = `Console - ${short}${w.node ? ` (${w.node})` : ''}`;
            } else if (w.kind === 'config') {
                const vm = machines.find((m) => m.id === w.id && (!w.node || m.node === w.node));
                const vmName = vm?.name || w.name?.replace(/^Configuration\s+(VM|LXC)\s*[—–-]\s*/i, '') || `VM ${w.id}`;
                short = `Config · ${vmName}`;
                full = w.name || short;
            } else if (w.kind === 'task-detail') {
                short = (w.name || 'Tâche').replace(/^Tâche\s*[—–-]\s*/i, '');
                short = short ? `Tâche · ${short}` : 'Tâche';
                full = w.name || short;
            } else if (w.kind === 'notes-editor') {
                short = (w.name || 'Notes').replace(/^Notes\s*(Proxmox)?\s*[—–-]\s*/i, 'Notes · ');
                if (!short.startsWith('Notes')) short = `Notes · ${short}`;
                full = w.name || short;
            } else if (w.kind === 'node-shell') {
                short = `Shell · ${w.node || w.name || ''}`;
                full = w.name ? `Shell — ${w.name}` : short;
            } else {
                short = w.name || w.winKey || '';
                short = short.replace(/^Configuration\s+(VM|LXC)\s*[—–-]\s*/i, 'Config · ');
                short = short.replace(/^Console:\s*/i, '');
            }

            return { short, full };
        }

        function updateTaskbarTasksBadge() {
            const badge = document.getElementById('taskbar-tasks-badge');
            if (!badge) return;
            const running = tasksData.filter((t) => t.status === 'running').length;
            if (running > 0) {
                badge.hidden = false;
                badge.textContent = running > 9 ? '9+' : String(running);
            } else {
                badge.hidden = true;
            }
        }

        function generateTaskbarTasksFlyoutHTML() {
            const sorted = [...tasksData].sort((a, b) => {
                const rank = (t) => (t.status === 'running' ? 0 : t.status === 'error' ? 1 : 2);
                const dr = rank(a) - rank(b);
                if (dr !== 0) return dr;
                return (b.starttime || 0) - (a.starttime || 0);
            });
            const visible = sorted.slice(0, 24);

            if (!visible.length) {
                return `<div class="taskbar-flyout-empty"><i class="fa-solid fa-tasks"></i><p>Aucune tâche récente</p></div>`;
            }

            return visible.map((task) => {
                const upid = task.upid || '';
                const node = parseTaskNode(task);
                const statusInfo = formatTaskStatus(task.status, task.exitstatus);
                const typeLabel = formatTaskType(task.type);
                const statusClass = task.status === 'running' ? 'running' : task.status === 'error' ? 'error' : 'stopped';
                const duration = formatDuration(task.starttime, task.endtime);
                return `
                <div class="taskbar-flyout-item status-${statusClass}">
                    <div class="taskbar-flyout-item-main">
                        <div class="taskbar-flyout-item-title" style="color:${statusInfo.color}">
                            <i class="fa-solid ${statusInfo.icon}"></i>
                            <span>${escapeHtml(typeLabel)}</span>
                        </div>
                        <div class="taskbar-flyout-item-meta">${escapeHtml(node || '—')} · ${escapeHtml(statusInfo.text)} · ${duration}</div>
                    </div>
                    <div class="taskbar-flyout-item-actions">
                        ${task.status === 'running' && node ? `
                        <button type="button" class="taskbar-flyout-item-btn danger" data-task-flyout-stop="${escapeHtml(upid)}" data-task-flyout-node="${escapeHtml(node)}">Arrêter</button>` : ''}
                        <button type="button" class="taskbar-flyout-item-btn primary" data-task-flyout-details data-upid="${escapeHtml(upid)}" data-node="${escapeHtml(node)}">Détails</button>
                    </div>
                </div>`;
            }).join('');
        }

        function renderTaskbarTasksFlyout() {
            const body = document.getElementById('taskbar-tasks-flyout-body');
            if (body) {
                body.innerHTML = generateTaskbarTasksFlyoutHTML();
            }
            updateTaskbarTasksBadge();
        }

        function closeTaskbarTasksFlyout() {
            taskbarTasksFlyoutOpen = false;
            const flyout = document.getElementById('taskbar-tasks-flyout');
            const btn = document.getElementById('taskbar-tasks');
            if (flyout) flyout.hidden = true;
            if (btn) {
                btn.classList.remove('active');
                btn.setAttribute('aria-expanded', 'false');
            }
            if (taskbarTasksFlyoutTimer) {
                clearInterval(taskbarTasksFlyoutTimer);
                taskbarTasksFlyoutTimer = null;
            }
        }

        async function toggleTaskbarTasksFlyout(force) {
            const next = force !== undefined ? !!force : !taskbarTasksFlyoutOpen;
            if (!next) {
                closeTaskbarTasksFlyout();
                return;
            }

            if (isProduction && userLoggedInProxmox) {
                await refreshTasksData();
            } else if (!tasksData.length) {
                tasksData = [
                    { upid: 'UPID:pve:1:running', type: 'qmstart', status: 'running', user: 'root@pam', starttime: Math.floor(Date.now() / 1000) - 60, node: 'pve-01', id: '100' },
                    { upid: 'UPID:pve:2:stopped', type: 'vzdump', status: 'stopped', exitstatus: 'OK', user: 'root@pam', starttime: Math.floor(Date.now() / 1000) - 3600, endtime: Math.floor(Date.now() / 1000) - 3500, node: 'pve-01' },
                ];
            }

            taskbarTasksFlyoutOpen = true;
            const flyout = document.getElementById('taskbar-tasks-flyout');
            const btn = document.getElementById('taskbar-tasks');
            if (flyout) flyout.hidden = false;
            if (btn) {
                btn.classList.add('active');
                btn.setAttribute('aria-expanded', 'true');
            }
            renderTaskbarTasksFlyout();

            if (taskbarTasksFlyoutTimer) clearInterval(taskbarTasksFlyoutTimer);
            taskbarTasksFlyoutTimer = setInterval(() => {
                if (taskbarTasksFlyoutOpen) refreshTasksData();
            }, 8000);
        }

        function openTasksManagerWindow() {
            closeTaskbarTasksFlyout();
            if (globalThis.ProxPanelDesktop) {
                ProxPanelDesktop.launchApp('tasks');
            }
        }

        function setupTaskbarTasksFlyout() {
            if (document.body.dataset.taskbarTasksBound === '1') return;
            document.body.dataset.taskbarTasksBound = '1';

            document.getElementById('taskbar-tasks')?.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleTaskbarTasksFlyout();
            });

            document.getElementById('taskbar-tasks-refresh')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                await refreshTasksData();
            });

            document.getElementById('taskbar-tasks-flyout')?.addEventListener('click', (e) => {
                e.stopPropagation();
                const detailBtn = e.target.closest('[data-task-flyout-details]');
                if (detailBtn?.dataset.upid) {
                    openTaskDetailWindow(detailBtn.dataset.upid, detailBtn.dataset.node);
                    return;
                }
                if (e.target.closest('.taskbar-flyout-foot [data-task-flyout-open-app]')) {
                    openTasksManagerWindow();
                    return;
                }
                const stopBtn = e.target.closest('[data-task-flyout-stop]');
                if (stopBtn) {
                    stopTask(stopBtn.dataset.taskFlyoutStop, stopBtn.dataset.taskFlyoutNode);
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && taskbarTasksFlyoutOpen) {
                    closeTaskbarTasksFlyout();
                }
            });

            document.addEventListener('click', (e) => {
                if (!taskbarTasksFlyoutOpen) return;
                if (e.target.closest('.taskbar-flyout-panel, #taskbar-tasks')) return;
                closeTaskbarTasksFlyout();
            });

            updateTaskbarTasksBadge();
        }

        function renderTaskbar() {
            const barApps = document.getElementById('taskbar-apps');
            if (!barApps) return;

            const taskItems = windows
                .map((w) => {
                    const isActive = w.state !== 'minimized';
                    const isMinimized = w.state === 'minimized';
                    const winKey = w.winKey || resolveWinKey(w.id);
                    let icon = 'fa-window-maximize';
                    if (w.kind === 'console') icon = w.type === 'vm' ? 'fa-desktop' : 'fa-terminal';
                    else if (w.kind === 'config') icon = 'fa-sliders';
                    else if (w.icon) icon = w.icon;
                    const { short, full } = getTaskbarWindowLabel(w);
                    const label = escWinHtml(short);
                    const title = escWinHtml(full);
                    const stateClass = isMinimized ? 'minimized' : isActive ? 'active' : '';
                    return `
                    <div class="task-item ${stateClass}" data-task-win-key="${escWinHtml(winKey)}" title="${title}">
                        <i class="fa-solid ${icon} task-item-icon"></i>
                        <span class="task-item-label">${label}</span>
                        <span class="task-item-state" aria-hidden="true"></span>
                    </div>`;
                })
                .join('');

            barApps.innerHTML = taskItems;

            const minBtn = document.getElementById('taskbar-minimize-all');
            if (minBtn) {
                const allMinimized = windows.length > 0 && windows.every((w) => w.state === 'minimized');
                minBtn.title = allMinimized ? 'Restaurer toutes les fenêtres' : 'Réduire toutes les fenêtres';
                minBtn.innerHTML = `<i class="fa-solid ${allMinimized ? 'fa-window-restore' : 'fa-angles-down'}"></i>`;
                minBtn.onclick = () => minimizeAllWindows();
            }
        }

        let taskbarWindowMenuKey = null;

        function hideTaskbarWindowMenu() {
            const menu = document.getElementById('taskbar-window-menu');
            if (menu) menu.hidden = true;
            taskbarWindowMenuKey = null;
        }

        function showTaskbarWindowMenu(x, y, winKey) {
            const menu = document.getElementById('taskbar-window-menu');
            if (!menu || !winKey) return;
            taskbarWindowMenuKey = winKey;
            menu.innerHTML = `
                <button type="button" data-taskbar-win-action="restore"><i class="fa-solid fa-up-right-and-down-left-from-center"></i> Réinitialiser la position</button>
                <div class="desktop-ctx-divider"></div>
                <button type="button" data-taskbar-win-action="close" class="taskbar-ctx-danger"><i class="fa-solid fa-xmark"></i> Fermer la fenêtre</button>`;
            menu.hidden = false;
            menu.style.left = `${x}px`;
            menu.style.top = `${y}px`;
            requestAnimationFrame(() => {
                const rect = menu.getBoundingClientRect();
                let left = x;
                let top = y - rect.height;
                if (top < 8) top = y;
                if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
                menu.style.left = `${Math.max(8, left)}px`;
                menu.style.top = `${Math.max(8, top)}px`;
            });
        }

        function getDefaultWindowRect(winObj, winKey) {
            const layer = document.getElementById('window-layer');
            const layerRect = layer?.getBoundingClientRect();
            const maxW = layerRect?.width || window.innerWidth;
            const maxH = (layerRect?.height || window.innerHeight) - 8;

            let width = 900;
            let height = 600;
            let left = 56;
            let top = 32;

            if (winObj?.kind === 'app' && winObj.appId) {
                const app = globalThis.ProxPanelAppRegistry?.getApp?.(winObj.appId);
                width = app?.defaultRect?.width || 900;
                height = app?.defaultRect?.height || 600;
                const appIndex = windows.filter((w) => w.kind === 'app').findIndex((w) => w.winKey === winKey);
                const offset = Math.max(0, appIndex) * 26;
                left = 56 + offset;
                top = 32 + offset;
            } else if (winObj?.kind === 'config') {
                width = 960;
                height = 720;
                const idx = windows.findIndex((w) => w.winKey === winKey);
                left = 80 + Math.max(0, idx) * 24;
                top = 48 + Math.max(0, idx) * 24;
            } else if (winObj?.kind === 'console') {
                const winEl = document.getElementById(`win-${winKey}`);
                width = parseFloat(winEl?.style.width) || 1024;
                height = parseFloat(winEl?.style.height) || 640;
                if (!winEl?.style.width) { width = 1024; height = 640; }
                const idx = windows.findIndex((w) => w.winKey === winKey);
                left = 50 + Math.max(0, idx) * 30;
                top = 50 + Math.max(0, idx) * 30;
            }

            width = Math.min(width, maxW - 16);
            height = Math.min(height, maxH - 16);
            left = Math.max(8, Math.min(left, maxW - width - 8));
            top = Math.max(8, Math.min(top, maxH - height - 8));

            return {
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
            };
        }

        function resetWindowPosition(winKey) {
            const key = resolveWinKey(winKey);
            const winObj = windows.find((w) => w.winKey === key);
            const winEl = document.getElementById(`win-${key}`);
            if (!winObj || !winEl) return;

            const rect = getDefaultWindowRect(winObj, key);
            if (globalThis.ProxPanelWindowManager) {
                ProxPanelWindowManager.applyRect(winEl, rect);
            } else {
                winEl.classList.remove('maximized');
                winEl.style.left = rect.left;
                winEl.style.top = rect.top;
                winEl.style.width = rect.width;
                winEl.style.height = rect.height;
            }
            winObj.savedRect = { ...rect };
            if (winObj.state === 'minimized') {
                restoreWindow(key);
            } else {
                focusWindow(`win-${key}`);
            }
            saveWindowsToLocalStorage();
        }

        function setupTaskbarWindowMenu() {
            if (document.body.dataset.taskbarWinMenuBound === '1') return;
            document.body.dataset.taskbarWinMenuBound = '1';

            const barApps = document.getElementById('taskbar-apps');
            barApps?.addEventListener('contextmenu', (e) => {
                const item = e.target.closest('.task-item[data-task-win-key]');
                if (!item) return;
                e.preventDefault();
                e.stopPropagation();
                hideTaskbarWindowMenu();
                hideContextMenu();
                const winKey = item.dataset.taskWinKey;
                showTaskbarWindowMenu(e.clientX, e.clientY, winKey);
            });

            barApps?.addEventListener('click', (e) => {
                const item = e.target.closest('.task-item[data-task-win-key]');
                if (!item) return;
                if (e.button !== 0) return;
                const winKey = item.dataset.taskWinKey;
                const winObj = windows.find((w) => w.winKey === winKey);
                const isActive = winObj && winObj.state !== 'minimized';
                if (isActive) minimizeWindow(winKey);
                else restoreWindow(winKey);
            });

            document.getElementById('taskbar-window-menu')?.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-taskbar-win-action]');
                if (!btn || !taskbarWindowMenuKey) return;
                const action = btn.dataset.taskbarWinAction;
                const key = taskbarWindowMenuKey;
                hideTaskbarWindowMenu();
                if (action === 'restore') resetWindowPosition(key);
                else if (action === 'close') closeWindow(key);
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') hideTaskbarWindowMenu();
            });

            document.addEventListener('click', (e) => {
                if (!e.target.closest('#taskbar-window-menu')) hideTaskbarWindowMenu();
            });
        }

        function hideContextMenu() {
            const menu = document.getElementById('desktop-context-menu');
            if (menu) menu.hidden = true;
        }

        function startDrag(e, winId) {
            ProxPanelWindowManager.startDrag(e, winId);
        }

        function handleDoubleClick(e, winId) {
            ProxPanelWindowManager.handleDoubleClick(e, winId);
        }

        // --- CONFIG MODAL LOGIC ---
        let guestConfigEditor = null;

        function findVmCardEl(vmId, node) {
            if (node) {
                return document.querySelector(`.card[data-vmid="${vmId}"][data-node="${node}"]`);
            }
            return document.querySelector(`.card[data-vmid="${vmId}"]`);
        }

        function setCardMenuOpen(vmId, node, open) {
            const card = findVmCardEl(vmId, node);
            if (card) card.classList.toggle('card-menu-open', open);
        }

        function closeAllCardMenus() {
            document.querySelectorAll('.power-actions-dropdown.show, .vm-actions-dropdown.show').forEach((menu) => {
                menu.classList.remove('show');
            });
            document.querySelectorAll('.card.card-menu-open').forEach((c) => c.classList.remove('card-menu-open'));
        }

        async function openConfig(id, nodeName) {
            const vm = nodeName
                ? machines.find(m => m.id === id && m.node === nodeName)
                : machines.find(m => m.id === id);
            if (!vm) return;

            const winKey = `config-${id}`;
            const existing = windows.find((w) => w.winKey === winKey);
            if (existing) {
                restoreWindow(winKey);
                return;
            }

            const layer = document.getElementById('window-layer');
            if (!layer) return;

            const title = `Configuration ${vm.type === 'lxc' ? 'LXC' : 'VM'} - ${vm.name || id}`;
            const winEl = document.createElement('div');
            winEl.className = 'window window-config';
            winEl.id = `win-${winKey}`;
            winEl.style.zIndex = ++zIndexCounter;
            const offset = windows.length;
            winEl.style.left = `${80 + offset * 24}px`;
            winEl.style.top = `${48 + offset * 24}px`;
            winEl.style.width = '960px';
            winEl.style.height = '720px';
            winEl.innerHTML = `
                <div class="win-header" onmousedown="startDrag(event, 'win-${winKey}')" ondblclick="handleDoubleClick(event, 'win-${winKey}')">
                    <div class="win-title"><i class="fa-solid fa-sliders"></i> ${escWinHtml(title)}</div>
                    <div class="win-controls">
                        <button type="button" onclick="minimizeWindow('${winKey}')"><i class="fa-solid fa-minus"></i></button>
                        <button type="button" onclick="maximizeWindow('${winKey}')"><i class="fa-regular fa-square"></i></button>
                        <button class="win-close" onclick="closeWindow('${winKey}')"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </div>
                <div class="win-content" onclick="focusWindow('win-${winKey}')">
                    <input type="hidden" class="cfg-vmid" value="${id}">
                    <input type="hidden" class="cfg-vmnode" value="${escWinHtml(vm.node || '')}">
                    <input type="hidden" class="cfg-vmtype" value="${escWinHtml(vm.type || 'vm')}">
                    <div class="config-window-body config-editor-root">
                        <p style="padding:2rem;text-align:center;color:#6b7280;">Chargement…</p>
                    </div>
                    <div class="config-window-footer">
                        <button type="button" onclick="saveConfig()" class="btn-save-config">Sauvegarder</button>
                        <button type="button" onclick="closeWindow('${winKey}')" class="btn-cancel-config">Annuler</button>
                    </div>
                </div>`;
            layer.appendChild(winEl);
            if (globalThis.ProxPanelWindowManager) {
                ProxPanelWindowManager.decorate(winEl, winKey);
            }
            windows.push({
                winKey,
                kind: 'config',
                id,
                name: vm.name || `VM ${id}`,
                type: vm.type,
                icon: 'fa-sliders',
                state: 'normal',
                node: vm.node,
                layoutMode: 'floating',
            });
            renderTaskbar();
            new ResizeObserver(() => saveWindowsToLocalStorage()).observe(winEl);

            const root = winEl.querySelector('.config-editor-root');
            root.innerHTML = '<p style="padding:2rem;text-align:center;color:#6b7280;">Chargement...</p>';

            let rawConfig = {};
            let storageList = [];
            let systemOptions = {};

            if (isProduction && userLoggedInProxmox) {
                try {
                    const configParams = new URLSearchParams({
                        action: 'vm-config',
                        vmid: String(vm.id),
                        node: vm.node || '',
                        type: vm.type || 'vm',
                    });
                    const optionsParams = new URLSearchParams({
                        action: 'config-options',
                        node: vm.node || '',
                    });
                    const [configRes, storageData, optionsRes] = await Promise.all([
                        fetch(`/api/data?${configParams.toString()}`).then((r) => r.json()),
                        loadProxmoxData('storage'),
                        fetch(`/api/data?${optionsParams.toString()}`).then((r) => r.json()),
                    ]);
                    if (configRes.config) rawConfig = configRes.config;
                    storageList = storageData?.storage || [];
                    systemOptions = optionsRes?.error ? {} : optionsRes;
                } catch (err) {
                    console.error('Erreur chargement config:', err);
                    showNotification('Erreur lors du chargement de la configuration', 'error');
                }
            } else {
                rawConfig = {
                    cores: String(vm.config?.cores || vm.config?.vcpu || 2),
                    memory: String(vm.config?.memory || 4096),
                    onboot: vm.config?.autostart ? '1' : '0',
                    boot: vm.config?.bootOrder || 'order=scsi0',
                };
                storageList = Object.keys(storages).map((name) => ({ name }));
                systemOptions = {};
            }

            if (typeof GuestConfigEditor === 'undefined') {
                root.innerHTML = '<p style="color:#ef4444;">Éditeur de configuration indisponible.</p>';
                return;
            }

            guestConfigEditor = new GuestConfigEditor(root);
            await guestConfigEditor.load(rawConfig, vm.type, vm, storageList, systemOptions);
        }

        function closeModal() {
            document.getElementById('config-modal')?.classList.remove('active');
        }

        async function saveConfig() {
            const wrap = guestConfigEditor?.root?.closest('.window-config');
            const id = parseInt(wrap?.querySelector('.cfg-vmid')?.value || '0', 10);
            const node = wrap?.querySelector('.cfg-vmnode')?.value || '';
            const vm = machines.find(m => m.id === id && (!node || m.node === node));
            if (!vm || !guestConfigEditor) return;

            guestConfigEditor.syncFromDom();
            const configJson = guestConfigEditor.collect();

            if (isProduction && userLoggedInProxmox) {
                const body = new FormData();
                body.append('vmid', String(id));
                body.append('node', vm.node);
                body.append('type', vm.type || 'vm');
                body.append('configJson', JSON.stringify(configJson));

                try {
                    const response = await fetch('/api/data?action=vm-config-update', {
                        method: 'POST',
                        body,
                    });
                    const data = await response.json();
                    if (data.success) {
                        showNotification(data.message || 'Configuration sauvegardée', 'success');
                        closeWindow(`config-${id}`);
                        await refreshVMData();
                        if (selectedVM && selectedVM.id === vm.id && selectedVM.node === vm.node) {
                            loadVMDetails(vm);
                        }
                    } else {
                        showNotification(data.message || 'Erreur lors de la sauvegarde', 'error');
                    }
                } catch (err) {
                    showNotification('Erreur réseau lors de la sauvegarde', 'error');
                }
                return;
            }

            showNotification(`Configuration sauvegardée pour ${vm.name}`, 'success');
            closeWindow(`config-${id}`);
        }

        async function togglePower(id) {
            const vm = machines.find(m => m.id === id);
            if (!vm) {
                showNotification('VM non trouvée', 'error');
                return;
            }

            const wasRunning = vm.status === 'running';
            const action = wasRunning ? 'stop' : 'start';

            // Appeler l'API Proxmox pour démarrer/arrêter la VM
            await vmAction(action, vm.id, vm.node, vm.type);
        }

        // --- TOOLS MENU ---
        function openToolsMenu(tool) {
            const menu = document.getElementById('tools-menu');
            const title = document.getElementById('tools-menu-title');
            const content = document.getElementById('tools-menu-content');

            menu.classList.add('active');

            if (tool === 'vmid') {
                title.textContent = 'Changer VMID';
                content.innerHTML = `
                    <form onsubmit="event.preventDefault(); changeVMID();">
                        <div class="form-group">
                            <label>VM à modifier</label>
                            <select id="tools-vm-select" class="form-control" required>
                                <option value="">Sélectionner une VM...</option>
                                ${machines.map(vm => `<option value="${vm.id}">${vm.name} (ID: ${vm.id})</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Nouveau VMID</label>
                            <input type="number" id="tools-new-vmid" class="form-control" min="100" max="999999" required>
                            <small style="color: #6b7280; font-size: 0.75rem;">Le nouveau VMID doit être unique (100-999999)</small>
                        </div>
                        <div style="display:flex; gap:10px; margin-top:1.5rem;">
                            <button type="submit" style="flex:1; padding:10px; background:var(--accent); color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Changer</button>
                            <button type="button" onclick="closeToolsMenu()" style="padding:10px 20px; background:#f3f4f6; color:#374151; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Annuler</button>
                        </div>
                    </form>
                `;
            }
        }

        function closeToolsMenu() {
            document.getElementById('tools-menu').classList.remove('active');
        }

        function changeVMID() {
            if (!userPermissions.vmid) {
                alert('Vous n\'avez pas les permissions pour changer le VMID.');
                return;
            }

            const oldId = parseInt(document.getElementById('tools-vm-select').value);
            const newId = parseInt(document.getElementById('tools-new-vmid').value);

            const node = clusterNodes.find(n => n.id === currentNodeId);
            const vm = node.machines.find(m => m.id === oldId);
            const existingVM = node.machines.find(m => m.id === newId);

            if (!vm) {
                alert('VM non trouvée.');
                return;
            }

            if (existingVM) {
                alert(`Le VMID ${newId} est déjà utilisé par ${existingVM.name}.`);
                return;
            }

            vm.id = newId;
            machines = [...node.machines];
            alert(`VMID changé : ${oldId} -> ${newId} pour ${vm.name}`);
            closeToolsMenu();
            renderGrid();
        }

        // --- BACKUPS MANAGEMENT ---
        function openBackups(vmId) {
            const vm = machines.find(m => m.id === vmId);
            if (!vm) return;

            document.getElementById('backups-modal').classList.add('active');
            document.getElementById('backup-vm-name').textContent = vm.name;
            document.getElementById('backup-vm-name').setAttribute('data-vmid', vmId);

            renderBackupsList(vmId);
        }

        function closeBackupsModal() {
            document.getElementById('backups-modal').classList.remove('active');
        }

        function renderBackupsList(vmId) {
            const vm = machines.find(m => m.id === vmId);
            if (!vm) return;

            const backups = vm.backups || [];
            const listContainer = document.getElementById('backups-list');

            if (backups.length === 0) {
                listContainer.innerHTML = `
                    <div style="text-align: center; padding: 3rem; color: #6b7280;">
                        <i class="fa-solid fa-floppy-disk" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                        <p>Aucune sauvegarde disponible</p>
                    </div>
                `;
                return;
            }

            listContainer.innerHTML = backups.map(backup => {
                // Handle both Date objects and date strings
                let dateObj = backup.date;
                if (typeof dateObj === 'string') {
                    dateObj = new Date(dateObj);
                }
                const dateStr = dateObj.toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                const statusIcon = backup.status === 'completed' ? 'fa-circle-check' : 'fa-circle-exclamation';
                const statusColor = backup.status === 'completed' ? '#10b981' : '#f59e0b';

                return `
                    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; transition: transform 0.2s;" onmouseover="this.style.transform='translateX(-2px)'; this.style.boxShadow='0 4px 6px rgba(0,0,0,0.1)'" onmouseout="this.style.transform=''; this.style.boxShadow=''">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: ${backup.note ? '8px' : '0'};">
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                                    <i class="fa-solid ${statusIcon}" style="color: ${statusColor};"></i>
                                    <span style="font-weight: 600;">${dateStr}</span>
                                </div>
                                <div style="font-size: 0.85rem; color: #6b7280;">
                                    <span><i class="fa-solid fa-database"></i> ${backup.storage}</span>
                                    <span style="margin-left: 15px;"><i class="fa-solid fa-hard-drive"></i> ${backup.size}</span>
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button onclick="editBackupNote(${vmId}, '${backup.id}')" style="padding: 6px 12px; background: #f3f4f6; color: #374151; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; transition: background 0.2s;" title="Note" onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f3f4f6'">
                                    <i class="fa-solid fa-note-sticky"></i>
                                </button>
                                <button onclick="restoreBackup(${vmId}, '${backup.id}')" style="padding: 6px 12px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; transition: background 0.2s;" title="Restaurer" onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='var(--primary)'">
                                    <i class="fa-solid fa-rotate-left"></i>
                                </button>
                                <button onclick="deleteBackup(${vmId}, '${backup.id}')" style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; transition: background 0.2s;" title="Supprimer" onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        ${backup.note ? `<div style="font-size: 0.8rem; color: #6b7280; padding: 8px; background: #fef3c7; border-radius: 4px; margin-top: 8px; border-left: 3px solid #f59e0b;"><i class="fa-solid fa-note-sticky"></i> ${backup.note}</div>` : ''}
                    </div>
                `;
            }).join('');
        }

        function createBackup() {
            const vmId = parseInt(document.getElementById('backup-vm-name').getAttribute('data-vmid'));
            const storage = document.getElementById('backup-storage-select').value;
            const vm = machines.find(m => m.id === vmId);

            if (!vm) return;

            if (!vm.backups) vm.backups = [];

            const newBackup = {
                id: 'b' + Date.now(),
                date: new Date(),
                size: (Math.random() * 50 + 5).toFixed(1) + ' GB',
                storage: storage,
                status: 'completed'
            };

            vm.backups.unshift(newBackup);

            // Update in cluster data
            const node = clusterNodes.find(n => n.machines.some(m => m.id === vmId));
            if (node) {
                const clusterVM = node.machines.find(m => m.id === vmId);
                if (clusterVM) clusterVM.backups = vm.backups;
            }

            renderBackupsList(vmId);

            // Show feedback
            showNotification(`Sauvegarde créée pour ${vm.name}`, 'success');
        }

        function restoreBackup(vmId, backupId) {
            const vm = machines.find(m => m.id === vmId);
            if (!vm) return;

            if (confirm(`Voulez-vous vraiment restaurer cette sauvegarde pour ${vm.name} ?\nLa VM sera arrêtée pendant la restauration.`)) {
                showNotification(`Restauration de ${vm.name} en cours...`, 'info');
                setTimeout(() => {
                    showNotification(`${vm.name} restauré avec succès`, 'success');
                }, 2000);
            }
        }

        function deleteBackup(vmId, backupId) {
            const vm = machines.find(m => m.id === vmId);
            if (!vm) return;

            if (confirm('Voulez-vous vraiment supprimer cette sauvegarde ?')) {
                vm.backups = vm.backups.filter(b => b.id !== backupId);

                // Update in cluster data
                const node = clusterNodes.find(n => n.machines.some(m => m.id === vmId));
                if (node) {
                    const clusterVM = node.machines.find(m => m.id === vmId);
                    if (clusterVM) clusterVM.backups = vm.backups;
                }

                renderBackupsList(vmId);
                showNotification('Sauvegarde supprimée', 'success');
            }
        }

        // --- ACTIONS MENU MANAGEMENT ---
        function toggleActionsMenu(vmId, event) {
            event.stopPropagation();
            const menuId = `actions-menu-${vmId}`;
            const menu = document.getElementById(menuId);
            if (!menu) return;
            const card = event.currentTarget.closest('.card');
            const node = card?.dataset?.node || '';

            const wasOpen = menu.classList.contains('show');
            closeAllCardMenus();

            if (!wasOpen) {
                menu.classList.add('show');
                setCardMenuOpen(vmId, node, true);
            }
        }

        function closeActionsMenu(vmId) {
            const menu = document.getElementById(`actions-menu-${vmId}`);
            if (menu) menu.classList.remove('show');
            const card = findVmCardEl(vmId);
            if (card) card.classList.remove('card-menu-open');
        }

        function togglePowerMenu(vmId, event) {
            event.stopPropagation();
            const menuId = `power-menu-${vmId}`;
            const menu = document.getElementById(menuId);
            if (!menu) return;
            const card = event.currentTarget.closest('.card');
            const node = card?.dataset?.node || '';

            const wasOpen = menu.classList.contains('show');
            closeAllCardMenus();

            if (!wasOpen) {
                menu.classList.add('show');
                setCardMenuOpen(vmId, node, true);
            }
        }

        function closePowerMenu(vmId) {
            const menu = document.getElementById(`power-menu-${vmId}`);
            if (menu) menu.classList.remove('show');
            const card = findVmCardEl(vmId);
            if (card) card.classList.remove('card-menu-open');
        }

        // Close all action menus when clicking outside
        document.addEventListener('click', function (e) {
            if (!e.target.closest('.vm-actions-menu') && !e.target.closest('.vm-actions-dropdown')) {
                document.querySelectorAll('.vm-actions-dropdown.show').forEach(menu => {
                    menu.classList.remove('show');
                });
            }
            if (!e.target.closest('.power-split') && !e.target.closest('.power-actions-dropdown')) {
                document.querySelectorAll('.power-actions-dropdown.show').forEach(menu => {
                    menu.classList.remove('show');
                });
            }
            if (!e.target.closest('.vm-actions-menu') && !e.target.closest('.power-split') &&
                !e.target.closest('.vm-actions-dropdown') && !e.target.closest('.power-actions-dropdown')) {
                document.querySelectorAll('.card.card-menu-open').forEach(c => c.classList.remove('card-menu-open'));
            }
        });

        // --- NOTIFICATIONS ---
        function showNotification(message, type = 'info') {
            const notification = document.createElement('div');
            const bgColor = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6';
            notification.style.cssText = `
                position: fixed; top: 20px; right: 20px; z-index: 4000;
                background: ${bgColor}; color: white; padding: 12px 20px;
                border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                display: flex; align-items: center; gap: 10px;
                animation: slideIn 0.3s ease-out;
            `;
            notification.innerHTML = `
                <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info'}"></i>
                <span>${message}</span>
            `;
            document.body.appendChild(notification);

            setTimeout(() => {
                notification.style.animation = 'slideOut 0.3s ease-out';
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }

        // --- VM MANAGEMENT FUNCTIONS ---
        async function cloneVM(vmId) {
            const vm = machines.find(m => m.id === vmId);
            if (!vm) return;

            // Vérifier que c'est un template - seuls les templates peuvent être clonés
            if (!vm.template) {
                showNotification('Seuls les modèles (templates) peuvent être clonés', 'error');
                return;
            }

            const newNode = prompt(`Cloner ${vm.name} vers quel nœud ?\n(Entrez le nom du nœud ou laissez vide pour le même nœud)`);
            if (newNode === null) return;

            const targetNodeId = newNode || vm.node;
            const targetNode = clusterNodes.find(n => n.id === targetNodeId || n.name === targetNodeId);

            if (!targetNode) {
                showNotification('Nœud non trouvé', 'error');
                return;
            }

            // Find next available ID
            let newId = Math.max(...clusterNodes.flatMap(n => n.machines.map(m => m.id)), 99) + 1;
            while (clusterNodes.some(n => n.machines.some(m => m.id === newId))) {
                newId++;
            }

            const cloneName = prompt(`Nom de la VM clonée :`, `${vm.name}-clone`);
            if (!cloneName) return;

            // Si en production, utiliser l'API Proxmox pour cloner
            if (isProduction && userLoggedInProxmox) {
                try {
                    const formData = new FormData();
                    formData.append('vmid', vm.id);
                    formData.append('newid', newId);
                    formData.append('node', vm.node);
                    formData.append('target', targetNodeId);
                    formData.append('name', cloneName);
                    formData.append('linked', '1'); // Linked clone uniquement pour les templates
                    formData.append('type', vm.type);

                    const response = await fetch(`/api/data?action=clone`, {
                        method: 'POST',
                        body: formData
                    });

                    const result = await response.json();

                    if (result.success) {
                        showNotification(`${vm.name} clonée avec succès vers ${targetNode.name}`, 'success');
                        // Rafraîchir les données pour voir la nouvelle VM
                        await refreshVMData();
                    } else {
                        showNotification(result.message || 'Erreur lors du clonage', 'error');
                    }
                } catch (error) {
                    console.error('Erreur lors du clonage:', error);
                    showNotification('Erreur lors du clonage', 'error');
                }
            } else {
                // Mode dev - simulation
                const clonedVM = {
                    ...vm,
                    id: newId,
                    name: cloneName,
                    node: targetNode.id,
                    status: 'stopped',
                    cpu: 0,
                    ram: 0,
                    disk: vm.type === 'lxc' ? vm.disk : 0,
                    ip: `192.168.1.${newId}`,
                    backups: [],
                    note: '',
                    template: false // Les clones ne sont pas des templates
                };

                targetNode.machines.push(clonedVM);

                if (currentNodeId === 'all' || currentNodeId === targetNode.id) {
                    machines = currentNodeId === 'all'
                        ? clusterNodes.flatMap(n => n.machines || [])
                        : targetNode.machines;
                    filteredMachines = [...machines];
                    renderGrid();
                }

                showNotification(`${vm.name} clonée vers ${targetNode.name}`, 'success');
            }
        }

        function editVMName(vmId) {
            const vm = machines.find(m => m.id === vmId);
            if (!vm) return;

            const newName = prompt(`Renommer ${vm.name}:`, vm.name);
            if (!newName || newName === vm.name) return;

            vm.name = newName;

            // Update in cluster data
            const node = clusterNodes.find(n => n.machines.some(m => m.id === vmId));
            if (node) {
                const clusterVM = node.machines.find(m => m.id === vmId);
                if (clusterVM) clusterVM.name = newName;
            }

            renderGrid();
            showNotification(`VM renommée : ${newName}`, 'success');
        }

        function editVMNote(vmId) {
            const vm = machines.find((m) => m.id === vmId);
            if (!vm) return;

            openNotesEditorWindow({
                winKey: `notes-card-${vmId}`,
                title: `Note - ${vm.name}`,
                initialText: vm.note || '',
                hint: 'Note locale sur la carte VM (texte libre, plusieurs lignes).',
                onSave: async (text) => {
                    vm.note = text ?? '';
                    const node = clusterNodes.find((n) => n.machines.some((m) => m.id === vmId));
                    if (node) {
                        const clusterVM = node.machines.find((m) => m.id === vmId);
                        if (clusterVM) clusterVM.note = vm.note;
                    }
                    renderGrid();
                    if (vm.note) {
                        showNotification('Note enregistrée', 'success');
                    } else {
                        showNotification('Note supprimée', 'info');
                    }
                    return true;
                },
            });
        }

        function deleteVM(vmId) {
            const vm = machines.find(m => m.id === vmId);
            if (!vm) return;

            if (!confirm(`Voulez-vous vraiment supprimer ${vm.name} (ID: ${vm.id}) ?\nCette action est irréversible.`)) {
                return;
            }

            // Find and remove from cluster
            const node = clusterNodes.find(n => n.machines.some(m => m.id === vmId));
            if (node) {
                node.machines = node.machines.filter(m => m.id !== vmId);
            }

            // Update current view
            machines = machines.filter(m => m.id !== vmId);
            filteredMachines = filteredMachines.filter(m => m.id !== vmId);

            renderGrid();
            showNotification(`${vm.name} supprimée`, 'success');
        }

        function editBackupNote(vmId, backupId) {
            const vm = machines.find((m) => m.id === vmId);
            if (!vm) return;

            const backup = vm.backups.find((b) => b.id === backupId);
            if (!backup) return;

            openNotesEditorWindow({
                winKey: `notes-backup-${vmId}-${String(backupId).replace(/[^a-zA-Z0-9]/g, '_')}`,
                title: `Note sauvegarde - ${vm.name}`,
                initialText: backup.note || '',
                hint: 'Commentaire associé à cette sauvegarde (multiligne).',
                onSave: async (text) => {
                    backup.note = text ?? '';
                    const node = clusterNodes.find((n) => n.machines.some((m) => m.id === vmId));
                    if (node) {
                        const clusterVM = node.machines.find((m) => m.id === vmId);
                        if (clusterVM) {
                            const clusterBackup = clusterVM.backups.find((b) => b.id === backupId);
                            if (clusterBackup) clusterBackup.note = backup.note;
                        }
                    }
                    renderBackupsList(vmId);
                    if (backup.note) {
                        showNotification('Note enregistrée sur la sauvegarde', 'success');
                    } else {
                        showNotification('Note supprimée', 'info');
                    }
                    return true;
                },
            });
        }

        // Exposer les handlers utilisés dans index.html (script module = pas de scope global)
        window.handleLogin = handleLogin;
        window.handleProxmoxUrlValidation = handleProxmoxUrlValidation;
        window.showProxmoxUrlInput = showProxmoxUrlInput;
        window.switchView = switchView;
        window.switchNode = switchNode;
        window.filterVMs = filterVMs;
        window.closeModal = closeModal;
        window.saveConfig = saveConfig;
        window.openConfig = openConfig;
        window.toggleActionsMenu = toggleActionsMenu;
        window.closeActionsMenu = closeActionsMenu;
        window.openBackups = openBackups;
        window.cloneVM = cloneVM;
        window.editVMName = editVMName;
        window.editVMNote = editVMNote;
        window.deleteVM = deleteVM;
        window.restoreBackup = restoreBackup;
        window.deleteBackup = deleteBackup;
        window.editBackupNote = editBackupNote;
        window.refreshNodeData = refreshNodeData;
        window.refreshStorageData = refreshStorageData;
        window.monitorSort = monitorSort;
        window.closeToolsMenu = closeToolsMenu;
        window.closeBackupsModal = closeBackupsModal;
        window.createBackup = createBackup;
        window.showUserMenu = showUserMenu;
        window.openToolsMenu = openToolsMenu;

        function onAppReady() {
            if (globalThis.ProxPanelWindowManager) {
                ProxPanelWindowManager.configure({
                    getLayer: () => document.getElementById('window-layer'),
                    getWinObj: (key) => windows.find((w) => w.winKey === key || resolveWinKey(w.id) === key),
                    onLayoutChange: () => saveWindowsToLocalStorage(),
                    focusWindow: (winId) => focusWindow(winId),
                    zIndexBump: () => ++zIndexCounter,
                });
            }

            // Ensure currentUser is set from Proxmox if logged in
            if (isProduction && userLoggedInProxmox && proxmoxUsername && !currentUser) {
                currentUser = {
                    username: proxmoxUsername,
                    name: proxmoxUsername === 'admin' ? 'Administrateur' : proxmoxUsername.charAt(0).toUpperCase() + proxmoxUsername.slice(1),
                    role: proxmoxRealm || 'pam',
                    realm: proxmoxRealm || 'pam',
                    avatar: proxmoxUsername.charAt(0).toUpperCase()
                };
                updateUserProfile();
            }

            // Check if already logged in
            // In production: check userLoggedInProxmox
            // In dev mode: check currentUser
            let isLoggedIn = false;
            if (isProduction) {
                isLoggedIn = userLoggedInProxmox === true;
            } else {
                isLoggedIn = currentUser !== null;
            }

            if (!isLoggedIn) {
                setAuthUiState(false);
            } else {
                allowProxmoxRequests = true;
                setAuthUiState(true);
                init();
            }
            
            // Auto-focus username field ou URL field selon le contexte
            setTimeout(() => {
                const urlInput = document.getElementById('proxmox-url-input');
                const usernameField = document.getElementById('login-username');
                if (urlInput && urlInput.offsetParent !== null) {
                    urlInput.focus();
                } else if (usernameField) {
                    usernameField.focus();
                }
            }, 100);

            // Allow Enter key to submit login
            document.getElementById('login-password')?.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') {
                    handleLogin();
                }
            });
            
            document.getElementById('proxmox-url-input')?.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') {
                    handleProxmoxUrlValidation();
                }
            });

            window.addEventListener('pagehide', saveWindowsBeforeUnload);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') saveWindowsBeforeUnload();
            });
        }

        // Le await bootstrap retardait l'enregistrement : DOMContentLoaded était déjà passé
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', onAppReady);
        } else {
            onAppReady();
        }

        // Boot (will be called after login)
        // init();