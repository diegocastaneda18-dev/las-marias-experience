import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "path";
import { AppModule } from "./app.module";

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3003",
  "http://localhost:3004",
  "http://127.0.0.1:3004",
  "https://las-marias-experience-web.vercel.app"
];

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useStaticAssets(join(process.cwd(), "uploads"), { prefix: "/uploads/" });

  app.enableCors({
    origin: ALLOWED_ORIGINS,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "x-admin-password"],
    credentials: false
  });

  const port = Number(process.env.PORT) || 4000;
  await app.listen(port, "0.0.0.0");

  console.log(`Las Marías Experience API listening on port ${port}`);
  console.log(`Health check: http://localhost:${port}/api/health`);
}

bootstrap();
