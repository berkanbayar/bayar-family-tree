import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// Her eleman bir şema sürümü; sadece sona ekleme yapılır, eskiler değiştirilmez.
const MIGRATIONS = [
  `
  CREATE TABLE persons (
    id              INTEGER PRIMARY KEY,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL DEFAULT '',
    maiden_name     TEXT NOT NULL DEFAULT '',
    gender          TEXT NOT NULL DEFAULT '' CHECK (gender IN ('', 'E', 'K')),
    birth_year      INTEGER,
    death_year      INTEGER,
    is_alive        INTEGER NOT NULL DEFAULT 1 CHECK (is_alive IN (0, 1)),
    birth_place     TEXT NOT NULL DEFAULT '',
    city            TEXT NOT NULL DEFAULT '',
    job             TEXT NOT NULL DEFAULT '',
    phone           TEXT NOT NULL DEFAULT '',
    email           TEXT NOT NULL DEFAULT '',
    notes           TEXT NOT NULL DEFAULT '',
    parent_union_id INTEGER REFERENCES unions(id) ON DELETE SET NULL,
    legacy_id       TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE unions (
    id          INTEGER PRIMARY KEY,
    partner1_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
    partner2_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
    start_year  INTEGER,
    end_year    INTEGER,
    status      TEXT NOT NULL DEFAULT 'married' CHECK (status IN ('married', 'divorced', 'widowed')),
    notes       TEXT NOT NULL DEFAULT '',
    legacy_id   TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX idx_persons_parent_union ON persons(parent_union_id);
  CREATE INDEX idx_unions_partner1 ON unions(partner1_id);
  CREATE INDEX idx_unions_partner2 ON unions(partner2_id);
  `,
  // v2: tam tarih (gün/ay ayrı; yıl bilinmese de doğum günü tutulabilir), vefat ve mezar yeri
  `
  ALTER TABLE persons ADD COLUMN birth_month INTEGER;
  ALTER TABLE persons ADD COLUMN birth_day INTEGER;
  ALTER TABLE persons ADD COLUMN death_month INTEGER;
  ALTER TABLE persons ADD COLUMN death_day INTEGER;
  ALTER TABLE persons ADD COLUMN death_place TEXT NOT NULL DEFAULT '';
  ALTER TABLE persons ADD COLUMN burial_place TEXT NOT NULL DEFAULT '';
  `,
  // v3: e-posta ile giriş: davetli üyeler ve tek kullanımlık giriş kodları
  `
  CREATE TABLE members (
    id            INTEGER PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL DEFAULT '',
    role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'editor')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );

  CREATE TABLE login_codes (
    id         INTEGER PRIMARY KEY,
    email      TEXT NOT NULL COLLATE NOCASE,
    code_hash  TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    attempts   INTEGER NOT NULL DEFAULT 0,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_login_codes_email ON login_codes(email, created_at);
  `,
];

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  return db;
}
