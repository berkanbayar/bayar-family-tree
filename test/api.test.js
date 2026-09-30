import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';

async function startServer(env) {
  const config = { ...loadConfig({}), dbPath: ':memory:', ...env };
  const db = openDb(':memory:');
  const server = createApp({ db, config }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const data = res.status === 204 ? null : await res.json();
    return { status: res.status, data };
  };
  return { call, close: () => new Promise((r) => server.close(r)) };
}

describe('açık mod: aile ilişkileri', () => {
  let s;
  before(async () => (s = await startServer({})));
  after(() => s.close());

  test('kişi, eş, çocuk ve ebeveyn ekleme', async () => {
    const hasan = (await s.call('POST', '/people', { first_name: 'Hasan', last_name: 'Bayar', gender: 'E' })).data;
    const fatma = (await s.call('POST', '/people', { first_name: 'Fatma', gender: 'K', relation: { type: 'spouse', anchor_id: hasan.id } })).data;
    let fam = (await s.call('GET', '/family')).data;
    assert.equal(fam.unions.length, 1);
    const union = fam.unions[0];
    assert.deepEqual([union.partner1_id, union.partner2_id], [hasan.id, fatma.id]);

    const ali = (await s.call('POST', '/people', { first_name: 'Ali', relation: { type: 'child', anchor_id: hasan.id, union_id: union.id } })).data;
    assert.equal(ali.parent_union_id, union.id);

    // Ebeveyni olmayan birine iki ebeveyn eklenir → aynı evlilik altında toplanır
    const zeynep = (await s.call('POST', '/people', { first_name: 'Zeynep' })).data;
    await s.call('POST', '/people', { first_name: 'Osman', relation: { type: 'parent', anchor_id: zeynep.id } });
    await s.call('POST', '/people', { first_name: 'Emine', relation: { type: 'parent', anchor_id: zeynep.id } });
    const third = await s.call('POST', '/people', { first_name: 'Fazla', relation: { type: 'parent', anchor_id: zeynep.id } });
    assert.equal(third.status, 409);

    fam = (await s.call('GET', '/family')).data;
    const z = fam.people.find((p) => p.id === zeynep.id);
    const zu = fam.unions.find((u) => u.id === z.parent_union_id);
    assert.ok(zu.partner1_id && zu.partner2_id);
    // Başarısız istek yarım kayıt bırakmamalı (transaction)
    assert.equal(fam.people.filter((p) => p.first_name === 'Fazla').length, 0);
  });

  test('döngü engellenir: kişi kendi atasının çocuğu yapılamaz', async () => {
    const a = (await s.call('POST', '/people', { first_name: 'Dede' })).data;
    const b = (await s.call('POST', '/people', { first_name: 'Baba', relation: { type: 'child', anchor_id: a.id } })).data;
    const c = (await s.call('POST', '/people', { first_name: 'Torun', relation: { type: 'child', anchor_id: b.id } })).data;
    const res = await s.call('POST', `/people/${a.id}/link`, { type: 'parent', other_id: c.id });
    assert.equal(res.status, 400);
  });

  test('silinen kişinin boşta kalan evlilik kaydı temizlenir', async () => {
    const x = (await s.call('POST', '/people', { first_name: 'X' })).data;
    const y = (await s.call('POST', '/people', { first_name: 'Y', relation: { type: 'spouse', anchor_id: x.id } })).data;
    await s.call('DELETE', `/people/${x.id}`);
    await s.call('DELETE', `/people/${y.id}`);
    const fam = (await s.call('GET', '/family')).data;
    assert.ok(!fam.unions.some((u) => u.partner1_id == null && u.partner2_id == null));
  });

  test('tarih doğrulama ve vefat bilgileri', async () => {
    assert.equal((await s.call('POST', '/people', { first_name: 'A', birth_day: 30, birth_month: 2 })).status, 400);
    assert.equal((await s.call('POST', '/people', { first_name: 'A', birth_day: 5 })).status, 400);
    assert.equal((await s.call('POST', '/people', { first_name: 'A', birth_year: 1990, death_year: 1980, is_alive: false })).status, 400);
    const leap = await s.call('POST', '/people', { first_name: 'Nil', birth_day: 29, birth_month: 2 });
    assert.equal(leap.status, 201, 'yılı bilinmeyen 29 Şubat kabul edilmeli');

    const dede = (await s.call('POST', '/people', {
      first_name: 'Dede', is_alive: false, death_year: 1992, death_month: 6, death_day: 5, burial_place: 'Çorum Asri Mezarlığı',
    })).data;
    assert.equal(dede.burial_place, 'Çorum Asri Mezarlığı');
    // Hayatta işaretlenince vefat bilgileri temizlenir
    const fixed = (await s.call('PATCH', `/people/${dede.id}`, { is_alive: true })).data;
    assert.deepEqual([fixed.death_year, fixed.death_day, fixed.burial_place], [null, null, '']);
  });

  test('geçersiz veri 400 döner', async () => {
    assert.equal((await s.call('POST', '/people', { first_name: '' })).status, 400);
    assert.equal((await s.call('POST', '/people', { first_name: 'A', birth_year: 'abc' })).status, 400);
    assert.equal((await s.call('PATCH', '/people/99999', { city: 'x' })).status, 404);
  });

  test('yedek al → geri yükle', async () => {
    const backup = (await s.call('GET', '/export')).data;
    const count = backup.people.length;
    const res = await s.call('POST', '/restore', backup);
    assert.equal(res.data.people, count);
    const fam = (await s.call('GET', '/family')).data;
    assert.deepEqual(fam.people.map((p) => p.id), backup.people.map((p) => p.id));
  });
});

describe('herkese açık mod: yetki ve gizlilik', () => {
  let s;
  before(async () => (s = await startServer({ adminPassword: 'gizli' })));
  after(() => s.close());

  test('ziyaretçi görebilir ama düzenleyemez, iletişim bilgisi gizlidir', async () => {
    assert.equal((await s.call('POST', '/people', { first_name: 'A' })).status, 403);
    assert.equal((await s.call('POST', '/login', { password: 'yanlis' })).status, 401);
    assert.equal((await s.call('POST', '/login', { password: 'gizli' })).data.role, 'editor');
    await s.call('POST', '/people', { first_name: 'A', phone: '0555' });
    await s.call('POST', '/logout');

    const fam = await s.call('GET', '/family');
    assert.equal(fam.status, 200);
    assert.equal(fam.data.role, 'guest');
    assert.equal(fam.data.people[0].phone, undefined);
    assert.equal((await s.call('GET', '/export')).status, 403);
  });
});

describe('özel mod', () => {
  let s;
  before(async () => (s = await startServer({ adminPassword: 'yonetici', viewPassword: 'aile' })));
  after(() => s.close());

  test('giriş yapmadan hiçbir veri görünmez; aile şifresi okuma yetkisi verir', async () => {
    assert.equal((await s.call('GET', '/family')).status, 401);
    assert.equal((await s.call('POST', '/login', { password: 'aile' })).data.role, 'member');
    assert.equal((await s.call('GET', '/family')).status, 200);
    assert.equal((await s.call('POST', '/people', { first_name: 'A' })).status, 403);
  });
});
