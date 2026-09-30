import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { createMailer } from '../server/mailer.js';

async function start(env) {
  const config = { ...loadConfig({}), ...env };
  const outbox = [];
  const mailer = createMailer(config, { transport: { sendMail: async (m) => outbox.push(m) } });
  const server = createApp({ db: openDb(':memory:'), config, mailer }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  // Her kullanıcı kendi çerez kavanozuyla
  const client = () => {
    let cookie = '';
    const call = async (method, path, body, opts = {}) => {
      const res = await fetch(base + path, {
        method,
        redirect: 'manual',
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        ...opts,
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const type = res.headers.get('content-type') ?? '';
      return { status: res.status, location: res.headers.get('location'), data: type.includes('json') ? await res.json() : null };
    };
    return { call };
  };
  const lastMail = (to) => {
    const m = [...outbox].reverse().find((x) => x.to === to);
    return m && { code: m.text.match(/kodunuz: (\d{6})/)[1], link: m.text.match(/(http\S+)/)[1] };
  };
  return { client, outbox, lastMail, base, close: () => new Promise((r) => server.close(r)) };
}

describe('e-posta ile giriş', () => {
  let s;
  before(async () => (s = await start({ adminEmails: ['berkan@example.com'] })));
  after(() => s.close());

  test('site kapalı; davetli olmayan e-postaya kod gitmez ama cevap aynıdır', async () => {
    const guest = s.client();
    assert.equal((await guest.call('GET', '/api/family')).status, 401);
    const me = (await guest.call('GET', '/api/me')).data;
    assert.deepEqual([me.mode, me.methods.email], ['private', true]);

    const r = await guest.call('POST', '/api/auth/request-code', { email: 'yabanci@example.com' });
    assert.deepEqual([r.status, r.data], [200, { ok: true }]);
    assert.equal(s.outbox.length, 0);
    assert.equal((await guest.call('POST', '/api/auth/request-code', { email: 'bozuk' })).status, 400);
  });

  test('yönetici kodla girer, hatalı kod ve tekrar kullanım reddedilir', async () => {
    const admin = s.client();
    await admin.call('POST', '/api/auth/request-code', { email: ' Berkan@Example.com ' });
    const { code } = s.lastMail('berkan@example.com');
    const wrong = code === '000000' ? '111111' : '000000';

    assert.equal((await admin.call('POST', '/api/auth/verify', { email: 'berkan@example.com', code: wrong })).status, 400);
    const ok = await admin.call('POST', '/api/auth/verify', { email: 'berkan@example.com', code });
    assert.deepEqual([ok.status, ok.data.role, ok.data.email], [200, 'editor', 'berkan@example.com']);
    assert.equal((await admin.call('GET', '/api/family')).status, 200);
    assert.equal((await admin.call('GET', '/api/me')).data.email, 'berkan@example.com');

    const again = await s.client().call('POST', '/api/auth/verify', { email: 'berkan@example.com', code });
    assert.equal(again.status, 400, 'kod tek kullanımlık olmalı');
  });

  test('davet → link ile giriş → yetki sınırı → davet kaldırılınca oturum düşer', async () => {
    const admin = s.client();
    await admin.call('POST', '/api/auth/request-code', { email: 'berkan@example.com' });
    await admin.call('POST', '/api/auth/verify', { email: 'berkan@example.com', code: s.lastMail('berkan@example.com').code });

    const invited = await admin.call('POST', '/api/members', { email: 'ayse@example.com', name: 'Ayşe Teyze' });
    assert.equal(invited.status, 201);
    assert.equal((await admin.call('POST', '/api/members', { email: 'AYSE@example.com' })).status, 409);
    const list = (await admin.call('GET', '/api/members')).data;
    assert.ok(list.some((m) => m.email === 'berkan@example.com' && m.fixed));

    const ayse = s.client();
    await ayse.call('POST', '/api/auth/request-code', { email: 'ayse@example.com' });
    const mail = s.lastMail('ayse@example.com');
    assert.ok(s.outbox.at(-1).html.includes('Ayşe Teyze'));
    const link = await ayse.call('GET', new URL(mail.link).pathname + new URL(mail.link).search);
    assert.deepEqual([link.status, link.location], [302, '/#/']);
    assert.equal((await ayse.call('GET', '/api/me')).data.role, 'member');
    assert.equal((await ayse.call('POST', '/api/people', { first_name: 'X' })).status, 403);
    assert.equal((await ayse.call('GET', '/api/members')).status, 403);

    // Link ikinci kez çalışmaz
    const reuse = await s.client().call('GET', new URL(mail.link).pathname + new URL(mail.link).search);
    assert.equal(reuse.location, '/#/giris?hata=link');

    await admin.call('DELETE', `/api/members/${invited.data.id}`);
    assert.equal((await ayse.call('GET', '/api/family')).status, 401, 'kaldırılan üyenin oturumu geçersiz olmalı');
  });

  test('kaba kuvvet: 5 hatalı denemeden sonra kod iptal olur', async () => {
    const c = s.client();
    await c.call('POST', '/api/auth/request-code', { email: 'berkan@example.com' });
    const { code } = s.lastMail('berkan@example.com');
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await c.call('POST', '/api/auth/verify', { email: 'berkan@example.com', code: wrong });
    const r = await c.call('POST', '/api/auth/verify', { email: 'berkan@example.com', code });
    assert.notEqual(r.status, 200);
  });
});

describe('herkese açık görünüm + e-posta', () => {
  let s;
  before(async () => (s = await start({ adminEmails: ['berkan@example.com'], publicView: true })));
  after(() => s.close());

  test('ziyaretçi ağacı görür ama iletişim bilgisi göremez', async () => {
    const r = await s.client().call('GET', '/api/family');
    assert.deepEqual([r.status, r.data.role, r.data.mode], [200, 'guest', 'public']);
  });
});
