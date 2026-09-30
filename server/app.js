import express from 'express';
import { createAuth } from './auth.js';
import { badRequest, HttpError } from './errors.js';
import { createMailer } from './mailer.js';
import { createMembers } from './members.js';
import { backupToRecords, createRepo } from './repo.js';
import { recordsToRows, rowsToRecords } from './sheet.js';

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const id = (value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw badRequest('Geçersiz kimlik');
  return n;
};

export function createApp({ db, config, mailer = createMailer(config) }) {
  const app = express();
  const repo = createRepo(db);
  const auth = createAuth(config, db, mailer);
  const members = createMembers(db, config);
  app.locals.authMode = auth.mode;

  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    res.set({
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    next();
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(auth.middleware);

  const api = express.Router();
  const view = auth.requireView;
  const edit = auth.requireEdit;

  api.get('/health', (_req, res) => res.json({ ok: true }));

  api.get('/me', (req, res) => res.json({ role: req.role, mode: auth.mode, email: req.email, methods: auth.methods }));

  api.post('/auth/request-code', async (req, res) => {
    await auth.requestCode(req);
    res.json({ ok: true });
  });

  api.post('/auth/verify', (req, res) => res.json({ ...auth.verifyCode(req, res), mode: auth.mode }));

  api.get('/auth/link', (req, res) => auth.verifyLink(req, res));

  const emailOnly = (_req, _res, next) => next(auth.methods.email ? undefined : badRequest('E-posta ile giriş kapalı (ADMIN_EMAILS tanımlı değil)'));
  api.get('/members', edit, emailOnly, (_req, res) => res.json(members.list()));
  api.post('/members', edit, emailOnly, (req, res) => res.status(201).json(members.add(req.body)));
  api.patch('/members/:id', edit, emailOnly, (req, res) => res.json(members.update(id(req.params.id), req.body)));
  api.delete('/members/:id', edit, emailOnly, (req, res) => {
    members.remove(id(req.params.id));
    res.status(204).end();
  });

  api.post('/login', (req, res) => res.json({ role: auth.login(req, res), mode: auth.mode }));

  api.post('/logout', (_req, res) => {
    auth.logout(res);
    res.json({ ok: true });
  });

  api.get('/family', view, (req, res) => {
    const includePrivate = req.role === 'editor' || req.role === 'member';
    res.json({ ...repo.getFamily({ includePrivate }), role: req.role, mode: auth.mode, email: req.email, methods: auth.methods });
  });

  api.post('/people', edit, (req, res) => {
    const { relation, ...person } = req.body ?? {};
    res.status(201).json(repo.createPerson(person, relation));
  });

  api.patch('/people/:id', edit, (req, res) => res.json(repo.updatePerson(id(req.params.id), req.body)));

  api.delete('/people/:id', edit, (req, res) => {
    repo.deletePerson(id(req.params.id));
    res.status(204).end();
  });

  api.post('/people/:id/link', edit, (req, res) => {
    const { type, other_id, union_id } = req.body ?? {};
    res.json(repo.link(id(req.params.id), type, id(other_id), union_id == null ? null : id(union_id)));
  });

  api.post('/unions', edit, (req, res) => res.status(201).json(repo.createUnion(req.body)));

  api.patch('/unions/:id', edit, (req, res) => res.json(repo.updateUnion(id(req.params.id), req.body)));

  api.delete('/unions/:id', edit, (req, res) => {
    repo.deleteUnion(id(req.params.id));
    res.status(204).end();
  });

  // Excel/CSV satırları istemcide okunur, burada kayıtlara çevrilir.
  api.post('/import', edit, (req, res) => {
    const { rows, dryRun } = req.body ?? {};
    if (!Array.isArray(rows) || !rows.length) throw badRequest('Dosyada satır bulunamadı');
    const records = rowsToRecords(rows);
    const summary = { people: records.people.length, unions: records.unions.length, warnings: records.warnings };
    if (!records.people.length) throw badRequest('Tanınan bir isim sütunu bulunamadı (Ad Soyad / Ad)');
    if (!dryRun) repo.replaceAll(records);
    res.json({ ...summary, applied: !dryRun });
  });

  api.get('/export', edit, (_req, res) => {
    res.set('Content-Disposition', `attachment; filename="bayar-soy-agaci-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(repo.exportAll());
  });

  api.get('/export/rows', edit, (_req, res) => res.json(recordsToRows(repo.getFamily({ includePrivate: true }))));

  api.post('/restore', edit, (req, res) => res.json(repo.replaceAll(backupToRecords(req.body))));

  api.use((_req, _res, next) => next(new HttpError(404, 'Bulunamadı')));

  app.use('/api', api);
  app.use(express.static(config.publicDir, { maxAge: '1h', index: 'index.html' }));

  app.use((err, _req, res, _next) => {
    const status = err.status ?? err.statusCode ?? 500;
    if (status >= 500) console.error(err);
    const message = status >= 500 ? 'Sunucu hatası' : err.type === 'entity.parse.failed' ? 'Geçersiz JSON' : err.message;
    res.status(status).json({ error: message });
  });

  return app;
}
