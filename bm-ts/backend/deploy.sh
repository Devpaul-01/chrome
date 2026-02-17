#!/bin/bash

set -e

echo "Deploying bm-legacy-backend..."

# Go to backend directory
cd "$(dirname "$0")"

# Pull latest Docker image
docker compose pull

# Stop current container
docker compose down

# Start updated container
docker compose up -d

echo "Deployment complete."
