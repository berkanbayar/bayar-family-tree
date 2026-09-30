import { api } from './api.js';

const collator = new Intl.Collator('tr', { sensitivity: 'base' });

export const store = {
  loaded: false,
  role: null,
  mode: null,
  people: [],
  unions: [],
  byId: new Map(),
  unionById: new Map(),
  unionsByPerson: new Map(),
  childrenByUnion: new Map(),
};

export async function loadFamily() {
  const data = await api.get('/family');
  index(data);
  return store;
}

export async function loadSession() {
  const me = await api.get('/me');
  store.role = me.role;
  store.mode = me.mode;
  return me;
}

function index({ people, unions, role, mode }) {
  store.people = people;
  store.unions = unions;
  store.role = role;
  store.mode = mode;
  store.byId = new Map(people.map((p) => [p.id, p]));
  store.unionById = new Map(unions.map((u) => [u.id, u]));
  store.unionsByPerson = new Map();
  store.childrenByUnion = new Map();
  for (const u of unions) {
    for (const pid of [u.partner1_id, u.partner2_id]) {
      if (pid == null) continue;
      if (!store.unionsByPerson.has(pid)) store.unionsByPerson.set(pid, []);
      store.unionsByPerson.get(pid).push(u);
    }
  }
  for (const p of people) {
    if (p.parent_union_id == null) continue;
    if (!store.childrenByUnion.has(p.parent_union_id)) store.childrenByUnion.set(p.parent_union_id, []);
    store.childrenByUnion.get(p.parent_union_id).push(p);
  }
  for (const list of store.unionsByPerson.values()) list.sort(byYearThenId('start_year'));
  for (const list of store.childrenByUnion.values()) list.sort(byYearThenId('birth_year'));
  store.loaded = true;
}

function byYearThenId(field) {
  return (a, b) => (a[field] ?? 9999) - (b[field] ?? 9999) || a.id - b.id;
}

export const canEdit = () => store.role === 'editor';
export const compareNames = (a, b) => collator.compare(fullName(a), fullName(b));

export function fullName(p) {
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'İsimsiz';
}

export function initials(p) {
  const f = p.first_name?.[0] ?? '';
  const l = p.last_name?.[0] ?? '';
  return (f + l).toLocaleUpperCase('tr') || '?';
}

export function lifespan(p) {
  if (p.is_alive) return p.birth_year ? String(p.birth_year) : '';
  return `${p.birth_year ?? '?'} – ${p.death_year ?? '?'}`;
}

export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export function formatDate(day, month, year) {
  if (month) return [day, MONTHS[month - 1], year].filter(Boolean).join(' ');
  return year ? String(year) : '';
}
export const birthDate = (p) => formatDate(p.birth_day, p.birth_month, p.birth_year);
export const deathDate = (p) => formatDate(p.death_day, p.death_month, p.death_year);

// Gün/ay biliniyorsa tam yaş; bilinmiyorsa yıl farkı
export function age(p, today = new Date()) {
  if (!p.birth_year) return null;
  const end = p.is_alive
    ? { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() }
    : { y: p.death_year, m: p.death_month, d: p.death_day };
  if (!end.y) return null;
  let years = end.y - p.birth_year;
  if (p.birth_month && end.m && (end.m < p.birth_month || (end.m === p.birth_month && p.birth_day && end.d && end.d < p.birth_day))) years--;
  return years;
}

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Önümüzdeki `days` gün içindeki doğum günleri (hayattakiler) ve anma günleri (vefat edenler).
 * 29 Şubat doğumlular artık olmayan yıllarda 28 Şubat'ta kutlanır.
 */
export function upcomingEvents(people, { today = new Date(), days = 30 } = {}) {
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const events = [];
  const add = (person, type, month, day, baseYear) => {
    for (const y of [today.getFullYear(), today.getFullYear() + 1]) {
      const d = month === 2 && day === 29 && !isLeap(y) ? 28 : day;
      const inDays = Math.round((Date.UTC(y, month - 1, d) - start) / 864e5);
      if (inDays < 0) continue;
      if (inDays <= days) events.push({ person, type, month, day, inDays, years: baseYear ? y - baseYear : null });
      break;
    }
  };
  for (const p of people) {
    if (p.is_alive && p.birth_month && p.birth_day) add(p, 'birthday', p.birth_month, p.birth_day, p.birth_year);
    if (!p.is_alive && p.death_month && p.death_day) add(p, 'memorial', p.death_month, p.death_day, p.death_year);
  }
  return events.sort((a, b) => a.inDays - b.inDays || compareNames(a.person, b.person));
}

export function trLower(s) {
  return String(s ?? '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLocaleLowerCase('tr');
}

export const parentUnion = (p) => (p.parent_union_id != null ? store.unionById.get(p.parent_union_id) : null);
export const unionsOf = (p) => store.unionsByPerson.get(p.id) ?? [];
export const childrenOf = (u) => store.childrenByUnion.get(u.id) ?? [];

export function partnerIn(u, p) {
  const other = u.partner1_id === p.id ? u.partner2_id : u.partner1_id;
  return other != null ? store.byId.get(other) : null;
}

export function partnersOf(u) {
  return [u.partner1_id, u.partner2_id].map((id) => (id != null ? store.byId.get(id) : null)).filter(Boolean);
}

export function parentsOf(p) {
  const u = parentUnion(p);
  if (!u) return [];
  // Önce baba, sonra anne
  return partnersOf(u).sort((a, b) => (a.gender === 'E' ? -1 : 0) - (b.gender === 'E' ? -1 : 0));
}

export function siblingsOf(p) {
  const u = parentUnion(p);
  return u ? childrenOf(u).filter((c) => c.id !== p.id) : [];
}

// Ebeveynlerden birinin başka evliliğinden olan kardeşler: "baba bir" / "anne bir"
export function halfSiblingsOf(p) {
  const own = parentUnion(p);
  if (!own) return [];
  const result = [];
  const seen = new Set([p.id]);
  for (const parent of parentsOf(p)) {
    for (const u of unionsOf(parent)) {
      if (u.id === own.id) continue;
      for (const c of childrenOf(u)) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        result.push({ person: c, via: parent, label: parent.gender === 'K' ? 'Anne bir' : parent.gender === 'E' ? 'Baba bir' : 'Üvey kardeş' });
      }
    }
  }
  return result;
}

// Ebeveynlerin diğer eşleri
export function stepParentsOf(p) {
  const own = parentUnion(p);
  if (!own) return [];
  const bio = new Set(partnersOf(own).map((x) => x.id));
  const result = [];
  for (const parent of parentsOf(p)) {
    for (const u of unionsOf(parent)) {
      const other = partnerIn(u, parent);
      if (!other || bio.has(other.id) || result.some((r) => r.person.id === other.id)) continue;
      result.push({ person: other, via: parent, label: other.gender === 'K' ? 'Üvey anne' : other.gender === 'E' ? 'Üvey baba' : 'Üvey ebeveyn' });
    }
  }
  return result;
}

// Eşin başka evliliklerinden olan çocukları
export function stepChildrenIn(u, p) {
  const partner = partnerIn(u, p);
  if (!partner) return [];
  return unionsOf(partner)
    .filter((x) => x.id !== u.id && partnerIn(x, partner)?.id !== p.id)
    .flatMap(childrenOf);
}

export const UNION_STATES = {
  married: { icon: '💍', text: 'Evli' },
  divorced: { icon: '💔', text: 'Boşandı' },
  widowed: { icon: '🕊️', text: 'Vefatla sona erdi' },
};

// Kayıtlı durum "evli" olsa bile eşlerden biri vefat ettiyse evlilik "eşi vefat etti" sayılır
export function unionState(u) {
  if (u.status !== 'married') return u.status;
  return partnersOf(u).some((x) => !x.is_alive) ? 'widowed' : 'married';
}

export function allChildrenOf(p) {
  return unionsOf(p).flatMap(childrenOf);
}

export function descendantCount(p, seen = new Set()) {
  let n = 0;
  for (const c of allChildrenOf(p)) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    n += 1 + descendantCount(c, seen);
  }
  return n;
}

// Ebeveyni olmayan ve evlendiği kişilerin de ebeveyni olmayan kişiler; en kalabalık soydan başlayarak.
export function roots() {
  const candidates = store.people.filter(
    (p) => p.parent_union_id == null && unionsOf(p).every((u) => (partnerIn(u, p)?.parent_union_id ?? null) == null),
  );
  const seenUnions = new Set();
  const result = [];
  const maleFirst = (p) => (p.gender === 'E' ? 0 : 1);
  const ranked = candidates
    .map((p) => [p, descendantCount(p)])
    .sort((a, b) => b[1] - a[1] || maleFirst(a[0]) - maleFirst(b[0]) || a[0].id - b[0].id);
  for (const [person, count] of ranked) {
    const unionIds = unionsOf(person).map((u) => u.id);
    // Eşlerden sadece birini kök olarak göster (tercihen erkek)
    if (unionIds.length && unionIds.every((id) => seenUnions.has(id))) continue;
    unionIds.forEach((id) => seenUnions.add(id));
    result.push({ person, count });
  }
  return result;
}

export function generationCount() {
  let max = 0;
  const depth = (p, d, seen) => {
    max = Math.max(max, d);
    for (const c of allChildrenOf(p)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      depth(c, d + 1, seen);
    }
  };
  for (const { person } of roots()) depth(person, 1, new Set([person.id]));
  return max;
}
