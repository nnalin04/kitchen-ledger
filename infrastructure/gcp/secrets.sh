#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# One-time Secret Manager setup for KitchenLedger
# Run ONCE before first deploy. Idempotent (skips secrets that already exist).
#
# Usage: GCP_PROJECT=my-project ./infrastructure/gcp/secrets.sh
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT="${GCP_PROJECT:?GCP_PROJECT env var must be set}"

create_secret_if_missing() {
  local name="$1"
  if gcloud secrets describe "${name}" --project="${PROJECT}" &>/dev/null; then
    echo "  [skip] Secret '${name}' already exists"
  else
    gcloud secrets create "${name}" \
      --project="${PROJECT}" \
      --replication-policy="automatic"
    echo "  [created] Secret '${name}' — remember to add a version: gcloud secrets versions add ${name} --data-file=-"
  fi
}

echo "Creating Secret Manager secrets in project: ${PROJECT}"

SECRETS=(
  JWT_PRIVATE_KEY
  JWT_PUBLIC_KEY
  INTERNAL_SERVICE_SECRET
  OPENAI_API_KEY
  MINDEE_API_KEY
  GOOGLE_CLOUD_CREDENTIALS
  RESEND_API_KEY
  EXPO_ACCESS_TOKEN
  SUPABASE_URL
  SUPABASE_SERVICE_KEY
  SUPABASE_STORAGE_URL
  REDIS_URL
  RABBITMQ_URL
)

for secret in "${SECRETS[@]}"; do
  create_secret_if_missing "$secret"
done

echo ""
echo "Done. Next steps:"
echo "  1. For each secret, run: echo -n 'VALUE' | gcloud secrets versions add SECRET_NAME --data-file=-"
echo "  2. Grant the Cloud Run service account Secret Manager Secret Accessor role"
echo "     gcloud projects add-iam-policy-binding ${PROJECT} \\"
echo "       --member='serviceAccount:SERVICE_ACCOUNT@${PROJECT}.iam.gserviceaccount.com' \\"
echo "       --role='roles/secretmanager.secretAccessor'"
