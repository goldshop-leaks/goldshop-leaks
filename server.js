require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const SQLiteStore = require('connect-sqlite3')(session);
const db = require('./database');

// ── Discord OAuth2 config ─────────────────────────────────────────────────────
const DISCORD_CLIENT_ID     = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI  = process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/auth/discord/callback';
const DISCORD_SCOPE         = 'identify email';

const app = express();
const PORT = process.env.PORT || 3000;

// ── Dossiers uploads ───────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ── Helmet (sécurité headers) ─────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false
}));

// ── Rate limiting (anti-brute force) ─────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Trop de tentatives de connexion. Réessaye dans 15 minutes.'
});

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Sessions ──────────────────────────────────────────────────────────────────
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: './data' }),
  secret: 'goldshop_secret_2024_xK9mP',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true
  }
}));

// ── Multer config ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.rar', '.zip', '.7z', '.png', '.jpg', '.jpeg', '.gif', '.mp4', '.webm', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// ── Middlewares d'authentification ────────────────────────────────────────────
function isAuth(req, res, next) {
  if (req.session.userId) return next();
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.session.userId && req.session.isAdmin) return next();
  res.status(403).json({ error: 'Accès refusé' });
}

// ── Middleware de ban ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  db.get('SELECT * FROM bans WHERE ip = ? OR ip = ?', [ip, ip.replace('::ffff:', '')], (err, ban) => {
    if (ban) {
      return res.status(403).sendFile(path.join(__dirname, 'public', 'banned.html'));
    }
    if (req.session.userId) {
      db.get('SELECT * FROM bans WHERE user_id = ?', [req.session.userId], (err2, banUser) => {
        if (banUser) {
          req.session.destroy();
          return res.status(403).sendFile(path.join(__dirname, 'public', 'banned.html'));
        }
        next();
      });
    } else {
      next();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES PUBLIQUES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/banned', (req, res) => res.sendFile(path.join(__dirname, 'public', 'banned.html')));

// ── API : Infos session ───────────────────────────────────────────────────────
app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });
  db.get('SELECT id, username, email, avatar, created_at, is_admin FROM users WHERE id = ?',
    [req.session.userId], (err, user) => {
      if (!user) return res.json({ loggedIn: false });
      res.json({ loggedIn: true, ...user });
    });
});

// ── Inscription ───────────────────────────────────────────────────────────────
app.post('/api/register', loginLimiter, async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.json({ success: false, error: 'Tous les champs sont requis.' });
  if (password.length < 6)
    return res.json({ success: false, error: 'Mot de passe trop court (6 chars min).' });

  const hash = await bcrypt.hash(password, 12);
  const ip = req.ip || req.connection.remoteAddress;

  db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email], (err, existing) => {
    if (existing) return res.json({ success: false, error: 'Nom d\'utilisateur ou email déjà pris.' });

    db.run(
      'INSERT INTO users (username, email, password, ip, created_at) VALUES (?, ?, ?, ?, datetime("now"))',
      [username, email, hash, ip],
      function (err2) {
        if (err2) return res.json({ success: false, error: 'Erreur serveur.' });
        req.session.userId = this.lastID;
        req.session.isAdmin = false;
        sendDiscordWebhook('register', { username, email, ip });
        res.json({ success: true });
      }
    );
  });
});

// ── Connexion ─────────────────────────────────────────────────────────────────
app.post('/api/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, username], async (err, user) => {
    if (!user) return res.json({ success: false, error: 'Identifiants incorrects.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ success: false, error: 'Identifiants incorrects.' });

    // Update last login & ip
    db.run('UPDATE users SET last_login = datetime("now"), ip = ? WHERE id = ?', [ip, user.id]);

    req.session.userId = user.id;
    req.session.isAdmin = user.is_admin === 1;

    sendDiscordWebhook('login', { username: user.username, email: user.email, ip });
    res.json({ success: true, isAdmin: user.is_admin === 1 });
  });
});

// ── Déconnexion ───────────────────────────────────────────────────────────────
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES CATÉGORIES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/categories', (req, res) => {
  db.all('SELECT * FROM categories ORDER BY position ASC', [], (err, rows) => {
    res.json(rows || []);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES LEAKS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/leaks', (req, res) => {
  const { category, search, page = 1, sort } = req.query;
  const limit = 12;
  const offset = (page - 1) * limit;

  let query = `SELECT l.*, c.name as category_name, c.icon as category_icon,
    u.username as author_name,
    (SELECT COUNT(*) FROM downloads WHERE leak_id = l.id) as download_count
    FROM leaks l
    LEFT JOIN categories c ON l.category_id = c.id
    LEFT JOIN users u ON l.author_id = u.id
    WHERE l.published = 1`;
  const params = [];

  if (category) { query += ' AND l.category_id = ?'; params.push(category); }
  if (search) { query += ' AND (l.title LIKE ? OR l.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  if (sort === 'popular') {
    query += ' ORDER BY download_count DESC LIMIT ? OFFSET ?';
  } else {
    query += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
  }
  params.push(limit, offset);

  db.all(query, params, (err, rows) => {
    res.json(rows || []);
  });
});

// ── Stats publiques (EN BREF) ─────────────────────────────────────────────────
app.get('/api/public/stats', (req, res) => {
  db.get('SELECT COUNT(*) as users FROM users', [], (e, r1) => {
    db.get('SELECT COUNT(*) as leaks FROM leaks WHERE published=1', [], (e2, r2) => {
      db.get('SELECT COUNT(*) as downloads FROM downloads', [], (e3, r3) => {
        db.get('SELECT value FROM settings WHERE key="discord_members"', [], (e4, r4) => {
          db.get('SELECT value FROM settings WHERE key="discord_online"', [], (e5, r5) => {
            res.json({
              users: r1?.users || 0,
              leaks: r2?.leaks || 0,
              downloads: r3?.downloads || 0,
              discordMembers: r4?.value || '0',
              discordOnline: r5?.value || '0'
            });
          });
        });
      });
    });
  });
});

// ── Config membres Discord (admin) ────────────────────────────────────────────
app.post('/api/admin/discord-stats', isAdmin, (req, res) => {
  const { members, online } = req.body;
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES ("discord_members", ?)', [members]);
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES ("discord_online", ?)', [online],
    err => res.json({ success: !err }));
});

app.get('/api/leaks/:id', (req, res) => {
  db.get(`SELECT l.*, c.name as category_name, u.username as author_name,
    (SELECT COUNT(*) FROM downloads WHERE leak_id = l.id) as download_count
    FROM leaks l
    LEFT JOIN categories c ON l.category_id = c.id
    LEFT JOIN users u ON l.author_id = u.id
    WHERE l.id = ? AND l.published = 1`, [req.params.id], (err, leak) => {
    if (!leak) return res.status(404).json({ error: 'Leak introuvable' });
    res.json(leak);
  });
});

// ── Téléchargement / compteur ─────────────────────────────────────────────────
app.post('/api/leaks/:id/download', isAuth, (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  db.run('INSERT OR IGNORE INTO downloads (leak_id, user_id, ip, downloaded_at) VALUES (?, ?, ?, datetime("now"))',
    [req.params.id, req.session.userId, ip]);

  db.get('SELECT file_url, external_link FROM leaks WHERE id = ? AND published = 1', [req.params.id], (err, leak) => {
    if (!leak) return res.status(404).json({ error: 'Leak introuvable' });
    res.json({ url: leak.external_link || `/uploads/${leak.file_url}` });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL ADMIN
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/admin', isAuth, (req, res) => {
  if (!req.session.isAdmin) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// ── Stats globales ────────────────────────────────────────────────────────────
app.get('/api/admin/stats', isAdmin, (req, res) => {
  const stats = {};
  db.get('SELECT COUNT(*) as count FROM users', [], (e, r) => {
    stats.users = r.count;
    db.get('SELECT COUNT(*) as count FROM leaks', [], (e2, r2) => {
      stats.leaks = r2.count;
      db.get('SELECT COUNT(*) as count FROM downloads', [], (e3, r3) => {
        stats.downloads = r3.count;
        db.get('SELECT COUNT(*) as count FROM bans', [], (e4, r4) => {
          stats.bans = r4.count;
          db.get('SELECT COUNT(*) as count FROM users WHERE date(created_at) = date("now")', [], (e5, r5) => {
            stats.newToday = r5.count;
            res.json(stats);
          });
        });
      });
    });
  });
});

// ── Liste des users ───────────────────────────────────────────────────────────
app.get('/api/admin/users', isAdmin, (req, res) => {
  const { search, page = 1 } = req.query;
  const limit = 20;
  const offset = (page - 1) * limit;
  let query = 'SELECT id, username, email, ip, created_at, last_login, is_admin FROM users';
  const params = [];
  if (search) {
    query += ' WHERE username LIKE ? OR email LIKE ? OR ip LIKE ?';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  db.all(query, params, (err, rows) => res.json(rows || []));
});

// ── Détail d'un user ──────────────────────────────────────────────────────────
app.get('/api/admin/users/:id', isAdmin, (req, res) => {
  db.get('SELECT id, username, email, ip, created_at, last_login, is_admin FROM users WHERE id = ?',
    [req.params.id], (err, user) => {
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
      db.all('SELECT l.title, d.downloaded_at FROM downloads d JOIN leaks l ON d.leak_id = l.id WHERE d.user_id = ? ORDER BY d.downloaded_at DESC LIMIT 20',
        [req.params.id], (err2, downloads) => {
          res.json({ ...user, downloads: downloads || [] });
        });
    });
});

// ── Ban user ──────────────────────────────────────────────────────────────────
app.post('/api/admin/ban', isAdmin, (req, res) => {
  const { userId, ip, reason } = req.body;
  const adminId = req.session.userId;
  if (!userId && !ip) return res.json({ success: false, error: 'userId ou ip requis' });

  if (userId) {
    db.get('SELECT ip, username FROM users WHERE id = ?', [userId], (err, user) => {
      if (!user) return res.json({ success: false, error: 'Utilisateur introuvable' });
      db.run('INSERT OR REPLACE INTO bans (user_id, ip, reason, banned_by, banned_at) VALUES (?, ?, ?, ?, datetime("now"))',
        [userId, user.ip, reason || 'Aucune raison', adminId],
        (err2) => {
          sendDiscordWebhook('ban', { username: user.username, ip: user.ip, reason });
          res.json({ success: !err2 });
        });
    });
  } else {
    db.run('INSERT OR REPLACE INTO bans (ip, reason, banned_by, banned_at) VALUES (?, ?, ?, datetime("now"))',
      [ip, reason || 'Aucune raison', adminId],
      (err) => res.json({ success: !err }));
  }
});

// ── Unban ─────────────────────────────────────────────────────────────────────
app.delete('/api/admin/ban/:id', isAdmin, (req, res) => {
  db.run('DELETE FROM bans WHERE id = ?', [req.params.id], (err) => res.json({ success: !err }));
});

// ── Liste des bans ────────────────────────────────────────────────────────────
app.get('/api/admin/bans', isAdmin, (req, res) => {
  db.all(`SELECT b.*, u.username FROM bans b LEFT JOIN users u ON b.user_id = u.id ORDER BY b.banned_at DESC`, [],
    (err, rows) => res.json(rows || []));
});

// ── Créer catégorie ───────────────────────────────────────────────────────────
app.post('/api/admin/categories', isAdmin, upload.single('icon_file'), (req, res) => {
  const { name, description, icon, color, position } = req.body;
  const iconPath = req.file ? `/uploads/${req.file.filename}` : (icon || '📦');
  db.run('INSERT INTO categories (name, description, icon, color, position) VALUES (?, ?, ?, ?, ?)',
    [name, description || '', iconPath, color || '#ffd700', position || 0],
    function (err) {
      if (err) return res.json({ success: false, error: err.message });
      res.json({ success: true, id: this.lastID });
    });
});

// ── Modifier catégorie ────────────────────────────────────────────────────────
app.put('/api/admin/categories/:id', isAdmin, (req, res) => {
  const { name, description, icon, color, position } = req.body;
  db.run('UPDATE categories SET name=?, description=?, icon=?, color=?, position=? WHERE id=?',
    [name, description, icon, color, position, req.params.id],
    (err) => res.json({ success: !err }));
});

// ── Supprimer catégorie ───────────────────────────────────────────────────────
app.delete('/api/admin/categories/:id', isAdmin, (req, res) => {
  db.run('DELETE FROM categories WHERE id = ?', [req.params.id], (err) => res.json({ success: !err }));
});

// ── Créer un leak ─────────────────────────────────────────────────────────────
app.post('/api/admin/leaks', isAdmin, upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'file', maxCount: 1 }
]), (req, res) => {
  const { title, description, category_id, external_link, video_url, tags, published } = req.body;
  const thumbnail = req.files?.thumbnail ? `/uploads/${req.files.thumbnail[0].filename}` : null;
  const fileUrl = req.files?.file ? req.files.file[0].filename : null;

  db.run(`INSERT INTO leaks (title, description, category_id, thumbnail, file_url, external_link, video_url, tags, published, author_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))`,
    [title, description, category_id, thumbnail, fileUrl, external_link || null, video_url || null,
      tags || '', published === 'true' ? 1 : 0, req.session.userId],
    function (err) {
      if (err) return res.json({ success: false, error: err.message });

      const leakId = this.lastID;
      res.json({ success: true, id: leakId });

      // ── Webhook Discord "Nouveau leak" ────────────────────────────────────
      if (published === 'true') {
        db.get('SELECT name FROM categories WHERE id = ?', [category_id], (e, cat) => {
          db.get('SELECT username FROM users WHERE id = ?', [req.session.userId], (e2, author) => {
            db.get('SELECT value FROM settings WHERE key = "discord_webhook"', [], async (e3, row) => {
              if (!row?.value) return;

              const thumbUrl = thumbnail
                ? `${process.env.DISCORD_REDIRECT_URI?.replace('/auth/discord/callback', '') || 'http://localhost:3000'}${thumbnail}`
                : null;

              const embed = {
                title: `📦 Nouvel ajout - ${cat?.name || 'Leak'}`,
                description: 'Une ressource a été ajoutée sur le site.',
                color: 0x8b5cf6,
                fields: [
                  { name: 'Nom',       value: title,                    inline: false },
                  { name: 'Catégorie', value: cat?.name || '—',         inline: true  },
                  { name: 'Accès',     value: 'Gratuit',                inline: true  },
                  { name: 'Par',       value: author?.username || 'Admin', inline: true }
                ],
                timestamp: new Date().toISOString(),
                footer: { text: 'GoldShop Leaks' }
              };

              if (thumbUrl) embed.image = { url: thumbUrl };

              try {
                await axios.post(row.value, { embeds: [embed] });
              } catch(webhookErr) {
                console.error('Webhook nouveau leak:', webhookErr.message);
              }
            });
          });
        });
      }
    });
});

// ── Modifier un leak ──────────────────────────────────────────────────────────
app.put('/api/admin/leaks/:id', isAdmin, upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'file', maxCount: 1 }
]), (req, res) => {
  const { title, description, category_id, external_link, video_url, tags, published } = req.body;
  const thumbnail = req.files?.thumbnail ? `/uploads/${req.files.thumbnail[0].filename}` : undefined;
  const fileUrl = req.files?.file ? req.files.file[0].filename : undefined;

  let query = 'UPDATE leaks SET title=?, description=?, category_id=?, external_link=?, video_url=?, tags=?, published=?';
  const params = [title, description, category_id, external_link, video_url, tags, published === 'true' ? 1 : 0];

  if (thumbnail) { query += ', thumbnail=?'; params.push(thumbnail); }
  if (fileUrl) { query += ', file_url=?'; params.push(fileUrl); }

  query += ' WHERE id=?';
  params.push(req.params.id);

  db.run(query, params, (err) => res.json({ success: !err, error: err?.message }));
});

// ── Supprimer un leak ─────────────────────────────────────────────────────────
app.delete('/api/admin/leaks/:id', isAdmin, (req, res) => {
  db.run('DELETE FROM leaks WHERE id = ?', [req.params.id], (err) => res.json({ success: !err }));
});

// ── Liste des leaks (admin) ───────────────────────────────────────────────────
app.get('/api/admin/leaks', isAdmin, (req, res) => {
  db.all(`SELECT l.*, c.name as category_name,
    (SELECT COUNT(*) FROM downloads WHERE leak_id = l.id) as download_count
    FROM leaks l LEFT JOIN categories c ON l.category_id = c.id
    ORDER BY l.created_at DESC`, [], (err, rows) => res.json(rows || []));
});

// ── Config Webhook Discord ────────────────────────────────────────────────────
app.get('/api/admin/webhook', isAdmin, (req, res) => {
  db.get('SELECT value FROM settings WHERE key = "discord_webhook"', [], (err, row) => {
    res.json({ webhook: row?.value || '' });
  });
});

app.post('/api/admin/webhook', isAdmin, (req, res) => {
  const { webhook } = req.body;
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES ("discord_webhook", ?)', [webhook],
    (err) => res.json({ success: !err }));
});

// ── Config lien Discord invite ─────────────────────────────────────────────────
app.get('/api/settings/discord-invite', (req, res) => {
  db.get('SELECT value FROM settings WHERE key = "discord_invite"', [], (err, row) => {
    res.json({ url: row?.value || '' });
  });
});

app.post('/api/admin/discord-invite', isAdmin, (req, res) => {
  const { url } = req.body;
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES ("discord_invite", ?)', [url],
    (err) => res.json({ success: !err }));
});

// ── Image bannière hero ────────────────────────────────────────────────────────
app.get('/api/settings/hero-banner', (req, res) => {
  db.get('SELECT value FROM settings WHERE key = "hero_banner"', [], (err, row) => {
    res.json({ url: row?.value || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1600&q=80&auto=format' });
  });
});

app.post('/api/admin/hero-banner', isAdmin, upload.single('banner'), (req, res) => {
  const url = req.file ? `/uploads/${req.file.filename}` : (req.body.url || '');
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES ("hero_banner", ?)', [url],
    (err) => res.json({ success: !err, url }));
});

// ── Promouvoir admin ──────────────────────────────────────────────────────────
app.post('/api/admin/promote/:id', isAdmin, (req, res) => {
  db.run('UPDATE users SET is_admin = 1 WHERE id = ?', [req.params.id], (err) => res.json({ success: !err }));
});

// ── Rétrograder admin ─────────────────────────────────────────────────────────
app.post('/api/admin/demote/:id', isAdmin, (req, res) => {
  db.run('UPDATE users SET is_admin = 0 WHERE id = ?', [req.params.id], (err) => res.json({ success: !err }));
});

// ── Logs récents ──────────────────────────────────────────────────────────────
app.get('/api/admin/logs', isAdmin, (req, res) => {
  db.all('SELECT * FROM logs ORDER BY created_at DESC LIMIT 50', [], (err, rows) => res.json(rows || []));
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUBS / SLIDES SPONSORISÉS
// ═══════════════════════════════════════════════════════════════════════════════

// Liste publique
app.get('/api/slides', (req, res) => {
  db.all('SELECT * FROM slides WHERE active = 1 ORDER BY position ASC', [], (err, rows) => res.json(rows || []));
});

// Liste admin
app.get('/api/admin/slides', isAdmin, (req, res) => {
  db.all('SELECT * FROM slides ORDER BY position ASC', [], (err, rows) => res.json(rows || []));
});

// Créer
app.post('/api/admin/slides', isAdmin, upload.single('image'), (req, res) => {
  const { title, subtitle, description, btn1_label, btn1_url, btn2_label, btn2_url, position, active } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : (req.body.image_url || null);
  db.run(
    `INSERT INTO slides (title, subtitle, description, image, btn1_label, btn1_url, btn2_label, btn2_url, position, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, subtitle||'', description||'', image, btn1_label||'', btn1_url||'', btn2_label||'', btn2_url||'',
     position||0, active === 'false' ? 0 : 1],
    function(err) {
      if (err) return res.json({ success: false, error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

// Modifier
app.put('/api/admin/slides/:id', isAdmin, upload.single('image'), (req, res) => {
  const { title, subtitle, description, btn1_label, btn1_url, btn2_label, btn2_url, position, active } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : (req.body.image_url || null);

  let q = 'UPDATE slides SET title=?, subtitle=?, description=?, btn1_label=?, btn1_url=?, btn2_label=?, btn2_url=?, position=?, active=?';
  const p = [title, subtitle||'', description||'', btn1_label||'', btn1_url||'',
             btn2_label||'', btn2_url||'', position||0, active === 'false' ? 0 : 1];
  if (image) { q += ', image=?'; p.push(image); }
  q += ' WHERE id=?'; p.push(req.params.id);

  db.run(q, p, err => res.json({ success: !err, error: err?.message }));
});

// Supprimer
app.delete('/api/admin/slides/:id', isAdmin, (req, res) => {
  db.run('DELETE FROM slides WHERE id = ?', [req.params.id], err => res.json({ success: !err }));
});

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK DISCORD
// ═══════════════════════════════════════════════════════════════════════════════

async function sendDiscordWebhook(type, data) {
  db.get('SELECT value FROM settings WHERE key = "discord_webhook"', [], async (err, row) => {
    if (!row?.value) return;
    const webhookUrl = row.value;

    const embeds = [];
    const colors = { login: 0x00ff88, register: 0x0099ff, ban: 0xff3333 };
    const titles = {
      login: '🔑 Nouvelle Connexion',
      register: '📝 Nouvelle Inscription',
      ban: '🔨 Utilisateur Banni'
    };

    embeds.push({
      title: titles[type] || 'Événement',
      color: colors[type] || 0xffd700,
      fields: Object.entries(data).map(([k, v]) => ({ name: k, value: String(v), inline: true })),
      timestamp: new Date().toISOString(),
      footer: { text: 'GoldShop Leaks' }
    });

    try {
      await axios.post(webhookUrl, { embeds });
      // Log dans la DB
      db.run('INSERT INTO logs (type, data, created_at) VALUES (?, ?, datetime("now"))',
        [type, JSON.stringify(data)]);
    } catch (e) {
      console.error('Webhook Discord error:', e.message);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DÉMARRAGE
// ═══════════════════════════════════════════════════════════════════════════════

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    discord_id TEXT UNIQUE,
    ip TEXT,
    avatar TEXT,
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME,
    last_login DATETIME
  )`);
  // Migration : ajouter discord_id si la colonne n'existe pas encore
  db.run('ALTER TABLE users ADD COLUMN discord_id TEXT', () => {});
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT DEFAULT '📦',
    color TEXT DEFAULT '#ffd700',
    position INTEGER DEFAULT 0
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS leaks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category_id INTEGER,
    thumbnail TEXT,
    file_url TEXT,
    external_link TEXT,
    video_url TEXT,
    tags TEXT,
    published INTEGER DEFAULT 0,
    author_id INTEGER,
    created_at DATETIME,
    FOREIGN KEY(category_id) REFERENCES categories(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    leak_id INTEGER,
    user_id INTEGER,
    ip TEXT,
    downloaded_at DATETIME,
    UNIQUE(leak_id, user_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS bans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    ip TEXT,
    reason TEXT,
    banned_by INTEGER,
    banned_at DATETIME
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    data TEXT,
    created_at DATETIME
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS slides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subtitle TEXT DEFAULT '',
    description TEXT DEFAULT '',
    image TEXT,
    btn1_label TEXT DEFAULT '',
    btn1_url TEXT DEFAULT '',
    btn2_label TEXT DEFAULT '',
    btn2_url TEXT DEFAULT '',
    position INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1
  )`);

  // Créer le compte admin par défaut
  bcrypt.hash('admin123', 12).then(hash => {
    db.run('INSERT OR IGNORE INTO users (username, email, password, ip, is_admin, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))',
      ['admin', 'admin@goldshop.gg', hash, '127.0.0.1', 1]);
  });

  // Catégories par défaut — INSERT OR IGNORE grâce à UNIQUE sur name
  const cats = [
    ['Scripts FiveM', 'Scripts pour serveurs FiveM', '⚙️', '#a855f7', 1],
    ['Bots Discord', 'Bots Discord prêts à l\'emploi', '🤖', '#7289da', 2],
    ['Mapping', 'Maps et MLOs FiveM', '🗺️', '#00ff88', 3],
    ['Packs Complets', 'Packs serveur complets', '📦', '#a855f7', 4],
    ['Outils', 'Outils et utilitaires', '🛠️', '#f97316', 5]
  ];
  cats.forEach(([name, desc, icon, color, pos]) => {
    db.run('INSERT OR IGNORE INTO categories (name, description, icon, color, position) VALUES (?, ?, ?, ?, ?)',
      [name, desc, icon, color, pos]);
  });

  console.log('\x1b[33m%s\x1b[0m', '═══════════════════════════════════');
  console.log('\x1b[33m%s\x1b[0m', '  GoldShop Leaks - Serveur démarré');
  console.log('\x1b[33m%s\x1b[0m', `  http://localhost:${PORT}`);
  console.log('\x1b[33m%s\x1b[0m', '  Admin: admin / admin123');
  console.log('\x1b[33m%s\x1b[0m', '═══════════════════════════════════');
});

// ═══════════════════════════════════════════════════════════════════════════════
// DISCORD OAUTH2
// ═══════════════════════════════════════════════════════════════════════════════

// ── Étape 1 : Rediriger vers Discord ─────────────────────────────────────────
// DISCORD OAUTH2
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/auth/discord', (req, res) => {
  if (!DISCORD_CLIENT_ID) {
    return res.send('<h2 style="font-family:sans-serif;color:#ff4444;padding:40px">Discord OAuth2 non configuré.<br>Modifie le fichier .env avec ton Client ID et Client Secret Discord.</h2>');
  }
  const params = new URLSearchParams({
    client_id:     DISCORD_CLIENT_ID,
    redirect_uri:  DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope:         DISCORD_SCOPE
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// ── Étape 2 : Callback Discord ────────────────────────────────────────────────
app.get('/auth/discord/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect('/login?error=discord_denied');
  }

  try {
    // Échanger le code contre un access token
    const tokenRes = await axios.post('https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id:     DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  DISCORD_REDIRECT_URI
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenRes.data.access_token;

    // Récupérer les infos de l'utilisateur Discord
    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const discordUser = userRes.data;
    const discordId   = discordUser.id;
    const username    = discordUser.username;
    const email       = discordUser.email || `${discordId}@discord.user`;
    const avatar      = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.png`
      : null;
    const ip = req.ip || req.connection.remoteAddress;

    // Chercher si l'utilisateur Discord existe déjà
    db.get('SELECT * FROM users WHERE discord_id = ?', [discordId], async (err, existing) => {
      if (existing) {
        // Connexion existante — mettre à jour
        db.run('UPDATE users SET last_login = datetime("now"), ip = ?, avatar = ? WHERE id = ?',
          [ip, avatar, existing.id]);
        req.session.userId  = existing.id;
        req.session.isAdmin = existing.is_admin === 1;
        sendDiscordWebhook('login', { username: existing.username, source: 'Discord OAuth', ip });
        return res.redirect('/');
      }

      // Vérifier si le pseudo est déjà pris et en générer un unique
      let finalUsername = username;
      const taken = await new Promise(resolve =>
        db.get('SELECT id FROM users WHERE username = ?', [finalUsername], (e, r) => resolve(!!r))
      );
      if (taken) finalUsername = `${username}_${discordId.slice(-4)}`;

      // Créer le compte automatiquement
      const fakeHash = await bcrypt.hash(discordId + DISCORD_CLIENT_SECRET, 10);
      db.run(
        'INSERT INTO users (username, email, password, discord_id, avatar, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime("now"))',
        [finalUsername, email, fakeHash, discordId, avatar, ip],
        function(err2) {
          if (err2) return res.redirect('/login?error=discord_error');
          req.session.userId  = this.lastID;
          req.session.isAdmin = false;
          sendDiscordWebhook('register', { username: finalUsername, source: 'Discord OAuth', ip });
          res.redirect('/');
        }
      );
    });

  } catch (e) {
    console.error('Discord OAuth error:', e.message);
    res.redirect('/login?error=discord_error');
  }
});

app.listen(PORT);
