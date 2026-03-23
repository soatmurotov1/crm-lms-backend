import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const normalizeOrigin = (origin: string) => origin.replace(/\/+$/, '');

  const corsOrigins = (
    process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
      : ['http://localhost:5173', 'https://crm-lms-frontend.vercel.app']
  ).map(normalizeOrigin);

  const allowedOrigins = new Set(corsOrigins);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);
      callback(null, allowedOrigins.has(normalizedOrigin));
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Najot Talim Crm')
    .setDescription('CRM platform Api')
    .setVersion('1.1.1')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const PORT = process.env.PORT ?? 3000;
  await app.listen(PORT);
  console.log(`Server running on port ${PORT}`);
}

bootstrap();
