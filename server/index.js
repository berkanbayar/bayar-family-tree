import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';

const config = loadConfig();
const db = openDb(config.dbPath);
const app = createApp({ db, config });

const server = app.listen(config.port, config.host, () => {
  const mode = !config.adminPassword ? 'AÇIK (şifresiz, herkes düzenleyebilir)' : config.viewPassword ? 'ÖZEL (aile şifresi)' : 'HERKESE AÇIK (salt okunur)';
  console.log(`🌳 Bayar Soy Ağacı → http://localhost:${config.port}`);
  console.log(`   Veritabanı: ${config.dbPath}`);
  console.log(`   Erişim modu: ${mode}`);
  if (!process.env.SESSION_SECRET && config.adminPassword) {
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
