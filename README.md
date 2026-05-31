# ProxPanel

[![Français](https://img.shields.io/badge/lang-Français-blue.svg)](README.md) [![English](https://img.shields.io/badge/lang-English-lightgrey.svg)](README.en.md) [![License](https://img.shields.io/badge/License-MIT-success?style=flat-square)](LICENSE) [![Docker publish](https://github.com/sannier3/ProxPanel/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/sannier3/ProxPanel/actions/workflows/docker-publish.yml)

> **Version alpha** — beaucoup de travail reste à faire. L’interface et l’API évoluent sans garantie de stabilité. **Ne pas utiliser sur un cluster de production critique** sans environnement de test, sauvegardes et compte Proxmox à privilèges limités.

**ProxPanel** est un dashboard alternatif pour [Proxmox VE](https://www.proxmox.com/) : interface type bureau web, connexion à l’API Proxmox, gestion des VM/LXC et outils cluster dans une expérience plus simple que l’UI native.

- Dépôt : **[github.com/sannier3/ProxPanel](https://github.com/sannier3/ProxPanel)**
- Image Docker : `ghcr.io/sannier3/proxpanel` (tags **`alpha`** et **`latest`**)

---

## Avertissements

**⚠️ ProxPanel n’est pas un produit fini.** Le dépôt avance vite : de nombreuses zones sont en chantier, partiellement branchées ou sujettes à régression.

| Risque | Détail |
|--------|--------|
| **Fonctions visibles ≠ opérationnelles** | Boutons, fenêtres ou entrées du panneau de configuration peuvent apparaître dans l’UI sans être pleinement implémentés, fiables ou testés sur votre version de Proxmox. |
| **Comportement imprévisible** | Erreurs silencieuses, actions qui échouent à mi-chemin, ou interface qui ne reflète pas l’état réel du cluster. |
| **Impact sur votre infrastructure** | En mode production (`PROD=true`), l’application appelle l’**API Proxmox** avec les droits du compte connecté : démarrage/arrêt de VM, tâches, et selon les écrans **modification de paramètres cluster ou nœud** — avec un risque réel de **dégrader ou casser** une configuration si vous cliquez sans comprendre. |
| **Modules locaux (`LOCAL_EXEC`)** | Sur une installation sur le nœud PVE, l’exécution de scripts dans `modules/` peut toucher l’hôte. À n’activer que si vous maîtrisez ces scripts. |
| **Données et sessions** | Persistance des bureaux (`data/workspaces`), cookies de session : comportement encore perfectible en alpha. |

**Recommandations :**

- Tester d’abord sur un **cluster ou nœud de labo**, avec **snapshots / sauvegardes** à jour.
- Utiliser un **compte Proxmox dédié** avec des **ACL minimales** (pas `root@pam` en exploration si vous pouvez l’éviter).
- Garder l’**interface Proxmox native** pour les opérations sensibles tant que vous n’avez pas validé le comportement de ProxPanel.
- Signaler les bugs via [Issues](https://github.com/sannier3/ProxPanel/issues) plutôt que de supposer qu’une anomalie vient de votre installation.

---

## Aperçu

![Bureau ProxPanel avec moniteur](docs/images/desktop-with-vm-monitoring.png)

![Bureau avec consoles](docs/images/desktop-with-consoles.png)

![Panneau de configuration](docs/images/control-panel.png)

---

## Fonctionnalités (alpha)

*Le tableau ci-dessous décrit l’**objectif** du projet, pas l’état de complétude de chaque écran. En alpha, une ligne peut correspondre à une fonction partielle ou en cours.*

| Domaine | Description |
|---------|-------------|
| **Bureau** | Widgets, fond d’écran, workspace persisté |
| **Instances** | Grille VM/LXC, filtres, actions, notes |
| **Nœuds** | Métriques cluster, shell hyperviseur (terminal nœud) |
| **Moniteur** | Stats temps réel des machines actives |
| **Tâches** | Liste, détail en fenêtre, arrêt des tâches |
| **Stockage** | Datastores |
| **Panneau de configuration** | Édition sections cluster / nœuds |
| **Consoles** | VNC (VM), terminal (LXC), shell (nœud PVE) |
| **Temps réel** | SSE inventaire + stats VM |

---

## Prérequis

- **Node.js** ≥ 20 (installation native), ou **Docker**
- Cluster **Proxmox VE** avec API HTTPS (`PROD=true`)
- Mode démo sans cluster : `PROD=false`

---

## Démarrage rapide (Node.js)

```bash
git clone https://github.com/sannier3/ProxPanel.git
cd ProxPanel
cp .env.example .env
# Éditer .env

npm install
npm start
```

→ [http://localhost:8080](http://localhost:8080)

```bash
npm run dev   # rechargement auto
```

---

## Docker Compose

### Image publiée (GHCR)

| Tag | Description |
|-----|-------------|
| **`alpha`** | Build automatique depuis `main` (recommandé en test) |
| **`latest`** | Même image que `alpha` pour l’instant ; tag stable lors des releases |
| **`2.0.0`** | Publié sur tag Git `v2.0.0` |

```bash
cp .env.example .env
# PROXMOX_URL, SESSION_SECRET, PROD=true, etc.

docker compose -f docker-compose.pull.yml up -d

PROXPANEL_IMAGE_TAG=latest docker compose -f docker-compose.pull.yml up -d
```

### Build local

```bash
docker compose up -d --build
```

Répertoires montés : `./modules` (scripts), `./data/workspaces` (bureaux utilisateurs persistés sur l’hôte).

Détails : [`deploy/README.md`](deploy/README.md).

---

## CI / publication Docker

Workflow [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml) : push sur `main` → `:alpha` et `:latest` ; tag `v*` → semver.

Première publication : rendre le package GHCR public (*Packages* → *proxpanel* → *Package settings*).

---

## Configuration

Fichier **`.env`** ([`.env.example`](.env.example)). Priorité : `.env` > `config.json` > défauts.

| Variable | Description |
|----------|-------------|
| `PROD` | `true` = API Proxmox réelle |
| `PROXMOX_URL` | URL PVE (ex. `https://192.168.1.10:8006`) |
| `SESSION_SECRET` | Secret session (production) |
| `COLLECTOR_*` / `VMSTATS_*` / `REALTIME_*` | Collecte et temps réel |
| `WORKSPACE_DIR` | Persistance du bureau |
| `LOCAL_EXEC` | Modules bash sur l’hôte PVE |

---

## Architecture

```
public/             Interface statique
src/                API Node.js (Express, SSE, proxy consoles)
docs/images/        Captures d’écran
deploy/             systemd + guide déploiement
.github/workflows/  Publication Docker
```

---

## API (aperçu)

| Route | Description |
|-------|-------------|
| `GET /api/health` | Santé + `version` / `channel` |
| `POST /api/auth/login` | Connexion Proxmox |
| `GET/POST /api/data?action=…` | Données cluster |
| `GET /api/realtime/events` | SSE |

---

## Déploiement systemd (sans Docker)

```bash
sudo cp deploy/proxpanel.service /etc/systemd/system/
sudo systemctl enable --now proxpanel
```

`PROXMOX_URL=https://127.0.0.1:8006` sur le nœud Proxmox.

---

## Sécurité

- Outil **tiers non officiel** Proxmox — non supporté par Proxmox GmbH ; respecter les ACL PVE.
- Toute action via l’UI peut avoir des **effets réels** sur le cluster (voir [Avertissements](#avertissements)).
- HTTPS + `COOKIE_SECURE=true` en production.
- Ne pas committer `.env` / secrets.

---

## État du projet

| | |
|--|--|
| **Version npm** | `2.0.0-alpha` |
| **Image Docker** | `:alpha`, `:latest` |
| **Stabilité** | Alpha — nombreuses fonctions incomplètes ; usage à vos risques sur infra réelle |
| **Maturité** | Développement actif — pas de promesse de compatibilité ni de délai de finalisation |

Contributions et retours via [Issues](https://github.com/sannier3/ProxPanel/issues) bienvenues.
