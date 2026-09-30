# 🚀 Hetzner sunucusuna kurulum

Hedef: `https://soyagaci.dijitapro.com.tr` (alt alan adı değişebilir; aşağıda `ALAN_ADI` diye geçer).

## Mimari

```
İnternet ──443──► Ters vekil (Caddy / Nginx / Traefik, sunucuda zaten ne varsa)
                        │  otomatik HTTPS (Let's Encrypt)
                        ▼
              127.0.0.1:3000  ◄── Docker: bayar-soyagaci (Node + SQLite)
                                        │
                                        └── volume: soyagaci-data → /data/family.db (+ /data/backups)
```

Uygulama portu sadece `127.0.0.1`'e açılır; dışarıdan doğrudan erişilemez.

## 1. DNS

Alan adının DNS panelinde bir kayıt açın:

| Tip | Ad | Değer |
|---|---|---|
| `A` | `soyagaci` | Hetzner sunucusunun IPv4 adresi |
| `AAAA` (varsa) | `soyagaci` | Sunucunun IPv6 adresi |

Kontrol: `dig +short soyagaci.dijitapro.com.tr`

## 2. Kodu al ve ayarla

```bash
sudo mkdir -p /opt/bayar-soyagaci && sudo chown $USER /opt/bayar-soyagaci
git clone -b claude/great-archimedes-616e6e https://github.com/berkanbayar/bayar-family-tree.git /opt/bayar-soyagaci
cd /opt/bayar-soyagaci

cp .env.example .env
# Güçlü değerler üret:
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
```

`.env` içinde doldurulacaklar:

| Değişken | Öneri |
|---|---|
| `ADMIN_PASSWORD` | Güçlü bir şifre (düzenleme yetkisi) |
| `VIEW_PASSWORD` | Aile şifresi. **Önerilen:** telefon ve adres bilgileri olduğu için siteyi kapalı tutar |
| `SESSION_SECRET` | Yukarıdaki komutla üretildi |
| `APP_PORT` | Varsayılan `3000`. Sunucuda 3000 doluysa boş bir port seçin (örn. `3107`) |

> `.env` içinde aynı değişken iki kez geçerse **son satır** geçerlidir. `.env.example`'daki boş `SESSION_SECRET=` satırını silin.

## 3. Başlat

```bash
docker compose up -d --build
docker compose ps                        # STATUS: healthy olmalı
curl -s http://127.0.0.1:${APP_PORT:-3000}/api/health   # {"ok":true}
```

## 4. Ters vekil (sunucuda hangisi varsa)

Önce ne kullanıldığını bulun:

```bash
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' | grep -Ei 'caddy|nginx|traefik|proxy'
systemctl is-active caddy nginx 2>/dev/null
```

### A) Caddy

`Caddyfile`'a ekleyin, sonra `caddy reload` (veya `docker exec <caddy> caddy reload --config /etc/caddy/Caddyfile`):

```
soyagaci.dijitapro.com.tr {
    encode gzip zstd
    reverse_proxy 127.0.0.1:3000
}
```

> Caddy Docker içinde çalışıyorsa `127.0.0.1` yerine `host.docker.internal:3000` (Linux'ta `extra_hosts: ["host.docker.internal:host-gateway"]` gerekir) ya da iki konteyneri aynı Docker ağına alıp `bayar-soyagaci:3000` kullanın.

### B) Nginx + Certbot

`/etc/nginx/sites-available/soyagaci.dijitapro.com.tr`:

```nginx
server {
    listen 80;
    server_name soyagaci.dijitapro.com.tr;

    client_max_body_size 12m;   # Excel / yedek yükleme

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/soyagaci.dijitapro.com.tr /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d soyagaci.dijitapro.com.tr
```

### C) Traefik

`docker-compose.override.yml` oluşturun (Traefik'in ağ ve certresolver adlarını mevcut kurulumdan alın):

```yaml
services:
  soyagaci:
    ports: !reset []
    networks: [proxy]
    labels:
      - traefik.enable=true
      - traefik.http.routers.soyagaci.rule=Host(`soyagaci.dijitapro.com.tr`)
      - traefik.http.routers.soyagaci.entrypoints=websecure
      - traefik.http.routers.soyagaci.tls.certresolver=letsencrypt
      - traefik.http.services.soyagaci.loadbalancer.server.port=3000
networks:
  proxy:
    external: true
```

## 5. Otomatik yedek

Her gece 03:15'te yedek alır, son 30 günü saklar ve bir kopyayı konteyner dışına çıkarır:

```bash
sudo mkdir -p /var/backups/bayar-soyagaci
( crontab -l 2>/dev/null; echo '15 3 * * * cd /opt/bayar-soyagaci && docker compose exec -T soyagaci node scripts/backup.js /data/backups 30 >> /var/log/bayar-soyagaci-backup.log 2>&1 && docker cp bayar-soyagaci:/data/backups/. /var/backups/bayar-soyagaci/' ) | crontab -
```

Elle deneme: `docker compose exec -T soyagaci node scripts/backup.js`

Geri yükleme: uygulamada **Menü → Yedekten geri yükle** (JSON) ya da:

```bash
docker compose stop soyagaci
docker cp /var/backups/bayar-soyagaci/family-YYYY-MM-DD-HH-MM-SS.db bayar-soyagaci:/data/family.db
docker compose start soyagaci
```

## 6. Kontrol listesi

| Kontrol | Komut / Yöntem |
|---|---|
| HTTPS açılıyor | `curl -sI https://soyagaci.dijitapro.com.tr` → `200` |
| API sağlıklı | `curl -s https://soyagaci.dijitapro.com.tr/api/health` → `{"ok":true}` |
| Site kapalı (özel mod) | `curl -s https://soyagaci.dijitapro.com.tr/api/family` → `401` |
| Port dışarıya kapalı | Başka bir makineden `curl http://SUNUCU_IP:3000` → bağlantı reddedilmeli |
| Oturum çerezi güvenli | Giriş sonrası tarayıcıda çerez `Secure` ve `HttpOnly` |
| Yedek çalışıyor | `ls /var/backups/bayar-soyagaci` |

## 7. Güncelleme

```bash
cd /opt/bayar-soyagaci
git pull
docker compose up -d --build     # veritabanı şeması kendiliğinden güncellenir
```

## 8. İlk veri

Tarayıcıdan yönetici şifresiyle giriş yapın → **Menü → Excel / CSV içe aktar**.
Şablon: [`docs/ornek-sablon.csv`](ornek-sablon.csv)

---

## 🤖 Koordinatör Claude oturumu için hazır talimat

Aşağıdaki metni sunucuya SSH erişimi olan Claude Code oturumuna yapıştırın:

```text
berkanbayar/bayar-family-tree reposundaki "Bayar Soy Ağacı" uygulamasını Hetzner sunucumuzda
https://soyagaci.dijitapro.com.tr adresinde yayınla. Adım adım rehber repoda: docs/DEPLOY.md
(dal: claude/great-archimedes-616e6e).

Yapman gerekenler:
1. Hangi Hetzner sunucusunu kullanacağını bana sor (ya da kayıtlardan uygun olanı öner) ve SSH ile bağlan.
2. soyagaci.dijitapro.com.tr için DNS A kaydı var mı kontrol et; yoksa hangi IP'ye açılması gerektiğini söyle ve bekle.
3. Repoyu /opt/bayar-soyagaci'ye klonla, .env oluştur:
   - SESSION_SECRET: openssl rand -hex 32
   - ADMIN_PASSWORD ve VIEW_PASSWORD: güçlü şifreler üret, bana güvenli şekilde ilet (loglara yazma)
   - APP_PORT: 3000 doluysa boş bir port seç
4. docker compose up -d --build; container "healthy" olana kadar bekle.
5. Sunucudaki mevcut ters vekili tespit et (Caddy / Nginx / Traefik) ve DEPLOY.md'deki ilgili bölüme
   göre alt alan adını HTTPS ile bağla. Mevcut diğer sitelerin ayarlarına dokunma; değişiklikten önce
   config'in yedeğini al ve reload öncesi syntax kontrolü yap.
6. Gecelik yedek cron'unu kur (DEPLOY.md bölüm 5).
7. DEPLOY.md bölüm 6'daki kontrol listesini çalıştır ve sonuçları tablo olarak raporla.
```
