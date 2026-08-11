#!/usr/bin/env bash
# CI / local Docker production smoke (v1.12-M2).
set -euo pipefail

IMAGE="${IMAGE:-sta-v112-m2:smoke}"
NAME="${NAME:-sta-v112-m2-smoke}"
VOLUME="${VOLUME:-sta-v112-m2-data}"
SECRET="ci-docker-smoke-secret-not-for-production-32"
URL="http://127.0.0.1:3000"
DB_URL="file:/data/security-triage.db"

cleanup() {
  docker rm -f "${NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "== docker build =="
docker build -t "${IMAGE}" .

echo "== invalid env must fail =="
if docker run --rm --name "${NAME}-bad" \
  -e NODE_ENV=production \
  -e BETTER_AUTH_SECRET=short \
  -e BETTER_AUTH_URL="${URL}" \
  -e DATABASE_URL="${DB_URL}" \
  "${IMAGE}"; then
  echo "expected invalid-env container to exit non-zero" >&2
  exit 1
fi

echo "== start with volume =="
docker volume rm "${VOLUME}" >/dev/null 2>&1 || true
docker volume create "${VOLUME}" >/dev/null
cleanup
docker run -d --name "${NAME}" \
  -p 13000:3000 \
  -e NODE_ENV=production \
  -e BETTER_AUTH_SECRET="${SECRET}" \
  -e BETTER_AUTH_URL="${URL}" \
  -e DATABASE_URL="${DB_URL}" \
  -v "${VOLUME}:/data" \
  "${IMAGE}"

echo "== wait for ready =="
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:13000/api/ready" | grep -q '"ready"'; then
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "timed out waiting for /api/ready" >&2
    docker logs "${NAME}" >&2 || true
    exit 1
  fi
  sleep 2
done

curl -fsS "http://127.0.0.1:13000/api/health" | grep -q '"ok"'
curl -fsS -o /dev/null -w "%{http_code}" "http://127.0.0.1:13000/login" | grep -qE '200|307|308|302'

echo "== non-root process =="
user="$(docker exec "${NAME}" sh -c 'id -u')"
if [ "${user}" = "0" ]; then
  echo "container process must not run as root" >&2
  exit 1
fi

echo "== restart persistence =="
docker stop "${NAME}" >/dev/null
docker rm "${NAME}" >/dev/null
docker run -d --name "${NAME}" \
  -p 13000:3000 \
  -e NODE_ENV=production \
  -e BETTER_AUTH_SECRET="${SECRET}" \
  -e BETTER_AUTH_URL="${URL}" \
  -e DATABASE_URL="${DB_URL}" \
  -v "${VOLUME}:/data" \
  "${IMAGE}"

for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:13000/api/ready" | grep -q '"ready"'; then
    echo "docker smoke PASS"
    exit 0
  fi
  sleep 2
done

echo "ready failed after restart" >&2
docker logs "${NAME}" >&2 || true
exit 1
