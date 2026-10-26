# 💰 GoldShop Leaks — FiveM Leak Site

## ⚡ Démarrage rapide

```bash
# 1. Installer les dépendances (une seule fois)
npm install

# 2. Lancer le serveur
node server.js

# 3. Ouvrir dans le navigateur
http://localhost:3000
```

## 🔐 Compte Admin par défaut

| Champ | Valeur |
|-------|--------|
| Username | `admin` |
| Mot de passe | `admin123` |
| Panel admin | http://localhost:3000/admin |

> **IMPORTANT** : Change le mot de passe admin dès la première connexion !

## 📦 Structure du projet

```
goldshop-leaks/
├── server.js          — Serveur Express (backend)
├── database.js        — Connexion SQLite
├── package.json
├── data/
│   └── goldshop.db    — Base de données (auto-créée)
└── public/
    ├── index.html     — Page principale
    ├── login.html     — Connexion
    ├── register.html  — Inscription
    ├── banned.html    — Page de ban
    ├── css/
    │   ├── style.css  — CSS public
    │   └── admin.css  — CSS admin
    ├── js/
    │   ├── main.js    — JS public
    │   └── admin.js   — JS admin
    ├── admin/
    │   └── index.html — Panel admin
    └── uploads/       — Fichiers uploadés
```

## 🔔 Webhook Discord

1. Va dans ton serveur Discord → Paramètres → Intégrations → Webhooks
2. Crée un webhook et copie l'URL
3. Va dans le Panel Admin → Paramètres → colle l'URL
4. Active en sauvegardant

Les notifs arrivent pour : **Connexion**, **Inscription**, **Ban**

## 🗂️ Catégories par défaut

- ⚙️ Scripts FiveM
- 🤖 Bots Discord
- 🗺️ Mapping
- 📦 Packs Complets
- 🛠️ Outils

## 🔨 Système de ban

- Ban par **user ID** (bannit l'utilisateur + son IP)
- Ban par **IP** uniquement
- Les bannis voient la page `/banned`
- Débannissement en un clic depuis le panel

## 📤 Ajouter un leak

1. Connecte-toi en admin → Panel Admin → Leaks → "+ Nouveau leak"
2. Remplis : titre, description, catégorie
3. Choisis : lien externe WinRAR/Mega/Mediafire OU upload fichier direct
4. Ajoute une image de préview et/ou une vidéo YouTube
5. Tags pour la recherche
6. Publie ou garde en brouillon

## 🌐 Mettre en ligne (hébergement)

### Option 1 — VPS (recommandé)
```bash
# Installer PM2 pour garder le serveur actif
npm install -g pm2
pm2 start server.js --name goldshop
pm2 save
pm2 startup
```

### Option 2 — Railway / Render (gratuit)
- Push le projet sur GitHub
- Connecte Railway/Render à ton repo
- Set la variable d'environnement `PORT=3000`
