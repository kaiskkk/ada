'use strict';

const crypto = require('node:crypto');
const db = require('./db');

const COOKIE = 'lm_session';
const SESSION_DAYS = 30;

/* ---------- Mots de passe (scrypt, intégré à Node.js) ---------- */

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  try {
    const [algo, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(N), r: Number(r), p: Number(p),
    });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// Utilisé quand l'e-mail n'existe pas, pour que la réponse prenne le même temps.
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));

/* ---------- Cookies et sessions ---------- */

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 3600 * 1000,
  };
}

function startSession(req, res, adminId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  db.createSession(sha256(token), adminId, csrf, Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  res.cookie(COOKIE, token, cookieOptions(req));
}

function endSession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.deleteSession(sha256(token));
  res.clearCookie(COOKIE, { path: '/' });
}

// Charge la session (si elle existe) sur toutes les requêtes /admin.
function loadSession(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) {
    const session = db.getSession(sha256(token));
    if (session) {
      req.admin = db.getAdmin(session.admin_id);
      req.csrf = session.csrf;
      req.sessionHash = session.token_hash;
    }
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.admin) {
    const suite = req.method === 'GET' ? `?suite=${encodeURIComponent(req.originalUrl)}` : '';
    return res.redirect(`/admin/connexion${suite}`);
  }
  // Protection CSRF sur tous les envois de formulaire.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const sent = (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
    const a = Buffer.from(String(sent));
    const b = Buffer.from(String(req.csrf));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).send('Le formulaire a expiré. Revenez en arrière, rechargez la page et réessayez.');
    }
  }
  next();
}

/* ---------- Limitation des tentatives ---------- */

function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs).unref();
  return {
    hit(key) {
      const now = Date.now();
      let entry = hits.get(key);
      if (!entry || entry.reset <= now) {
        entry = { count: 0, reset: now + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;
      return entry.count <= max;
    },
    reset(key) { hits.delete(key); },
  };
}

/* ---------- Compte administrateur depuis les variables d'environnement ---------- */

function ensureAdminFromEnv() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) {
    if (db.countAdmins() === 0) {
      console.warn('⚠  Aucun compte administrateur. Définissez ADMIN_EMAIL et ADMIN_PASSWORD (voir .env.example), puis relancez.');
    }
    return;
  }
  // Le compte est créé au premier démarrage. Ensuite, le mot de passe changé
  // depuis l'espace admin est conservé (on ne l'écrase pas à chaque redémarrage).
  if (!db.getAdminByEmail(email)) {
    db.upsertAdmin(email, hashPassword(password));
    console.log(`✓ Compte administrateur créé : ${email}`);
  }
}

module.exports = {
  hashPassword, verifyPassword, DUMMY_HASH,
  startSession, endSession, loadSession, requireAdmin,
  rateLimiter, ensureAdminFromEnv,
};
