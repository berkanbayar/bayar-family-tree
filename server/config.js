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
    publicDir: path.join(root, 'public'),
  };
}
