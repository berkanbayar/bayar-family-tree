import crypto from 'node:crypto';
import { badRequest, HttpError } from './errors.js';

const COOKIE = 'bayar_session';
const CODE_TTL_MS = 15 * 60_000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Erişim modları:
 *  - open    : hiçbir giriş yöntemi yok → herkes düzenler (sadece yerel kullanım)
 *  - public  : herkes ağacı görür (iletişim bilgisi hariç), üyeler/yönetici giriş yapar
 *  - private : site kapalı, sadece giriş yapan görür
 *
 * Giriş yöntemleri:
 *  - e-posta : ADMIN_EMAILS tanımlıysa. Davetli üyeler e-postalarına gelen 6 haneli kod veya link ile girer
 *  - şifre   : ADMIN_PASSWORD (yönetici) / VIEW_PASSWORD (aile) — yedek ya da basit kurulum için
 *
 * Roller: editor > member > guest
 */
export function createAuth(config, db, mailer) {
  const emailEnabled = config.adminEmails.length > 0;
  const passwordEnabled = Boolean(config.adminPassword || config.viewPassword);
  const mode = !emailEnabled && !passwordEnabled
    ? 'open'
    : config.publicView || (!emailEnabled && !config.viewPassword)
      ? 'public'
      : 'private';
  const attempts = new Map();

  const q = {
    member: db.prepare('SELECT * FROM members WHERE email = ?'),
    touchMember: db.prepare("UPDATE members SET last_login_at = datetime('now') WHERE email = ?"),
    recentCodes: db.prepare('SELECT COUNT(*) AS n FROM login_codes WHERE email = ? AND created_at > ?'),
    expireOld: db.prepare('UPDATE login_codes SET used = 1 WHERE email = ? AND used = 0'),
    insertCode: db.prepare(
      'INSERT INTO login_codes (email, code_hash, token_hash, expires_at, created_at) VALUES (@email, @code_hash, @token_hash, @expires_at, @created_at)',
    ),
    activeCode: db.prepare('SELECT * FROM login_codes WHERE email = ? AND used = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1'),
    byToken: db.prepare('SELECT * FROM login_codes WHERE token_hash = ? AND used = 0 AND expires_at > ?'),
    bumpAttempts: db.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?'),
    markUsed: db.prepare('UPDATE login_codes SET used = 1 WHERE id = ?'),
    cleanup: db.prepare('DELETE FROM login_codes WHERE expires_at < ?'),
  };

  const hmac = (data) => crypto.createHmac('sha256', config.sessionSecret).update(data).digest('base64url');

  const safeEqual = (a, b) => {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
  };

  const normalizeEmail = (v) => String(v ?? '').trim().toLowerCase();

  function sign(sub) {
    const payload = Buffer.from(JSON.stringify({ sub, exp: Date.now() + config.sessionDays * 864e5 })).toString('base64url');
    return `${payload}.${hmac(payload)}`;
  }

  function verify(token) {
    const [payload, sig] = String(token ?? '').split('.');
    if (!payload || !sig || !safeEqual(sig, hmac(payload))) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
      return data.exp > Date.now() ? data : null;
    } catch {
      return null;
    }
  }

  function readCookie(req) {
    const header = req.headers.cookie ?? '';
    for (const part of header.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === COOKIE) return decodeURIComponent(v.join('='));
    }
    return null;
  }

  // E-postanın rolü, her istekte veritabanından okunur: üyelikten çıkarılan kişinin oturumu hemen geçersiz olur.
  function roleForEmail(email) {
    if (config.adminEmails.includes(email)) return 'editor';
    return q.member.get(email)?.role ?? null;
  }

  function identify(req) {
    if (mode === 'open') return { role: 'editor', email: null };
    const session = verify(readCookie(req));
    const sub = session?.sub ?? (session?.role ? `pw:${session.role}` : null);
    let role = null;
    let email = null;
    if (sub?.startsWith('email:')) {
      email = sub.slice(6);
      role = emailEnabled ? roleForEmail(email) : null;
    } else if (sub === 'pw:editor' && config.adminPassword) role = 'editor';
    else if (sub === 'pw:member' && config.viewPassword) role = 'member';
    if (!role) return { role: mode === 'public' ? 'guest' : null, email: null };
    return { role, email };
  }

  // IP başına dakikalık sınır; her işlem (şifre, kod isteme, kod doğrulama) ayrı sayılır
  function checkRateLimit(action, ip, limit) {
    const now = Date.now();
    const key = `${action}:${ip}`;
    const entry = attempts.get(key);
    if (!entry || entry.reset < now) {
      if (attempts.size > 10_000) attempts.clear();
      attempts.set(key, { count: 1, reset: now + 60_000 });
      return;
    }
    if (++entry.count > limit) throw new HttpError(429, 'Çok fazla deneme. Bir dakika sonra tekrar deneyin.');
  }

  function startSession(req, res, sub) {
    res.cookie(COOKIE, sign(sub), {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      maxAge: config.sessionDays * 864e5,
      path: '/',
    });
  }

  function baseUrl(req) {
    return config.appUrl || `${req.protocol}://${req.get('host')}`;
  }

  return {
    mode,
    methods: { email: emailEnabled, password: passwordEnabled },

    middleware(req, _res, next) {
      const { role, email } = identify(req);
      req.role = role;
      req.email = email;
      next();
    },

    requireView(req, _res, next) {
      if (!req.role) return next(new HttpError(401, 'Giriş yapmanız gerekiyor'));
      next();
    },

    requireEdit(req, _res, next) {
      if (req.role !== 'editor') return next(new HttpError(req.role ? 403 : 401, 'Bu işlem için yönetici girişi gerekiyor'));
      next();
    },

    login(req, res) {
      checkRateLimit('password', req.ip, 8);
      const password = String(req.body?.password ?? '');
      let role = null;
      if (config.adminPassword && safeEqual(password, config.adminPassword)) role = 'editor';
      else if (config.viewPassword && safeEqual(password, config.viewPassword)) role = 'member';
      if (!role) throw new HttpError(401, 'Şifre hatalı');
      startSession(req, res, `pw:${role}`);
      return role;
    },

    // Davetli değilse de aynı cevap döner; kimin üye olduğu dışarıdan anlaşılmaz.
    async requestCode(req) {
      if (!emailEnabled) throw badRequest('E-posta ile giriş bu kurulumda kapalı');
      checkRateLimit('request', req.ip, 10);
      const email = normalizeEmail(req.body?.email);
      if (!EMAIL_RE.test(email)) throw badRequest('Geçerli bir e-posta adresi girin');
      const now = Date.now();
      q.cleanup.run(now - 864e5);
      if (!roleForEmail(email)) return;
      if (q.recentCodes.get(email, now - 3600e3).n >= MAX_CODES_PER_HOUR) {
        throw new HttpError(429, 'Çok fazla kod istendi. Biraz sonra tekrar deneyin.');
      }
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      const token = crypto.randomBytes(32).toString('base64url');
      db.transaction(() => {
        q.expireOld.run(email);
        q.insertCode.run({
          email,
          code_hash: hmac(`code:${email}:${code}`),
          token_hash: hmac(`token:${token}`),
          expires_at: now + CODE_TTL_MS,
          created_at: now,
        });
      })();
      try {
        await mailer.sendLoginCode({
          to: email,
          code,
          link: `${baseUrl(req)}/api/auth/link?token=${token}`,
          name: q.member.get(email)?.name ?? '',
        });
      } catch (err) {
        console.error('Mail gönderilemedi:', err.message);
        throw new HttpError(502, 'E-posta gönderilemedi. Lütfen biraz sonra tekrar deneyin.');
      }
    },

    verifyCode(req, res) {
      // Kaba kuvvete asıl engel kod başına 5 deneme ve saatte 5 kod sınırıdır
      checkRateLimit('verify', req.ip, 20);
      const email = normalizeEmail(req.body?.email);
      const code = String(req.body?.code ?? '').replace(/\D/g, '');
      const row = q.activeCode.get(email, Date.now());
      if (!row) throw new HttpError(400, 'Kodun süresi dolmuş. Yeni kod isteyin.');
      if (row.attempts >= MAX_CODE_ATTEMPTS) {
        q.markUsed.run(row.id);
        throw new HttpError(429, 'Çok fazla hatalı deneme. Yeni kod isteyin.');
      }
      if (!safeEqual(hmac(`code:${email}:${code}`), row.code_hash)) {
        q.bumpAttempts.run(row.id);
        throw new HttpError(400, 'Kod hatalı');
      }
      const role = roleForEmail(email);
      if (!role) throw new HttpError(403, 'Bu e-posta artık davetli değil');
      q.markUsed.run(row.id);
      q.touchMember.run(email);
      startSession(req, res, `email:${email}`);
      return { role, email };
    },

    // Maildeki link: başarılıysa ana sayfaya, değilse giriş ekranına hata ile yönlendirir.
    verifyLink(req, res) {
      const row = q.byToken.get(hmac(`token:${String(req.query.token ?? '')}`), Date.now());
      if (!row || !roleForEmail(row.email)) return res.redirect('/#/giris?hata=link');
      q.markUsed.run(row.id);
      q.touchMember.run(row.email);
      startSession(req, res, `email:${row.email}`);
      res.redirect('/#/');
    },

    logout(res) {
      res.clearCookie(COOKIE, { path: '/' });
    },
  };
}
