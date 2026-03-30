#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "🚀 Starting deployment process..."

# 1. Build the image defined in the Dockerfile
#Tag it specifically so Compose knows which version to use
echo "📦 Building backend image..."
docker build -t backend-backend:beta -f Dockerfile .

# 2. Stop and remove existing containers defined in the compose file
echo "🛑 Bringing down existing containers..."
docker compose down

# 3. Start everything up in detached mode
# The --build flag here is a safety net, but since we built it above, 
# it will use the fresh local image.
echo "🆙 Starting services (DB & Backend)..."
docker compose up -d

echo "✅ Deployment successful!"
