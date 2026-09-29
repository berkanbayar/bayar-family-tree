import crypto from 'node:crypto';
import { HttpError } from './errors.js';

const COOKIE = 'bayar_session';

/**
 * Erişim modları:
 *  - open    : ADMIN_PASSWORD yok → herkes düzenleyebilir (sadece yerel kullanım için)
 *  - public  : sadece ADMIN_PASSWORD → herkes ağacı görür (iletişim bilgisi hariç), yönetici düzenler
 *  - private : ADMIN_PASSWORD + VIEW_PASSWORD → site aile şifresiyle kapalı, yönetici düzenler
 *
 * Roller: editor > member > guest
 */
export function createAuth(config) {
  const mode = !config.adminPassword ? 'open' : config.viewPassword ? 'private' : 'public';
  const attempts = new Map();

  const hmac = (data) => crypto.createHmac('sha256', config.sessionSecret).update(data).digest('base64url');

  const safeEqual = (a, b) => {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
  };

  function sign(role) {
    const payload = Buffer.from(JSON.stringify({ role, exp: Date.now() + config.sessionDays * 864e5 })).toString('base64url');
    return `${payload}.${hmac(payload)}`;
  }

  function verify(token) {
    const [payload, sig] = String(token ?? '').split('.');
    if (!payload || !sig || !safeEqual(sig, hmac(payload))) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
      return data.exp > Date.now() ? data.role : null;
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

  function roleOf(req) {
    if (mode === 'open') return 'editor';
    const role = verify(readCookie(req));
    if (role === 'editor' || role === 'member') return role;
    return mode === 'public' ? 'guest' : null;
  }

  function checkRateLimit(ip) {
    const now = Date.now();
    const entry = attempts.get(ip);
    if (!entry || entry.reset < now) {
      attempts.set(ip, { count: 1, reset: now + 60_000 });
      return;
    }
    if (++entry.count > 8) throw new HttpError(429, 'Çok fazla deneme. Bir dakika sonra tekrar deneyin.');
  }

  return {
    mode,

    middleware(req, _res, next) {
      req.role = roleOf(req);
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
      checkRateLimit(req.ip);
      const password = String(req.body?.password ?? '');
      let role = null;
      if (config.adminPassword && safeEqual(password, config.adminPassword)) role = 'editor';
      else if (config.viewPassword && safeEqual(password, config.viewPassword)) role = 'member';
      if (!role) throw new HttpError(401, 'Şifre hatalı');
      res.cookie(COOKIE, sign(role), {
        httpOnly: true,
        sameSite: 'lax',
        secure: req.secure,
        maxAge: config.sessionDays * 864e5,
        path: '/',
      });
      return role;
    },

    logout(res) {
      res.clearCookie(COOKIE, { path: '/' });
    },
  };
}
