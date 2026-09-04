#!/usr/bin/env bash
# Per-boot service reconciliation for the Amealio workspace.
# Starts PostgreSQL, Redis and MongoDB (idempotently) and ensures the
# NestJS delivery-tracking database exists. Fails if a required DB is not ready.
# App dev servers are launched from the `terminals` config.
set -euo pipefail

echo "==> Starting databases…"
ready_count=0

# --- PostgreSQL ---
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  echo "ERROR: PostgreSQL (pg_ctlcluster) is not installed." >&2
  exit 1
fi

pg_ver="$(pg_lsclusters -h 2>/dev/null | awk 'NR==1 {print $1}')"
pg_name="$(pg_lsclusters -h 2>/dev/null | awk 'NR==1 {print $2}')"
if [[ -z "${pg_ver:-}" || -z "${pg_name:-}" ]]; then
  echo "ERROR: No PostgreSQL cluster found." >&2
  exit 1
fi

if ! pg_lsclusters -h 2>/dev/null | grep -q online; then
  sudo pg_ctlcluster "$pg_ver" "$pg_name" start
fi

pg_ready=0
for _ in $(seq 1 30); do
  if sudo -u postgres psql -c 'select 1' >/dev/null 2>&1; then
    pg_ready=1
    break
  fi
  sleep 1
done
if [[ $pg_ready -ne 1 ]]; then
  echo "ERROR: PostgreSQL did not become ready." >&2
  exit 1
fi

# Local-dev-only password for the stub .env; ignore failure if already set.
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'local-dev-only-not-for-prod';" >/dev/null 2>&1 || true
if ! sudo -u postgres psql -lqt | cut -d '|' -f1 | grep -qw delivery_tracking; then
  sudo -u postgres psql -c "CREATE DATABASE delivery_tracking;" >/dev/null
fi
echo "   PostgreSQL ready."
ready_count=$((ready_count + 1))

# --- Redis ---
if ! command -v redis-server >/dev/null 2>&1; then
  echo "ERROR: Redis is not installed." >&2
  exit 1
fi
if ! redis-cli ping >/dev/null 2>&1; then
  redis-server --daemonize yes
fi
redis_ready=0
for _ in $(seq 1 20); do
  if redis-cli ping >/dev/null 2>&1; then
    redis_ready=1
    break
  fi
  sleep 1
done
if [[ $redis_ready -ne 1 ]]; then
  echo "ERROR: Redis did not become ready." >&2
  exit 1
fi
echo "   Redis ready."
ready_count=$((ready_count + 1))

# --- MongoDB ---
if ! command -v mongod >/dev/null 2>&1; then
  echo "ERROR: MongoDB is not installed." >&2
  exit 1
fi
sudo mkdir -p /var/lib/mongodb /var/log/mongodb
sudo chown -R mongodb:mongodb /var/lib/mongodb /var/log/mongodb 2>/dev/null || true
if ! mongosh --quiet --eval 'db.runCommand({ping:1})' >/dev/null 2>&1; then
  sudo -u mongodb mongod --dbpath /var/lib/mongodb --bind_ip 127.0.0.1 --port 27017 \
    --fork --logpath /var/log/mongodb/mongod.log
fi
mongo_ready=0
for _ in $(seq 1 30); do
  if mongosh --quiet --eval 'db.runCommand({ping:1})' >/dev/null 2>&1; then
    mongo_ready=1
    break
  fi
  sleep 1
done
if [[ $mongo_ready -ne 1 ]]; then
  echo "ERROR: MongoDB did not become ready." >&2
  exit 1
fi
echo "   MongoDB ready."
ready_count=$((ready_count + 1))

if [[ $ready_count -ne 3 ]]; then
  echo "ERROR: expected 3 databases ready, got $ready_count" >&2
  exit 1
fi

echo "==> Databases up. App dev servers are managed by the 'terminals' config."
