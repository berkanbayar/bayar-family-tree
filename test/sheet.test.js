import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDb } from '../server/db.js';
import { createRepo } from '../server/repo.js';
import { recordsToRows, rowsToRecords } from '../server/sheet.js';

// Eski index.html formatında örnek satırlar
const LEGACY_ROWS = [
  { ID: '1', 'Ad Soyad': 'Hasan Bayar', Cinsiyet: 'E', 'Doğum Yılı': 1920, 'Hayatta(E-H)': 'H', 'Evlilik ID': 'E1' },
  { ID: '2', 'Ad Soyad': 'Fatma Bayar', Cinsiyet: 'K', 'Doğum Yılı': 1925, 'Hayatta(E-H)': 'H', 'Evlilik ID': 'E1' },
  { ID: '3a', 'Ad Soyad': 'Mehmet Ali Bayar', Cinsiyet: 'E', 'Doğum Yılı': '1950', Hayatta: 'e ', Şehir: 'Çorum', 'Evlilik ID': 'E2', 'EBEVEYN Evlilik ID': 'E1' },
  { ID: '3b', 'Ad Soyad': 'Mehmet Ali Bayar', Telefon: '0555', 'Evlilik ID': 'E3', 'EBEVEYN Evlilik ID': 'E1' },
  { ID: '4', 'Ad Soyad': 'Ayşe Bayar', Cinsiyet: 'K', 'Evlilik ID': 'E2' },
  { ID: '5', 'Ad Soyad': 'Zehra Bayar', Cinsiyet: 'K', 'Evlilik ID': 'E3' },
  { ID: '6', 'Ad Soyad': 'Can Bayar', Cinsiyet: 'Erkek', 'Doğum Yılı': 1980, 'EBEVEYN Evlilik ID': 'E2' },
  { ID: '', 'Ad Soyad': '' },
];

test('eski Excel formatı: harf ekli ID birleşir, evlilikler ve çocuklar kurulur', () => {
  const { people, unions, warnings } = rowsToRecords(LEGACY_ROWS);
  assert.equal(people.length, 6);
  assert.equal(unions.length, 3);
  assert.deepEqual(warnings, []);

  const mehmet = people.find((p) => p.key === '3');
  assert.equal(mehmet.first_name, 'Mehmet Ali');
  assert.equal(mehmet.last_name, 'Bayar');
  assert.equal(mehmet.is_alive, 1, '"e " (küçük harf + boşluk) hayatta sayılmalı');
  assert.equal(mehmet.phone, '0555', 'ikinci satırdaki telefon tamamlanmalı');
  assert.equal(mehmet.parent_union_key, 'E1');

  assert.equal(people.find((p) => p.key === '6').gender, 'E');
  assert.equal(people.find((p) => p.key === '1').is_alive, 0);
  const e2 = unions.find((u) => u.key === 'E2');
  assert.deepEqual([e2.partner1_key, e2.partner2_key], ['3', '4']);
});

test('dışa aktarılan satırlar tekrar içe aktarılınca aynı yapı oluşur', () => {
  const db = openDb(':memory:');
  const repo = createRepo(db);
  repo.replaceAll(rowsToRecords(LEGACY_ROWS));
  const before = repo.getFamily({ includePrivate: true });

  const rows = recordsToRows(before);
  const db2 = openDb(':memory:');
  const repo2 = createRepo(db2);
  repo2.replaceAll(rowsToRecords(rows));
  const after = repo2.getFamily({ includePrivate: true });

  const shape = ({ people, unions }) => {
    const name = (id) => people.find((p) => p.id === id)?.first_name ?? null;
    return {
      people: people.map((p) => [p.first_name, p.last_name, p.gender, p.birth_year, p.is_alive, p.city, p.phone]).sort(),
      unions: unions.map((u) => [name(u.partner1_id), name(u.partner2_id)].sort().join('+')).sort(),
      kids: people
        .filter((p) => p.parent_union_id)
        .map((p) => {
          const u = unions.find((x) => x.id === p.parent_union_id);
          return `${p.first_name}<${[name(u.partner1_id), name(u.partner2_id)].sort().join('+')}`;
        })
        .sort(),
    };
  };
  assert.deepEqual(shape(after), shape(before));
});

test('Ad / Soyad ayrı sütunlar ve CSV başlık varyasyonları okunur', () => {
  const { people } = rowsToRecords([{ ' ad ': 'Elif', SOYADI: 'Kaya', 'kızlık soyadı': 'Demir', 'DOĞUM YILI': '12.03.1990' }]);
  assert.equal(people[0].first_name, 'Elif');
  assert.equal(people[0].last_name, 'Kaya');
  assert.equal(people[0].maiden_name, 'Demir');
  assert.equal(people[0].birth_year, 1990);
});
