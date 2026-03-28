import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import * as net from 'net';
import { AppModule } from './app.module';

/** Check if a port is already in use before starting the server */
function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => { server.close(); resolve(false); });
    server.listen(port);
  });
}

async function bootstrap() {
  const port = Number(process.env.API_PORT || 3010);

  const inUse = await checkPort(port);
  if (inUse) {
    console.error(`\n❌ Port ${port} đang được sử dụng bởi process khác.`);
    console.error(`   Chạy lệnh sau để kill process trên port ${port}:`);
    console.error(`   Windows: netstat -ano | findstr :${port}  →  taskkill /PID <PID> /F`);
    console.error(`   Linux:   lsof -i :${port}  →  kill -9 <PID>\n`);
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3011',
    credentials: true,
  });

  await app.listen(port);
}

bootstrap();
