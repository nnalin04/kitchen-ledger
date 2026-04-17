#!/bin/sh
# infrastructure/rabbitmq/setup.sh
#
# Creates the KitchenLedger topic exchange, consumer queues (with DLQ config),
# dead-letter exchange, dead-letter queues, and all routing bindings.
#
# Runs once at startup via the rabbitmq-setup Docker service.
# Called AFTER rabbitmq:healthcheck passes (condition: service_healthy).
#
# Topology:
#   Main exchange : kitchenledger.events  (topic, durable)
#   Dead-letter   : kitchenledger.dlx     (topic, durable)
#   Queues        : notification-service, finance-service,
#                   inventory-service, report-service, staff-service
#   DLQs          : {queue-name}.dlq  (7-day TTL; receives NACKed messages)
#
# Environment variables (set by docker-compose):
#   RABBITMQ_HOST   RABBITMQ_PORT   RABBITMQ_USER   RABBITMQ_PASS

set -e

BASE="http://${RABBITMQ_HOST:-rabbitmq}:${RABBITMQ_PORT:-15672}/api"
AUTH="${RABBITMQ_USER:-kl_rabbit}:${RABBITMQ_PASS:-kl_rabbit_pass}"
EXCHANGE="kitchenledger.events"
DLX="kitchenledger.dlx"
VHOST="%2F"
# 7 days in milliseconds
DLQ_TTL=604800000

log() { echo "[rabbitmq-setup] $1"; }
api() { curl -sf -u "$AUTH" -H "Content-Type: application/json" "$@"; }

# ── 1. Declare main topic exchange ────────────────────────────────────────────
log "Creating exchange: $EXCHANGE"
api -X PUT "$BASE/exchanges/$VHOST/$EXCHANGE" \
  -d '{"type":"topic","durable":true,"auto_delete":false,"internal":false,"arguments":{}}'
log "Exchange ready."

# ── 2. Declare dead-letter exchange ───────────────────────────────────────────
log "Creating dead-letter exchange: $DLX"
api -X PUT "$BASE/exchanges/$VHOST/$DLX" \
  -d '{"type":"topic","durable":true,"auto_delete":false,"internal":false,"arguments":{}}'
log "DLX ready."

# ── 3. Declare DLQs (one per consumer queue, 7-day TTL) ───────────────────────
for QUEUE in notification-service finance-service inventory-service report-service staff-service; do
  DLQ="${QUEUE}.dlq"
  log "Creating DLQ: $DLQ  (TTL ${DLQ_TTL}ms)"
  api -X PUT "$BASE/queues/$VHOST/$DLQ" \
    -d "{\"durable\":true,\"auto_delete\":false,\"arguments\":{\"x-queue-type\":\"classic\",\"x-message-ttl\":${DLQ_TTL}}}"

  log "  Binding $DLQ ← kitchenledger.dlx  [#]"
  api -X POST "$BASE/bindings/$VHOST/e/$DLX/q/$DLQ" \
    -d '{"routing_key":"#","arguments":{}}'
done
log "All DLQs created and bound."

# ── 4. Declare main consumer queues WITH dead-letter config ───────────────────
# Messages that are NACKed (or exceed TTL/length limit) are automatically
# routed to kitchenledger.dlx with routing key "{queue-name}.dead",
# which the corresponding DLQ picks up via its "#" binding.
for QUEUE in notification-service finance-service inventory-service report-service staff-service; do
  log "Creating queue: $QUEUE  (with DLQ→ ${QUEUE}.dlq)"
  api -X PUT "$BASE/queues/$VHOST/$QUEUE" \
    -d "{\"durable\":true,\"auto_delete\":false,\"arguments\":{\"x-queue-type\":\"classic\",\"x-dead-letter-exchange\":\"$DLX\",\"x-dead-letter-routing-key\":\"${QUEUE}.dead\"}}"
done
log "All queues created."

# ── 5. Routing bindings ────────────────────────────────────────────────────────
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
bind notification-service "inventory.price.alert"
bind notification-service "finance.dsr.reconciled"
bind notification-service "finance.payment.overdue"
bind notification-service "finance.expense.created"
bind notification-service "report.generated"
bind notification-service "staff.employee.hired"
bind notification-service "staff.employee.noshow"
bind notification-service "staff.overtime.approaching"
bind notification-service "finance.cash.discrepancy"

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
