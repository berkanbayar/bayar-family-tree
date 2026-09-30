// Çalışan uygulamayı durdurmadan tutarlı SQLite yedeği alır ve eski yedekleri temizler.
// Kullanım: node scripts/backup.js [hedef_klasör] [saklanacak_adet]
// Docker:   docker compose exec -T soyagaci node scripts/backup.js
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { loadConfig } from '../server/config.js';

const config = loadConfig();
const dir = process.argv[2] || path.join(path.dirname(config.dbPath), 'backups');
const keep = Number(process.argv[3]) || 30;

fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const target = path.join(dir, `family-${stamp}.db`);

const db = new Database(config.dbPath, { readonly: true, fileMustExist: true });
await db.backup(target);
db.close();

const old = fs.readdirSync(dir).filter((f) => /^family-.*\.db$/.test(f)).sort().slice(0, -keep);
for (const f of old) fs.unlinkSync(path.join(dir, f));

console.log(`✅ Yedek: ${target} (${(fs.statSync(target).size / 1024).toFixed(0)} KB), silinen eski yedek: ${old.length}`);
