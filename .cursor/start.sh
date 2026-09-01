#!/usr/bin/env bash
# Per-boot service reconciliation for the Amealio workspace.
# Starts PostgreSQL, Redis and MongoDB (idempotently) and ensures the
# NestJS delivery-tracking database/role exist. Returns once services are up;
# the app dev servers themselves are launched from the `terminals` config.
set -uo pipefail

echo "==> Starting databases…"

# --- PostgreSQL ---
if command -v pg_ctlcluster >/dev/null 2>&1; then
  if ! pg_lsclusters -h 2>/dev/null | grep -q online; then
    sudo pg_ctlcluster 16 main start 2>/dev/null || true
  fi
  # wait for readiness
  for _ in $(seq 1 20); do
    sudo -u postgres psql -c 'select 1' >/dev/null 2>&1 && break
    sleep 1
  done
  sudo -u postgres psql -tc "SELECT 1" >/dev/null 2>&1 && {
    sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'yourpassword';" >/dev/null 2>&1 || true
    if ! sudo -u postgres psql -lqt | cut -d '|' -f1 | grep -qw delivery_tracking; then
      sudo -u postgres psql -c "CREATE DATABASE delivery_tracking;" >/dev/null 2>&1 || true
    fi
  }
  echo "   PostgreSQL ready."
fi

# --- Redis ---
if command -v redis-server >/dev/null 2>&1; then
  if ! redis-cli ping >/dev/null 2>&1; then
    redis-server --daemonize yes >/dev/null 2>&1 || true
  fi
  redis-cli ping >/dev/null 2>&1 && echo "   Redis ready."
fi

# --- MongoDB ---
if command -v mongod >/dev/null 2>&1; then
  sudo mkdir -p /var/lib/mongodb /var/log/mongodb
  sudo chown -R mongodb:mongodb /var/lib/mongodb /var/log/mongodb 2>/dev/null || true
  if ! mongosh --quiet --eval 'db.runCommand({ping:1})' >/dev/null 2>&1; then
    sudo -u mongodb mongod --dbpath /var/lib/mongodb --bind_ip 127.0.0.1 --port 27017 \
      --fork --logpath /var/log/mongodb/mongod.log >/dev/null 2>&1 || true
  fi
  mongosh --quiet --eval 'db.runCommand({ping:1})' >/dev/null 2>&1 && echo "   MongoDB ready."
fi

echo "==> Databases up. App dev servers are managed by the 'terminals' config."
