# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Cache busting - package files
COPY package*.json ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Prisma 7 uchun: schema + config fayli generate'dan OLDIN kerak
COPY prisma ./prisma
COPY prisma.config.ts ./

# Generate prisma client
# DATABASE_URL build vaqtida ishlatilmaydi, lekin config uni talab qiladi -> dummy qiymat
RUN DATABASE_URL="postgresql://user:pass@localhost:5432/db" npx prisma generate

# Copy source code
COPY . .

# Build application
RUN npm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Only copy what we need from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
# `prisma db push` / `migrate deploy` konteyner ichida ishlashi uchun
COPY --from=builder /app/prisma.config.ts ./

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs \
    && adduser -S nestjs -u 1001 \
    && mkdir -p /app/logs \
    && chown -R nestjs:nodejs /app/logs

USER nestjs

EXPOSE 3000

# Healthcheck (alpine'da curl yo'q - node bilan tekshiramiz)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/api',(r)=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

# Migratsiya app'dan OLDIN, har safar konteyner ko'tarilganda.
#
# Ilgari bu faqat deploy workflow'ida bajarilardi. Serverda qo'lda
# `docker compose up -d` qilinganda esa app migratsiyasiz bazaga ulanardi:
# jadval/ustun yetishmagani uchun Prisma "The column `(not available)` does
# not exist in the current database" deb yiqilardi va sabab ko'rinmasdi.
#
# `migrate deploy` idempotent - qo'llanilgan migratsiyani qayta ishlatmaydi,
# shuning uchun workflow'dagi qadam bilan takrorlanishi zarar qilmaydi.
# Migratsiya yiqilsa `&&` app'ni ishga tushirmaydi - xato log'da aniq turadi.
#
# tsconfig.build.json prisma.config.ts'ni exclude qiladi -> rootDir=src -> chiqish: dist/main.js
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/main.js"]
