import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3011',
    credentials: true,
  });

  const port = process.env.API_PORT || 3010;
  await app.listen(port);
}

bootstrap();
