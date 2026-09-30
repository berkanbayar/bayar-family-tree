import { api } from '../api.js';
import { refresh } from '../app.js';
import { canEdit, generationCount, loadSession, store } from '../store.js';
import { confirmSheet, html, toast } from '../ui.js';
import { downloadXlsx, readSheetRows } from '../xlsx.js';

const ROLE_TEXT = {
  editor: ['👑', 'Yönetici', 'Ekleme, düzenleme ve içe aktarma yapabilirsiniz.'],
  member: ['👪', 'Aile üyesi', 'Tüm bilgileri görebilirsiniz.'],
  guest: ['👀', 'Ziyaretçi', 'Ağacı görebilirsiniz; iletişim bilgileri gizlidir.'],
};

export function render(ctx) {
  ctx.setHeader({ title: 'Menü' });
  const editor = canEdit();
  const couples = store.unions.filter((u) => u.partner1_id && u.partner2_id).length;
  const alive = store.people.filter((p) => p.is_alive).length;
  const [icon, roleName, roleText] = ROLE_TEXT[store.role] ?? ROLE_TEXT.guest;
  const today = new Date().toISOString().slice(0, 10);
  const generations = generationCount();

  ctx.el.innerHTML = html`
    <section class="hello">
      <div>
        <div class="hello-hi">Merhaba! 👋</div>
        <div class="hello-sub">Ailemizde <strong>${store.people.length}</strong> kişi, <strong>${generations}</strong> nesil var.</div>
      </div>
      <div class="hello-art" aria-hidden="true">🌳</div>
    </section>
    <section class="stats">
      <div class="stat tone-0"><span class="stat-emoji">👥</span><strong>${store.people.length}</strong><span>Kişi</span></div>
      <div class="stat tone-1"><span class="stat-emoji">💞</span><strong>${couples}</strong><span>Aile</span></div>
      <div class="stat tone-2"><span class="stat-emoji">💚</span><strong>${alive}</strong><span>Hayatta</span></div>
      <div class="stat tone-3"><span class="stat-emoji">🌳</span><strong>${generations}</strong><span>Nesil</span></div>
    </section>

    <section class="section">
      <h3 class="section-title"><span class="st-icon">🔑</span>Oturum</h3>
      <div class="card session">
        <div class="session-info"><span class="session-icon">${icon}</span><div><strong>${roleName}</strong><div class="muted small">${roleText}</div></div></div>
        ${store.mode === 'open'
          ? html`<p class="warn small">⚠️ Şifre tanımlanmamış: bu kurulumda herkes düzenleyebilir. Sunucuya almadan önce <code>ADMIN_PASSWORD</code> tanımlayın.</p>`
          : store.role === 'editor' || store.role === 'member'
            ? html`<button class="btn btn-ghost full" type="button" data-action="logout">Çıkış yap</button>`
            : html`<a class="btn btn-primary full" href="#/giris">🔑 Giriş yap</a>`}
      </div>
    </section>

    ${editor
      ? html`
        <section class="section">
          <h3 class="section-title"><span class="st-icon">✍️</span>Kayıt</h3>
          <div class="card list">
            <a class="menu-row" href="#/yeni"><span>➕</span><span>Yeni kişi ekle</span></a>
          </div>
        </section>

        <section class="section">
          <h3 class="section-title"><span class="st-icon">🗂️</span>Veri</h3>
          <div class="card list">
            <label class="menu-row"><span>📥</span><span>Excel / CSV içe aktar<small>Mevcut verinin yerine geçer</small></span><input type="file" accept=".xlsx,.xls,.csv" data-role="import" hidden></label>
            <button class="menu-row" type="button" data-action="export-xlsx"><span>📊</span><span>Excel olarak indir<small>Tekrar içe aktarılabilir formatta</small></span></button>
            <a class="menu-row" href="/api/export" download="bayar-soy-agaci-${today}.json"><span>💾</span><span>Yedek indir (JSON)<small>Tüm veriler, eksiksiz</small></span></a>
            <label class="menu-row"><span>♻️</span><span>Yedekten geri yükle<small>JSON yedek dosyası</small></span><input type="file" accept=".json,application/json" data-role="restore" hidden></label>
          </div>
        </section>`
      : ''}

    <section class="section about muted small">
      <p>🌳 <strong>Bayar Ailesi Soy Ağacı</strong><br>“Köklerimiz geçmişte, dallarımız gelecekte.”</p>
      <p>Telefonunuzda tarayıcı menüsünden <em>Ana ekrana ekle</em> diyerek uygulama gibi kullanabilirsiniz.</p>
    </section>`.s;

  ctx.el.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'logout') {
      await api.post('/logout');
      store.loaded = false;
      await loadSession();
      toast('Çıkış yapıldı');
      ctx.navigate(store.mode === 'private' ? '#/giris' : '#/', { replace: true });
    }
    if (action === 'export-xlsx') {
      try {
        const rows = await api.get('/export/rows');
        await downloadXlsx(rows, `bayar-soy-agaci-${today}.xlsx`);
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });

  ctx.el.addEventListener('change', async (e) => {
    const role = e.target.dataset.role;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (role === 'import') await importSheet(file, ctx);
      if (role === 'restore') await restoreBackup(file, ctx);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function importSheet(file, ctx) {
  toast('Dosya okunuyor…');
  const rows = await readSheetRows(file);
  const preview = await api.post('/import', { rows, dryRun: true });
  const warnings = preview.warnings.length ? ` ${preview.warnings.length} uyarı var (ör. ${preview.warnings[0]}).` : '';
  const ok = await confirmSheet({
    title: 'İçe aktarma onayı',
    message: `${preview.people} kişi ve ${preview.unions} evlilik bulundu.${warnings} Mevcut ${store.people.length} kayıt SİLİNİP yerine bunlar yazılacak. Öncesinde yedek almanız önerilir.`,
    confirmText: 'İçe aktar',
    danger: store.people.length > 0,
  });
  if (!ok) return;
  await api.post('/import', { rows });
  await refresh();
  toast(`✅ ${preview.people} kişi içe aktarıldı`, 'success');
  ctx.navigate('#/', { replace: true });
}

async function restoreBackup(file, ctx) {
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    throw new Error('Dosya okunamadı: geçerli bir JSON değil');
  }
  const ok = await confirmSheet({
    title: 'Yedekten geri yüklensin mi?',
    message: `Yedekte ${backup.people?.length ?? 0} kişi var. Mevcut tüm veriler silinip yedek yüklenecek.`,
    confirmText: 'Geri yükle',
    danger: true,
  });
  if (!ok) return;
  await api.post('/restore', backup);
  await refresh();
  toast('✅ Yedek geri yüklendi', 'success');
  ctx.navigate('#/', { replace: true });
}
