# aaPanel Facts Research — Node.js Deployment Guide Verification

**Date:** 2026-04-10
**Scope:** Verify facts for deploying NestJS + Next.js on VPS running aaPanel.
**Method:** Official docs (aapanel.com/docs), forum.aapanel.com, GitHub aaPanel/aaPanel, reputable tutorials.

---

## 1. Installation (Ubuntu 22.04 / 24.04)

Official install command (English, Ubuntu/Debian family), from aapanel.com/new/download.html:

```bash
URL=https://www.aapanel.com/script/install_7.0_en.sh && \
if [ -f /usr/bin/curl ];then curl -ksSO "$URL";else wget --no-check-certificate -O install_7.0_en.sh "$URL";fi; \
bash install_7.0_en.sh aapanel
```

Current major line is aaPanel 7.x. Script `install_panel_en.sh` also exists as a generic redirect. Ubuntu 22.04 is officially recommended; 24.04 is supported per CloudSpinx/Atlantic.Net tutorials. Default panel port is **8888**. After install the terminal prints panel URL, username, password; if lost run `bt default` (shows default entry/credentials) or `bt 14` (security entrance). `bt 5` resets password, `bt 8` changes port.
Sources: https://www.aapanel.com/new/download.html , https://www.aapanel.com/docs/faq/Panel_Related.html , https://www.aapanel.com/docs/guide/quickstart.html

---

## 2. Website module — Add site + reverse proxy

`Website → Add site` creates a directory at `/www/wwwroot/<domain>/` and writes an nginx vhost. For a Node.js reverse proxy to `127.0.0.1:PORT`, aaPanel 7 exposes a dedicated **"Website → Proxy Project"** (Proxy site type) in the left menu. Flow: Proxy Project → Add site → enter domain + target `http://127.0.0.1:PORT` + sending host → Submit. Alternatively on an existing site: click site name → **"Reverse Proxy"** tab (sub-menu under Site Settings modal) → Add reverse proxy → directory `/` + target address. There is no need to hand-edit nginx for the basic case.
Sources: https://www.aapanel.com/docs/Function/proxy.html , https://www.aapanel.com/forum/d/13714-reverse-proxy-for-nodejs-site

---

## 3. Nginx config file locations

- Per-site vhost: `/www/server/panel/vhost/nginx/<domain>.conf` (Apache equivalent: `/www/server/panel/vhost/apache/<domain>.conf`).
- Nginx binary + main config: `/www/server/nginx/conf/nginx.conf`.
- Rewrite rules: `/www/server/panel/vhost/rewrite/<domain>.conf`.
- SSL certs per site: `/www/server/panel/vhost/cert/<domain>/`.

**Overwrite risk:** aaPanel rewrites the vhost file whenever you change site settings / SSL / proxy via the UI. For persistent custom `location` blocks use Site Settings → **"Config file"** panel (edits the same vhost but via UI) or the dedicated **"Customized Configuration Files"** (server/http-level includes) which survive regeneration. Raw filesystem edits to `<domain>.conf` can be clobbered.
Sources: https://www.aapanel.com/forum/d/16457-aapanels-nginx-sites-locations , https://www.aapanel.com/forum/d/666-nginx-vhost-ssl-config , https://www.aapanel.com/docs/Function/proxy.html

---

## 4. SSL / Let's Encrypt

Flow: Site list → domain → **SSL** tab → **"Let's Encrypt"** sub-tab → tick domains → **Apply**. Default challenge is **HTTP-01** (webroot via `/.well-known/acme-challenge/`). Requires port 80 reachable from Let's Encrypt servers.

**Cloudflare proxied (orange cloud):** HTTP-01 generally fails because Cloudflare terminates TLS and may intercept challenge. Workarounds: (a) temporarily switch DNS record to DNS-only (grey cloud), issue cert, re-enable proxy; (b) use Cloudflare Origin Cert (free, 15yr) via SSL → "Other Certificate" paste; (c) use aaPanel DNS-01 with Cloudflare API — aaPanel supports DNS API providers (Cloudflare, Aliyun, DNSPod) in the SSL tab for wildcard/DNS-01 issuance, but setup is manual (API token required). HTTP-01 is the default button; DNS-01 requires picking a DNS provider dropdown.
Sources: https://www.aapanel.com/forum/d/548-how-to-use-cloudflare-with-aapanel , https://www.aapanel.com/forum/d/4042-cloudflare-ssl , https://www.aapanel.com/forum/d/18734-aapanel-cloudflare-domain-setup-problem

---

## 5. PM2 Manager plugin

**Yes**, "PM2 Manager" exists in the aaPanel App Store (Software Store) as of 2025. GUI lets you **Add Project** (path, name, port, startup file, node version), Start/Stop/Restart/Reload, view logs, edit env vars. It wraps real `pm2` CLI. PM2 Manager depends on the separate **"Node.js Version Manager"** plugin (install that first to pick Node versions). There is also an older "Node Project" feature under the Website menu — two overlapping systems (PM2 Manager is the newer recommended one).
Sources: https://www.linkysoft.com/knowledgebase/837/Node-PM2-Manager-vs-Node-Projects-A-Complete-Guide-in-aaPanel.html , https://www.aapanel.com/forum/d/12640-pm2-managerin-appstore-vs-node-project-managementadd-website-section , https://geeksconn.com/setup-pm2-manager-aapanel/

---

## 6. Node.js version management

aaPanel provides a **"Node.js Version Manager"** plugin in the App Store which internally uses **nvm**. After install: Website → Node Project → "Node Version Manager" button lists installable versions (14/16/18/20/22...), one-click install + switch per project. No need for separate nvm install. If you skip the plugin, install nvm/n manually as usual.
Source: https://www.voxfor.com/how-to-use-node-version-manager-nvm-in-aapanel/

---

## 7. Docker Manager plugin

**Yes**, official "Docker Manager" plugin exists in App Store. Features: one-click install Docker + docker-compose, container start/stop/restart/delete, image pull, network management, terminal into container, **compose.yaml editor** (edit + up/down from GUI), template one-click apps. CLI `docker compose` still works in parallel — plugin is a thin wrapper over the standard Docker daemon, no conflict. Some community reports of "Currently not installed docker or docker-compose" errors if Docker was installed manually before plugin.
Sources: https://www.aapanel.com/docs/Function/Docker.html , https://forum.aapanel.com/d/13701-docker-moduleuser-manual , https://forum.aapanel.com/d/15687-currently-not-installed-docker-or-docker-compose-click-install

---

## 8. Firewall

aaPanel's **Security** tab is **not a UFW wrapper**. It auto-detects and drives either `firewalld` (RHEL) or `ufw` (Debian/Ubuntu) — whichever is installed — and falls back to direct `iptables` rules otherwise (see `aaPanel/class/firewall_new.py`). **Conflict risk is real**: rules added via `ufw` CLI do not always appear in the aaPanel Security tab and vice versa. Recommendation: manage firewall only from aaPanel UI, or only from ufw CLI — not both. If you run `ufw enable` after install, whitelist aaPanel port (8888), phpMyAdmin port (888), SSH, 80, 443 explicitly or you will lock yourself out.
Sources: https://github.com/aaPanel/aaPanel/blob/master/class/firewall_new.py , https://www.aapanel.com/forum/d/17043-some-port-rules-not-showing-in-security-tab , https://www.aapanel.com/forum/d/1218-security-panel-using-my-current-iptables-configuration

---

## 9. Cron

**Cron** tab lets you schedule Shell Script / Backup site / Backup DB / Log cutting tasks. Shell script mode: paste script body, pick period (minute/hour/day/week/month). aaPanel writes entries to the system crontab (`/etc/crontab` / user crontab) and pipes output to log files under `/www/server/cron/<task_id>` (viewable via "Log" button next to each task). `/www/wwwlogs/` is for web access logs, not cron. Known caveat: scripts run with limited PATH — use absolute binaries (`/usr/bin/node` not `node`).
Sources: https://www.aapanel.com/docs/Function/Cron.html , https://github.com/aaPanel/aaPanel/blob/master/class/crontab.py , https://forum.aapanel.com/d/13024-cron-job-shell-script-not-working

---

## 10. Gotchas / known issues

- **Port conflicts:** default panel 8888, phpMyAdmin 888, MySQL 3306, FTP 21, SSH 22. 888 is frequently blocked by ISP/hosting firewalls; phpMyAdmin on 888 has **no SSL by default** (plaintext creds).
- **Cloudflare Proxied + LE HTTP-01:** fails; use grey-cloud-toggle or DNS-01 or Origin Cert.
- **PM2 Manager ↔ Node version mismatch:** forum thread reports PM2 plugin sometimes selects wrong Node version if multiple installed.
- **Node Project (Website) vs PM2 Manager:** two parallel systems — mixing causes confusion; pick one.
- **CVE-2022-28117:** aaPanel ≤ 6.6.6 authenticated RCE via Cron script content box — upgrade to 7.x.
- **Repair button wipes reverse proxy:** "NODE PROJECT REVERSE PROXY OPTION MISSING AFTER REPAIR" — clicking site Repair can drop proxy config.
- Manual `apt install docker.io` before Docker Manager plugin installs → plugin reports "not installed".

Sources: https://www.aapanel.com/forum/d/8011-no-ssl-on-phpmyadmin-port-888 , https://www.aapanel.com/forum/d/14535-problem-with-port-888-to-access-phpmyadmin , https://www.cvedetails.com/vendor/23472/Aapanel.html , https://www.aapanel.com/forum/d/15347-node-project-reverse-proxy-option-missing-after-repair

---

## 11. Production-ready / hardening

aaPanel **can** be production-safe with hardening; default install is not. Mandatory hardening per official Security docs:

1. Change panel port from 8888 (`bt 8`).
2. Set **Security Entrance** (secret URL path) — panel refuses login without it (`bt 14`).
3. Strong password (8+ chars, mixed) + **enable 2FA** (Google Authenticator) under Panel Settings.
4. Restrict panel access by **IP whitelist** (Authorization IP).
5. Enable **BasicAuth** (extra HTTP auth layer before login form).
6. Enable **Brute-force protection** (auto lockout).
7. Issue panel SSL (self-signed or LE) — never login over plain HTTP.
8. Change phpMyAdmin port 888 OR disable it (use SSH tunnel instead); enforce HTTPS on it.
9. Keep aaPanel updated — historical CVEs exist (see item 10).
10. Disable "Developer Mode" in production.

LowEndTalk community sentiment: aaPanel is acceptable for small/medium production if hardened; Chinese-origin panel, historical CVEs and a permissive default install (exposed 8888 to world) mean it's not recommended as unattended bare-metal edge without the steps above.
Sources: https://www.aapanel.com/docs/Function/Security.html , https://www.aapanel.com/docs/Function/Settings.html , https://blog.1byte.com/guide/aapanel-everything-about-safety-management-sidebar-menu/ , https://lowendtalk.com/discussion/125975/is-aapanel-secure-i-heard-it-has-vulnerabilities-in-it

---

## Contradictions found

- **Cron log path:** official docs imply in-UI log viewer; forum answers point to `/www/server/cron/` or `/www/wwwlogs/`. Exact path depends on task type and aaPanel version. Safer: rely on UI "Log" button rather than filesystem path.
- **"Reverse Proxy" menu location:** some tutorials (2022-2023) show Reverse Proxy as a sub-tab inside Site Settings modal; aaPanel 7 official docs promote a top-level **"Proxy Project"** site type. Both exist — top-level Proxy Project is the clean path for pure Node.js reverse-proxy sites (no PHP, no wwwroot needed).
- **PM2 Manager vs Node Project:** aaPanel ships two overlapping Node.js management UIs; docs don't clearly deprecate either.

## Unresolved questions

1. Does aaPanel 7.x ship a built-in Cloudflare DNS-01 provider in the SSL tab, or still require a third-party plugin? (Forum 2024 hints yes, but no official doc page confirms.)
2. Exact filesystem path for cron job output logs in aaPanel 7.x — UI abstracts it, docs don't state.
3. Whether PM2 Manager plugin auto-generates nginx upstream blocks or expects you to add reverse proxy manually via Proxy Project — tutorials imply manual.
4. Whether aaPanel 7.x hardens the default install (IP lock, entrance) on first run or leaves 8888 world-open as legacy 6.x did.

---

**Status:** DONE_WITH_CONCERNS
**Summary:** Verified 11 topic areas against official docs + forum + GitHub. Key facts (install command, default port 8888, vhost path `/www/server/panel/vhost/nginx/`, PM2 Manager exists, Docker plugin exists, Security tab drives ufw/firewalld not its own stack, HTTP-01 is default LE challenge) are confirmed with citations.
**Concerns:** 4 unresolved questions listed above. Some tutorial sources are 2022-2024 era — UI labels may have shifted slightly in 7.x. Recommend a final spot-check on the actual target VPS before publishing the deployment guide.
