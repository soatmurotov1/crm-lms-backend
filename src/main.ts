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

  /**
   * `onModuleDestroy` (Prisma `$disconnect` va `pool.end`) SIGTERM'da
   * chaqirilishi uchun kerak. Bunisiz deploy paytida konteyner o'chganda
   * ulanishlar Postgres tomonda osilib qoladi.
   */
  app.enableShutdownHooks();

  /*
    Port ATAYLAB songa aylantiriladi. `process.env.PORT` matn qaytaradi va
    cluster ichida bu muammo tug'diradi: worker'lar tinglash uchun primary'ga
    murojaat qilganda handle kaliti port turiga bog'liq bo'ladi, matn bilan
    esa har bir worker o'zi bog'lanishga urinib `EADDRINUSE` oladi.
  */
  const PORT = Number(process.env.PORT) || 4041;
  const NODE_ENV = process.env.NODE_ENV || 'development';

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

/**
 * Qayta ko'tarish chegarasi: shu oyna ichida shuncha marta yiqilsa, primary
 * ham to'xtaydi.
 *
 * Busiz ishga tushishdagi har qanday xato (port band, env yetishmayapti,
 * migratsiya o'tmagan) cheksiz fork tsikliga aylanadi: sinovda 15 soniyada
 * yuzdan ortiq worker ko'tarilib, har biri bazaga ulanib yiqildi. Primary
 * o'zi to'xtasa, orkestrator (docker/systemd) buni ko'radi va konteynerni
 * qayta ishga tushirish yoki to'xtatish qaroriga o'zi keladi.
 */
const RESTART_WINDOW_MS = 60_000;
const MAX_RESTARTS_IN_WINDOW = 10;

/** Yiqilgandan keyin darhol emas, biroz kutib ko'tariladi. */
const RESTART_DELAY_MS = 1_000;

/**
 * Bitta Node process bitta yadroda ishlaydi - droplet'ning qolgan yadrolari
 * bo'sh turadi. Cluster shu bo'shliqni to'ldiradi: primary process bir nechta
 * worker fork qiladi, ular BITTA portni baham ko'radi (ulanishlarni operatsion
 * tizim taqsimlaydi), demak nginx yoki docker sozlamalari o'zgarmaydi.
 *
 * Uchta nozik joy hal qilingan:
 *  - `SCHEDULER_ENABLED` faqat birinchi worker'ga beriladi, shuning uchun
 *    `@Cron` job'lar (va superadmin seeding) baribir bir marta bajariladi;
 *  - DB pool chegarasi worker soniga bo'linadi (`pool-config.ts`), shuning
 *    uchun worker qo'shilishi Postgres `max_connections` ni bosib ketmaydi;
 *  - takror-takror yiqilish tsikli to'xtatiladi (yuqoridagi chegara).
 */
function startCluster() {
  const workers = resolveWorkerCount();
  const logger = new Logger('Cluster');

  // Bitta worker uchun fork qilishning ma'nosi yo'q - ortiqcha process va
  // ortiqcha xotira. Development'da ham shu yo'l ishlaydi.
  if (workers <= 1 || !cluster.isPrimary) {
    void bootstrap();
    return;
  }

  /*
    Round-robin'ni ochiq belgilaymiz. Windows'da Node standart holda
    `SCHED_NONE` ni tanlaydi: unda har bir worker portga o'zi bog'lanadi va
    ular bir-birining ustidan chiqib `EADDRINUSE` bilan yiqiladi. `SCHED_RR`
    da esa portni faqat primary tinglaydi va ulanishlarni o'zi taqsimlaydi —
    xatti-harakat barcha platformalarda bir xil bo'ladi.
  */
  cluster.schedulingPolicy = cluster.SCHED_RR;

  logger.log(`${workers} ta worker ishga tushirilmoqda`);

  /*
    Qaysi worker cron egasi ekanini o'zimiz yozib boramiz: `worker.process`
    oddiy ChildProcess bo'lgani uchun unga berilgan env'ni qaytarib o'qib
    bo'lmaydi, worker yiqilgandan keyin esa aynan shu ma'lumot kerak.
  */
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

    // SIGTERM/SIGINT - bu rejali to'xtatish (deploy, `docker stop`).
    // Bunda qayta ko'tarish process'ning o'chishiga xalaqit beradi.
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

    // Yiqilgan worker cron egasi bo'lsa, o'rniga kelgani ham cron egasi
    // bo'lishi kerak - aks holda rejalashtirilgan ishlar butunlay to'xtaydi.
    /*
      Taymer ATAYLAB `unref()` qilinmaydi. Barcha worker'lar bir vaqtda
      yiqilsa, primary'ni tirik ushlab turadigan boshqa hech narsa qolmaydi:
      `unref()` bilan u kutish tugashini kutmasdan jimgina chiqib ketardi va
      vaqtinchalik nosozlik doimiy uzilishga aylanardi.
    */
    setTimeout(() => {
      if (!shuttingDown) spawn(wasScheduler);
    }, RESTART_DELAY_MS);
  });

  /*
    `docker stop` faqat PID 1 ga (primary) signal yuboradi. Uni worker'larga
    o'zimiz uzatmasak, ular 10 soniyadan keyin SIGKILL bilan majburan
    o'ldiriladi va `enableShutdownHooks` ishlamay qoladi.
  */
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
