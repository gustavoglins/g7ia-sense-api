import type { PathsObject, ResponseObject } from '@nestjs/swagger';
import { SESSION_AUTH } from './api-endpoint.decorator.js';
import { ref } from './schemas.js';

const jsonResponse = (schema: string, description: string): ResponseObject => ({
  description,
  content: { 'application/json': { schema: ref(schema) } },
});

// Better Auth handles these routes as middleware, outside Nest controllers.
// Describe the application's session flow without registering duplicate handlers.
export const authPaths: PathsObject = {
  '/api/auth/sign-in/username': {
    post: {
      tags: ['Autenticação'],
      operationId: 'Auth_signInUsername',
      summary: 'Entrar com username e senha',
      description:
        'Use admin@empresa ou nome+sobrenome@empresa (+ literal). Execute aqui para receber o cookie HttpOnly de sessão; o navegador o envia nas próximas chamadas do Swagger na mesma origem. Login por e-mail e cadastro público estão desabilitados.',
      security: [],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: ref('SignInUsername') } },
      },
      responses: {
        '200': {
          ...jsonResponse('SignInResult', 'Login realizado.'),
          headers: {
            'Set-Cookie': {
              description:
                'Cookie assinado de sessão do Better Auth, armazenado pelo navegador.',
              schema: { type: 'string' },
            },
          },
        },
        '400': jsonResponse('AuthError', 'Corpo inválido.'),
        '401': jsonResponse('AuthError', 'Username ou senha incorretos.'),
        '403': jsonResponse(
          'AuthError',
          'Origem ou URL de retorno não permitida.',
        ),
        '422': jsonResponse(
          'AuthError',
          'Username fora do padrão ou tamanho permitido.',
        ),
        '429': jsonResponse(
          'AuthError',
          'Limite de tentativas de autenticação excedido.',
        ),
      },
    },
  },
  '/api/auth/get-session': {
    get: {
      tags: ['Autenticação'],
      operationId: 'Auth_getSession',
      summary: 'Consultar sessão do Better Auth',
      description:
        'Retorna sessão e usuário, ou null quando não há sessão válida. /api/users/session retorna somente o usuário público atual e exige sessão.',
      security: [{ [SESSION_AUTH]: [] }, {}],
      parameters: [
        {
          name: 'disableCookieCache',
          in: 'query',
          required: false,
          schema: { type: 'boolean' },
          description: 'Ignora o cache de sessão em cookie, quando habilitado.',
        },
        {
          name: 'disableRefresh',
          in: 'query',
          required: false,
          schema: { type: 'boolean' },
          description: 'Evita renovar a sessão nesta consulta.',
        },
      ],
      responses: {
        '200': jsonResponse('SessionResult', 'Sessão atual ou null.'),
      },
    },
  },
  '/api/auth/sign-out': {
    post: {
      tags: ['Autenticação'],
      operationId: 'Auth_signOut',
      summary: 'Encerrar sessão',
      description:
        'Revoga a sessão atual e remove seus cookies. Também pode ser chamado quando já não existe sessão.',
      security: [{ [SESSION_AUTH]: [] }, {}],
      responses: {
        '200': jsonResponse(
          'SignOutResult',
          'Sessão encerrada; cookies removidos.',
        ),
        '403': jsonResponse('AuthError', 'Origem não permitida.'),
      },
    },
  },
};
