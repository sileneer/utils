# Deployment & operations runbook

How code gets to production, and how to look at it when it does not.
Rationale and rejected alternatives: [PLANNING.md](PLANNING.md) §4 and §6.
Application structure: [ARCHITECTURE.md](ARCHITECTURE.md). Known traps: [GOTCHAS.md](GOTCHAS.md).

**Live URL: https://utils.lzhdev.com** · **Repo: `sileneer/utils` (public)** ·
**Image: `ghcr.io/sileneer/utils` (public, anonymous pull)**

---

## 1. Topology

```
browser → Cloudflare edge (TLS, CDN, WAF)
        → Cloudflare Tunnel `b77c920a-2ce7-4556-96ff-1676c0453a37`
          (cloudflared systemd service on the VM, outbound-only)
        → VM 127.0.0.1:3100 → container :3000 (Next.js standalone)

admin SSH: gcloud compute ssh --tunnel-through-iap  (IAP range 35.235.240.0/20 only)
CI SSH:    same tunnel, ephemeral key written to instance metadata, removed after
```

**Public SSH is closed.** Firewall rule `allow-ssh-from-iap` allows TCP 22 only
from `35.235.240.0/20`; the former public SSH rule was removed. Website traffic
uses `cloudflared`'s outbound connections. The 2026-10-08 firewall inventory
also contains default HTTPS, RDP and ICMP rules; a rule does not establish that
the VM has a listening service. Do not infer zero public ingress from the
Tunnel architecture. Review those rules separately before changing them.

**Server**: GCP `instance-20260904-233454`, e2-micro, **1 GB RAM** + 2 G swap,
Debian 13.7, zone `us-east1-c`, permanent free tier. Docker Engine 29.x + compose
v5.x installed at M2.

**On the VM**:

| Path | What |
|---|---|
| `/opt/utils/docker-compose.yml` | production compose (copy of `deploy/docker-compose.prod.yml`) |
| `/opt/utils/deploy.sh` | deploy script (copy of `deploy/deploy.sh`) |
| `/opt/utils/.env` | all secrets, chmod 600, owned by `utils-deploy` |
| `/opt/utils/data/` | the volume mounted at `/app/data` (sessions, cache, workspace) |
| `/opt/utils/deploy.lock` | `flock` file, one deploy at a time |

Container name `utils-utils-1`, service user `utils-deploy` (docker group, no
sudo), app user inside the container `nextjs` (uid 1001, non-root).

> ⚠️ **CI does not sync `deploy.sh` or the compose file to the server.** The
> deploy job only *executes* `/opt/utils/deploy.sh`. Editing either file in git
> changes nothing until you copy it over — see §7.

## 2. The pipeline (`.github/workflows/deploy.yml`)

Triggered by `push: main` and `workflow_dispatch`. `concurrency: deploy-prod`
with `cancel-in-progress: false` — deploys queue, they never overlap or get killed
mid-flight.

| Job | Does | Gates |
|---|---|---|
| **test** | `npm ci` → `npm run lint` → `npm test` → `npm run build` (Node 22) | everything downstream |
| **build-push** | buildx multi-stage build → load final image → isolated image smoke check → publish the same image to `ghcr.io/sileneer/utils:<sha>` (+ `:latest` on the default branch), GHA layer cache | needs test and image acceptance |
| **deploy** | keyless GCP auth → ephemeral SSH key → IAP SSH → `/opt/utils/deploy.sh` | needs build-push |

`build-push` logs in to GHCR with the built-in `GITHUB_TOKEN`
(`permissions: packages: write`).

The final-image check is `node tests/image-smoke.cjs <image-id>`. It inspects
the non-root Node 22 runtime, native SQLite and executable SDK CLI, rejects env
and private database artifacts, then starts the actual standalone entrypoint.
It checks account pages, fail-closed auth/private routes, repeatable migrations,
account/conversation/message persistence across restart and coherent backup
restore integrity/FKs. Containers have no external network or published ports,
use a uniquely named disposable volume and are removed afterward. Provider
credentials are absent; SDK `--version` is an offline binary check, not an AI
query. A failure prevents image publication and the dependent deploy job.

`.github/workflows/acceptance.yml` runs the same full-image check on pull
requests or manual dispatch, plus Node 22 lint/tests. It has only contents-read
permission and neither registry login/push nor GCP/deployment steps. Use a draft
PR for external Linux acceptance before separately authorizing a production
release. Current acceptance outcomes live in HANDOVER §7; the initial missing
native-build-tools failure and fix are documented in GOTCHAS §J.
Python/make/g++ are present only in the dependency build stage,
not the deployed runner. Input/output support follows the pinned
[build-push-action v6 contract](https://github.com/docker/build-push-action/blob/v6/action.yml).

**The deploy job holds no credentials.** It federates a GitHub OIDC token
through Workload Identity Federation:

- Pool/provider: `projects/970395615458/locations/global/workloadIdentityPools/github/providers/github`
- Attribute condition: `repository == sileneer/utils` **and** `ref == refs/heads/main`
- Service account: `utils-deploy@gen-lang-client-0642815057.iam.gserviceaccount.com`
- Roles: `roles/workloadIdentityUser` (for the federated principal),
  `roles/iap.tunnelResourceAccessor`, custom `utilsInstanceDeploy`
  (`compute.instances.get` / `.setMetadata`, `compute.zones.get`, `compute.projects.get`),
  and `iam.serviceAccountUser` **on the VM's compute service account**
  (970395615458-compute@…) — without that last one `add-metadata` fails, and it
  cost two failed runs to learn (GOTCHAS §D).

Then, per run: `ssh-keygen -t ed25519` → write **only that key** to
*instance-level* metadata (project metadata untouched, so nobody else's keys are
affected) → `gcloud compute ssh utils-deploy@instance… --tunnel-through-iap
--command=/opt/utils/deploy.sh` → `remove-metadata ssh-keys` in an `if: always()`
step. **No long-lived secret exists anywhere in this pipeline** — not in GitHub
Secrets (there are none), not on the VM, not in the image.

## 3. What `deploy.sh` does

```
cd /opt/utils
source .env (for HEALTHCHECK_URL)
flock -n deploy.lock           # second concurrent deploy → abort + /fail ping
PREV_IMAGE=$(docker inspect --format '{{.Image}}' utils-utils-1)
docker compose pull
docker compose up -d --remove-orphans
loop 30× (2 s):  curl -sf http://127.0.0.1:3100/api/health
   healthy → prune images keeping 3 → ping healthchecks.io → exit 0
   60 s exhausted → docker tag $PREV_IMAGE ghcr.io/sileneer/utils:latest
                   → docker compose up -d → ping /fail → exit 1
```

Notes that matter when editing it:
- The health gate probes **port 3100 on the host** (the compose mapping), not the container's 3000.
- Rollback is a **re-tag**, not a re-pull: the previous image ID is retagged to `:latest` and compose is brought back up. Because compose pins `:latest`, that is what the new container runs.
- Prune keeps the 3 most recent local images (`tail -n +4`), so a manual rollback to `:<sha>` is usually still possible if the tag is still local.
- Non-zero exit propagates to the Actions job → the deploy shows red, and healthchecks.io alerts by email.

## 4. Monitoring

- **healthchecks.io** check `utils-deploy`: 7-day period + 1-day grace, email alert. Success ping resets the dead-man timer; a failed health gate pings `/fail` immediately. So: *any* broken deploy, or *no* deploy for 7 days, produces email.
- `HEALTHCHECK_URL` lives in `/opt/utils/.env` (server) and `.env.monitoring` (local) — both gitignored. It is used by `deploy.sh`, not by the app.
- Container healthcheck: `wget http://127.0.0.1:3000/api/health` every 30 s, 3 retries, 15 s start period.
- Cloudflare/Tunnel: `sudo journalctl -u cloudflared`.

### Drill switch (rollback verification)

`/api/health` returns 503 while `DRILL_FAIL_HEALTH=1` is in the container env.
Verified once on 2026-10-04 (failure detection → rollback branch → exit 1 → `/fail`
alert → recovery). To re-run it:

```bash
# add DRILL_FAIL_HEALTH=1 to /opt/utils/.env, then
cd /opt/utils && docker compose up -d      # pick up the new env
./deploy.sh                                # gate fails after 60 s, rolls back, exits 1
# remove the line from .env, docker compose up -d again, confirm /api/health is ok
```

Gotcha learned the hard way: a `/fail` ping does **not** show a fail flag in the
pings-list API — read the check's `status` field for ground truth (GOTCHAS §H).

## 5. Interactive server access

```bash
gcloud compute ssh instance-20260904-233454 --zone us-east1-c --tunnel-through-iap

sudo journalctl -u cloudflared -f                                   # tunnel logs
sudo docker compose -f /opt/utils/docker-compose.yml logs -f         # app logs
sudo docker compose -f /opt/utils/docker-compose.yml restart         # restart app
sudo docker exec -it utils-utils-1 wget -qO- http://127.0.0.1:3000/api/health
```

From the interactive shell you are your own gcloud user; `utils-deploy` is the
deploy-time SSH user. Files under `/opt/utils` are owned by `utils-deploy`, so
editing `.env` or `deploy.sh` needs `sudo -u utils-deploy` (or a chown-aware
workflow). Compose reads `/opt/utils/.env` **as the deploy user** — wrong
ownership silently produces empty variables and a broken deploy (this was a real
CI failure at M3).

Account/mail configuration and database operations: see §11 below. Current
release evidence lives in HANDOVER; saving env values alone does not deploy code.

## 6. Manual deploy / rollback

```bash
cd /opt/utils && ./deploy.sh                      # redeploy current :latest
# pin an older build (if its image is still local — prune keeps 3):
docker tag ghcr.io/sileneer/utils:<sha> ghcr.io/sileneer/utils:latest
docker compose up -d
```

Rollback on a public repo is otherwise a `git revert` + push — CI rebuilds and
redeploys automatically.

## 7. Copying `deploy.sh` or the compose file to the server

Because CI never uploads them (§1), the transfer is manual. From Windows Git Bash,
`scp`/`pscp` hang on host-key prompts and `gcloud compute ssh` does not take files
— use a base64 heredoc through the IAP tunnel:

```bash
B64=$(base64 -w0 deploy/deploy.sh)
gcloud compute ssh instance-20260904-233454 --zone us-east1-c --tunnel-through-iap \
  --command="echo $B64 | base64 -d | sudo tee /opt/utils/deploy.sh >/dev/null && sudo chmod 755 /opt/utils/deploy.sh"
```

Same pattern for `deploy/docker-compose.prod.yml` → `/opt/utils/docker-compose.yml`
(then `docker compose up -d` to apply).

## 8. Local development and verification

- `npm run dev` on Windows (Node 24) is the normal loop. **There is no Docker on the dev machine**, so full application images are built by CI. Ubuntu is registered in WSL, but the 2026-10-08 startup attempt failed with insufficient system resources; WSL is not a verified alternative build environment.
- Container check when needed: `docker compose -f deploy/docker-compose.yml up --build` (build context is the repo root; `../data` is the volume) — requires Docker, not installed locally as of 2026-10-07.
- `/htlb` reading works with no secrets. Account and Agent runtime configuration
  is documented once in ARCHITECTURE §8; `.env.example` is the template.
- Windows Git Bash mangles inline non-ASCII `curl` arguments into `???` — test the chat API with `--data-binary @utf8-file`.
- Local acceptance: `npm test` runs real auth/SQLite with intercepted email/challenge
  services plus route/stream/reader tests. `node tests/auth-preview.cjs` starts the
  production build on `127.0.0.1:3001` using a separate disposable database, fake
  secrets, an intercepted mail adapter and official Turnstile test keys. Its
  loopback-only outbox is on 3002. AI is disabled; no paid/mail calls occur.
  This launcher is never imported into production; stop it after QA. The older
  `tests/preview.cjs` is explicit local mock UI QA, not account/provider acceptance.
  It simulates owned history/quota/activity, delayed Stop, disconnect and status
  failures; its /__qa/* controls never ship in the application/image. Start it
  only after a separate, secrets-blank, AI-disabled app is ready on port 3000.
- Source-version state and bootstrap requirements are in ARCHITECTURE §4–6. Initial preparation needs access to the upstream release, GitHub commit API and Git; a verified cached pair serves offline afterwards. Existing volume paths are preserved. Budget disk for retained version pairs; there is no automatic pruning.

### After every deploy, verify

```bash
curl -s https://utils.lzhdev.com/api/health                 # {"status":"ok",...}
curl -s -o /dev/null -w '%{http_code}\n' https://utils.lzhdev.com/   # 200
# chat through the tunnel needs a real browser session (cookie is Secure+HttpOnly);
# server-side: check `docker compose logs` for "agent chat failed"
```

Do not trust a build log line: the `test` job must be **green in Actions**
(`gh run list --limit 3` / `gh run watch`). "Compiled successfully" can coexist
with TypeScript errors that only surface later in the same step (GOTCHAS §F).

## 9. Reusing this VM for other workloads

Headroom measured 2026-10-07: ~370 MB RAM free of 964 MB total (utils container
~88 MB, dockerd 77 MB, ops-agent 70 MB, containerd 35 MB, cloudflared 25 MB),
~21 GB disk free, 1.9 GB swap free.

- Suitable for **lightweight containers only**. No memory-heavy services and **absolutely no builds on the VM** — 1 GB, OOM risk; builds stay in GitHub Actions.
- Pattern for a new service: its own compose project, bound to `127.0.0.1:<port>`, then add a Cloudflare Tunnel ingress rule (the `utils-deploy` CF API token in `.env.cloudflare` has Tunnel:Edit + Zone DNS:Edit) — or leave it internal-only.
- Cost: the free tier covers the instance and 30 GB disk. The **external IP (~$3/month) is the only fixed cost and is now unused** (Tunnel + IAP replaced it). Removal was offered to the owner on 2026-10-07 and is **awaiting their decision** — do not remove it unilaterally.

## 10. Env / secret inventory

| File | Where | Committed? | Holds |
|---|---|---|---|
| `.env.example` | repo | ✅ | the template, values commented out — the only env file allowed in git |
| `.env` | local | ❌ (`.gitignore` `.env.*`) | local dev secrets |
| `.env.cloudflare` | local | ❌ | CF API token + account/zone IDs for tunnel/DNS ops |
| `.env.monitoring` | local | ❌ | healthchecks.io `HEALTHCHECK_URL` |
| `/opt/utils/.env` | server | n/a | production secrets/config per ARCHITECTURE §8, owned by `utils-deploy`, mode 600 |

Hard rules (also in AGENTS.md): no secret ever enters the image, the client
bundle, a log line, or git history — **this repo is public, so a committed secret
is a permanent one**. The old AGENTS.md claim that the pipeline used GitHub
Secrets was wrong: after the M3 keyless rework there are none.

## 11. Account release preparation and operations

Account release authorization and acceptance evidence live in HANDOVER.
The owner authorized deployment with AI disabled; real SDK acceptance and AI
activation remain separate. The Brevo API key stays on the server: readiness
scripts consume it there without displaying or copying it locally.

### Domain and services

1. Brevo Settings -> Senders, domains, IPs -> Domains: add `auth.lzhdev.com`.
   At Setup method select **Individual DNS records**, then manual/self-managed
   record entry under the second section, Continue. This retains DNS at Cloudflare;
   do not select NS delegation for this implementation.
2. Cloudflare -> `lzhdev.com` -> DNS -> Records. Copy the exact Type/Name/Content
   displayed by Brevo. TXT goes in Content; CNAME goes in Target, **DNS only**,
   without CNAME flattening for the authentication record. TTL Auto is fine.
   Preserve the `auth` label in subdomain records; never substitute root `@`.
   Do not invent values, duplicate SPF/DMARC, alter existing MX or change the
   zone's authoritative nameservers. The domain need not host a web page.
3. Return to Brevo and check authentication. After it passes, create sender
   at `noreply@auth.lzhdev.com` using the owner-selected display name, optional
   Reply-To an existing real inbox. Set `MAIL_FROM_NAME` to that display name.
   An authenticated-domain sender does not require a purchased receiving mailbox.
4. Confirm transactional mail is activated. `utils-auth-production` is the key's
   descriptive name; the app needs its actual ordinary HTTP API key, not that name,
   an SMTP key, or MCP key. Keep the value in the server env/password manager.
5. Existing Cloudflare account -> Turnstile -> Add widget: `utils-auth`, Managed,
   hostname `utils.lzhdev.com`, pre-clearance off. Runtime widget and server keys
   are distinct. Production must not use official local test keys.

Official guides: [Brevo domain authentication](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC),
[sender](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email),
[Turnstile dashboard](https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/).

### Secure configuration handoff

```bash
gcloud compute ssh instance-20260904-233454 --zone us-east1-c --tunnel-through-iap
sudo -u utils-deploy nano /opt/utils/.env
sudo chmod 600 /opt/utils/.env
```

Edit/add the account variables listed in ARCHITECTURE §8; avoid duplicate keys.
Enter secrets inside the editor, not shell arguments/history, Git, chat or screenshots.
Site key and sender are nonsecret, but may be configured directly there too.
Generating the independent auth secret without printing it:

```bash
sudo -u utils-deploy python3 - <<'PY'
import pathlib, secrets, os
p = pathlib.Path('/opt/utils/.env')
text = p.read_text()
if any(line.startswith('BETTER_AUTH_SECRET=') for line in text.splitlines()):
    raise SystemExit('Auth secret entry already exists; inspect it in the editor.')
with p.open('a') as f:
    f.write('\nBETTER_AUTH_SECRET=' + secrets.token_urlsafe(48) + '\n')
os.chmod(p, 0o600)
print('Auth secret saved without displaying its value.')
PY
```

Changing env requires container recreation at the authorized release; `restart`
does not re-read env_file. Do not deploy the old image as an account rollout.
Quota policy and authorization live in PLANNING §11.8. Activation uses the
existing deploy lock, preserves the running image and positive quotas, and
recreates the container so it reads the new flag. Check origin health and Docker
health, and restore the previous flag/recreate if activation fails. Keep AI off
when real acceptance finds a blocking problem. Reused
provider credentials remain only in the main server process's environment; the
SDK gets its explicit runtime/provider allowlist.

### Migration, owner bootstrap, backup and restore

- `scripts/start.cjs` migrates before the standalone server starts. CLI schema is
  versioned, not autogenerated per request. `npm run db:migrate` is the local equivalent.
- The local A+B migration preserves legacy conversation columns and adds optional
  metadata/indexes (ARCHITECTURE §5). Pre-migration backup remains mandatory.
  Old-image positional writes remain usable after upgrade; an old image ignores
  new title/archive metadata until rolled forward. Do not rewind the database
  on image rollback or delete retained metadata/backups.
- After owner registers and verifies, run inside the new container:
  `docker exec utils-utils-1 node scripts/database.cjs admin <owner-email>`.
  This changes only that verified active account; never promote first signup.
- Before migration the CLI makes an API-based coherent backup. Daily backup script
  `deploy/backup.sh` is installed manually as `/opt/utils/backup.sh`, owned by
  utils-deploy, mode 750. Transfer with LF line endings (also enforced for shell
  files by `.gitattributes`); verify with `bash -n` and execute once before scheduling.
  The script uses a private `flock` lock to prevent overlapping backups and the
  SQLite backup API to include outstanding WAL pages.
- The utils-deploy crontab runs daily at 03:15 on the UTC host:
  `15 3 * * * /opt/utils/backup.sh >> /opt/utils/backup.log 2>&1`.
  Verify `cron.service` is active and `timedatectl` reports `Etc/UTC` or `UTC`;
  preserve unrelated jobs when installing. This is 04:15 in London during BST
  and 03:15 during GMT. Precreate the log with mode 600. Backup files are mode
  600, uid 1001, under `/app/data/backups` (directory mode 700). The deploy workflow
  does not synchronize this host script. Off-machine copying and automatic
  retention remain unconfigured; backups must not be silently pruned.
- Manual backup:
  `docker exec utils-utils-1 node scripts/database.cjs backup /app/data/backups/manual.sqlite`.
  A volume backup alone does not protect against VM loss; copy protected backups
  to owner-controlled off-machine storage and perform a restore drill.
- Restore in a separate directory first using matching schema/app, verify
  `integrity_check`, `foreign_key_check`, user counts and representative chat/login.
  For a live restore stop the app, retain the current DB/WAL/SHM as a recoverable
  set, replace with the coherent backup, set uid/gid 1001 and mode 600, then start
  and verify. Never copy a live main DB alone or silently restore on image rollback.
  Rollback of app images must preserve newly registered accounts.
- The host compose also mounts `/opt/utils/data/sdk` at
  `/home/nextjs/.claude`. Create the SDK directory as app uid 1001, mode 700,
  before recreation. This preserves native SDK resume files across deployments;
  it is not included in the SQLite backup API. For a database-only restore,
  clear `conversations.sdk_session_id` and set `needs_rebuild=1` before starting
  the app. User-visible history then supplies the next query's context. Do not
  attach a restored database to stale/mismatched SDK transcripts. The workflow
  does not synchronize compose; update the host's existing mount list explicitly
  while retaining its env/loopback/data configuration.

Before publishing, test the Node 22 Debian native driver in the image, migration
startup, persistence on restart and backup restoration. For account acceptance,
check the complete owner-operated signup/verification/login/reset flow, real
Turnstile hostname validation, delivery to authorized recipients, Secure cookies
and owned history. A direct diagnostic mail is not a completed app registration.
For later AI activation, verify real book MCP/SDK queries and enforced quotas.
Lint/test/build and a Windows native driver do not prove those external gates.

## 12. Operations dashboard and backup protection

`/admin` and GET `/api/admin/operations?hours=24|168` require a verified active
account and current database administrator role. The account menu exposes the
link only for administrators. Refresh is read-only and never reserves AI usage.
Aggregate definitions and bounds live in ARCHITECTURE §10. Current acceptance
and release state live in HANDOVER.

### Scheduled backup status rollout

`deploy/backup.sh` now invokes `node scripts/backup.cjs`. CI does not synchronize
the host script. After the application image containing that script is released,
copy the matching LF host script through IAP, preserve owner utils-deploy and
mode 750, run `bash -n`, execute once as utils-deploy and check the dashboard.
Retain the existing 03:15 UTC crontab and private log; do not install a duplicate.
The backup records a private atomic status manifest, verifies SQLite integrity/FKs
before marking success, preserves prior success after failure, and never prunes.
A missing status in an older installation is unavailable, not a successful backup.

### Off-machine proposal (not enabled)

No destination is selected yet. Recommended reviewable option: an owner-owned
private Cloud Storage bucket in `us-east1`, regional Standard storage, uniform
bucket access and public-access prevention. Use the VM's workload identity with
bucket-scoped `roles/storage.objectCreator`; the owner's restore identity gets
read permission separately. Never create a service-account JSON key, grant a
public principal or reuse the CI deploy identity for backup administration.
Inspect existing project-level permissions and VM access scopes before claiming
the upload identity is restricted or operational.

As checked on 2026-10-09, the
[Google Free Tier](https://docs.cloud.google.com/free/docs/free-cloud-features#free-tier-usage-limits)
includes 5 GB-months in the eligible US regions, with operation/network limits.
Usage is shared across the billing account; overage can be billed. Storage growth,
other projects, network destinations, versions and soft-deleted objects must fit
the budget. This is not an unconditional free service. Proposed retention:
initially keep all artifacts and show growth; no lifecycle deletion, retention lock
or pruning without an explicit owner choice.
[Object Creator permissions](https://docs.cloud.google.com/storage/docs/access-control/iam-roles#standard-roles)
allow create without read/delete/overwrite; confirm the effective IAM, not just
this one bucket grant.

Configuration to review, not run blindly:

```bash
# Values must be supplied/approved by the owner; this does not create a bucket.
UTILS_BACKUP_BUCKET="<owner-owned-unique-bucket>"
UTILS_BACKUP_PREFIX="gs://${UTILS_BACKUP_BUCKET}/utils/"
# Creation, IAM binding and uploads are a separate activation step.
```

Export a freshly verified API-based SQLite snapshot and SHA-256 manifest, plus
immutable book version pairs needed by saved references. Never export .env or
copy the live SQLite main file while WAL is active. Native SDK files are excluded
from the proposed first version: visible history supplies context after restoring
with sdk_session_id cleared and needs_rebuild=1. The owner must independently
retain configuration/API keys in their password manager for VM-loss recovery.
Objects have unique names and generation-zero creation preconditions so existing
backups cannot be overwritten. Check upload success and retrieve into an isolated
restore directory with the owner read identity; verify checksum, integrity/FKs,
account/chat preservation and login before declaring off-machine protection done.

A same-project bucket protects against VM/disk loss, but does not isolate backup
administration from compromise of the owner/project account. Separate account/
project ownership is a later decision if that threat must be covered.
