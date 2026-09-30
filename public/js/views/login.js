import { api } from '../api.js';
import { loadFamily, store } from '../store.js';
import { html, toast } from '../ui.js';

const LAST_EMAIL = 'bayar:lastEmail';
const remembered = () => {
  try {
    return localStorage.getItem(LAST_EMAIL) ?? '';
  } catch {
    return '';
  }
};

export function render(ctx) {
  ctx.setHeader({ title: 'Giriş' });
  const { email: emailOn, password: passwordOn } = store.methods;
  let step = emailOn ? 'email' : 'password';
  let email = remembered();

  const draw = () => {
    ctx.el.innerHTML = html`
      <section class="login">
        <div class="login-logo">🌳</div>
        <h2>Bayar Ailesi Soy Ağacı</h2>
        ${step === 'email'
          ? html`
            <p class="muted">E-posta adresinizi yazın, size bir giriş kodu gönderelim.</p>
            <form class="card form-card" data-role="email">
              <label class="field"><span>E-posta</span>
                <input class="input" type="email" name="email" inputmode="email" autocomplete="email" autocapitalize="off" value="${email}" placeholder="ornek@gmail.com" required>
              </label>
              <button class="btn btn-primary full" type="submit">📩 Kod gönder</button>
            </form>
            <p class="muted small">Sadece davet edilen aile üyeleri giriş yapabilir. Kod gelmezse yöneticiyle iletişime geçin.</p>`
          : step === 'code'
            ? html`
              <p class="muted"><strong>${email}</strong> adresine 6 haneli bir kod gönderdik 💌<br>Maildeki <em>Giriş yap</em> butonuna da dokunabilirsiniz.</p>
              <form class="card form-card" data-role="code">
                <label class="field"><span>Giriş kodu</span>
                  <input class="input code-input" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" placeholder="••••••" required>
                </label>
                <button class="btn btn-primary full" type="submit">Giriş yap</button>
              </form>
              <div class="btn-row">
                <button class="btn btn-ghost" type="button" data-action="resend">↻ Tekrar gönder</button>
                <button class="btn btn-ghost" type="button" data-action="change">✏️ E-postayı değiştir</button>
              </div>
              <p class="muted small">Gelen kutunuzda yoksa <em>Spam / Gereksiz</em> klasörüne bakın.</p>`
            : html`
              <p class="muted">${store.mode === 'private' ? 'Aile şifresi veya yönetici şifresiyle giriş yapın.' : 'Düzenleme yapmak için yönetici şifresiyle giriş yapın.'}</p>
              <form class="card form-card" data-role="password">
                <label class="field"><span>Şifre</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>
                <button class="btn btn-primary full" type="submit">Giriş yap</button>
              </form>`}
        ${emailOn && passwordOn
          ? html`<button class="link-btn" type="button" data-action="switch">${step === 'password' ? '📩 E-posta ile giriş' : '🔑 Şifre ile giriş'}</button>`
          : ''}
        ${store.mode === 'public' ? html`<a class="link-btn" href="#/">Giriş yapmadan göz at →</a>` : ''}
      </section>`.s;
    ctx.el.querySelector('input')?.focus();
  };

  const busy = async (form, fn) => {
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await fn();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };

  const sendCode = async () => {
    await api.post('/auth/request-code', { email });
    try {
      localStorage.setItem(LAST_EMAIL, email);
    } catch {}
    step = 'code';
    draw();
    toast('Kod gönderildi 💌', 'success');
  };

  const finish = async (role) => {
    await loadFamily();
    toast(role === 'editor' ? 'Hoş geldiniz, yönetici 👑' : 'Hoş geldiniz 🌳', 'success');
    ctx.navigate('#/', { replace: true });
  };

  ctx.el.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const role = form.dataset.role;
    if (role === 'email') {
      email = form.elements.email.value.trim().toLowerCase();
      busy(form, sendCode);
    }
    if (role === 'code') {
      busy(form, async () => finish((await api.post('/auth/verify', { email, code: form.elements.code.value })).role));
    }
    if (role === 'password') {
      busy(form, async () => finish((await api.post('/login', { password: form.elements.password.value })).role));
    }
  });

  // 6 hane girilince otomatik gönder
  ctx.el.addEventListener('input', (e) => {
    if (e.target.name === 'code' && e.target.value.replace(/\D/g, '').length === 6) e.target.form.requestSubmit();
  });

  ctx.el.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'change') step = 'email';
    if (action === 'switch') step = step === 'password' ? 'email' : 'password';
    if (action === 'resend') {
      try {
        await sendCode();
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    if (action) draw();
  });

  draw();
  if (ctx.query.get('hata') === 'link') toast('Giriş linkinin süresi dolmuş veya daha önce kullanılmış. Yeni kod isteyin.', 'error');
}
