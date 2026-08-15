#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Seeding database (idempotent)..."
node dist/prisma/seed.js || echo "Seed finished with warnings"

echo "Starting API on port ${API_PORT:-4000}..."
exec node dist/main.js
