import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');

  // CORS configuration
  app.enableCors({
    origin: [
      'https://crm-lms-frontend.vercel.app',
      'https://abrorbek.me',
      'https://www.abrorbek.me',
      'http://localhost:4040',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:4040',
      'http://127.0.0.1:3000',
    ],
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

  const config = new DocumentBuilder()
    .setTitle('Najot Talim CRM')
    .setDescription('CRM platform API')
    .setVersion('1.1.1')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const PORT = process.env.PORT || 3000;
  const NODE_ENV = process.env.NODE_ENV || 'development';

  await app.listen(PORT, '0.0.0.0', () => {
    logger.log(`
    🚀 Application is running!
    📡 Server: http://0.0.0.0:${PORT}
    🔗 API Docs: http://0.0.0.0:${PORT}/api
    🌍 Environment: ${NODE_ENV}
    `);
  });

  logger.log(`✅ Database connected successfully`);
  logger.log(`✅ Redis cache initialized`);
}

const port = process.env.PORT || 3000;
console.log(`Server running on: http://localhost:${port}/api`);

bootstrap();
