# Migration PHP → Node.js

## État actuel

| Composant v1 (PHP) | v2 (Node.js) | Statut |
|--------------------|--------------|--------|
| API `?api=data&action=*` | `/api/data?action=*` | ✅ Porté |
| Auth login / logout / URL | `/api/auth/*` | ✅ Porté |
| Sessions | `express-session` + cookie | ✅ |
| UI `pve.php` | `public/` | ✅ Extrait |
| `config.php` | `.env` + `config.json` | ✅ |
| `pve-debug.php` | - | ❌ Non porté (outil dev ; archive dans `legacy/php/`) |
| Modules SSH (README) | `LOCAL_EXEC` + `/api/modules/:name/run` | ✅ Côté Node |

**En production, PHP n’est plus nécessaire.** Les fichiers PHP sont dans `legacy/php/` à titre d’archive.

## Configuration

```bash
cp .env.example .env
```

Toutes les options sont documentées dans `.env.example`.

## Supprimer définitivement le PHP

1. Vérifier que `public/` contient bien l’UI à jour.
2. Supprimer le dossier `legacy/php/`.
3. Retirer ou adapter `npm run extract-frontend` si plus utilisé.

## Anciennes URLs

| PHP | Node |
|-----|------|
| `?api=data&action=resources` | `/api/data?action=resources` |
| POST `action=login` | `POST /api/auth/login` |
