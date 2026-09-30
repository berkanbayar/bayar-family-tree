import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';

const config = loadConfig();
const db = openDb(config.dbPath);
const app = createApp({ db, config });

const server = app.listen(config.port, config.host, () => {
  const mode = {
    open: 'AÇIK (giriş yok, herkes düzenleyebilir)',
    public: 'HERKESE AÇIK (ziyaretçi salt okunur)',
    private: 'ÖZEL (sadece giriş yapanlar)',
  }[app.locals.authMode];
  const methods = [config.adminEmails.length && 'e-posta kodu', (config.adminPassword || config.viewPassword) && 'şifre'].filter(Boolean);
  console.log(`🌳 Bayar Soy Ağacı → http://localhost:${config.port}`);
  console.log(`   Veritabanı: ${config.dbPath}`);
  console.log(`   Erişim modu: ${mode}${methods.length ? ` · giriş: ${methods.join(', ')}` : ''}`);
  if (config.adminEmails.length && !config.smtp.host) console.warn('   ⚠️  SMTP_HOST tanımlı değil; giriş kodları sadece bu konsola yazılır.');
  if (!process.env.SESSION_SECRET && app.locals.authMode !== 'open') {
    console.warn('   ⚠️  SESSION_SECRET tanımlı değil; yeniden başlatınca oturumlar kapanır.');
  }
});

const shutdown = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
