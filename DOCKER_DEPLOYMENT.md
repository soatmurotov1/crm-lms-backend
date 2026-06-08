# 🚀 Digital Ocean Deployment Guide

## Prerequisites

- Digital Ocean Account
- Docker & Docker Compose installed on server
- Domain configured with DNS pointing to server IP
- SSL certificate (Let's Encrypt recommended)

## Step 1: Server Setup (Droplet)

1. **Create Droplet**
   - Choose Ubuntu 22.04 LTS
   - Recommended: 2GB RAM, 50GB SSD minimum
   - Add SSH key for access

2. **Initial Server Setup**

   ```bash
   ssh root@your_server_ip

   # Update system
   apt update && apt upgrade -y

   # Install Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh

   # Install Docker Compose
   curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   chmod +x /usr/local/bin/docker-compose

   # Add user to docker group
   usermod -aG docker $USER
   ```

## Step 2: Clone Repository

```bash
cd /home/app
git clone <your-repo-url> crm-backend
cd crm-backend/backend
```

## Step 3: Configure Environment Variables

```bash
# Copy example env
cp .env.example .env

# Edit .env with your production values
nano .env
```

**Critical environment variables to set:**

- `DATABASE_URL`: PostgreSQL connection string
- `TELEGRAM_BOT_TOKEN`: Your Telegram bot token
- `TELEGRAM_CHAT_ID`: Admin chat ID for notifications
- `JWT_SECRET`: Strong random string (min 32 chars)
- `REDIS_PASSWORD`: Strong password for Redis
- `CLOUDINARY_*`: Cloudinary credentials

## Step 4: SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
apt install certbot python3-certbot-nginx -y

# Get certificate
certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com
```

## Step 5: Nginx Reverse Proxy

Create `/etc/nginx/sites-available/crm-backend`:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_redirect off;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Enable Nginx:

```bash
ln -s /etc/nginx/sites-available/crm-backend /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

## Step 6: Deploy Application

```bash
# Build and start containers
docker-compose up -d

# View logs
docker-compose logs -f app

# Run migrations
docker-compose exec app npx prisma migrate deploy
```

## Step 7: Auto-renewal of SSL Certificate

```bash
# Test renewal
certbot renew --dry-run

# Renewal is automatic with systemd timer
```

## Monitoring & Maintenance

### View Logs

```bash
docker-compose logs app          # App logs
docker-compose logs db           # Database logs
docker-compose logs redis        # Redis logs
docker-compose logs -f app       # Follow app logs
```

### Database Backup

```bash
docker-compose exec db pg_dump -U postgres crm-lms-backend > backup_$(date +%Y%m%d).sql
```

### Restart Services

```bash
docker-compose restart           # Restart all
docker-compose restart app       # Restart app only
```

### Update Application

```bash
git pull origin main
docker-compose up -d --build     # Rebuild and restart
docker-compose exec app npx prisma migrate deploy
```

## Troubleshooting

### Container won't start

```bash
docker-compose logs app
# Check for error messages, ensure all env variables are set
```

### Database connection failed

```bash
# Ensure DB_USER and DB_PASSWORD in .env match
# Check DATABASE_URL format
docker-compose exec db pg_isready
```

### Memory issues

```bash
# Check Docker resources
docker stats
# Consider upgrading droplet or optimizing queries
```

### Port already in use

```bash
sudo lsof -i :3000
sudo kill -9 <PID>
```

## Security Checklist

- ✅ Change all default passwords
- ✅ Enable firewall: `ufw enable && ufw allow 22,80,443/tcp`
- ✅ Set strong JWT_SECRET
- ✅ Keep system packages updated
- ✅ Regular database backups
- ✅ Monitor logs for suspicious activity
- ✅ Enable CI/CD for automated deployments (optional)

## Performance Optimization

- Increase PostgreSQL connections in .env
- Enable Redis caching
- Use CDN for static assets
- Monitor memory and CPU usage regularly
