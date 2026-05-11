#!/usr/bin/env bash
# Run this from your Mac to push code + trigger deploy on Oracle VM.
# Usage: bash infrastructure/oracle-push.sh
set -euo pipefail

VM_IP="80.225.223.142"
VM_USER="ubuntu"
SSH_KEY="$HOME/.ssh/oracle_vm.key"
REPO_DIR="$HOME/dev/AI Agent/KitchenLedger"
REMOTE_DIR="$HOME/kitchen-ledger"

echo "======================================"
echo " KitchenLedger → Oracle Cloud Push"
echo "======================================"

# ── 1. Push latest commits to GitHub ──────────────────────────────────────────
echo ""
echo "→ Pushing latest commits to GitHub..."
git -C "$REPO_DIR" push origin main
echo "  ✓ GitHub up to date"

# ── 2. Set up repo on Oracle VM (first time only) ─────────────────────────────
echo ""
echo "→ Checking remote repo..."
ssh -i "$SSH_KEY" "$VM_USER@$VM_IP" bash <<EOF
set -e
if [ ! -d "$REMOTE_DIR/.git" ]; then
  echo "  Cloning kitchen-ledger repo..."
  git clone https://github.com/nnalin04/kitchen-ledger.git "$REMOTE_DIR"
else
  echo "  Repo exists, pulling..."
  git -C "$REMOTE_DIR" pull origin main
fi
EOF
echo "  ✓ Remote repo ready"

# ── 3. Sync .env if it exists locally ─────────────────────────────────────────
if [ -f "$REPO_DIR/.env.prod" ]; then
  echo ""
  echo "→ Uploading .env.prod → remote .env..."
  scp -i "$SSH_KEY" "$REPO_DIR/.env.prod" "$VM_USER@$VM_IP:$REMOTE_DIR/.env"
  echo "  ✓ .env uploaded"
else
  echo ""
  echo "  NOTE: No .env.prod found locally."
  echo "  If .env is not set up on the server yet:"
  echo "    1. ssh -i $SSH_KEY $VM_USER@$VM_IP"
  echo "    2. cp $REMOTE_DIR/.env.oracle $REMOTE_DIR/.env"
  echo "    3. nano $REMOTE_DIR/.env  (fill in all <FILL_IN> values)"
fi

# ── 4. Run deploy script on VM ─────────────────────────────────────────────────
echo ""
echo "→ Running deploy on Oracle VM..."
ssh -i "$SSH_KEY" "$VM_USER@$VM_IP" "bash $REMOTE_DIR/infrastructure/oracle-deploy.sh"

echo ""
echo "======================================"
echo " Done! Gateway: http://$VM_IP"
echo "======================================"
