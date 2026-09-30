import { ApiError } from './api.js';
import { loadFamily, loadSession, roots, store, upcomingEvents } from './store.js';
import { emptyState, html, toast } from './ui.js';
import * as editView from './views/edit.js';
import * as familyView from './views/family.js';
import * as loginView from './views/login.js';
import * as membersView from './views/members.js';
import * as menuView from './views/menu.js';
import * as peopleView from './views/people.js';
import * as treeView from './views/tree.js';

const LAST_PERSON = 'bayar:lastPerson';

const routes = [
  { path: /^\/$/, tab: 'family', render: renderHome },
  { path: /^\/kisi\/(\d+)$/, tab: 'family', render: (ctx, [id]) => familyView.render(ctx, Number(id)) },
  { path: /^\/agac(?:\/(\d+))?$/, tab: 'tree', render: (ctx, [id]) => treeView.render(ctx, id ? Number(id) : null) },
  { path: /^\/kisiler$/, tab: 'people', render: (ctx) => peopleView.render(ctx) },
  { path: /^\/menu$/, tab: 'menu', render: (ctx) => menuView.render(ctx) },
  { path: /^\/duzenle\/(\d+)$/, tab: null, render: (ctx, [id]) => editView.render(ctx, Number(id)) },
  { path: /^\/yeni$/, tab: null, render: (ctx) => editView.render(ctx, null) },
  { path: /^\/giris$/, tab: 'menu', render: (ctx) => loginView.render(ctx), public: true },
  { path: /^\/uyeler$/, tab: 'menu', render: (ctx) => membersView.render(ctx) },
];

const main = document.getElementById('main');
const titleEl = document.getElementById('title');
const backBtn = document.getElementById('back');
const actionSlot = document.getElementById('action');

export function navigate(hash, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', hash);
  else history.pushState(null, '', hash);
  route();
}

export async function refresh() {
  await loadFamily();
}

export function rememberPerson(id) {
  try {
    localStorage.setItem(LAST_PERSON, String(id));
  } catch {}
}

function setHeader({ title = 'Bayar Soy Ağacı', back = false, action = null } = {}) {
  titleEl.textContent = title;
  document.title = title === 'Bayar Soy Ağacı' ? title : `${title} · Bayar Soy Ağacı`;
  backBtn.hidden = !back;
  actionSlot.innerHTML = action
    ? html`<a class="icon-btn" href="${action.href}" aria-label="${action.label}" title="${action.label}">${action.icon}</a>`.s
    : '';
}

function renderHome(ctx) {
  if (!store.people.length) {
    ctx.setHeader();
    const actions =
      store.role === 'editor'
        ? html`<a class="btn btn-primary" href="#/yeni">➕ İlk kişiyi ekle</a><a class="btn btn-ghost" href="#/menu">📥 Excel'den içe aktar</a>`
        : html`<a class="btn btn-primary" href="#/giris">🔑 Giriş yap</a>`;
    ctx.el.innerHTML = emptyState({
      title: 'Ağaç henüz boş',
      text: 'Köklerimiz geçmişte, dallarımız gelecekte. İlk kaydı ekleyerek başlayın.',
      actions,
    }).s;
    return;
  }
  let id = null;
  try {
    id = Number(localStorage.getItem(LAST_PERSON));
  } catch {}
  if (!store.byId.has(id)) id = roots()[0]?.person.id ?? store.people[0].id;
  navigate(`#/kisi/${id}`, { replace: true });
}

async function route() {
  const [pathPart, queryPart = ''] = (location.hash.slice(1) || '/').split('?');
  const match = routes.map((r) => [r, r.path.exec(pathPart)]).find(([, m]) => m);
  const [routeDef, m] = match ?? [routes[0], ['/']];

  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === routeDef.tab));

  const el = document.createElement('div');
  el.className = 'view';
  main.replaceChildren(el);
  window.scrollTo(0, 0);

  const ctx = { el, query: new URLSearchParams(queryPart), setHeader, navigate };
  try {
    if (!routeDef.public && !store.loaded) {
      el.innerHTML = '<div class="loading"><span class="spinner"></span></div>';
      await loadFamily();
    }
    await routeDef.render(ctx, m.slice(1));
    // Bugün doğum/anma günü varsa Menü sekmesinde nokta göster
    document.querySelector('.tabbar [data-tab=menu]').classList.toggle('has-dot', store.loaded && upcomingEvents(store.people, { days: 0 }).length > 0);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      navigate('#/giris', { replace: true });
      return;
    }
    console.error(err);
    setHeader({ title: 'Hata' });
    el.innerHTML = emptyState({ icon: '⚠️', title: 'Bir şeyler ters gitti', text: err.message }).s;
  }
}

backBtn.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else navigate('#/');
});

window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', (e) => {
  toast(e.reason?.message || 'Beklenmeyen hata', 'error');
});

loadSession()
  .catch(() => {})
  .finally(route);
