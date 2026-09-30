import { badRequest, conflict, notFound } from './errors.js';

const TEXT_LIMIT = 200;
const NOTES_LIMIT = 5000;
const PRIVATE_FIELDS = ['phone', 'email', 'notes'];
const UNION_STATUSES = ['married', 'divorced', 'widowed'];

const PERSON_SCHEMA = {
  first_name: 'text',
  last_name: 'text',
  maiden_name: 'text',
  gender: 'gender',
  birth_year: 'year',
  birth_month: 'month',
  birth_day: 'day',
  death_year: 'year',
  death_month: 'month',
  death_day: 'day',
  is_alive: 'bool',
  birth_place: 'text',
  death_place: 'text',
  burial_place: 'text',
  city: 'text',
  job: 'text',
  phone: 'text',
  email: 'text',
  notes: 'notes',
  parent_union_id: 'id',
};

const UNION_SCHEMA = {
  partner1_id: 'id',
  partner2_id: 'id',
  start_year: 'year',
  end_year: 'year',
  status: 'status',
  notes: 'notes',
};

function cleanValue(type, value, field) {
  switch (type) {
    case 'text':
      return String(value ?? '').trim().slice(0, TEXT_LIMIT);
    case 'notes':
      return String(value ?? '').trim().slice(0, NOTES_LIMIT);
    case 'gender': {
      const g = String(value ?? '').trim().toUpperCase();
      if (!['', 'E', 'K'].includes(g)) throw badRequest(`Geçersiz cinsiyet: ${value}`);
      return g;
    }
    case 'year': {
      if (value === '' || value == null) return null;
      const y = Number(value);
      if (!Number.isInteger(y) || y < 1000 || y > 2200) throw badRequest(`Geçersiz yıl (${field}): ${value}`);
      return y;
    }
    case 'month':
    case 'day': {
      if (value === '' || value == null) return null;
      const n = Number(value);
      const max = type === 'month' ? 12 : 31;
      if (!Number.isInteger(n) || n < 1 || n > max) throw badRequest(`Geçersiz ${type === 'month' ? 'ay' : 'gün'}: ${value}`);
      return n;
    }
    case 'bool':
      return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
    case 'id': {
      if (value === '' || value == null) return null;
      const id = Number(value);
      if (!Number.isInteger(id) || id < 1) throw badRequest(`Geçersiz kimlik (${field})`);
      return id;
    }
    case 'status': {
      const s = String(value ?? 'married');
      if (!UNION_STATUSES.includes(s)) throw badRequest(`Geçersiz evlilik durumu: ${value}`);
      return s;
    }
    default:
      throw new Error(`Bilinmeyen alan tipi: ${type}`);
  }
}

function clean(schema, input, { partial }) {
  if (!input || typeof input !== 'object') throw badRequest('Geçersiz veri');
  const out = {};
  for (const [field, type] of Object.entries(schema)) {
    if (field in input) out[field] = cleanValue(type, input[field], field);
    else if (!partial) out[field] = cleanValue(type, undefined, field);
  }
  return out;
}

export function cleanPerson(input, { partial = false } = {}) {
  const p = clean(PERSON_SCHEMA, input, { partial });
  if (!partial && !('is_alive' in input)) p.is_alive = 1;
  if ('first_name' in p && !p.first_name) throw badRequest('Ad alanı zorunludur');
  return p;
}

const DEATH_FIELDS = { death_year: null, death_month: null, death_day: null, death_place: '', burial_place: '' };

// Birleşik (mevcut + yeni) kayıt üzerinde tarih tutarlılığını kontrol eder.
export function checkDates(p) {
  for (const [label, prefix] of [['Doğum', 'birth'], ['Vefat', 'death']]) {
    const y = p[`${prefix}_year`];
    const m = p[`${prefix}_month`];
    const d = p[`${prefix}_day`];
    if (d != null && m == null) throw badRequest(`${label} günü girildiyse ayı da girilmeli`);
    if (d != null && d > new Date(Date.UTC(y ?? 2000, m, 0)).getUTCDate()) {
      throw badRequest(`${label} tarihi geçersiz: ${d}.${m}${y ? '.' + y : ''}`);
    }
  }
  if (p.birth_year && p.death_year && p.death_year < p.birth_year) throw badRequest('Vefat yılı doğum yılından önce olamaz');
}

// Hayatta olan kişinin vefat bilgileri boşaltılır.
function normalizeDeath(data, merged) {
  if (merged.is_alive) Object.assign(data, DEATH_FIELDS);
}

export function stripPrivate(person) {
  const copy = { ...person };
  for (const f of PRIVATE_FIELDS) delete copy[f];
  return copy;
}

export function createRepo(db) {
  const q = {
    person: db.prepare('SELECT * FROM persons WHERE id = ?'),
    union: db.prepare('SELECT * FROM unions WHERE id = ?'),
    allPersons: db.prepare('SELECT * FROM persons ORDER BY id'),
    allUnions: db.prepare('SELECT * FROM unions ORDER BY id'),
    soloUnionOf: db.prepare(
      `SELECT * FROM unions
       WHERE (partner1_id = @id AND partner2_id IS NULL) OR (partner2_id = @id AND partner1_id IS NULL)
       ORDER BY id LIMIT 1`,
    ),
    unionBetween: db.prepare(
      `SELECT id FROM unions
       WHERE (partner1_id = @a AND partner2_id = @b) OR (partner1_id = @b AND partner2_id = @a)`,
    ),
    deleteOrphanUnions: db.prepare(
      `DELETE FROM unions
       WHERE partner1_id IS NULL AND partner2_id IS NULL
         AND id NOT IN (SELECT parent_union_id FROM persons WHERE parent_union_id IS NOT NULL)`,
    ),
  };

  function getPerson(id) {
    const p = q.person.get(id);
    if (!p) throw notFound('Kişi bulunamadı');
    return p;
  }

  function getUnion(id) {
    const u = q.union.get(id);
    if (!u) throw notFound('Evlilik kaydı bulunamadı');
    return u;
  }

  // personId'nin, unionId ailesinin atası (veya kendisi) olup olmadığını kontrol eder.
  function isAncestorOfUnion(personId, unionId) {
    const seen = new Set();
    const stack = [unionId];
    while (stack.length) {
      const uid = stack.pop();
      if (uid == null || seen.has(uid)) continue;
      seen.add(uid);
      const u = q.union.get(uid);
      if (!u) continue;
      for (const pid of [u.partner1_id, u.partner2_id]) {
        if (pid == null) continue;
        if (pid === personId) return true;
        stack.push(q.person.get(pid)?.parent_union_id);
      }
    }
    return false;
  }

  function assertParentUnion(personId, unionId) {
    if (unionId == null) return;
    getUnion(unionId);
    if (personId != null && isAncestorOfUnion(personId, unionId)) {
      throw badRequest('Bu bağlantı döngü oluşturur (kişi kendi atası olamaz)');
    }
  }

  function insertPerson(data) {
    const cols = Object.keys(data);
    const sql = `INSERT INTO persons (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`;
    return Number(db.prepare(sql).run(data).lastInsertRowid);
  }

  function insertUnion(data) {
    const u = { partner1_id: null, partner2_id: null, start_year: null, end_year: null, status: 'married', notes: '', ...data };
    if (u.partner1_id != null && u.partner1_id === u.partner2_id) throw badRequest('Bir kişi kendisiyle evlenemez');
    for (const pid of [u.partner1_id, u.partner2_id]) if (pid != null) getPerson(pid);
    if (u.partner1_id != null && u.partner2_id != null && q.unionBetween.get({ a: u.partner1_id, b: u.partner2_id })) {
      throw conflict('Bu iki kişi arasında zaten bir evlilik kaydı var');
    }
    const cols = Object.keys(u);
    const sql = `INSERT INTO unions (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`;
    return Number(db.prepare(sql).run(u).lastInsertRowid);
  }

  function update(table, id, data) {
    const cols = Object.keys(data);
    if (!cols.length) return;
    const sql = `UPDATE ${table} SET ${cols.map((c) => `${c} = @${c}`).join(', ')}, updated_at = datetime('now') WHERE id = @id`;
    db.prepare(sql).run({ ...data, id });
  }

  function setParentUnion(childId, unionId) {
    assertParentUnion(childId, unionId);
    update('persons', childId, { parent_union_id: unionId });
  }

  // "other" kişisini "anchor" kişisine type ilişkisiyle bağlar.
  // type: 'spouse' | 'child' (other, anchor'ın çocuğu) | 'parent' (other, anchor'ın ebeveyni)
  function link(anchorId, type, otherId, unionId = null) {
    const anchor = getPerson(anchorId);
    getPerson(otherId);
    if (anchorId === otherId) throw badRequest('Kişi kendisiyle ilişkilendirilemez');

    if (type === 'spouse') {
      return { union_id: insertUnion({ partner1_id: anchorId, partner2_id: otherId }) };
    }

    if (type === 'child') {
      let uid = unionId;
      if (uid != null) {
        const u = getUnion(uid);
        if (u.partner1_id !== anchorId && u.partner2_id !== anchorId) throw badRequest('Seçilen evlilik bu kişiye ait değil');
      } else {
        uid = q.soloUnionOf.get({ id: anchorId })?.id ?? insertUnion({ partner1_id: anchorId });
      }
      setParentUnion(otherId, uid);
      return { union_id: uid };
    }

    if (type === 'parent') {
      if (anchor.parent_union_id != null) {
        const u = getUnion(anchor.parent_union_id);
        if (u.partner1_id === otherId || u.partner2_id === otherId) return { union_id: u.id };
        const slot = u.partner1_id == null ? 'partner1_id' : u.partner2_id == null ? 'partner2_id' : null;
        if (!slot) throw conflict('Bu kişinin iki ebeveyni zaten kayıtlı');
        if (isAncestorOfUnion(anchorId, getPerson(otherId).parent_union_id)) {
          throw badRequest('Bu bağlantı döngü oluşturur');
        }
        const partner = u.partner1_id ?? u.partner2_id;
        if (partner != null && q.unionBetween.get({ a: partner, b: otherId })) {
          throw conflict('Bu iki ebeveyn arasında zaten ayrı bir evlilik kaydı var; çocuğu o evliliğe bağlayın');
        }
        update('unions', u.id, { [slot]: otherId });
        return { union_id: u.id };
      }
      let uid = unionId;
      if (uid != null) {
        const u = getUnion(uid);
        if (u.partner1_id !== otherId && u.partner2_id !== otherId) throw badRequest('Seçilen evlilik ebeveyne ait değil');
      } else {
        uid = insertUnion({ partner1_id: otherId });
      }
      setParentUnion(anchorId, uid);
      return { union_id: uid };
    }

    throw badRequest(`Geçersiz ilişki tipi: ${type}`);
  }

  return {
    getFamily({ includePrivate }) {
      const people = q.allPersons.all();
      return {
        people: includePrivate ? people : people.map(stripPrivate),
        unions: q.allUnions.all(),
      };
    },

    getPerson,
    getUnion,

    createPerson: db.transaction((input, relation) => {
      const data = cleanPerson(input);
      normalizeDeath(data, data);
      checkDates(data);
      const parentUnion = data.parent_union_id;
      delete data.parent_union_id;
      const id = insertPerson(data);
      if (parentUnion != null) setParentUnion(id, parentUnion);
      if (relation?.type) link(Number(relation.anchor_id), relation.type, id, relation.union_id ?? null);
      return getPerson(id);
    }),

    updatePerson: db.transaction((id, input) => {
      const current = getPerson(id);
      const data = cleanPerson(input, { partial: true });
      normalizeDeath(data, { ...current, ...data });
      checkDates({ ...current, ...data });
      if ('parent_union_id' in data) assertParentUnion(id, data.parent_union_id);
      update('persons', id, data);
      return getPerson(id);
    }),

    deletePerson: db.transaction((id) => {
      getPerson(id);
      db.prepare('DELETE FROM persons WHERE id = ?').run(id);
      q.deleteOrphanUnions.run();
    }),

    link: db.transaction((anchorId, type, otherId, unionId) => link(anchorId, type, otherId, unionId)),

    createUnion: db.transaction((input) => {
      const data = clean(UNION_SCHEMA, input, { partial: true });
      return getUnion(insertUnion(data));
    }),

    updateUnion: db.transaction((id, input) => {
      const current = getUnion(id);
      const data = clean(UNION_SCHEMA, input, { partial: true });
      const p1 = 'partner1_id' in data ? data.partner1_id : current.partner1_id;
      const p2 = 'partner2_id' in data ? data.partner2_id : current.partner2_id;
      if (p1 != null && p1 === p2) throw badRequest('Bir kişi kendisiyle evlenemez');
      for (const pid of [p1, p2]) if (pid != null) getPerson(pid);
      update('unions', id, data);
      return getUnion(id);
    }),

    deleteUnion: db.transaction((id) => {
      getUnion(id);
      db.prepare('DELETE FROM unions WHERE id = ?').run(id);
    }),

    // Tüm veriyi siler ve verilen kayıtlarla değiştirir (içe aktarma ve yedekten dönüş).
    // Kayıtlar "key" ile birbirine bağlanır: person.parent_union_key -> union.key, union.partnerX_key -> person.key
    replaceAll: db.transaction(({ people, unions }) => {
      db.exec('DELETE FROM persons; DELETE FROM unions;');
      const personIds = new Map();
      for (const rec of people) {
        const data = cleanPerson(rec);
        delete data.parent_union_id;
        if (Number.isInteger(rec.id)) data.id = rec.id;
        if (rec.legacy_id != null) data.legacy_id = String(rec.legacy_id);
        personIds.set(rec.key, insertPerson(data));
      }
      const unionIds = new Map();
      for (const rec of unions) {
        const data = clean(UNION_SCHEMA, rec, { partial: true });
        data.partner1_id = personIds.get(rec.partner1_key) ?? null;
        data.partner2_id = personIds.get(rec.partner2_key) ?? null;
        if (Number.isInteger(rec.id)) data.id = rec.id;
        if (rec.legacy_id != null) data.legacy_id = String(rec.legacy_id);
        const cols = Object.keys(data);
        const info = db
          .prepare(`INSERT INTO unions (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`)
          .run(data);
        unionIds.set(rec.key, Number(info.lastInsertRowid));
      }
      const setParent = db.prepare('UPDATE persons SET parent_union_id = ? WHERE id = ?');
      for (const rec of people) {
        if (rec.parent_union_key == null) continue;
        const uid = unionIds.get(rec.parent_union_key);
        if (uid != null) setParent.run(uid, personIds.get(rec.key));
      }
      return { people: personIds.size, unions: unionIds.size };
    }),

    exportAll() {
      return { format: 'bayar-family-tree', version: 1, exported_at: new Date().toISOString(), ...this.getFamily({ includePrivate: true }) };
    },
  };
}

// Yedek dosyasını (exportAll çıktısı) replaceAll formatına çevirir.
export function backupToRecords(backup) {
  if (!backup || !Array.isArray(backup.people) || !Array.isArray(backup.unions)) {
    throw badRequest('Geçersiz yedek dosyası');
  }
  return {
    people: backup.people.map((p) => ({ ...p, key: p.id, parent_union_key: p.parent_union_id })),
    unions: backup.unions.map((u) => ({ ...u, key: u.id, partner1_key: u.partner1_id, partner2_key: u.partner2_id })),
  };
}
