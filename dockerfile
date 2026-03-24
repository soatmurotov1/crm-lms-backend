FROM node:20-alpine

WORKDIR /app

# 1. Faqat package fayllarini nusxalaymiz (Keshdan foydalanish uchun)
COPY package*.json ./

# 2. Kutubxonalarni o'rnatish
RUN npm install --legacy-peer-deps

# 3. Prisma fayllarini nusxalash va generate qilish
COPY prisma ./prisma
RUN npx prisma generate

# 4. Qolgan barcha kodlarni nusxalash
COPY . .

# 5. Loyihani build qilish (dist papkasi yaratiladi)
RUN npm run build

# 6. Portni ochish
EXPOSE 3000

CMD ["node", "dist/main.js"]