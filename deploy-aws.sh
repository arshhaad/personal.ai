#!/usr/bin/env bash
set -euo pipefail

DOMAIN="ai.arrsh.shop"
EMAIL="${CERTBOT_EMAIL:-admin@arrsh.shop}"

echo "=== Deploying Personal AI for https://${DOMAIN} ==="

if [ ! -f "./backend/.env" ]; then
  echo "ERROR: ./backend/.env not found. Copy ./backend/.env.example to ./backend/.env and fill in your secrets."
  exit 1
fi

if [ -f "./frontend/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source ./frontend/.env
  set +a
fi

if [ -z "${VITE_GOOGLE_CLIENT_ID:-}" ]; then
  echo "WARNING: VITE_GOOGLE_CLIENT_ID is not set in environment or ./frontend/.env"
fi

mkdir -p ./nginx/conf.d

# Step 1: Start with HTTP Nginx config so Certbot can verify the domain
cp ./nginx/prod.http.conf ./nginx/conf.d/default.conf

echo "=== Building and starting production containers (HTTP bootstrap) ==="
docker compose -f docker-compose.prod.yml up -d --build

echo "=== Issuing/Renewing Let's Encrypt SSL certificate for ${DOMAIN} ==="
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "${EMAIL}" \
  --agree-tos \
  --no-eff-email \
  -d "${DOMAIN}"

# Step 2: Switch to full HTTPS Nginx config and reload
cp ./nginx/prod.ssl.conf ./nginx/conf.d/default.conf
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

echo "=== Deployment complete! Visit https://${DOMAIN} ==="
