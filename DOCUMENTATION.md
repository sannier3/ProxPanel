# Documentation Complète - ProxPanel

> **Note :** cette documentation décrit l’ancienne version **PHP** (`legacy/php/pve.php`).  
> La version active est **Node.js** - voir [README.md](README.md), [.env.example](.env.example) et [MIGRATION.md](MIGRATION.md).

## Table des matières
1. [Architecture Générale](#architecture-générale)
2. [Endpoints API PHP](#endpoints-api-php)
3. [Pages/Vues JavaScript](#pagesvues-javascript)
4. [Flux de Données](#flux-de-données)
5. [Fonctions Principales](#fonctions-principales)
6. [Mapping Pages ↔ APIs](#mapping-pages--apis)

---

## Architecture Générale

### Structure du Fichier `pve.php`

Le fichier `pve.php` contient :
- **Partie PHP** (lignes 1-1620) : Backend API et authentification
- **Partie HTML** (lignes 1621-2477) : Structure HTML de la page
- **Partie JavaScript** (lignes 2478-6205) : Frontend et logique client

### Authentification

1. **Mode Production** (`$isProduction = true`) :
   - Authentification via Proxmox API
   - Session PHP avec ticket Proxmox
   - URL Proxmox stockée en session

2. **Mode Développement** (`$isProduction = false`) :
   - Données mockées
   - Pas d'authentification réelle

---

## Endpoints API PHP

Tous les endpoints sont accessibles via `?api=data&action={action}`

### 1. `action=resources` (ou `all`, `nodes`, `vms`)
**Endpoint Proxmox** : `GET /cluster/resources`

**Logique** :
- Récupère toutes les ressources en une seule requête
- Filtre par type : `node`, `qemu`, `lxc`, `storage`
- Retourne :
  ```json
  {
    "resources": {
      "nodes": [...],
      "vms": [...],
      "containers": [...],
      "storage": [...]
    }
  }
  ```

**Utilisé par** : Dashboard, Nodes, VMs, Storage

---

### 2. `action=nodes`
**Endpoints Proxmox** :
- `GET /cluster/resources` (si disponible)
- `GET /nodes/{node}/status/current` (pour chaque node online, en parallèle)

**Logique** :
- Utilise `resources` si disponible, sinon fallback sur `/nodes`
- Pour chaque node online, récupère les stats détaillées en parallèle
- Calcule CPU, RAM (used/total), uptime, loadavg, kversion

**Retourne** :
```json
{
  "nodes": [
    {
      "name": "pve-r730",
      "status": "online",
      "cpu": 45.2,
      "ram": {"used": 64.5, "total": 128.0},
      "uptime": 123456,
      "loadavg": [1.2, 1.5, 1.8],
      "kversion": "5.15.0",
      "maxcpu": 24,
      "maxmem": 128.0
    }
  ]
}
```

**Utilisé par** : Page Nodes, Dashboard (pour afficher les nodes)

---

### 3. `action=vms`
**Endpoints Proxmox** :
- `GET /cluster/resources` (si disponible)
- `GET /nodes/{node}/qemu/{vmid}/config` (pour chaque VM, en parallèle)
- `GET /nodes/{node}/lxc/{vmid}/config` (pour chaque container, en parallèle)

**Logique** :
- Utilise `resources` pour obtenir la liste des VMs/containers
- Récupère les configs en parallèle pour déterminer si template
- Filtre uniquement les VMs sur nodes online
- Organise par node

**Retourne** :
```json
{
  "vms": [
    {
      "vmid": 104,
      "id": 104,
      "name": "VM-104",
      "type": "vm",
      "status": "running",
      "node": "pve-r730",
      "template": false,
      "config": {...}
    }
  ],
  "nodesWithVms": [
    {
      "name": "pve-r730",
      "status": "online",
      "vms": [...]
    }
  ]
}
```

**Utilisé par** : Dashboard, Page VMs Management

---

### 4. `action=vmstats`
**Endpoints Proxmox** :
- `GET /cluster/resources` (pour obtenir la liste des VMs running)
- `GET /nodes/{node}/qemu/{vmid}/status/current` (pour chaque VM running, en parallèle)
- `GET /nodes/{node}/lxc/{vmid}/status/current` (pour chaque container running, en parallèle)

**Logique** :
- Filtre uniquement les VMs/containers avec `status === 'running'` sur nodes online
- Récupère les stats en parallèle
- Pour LXC : extrait `rootfs['used']` et `rootfs['total']` pour le disque
- Pour QEMU : utilise `disk` (pourcentage)

**Retourne** :
```json
{
  "vmstats": [
    {
      "id": 104,
      "vmid": 104,
      "node": "pve-r730",
      "type": "vm",
      "cpu": 45.2,
      "ram": 78.5,
      "disk": 12.3,
      "ip": "192.168.1.100",
      "netin": 1234567890,
      "netout": 987654321
    },
    {
      "id": 118,
      "vmid": 118,
      "node": "pve-r730",
      "type": "lxc",
      "cpu": 12.5,
      "ram": 45.8,
      "disk": 65.2,
      "diskUsed": 10485760000,
      "diskTotal": 16106127360,
      "ip": "192.168.1.101",
      "netin": 2345678901,
      "netout": 8765432109
    }
  ]
}
```

**Utilisé par** : Dashboard, Page Monitor, Page VMs Management (section Monitor)

---

### 5. `action=storage`
**Endpoints Proxmox** :
- `GET /cluster/resources` (pour obtenir la liste des storages)
- `GET /storage` (fallback)
- `GET /nodes/{node}/storage/{storage}/status` (pour chaque storage sur chaque node online, en parallèle)

**Logique** :
- Utilise `resources` pour obtenir la liste des storages
- Pour chaque storage, récupère le statut depuis chaque node online (en parallèle)
- Prend la meilleure valeur (la plus grande `total`)
- Calcule `total`, `used`, `available` en GB

**Retourne** :
```json
{
  "storage": [
    {
      "name": "local",
      "type": "dir",
      "active": 1,
      "enabled": 1,
      "total": 500.0,
      "used": 250.0,
      "available": 250.0
    }
  ]
}
```

**Utilisé par** : Page Storage

---

### 6. `action=console`
**Paramètres** : `vmid`, `node`, `type` (vm/lxc)

**Logique** :
- Retourne simplement l'URL Proxmox et les paramètres
- Le client construit l'URL de console native Proxmox

**Retourne** :
```json
{
  "console": {
    "type": "vm",
    "node": "pve-r730",
    "vmid": 104,
    "proxmoxUrl": "https://proxmox.jbsan.fr"
  }
}
```

**Utilisé par** : Fonction `openConsole()` pour ouvrir la console dans une fenêtre

---

### 7. `action=tasks`
**Endpoints Proxmox** :
- `GET /cluster/resources` (pour obtenir la liste des nodes)
- `GET /nodes/{node}/tasks` (pour chaque node online, en parallèle)

**Logique** :
- Récupère les tâches de tous les nodes online en parallèle
- Combine et trie par `starttime` (plus récentes en premier)

**Retourne** :
```json
{
  "tasks": [
    {
      "upid": "UPID:pve-r730:00001234:12345678:ABCDEFGH:task:clone:root@pam:",
      "type": "clone",
      "status": "running",
      "starttime": 1234567890,
      "user": "root@pam",
      "node": "pve-r730"
    }
  ]
}
```

**Utilisé par** : Page Tasks

---

### 8. `action=task-stop`
**Endpoint Proxmox** : `DELETE /nodes/{node}/tasks/{upid}`

**Paramètres** : `upid`, `node`

**Logique** :
- Arrête une tâche en cours

**Retourne** :
```json
{
  "success": true,
  "message": "Tâche arrêtée avec succès"
}
```

**Utilisé par** : Page Tasks (bouton "Arrêter")

---

### 9. `action=task-details`
**Endpoints Proxmox** :
- `GET /nodes/{node}/tasks/{upid}/status`
- `GET /nodes/{node}/tasks/{upid}/log`

**Paramètres** : `upid`, `node`

**Logique** :
- Récupère le statut et les logs d'une tâche

**Retourne** :
```json
{
  "task": {
    "status": {...},
    "log": [...]
  }
}
```

**Utilisé par** : Page Tasks (affichage des détails)

---

### 10. `action=vm-action`
**Endpoint Proxmox** : `POST /nodes/{node}/qemu/{vmid}/{action}` ou `POST /nodes/{node}/lxc/{vmid}/{action}`

**Actions** : `start`, `stop`, `restart`, `shutdown`, `suspend`, `resume`

**Paramètres POST** : `vmid`, `node`, `type`, `action`

**Logique** :
- Exécute une action sur une VM/container
- Retourne l'UPID de la tâche créée

**Retourne** :
```json
{
  "success": true,
  "message": "Action start exécutée avec succès",
  "task": {...}
}
```

**Utilisé par** : Page VMs Management (boutons d'action)

---

### 11. `action=vm-config`
**Endpoint Proxmox** : `GET /nodes/{node}/qemu/{vmid}/config` ou `GET /nodes/{node}/lxc/{vmid}/config`

**Paramètres** : `vmid`, `node`, `type`

**Logique** :
- Récupère la configuration complète d'une VM/container

**Retourne** :
```json
{
  "config": {
    "memory": 4096,
    "cores": 2,
    "net0": "virtio=...",
    ...
  }
}
```

**Utilisé par** : Page VMs Management (section Configuration)

---

### 12. `action=vm-notes`
**Endpoints Proxmox** :
- `GET /nodes/{node}/qemu/{vmid}/config` (pour récupérer)
- `PUT /nodes/{node}/qemu/{vmid}/config` (pour mettre à jour)

**Paramètres** :
- GET : `vmid`, `node`, `type`
- POST : `vmid`, `node`, `type`, `notes`

**Logique** :
- GET : Extrait `description` de la config
- POST : Met à jour `description` dans la config

**Retourne** :
```json
{
  "notes": "Notes HTML de la VM"
}
```
ou
```json
{
  "success": true,
  "message": "Notes mises à jour avec succès"
}
```

**Utilisé par** : Page VMs Management (section Notes)

---

### 13. `action=clone`
**Endpoint Proxmox** : `POST /nodes/{node}/qemu/{vmid}/clone` ou `POST /nodes/{node}/lxc/{vmid}/clone`

**Paramètres POST** : `vmid`, `newid`, `node`, `target`, `name`, `linked`, `type`

**Logique** :
- Clone une VM/container (linked clone uniquement pour templates)

**Retourne** :
```json
{
  "success": true,
  "message": "VM clonée avec succès (linked clone)",
  "task": {...}
}
```

**Utilisé par** : Dashboard (menu contextuel "Cloner")

---

## Pages/Vues JavaScript

### 1. Dashboard (`switchView('dashboard')`)
**Fonction** : `getDashboardView()`

**APIs utilisées** :
- `loadProxmoxData('resources')` → `action=resources`
- `loadProxmoxData('vmstats')` → `action=vmstats`

**Fonctions JavaScript** :
- `refreshVMData()` : Charge `resources` et met à jour `machines` et `clusterNodes`
- `refreshVMStats()` : Charge `vmstats` et met à jour les stats des machines
- `renderGrid()` : Affiche la grille de VMs/containers
- `filterVMs()` : Filtre la grille par nom, type, statut

**Rafraîchissement automatique** :
- `refreshNodeData()` : Toutes les 10 secondes
- `refreshVMStats()` : Toutes les 20 secondes

**Fonctionnalités** :
- Affichage de toutes les VMs/containers en grille
- Filtres par nom, type, statut
- Actions : Console, Démarrer, Arrêter, Redémarrer, Cloner
- Affichage des stats : CPU, RAM, Disque, Statut

---

### 2. Nodes (`switchView('nodes')`)
**Fonction** : `getNodesView()`

**APIs utilisées** :
- `loadProxmoxData('nodes')` → `action=nodes`

**Fonctions JavaScript** :
- `initNodeCharts()` : Initialise les graphiques Chart.js pour chaque node
- `startNodeChartsRefresh()` : Démarre le rafraîchissement automatique des graphiques
- `updateNodeCharts(node)` : Met à jour les graphiques avec les nouvelles données
- `refreshNodeData()` : Charge les données des nodes et met à jour les graphiques

**Rafraîchissement automatique** :
- `refreshNodeData()` : Toutes les 10 secondes

**Fonctionnalités** :
- Affichage détaillé de chaque node
- Graphiques Chart.js : CPU, RAM, Load Average (30 dernières valeurs)
- Métriques : CPU utilisation, RAM (used/total), Load Average, Uptime
- Nombre de VMs/containers par node

---

### 3. VMs Management (`switchView('vms')`)
**Fonction** : `getVMsManagementView()`

**APIs utilisées** :
- `loadProxmoxData('resources')` → `action=resources`
- `fetch('?api=data&action=vm-notes&...')` → `action=vm-notes` (GET)
- `fetch('?api=data&action=vm-config&...')` → `action=vm-config`
- `fetch('?api=data&action=vm-action', {method: 'POST', ...})` → `action=vm-action`
- `fetch('?api=data&action=vm-notes', {method: 'POST', ...})` → `action=vm-notes` (POST)

**Fonctions JavaScript** :
- `initVMsManagementView()` : Initialise la vue et charge les données
- `generateVMsManagementHTML()` : Génère le HTML de la liste et des détails
- `selectVM(vmid, node, type)` : Sélectionne une VM et charge ses détails
- `loadVMDetails(vm)` : Charge les notes, config, et monitor d'une VM
- `updateVMDetails(vm)` : Met à jour les détails sans re-rendre complètement
- `vmAction(action, vmid, node, type)` : Exécute une action sur une VM
- `editVMNotes(vmid, node, type)` : Édite les notes d'une VM
- `formatConfig(config)` : Formate la config brute en HTML lisible

**Rafraîchissement automatique** :
- `refreshVMStats()` : Toutes les 20 secondes (met à jour le monitor)

**Fonctionnalités** :
- Liste des VMs à gauche (avec tri et recherche)
- Détails à droite :
  - **Actions** : Start, Stop, Restart, Shutdown, Suspend, Resume
  - **Statistiques** : CPU, RAM, Disque, IP
  - **Monitor** : Stats en temps réel (rafraîchi toutes les 20s)
  - **Notes** : HTML rendu, éditables
  - **Configuration** : Formatée en sections/cards lisibles

---

### 4. Storage (`switchView('storage')`)
**Fonction** : `getStorageView()`

**APIs utilisées** :
- `loadProxmoxData('storage')` → `action=storage`

**Fonctions JavaScript** :
- Aucune fonction spécifique (affichage simple)

**Fonctionnalités** :
- Liste de tous les storages
- Affichage : Nom, Type, Total, Utilisé, Disponible, Statut (actif/inactif)

---

### 5. Monitor (`switchView('monitor')`)
**Fonction** : `getMonitorView()`

**APIs utilisées** :
- `loadProxmoxData('vmstats')` → `action=vmstats`

**Fonctions JavaScript** :
- `initMonitorView()` : Initialise la vue et démarre le rafraîchissement
- `calculateNetworkSpeed(id, currentNetin, currentNetout)` : Calcule la vitesse réseau active
- `formatBitrate(bps)` : Formate les bits/s en Gbps/Mbps/Kbps

**Rafraîchissement automatique** :
- `refreshVMStats()` : Toutes les 20 secondes

**Fonctionnalités** :
- Liste des VMs/containers **running uniquement**
- Affichage : Nom, ID, CPU, RAM, Node, Upload (Gbps/Mbps/Kbps), Download (Gbps/Mbps/Kbps)
- Tri par : Nom, ID, CPU, RAM, Node, Upload, Download
- Calcul de la consommation réseau active (différence entre deux mesures)

---

### 6. Tasks (`switchView('tasks')`)
**Fonction** : `getTasksView()`

**APIs utilisées** :
- `loadProxmoxData('tasks')` → `action=tasks`
- `fetch('?api=data&action=task-details&...')` → `action=task-details`
- `fetch('?api=data&action=task-stop&...')` → `action=task-stop`

**Fonctions JavaScript** :
- `initTasksView()` : Initialise la vue et démarre le rafraîchissement
- `startTasksAutoRefresh()` : Démarre le rafraîchissement automatique
- `stopTasksAutoRefresh()` : Arrête le rafraîchissement automatique
- `toggleTaskDetails(upid)` : Affiche/masque les détails d'une tâche
- `stopTask(upid, node)` : Arrête une tâche

**Rafraîchissement automatique** :
- `loadProxmoxData('tasks')` : Toutes les 5 secondes (si activé)

**Fonctionnalités** :
- Liste de toutes les tâches Proxmox
- Affichage : Type, Statut, Utilisateur, Heure de début, Durée, Node, UPID
- Bouton "Arrêter" pour les tâches en cours
- Affichage des détails (logs) au clic

---

## Flux de Données

### 1. Chargement Initial
```
1. Page charge → DOMContentLoaded
2. Vérifie si utilisateur connecté
3. Si connecté → init()
4. init() → refreshVMData() → loadProxmoxData('resources')
5. refreshVMData() met à jour machines[] et clusterNodes[]
6. renderGrid() affiche les VMs
```

### 2. Rafraîchissement Automatique
```
- refreshNodeData() : Toutes les 10s
  → loadProxmoxData('nodes')
  → Met à jour clusterNodes[]
  → Met à jour les graphiques Chart.js (si page Nodes active)

- refreshVMStats() : Toutes les 20s
  → loadProxmoxData('vmstats')
  → Met à jour machines[] (stats)
  → Met à jour le monitor (si page Monitor ou VMs Management active)
```

### 3. Ouverture Console
```
1. Clic sur "Console" → openConsole(id, vmNode, type)
2. fetch('?api=data&action=console&vmid=...&node=...&type=...')
3. Reçoit {console: {proxmoxUrl, vmid, node, type}}
4. Construit l'URL : `${proxmoxUrl}/?console=${type}&vmid=${vmid}&node=${node}&xtermjs=1` (pour LXC)
5. Crée une fenêtre avec iframe pointant vers l'URL
```

### 4. Action sur VM
```
1. Clic sur bouton action → vmAction(action, vmid, node, type)
2. fetch('?api=data&action=vm-action', {method: 'POST', body: FormData})
3. Reçoit {success: true, task: {...}}
4. Rafraîchit les données → refreshVMData() + refreshVMStats()
5. Re-génère la vue si nécessaire
```

---

## Fonctions Principales

### Backend PHP

#### `getProxmoxTicket($url, $username, $password, $realm)`
- Authentifie l'utilisateur auprès de Proxmox
- Retourne le ticket et le CSRF token
- Timeout : 5s connexion, 10s total

#### `proxmoxApiCall($url, $ticket, $path, $method, $data)`
- Appel API Proxmox simple
- Gère les erreurs cURL et HTTP
- Retourne `data` de la réponse JSON

#### `proxmoxApiCallMulti($url, $ticket, $paths)`
- Appels API Proxmox en parallèle avec `curl_multi`
- Prend un tableau de `{path: '/path'}` ou `{path: '/path', node: '...', storage: '...'}`
- Retourne un tableau indexé par clé avec les résultats

### Frontend JavaScript

#### `loadProxmoxData(action)`
- Fonction principale pour charger les données
- Gère le verrouillage des requêtes (`pendingRequests`)
- Retourne les données JSON

#### `refreshVMData()`
- Charge `resources` et met à jour `machines[]` et `clusterNodes[]`
- Appelé au chargement initial et après actions

#### `refreshVMStats()`
- Charge `vmstats` et met à jour les stats des machines
- Appelé toutes les 20 secondes

#### `refreshNodeData()`
- Charge `nodes` et met à jour `clusterNodes[]`
- Met à jour les graphiques Chart.js si page Nodes active
- Appelé toutes les 10 secondes

#### `switchView(view)`
- Change la vue active
- Charge la vue correspondante
- Initialise les fonctionnalités spécifiques

---

## Mapping Pages ↔ APIs

| Page | APIs Utilisées | Fréquence |
|------|----------------|-----------|
| **Dashboard** | `resources`, `vmstats` | 10s (nodes), 20s (vmstats) |
| **Nodes** | `nodes` | 10s |
| **VMs Management** | `resources`, `vmstats`, `vm-notes`, `vm-config`, `vm-action` | 20s (vmstats), à la demande (autres) |
| **Storage** | `storage` | Au chargement |
| **Monitor** | `vmstats` | 20s |
| **Tasks** | `tasks`, `task-details`, `task-stop` | 5s (tasks), à la demande (autres) |

---

## Optimisations

### 1. Requêtes Parallèles
- Utilisation de `proxmoxApiCallMulti()` pour exécuter plusieurs requêtes en parallèle
- Réduit significativement le temps de réponse

### 2. Verrouillage des Requêtes
- `pendingRequests` empêche les requêtes concurrentes du même type
- Évite de surcharger le serveur

### 3. Utilisation de `/cluster/resources`
- Un seul appel pour obtenir nodes, VMs, containers, storage
- Filtrage côté PHP au lieu de multiples appels API

### 4. Rafraîchissement Intelligent
- Ne rafraîchit que les données nécessaires
- Met à jour les graphiques en place (Chart.js)
- Mise à jour transparente des détails VM (sans re-rendre)

---

## Notes Techniques

### Console
- Pour LXC : utilise `xtermjs=1` dans l'URL Proxmox
- Pour VM : utilise noVNC natif Proxmox
- Ouverture dans une fenêtre avec iframe

### Disque LXC
- Extraction depuis `rootfs['used']` et `rootfs['total']`
- Affichage en "used GB / total GB"

### Disque QEMU
- Utilise `disk` (pourcentage) depuis `status/current`
- Affichage en pourcentage

### Réseau
- `netin` et `netout` sont des valeurs cumulatives (bytes)
- Calcul de la vitesse active : différence entre deux mesures / intervalle
- Formatage en Gbps/Mbps/Kbps

---

## Structure des Données Globales JavaScript

```javascript
// Données globales
let machines = [];              // Toutes les VMs/containers
let clusterNodes = [];          // Tous les nodes avec leurs machines
let currentView = 'dashboard';  // Vue active
let selectedVM = null;          // VM sélectionnée dans VMs Management
let pendingRequests = {};       // Verrouillage des requêtes
let nodeMetricsHistory = {};   // Historique pour graphiques Chart.js
let nodeCpuCharts = {};         // Instances Chart.js CPU
let nodeRamCharts = {};         // Instances Chart.js RAM
let nodeLoadCharts = {};        // Instances Chart.js Load Average
```

---

Fin de la documentation.
