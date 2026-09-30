// Excel/CSV satırları <-> veritabanı kayıtları dönüşümü.
// Eski index.html'in kullandığı sütun düzeniyle uyumludur (ID, Ad Soyad, Evlilik ID, EBEVEYN Evlilik ID ...).

const ALIASES = {
  id: ['id'],
  fullName: ['adsoyad', 'adisoyadi', 'isim', 'name', 'fullname'],
  firstName: ['ad', 'adi', 'firstname'],
  lastName: ['soyad', 'soyadi', 'lastname', 'surname'],
  maidenName: ['kizliksoyadi', 'kizliksoyad', 'maidenname'],
  gender: ['cinsiyet', 'gender'],
  birthYear: ['dogumyili', 'dogumtarihi', 'birthyear'],
  deathYear: ['vefatyili', 'olumyili', 'vefattarihi', 'deathyear'],
  alive: ['hayatta', 'hayattaeh', 'alive'],
  birthPlace: ['dogumyeri', 'birthplace'],
  city: ['sehir', 'il', 'city'],
  job: ['meslek', 'job'],
  phone: ['telefon', 'tel', 'phone'],
  email: ['eposta', 'email', 'mail'],
  notes: ['notlar', 'not', 'notes'],
  marriageId: ['evlilikid', 'marriageid'],
  marriageYear: ['evlilikyili', 'marriageyear'],
  marriageStatus: ['evlilikdurumu', 'medenihal', 'marriagestatus'],
  marriageEndYear: ['evlilikbitisyili', 'bosanmayili', 'marriageendyear'],
  parentMarriageId: ['ebeveynevlilikid', 'ebeveynid', 'parentmarriageid'],
};

const KEY_LOOKUP = new Map(Object.entries(ALIASES).flatMap(([field, keys]) => keys.map((k) => [k, field])));

export function normalizeKey(key) {
  return String(key)
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
}

function str(v) {
  if (v == null) return '';
  if (v instanceof Date) return String(v.getFullYear());
  return String(v).trim();
}

function year(v) {
  if (v instanceof Date) return v.getFullYear();
  const m = str(v).match(/\b(1\d{3}|20\d{2}|21\d{2})\b/);
  return m ? Number(m[1]) : null;
}

function gender(v) {
  const g = normalizeKey(v);
  if (['e', 'erkek', 'm', 'male', 'bay'].includes(g)) return 'E';
  if (['k', 'kadin', 'kiz', 'f', 'female', 'bayan'].includes(g)) return 'K';
  return '';
}

function alive(v, birthYear, deathYear) {
  const a = normalizeKey(v);
  if (['e', 'evet', '1', 'true', 'yes', 'y', 'x'].includes(a)) return 1;
  if (['h', 'hayir', '0', 'false', 'no', 'n', 'vefat'].includes(a)) return 0;
  if (deathYear) return 0;
  return birthYear && birthYear < new Date().getFullYear() - 100 ? 0 : 1;
}

function marriageStatus(v) {
  const s = normalizeKey(v);
  if (!s) return null;
  if (s.startsWith('bosan') || s === 'ayrildi' || s === 'divorced') return 'divorced';
  if (s.includes('vefat') || s.startsWith('dul') || s === 'widowed') return 'widowed';
  return 'married';
}

function splitName(full) {
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: parts[0] ?? '', last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts.at(-1) };
}

function normalizeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row ?? {})) {
    const field = KEY_LOOKUP.get(normalizeKey(k));
    if (field && out[field] == null) out[field] = v;
  }
  return out;
}

/**
 * Satırları replaceAll() formatına çevirir.
 * Aynı kişi birden fazla evliliği için "12a", "12b" gibi harf ekli ID'lerle tekrar edebilir.
 */
export function rowsToRecords(rows) {
  if (!Array.isArray(rows)) throw new Error('Satır listesi bekleniyordu');
  const warnings = [];
  const people = new Map();
  const unions = new Map();
  const partnersOf = new Map();

  const ensureUnion = (key) => {
    if (!unions.has(key)) unions.set(key, { key, legacy_id: key, start_year: null });
    return unions.get(key);
  };

  rows.forEach((raw, index) => {
    const r = normalizeRow(raw);
    const rowNo = index + 2;
    let first = str(r.firstName);
    let last = str(r.lastName);
    if (!first) {
      const split = splitName(str(r.fullName));
      first = split.first;
      last = last || split.last;
    }
    if (!first) return;

    const rawId = str(r.id);
    const key = rawId ? rawId.replace(/[A-Za-z]+$/, '') || rawId : `satir-${rowNo}`;
    const marriageId = str(r.marriageId);
    const parentMarriageId = str(r.parentMarriageId);

    let person = people.get(key);
    if (!person) {
      const birthYear = year(r.birthYear);
      const deathYear = year(r.deathYear);
      person = {
        key,
        legacy_id: rawId || null,
        first_name: first,
        last_name: last,
        maiden_name: str(r.maidenName),
        gender: gender(r.gender),
        birth_year: birthYear,
        death_year: deathYear,
        is_alive: alive(r.alive, birthYear, deathYear),
        birth_place: str(r.birthPlace),
        city: str(r.city),
        job: str(r.job),
        phone: str(r.phone),
        email: str(r.email),
        notes: str(r.notes),
        parent_union_key: parentMarriageId || null,
      };
      people.set(key, person);
    } else {
      // Tekrarlanan satırlardaki boş alanları tamamla
      person.birth_year ??= year(r.birthYear);
      person.death_year ??= year(r.deathYear);
      for (const [field, src] of [['phone', 'phone'], ['email', 'email'], ['city', 'city'], ['job', 'job'], ['birth_place', 'birthPlace']]) {
        if (!person[field]) person[field] = str(r[src]);
      }
      if (!person.parent_union_key && parentMarriageId) person.parent_union_key = parentMarriageId;
    }

    if (marriageId) {
      const u = ensureUnion(marriageId);
      u.start_year ??= year(r.marriageYear);
      u.end_year ??= year(r.marriageEndYear);
      u.status ??= marriageStatus(r.marriageStatus);
      const list = partnersOf.get(marriageId) ?? [];
      if (!list.includes(key)) list.push(key);
      partnersOf.set(marriageId, list);
    }
    if (parentMarriageId) ensureUnion(parentMarriageId);
  });

  for (const [mid, u] of unions) {
    const partners = partnersOf.get(mid) ?? [];
    if (partners.length > 2) {
      warnings.push(`Evlilik ${mid}: ${partners.length} eş bulundu, ilk ikisi alındı`);
    }
    // Erkek eş varsa partner1 olarak sırala (görünüm tutarlılığı için)
    partners.sort((a, b) => (people.get(a).gender === 'E' ? -1 : 0) - (people.get(b).gender === 'E' ? -1 : 0));
    u.status ??= 'married';
    u.partner1_key = partners[0] ?? null;
    u.partner2_key = partners[1] ?? null;
    if (!partners.length) warnings.push(`Evlilik ${mid}: ebeveyn olarak kullanılmış ama eşleri tanımlı değil`);
  }

  for (const p of people.values()) {
    const u = p.parent_union_key && unions.get(p.parent_union_key);
    if (u && (u.partner1_key === p.key || u.partner2_key === p.key)) {
      warnings.push(`${p.first_name} ${p.last_name}: kendi evliliğinin çocuğu olarak işaretlenmiş, bağlantı kaldırıldı`);
      p.parent_union_key = null;
    }
  }

  return { people: [...people.values()], unions: [...unions.values()], warnings };
}

const STATUS_TEXT = { married: 'Evli', divorced: 'Boşandı', widowed: 'Vefatla sona erdi' };

export const EXPORT_COLUMNS = [
  'ID', 'Ad Soyad', 'Ad', 'Soyad', 'Kızlık Soyadı', 'Cinsiyet', 'Doğum Yılı', 'Vefat Yılı', 'Hayatta',
  'Doğum Yeri', 'Şehir', 'Meslek', 'Telefon', 'E-posta', 'Notlar',
  'Evlilik ID', 'Evlilik Yılı', 'Evlilik Durumu', 'Evlilik Bitiş Yılı', 'EBEVEYN Evlilik ID',
];

// Veritabanını, tekrar içe aktarılabilecek Excel satırlarına çevirir.
export function recordsToRows({ people, unions }) {
  const unionsOf = new Map();
  for (const u of unions) {
    for (const pid of [u.partner1_id, u.partner2_id]) {
      if (pid == null) continue;
      if (!unionsOf.has(pid)) unionsOf.set(pid, []);
      unionsOf.get(pid).push(u);
    }
  }
  const rows = [];
  for (const p of people) {
    const own = (unionsOf.get(p.id) ?? []).sort((a, b) => (a.start_year ?? 9999) - (b.start_year ?? 9999) || a.id - b.id);
    const base = {
      'Ad Soyad': [p.first_name, p.last_name].filter(Boolean).join(' '),
      Ad: p.first_name,
      Soyad: p.last_name,
      'Kızlık Soyadı': p.maiden_name ?? '',
      Cinsiyet: p.gender,
      'Doğum Yılı': p.birth_year ?? '',
      'Vefat Yılı': p.death_year ?? '',
      Hayatta: p.is_alive ? 'E' : 'H',
      'Doğum Yeri': p.birth_place ?? '',
      Şehir: p.city ?? '',
      Meslek: p.job ?? '',
      Telefon: p.phone ?? '',
      'E-posta': p.email ?? '',
      Notlar: p.notes ?? '',
      'EBEVEYN Evlilik ID': p.parent_union_id != null ? `E${p.parent_union_id}` : '',
    };
    const entries = own.length ? own : [null];
    entries.forEach((u, i) => {
      const suffix = entries.length > 1 ? String.fromCharCode(97 + (i % 26)) : '';
      rows.push({
        ID: `${p.id}${suffix}`,
        ...base,
        'Evlilik ID': u ? `E${u.id}` : '',
        'Evlilik Yılı': u?.start_year ?? '',
        'Evlilik Durumu': u ? STATUS_TEXT[u.status] : '',
        'Evlilik Bitiş Yılı': u?.end_year ?? '',
      });
    });
  }
  return rows.map((r) => Object.fromEntries(EXPORT_COLUMNS.map((c) => [c, r[c] ?? ''])));
}
