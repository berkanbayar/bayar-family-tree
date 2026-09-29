import { childrenOf, descendantCount, fullName, lifespan, partnerIn, roots, store, unionsOf } from '../store.js';
import { avatar, emptyState, html, pickPerson } from '../ui.js';

const OPEN_DEPTH = 2;

export function render(ctx, rootId) {
  ctx.setHeader({ title: 'Soy Ağacı' });
  const allRoots = roots();
  const root = store.byId.get(rootId) ?? allRoots[0]?.person;
  if (!root) {
    ctx.el.innerHTML = emptyState({ title: 'Ağaç boş', text: 'Önce kişi ekleyin.' }).s;
    return;
  }
  const total = descendantCount(root);
  const otherRoots = allRoots.filter((r) => r.person.id !== root.id && r.count > 0).slice(0, 8);

  ctx.el.innerHTML = html`
    <div class="tree-toolbar">
      <button class="root-picker" type="button" data-action="pick">
        ${avatar(root, 'sm')}
        <span><span class="muted small">Başlangıç</span><br><strong>${fullName(root)}</strong></span>
        <span class="chev">▾</span>
      </button>
      <div class="btn-row tight">
        <button class="btn btn-sm btn-soft" type="button" data-action="expand">Tümünü aç</button>
        <button class="btn btn-sm btn-soft" type="button" data-action="collapse">Kapat</button>
      </div>
    </div>
    ${otherRoots.length
      ? html`<div class="chips scroll">${otherRoots.map((r) => html`<a class="chip" href="#/agac/${r.person.id}">${fullName(r.person)} · ${r.count}</a>`)}</div>`
      : ''}
    <p class="muted small">${total} torun/çocuk · dallara dokunarak açıp kapatın, isme dokunarak kişiye gidin</p>
    <ul class="tree">${node(root, 0, new Set())}</ul>
  `.s;

  ctx.el.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'expand' || action === 'collapse') {
      ctx.el.querySelectorAll('.tree details').forEach((d) => (d.open = action === 'expand'));
    }
    if (action === 'pick') {
      const id = await pickPerson({ title: 'Ağaç kimden başlasın?' });
      if (id) ctx.navigate(`#/agac/${id}`);
    }
  });
}

function label(p) {
  return html`
    <a class="tnode" href="#/kisi/${p.id}">
      ${avatar(p, 'sm')}
      <span class="tnode-text"><span class="tnode-name">${fullName(p)}</span><span class="tnode-sub">${lifespan(p)}</span></span>
    </a>`;
}

function spouseLabel(u, p) {
  const s = partnerIn(u, p);
  return s ? html`<a class="tspouse" href="#/kisi/${s.id}">💍 ${fullName(s)}</a>` : '';
}

function node(p, depth, seen) {
  if (seen.has(p.id)) return '';
  seen.add(p.id);
  const unions = unionsOf(p);
  const kidsCount = unions.reduce((n, u) => n + childrenOf(u).length, 0);
  const spouses = unions.map((u) => spouseLabel(u, p));

  if (!kidsCount) {
    return html`<li><div class="trow leaf">${label(p)}${spouses.length ? html`<div class="tspouses">${spouses}</div>` : ''}</div></li>`;
  }

  const groups = unions
    .filter((u) => childrenOf(u).length)
    .map((u) => {
      const kids = childrenOf(u).map((c) => node(c, depth + 1, seen));
      if (unions.length < 2) return kids;
      const s = partnerIn(u, p);
      return html`<li class="tgroup">${s ? `${s.first_name} ile` : 'Diğer'}</li>${kids}`;
    });

  return html`
    <li>
      <details ${depth < OPEN_DEPTH ? 'open' : ''}>
        <summary class="trow">
          ${label(p)}
          <span class="tcount" aria-label="${kidsCount} çocuk">${kidsCount}</span>
          ${spouses.length ? html`<div class="tspouses">${spouses}</div>` : ''}
        </summary>
        <ul>${groups}</ul>
      </details>
    </li>`;
}
