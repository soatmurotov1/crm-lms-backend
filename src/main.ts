import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');

  const IS_PRODUCTION = process.env.NODE_ENV === 'production';

  /**
   * Oldimizda nechta ishonchli reverse proxy turganini aniq aytamiz.
   * Shundagina Express `X-Forwarded-For` ning FAQAT o'sha proxy qo'shgan
   * qismiga ishonadi va `req.ip` ni to'g'ri hisoblaydi. Busiz mijoz
   * sarlavhani o'zi yasab, IP bo'yicha cheklovlarni aylanib o'tadi.
   * Proxy soni boshqacha bo'lsa TRUST_PROXY bilan sozlanadi.
   */
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));

  /**
   * Minimal xavfsizlik sarlavhalari. Bu API JSON qaytaradi, shuning uchun
   * to'liq helmet to'plami shart emas — MIME sniffing, iframe ichiga olish va
   * referrer sizib chiqishini to'sish yetarli.
   */
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.removeHeader('X-Powered-By');

    if (IS_PRODUCTION) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }

    next();
  });

  /** Ishlab chiqarishda ochiq bo'lgan domenlar. */
  const ALLOWED_ORIGINS = [
    'https://crm-lms-frontend.vercel.app',
    'https://abrorbek.me',
    'http://localhost:4040',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
  ];

  /**
   * Vite band portni ko'rsa o'zi keyingisiga o'tadi (5175, 5176, ...), shuning
   * uchun development'da har qanday localhost portiga ruxsat beramiz. Aks holda
   * frontend "Backendga ulanib bo'lmadi" deb xato beradi - aslida bu CORS.
   */
  const LOCALHOST_ORIGIN = /^https?:\/\/localhost:\d+$/;

  app.enableCors({
    origin: (origin, callback) => {
      // Origin'siz so'rovlar (curl, mobil ilova, server-to-server) o'tadi.
      if (!origin) return callback(null, true);

      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      if (!IS_PRODUCTION && LOCALHOST_ORIGIN.test(origin)) {
        return callback(null, true);
      }

      // Xato tashlamaymiz: shunchaki ruxsat sarlavhasi qo'yilmaydi va
      // brauzerning o'zi so'rovni bloklaydi (500 o'rniga toza CORS xatosi).
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 3600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  /**
   * Swagger butun API sirtini (endpointlar, DTO maydonlari, rollar) ochib
   * beradi. Ishlab chiqarishda u yopiq bo'ladi; kerak bo'lsa serverda
   * SWAGGER_ENABLED=true qo'yib ochish mumkin.
   */
  const SWAGGER_ENABLED = IS_PRODUCTION
    ? process.env.SWAGGER_ENABLED === 'true'
    : true;

  if (SWAGGER_ENABLED) {
    const config = new DocumentBuilder()
      .setTitle('EduCenter')
      .setDescription('EduCenter - talim boshqaruv tizimi API')
      .setVersion('1.1.1')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);

    SwaggerModule.setup('api', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  const PORT = process.env.PORT || 4041;
  const NODE_ENV = process.env.NODE_ENV || 'development';

  await app.listen(PORT, () => {
    logger.log(`
    🚀 Application is running!
    📡 Server: http://localhost:${PORT}
    🔗 Swagger: http://localhost:${PORT}/api
    🌍 Environment: ${NODE_ENV}
    `);
  });

}

bootstrap();
