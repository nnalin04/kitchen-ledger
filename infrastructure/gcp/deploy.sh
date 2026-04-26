#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# KitchenLedger — GCP Cloud Run deployment script
#
# Usage:
#   ./infrastructure/gcp/deploy.sh --env staging --tag sha-abc1234
#   ./infrastructure/gcp/deploy.sh --env production --tag sha-abc1234
#
# Pre-requisites:
#   - gcloud CLI authenticated (gcloud auth login / Workload Identity in CI)
#   - GCP_PROJECT env var set
#   - All secrets created in Secret Manager (see infrastructure/gcp/secrets.sh)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Parse arguments ────────────────────────────────────────────────────────────
ENVIRONMENT=""
IMAGE_TAG=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --env) ENVIRONMENT="$2"; shift 2 ;;
    --tag) IMAGE_TAG="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

if [[ -z "$ENVIRONMENT" || -z "$IMAGE_TAG" ]]; then
  echo "Usage: $0 --env <staging|production> --tag <image-tag>"
  exit 1
fi

# ── Config ─────────────────────────────────────────────────────────────────────
PROJECT="${GCP_PROJECT:?GCP_PROJECT env var must be set}"
REGION="${GCP_REGION:-us-central1}"
REGISTRY="us-central1-docker.pkg.dev/${PROJECT}/kitchenledger"
VPC_CONNECTOR="${GCP_VPC_CONNECTOR:-kitchenledger-connector}"

# Service → port mapping
declare -A PORTS=(
  [auth-service]=8081
  [inventory-service]=8082
  [finance-service]=8083
  [ai-service]=8084
  [file-service]=8085
  [notification-service]=8086
  [report-service]=8087
  [staff-service]=8088
  [gateway]=8080
)

# Services that must never cold-start (auth + gateway)
ALWAYS_ON_SERVICES=("auth-service" "gateway")

# Resource allocations: cpu/memory per service type
declare -A CPU=(
  [auth-service]="1"
  [inventory-service]="1"
  [finance-service]="1"
  [staff-service]="1"
  [ai-service]="2"
  [report-service]="1"
  [gateway]="1"
  [notification-service]="0.5"
  [file-service]="0.5"
)

declare -A MEMORY=(
  [auth-service]="512Mi"
  [inventory-service]="512Mi"
  [finance-service]="512Mi"
  [staff-service]="512Mi"
  [ai-service]="1Gi"
  [report-service]="512Mi"
  [gateway]="256Mi"
  [notification-service]="256Mi"
  [file-service]="256Mi"
)

# ── Helper functions ───────────────────────────────────────────────────────────
log() { echo "[deploy] $(date -u +%H:%M:%S) $*"; }
secret_ref() { echo "${PROJECT}/${1}:latest"; }

# ── Deploy a single service ────────────────────────────────────────────────────
deploy_service() {
  local service="$1"
  local port="${PORTS[$service]}"
  local image="${REGISTRY}/${service}:${IMAGE_TAG}"
  local min_instances=0

  for always_on in "${ALWAYS_ON_SERVICES[@]}"; do
    [[ "$service" == "$always_on" ]] && min_instances=1
  done

  log "Deploying ${service} (image: ${IMAGE_TAG}, port: ${port}, min: ${min_instances})"

  gcloud run deploy "${service}-${ENVIRONMENT}" \
    --image="${image}" \
    --region="${REGION}" \
    --port="${port}" \
    --cpu="${CPU[$service]}" \
    --memory="${MEMORY[$service]}" \
    --min-instances="${min_instances}" \
    --max-instances=10 \
    --timeout=300 \
    --no-allow-unauthenticated \
    --vpc-connector="${VPC_CONNECTOR}" \
    --vpc-egress=private-ranges-only \
    --set-env-vars="ENVIRONMENT=${ENVIRONMENT}" \
    --set-secrets="\
INTERNAL_SERVICE_SECRET=$(secret_ref INTERNAL_SERVICE_SECRET),\
SUPABASE_URL=$(secret_ref SUPABASE_URL),\
SUPABASE_SERVICE_KEY=$(secret_ref SUPABASE_SERVICE_KEY),\
SUPABASE_STORAGE_URL=$(secret_ref SUPABASE_STORAGE_URL),\
REDIS_URL=$(secret_ref REDIS_URL),\
RABBITMQ_URL=$(secret_ref RABBITMQ_URL)" \
    --quiet

  log "✓ ${service} deployed"
}

deploy_service_with_extra_secrets() {
  local service="$1"
  shift
  # Additional --set-secrets args passed as remaining arguments
  # Used for auth (JWT keys), ai (OpenAI), notification (Resend)
  local port="${PORTS[$service]}"
  local image="${REGISTRY}/${service}:${IMAGE_TAG}"
  local min_instances=0

  for always_on in "${ALWAYS_ON_SERVICES[@]}"; do
    [[ "$service" == "$always_on" ]] && min_instances=1
  done

  log "Deploying ${service} with extra secrets"

  gcloud run deploy "${service}-${ENVIRONMENT}" \
    --image="${image}" \
    --region="${REGION}" \
    --port="${port}" \
    --cpu="${CPU[$service]}" \
    --memory="${MEMORY[$service]}" \
    --min-instances="${min_instances}" \
    --max-instances=10 \
    --timeout=300 \
    --no-allow-unauthenticated \
    --vpc-connector="${VPC_CONNECTOR}" \
    --vpc-egress=private-ranges-only \
    --set-env-vars="ENVIRONMENT=${ENVIRONMENT}" \
    --set-secrets="$@" \
    --quiet

  log "✓ ${service} deployed"
}

# ── Smoke test after deploy ────────────────────────────────────────────────────
smoke_test() {
  log "Running smoke test..."
  local gateway_url
  gateway_url=$(gcloud run services describe "gateway-${ENVIRONMENT}" \
    --region="${REGION}" --format='value(status.url)')

  local max_attempts=10
  for i in $(seq 1 $max_attempts); do
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" "${gateway_url}/health" \
      -H "Authorization: Bearer test" 2>/dev/null || echo "000")

    if [[ "$status" == "200" || "$status" == "401" ]]; then
      log "✓ Smoke test passed (gateway responded with ${status})"
      return 0
    fi

    log "Attempt ${i}/${max_attempts}: gateway returned ${status}, retrying in 5s..."
    sleep 5
  done

  log "✗ Smoke test FAILED after ${max_attempts} attempts"
  exit 1
}

# ── Main deployment sequence ───────────────────────────────────────────────────
log "Starting deployment to ${ENVIRONMENT} with tag ${IMAGE_TAG}"

# 1. Auth Service (JWT keys needed)
deploy_service_with_extra_secrets auth-service \
  "INTERNAL_SERVICE_SECRET=$(secret_ref INTERNAL_SERVICE_SECRET),\
SUPABASE_URL=$(secret_ref SUPABASE_URL),\
SUPABASE_SERVICE_KEY=$(secret_ref SUPABASE_SERVICE_KEY),\
REDIS_URL=$(secret_ref REDIS_URL),\
RABBITMQ_URL=$(secret_ref RABBITMQ_URL),\
JWT_PRIVATE_KEY=$(secret_ref JWT_PRIVATE_KEY),\
JWT_PUBLIC_KEY=$(secret_ref JWT_PUBLIC_KEY)"

# 2. Core domain services in parallel
log "Deploying inventory, finance, staff services in parallel..."
deploy_service inventory-service &
deploy_service finance-service &
deploy_service staff-service &
wait
log "✓ Domain services deployed"

# 3. AI Service (OpenAI + Mindee + Google Cloud credentials)
deploy_service_with_extra_secrets ai-service \
  "INTERNAL_SERVICE_SECRET=$(secret_ref INTERNAL_SERVICE_SECRET),\
SUPABASE_URL=$(secret_ref SUPABASE_URL),\
SUPABASE_SERVICE_KEY=$(secret_ref SUPABASE_SERVICE_KEY),\
SUPABASE_STORAGE_URL=$(secret_ref SUPABASE_STORAGE_URL),\
REDIS_URL=$(secret_ref REDIS_URL),\
RABBITMQ_URL=$(secret_ref RABBITMQ_URL),\
OPENAI_API_KEY=$(secret_ref OPENAI_API_KEY),\
MINDEE_API_KEY=$(secret_ref MINDEE_API_KEY),\
GOOGLE_CLOUD_CREDENTIALS=$(secret_ref GOOGLE_CLOUD_CREDENTIALS)"

# 4. Support services in parallel
log "Deploying file, notification, report services in parallel..."
deploy_service file-service &

deploy_service_with_extra_secrets notification-service \
  "INTERNAL_SERVICE_SECRET=$(secret_ref INTERNAL_SERVICE_SECRET),\
SUPABASE_URL=$(secret_ref SUPABASE_URL),\
SUPABASE_SERVICE_KEY=$(secret_ref SUPABASE_SERVICE_KEY),\
REDIS_URL=$(secret_ref REDIS_URL),\
RABBITMQ_URL=$(secret_ref RABBITMQ_URL),\
RESEND_API_KEY=$(secret_ref RESEND_API_KEY),\
EXPO_ACCESS_TOKEN=$(secret_ref EXPO_ACCESS_TOKEN)" &

deploy_service report-service &
wait
log "✓ Support services deployed"

# 5. Gateway last (it routes to everything else)
deploy_service_with_extra_secrets gateway \
  "INTERNAL_SERVICE_SECRET=$(secret_ref INTERNAL_SERVICE_SECRET),\
JWT_PUBLIC_KEY=$(secret_ref JWT_PUBLIC_KEY),\
REDIS_URL=$(secret_ref REDIS_URL),\
ALLOWED_ORIGINS=$(secret_ref ALLOWED_ORIGINS)"

# 6. Smoke test
smoke_test

log "✅ Deployment to ${ENVIRONMENT} complete"
