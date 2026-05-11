#!/usr/bin/env bash
# KitchenLedger — Oracle Cloud ARM deployment script
# Run this ON the Oracle VM: bash oracle-deploy.sh
# Or trigger remotely: ssh ubuntu@80.225.223.142 "cd ~/kitchen-ledger && bash infrastructure/oracle-deploy.sh"
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$REPO_DIR/infrastructure/docker-compose.prod.yml"
ENV_FILE="$REPO_DIR/.env"

echo "============================================"
echo " KitchenLedger — Oracle Cloud Deploy"
echo " Repo: $REPO_DIR"
echo "============================================"

# ── 1. System dependencies ─────────────────────────────────────────────────────

echo ""
echo "→ Checking system dependencies..."

if ! command -v nginx &>/dev/null; then
  echo "  Installing nginx..."
  sudo apt-get update -qq
  sudo apt-get install -y nginx
fi

if ! command -v certbot &>/dev/null; then
  echo "  Installing certbot (for future HTTPS setup)..."
  sudo apt-get install -y certbot python3-certbot-nginx 2>/dev/null || true
fi

echo "  ✓ System deps ready"

# ── 2. Pull latest code ─────────────────────────────────────────────────────────

echo ""
echo "→ Pulling latest code..."
git -C "$REPO_DIR" pull origin main
echo "  ✓ Code up to date ($(git -C "$REPO_DIR" rev-parse --short HEAD))"

# ── 3. Validate .env ───────────────────────────────────────────────────────────

echo ""
echo "→ Validating .env..."

if [ ! -f "$ENV_FILE" ]; then
  echo "  ERROR: $ENV_FILE not found."
  echo "  Copy .env.oracle to .env and fill in all secrets, then re-run."
  exit 1
fi

REQUIRED_VARS=(
  "POSTGRES_PASSWORD"
  "RABBITMQ_PASSWORD"
  "JWT_PRIVATE_KEY"
  "JWT_PUBLIC_KEY"
  "INTERNAL_SERVICE_SECRET"
  "RESEND_API_KEY"
  "ALLOWED_ORIGINS"
)

MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  val=$(grep "^${var}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"')
  if [ -z "$val" ] || [[ "$val" == *"change-me"* ]] || [[ "$val" == *"xxxx"* ]]; then
    MISSING+=("$var")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "  ERROR: Missing or placeholder values in .env:"
  for v in "${MISSING[@]}"; do echo "    - $v"; done
  exit 1
fi

echo "  ✓ .env looks good"

# ── 4. Configure nginx ─────────────────────────────────────────────────────────

echo ""
echo "→ Configuring nginx..."

sudo cp "$REPO_DIR/infrastructure/nginx/kitchenledger.conf" /etc/nginx/sites-available/kitchenledger
sudo ln -sf /etc/nginx/sites-available/kitchenledger /etc/nginx/sites-enabled/kitchenledger
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl reload nginx
echo "  ✓ nginx configured"

# ── 5. Build and start services ────────────────────────────────────────────────

echo ""
echo "→ Building Docker images (this takes 10-20 minutes on first run)..."
echo "  Building infra + gateway first..."

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  postgres redis rabbitmq gateway notification-service file-service 2>&1 | tail -5

echo "  Building Java services (auth, inventory, finance, staff)..."
# Build sequentially to avoid OOM on 24GB ARM VM
for svc in auth-service inventory-service finance-service staff-service; do
  echo "    Building $svc..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build "$svc" 2>&1 | tail -3
done

echo "  Building Python services (ai, report)..."
for svc in ai-service report-service; do
  echo "    Building $svc..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build "$svc" 2>&1 | tail -3
done

echo "  ✓ All images built"

# ── 6. Start services ──────────────────────────────────────────────────────────

echo ""
echo "→ Starting services..."

# Start infra first, wait for health
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres redis rabbitmq
echo "  Waiting for infra to be healthy (30s)..."
sleep 30

# Run RabbitMQ setup
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up rabbitmq-setup
echo "  RabbitMQ exchange + queues configured"

# Start all remaining services
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
echo "  ✓ All services starting..."

# ── 7. Wait for gateway health ─────────────────────────────────────────────────

echo ""
echo "→ Waiting for gateway to be ready (up to 3 minutes)..."

for i in $(seq 1 18); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ready 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "  ✓ Gateway is up (HTTP 200)"
    break
  fi
  echo "  Attempt $i/18: gateway returned $STATUS, retrying in 10s..."
  sleep 10
done

if [ "$STATUS" != "200" ]; then
  echo "  WARNING: Gateway not healthy after 3 min. Check: docker compose -f $COMPOSE_FILE logs gateway"
fi

# ── 8. Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "============================================"
echo " Deployment complete!"
echo "============================================"
echo ""
echo "  API Gateway:   http://80.225.223.142:8080"
echo "  Via nginx:     http://80.225.223.142"
echo ""
echo "  Container status:"
docker compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}"
echo ""
echo "  Logs:  docker compose -f $COMPOSE_FILE logs -f [service]"
echo "  Stop:  docker compose -f $COMPOSE_FILE down"
