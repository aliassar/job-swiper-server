# Job Swiper on the server

Job Swiper (frontend, this backend, its Postgres) and n8n run on the server at 194.163.148.222, in their own folders,
independent of anything else there:

| What | Where |
| --- | --- |
| Checkouts | `/opt/old-swiper/server` (this repo), `/opt/old-swiper/frontend` (job-swiper) |
| Compose | `infra/docker-compose.yml` (project `old-swiper`), `infra/n8n/docker-compose.yml` (project `n8n`) |
| Secrets | `/etc/old-swiper/{server,frontend,db,n8n,n8n-db}.env`, root only |
| Sites | `infra/Caddyfile` → `/etc/caddy/sites/old-swiper.caddy` (swiper.applyflo.me, n8n.applyflo.me) |
| Deploys | Push to main → GitHub Actions → SSH with the key in `DEPLOY_SSH_KEY`, forced to `infra/ssh-deploy` → `infra/deploy.sh server|frontend <sha>` |

Nothing is backed up. After changing `infra/Caddyfile`:

```bash
cp /opt/old-swiper/server/infra/Caddyfile /etc/caddy/sites/old-swiper.caddy && caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```
