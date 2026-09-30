import assert from 'node:assert/strict';
import { test } from 'node:test';
import { age, upcomingEvents } from '../public/js/store.js';

const today = new Date(2026, 11, 28); // 28 Aralık 2026

test('yaklaşan doğum ve anma günleri, yıl geçişi dahil', () => {
  const people = [
    { id: 1, first_name: 'Ece', is_alive: 1, birth_year: 2009, birth_month: 12, birth_day: 28 },
    { id: 2, first_name: 'Can', is_alive: 1, birth_year: 1990, birth_month: 1, birth_day: 3 },
    { id: 3, first_name: 'Hasan', is_alive: 0, death_year: 1992, death_month: 12, death_day: 30 },
    { id: 4, first_name: 'Uzak', is_alive: 1, birth_month: 6, birth_day: 1 },
    { id: 5, first_name: 'Vefatlı doğum günü', is_alive: 0, birth_month: 12, birth_day: 29 },
  ];
  const ev = upcomingEvents(people, { today, days: 30 });
  assert.deepEqual(
    ev.map((e) => [e.person.first_name, e.type, e.inDays, e.years]),
    [['Ece', 'birthday', 0, 17], ['Hasan', 'memorial', 2, 34], ['Can', 'birthday', 6, 37]],
  );
});

test('29 Şubat doğumlular artık olmayan yılda 28 Şubat’ta kutlanır', () => {
  const p = { id: 1, first_name: 'Nil', is_alive: 1, birth_year: 2000, birth_month: 2, birth_day: 29 };
  const [e] = upcomingEvents([p], { today: new Date(2027, 1, 27), days: 5 });
  assert.equal(e.inDays, 1);
});

test('gün ve ay biliniyorsa yaş tam hesaplanır', () => {
  const p = { is_alive: 1, birth_year: 1948, birth_month: 12, birth_day: 30 };
  assert.equal(age(p, today), 77);
  assert.equal(age({ ...p, birth_month: null, birth_day: null }, today), 78);
  assert.equal(age({ is_alive: 0, birth_year: 1920, birth_month: 4, death_year: 1992, death_month: 3 }), 71);
});
