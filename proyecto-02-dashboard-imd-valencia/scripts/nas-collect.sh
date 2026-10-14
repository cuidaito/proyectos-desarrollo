#!/bin/sh
# Captura el tráfico y sube el histórico a GitHub. Pensado para cron en un NAS (QNAP).
# Uso: ./nas-collect.sh   (requiere git y python3; token en ~/.traffic-token o variable GH_TOKEN)
set -eu

REPO_DIR="${REPO_DIR:-$HOME/proyectos-desarrollo}"
REPO_URL="${REPO_URL:-github.com/cuidaito/proyectos-desarrollo.git}"
TOKEN="${GH_TOKEN:-$(cat "$HOME/.traffic-token")}"

cd "$REPO_DIR"
git remote set-url origin "https://x-access-token:${TOKEN}@${REPO_URL}"
git pull --rebase --quiet origin main
python3 proyecto-02-dashboard-imd-valencia/scripts/collect.py
git add proyecto-02-dashboard-imd-valencia/data
git diff --cached --quiet && exit 0
git commit --quiet -m "data: captura de tráfico $(date -u +%Y-%m-%dT%H:%MZ)"
git push --quiet origin HEAD:main
