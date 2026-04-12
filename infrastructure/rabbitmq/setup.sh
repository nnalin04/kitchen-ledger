#!/bin/sh
# infrastructure/rabbitmq/setup.sh
#
# Creates the KitchenLedger topic exchange, all 5 consumer queues,
# and all bindings using the RabbitMQ HTTP Management API.
#
# Runs once at startup via the rabbitmq-setup Docker service.
# Called AFTER rabbitmq:healthcheck passes (condition: service_healthy).
#
# Topology from TRD §2.16:
#   Exchange : kitchenledger.events  (topic, durable)
#   Queues   : notification-service, finance-service,
#              inventory-service, report-service, staff-service
#
# Environment variables (set by docker-compose):
#   RABBITMQ_HOST   RABBITMQ_PORT   RABBITMQ_USER   RABBITMQ_PASS

set -e

BASE="http://${RABBITMQ_HOST:-rabbitmq}:${RABBITMQ_PORT:-15672}/api"
AUTH="${RABBITMQ_USER:-kl_rabbit}:${RABBITMQ_PASS:-kl_rabbit_pass}"
EXCHANGE="kitchenledger.events"
VHOST="%2F"

log() { echo "[rabbitmq-setup] $1"; }
api() { curl -sf -u "$AUTH" -H "Content-Type: application/json" "$@"; }

# ── 1. Declare topic exchange ──────────────────────────────────
log "Creating exchange: $EXCHANGE"
api -X PUT "$BASE/exchanges/$VHOST/$EXCHANGE" \
  -d '{"type":"topic","durable":true,"auto_delete":false,"internal":false,"arguments":{}}'
log "Exchange ready."

# ── 2. Declare durable queues ─────────────────────────────────
for QUEUE in notification-service finance-service inventory-service report-service staff-service; do
  log "Creating queue: $QUEUE"
  api -X PUT "$BASE/queues/$VHOST/$QUEUE" \
    -d '{"durable":true,"auto_delete":false,"arguments":{"x-queue-type":"classic"}}'
done
log "All queues created."

# ── 3. Bindings ────────────────────────────────────────────────
bind() {
  QUEUE="$1"
  ROUTING_KEY="$2"
  log "  Binding $QUEUE ← $ROUTING_KEY"
  api -X POST "$BASE/bindings/$VHOST/e/$EXCHANGE/q/$QUEUE" \
    -d "{\"routing_key\":\"$ROUTING_KEY\",\"arguments\":{}}"
}

# notification-service consumes:
bind notification-service "auth.user.registered"
bind notification-service "auth.user.invited"
bind notification-service "inventory.stock.low"
bind notification-service "inventory.stock.expiring"
bind notification-service "inventory.po.sent"
bind notification-service "finance.dsr.reconciled"
bind notification-service "finance.payment.overdue"
bind notification-service "report.generated"

# finance-service consumes:
bind finance-service "auth.tenant.created"
bind finance-service "ai.ocr.completed"

# inventory-service consumes:
bind inventory-service "ai.ocr.completed"

# report-service consumes:
bind report-service "finance.dsr.reconciled"

# staff-service consumes:
bind staff-service "auth.user.registered"

log "All bindings created."
log "RabbitMQ topology is ready."
