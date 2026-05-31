# Déploiement ProxPanel

Dépôt : [github.com/sannier3/ProxPanel](https://github.com/sannier3/ProxPanel)

## Image Docker (GHCR)

| Tag | Usage |
|-----|--------|
| `alpha` | Branche `main`, versions de développement |
| `latest` | Même build que `alpha` pour l’instant ; deviendra la release stable plus tard |
| `2.0.0` | Publié lors d’un tag Git `v2.0.0` (semver) |

```bash
docker pull ghcr.io/sannier3/proxpanel:alpha
# ou
docker pull ghcr.io/sannier3/proxpanel:latest
```

Le workflow [`.github/workflows/docker-publish.yml`](../.github/workflows/docker-publish.yml) publie automatiquement sur chaque push vers `main`.

## Déploiement rapide (Docker Compose)

```bash
git clone https://github.com/sannier3/ProxPanel.git
cd ProxPanel
cp .env.example .env
# Éditer .env : PROD=true, PROXMOX_URL, SESSION_SECRET, etc.

# Image GHCR (recommandé sur serveur)
PROXPANEL_IMAGE_TAG=alpha docker compose -f docker-compose.pull.yml up -d

# Build local
docker compose up -d --build
```

Interface : `http://<hôte>:8080`

### Proxmox sur la même machine

Dans `.env` :

```env
PROD=true
PROXMOX_URL=https://127.0.0.1:8006
COOKIE_SECURE=false
LOCAL_EXEC=true
```

Si l’API n’est pas joignable depuis le conteneur, utilisez l’IP du bridge Docker ou `https://host.docker.internal:8006` selon l’hôte.

## systemd (sans Docker)

Voir [`proxpanel.service`](proxpanel.service).
