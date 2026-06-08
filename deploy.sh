#!/bin/bash

# Deploy script for Digital Ocean

set -e

echo "🚀 Starting deployment..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found. Please create it from .env.example${NC}"
    exit 1
fi

echo -e "${YELLOW}1️⃣  Pulling latest changes...${NC}"
git pull origin main || echo -e "${YELLOW}Warning: Could not pull from git${NC}"

echo -e "${YELLOW}2️⃣  Building Docker images...${NC}"
docker-compose build --no-cache

echo -e "${YELLOW}3️⃣  Starting containers...${NC}"
docker-compose up -d

echo -e "${YELLOW}4️⃣  Waiting for database to be ready...${NC}"
sleep 10

echo -e "${YELLOW}5️⃣  Running database migrations...${NC}"
docker-compose exec -T app npx prisma migrate deploy

echo -e "${YELLOW}6️⃣  Checking application health...${NC}"
docker-compose ps

echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo ""
echo "📋 Useful commands:"
echo "  View logs:        docker-compose logs -f app"
echo "  Stop services:    docker-compose down"
echo "  Restart app:      docker-compose restart app"
echo "  Database backup:  docker-compose exec db pg_dump -U postgres crm-lms-backend > backup.sql"
