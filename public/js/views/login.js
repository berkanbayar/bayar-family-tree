import { api } from '../api.js';
import { loadFamily, store } from '../store.js';
import { html, toast } from '../ui.js';

export function render(ctx) {
  ctx.setHeader({ title: 'Giriş' });
  ctx.el.innerHTML = html`
    <section class="login">
      <div class="login-logo">🌳</div>
      <h2>Bayar Ailesi Soy Ağacı</h2>
      <p class="muted">${store.mode === 'private' ? 'Aile şifresi veya yönetici şifresiyle giriş yapın.' : 'Düzenleme yapmak için yönetici şifresiyle giriş yapın.'}</p>
      <form class="card form-card" data-role="form">
        <label class="field"><span>Şifre</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>
        <button class="btn btn-primary full" type="submit">Giriş yap</button>
      </form>
      ${store.mode === 'public' ? html`<a class="link-btn" href="#/">Giriş yapmadan göz at →</a>` : ''}
    </section>`.s;

  const form = ctx.el.querySelector('[data-role=form]');
  setTimeout(() => form.elements.password.focus(), 50);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const { role } = await api.post('/login', { password: form.elements.password.value });
      await loadFamily();
      toast(role === 'editor' ? 'Yönetici olarak giriş yapıldı' : 'Hoş geldiniz', 'success');
      ctx.navigate('#/', { replace: true });
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      form.elements.password.select();
    }
  });
}
