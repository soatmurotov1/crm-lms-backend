import cluster from 'node:cluster';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { resolveWorkerCount } from './common/utils/concurrency.util';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');

  const IS_PRODUCTION = process.env.NODE_ENV === 'production';
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.removeHeader('X-Powered-By');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

    // JSON API hech qachon HTML/skript bermaydi — javob qandaydir yo'l bilan
    // brauzerda ochilsa ham skript ishlamasin (XSS). Swagger UI (/api) bundan
    // mustasno, unga o'z skriptlari kerak.
    if (/^\/api\/(v2|auth|payments)(\/|$)/.test(_req.path)) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'; sandbox",
      );
    }

    if (IS_PRODUCTION) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }

    next();
  });

  const ALLOWED_ORIGINS = [
    'https://crm-lms-frontend.vercel.app',
    'http://localhost:4040',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
  ];
  const LOCALHOST_ORIGIN = /^https?:\/\/localhost:\d+$/;

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      if (!IS_PRODUCTION && LOCALHOST_ORIGIN.test(origin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Branch-Id'],
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
  app.enableShutdownHooks();
  const PORT = Number(process.env.PORT) || 4041;
  const NODE_ENV = process.env.NODE_ENV || 'development';

  /*
    Slowloris kabi sekin-ulanish (DoS) hujumlariga qarshi: sarlavhalarni yoki
    so'rov tanasini juda sekin yuborib, server ulanishlarini band qilib
    turishga yo'l qo'yilmaydi.
  */
  const server = app.getHttpServer() as import('node:http').Server;
  server.headersTimeout = 20_000;
  server.requestTimeout = 120_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;

  await app.listen(PORT, () => {
    const worker = cluster.worker ? ` (worker ${cluster.worker.id})` : '';
    logger.log(`
    🚀 Application is running!${worker}
    📡 Server: http://localhost:${PORT}
    🔗 Swagger: http://localhost:${PORT}/api
    🌍 Environment: ${NODE_ENV}
    `);
  });
}

const RESTART_WINDOW_MS = 60_000;
const MAX_RESTARTS_IN_WINDOW = 10;
const RESTART_DELAY_MS = 1_000;

function startCluster() {
  const workers = resolveWorkerCount();
  const logger = new Logger('Cluster');

  if (workers <= 1 || !cluster.isPrimary) {
    void bootstrap();
    return;
  }

  cluster.schedulingPolicy = cluster.SCHED_RR;

  logger.log(`${workers} ta worker ishga tushirilmoqda`);

  const schedulerWorkers = new Set<number>();

  const spawn = (isScheduler: boolean) => {
    const worker = cluster.fork({
      SCHEDULER_ENABLED: isScheduler ? 'true' : 'false',
    });

    if (isScheduler) schedulerWorkers.add(worker.id);

    return worker;
  };

  for (let index = 0; index < workers; index += 1) {
    spawn(index === 0);
  }

  /** Oxirgi yiqilishlar vaqti — tsiklga tushib qolganini aniqlash uchun. */
  let recentCrashes: number[] = [];
  let shuttingDown = false;

  cluster.on('exit', (worker, code, signal) => {
    const wasScheduler = schedulerWorkers.delete(worker.id);
    if (shuttingDown || signal === 'SIGTERM' || signal === 'SIGINT') return;

    const now = Date.now();
    recentCrashes = recentCrashes.filter((at) => now - at < RESTART_WINDOW_MS);
    recentCrashes.push(now);

    /*
      Chegaradan oshdi — demak muammo aynan shu worker'da emas, ishga
      tushishning o'zida (port band, sozlama yetishmayapti, migratsiya
      o'tmagan). Yana ko'tarish faqat bazani va protsessorni behuda
      yuklaydi, log esa bir xil xato bilan to'lib ketadi.
    */
    if (recentCrashes.length > MAX_RESTARTS_IN_WINDOW) {
      shuttingDown = true;

      logger.error(
        `Worker'lar ${RESTART_WINDOW_MS / 1000} soniyada ` +
          `${recentCrashes.length} marta yiqildi — qayta ko'tarish to'xtatildi. ` +
          `Yuqoridagi xatoni tuzatib, ilovani qayta ishga tushiring.`,
      );

      for (const active of Object.values(cluster.workers ?? {})) {
        active?.process.kill('SIGTERM');
      }

      process.exitCode = 1;
      return;
    }

    logger.error(
      `Worker ${worker.process.pid} to'xtadi (kod: ${code}, signal: ${signal}) - qayta ko'tarilmoqda`,
    );

    setTimeout(() => {
      if (!shuttingDown) spawn(wasScheduler);
    }, RESTART_DELAY_MS);
  });

  
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      shuttingDown = true;
      logger.log(`${signal} qabul qilindi - worker'lar to'xtatilmoqda`);

      for (const worker of Object.values(cluster.workers ?? {})) {
        worker?.process.kill(signal);
      }
    });
  }
}

startCluster();
