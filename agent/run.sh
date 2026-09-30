#!/usr/bin/env bash
# Run the Pitaka research agent from anywhere (cron, Windows Task Scheduler via wsl.exe, a desktop shortcut).
# Usage: agent/run.sh [markets|perks|fuel|news|all] [--model opus] [--dry-run]
set -euo pipefail

cd "$(dirname "$0")/.."

# Cron and wsl.exe start with a bare PATH: load nvm and ~/.local/bin (where claude lives).
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" >/dev/null
  # Newest installed Node (needs 20+); override with PITAKA_NODE=22 etc.
  nvm use --silent "${PITAKA_NODE:-node}" >/dev/null 2>&1 || true
fi
export PATH="$HOME/.local/bin:$PATH"

mkdir -p agent/logs
log="agent/logs/$(date +%Y-%m-%d).log"
echo "=== $(date '+%F %T') $* ===" >>"$log"
node node_modules/tsx/dist/cli.mjs agent/pitaka-agent.ts "${@:-all}" 2>&1 | tee -a "$log"
