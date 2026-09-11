import type { INestApplication } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { Auth } from 'better-auth';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SESSION_AUTH, WRITE_API_KEY } from './api-endpoint.decorator.js';
import { authPaths } from './auth.openapi.js';
import { apiSchemas } from './schemas.js';

export function createApiDocument(
  app: INestApplication,
  sessionCookieName: string,
) {
  const config = new DocumentBuilder()
    .setTitle('G7IA Sense API')
    .setDescription(
      [
        'Empresas, usuários, instalações, setores, dispositivos e telemetria IoT.',
        '**Sessão:** abra Autenticação → POST /api/auth/sign-in/username → Try it out. Informe seu username e senha. O navegador armazena o cookie HttpOnly e o envia nas demais chamadas. Use a mesma origem da API; o campo Authorize não cria cookies HttpOnly.',
        '**Permissões:** super_admin tem alcance global; admin gerencia a própria empresa; user consulta a própria empresa. Criar empresa exige super_admin.',
        '**Dispositivos IoT:** use Authorize → deviceWriteKey e informe a chave WRITE, sem prefixo. POST /api/telemetry exige x-api-key e dispensa login. READ ainda não autentica consultas.',
        '**Datas:** ISO 8601. Na telemetria, time é o instante da leitura e createdAt é o instante de armazenamento na API.',
        '**Exclusões:** DELETE remove os dados definitivamente e pode excluir registros vinculados em cascata, conforme cada operação.',
      ].join('\n\n'),
    )
    .setVersion('1.0.0')
    .setOpenAPIVersion('3.0.3')
    .addServer('/', 'Mesma origem da API')
    .addTag(
      'Autenticação',
      'Login por username, consulta da sessão e logout do Better Auth.',
    )
    .addTag('Empresas', 'Cadastro e gerenciamento das empresas.')
    .addTag('Usuários', 'Usuários, roles e credenciais da empresa.')
    .addTag('Instalações', 'Cada instalação pertence a uma empresa.')
    .addTag('Setores', 'Cada setor pertence a uma instalação.')
    .addTag(
      'Dispositivos',
      'Cada dispositivo pertence a um setor e possui chaves READ/WRITE.',
    )
    .addTag(
      'Telemetria',
      'Ingestão autenticada com a chave WRITE de um dispositivo AC, DC ou ENV.',
    )
    .addCookieAuth(
      sessionCookieName,
      {
        type: 'apiKey',
        in: 'cookie',
        description:
          'Cookie HttpOnly gerado pelo login. O navegador o envia automaticamente; autentique em POST /api/auth/sign-in/username.',
      },
      SESSION_AUTH,
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description:
          'Chave WRITE do dispositivo. Cole somente a chave, sem Bearer ou outro prefixo.',
      },
      WRITE_API_KEY,
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    autoTagControllers: false,
  });
  document.components ??= {};
  document.components.schemas = {
    ...document.components.schemas,
    ...apiSchemas,
  };
  document.paths = { ...document.paths, ...authPaths };
  return document;
}

export async function setupSwagger(app: INestApplication) {
  // Reflect Better Auth's actual cookie name, including the HTTPS prefix.
  const auth = app.get<AuthService<Auth>>(AuthService).instance;
  const context = await auth.$context;
  SwaggerModule.setup(
    'api/docs',
    app,
    () => createApiDocument(app, context.authCookies.sessionToken.name),
    {
      jsonDocumentUrl: 'api/docs-json',
      yamlDocumentUrl: 'api/docs-yaml',
      customSiteTitle: 'G7IA Sense — API',
      swaggerOptions: {
        withCredentials: true,
        persistAuthorization: false,
        docExpansion: 'none',
        displayRequestDuration: true,
        filter: true,
        tagsSorter: 'alpha',
        validatorUrl: null,
      },
    },
  );
}
