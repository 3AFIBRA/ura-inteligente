#!/bin/sh
set -e

# API entrypoint
if [ -n "$DATABASE_URL" ]; then
  npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
fi
if [ "$RUN_SEED" = "true" ]; then
  npx tsx apps/api/prisma/seed.ts
fi
exec "$@"
