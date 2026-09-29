import { canEdit, compareNames, fullName, store, trLower } from '../store.js';
import { emptyState, html, personMeta, personRow } from '../ui.js';

// Görünümler arası gezinirken arama durumunu koru
const state = { q: '', filter: 'all', city: '' };

const FILTERS = [
  ['all', 'Tümü'],
  ['alive', '💚 Hayatta'],
  ['male', '👨 Erkek'],
  ['female', '👩 Kadın'],
];

export function render(ctx) {
  ctx.setHeader({ title: 'Kişiler', action: canEdit() ? { icon: '＋', label: 'Yeni kişi', href: '#/yeni' } : null });
  const cities = [...new Set(store.people.map((p) => p.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));

  ctx.el.innerHTML = html`
    <div class="search-bar">
      <input class="input search" type="search" placeholder="🔍 İsim, şehir veya meslek ara…" value="${state.q}" data-role="q" autocomplete="off">
      <div class="chips scroll">
        ${FILTERS.map(([k, v]) => html`<button type="button" class="chip ${state.filter === k ? 'active' : ''}" data-filter="${k}">${v}</button>`)}
        ${cities.length > 1
          ? html`<select class="chip chip-select" data-role="city" aria-label="Şehir">
              <option value="">📍 Tüm şehirler</option>
              ${cities.map((c) => html`<option value="${c}" ${c === state.city ? 'selected' : ''}>${c}</option>`)}
            </select>`
          : ''}
      </div>
    </div>
    <div data-role="results"></div>`.s;

  const results = ctx.el.querySelector('[data-role=results]');
  const draw = () => {
    const q = trLower(state.q.trim());
    const list = store.people
      .filter((p) => {
        if (state.filter === 'alive' && !p.is_alive) return false;
        if (state.filter === 'male' && p.gender !== 'E') return false;
        if (state.filter === 'female' && p.gender !== 'K') return false;
        if (state.city && p.city !== state.city) return false;
        if (!q) return true;
        return [fullName(p), p.maiden_name, p.city, p.job, p.birth_place].some((v) => trLower(v).includes(q));
      })
      .sort(compareNames);

    if (!list.length) {
      results.innerHTML = emptyState({ icon: '🔍', title: 'Sonuç bulunamadı', text: 'Aramayı veya filtreleri değiştirin.' }).s;
      return;
    }
    const groups = new Map();
    for (const p of list) {
      const letter = (p.first_name[0] ?? '#').toLocaleUpperCase('tr');
      if (!groups.has(letter)) groups.set(letter, []);
      groups.get(letter).push(p);
    }
    results.innerHTML = html`
      <p class="muted small">${list.length} kişi</p>
      ${[...groups].map(
        ([letter, people]) => html`
          <div class="letter">${letter}</div>
          <div class="card list">${people.map((p) => personRow(p, { sub: [personMeta(p), p.job].filter(Boolean).join(' · ') }))}</div>`,
      )}`.s;
  };

  ctx.el.querySelector('[data-role=q]').addEventListener('input', (e) => {
    state.q = e.target.value;
    draw();
  });
  ctx.el.querySelector('[data-role=city]')?.addEventListener('change', (e) => {
    state.city = e.target.value;
    draw();
  });
  ctx.el.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]');
    if (!chip) return;
    state.filter = chip.dataset.filter;
    ctx.el.querySelectorAll('[data-filter]').forEach((c) => c.classList.toggle('active', c === chip));
    draw();
  });
  draw();
}
