import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  // 2. CORS sozlamalari
  app.enableCors({
    origin: [
      'https://crm-lms-frontend.vercel.app',
      'https://abrorbek.me',
      'https://www.abrorbek.me',
      'http://localhost:4040',
      'http://localhost:5173'
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
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
    .addServer('https://abrorbek.me', 'Production server')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const PORT = process.env.PORT ?? 4040;
  await app.listen(PORT);

  console.log(`🚀 Server running on: http://localhost:${PORT}/api`);
}

bootstrap();
