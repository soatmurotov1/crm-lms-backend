#!/bin/bash

# Production Docker health monitoring script

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🏥 Docker Health Check${NC}"
echo "================================"

# Check Docker daemon
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker daemon is not running${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker daemon is running${NC}"
echo ""

# Check containers
echo -e "${YELLOW}Checking containers...${NC}"
docker-compose ps

echo ""
echo -e "${YELLOW}Container Health Status:${NC}"

# App health
if docker-compose exec -T app curl -f http://localhost:3000/api > /dev/null 2>&1; then
    echo -e "${GREEN}✅ App is healthy${NC}"
else
    echo -e "${RED}❌ App is unhealthy${NC}"
fi

# Database health
if docker-compose exec -T db pg_isready -U postgres > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database is healthy${NC}"
else
    echo -e "${RED}❌ Database is unhealthy${NC}"
fi

# Redis health
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis is healthy${NC}"
else
    echo -e "${RED}❌ Redis is unhealthy${NC}"
fi

echo ""
echo -e "${YELLOW}Resource Usage:${NC}"
docker stats --no-stream

echo ""
echo -e "${YELLOW}Recent Logs:${NC}"
docker-compose logs --tail=20 app
