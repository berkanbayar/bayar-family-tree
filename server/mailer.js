import nodemailer from 'nodemailer';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * SMTP ayarlı değilse mailler gönderilmez, sunucu konsoluna yazılır (yerel geliştirme için).
 * Testlerde `transport` yerine sahte bir gönderici verilebilir.
 */
export function createMailer(config, { transport } = {}) {
  const smtp = config.smtp;
  const sender =
    transport ??
    (smtp.host
      ? nodemailer.createTransport({
          host: smtp.host,
          port: smtp.port,
          secure: smtp.secure,
          auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
        })
      : null);

  return {
    configured: Boolean(sender),

    async sendLoginCode({ to, code, link, name }) {
      const subject = `Giriş kodunuz: ${code} · Bayar Soy Ağacı`;
      const text = [
        `Merhaba${name ? ' ' + name : ''},`,
        '',
        `Bayar Soy Ağacı giriş kodunuz: ${code}`,
        '',
        `Ya da bu linke dokunarak doğrudan girin: ${link}`,
        '',
        'Kod 15 dakika geçerlidir ve tek kullanımlıktır.',
        'Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.',
      ].join('\n');
      const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;background:#fbf6ee;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#3b312c">
  <div style="max-width:440px;margin:0 auto;padding:32px 20px;text-align:center">
    <div style="font-size:52px">🌳</div>
    <h1 style="font-size:22px;margin:8px 0 4px">Bayar Soy Ağacı</h1>
    <p style="color:#8b7e75;margin:0 0 24px">Merhaba${name ? ' ' + esc(name) : ''}! Giriş kodunuz:</p>
    <div style="display:inline-block;background:#fff;border:2px dashed #3f9a6e;border-radius:18px;padding:14px 26px;font-size:34px;font-weight:800;letter-spacing:8px;color:#2f7a55">${esc(code)}</div>
    <p style="margin:26px 0 10px;color:#8b7e75">ya da tek dokunuşla girin:</p>
    <a href="${esc(link)}" style="display:inline-block;background:#3f9a6e;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:16px">Giriş yap</a>
    <p style="font-size:12px;color:#a2968c;margin-top:28px">Kod 15 dakika geçerlidir ve tek kullanımlıktır.<br>Bu isteği siz yapmadıysanız e-postayı yok sayabilirsiniz.</p>
  </div></body></html>`;

      if (!sender) {
        console.log(`📧 [SMTP yok] ${to} → kod: ${code} · link: ${link}`);
        return;
      }
      await sender.sendMail({ from: smtp.from ? `"Bayar Soy Ağacı" <${smtp.from}>` : undefined, to, subject, text, html });
    },
  };
}
