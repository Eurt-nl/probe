# WORDCOURT DEPLOYMENT OP VPS (SAMENVATTING)

## SERVER
- IP: `<VPS_IP>`
- User: `<VPS_USER>`
- Webserver: `Caddy`
- Database/API: `PocketBase (<POCKETBASE_URL>)`
- App URL: `<APP_URL>`

## 1. Inloggen op de VPS

```bash
ssh -i <PAD_NAAR_SSH_KEY> <VPS_USER>@<VPS_IP>
```

## 2. Map maken voor de nieuwe app

```bash
mkdir -p <APP_BASE_PATH>
cd <APP_BASE_PATH>
```

## 3. Project van GitHub ophalen

```bash
git clone <GITHUB_REPO_URL> .
```

## 4. Dependencies installeren

```bash
npm ci
```

## 5. Environment variabelen zetten voor de build

```bash
export VITE_POCKETBASE_URL=<POCKETBASE_URL>
export VITE_VERSION_FEED_PATH=<VERSION_FEED_PATH>
```

## 6. Frontend build maken

```bash
npm run build
```

Dit genereert:
`<APP_BASE_PATH>/dist`

## 7. Caddy configureren

Bestand:
`<CADDYFILE_PATH>`

Toegevoegd:

```caddy
<APP_DOMAIN> {
    encode zstd gzip

    root * <APP_BASE_PATH>/dist
    try_files {path} /index.html
    file_server

    @pwaCritical {
        path /index.html /sw.js /manifest.webmanifest /version.json
    }

    header @pwaCritical Cache-Control "no-cache, no-store, must-revalidate"

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "no-referrer-when-downgrade"
    }
}
```

## 8. Caddy herladen

```bash
sudo caddy reload --config <CADDYFILE_PATH>
```

## 9. DNS record toevoegen in Cloudflare

- Type: `A`
- Name: `<SUBDOMAIN>`
- IPv4: `<VPS_IP>`
- Proxy: `DNS only`

Resultaat:
`<APP_DOMAIN>` -> VPS

## 10. Referee worker starten met PM2

```bash
PB_URL=<POCKETBASE_URL> \
PB_ADMIN_EMAIL="ADMIN_EMAIL" \
PB_ADMIN_PASSWORD="ADMIN_PASSWORD" \
pm2 start npm --name <REFEREE_PROCESS_NAME> -- run referee:remote
```

## 11. PM2 processen controleren

```bash
pm2 list
```

## 12. PM2 configuratie opslaan

```bash
pm2 save
```

## 13. PM2 automatisch laten starten bij reboot

```bash
pm2 startup
```

Daarna het commando uitvoeren dat PM2 teruggeeft, bijvoorbeeld:

```bash
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u deploy --hp /home/deploy
```
Vervang `deploy` en `/home/deploy` door jouw eigen user/home.

## RESULTAAT

Caddy serveert:
- `<POCKETBASE_DOMAIN>` -> PocketBase
- `<ANDERE_APP_1_DOMAIN>` -> andere app
- `<ANDERE_APP_2_DOMAIN>` -> andere app
- `<APP_DOMAIN>` -> WordCourt

Workers:
- `<REFEREE_PROCESS_NAME>` via PM2

## TOEKOMSTIGE UPDATES (DEPLOY)

```bash
ssh -i <PAD_NAAR_SSH_KEY> <VPS_USER>@<VPS_IP>
cd <APP_BASE_PATH>
git pull
export VITE_POCKETBASE_URL=<POCKETBASE_URL>
export VITE_VERSION_FEED_PATH=<VERSION_FEED_PATH>
npm run build
pm2 restart <REFEREE_PROCESS_NAME>
```
