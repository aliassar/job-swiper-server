#!/usr/bin/env bash
# Deploy Job Swiper on the server from its checkouts: `deploy.sh server|frontend [sha]`.
# GitHub Actions calls it over SSH after a push to main (infra/ssh-deploy, forced command); people can run it too.
# Only commits on main. The container is rebuilt while the old one keeps serving, then swapped; if the new one fails
# its health check, the previous image comes back.
set -euo pipefail
# This script is in a checkout it updates: run from a copy, so a checkout never changes it mid-run.
if [ -z "${DEPLOY_COPY:-}" ]; then tmp=$(mktemp); cp "$0" "$tmp"; DEPLOY_COPY=1 exec bash "$tmp" "$@"; fi
project=${1:?server or frontend}; sha=${2:-}
COMPOSE=/opt/old-swiper/server/infra/docker-compose.yml
case "$project" in
  server)   dir=/opt/old-swiper/server;   service=server;   tagvar=SERVER_TAG;   url=http://127.0.0.1:5101/ ;;
  frontend) dir=/opt/old-swiper/frontend; service=frontend; tagvar=FRONTEND_TAG; url=http://127.0.0.1:3101/login ;;
  *) echo "unknown project: $project" >&2; exit 2 ;;
esac
state=/var/lib/old-swiper-deploy; mkdir -p "$state"
exec 9>"$state/$project.lock"; flock 9   # one deploy per project at a time

cd "$dir"
git fetch -q origin main
target=${sha:-$(git rev-parse origin/main)}
git merge-base --is-ancestor "$target" origin/main || { echo "$target is not on main" >&2; exit 3; }
git checkout -q --force "$target"

compose=(docker compose -p old-swiper -f "$COMPOSE")
tag=$(git rev-parse --short=12 HEAD)
image=old-swiper-$service
prev=$(docker image inspect "$image:latest" --format '{{.Id}}' 2>/dev/null || true)
export "$tagvar=$tag"
"${compose[@]}" build "$service" > "$state/$project.log" 2>&1 || { tail -30 "$state/$project.log" >&2; echo "$project: build failed; still running the previous version" >&2; exit 1; }
"${compose[@]}" up -d --no-deps "$service"
for _ in $(seq 1 40); do
  if curl -fsS -m 5 -o /dev/null "$url"; then
    docker tag "$image:$tag" "$image:latest"
    # keep this image and the previous one
    keep=${prev#sha256:}; keep=${keep:0:12}
    docker images "$image" --format '{{.Tag}} {{.ID}}' | grep -vE "^(latest|$tag) " | awk '{print $2}' | sort -u |
      { grep -v "^${keep:-none}" || true; } | xargs -r docker rmi -f >/dev/null 2>&1 || true
    echo "$project: deployed $tag"
    exit 0
  fi
  sleep 3
done
echo "$project: $tag failed its health check ($url); going back to the previous image" >&2
if [ -n "$prev" ]; then export "$tagvar=latest"; "${compose[@]}" up -d --no-deps "$service"; fi
exit 1
