import { badRequest, conflict, notFound } from './errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['member', 'editor'];

// Davetli üyeler. ADMIN_EMAILS'teki adresler her zaman yöneticidir ve listede "sabit" görünür.
export function createMembers(db, config) {
  const q = {
    all: db.prepare('SELECT * FROM members ORDER BY role DESC, name COLLATE NOCASE, email'),
    get: db.prepare('SELECT * FROM members WHERE id = ?'),
    byEmail: db.prepare('SELECT * FROM members WHERE email = ?'),
  };

  const clean = (input, partial) => {
    const out = {};
    if (!partial || 'email' in input) {
      const email = String(input.email ?? '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) throw badRequest('Geçerli bir e-posta adresi girin');
      out.email = email;
    }
    if ('name' in input || !partial) out.name = String(input.name ?? '').trim().slice(0, 100);
    if ('role' in input || !partial) {
      const role = input.role ?? 'member';
      if (!ROLES.includes(role)) throw badRequest('Geçersiz rol');
      out.role = role;
    }
    return out;
  };

  return {
    list() {
      const rows = q.all.all();
      const fixed = config.adminEmails
        .filter((e) => !rows.some((r) => r.email === e))
        .map((email) => ({ id: null, email, name: '', role: 'editor', fixed: true, last_login_at: null }));
      return [...fixed, ...rows.map((r) => ({ ...r, fixed: config.adminEmails.includes(r.email) }))];
    },

    add(input) {
      const data = clean(input ?? {}, false);
      if (q.byEmail.get(data.email) || config.adminEmails.includes(data.email)) throw conflict('Bu e-posta zaten davetli');
      const id = db.prepare('INSERT INTO members (email, name, role) VALUES (@email, @name, @role)').run(data).lastInsertRowid;
      return q.get.get(id);
    },

    update(id, input) {
      if (!q.get.get(id)) throw notFound('Üye bulunamadı');
      const data = clean(input ?? {}, true);
      delete data.email;
      const cols = Object.keys(data);
      if (cols.length) db.prepare(`UPDATE members SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`).run({ ...data, id });
      return q.get.get(id);
    },

    remove(id) {
      if (!db.prepare('DELETE FROM members WHERE id = ?').run(id).changes) throw notFound('Üye bulunamadı');
    },
  };
}
