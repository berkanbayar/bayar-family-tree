# 🌳 Bayar Ailesi Soy Ağacı

> "Köklerimiz geçmişte, dallarımız gelecekte"

Mobil öncelikli, kendi veritabanıyla çalışan aile ağacı uygulaması. Telefonda uygulama gibi açılır (Ana ekrana ekle), tek bir sunucuda çalışır.

## Hızlı başlangıç

```bash
npm install
cp .env.example .env        # şifreleri doldurun
npm run seed                # (isteğe bağlı) kurgusal örnek aile
npm run dev                 # http://localhost:3000
```

Node.js **22.9+** gerekir.

## Özellikler

| Ekran | Ne yapar |
|---|---|
| 🏡 **Aile** | Seçili kişi merkezde. Üstte anne-baba, altta eş(ler) ve çocuklar, yanda kardeşler. Kişiye dokunarak soy boyunca gezilir |
| 🌳 **Ağaç** | Seçilen atadan başlayarak açılır-kapanır soy ağacı. Birden fazla evlilikte çocuklar eşe göre gruplanır |
| 👥 **Kişiler** | Türkçe karakter uyumlu arama; Hayatta, Erkek, Kadın ve Şehir filtreleri |
| ☰ **Menü** | İstatistikler, giriş, Excel/CSV içe ve dışa aktarma, JSON yedek alma ve geri yükleme |

Düzenleme (yönetici) yetkisi olanlar şunları yapabilir:

- Kişi ekleme, düzenleme ve silme
- Bir kişinin sayfasından doğrudan **çocuk, eş veya ebeveyn ekleme**
- Yeni kayıt açmak yerine **listeden mevcut bir kişiyi bağlama**
- Evlilik yılını ve durumunu (evli, boşandı, eşi vefat etti) düzenleme

Telefon numaraları için tek dokunuşla **Ara** ve **WhatsApp** butonları var.

**Özel günler:** Menüde önümüzdeki 30 günün 🎂 doğum günleri ve 🕯️ anma günleri listelenir. Bugün bir özel gün varsa alt menüde nokta belirir ve kişinin sayfasında "Bugün doğum günü!" yazar. 29 Şubat doğumlular artık olmayan yıllarda 28 Şubat'ta hatırlatılır. Açık ve koyu tema desteklenir.

## Erişim ve giriş

**Önerilen: e-posta ile giriş.** `ADMIN_EMAILS` tanımlanınca site kapanır. Yönetici, aile üyelerini **Menü → Üyeler ve davetler** ekranından e-postayla davet eder. Davetli kişi e-postasını yazar; ona 6 haneli bir kod ve tek dokunuşla giriş linki gider.

| Kural | Değer |
|---|---|
| Kodun geçerliliği | 15 dakika, tek kullanımlık |
| Hatalı deneme sınırı | Kod başına 5 deneme |
| Kod isteme sınırı | E-posta başına saatte 5 kod |
| Üyeden çıkarılınca | Kişinin açık oturumu da hemen kapanır |
| Davetli olmayan biri e-postasını yazarsa | Kod gönderilmez; kimin üye olduğu dışarıdan anlaşılmaz |

| Ayar | Mod | Kim ne görür |
|---|---|---|
| Hiçbiri | **Açık** | Herkes düzenler (sadece yerel geliştirme) |
| `ADMIN_EMAILS` | **Özel** | Sadece davetliler. Aile üyesi görür, yönetici düzenler |
| `ADMIN_EMAILS` + `PUBLIC_VIEW=1` | **Herkese açık** | Ziyaretçi ağacı görür (telefon, e-posta ve notlar gizli) |
| `ADMIN_PASSWORD` (+ `VIEW_PASSWORD`) | Şifre ile | Eski basit yöntem; e-posta ile birlikte yedek olarak da kullanılabilir |

SMTP ayarlanmamışsa giriş kodları sunucu konsoluna yazılır; bu yerel denemeler için kullanışlıdır.

## Excel formatı

Eski `index.html` sürümünün sütunları aynen desteklenir. Örnek dosya: [`docs/ornek-sablon.csv`](docs/ornek-sablon.csv)

| Sütun | Açıklama |
|---|---|
| `ID` | Kişi numarası. Birden fazla evliliği olan kişi `3a`, `3b` gibi harf ekiyle tekrar yazılır |
| `Ad Soyad` (veya ayrı `Ad`, `Soyad`) | Zorunlu |
| `Cinsiyet` | `E` / `K` (Erkek / Kadın da kabul edilir) |
| `Doğum Yılı`, `Vefat Yılı` | Yıl |
| `Doğum Tarihi`, `Vefat Tarihi` | `12.03.1948`, `1948-03-12` veya yılsız `12.03`. Gün ve ay girilirse doğum ve anma günleri hatırlatılır |
| `Vefat Yeri`, `Mezar Yeri` | Kişi sayfasındaki 🕯️ Anma kartında görünür; mezar yeri haritada açılabilir |
| `Hayatta` | `E` / `H` (Evet / Hayır da kabul edilir) |
| `Evlilik ID` | Kişinin evliliği; aynı değere sahip iki kişi eştir |
| `EBEVEYN Evlilik ID` | Kişinin anne-babasının `Evlilik ID` değeri |
| `Evlilik Durumu` | `Evli` / `Boşandı` / `Vefatla sona erdi` (boşsa Evli) |
| `Evlilik Bitiş Yılı` (veya `Boşanma Yılı`) | Boşanma ya da vefat yılı |
| `Şehir`, `Meslek`, `Telefon`, `E-posta`, `Doğum Yeri`, `Kızlık Soyadı`, `Notlar`, `Evlilik Yılı` | İsteğe bağlı |

Boşanma, ikinci evlilik ve vefat için örnek:

| ID | Ad Soyad | Evlilik ID | Evlilik Durumu | Evlilik Bitiş Yılı | EBEVEYN Evlilik ID |
|---|---|---|---|---|---|
| 7a | Murat Bayar | E5 | Boşandı | 2010 | |
| 7b | Murat Bayar | E6 | Evli | | |
| 8 | Gül Tekin | E5 | | | |
| 9 | Derya Bayar | E6 | | | |
| 10 | Yusuf Bayar | | | | E5 |
| 11 | Nil Bayar | | | | E6 |

Bu durumda Yusuf'un sayfasında Derya **üvey anne**, Nil **baba bir kardeş** olarak görünür. Eşlerden biri vefat etmişse evlilik kendiliğinden "vefatla sona erdi" gösterilir.

**Menü → Excel olarak indir** aynı formatta dosya üretir. Excel'de toplu düzenleme yapıp tekrar içe aktarabilirsiniz.

> ⚠️ İçe aktarma ve yedekten geri yükleme **mevcut verinin yerine geçer**. Öncesinde JSON yedek alın.

## Sunucuya alma

> 📘 Hetzner + alt alan adı için adım adım rehber ve koordinatör oturumuna yapıştırılacak hazır talimat: [`docs/DEPLOY.md`](docs/DEPLOY.md)

### Docker (önerilen)

```bash
cp .env.example .env   # ADMIN_PASSWORD, VIEW_PASSWORD ve SESSION_SECRET doldurun
docker compose up -d --build
```

Veritabanı `soyagaci-data` volume'ünde (`/data/family.db`) kalıcı olarak saklanır.

### Docker'sız (VPS, Raspberry Pi vb.)

```bash
npm ci --omit=dev
npm start              # pm2 veya systemd ile servis olarak çalıştırın
```

HTTPS için önüne **Caddy** koymak en kolay yol:

```
soyagaci.ornek.com {
  reverse_proxy localhost:3000
}
```

Bu durumda `.env` içinde `TRUST_PROXY=1` ayarlayın.

**Yedekleme:** veritabanı tek bir dosyadır (`data/family.db`). Düzenli olarak kopyalamanız veya Menü üzerinden JSON yedek almanız yeterli.

## Mimari

```
server/
  index.js     sunucuyu başlatır
  app.js       Express rotaları (/api/...)
  db.js        SQLite bağlantısı ve şema sürümleri (migration)
  repo.js      veri işlemleri, ilişki kuralları, döngü kontrolü
  sheet.js     Excel satırları <-> kayıtlar dönüşümü
  auth.js      şifre, oturum çerezi (HMAC imzalı), roller
public/        build adımı olmayan frontend (ES modülleri)
  js/views/    family · tree · people · edit · menu · login
test/          node:test ile API ve içe aktarma testleri
```

**Veri modeli:**

- `persons` tablosunda her kişi bir kez yer alır.
- `unions` tablosu evlilikleri tutar; bir evlilikte en fazla iki eş olur ve biri boş olabilir (tek ebeveyn).
- Çocuk, `persons.parent_union_id` alanıyla anne-babasının evliliğine bağlanır. Böylece üvey kardeşler ve birden fazla evlilik doğal olarak ifade edilir.

| Komut | İşlev |
|---|---|
| `npm test` | Testleri çalıştırır |
| `npm run seed -- --force` | Örnek veriyi yeniden yükler |
