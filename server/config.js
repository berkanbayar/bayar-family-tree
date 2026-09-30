import crypto from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 3000,
    host: env.HOST || '0.0.0.0',
    dbPath: env.DB_PATH || path.join(root, 'data', 'family.db'),
    adminPassword: env.ADMIN_PASSWORD || '',
    viewPassword: env.VIEW_PASSWORD || '',
    // Sabit bir SESSION_SECRET verilmezse her yeniden başlatmada oturumlar düşer.
    sessionSecret: env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    sessionDays: Number(env.SESSION_DAYS) || 30,
    trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
    // E-posta ile giriş: bu adresler her zaman yönetici; diğer üyeler uygulamadan davet edilir
    adminEmails: String(env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
    publicView: env.PUBLIC_VIEW === '1' || env.PUBLIC_VIEW === 'true',
    appUrl: (env.APP_URL || '').replace(/\/+$/, ''),
    smtp: {
      host: env.SMTP_HOST || '',
      port: Number(env.SMTP_PORT) || 587,
      secure: env.SMTP_SECURE === '1' || env.SMTP_SECURE === 'true' || Number(env.SMTP_PORT) === 465,
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || '',
      from: env.SMTP_FROM || env.SMTP_USER || '',
    },
    publicDir: path.join(root, 'public'),
  };
}
