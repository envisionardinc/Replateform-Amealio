#!/usr/bin/env bash
# Idempotent bootstrap for the Amealio replatforming workspace.
#
# The target repo (replateform-amealio) is intentionally empty; the runnable
# code lives in the sibling REFERENCE repositories that Cursor checks out next
# to it (see docs/discovery/REPLATFORMING_SCOPE.md). This script installs the
# system databases those apps need and the node dependencies for each app.
#
# Safe to run repeatedly: every step is guarded / idempotent.
set -uo pipefail

# ---------------------------------------------------------------------------
# Locate the workspace root that holds all the repos (parent of this repo).
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
REPOS_ROOT="$(cd "$TARGET_REPO/.." && pwd)"
echo "==> Workspace root: $REPOS_ROOT"

# ---------------------------------------------------------------------------
# 1. System databases (PostgreSQL, Redis, MongoDB). Installed once; a fresh
#    build snapshot keeps them, so these guards make re-runs cheap.
# ---------------------------------------------------------------------------
install_system_dbs() {
  local need_pg=0 need_redis=0 need_mongo=0
  command -v pg_ctlcluster >/dev/null 2>&1 || need_pg=1
  command -v redis-server  >/dev/null 2>&1 || need_redis=1
  command -v mongod        >/dev/null 2>&1 || need_mongo=1

  if [[ $need_pg -eq 0 && $need_redis -eq 0 && $need_mongo -eq 0 ]]; then
    echo "==> System databases already installed."
    return 0
  fi

  echo "==> Installing system databases (pg=$need_pg redis=$need_redis mongo=$need_mongo)"
  sudo apt-get update -y

  if [[ $need_pg -eq 1 || $need_redis -eq 1 ]]; then
    sudo apt-get install -y postgresql postgresql-contrib redis-server
  fi

  if [[ $need_mongo -eq 1 ]]; then
    . /etc/os-release
    curl -fsSL https://pgp.mongodb.com/server-8.0.asc \
      | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu ${VERSION_CODENAME}/mongodb-org/8.0 multiverse" \
      | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
    sudo apt-get update -y
    sudo apt-get install -y mongodb-org
  fi
}
install_system_dbs

# ---------------------------------------------------------------------------
# 2. Per-app local env files (only created if missing; never overwrites).
# ---------------------------------------------------------------------------
NEST_DIR="$REPOS_ROOT/amealio-nestjs-backend"
FEATHERS_DIR="$REPOS_ROOT/amealio-vendordashboard"

if [[ -d "$NEST_DIR" && ! -f "$NEST_DIR/.env" ]]; then
  echo "==> Writing $NEST_DIR/.env"
  cat > "$NEST_DIR/.env" <<'EOF'
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=postgres
DB_PASS=yourpassword
DB_NAME=delivery_tracking
JWT_SECRET=dev-local-secret-please-change
EOF
fi

if [[ -d "$FEATHERS_DIR" && ! -f "$FEATHERS_DIR/.env" ]]; then
  echo "==> Writing $FEATHERS_DIR/.env (minimal local dev config)"
  cat > "$FEATHERS_DIR/.env" <<'EOF'
ENV=DEVELOPMENT
NODE_ENV=development
HOST=localhost
PORT=5001
API=api/v1
BASEURL=http://localhost:5001
MONGODB=mongodb://127.0.0.1:27017/amealio_dev
ONDC_MICRO_SERVER_URL=http://localhost:9999
PAGINATE_DEFAULT=10
PAGINATE_MAX=50
SHORTTOKENEXPIRY=5m
LONGTOKENEXPIRY=10080m
MOBILETOKENEXPIRY=43800m
UNREGISTEREDUSERTOKENEXPIRY=210m
AUTHENTICATION_ENTITY=User
AUTHENTICATION_SERVICE=user-service
AUTHENTICATION_ENTITYID=_id
AUTHENTICATION_SECRET=local-dev-secret-not-for-prod
AUTHENTICATION_AUTHSTRATEGIES=["jwt","local","phone","facebook"]
AUTHENTICATION_JWTOPTIONS_HEADER_TYP=access
AUTHENTICATION_JWTOPTIONS_AUDIENCE=http://localhost
AUTHENTICATION_JWTOPTIONS_ISSUER=feathers
AUTHENTICATION_JWTOPTIONS_ALGORITHM=HS256
AUTHENTICATION_JWTOPTIONS_EXPIRESIN=30d
AUTHENTICATION_LOCAL_USERNAMEFIELD=email
AUTHENTICATION_LOCAL_PASSWORDFIELD=password
AUTHENTICATION_PHONE_USERNAMEFIELD=mobile_number
AUTHENTICATION_PHONE_PASSWORDFIELD=password
AUTHENTICATION_OAUTH_REDIRECT=/
VENDORAUTHENTICATION_ENTITY=VendorUser
VENDORAUTHENTICATION_SERVICE=vendor-user
VENDORAUTHENTICATION_SECRET=local-dev-vendor-secret-not-for-prod
VENDORAUTHENTICATION_AUTHSTRATEGIES=["jwt","local","phone"]
VENDORAUTHENTICATION_JWTOPTIONS_HEADER_TYP=access
VENDORAUTHENTICATION_JWTOPTIONS_AUDIENCE=http://localhost
VENDORAUTHENTICATION_JWTOPTIONS_ISSUER=feathers
VENDORAUTHENTICATION_JWTOPTIONS_ALGORITHM=HS256
VENDORAUTHENTICATION_JWTOPTIONS_EXPIRESIN=30d
VENDORAUTHENTICATION_LOCAL_USERNAMEFIELD=email
VENDORAUTHENTICATION_LOCAL_PASSWORDFIELD=password
VENDORAUTHENTICATION_PHONE_USERNAMEFIELD=mobile_number
VENDORAUTHENTICATION_PHONE_PASSWORDFIELD=password
EOF
fi

# ---------------------------------------------------------------------------
# 3. Node dependencies for each reference app (npm install is idempotent).
#    CRA React 16/18 apps need legacy peer-dep resolution.
# ---------------------------------------------------------------------------
npm_install() {
  local dir="$1"; shift
  if [[ ! -d "$dir" ]]; then
    echo "==> SKIP (missing): $dir"
    return 0
  fi
  echo "==> npm install: $dir  ($*)"
  ( cd "$dir" && npm install "$@" ) || echo "!! npm install failed in $dir (continuing)"
}

npm_install "$REPOS_ROOT/amealio-nestjs-backend"
npm_install "$REPOS_ROOT/amealio-self-delivery-app"
npm_install "$REPOS_ROOT/amealio_web_app" --legacy-peer-deps
npm_install "$REPOS_ROOT/amealio-vendordashboard"
npm_install "$REPOS_ROOT/amealiodashboardmvp-/client" --legacy-peer-deps

echo "==> install.sh complete."
