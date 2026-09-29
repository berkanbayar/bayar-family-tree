import { api } from '../api.js';
import { refresh } from '../app.js';
import { canEdit, fullName, parentsOf, partnersOf, store } from '../store.js';
import { confirmSheet, emptyState, html, personRow, pickPerson, raw, toast } from '../ui.js';

const REL = {
  child: { title: 'Çocuk ekle', icon: '👶', anchorLabel: 'Anne / Baba' },
  spouse: { title: 'Eş ekle', icon: '💍', anchorLabel: 'Eşi' },
  parent: { title: 'Ebeveyn ekle', icon: '👪', anchorLabel: 'Çocuğu' },
};

const EMPTY = {
  first_name: '', last_name: '', maiden_name: '', gender: '', birth_year: '', death_year: '', is_alive: 1,
  birth_place: '', city: '', job: '', phone: '', email: '', notes: '',
};

function defaultsFor(rel) {
  const d = { ...EMPTY };
  if (!rel) return d;
  const a = rel.anchor;
  if (rel.type === 'child') {
    const u = rel.unionId ? store.unionById.get(rel.unionId) : null;
    const father = (u ? partnersOf(u) : [a]).find((x) => x.gender === 'E');
    d.last_name = (father ?? a).last_name;
    d.city = a.city;
  } else if (rel.type === 'spouse') {
    d.gender = a.gender === 'E' ? 'K' : a.gender === 'K' ? 'E' : '';
    if (a.gender === 'E') d.last_name = a.last_name;
  } else if (rel.type === 'parent') {
    const existing = parentsOf(a);
    d.gender = existing.length === 1 && existing[0].gender === 'E' ? 'K' : 'E';
    if (d.gender === 'E') d.last_name = a.last_name;
  }
  return d;
}

const input = (name, label, value, extra = '') =>
  html`<label class="field"><span>${label}</span><input class="input" name="${name}" value="${value ?? ''}" ${raw(extra)}></label>`;

export function render(ctx, id) {
  if (!canEdit()) {
    ctx.setHeader({ title: 'Yetki gerekli', back: true });
    ctx.el.innerHTML = emptyState({ icon: '🔒', title: 'Düzenlemek için giriş yapın', actions: html`<a class="btn btn-primary" href="#/giris">Giriş yap</a>` }).s;
    return;
  }
  const person = id ? store.byId.get(id) : null;
  if (id && !person) {
    ctx.setHeader({ title: 'Bulunamadı', back: true });
    ctx.el.innerHTML = emptyState({ icon: '🔍', title: 'Kişi bulunamadı' }).s;
    return;
  }

  const type = ctx.query.get('type');
  const anchor = store.byId.get(Number(ctx.query.get('anchor')));
  const unionId = Number(ctx.query.get('union')) || null;
  const rel = !person && anchor && REL[type] ? { type, anchor, unionId } : null;
  const v = person ?? defaultsFor(rel);

  ctx.setHeader({ title: person ? 'Kişiyi düzenle' : rel ? REL[type].title : 'Yeni kişi', back: true });

  const anchorPeople = rel?.type === 'child' && unionId ? partnersOf(store.unionById.get(unionId) ?? { }) : rel ? [rel.anchor] : [];

  ctx.el.innerHTML = html`
    ${rel
      ? html`
        <section class="card rel-banner">
          <div class="muted small">${REL[type].icon} ${REL[type].anchorLabel}</div>
          ${anchorPeople.map((p) => personRow(p))}
          <button class="btn btn-soft full" type="button" data-action="link-existing">🔗 Listeden mevcut bir kişiyi seç</button>
        </section>
        <div class="divider"><span>veya yeni kişi</span></div>`
      : ''}
    <form class="form" data-role="form" novalidate>
      <div class="card form-card">
        ${input('first_name', 'Ad *', v.first_name, 'required autocomplete="off" autocapitalize="words"')}
        ${input('last_name', 'Soyad', v.last_name, 'autocomplete="off" autocapitalize="words"')}
        <div class="field">
          <span>Cinsiyet</span>
          <div class="segmented">
            ${[['E', 'Erkek'], ['K', 'Kadın'], ['', 'Belirtilmemiş']].map(
              ([val, text]) => html`<label><input type="radio" name="gender" value="${val}" ${v.gender === val ? raw('checked') : ''}><span>${text}</span></label>`,
            )}
          </div>
        </div>
        <div data-role="maiden" ${v.gender === 'K' ? '' : raw('hidden')}>${input('maiden_name', 'Kızlık soyadı', v.maiden_name, 'autocomplete="off"')}</div>
      </div>

      <div class="card form-card">
        <div class="grid2">
          ${input('birth_year', 'Doğum yılı', v.birth_year, 'inputmode="numeric" maxlength="4" placeholder="örn. 1950"')}
          <div data-role="death" ${v.is_alive ? raw('hidden') : ''}>${input('death_year', 'Vefat yılı', v.death_year, 'inputmode="numeric" maxlength="4"')}</div>
        </div>
        <label class="switch">
          <input type="checkbox" name="is_alive" ${v.is_alive ? raw('checked') : ''}>
          <span class="switch-track"></span>
          <span>Hayatta</span>
        </label>
        ${input('birth_place', 'Doğum yeri', v.birth_place)}
        ${input('city', 'Yaşadığı şehir', v.city)}
        ${input('job', 'Meslek', v.job)}
      </div>

      <div class="card form-card">
        ${input('phone', 'Telefon', v.phone, 'type="tel" inputmode="tel" autocomplete="off"')}
        ${input('email', 'E-posta', v.email, 'type="email" inputmode="email" autocomplete="off"')}
        <label class="field"><span>Notlar</span><textarea class="input" name="notes" rows="3">${v.notes ?? ''}</textarea></label>
        <p class="muted small">🔒 Telefon, e-posta ve notlar sadece giriş yapmış aile üyelerine görünür.</p>
      </div>

      <div class="form-actions">
        <button class="btn btn-primary full" type="submit">${person ? 'Kaydet' : 'Ekle'}</button>
      </div>
    </form>
    ${person
      ? html`<section class="section danger-zone"><button class="btn btn-danger-ghost full" type="button" data-action="delete">🗑️ ${fullName(person)} kaydını sil</button></section>`
      : ''}
  `.s;

  const form = ctx.el.querySelector('[data-role=form]');
  form.addEventListener('change', (e) => {
    if (e.target.name === 'gender') ctx.el.querySelector('[data-role=maiden]').hidden = e.target.value !== 'K';
    if (e.target.name === 'is_alive') ctx.el.querySelector('[data-role=death]').hidden = e.target.checked;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.is_alive = form.elements.is_alive.checked;
    if (data.is_alive) data.death_year = '';
    if (!data.first_name.trim()) {
      toast('Ad alanı zorunlu', 'error');
      form.elements.first_name.focus();
      return;
    }
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    try {
      let target;
      if (person) {
        await api.patch(`/people/${person.id}`, data);
        target = person.id;
      } else {
        const relation = rel ? { type: rel.type, anchor_id: rel.anchor.id, union_id: rel.unionId } : undefined;
        const created = await api.post('/people', { ...data, relation });
        target = rel ? rel.anchor.id : created.id;
      }
      await refresh();
      toast(person ? 'Kaydedildi' : 'Eklendi', 'success');
      ctx.navigate(`#/kisi/${target}`, { replace: true });
    } catch (err) {
      toast(err.message, 'error');
      submit.disabled = false;
    }
  });

  ctx.el.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'link-existing') await linkExisting(ctx, rel);
    if (action === 'delete') await remove(ctx, person);
  });
}

async function linkExisting(ctx, rel) {
  const otherId = await pickPerson({ title: `${REL[rel.type].title}: kişi seç`, exclude: [rel.anchor.id] });
  if (!otherId) return;
  try {
    await api.post(`/people/${rel.anchor.id}/link`, { type: rel.type, other_id: otherId, union_id: rel.unionId });
    await refresh();
    toast('Bağlantı kuruldu', 'success');
    ctx.navigate(`#/kisi/${rel.anchor.id}`, { replace: true });
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function remove(ctx, person) {
  const ok = await confirmSheet({
    title: 'Kayıt silinsin mi?',
    message: `${fullName(person)} kalıcı olarak silinecek. Evlilik ve çocuk bağlantıları da kopar. Bu işlem geri alınamaz.`,
    confirmText: 'Evet, sil',
    danger: true,
  });
  if (!ok) return;
  await api.del(`/people/${person.id}`);
  await refresh();
  toast('Silindi', 'success');
  ctx.navigate('#/', { replace: true });
}
