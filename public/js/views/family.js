import { api } from '../api.js';
import { refresh, rememberPerson } from '../app.js';
import {
  age, canEdit, childrenOf, fullName, lifespan, parentUnion, parentsOf, partnerIn, siblingsOf, store, unionsOf,
} from '../store.js';
import { avatar, confirmSheet, emptyState, html, openSheet, personRow, personTile, phoneLinks, raw, toast } from '../ui.js';

const STATUS = { married: 'Evli', divorced: 'Boşandı', widowed: 'Eşi vefat etti' };

const title = (icon, text) => html`<h3 class="section-title"><span class="st-icon">${icon}</span>${text}</h3>`;

// Kişi kartının üstündeki küçük manzara (renkler CSS'ten gelir)
const BANNER = raw(`
  <svg viewBox="0 0 400 110" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <circle class="sun" cx="336" cy="34" r="16"/>
    <g class="cloud"><ellipse cx="70" cy="30" rx="22" ry="9"/><ellipse cx="88" cy="24" rx="15" ry="11"/></g>
    <g class="cloud small"><ellipse cx="250" cy="22" rx="16" ry="6"/><ellipse cx="262" cy="18" rx="10" ry="7"/></g>
    <path class="hill2" d="M0 78 Q90 44 190 70 T400 58 V110 H0Z"/>
    <path class="hill1" d="M0 92 Q120 66 250 88 T400 84 V110 H0Z"/>
    <g class="tree-mini"><rect x="52" y="62" width="4" height="14" rx="2"/><circle cx="54" cy="58" r="10"/></g>
    <g class="tree-mini"><rect x="356" y="56" width="4" height="14" rx="2"/><circle cx="358" cy="52" r="12"/></g>
    <g class="tree-mini alt"><rect x="376" y="64" width="3" height="10" rx="1.5"/><circle cx="377.5" cy="61" r="7"/></g>
  </svg>`);

export function render(ctx, id) {
  const p = store.byId.get(id);
  if (!p) {
    ctx.setHeader({ title: 'Bulunamadı', back: true });
    ctx.el.innerHTML = emptyState({ icon: '🔍', title: 'Kişi bulunamadı', actions: html`<a class="btn btn-primary" href="#/kisiler">Kişilere dön</a>` }).s;
    return;
  }
  rememberPerson(id);
  const editor = canEdit();
  ctx.setHeader({ title: fullName(p), back: true, action: editor ? { icon: '✏️', label: 'Düzenle', href: `#/duzenle/${id}` } : null });

  ctx.el.innerHTML = html`
    ${parentsSection(p, editor)}
    ${heroSection(p)}
    ${contactSection(p)}
    ${familySection(p, editor)}
    ${siblingsSection(p)}
    ${p.notes ? html`<section class="section">${title('📝', 'Notlar')}<div class="card notes">${p.notes}</div></section>` : ''}
  `.s;

  ctx.el.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.preventDefault();
    const action = btn.dataset.action;
    if (action === 'union') await editUnion(Number(btn.dataset.id), ctx, p);
    if (action === 'unlink-parents') await unlinkParents(p, ctx);
  });
}

function parentsSection(p, editor) {
  const parents = parentsOf(p);
  const u = parentUnion(p);
  const canAdd = editor && parents.length < 2;
  if (!parents.length && !editor) return '';
  const addTile = html`<a class="ptile ptile-add" href="#/yeni?type=parent&anchor=${p.id}"><span class="avatar">＋</span><span class="ptile-name">Ebeveyn ekle</span></a>`;
  return html`
    <section class="section parents">
      ${title('👪', 'Anne & Baba')}
      <div class="tile-row couple">
        ${parents.map((x, i) => html`${i ? raw('<span class="heart-link" aria-hidden="true">♥</span>') : ''}${personTile(x, x.gender === 'K' ? 'Anne' : x.gender === 'E' ? 'Baba' : 'Ebeveyn')}`)}
        ${canAdd ? addTile : ''}
      </div>
      ${editor && u ? html`<button class="link-btn" data-action="unlink-parents" type="button">Ebeveyn bağlantısını kaldır</button>` : ''}
    </section>
    <div class="connector" aria-hidden="true"></div>`;
}

function heroSection(p) {
  const a = age(p);
  const facts = [
    p.birth_place && ['🏡', `Doğum yeri: ${p.birth_place}`],
    p.city && ['📍', p.city],
    p.job && ['💼', p.job],
  ].filter(Boolean);
  return html`
    <section class="card hero ${p.gender === 'E' ? 'is-male' : p.gender === 'K' ? 'is-female' : ''}">
      <div class="hero-banner">${BANNER}</div>
      <div class="hero-avatar">${avatar(p, 'xl')}</div>
      <h2 class="hero-name">${fullName(p)}</h2>
      ${p.maiden_name ? html`<div class="muted small">Kızlık soyadı: ${p.maiden_name}</div>` : ''}
      <div class="hero-meta">
        <span>${[lifespan(p), a != null ? `${a} yaş${p.is_alive ? '' : 'ında vefat'}` : ''].filter(Boolean).join(' · ')}</span>
        <span class="badge ${p.is_alive ? 'badge-alive' : 'badge-deceased'}">${p.is_alive ? 'Hayatta' : 'Vefat'}</span>
      </div>
      ${facts.length ? html`<div class="facts">${facts.map(([i, t], n) => html`<span class="fact tone-${n}">${i} ${t}</span>`)}</div>` : ''}
      <div class="hero-actions">
        <a class="btn btn-soft" href="#/agac/${p.id}">🌳 Soyunu göster</a>
      </div>
    </section>`;
}

function contactSection(p) {
  if (!p.phone && !p.email) return '';
  const links = p.phone ? phoneLinks(p.phone) : null;
  return html`
    <section class="section">
      ${title('📞', 'İletişim')}
      <div class="card contact">
        ${p.phone ? html`<div class="contact-row"><span>📱 ${p.phone}</span><span class="contact-actions"><a class="btn btn-sm btn-soft" href="${links.tel}">Ara</a><a class="btn btn-sm btn-soft" href="${links.whatsapp}" target="_blank" rel="noopener">WhatsApp</a></span></div>` : ''}
        ${p.email ? html`<div class="contact-row"><span>✉️ ${p.email}</span><a class="btn btn-sm btn-soft" href="mailto:${p.email}">E-posta</a></div>` : ''}
      </div>
    </section>`;
}

function familySection(p, editor) {
  const unions = unionsOf(p);
  if (!unions.length && !editor) return '';
  const blocks = unions.map((u, i) => {
    const partner = partnerIn(u, p);
    const kids = childrenOf(u);
    const label = unions.length > 1 ? `${i + 1}. evlilik` : partner ? 'Eşi' : 'Tek ebeveyn';
    const meta = [u.start_year && `${u.start_year} evliliği`, u.status !== 'married' && STATUS[u.status]].filter(Boolean).join(' · ');
    return html`
      <div class="card union">
        <div class="union-head">
          <span class="union-label"><span class="ribbon">💍 ${label}</span>${meta ? html`<span class="muted small">${meta}</span>` : ''}</span>
          ${editor ? html`<button class="icon-btn sm" data-action="union" data-id="${u.id}" type="button" aria-label="Evliliği düzenle">⋯</button>` : ''}
        </div>
        ${partner ? personRow(partner) : html`<div class="muted small pad">Eş bilgisi girilmemiş</div>`}
        <div class="children">
          <div class="children-title">🌱 ${kids.length ? `Çocuklar (${kids.length})` : 'Henüz çocuk kaydı yok'}</div>
          ${kids.map((c) => personRow(c))}
          ${editor ? html`<a class="add-row" href="#/yeni?type=child&anchor=${p.id}&union=${u.id}">＋ Çocuk ekle</a>` : ''}
        </div>
      </div>`;
  });
  return html`
    <section class="section">
      ${title('💞', 'Eş & Çocuklar')}
      ${blocks}
      ${editor
        ? html`<div class="btn-row">
            <a class="btn btn-ghost" href="#/yeni?type=spouse&anchor=${p.id}">＋ Eş ekle</a>
            ${!unions.length ? html`<a class="btn btn-ghost" href="#/yeni?type=child&anchor=${p.id}">＋ Çocuk ekle</a>` : ''}
          </div>`
        : ''}
    </section>`;
}

function siblingsSection(p) {
  const sibs = siblingsOf(p);
  if (!sibs.length) return '';
  return html`
    <section class="section">
      ${title('🧸', `Kardeşler (${sibs.length})`)}
      <div class="tile-row scroll">${sibs.map((s) => personTile(s))}</div>
    </section>`;
}

async function unlinkParents(p, ctx) {
  const ok = await confirmSheet({
    title: 'Ebeveyn bağlantısı kaldırılsın mı?',
    message: `${fullName(p)} ile anne-babası arasındaki bağ kaldırılacak. Kişiler silinmez.`,
    confirmText: 'Kaldır',
    danger: true,
  });
  if (!ok) return;
  await api.patch(`/people/${p.id}`, { parent_union_id: null });
  await refresh();
  toast('Bağlantı kaldırıldı', 'success');
  ctx.navigate(`#/kisi/${p.id}`, { replace: true });
}

async function editUnion(unionId, ctx, p) {
  const u = store.unionById.get(unionId);
  const partner = partnerIn(u, p);
  const result = await openSheet(
    html`
      <h2 class="sheet-title">Evlilik bilgisi</h2>
      <p class="muted">${fullName(p)}${partner ? raw(' &amp; ') : ''}${partner ? fullName(partner) : ''}</p>
      <form class="form" data-role="form">
        <label class="field"><span>Evlilik yılı</span><input class="input" name="start_year" inputmode="numeric" pattern="[0-9]{4}" value="${u.start_year ?? ''}" placeholder="örn. 1975"></label>
        <label class="field"><span>Durum</span>
          <select class="input" name="status">
            ${Object.entries(STATUS).map(([k, v]) => html`<option value="${k}" ${k === u.status ? raw('selected') : ''}>${v}</option>`)}
          </select>
        </label>
        <div class="sheet-actions">
          <button class="btn btn-ghost" type="button" data-close>Vazgeç</button>
          <button class="btn btn-primary" type="submit">Kaydet</button>
        </div>
      </form>
      <button class="link-btn danger" type="button" data-close="delete">Evlilik kaydını sil</button>`.s,
    {
      onMount(dialog, close) {
        dialog.querySelector('[data-role=form]').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          try {
            await api.patch(`/unions/${unionId}`, { start_year: fd.get('start_year'), status: fd.get('status') });
            close('saved');
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      },
    },
  );
  if (result === 'delete') {
    const kids = childrenOf(u).length;
    const ok = await confirmSheet({
      title: 'Evlilik kaydı silinsin mi?',
      message: `Kişiler silinmez${kids ? `; ${kids} çocuğun anne-baba bağlantısı kopar` : ''}.`,
      confirmText: 'Sil',
      danger: true,
    });
    if (!ok) return;
    await api.del(`/unions/${unionId}`);
  } else if (result !== 'saved') {
    return;
  }
  await refresh();
  toast('Güncellendi', 'success');
  ctx.navigate(`#/kisi/${p.id}`, { replace: true });
}
