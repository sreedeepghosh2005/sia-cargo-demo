'use strict';
/*
 * SIA Cargo Services demo server. No npm packages needed.
 *
 *   node server.js            -> http://127.0.0.1:3000
 *
 * It serves the website pages and the job postings API.
 * Staff with an @cargoservice.in email log in at /admin.html.
 * The first password is DEFAULT_PASSWORD. The server refuses every
 * job change until the person sets a new password.
 *
 * Environment variables (all optional):
 *   PORT            port to listen on (default 3000)
 *   HOST            address to listen on (default 127.0.0.1)
 *   ALLOWED_EMAILS  comma separated list. If set, only these emails can log in.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const USERS_FILE = path.join(DATA, 'users.json');
const JOBS_FILE = path.join(DATA, 'jobs.json');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

const EMAIL_DOMAIN = 'cargoservice.in';
const DEFAULT_PASSWORD = '12345678';
const MIN_PASSWORD = 8;
const SESSION_HOURS = 8;
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

/* ------------------------------------------------------------ storage */
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}
let users = readJson(USERS_FILE, {});
let jobs = readJson(JOBS_FILE, []);

/* ------------------------------------------------------------ passwords and sessions */
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
function setPassword(email, password, mustChange) {
  const salt = crypto.randomBytes(16).toString('hex');
  users[email] = Object.assign({ createdAt: new Date().toISOString() }, users[email], {
    salt, hash: hashPassword(password, salt), mustChangePassword: mustChange, passwordChangedAt: new Date().toISOString(),
  });
  writeJson(USERS_FILE, users);
}
function checkPassword(email, password) {
  const u = users[email];
  if (!u) return false;
  const a = Buffer.from(hashPassword(password, u.salt), 'hex'), b = Buffer.from(u.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function validEmail(email) {
  if (!/^[a-z0-9][a-z0-9._%+-]{0,63}@cargoservice\.in$/.test(email)) return false;
  return ALLOWED_EMAILS.length === 0 || ALLOWED_EMAILS.includes(email);
}

const sessions = new Map();           // token -> { email, expires }
function newSession(email) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { email, expires: Date.now() + SESSION_HOURS * 3600e3 });
  return token;
}
function dropSessions(email, except) {
  for (const [t, s] of sessions) if (s.email === email && t !== except) sessions.delete(t);
}
function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
  return out;
}
function currentSession(req) {
  const token = cookies(req).sid, s = token && sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now() || !users[s.email]) { sessions.delete(token); return null; }
  return { token, email: s.email, user: users[s.email] };
}
function sessionCookie(req, token, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}

/* login attempts: 10 per 15 minutes for each address + email */
const attempts = new Map();
function tooManyAttempts(key) {
  const now = Date.now(), a = attempts.get(key);
  if (!a || a.reset < now) { attempts.set(key, { n: 1, reset: now + 15 * 60e3 }); return false; }
  return ++a.n > 10;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, a] of attempts) if (a.reset < now) attempts.delete(k);
  for (const [t, s] of sessions) if (s.expires < now) sessions.delete(t);
}, 10 * 60e3).unref();

/* ------------------------------------------------------------ jobs */
const text = (v, max) => (typeof v === 'string' ? v : '').replace(/\r\n/g, '\n').trim().slice(0, max);
const lines = v => (Array.isArray(v) ? v : String(v || '').split('\n')).map(s => text(s, 300)).filter(Boolean).slice(0, 30);
function cleanJob(input) {
  const job = {
    title: text(input.title, 120),
    company: text(input.company, 120),
    location: text(input.location, 120),
    team: text(input.team, 80),
    experience: text(input.experience, 80),
    education: text(input.education, 120),
    about: text(input.about, 3000),
    duties: lines(input.duties),
    requirements: lines(input.requirements),
    applyUrl: text(input.applyUrl, 500),
    status: input.status === 'draft' ? 'draft' : 'published',
  };
  if (!job.title) return { error: 'The job title is required.' };
  if (job.applyUrl && !/^(https?:\/\/|mailto:)[^\s<>"']+$/i.test(job.applyUrl)) return { error: 'The apply link must start with https://, http:// or mailto:' };
  return { job };
}

/* ------------------------------------------------------------ http helpers */
function send(res, status, body, headers) {
  const json = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, Object.assign({
    'Content-Type': json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
  }, headers));
  res.end(json ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json/i.test(req.headers['content-type'] || '')) return reject(Object.assign(new Error('Send JSON.'), { status: 415 }));
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 100e3) { reject(Object.assign(new Error('Too large.'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); resolve(v && typeof v === 'object' ? v : {}); } catch (e) { reject(Object.assign(new Error('Bad JSON.'), { status: 400 })); } });
    req.on('error', reject);
  });
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch (e) { return false; }
}

/* ------------------------------------------------------------ api */
async function api(req, res, route) {
  const method = req.method;
  if (method !== 'GET' && !sameOrigin(req)) return send(res, 403, { error: 'Wrong origin.' });

  /* public: published jobs for the careers page */
  if (route === '/jobs' && method === 'GET') return send(res, 200, { jobs: jobs.filter(j => j.status === 'published') });

  if (route === '/login' && method === 'POST') {
    const body = await readBody(req);
    const email = text(body.email, 200).toLowerCase(), password = typeof body.password === 'string' ? body.password : '';
    if (tooManyAttempts(req.socket.remoteAddress + '|' + email)) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
    if (!validEmail(email)) return send(res, 403, { error: 'Only @' + EMAIL_DOMAIN + ' email addresses can log in.' });
    if (!users[email] && password === DEFAULT_PASSWORD) setPassword(email, DEFAULT_PASSWORD, true);   // first login
    if (!checkPassword(email, password)) return send(res, 401, { error: 'Wrong email or password.' });
    const token = newSession(email);
    return send(res, 200, { email, mustChangePassword: !!users[email].mustChangePassword }, { 'Set-Cookie': sessionCookie(req, token, SESSION_HOURS * 3600) });
  }

  const session = currentSession(req);
  if (route === '/me' && method === 'GET') {
    return session ? send(res, 200, { email: session.email, mustChangePassword: !!session.user.mustChangePassword }) : send(res, 401, { error: 'Not logged in.' });
  }
  if (!session) return send(res, 401, { error: 'Not logged in.' });

  if (route === '/logout' && method === 'POST') {
    sessions.delete(session.token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }
  if (route === '/change-password' && method === 'POST') {
    const body = await readBody(req);
    const current = typeof body.currentPassword === 'string' ? body.currentPassword : '', next = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (!checkPassword(session.email, current)) return send(res, 401, { error: 'The current password is wrong.' });
    if (next.length < MIN_PASSWORD || next.length > 200) return send(res, 400, { error: 'The new password needs at least ' + MIN_PASSWORD + ' characters.' });
    if (next === DEFAULT_PASSWORD) return send(res, 400, { error: 'The new password cannot be the default password.' });
    if (next === current) return send(res, 400, { error: 'The new password must be different from the current one.' });
    setPassword(session.email, next, false);
    dropSessions(session.email, session.token);
    return send(res, 200, { ok: true });
  }

  /* everything below changes or lists jobs: blocked until the default password is changed */
  if (session.user.mustChangePassword) return send(res, 403, { error: 'Change your password first.', mustChangePassword: true });

  if (route === '/admin/jobs' && method === 'GET') return send(res, 200, { jobs });

  if (route === '/jobs' && method === 'POST') {
    const { job, error } = cleanJob(await readBody(req));
    if (error) return send(res, 400, { error });
    const now = new Date().toISOString();
    Object.assign(job, { id: crypto.randomBytes(6).toString('hex'), createdAt: now, updatedAt: now, updatedBy: session.email });
    jobs.unshift(job); writeJson(JOBS_FILE, jobs);
    return send(res, 201, { job });
  }
  const m = /^\/jobs\/([a-z0-9-]{1,40})$/.exec(route);
  if (m) {
    const i = jobs.findIndex(j => j.id === m[1]);
    if (i < 0) return send(res, 404, { error: 'Job not found.' });
    if (method === 'PUT') {
      const { job, error } = cleanJob(await readBody(req));
      if (error) return send(res, 400, { error });
      jobs[i] = Object.assign(job, { id: jobs[i].id, createdAt: jobs[i].createdAt, updatedAt: new Date().toISOString(), updatedBy: session.email });
      writeJson(JOBS_FILE, jobs);
      return send(res, 200, { job: jobs[i] });
    }
    if (method === 'DELETE') {
      jobs.splice(i, 1); writeJson(JOBS_FILE, jobs);
      return send(res, 200, { ok: true });
    }
  }
  return send(res, 404, { error: 'Not found.' });
}

/* ------------------------------------------------------------ static files: only pages in this folder and /assets */
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (!/^\/[a-z0-9-]+\.html$/.test(pathname) && !/^\/assets\/[a-z0-9._-]+$/i.test(pathname)) return send(res, 404, 'Not found');
  const file = path.join(ROOT, pathname), type = TYPES[path.extname(file).toLowerCase()];
  if (!type) return send(res, 404, 'Not found');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, data, { 'Content-Type': type, 'Cache-Control': pathname === '/admin.html' ? 'no-store' : 'no-cache' });
  });
}

http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { return send(res, 400, 'Bad request'); }
  if (pathname.startsWith('/api/')) {
    return api(req, res, pathname.slice(4)).catch(e => { if (!e.status) console.error(e); send(res, e.status || 500, { error: e.status ? e.message : 'Server error.' }); });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  serveStatic(req, res, pathname);
}).listen(PORT, HOST, () => {
  console.log(`Cargo Services demo: http://${HOST}:${PORT}`);
  console.log(`Admin page:          http://${HOST}:${PORT}/admin.html`);
  if (ALLOWED_EMAILS.length) console.log('Login allowed for: ' + ALLOWED_EMAILS.join(', '));
});
