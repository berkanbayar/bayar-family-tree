import { age, compareNames, fullName, initials, lifespan, store, trLower } from './store.js';

// ---------- Güvenli HTML şablonu ----------
class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const raw = (s) => new Raw(s);

function renderValue(v) {
  if (v == null || v === false || v === true) return '';
  if (Array.isArray(v)) return v.map(renderValue).join('');
  if (v instanceof Raw) return v.s;
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => (out += renderValue(v) + strings[i + 1]));
  return new Raw(out);
}

// ---------- Kişi bileşenleri ----------
export function avatar(p, size = '') {
  const cls = ['avatar', size, p.gender === 'E' ? 'is-male' : p.gender === 'K' ? 'is-female' : '', p.is_alive ? '' : 'is-deceased'];
  const badge = !p.is_alive && size !== 'sm' ? raw('<span class="avatar-badge" title="Vefat">🕊️</span>') : '';
  return html`<span class="${cls.filter(Boolean).join(' ')}" aria-hidden="true">${initials(p)}${badge}</span>`;
}

export function personMeta(p, { withCity = true } = {}) {
  const a = age(p);
  const parts = [lifespan(p), p.is_alive && a != null ? `${a} yaş` : null, withCity ? p.city : null];
  return parts.filter(Boolean).join(' · ');
}

export function personRow(p, { sub, tag, tagClass = '' } = {}) {
  if (!p) return '';
  return html`
    <a class="prow" href="#/kisi/${p.id}">
      ${avatar(p)}
      <span class="prow-text">
        <span class="prow-name">${fullName(p)}</span>
        <span class="prow-sub">${sub ?? personMeta(p)}</span>
      </span>
      ${tag ? html`<span class="tag ${tagClass}">${tag}</span>` : ''}
    </a>`;
}

export function personTile(p, label) {
  return html`
    <a class="ptile" href="#/kisi/${p.id}">
      ${avatar(p)}
      <span class="ptile-name">${p.first_name}</span>
      ${label ? html`<span class="ptile-role">${label}</span>` : ''}
      <span class="ptile-sub">${lifespan(p)}</span>
    </a>`;
}

// ---------- Bildirim ----------
let toastTimer;
export function toast(message, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.dataset.type = type;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), type === 'error' ? 4500 : 2500);
}

// ---------- Alt sayfa (bottom sheet) ----------
export function openSheet(content, { onMount } = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'sheet';
    dialog.innerHTML = `<div class="sheet-handle"></div><div class="sheet-body">${content}</div>`;
    document.body.appendChild(dialog);
    let result;
    const close = (value) => {
      result = value;
      dialog.close();
    };
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close();
      const btn = e.target.closest('[data-close]');
      if (btn) close(btn.dataset.close || undefined);
    });
    dialog.showModal();
    onMount?.(dialog, close);
  });
}

export async function confirmSheet({ title, message, confirmText = 'Onayla', danger = false }) {
  const choice = await openSheet(
    html`
      <h2 class="sheet-title">${title}</h2>
      ${message ? html`<p class="muted">${message}</p>` : ''}
      <div class="sheet-actions">
        <button class="btn btn-ghost" data-close="no" type="button">Vazgeç</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-close="yes" type="button">${confirmText}</button>
      </div>`.s,
  );
  return choice === 'yes';
}

// Arama yapılabilen kişi seçici
export function pickPerson({ title = 'Kişi seç', exclude = [] } = {}) {
  const pool = store.people.filter((p) => !exclude.includes(p.id)).sort(compareNames);
  return openSheet(
    html`
      <h2 class="sheet-title">${title}</h2>
      <input class="input" type="search" placeholder="İsim ara…" data-role="q" autocomplete="off">
      <div class="pick-list" data-role="list"></div>`.s,
    {
      onMount(dialog, close) {
        const input = dialog.querySelector('[data-role=q]');
        const list = dialog.querySelector('[data-role=list]');
        const draw = () => {
          const q = trLower(input.value.trim());
          const hits = pool.filter((p) => !q || trLower(fullName(p)).includes(q)).slice(0, 60);
          list.innerHTML = hits.length
            ? hits
                .map(
                  (p) => html`
                    <button type="button" class="prow" data-id="${p.id}">
                      ${avatar(p)}
                      <span class="prow-text"><span class="prow-name">${fullName(p)}</span><span class="prow-sub">${personMeta(p)}</span></span>
                    </button>`,
                )
                .join('')
            : '<p class="muted center">Sonuç yok</p>';
        };
        list.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-id]');
          if (btn) close(Number(btn.dataset.id));
        });
        input.addEventListener('input', draw);
        draw();
        setTimeout(() => input.focus(), 50);
      },
    },
  );
}

export function emptyState({ icon = '🌳', title, text, actions = '' }) {
  return html`
    <div class="empty">
      <div class="empty-icon"><span>${icon}</span></div>
      <h2>${title}</h2>
      ${text ? html`<p class="muted">${text}</p>` : ''}
      <div class="empty-actions">${actions}</div>
    </div>`;
}

export function phoneLinks(phone) {
  const digits = String(phone).replace(/\D/g, '');
  const intl = digits.startsWith('90') ? digits : digits.startsWith('0') ? '90' + digits.slice(1) : digits.length === 10 ? '90' + digits : digits;
  return { tel: `tel:+${intl}`, whatsapp: `https://wa.me/${intl}` };
}
