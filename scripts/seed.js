// Geliştirme için kurgusal örnek aile yükler. Kullanım: npm run seed [-- --force]
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { createRepo } from '../server/repo.js';

const P = (key, first_name, last_name, gender, birth_year, extra = {}) => ({
  key, first_name, last_name, gender, birth_year, is_alive: 1, city: 'Çorum', ...extra,
});

export const SAMPLE = {
  people: [
    P('hasan', 'Hasan', 'Örnek', 'E', 1920, { is_alive: 0, death_year: 1992, job: 'Çiftçi', birth_place: 'Çorum' }),
    P('fatma', 'Fatma', 'Örnek', 'K', 1925, { is_alive: 0, death_year: 2008, maiden_name: 'Demir' }),
    P('mehmet', 'Mehmet', 'Örnek', 'E', 1948, { job: 'Öğretmen', phone: '0555 000 00 01', parent_union_key: 'u1' }),
    P('ayse', 'Ayşe', 'Örnek', 'K', 1952, { maiden_name: 'Kaya' }),
    P('ali', 'Ali', 'Örnek', 'E', 1951, { is_alive: 0, death_year: 2015, city: 'Ankara', parent_union_key: 'u1' }),
    P('zeynep', 'Zeynep', 'Örnek', 'K', 1955, { city: 'Ankara', maiden_name: 'Şahin' }),
    P('emine', 'Emine', 'Yıldız', 'K', 1954, { city: 'İstanbul', maiden_name: 'Örnek', parent_union_key: 'u1' }),
    P('osman', 'Osman', 'Yıldız', 'E', 1950, { city: 'İstanbul' }),
    P('burak', 'Burak', 'Örnek', 'E', 1975, { job: 'Mühendis', city: 'İstanbul', email: 'burak@example.com', parent_union_key: 'u2' }),
    P('selin', 'Selin', 'Örnek', 'K', 1978, { job: 'Doktor', city: 'İstanbul', maiden_name: 'Aksoy' }),
    P('elif', 'Elif', 'Arslan', 'K', 1979, { job: 'Avukat', maiden_name: 'Örnek', parent_union_key: 'u2' }),
    P('can', 'Can', 'Arslan', 'E', 1977),
    P('murat', 'Murat', 'Örnek', 'E', 1980, { city: 'Ankara', parent_union_key: 'u3' }),
    P('deniz', 'Deniz', 'Yıldız', 'K', 1982, { city: 'İzmir', parent_union_key: 'u4' }),
    P('kerem', 'Kerem', 'Örnek', 'E', 2005, { city: 'İstanbul', job: 'Öğrenci', parent_union_key: 'u5' }),
    P('ece', 'Ece', 'Örnek', 'K', 2009, { city: 'İstanbul', job: 'Öğrenci', parent_union_key: 'u5' }),
    P('ada', 'Ada', 'Arslan', 'K', 2012, { parent_union_key: 'u6' }),
    P('gul', 'Gül', 'Tekin', 'K', 1982, { city: 'Ankara' }),
    P('derya', 'Derya', 'Örnek', 'K', 1985, { city: 'Ankara', maiden_name: 'Uçar' }),
    P('yusuf', 'Yusuf', 'Örnek', 'E', 2006, { city: 'Ankara', job: 'Öğrenci', parent_union_key: 'u7' }),
    P('nil', 'Nil', 'Örnek', 'K', 2015, { city: 'Ankara', parent_union_key: 'u8' }),
  ],
  unions: [
    { key: 'u1', partner1_key: 'hasan', partner2_key: 'fatma', start_year: 1946 },
    { key: 'u2', partner1_key: 'mehmet', partner2_key: 'ayse', start_year: 1973 },
    { key: 'u3', partner1_key: 'ali', partner2_key: 'zeynep', start_year: 1978, status: 'widowed' },
    { key: 'u4', partner1_key: 'osman', partner2_key: 'emine', start_year: 1976 },
    { key: 'u5', partner1_key: 'burak', partner2_key: 'selin', start_year: 2003 },
    { key: 'u6', partner1_key: 'can', partner2_key: 'elif', start_year: 2010 },
    { key: 'u7', partner1_key: 'murat', partner2_key: 'gul', start_year: 2004, end_year: 2010, status: 'divorced' },
    { key: 'u8', partner1_key: 'murat', partner2_key: 'derya', start_year: 2013 },
  ],
};

if (import.meta.main ?? process.argv[1]?.endsWith('seed.js')) {
  const config = loadConfig();
  const db = openDb(config.dbPath);
  const count = db.prepare('SELECT COUNT(*) AS n FROM persons').get().n;
  if (count > 0 && !process.argv.includes('--force')) {
    console.error(`Veritabanında zaten ${count} kişi var. Üzerine yazmak için: npm run seed -- --force`);
    process.exit(1);
  }
  const result = createRepo(db).replaceAll(SAMPLE);
  console.log(`✅ Örnek aile yüklendi: ${result.people} kişi, ${result.unions} evlilik → ${config.dbPath}`);
  db.close();
}
