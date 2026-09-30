import { api } from '../api.js';
import { canEdit, store } from '../store.js';
import { confirmSheet, emptyState, html, toast } from '../ui.js';

const ROLE = { editor: ['👑', 'Yönetici'], member: ['👪', 'Aile üyesi'] };

export async function render(ctx) {
  ctx.setHeader({ title: 'Üyeler', back: true });
  if (!canEdit() || !store.methods.email) {
    ctx.el.innerHTML = emptyState({ icon: '🔒', title: 'Bu sayfa yöneticiler içindir' }).s;
    return;
  }

  const draw = async () => {
    const list = await api.get('/members');
    ctx.el.innerHTML = html`
      <section class="card form-card invite">
        <h3 class="sheet-title">💌 Aileden birini davet et</h3>
        <form class="form" data-role="add">
          <label class="field"><span>E-posta</span><input class="input" type="email" name="email" inputmode="email" autocapitalize="off" placeholder="ornek@gmail.com" required></label>
          <label class="field"><span>İsim (isteğe bağlı)</span><input class="input" name="name" placeholder="örn. Ayşe Teyze"></label>
          <div class="segmented">
            <label><input type="radio" name="role" value="member" checked><span>👪 Aile üyesi</span></label>
            <label><input type="radio" name="role" value="editor"><span>👑 Yönetici</span></label>
          </div>
          <button class="btn btn-primary full" type="submit">Davet et</button>
        </form>
        <p class="muted small">Davet edilen kişi siteye girip e-postasını yazınca ona giriş kodu gider. <strong>Aile üyesi</strong> her şeyi görür, <strong>yönetici</strong> düzenleyebilir de.</p>
      </section>

      <section class="section">
        <h3 class="section-title"><span class="st-icon">👥</span>Davetliler (${list.length})</h3>
        <div class="card list">
          ${list.map((m) => {
            const [icon, label] = ROLE[m.role];
            return html`
              <div class="member-row">
                <span class="member-icon">${icon}</span>
                <span class="prow-text">
                  <span class="prow-name">${m.name || m.email}</span>
                  <span class="prow-sub">${m.name ? m.email + ' · ' : ''}${m.last_login_at ? `Son giriş: ${new Date(m.last_login_at.replace(' ', 'T') + 'Z').toLocaleDateString('tr-TR')}` : 'Henüz giriş yapmadı'}</span>
                </span>
                ${m.fixed
                  ? html`<span class="tag" title="Sunucu ayarlarında (ADMIN_EMAILS) tanımlı">Sabit</span>`
                  : html`
                    <button class="btn btn-sm btn-soft" type="button" data-action="role" data-id="${m.id}" data-role="${m.role}">${label}</button>
                    <button class="icon-btn sm" type="button" data-action="remove" data-id="${m.id}" data-email="${m.email}" aria-label="Kaldır">✕</button>`}
              </div>`;
          })}
        </div>
      </section>`.s;
  };

  ctx.el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.post('/members', Object.fromEntries(fd));
      toast('Davet edildi 💌', 'success');
      await draw();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  ctx.el.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    try {
      if (btn.dataset.action === 'role') {
        await api.patch(`/members/${btn.dataset.id}`, { role: btn.dataset.role === 'editor' ? 'member' : 'editor' });
      }
      if (btn.dataset.action === 'remove') {
        const ok = await confirmSheet({
          title: 'Erişim kaldırılsın mı?',
          message: `${btn.dataset.email} artık giriş yapamayacak; açık oturumu da hemen kapanır.`,
          confirmText: 'Kaldır',
          danger: true,
        });
        if (!ok) return;
        await api.del(`/members/${btn.dataset.id}`);
      }
      await draw();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  await draw();
}
