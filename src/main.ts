import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupSwagger } from './documentation/swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  // app.enableCors({
  //   origin: ['http://localhost:8081', 'http://192.168.0.136:8081'],
  //   credentials: true,
  // });
  app.setGlobalPrefix('api');
  await setupSwagger(app);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
