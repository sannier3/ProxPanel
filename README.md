# ProxPanel

**ProxPanel** est un dashboard alternatif léger pour Proxmox VE. Il agit comme un "Middle-end" permettant d'exposer des fonctionnalités simples et sécurisées à vos utilisateurs, tout en conservant la gestion des droits via Proxmox.

---

## 🚀 Fonctionnalités

- **Interface Simplifiée :** Liste claire des VMs et conteneurs avec leur état.
- **Authentification Transparente :** Connexion via le système de Realm de Proxmox (PAM, PVE, LDAP, AD).
- **Système de Modules :** Extension des fonctionnalités via des scripts Bash (ex: Renommer une VM, Changer un ID, Reset Disk).
- **Sécurité :** Isolation via Docker + Utilisation des Tickets API Proxmox + Clés SSH.

## 🛠 Architecture

Le projet repose sur une approche hybride :
1.  **Frontend (PHP) :** Gère l'affichage et l'authentification API.
2.  **API Proxmox :** Utilisée pour valider le login et récupérer les infos en lecture seule (liste des VMs).
3.  **SSH Tunnel :** Utilisé pour exécuter les actions d'écriture complexes via des scripts Bash situés dans les modules.

## 📋 Prérequis

* Un serveur Proxmox VE (6.x, 7.x ou 8.x).
* Docker et Docker Compose installés sur l'hôte (ou sur une machine tierce qui a accès au Proxmox).

## 📦 Installation

### 1. Cloner le projet
```bash
git clone [https://github.com/votre-repo/proxpanel.git](https://github.com/votre-repo/proxpanel.git)
cd proxpanel

```

### 2. Générer les clés SSH

Le conteneur Docker a besoin d'une clé SSH pour communiquer avec l'hôte Proxmox et lancer les scripts.

```bash
# Créer le dossier
mkdir -p ssh

# Générer la clé (sans mot de passe !)
ssh-keygen -t rsa -b 4096 -f ssh/id_rsa -q -N ""

```

### 3. Autoriser la clé sur l'hôte Proxmox

Il faut dire à Proxmox d'accepter cette clé.

```bash
# Copier le contenu de la clé publique
cat ssh/id_rsa.pub >> /root/.ssh/authorized_keys

```

> **Note de sécurité :** Vous pouvez restreindre cette clé à certaines commandes uniquement dans le fichier authorized_keys si vous souhaitez durcir la sécurité.

### 4. Configuration

Éditez le fichier `docker-compose.yml` ou `config/config.php` si nécessaire pour adapter l'IP de l'hôte (`PROXMOX_HOST`). Par défaut, `172.17.0.1` correspond à l'hôte depuis un conteneur Docker standard.

### 5. Démarrage

```bash
docker-compose up -d --build

```

Accédez ensuite à : `http://votre-ip-proxmox:8080`

---

## 🧩 Créer un Module

La force de ProxPanel réside dans sa modularité. Pour ajouter une fonctionnalité, créez un dossier dans `/modules/` (ex: `modules/reset-password/`).

Il doit contenir 3 fichiers :

1. **`manifest.json`** : Métadonnées.
```json
{
    "name": "Reset Password",
    "description": "Réinitialise le mot de passe root."
}

```


2. **`view.php`** : Le formulaire HTML affiché dans le dashboard.
```html
<form method="POST">
    <input type="hidden" name="module" value="reset-password">
    <input type="hidden" name="action" value="run">
    <input type="text" name="username" placeholder="Utilisateur">
    <button type="submit">Reset</button>
</form>

```


3. **`script.sh`** : Le script exécuté sur l'hyperviseur.
```bash
#!/bin/bash
# $1 sera le username envoyé par le formulaire
qm set 100 --cipassword "reset123" # Exemple simplifié
echo "Mot de passe réinitialisé pour $1"

```



---

## 🔒 Sécurité

* **Droits API :** ProxPanel respecte les ACLs de Proxmox. Si un utilisateur n'a pas accès à une VM via l'interface officielle, l'API refusera de lui donner les infos sur ProxPanel.
* **Scripts Bash :** Les scripts sont exécutés en tant que `root` (via la clé SSH). C'est au développeur du module de s'assurer que les inputs sont sanitisés (ce que fait déjà `escapeshellarg` dans le core PHP).
