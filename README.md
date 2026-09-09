# Empresas e autenticação

O login usa username e senha, com o plugin `username` do Better Auth.

- Administrador automático: `admin@empresa`.
- Demais usuários: `nome+sobrenome@empresa` (o `+` é literal).
- O sufixo é gerado a partir de `legalName`, em minúsculas e sem acentos, espaços ou pontuação. `São José Ltda.` vira `saojoseltda`.
- O sufixo fica salvo em `companies.usernameSuffix`. Uma colisão após normalização retorna HTTP 409; não é acrescentado um número silenciosamente.
- A senha do administrador é informada em `adminPassword` ao cadastrar a empresa. Deve ter entre 8 e 128 caracteres; somente o hash é persistido.
- A empresa, o administrador e a credencial são criados em uma transação.
- Todo usuário tem uma empresa obrigatória. Constraints diferidas no PostgreSQL exigem o administrador da empresa e verificam o sufixo dos usuários no commit.
- O administrador automático nasce com role `admin`. As permissões usam a coluna `role`, não o username; outros usuários também podem ser administradores.

## Roles e permissões

| Operação | `super_admin` | `admin` | `user` |
| --- | --- | --- | --- |
| Consultar empresas e usuários | Todas as empresas | Própria empresa | Própria empresa |
| Criar empresa | Sim | Não | Não |
| Editar ou excluir empresa | Todas | Própria empresa | Não |
| Criar, editar ou excluir usuários | Todas as empresas | Própria empresa | Não |
| Atribuir `user` ou `admin` | Sim | Própria empresa | Não |
| Atribuir ou alterar uma conta `super_admin` | Sim | Não | Não |

O `super_admin` continua vinculado a uma empresa, mas tem alcance global. Um `admin` não pode editar, redefinir a senha ou excluir um `super_admin`, mesmo na própria empresa, nem excluir uma empresa que contenha um `super_admin`.

As permissões consultam a role atual no banco a cada operação. Alterar role ou senha pelas rotas administrativas revoga as sessões do usuário. O campo `role` é controlado pelo servidor no Better Auth; `/api/auth/update-user` está desabilitado para evitar alterações fora das rotas autorizadas. As operações pessoais de autenticação, como logout e troca da própria senha, continuam sob responsabilidade do Better Auth.

O administrador automático deve manter `admin` ou `super_admin` e só pode ser excluído junto com a empresa, preservando a regra de que nenhuma empresa existe sem esse usuário.

### Seed inicial: empresa completa, super_admin, instalação, setores e devices

O seed inicial funciona em um banco vazio e cria empresa, usuário `admin@empresa` com role `super_admin`, credencial com hash, uma instalação, seus setores e devices na mesma transação. É um comando local, sem endpoint público.

1. Configure `DATABASE_URL` no `.env`.
2. Ajuste os dados fictícios de `seed/company.example.json`, ou copie esse arquivo para um JSON com os dados da sua empresa. Todos os campos cadastrais estão no exemplo; a senha fica fora do JSON.
3. Aplique as migrações e execute o seed no PowerShell:

```powershell
npm run db:migrate
$env:SEED_ADMIN_PASSWORD = 'substitua-por-uma-senha-forte'
npm run db:seed
Remove-Item Env:SEED_ADMIN_PASSWORD
```

Para usar outro arquivo:

```powershell
npm run db:seed -- caminho/empresa.json
```

`db:seed` compila o projeto automaticamente e carrega `.env` quando disponível. Também é possível configurar `SEED_ADMIN_PASSWORD` no `.env` local. A senha precisa ter entre 8 e 128 caracteres e não é exibida pelo comando.

Com o exemplo fornecido, o login será `admin@g7ienergyltda`, usando a senha informada em `SEED_ADMIN_PASSWORD`. A saída mostra os IDs da empresa e da instalação, username, role e se os registros foram criados ou já existiam.

O bloco opcional `installation` no JSON configura a instalação inicial. Os campos de endereço e o status são herdados da empresa quando omitidos nesse bloco. Sem o bloco, o nome padrão é `Matriz - <sufixo da empresa>`. A instalação sempre pertence à empresa do seed, independentemente de campos de vínculo enviados no JSON.

```json
{
  "installation": {
    "name": "Matriz - G7I Energy",
    "description": "Instalação inicial da empresa",
    "status": "active"
  }
}
```

Se a empresa e o super_admin já foram criados por uma versão anterior do seed, executar novamente cria apenas a instalação e os setores que faltarem. A instalação é reconhecida pelo nome: mantendo esse nome, novas execuções preservam seus dados. Um nome pertencente a outra empresa é rejeitado, sem alterações. Alterar o nome no JSON representa outra instalação.

Configure um ou mais setores no bloco `installation.sectors`:

```json
{
  "installation": {
    "name": "Matriz - G7I Energy",
    "sectors": [
      {
        "name": "Geral - G7I Energy",
        "description": "Setor inicial da instalação matriz",
        "status": "active"
      }
    ]
  }
}
```

Sem `sectors`, o seed cria `Geral - <sufixo da empresa>` com o status da instalação. Se informada, a lista deve ser não vazia, com nomes distintos e status `active` ou `inactive` (padrão `active` para setores explicitamente configurados). O vínculo com a instalação é atribuído pelo seed.

Setores são reconhecidos pelo nome e não são sobrescritos ou excluídos ao repetir o seed. Se só faltarem setores, apenas eles serão criados, preservando empresa, usuário, senha e instalação. Um nome que já pertença a outra instalação provoca rollback de toda a execução. A saída informa o ID e se cada setor foi criado ou já existia.

A repetição usa `taxId` para reconhecer a empresa. Se o usuário `super_admin` e sua credencial já estiverem presentes e o sufixo corresponder, não altera registros nem redefine senha. Se a empresa existente estiver incompleta ou tiver apenas um `admin`, o comando falha sem modificar dados; utilize a promoção explícita abaixo quando apropriado. Colisões com outros registros também provocam rollback. Execuções simultâneas do seed são serializadas no banco.

Cada setor pode configurar uma lista não vazia de `devices`:

```json
{
  "installation": {
    "name": "Matriz - G7I Energy",
    "sectors": [
      {
        "name": "Geral - G7I Energy",
        "devices": [
          {
            "name": "Medidor inicial",
            "devicesType": "ac",
            "serialNumber": "DEMO-G7I-001",
            "version": "1.0",
            "status": "active"
          }
        ]
      }
    ]
  }
}
```

Sem `devices`, o seed cria um `Device inicial` do tipo `ac` em cada setor, com o status do setor. Devices explicitamente configurados no JSON devem informar `devicesType`. Os dados do exemplo são demonstrativos; o seed apenas cadastra registros, sem conectar equipamentos físicos. `serialNumber`, `version` e `macAddress` são opcionais.

Devices do seed são reconhecidos por **setor + nome**. Reexecutar cria apenas os faltantes e preserva os dados existentes. Nomes iguais em setores diferentes são permitidos; nomes repetidos na mesma lista são rejeitados. Se já houver vários devices com o mesmo nome no mesmo setor, o seed falha por ambiguidade sem salvar alterações. Alterar o nome no JSON representa outro device. O `sectorId` é sempre atribuído pelo seed, e a saída informa IDs e quais devices foram criados.

### Promover uma conta existente a super_admin

Após aplicar as migrações, um operador com acesso ao servidor pode promover uma **conta existente**:

```sh
npm run roles:promote -- admin@empresa
```

O comando carrega `.env` quando disponível, usa `DATABASE_URL`, promove apenas o username informado e revoga suas sessões. Faça login novamente. Não existe promoção automática do primeiro usuário nem endpoint público de promoção. Para uma instalação nova, use o seed inicial acima.

### Rotas administrativas

- `GET /api/companies` e `GET /api/users`: retornam apenas os registros permitidos para a role.
- `GET /api/companies/:id` e `GET /api/users/:id`: consultam um registro dentro do escopo permitido.
- `PATCH /api/companies/:id`: edita os dados cadastrais; `usernameSuffix` permanece imutável.
- `PATCH /api/users/:id`: aceita `name`, `role` e/ou `password`.
- `DELETE /api/users/:id`: exclui o usuário permitido, suas credenciais e sessões.
- `DELETE /api/companies/:id`: exclui a empresa, seus usuários, credenciais e sessões na mesma transação.
- `GET /api/users/session`: retorna o usuário atual, incluindo a role consultada no banco.

Exemplo de alteração de role:

```json
{ "role": "admin" }
```

## Cadastrar empresa

`POST /api/companies` exige uma sessão de `super_admin`. Não recebe username, role nem ID de usuário; o administrador com role `admin` é gerado no servidor.

```json
{
  "name": "São José",
  "legalName": "São José Ltda",
  "taxId": "12345678000190",
  "zipcode": "01001000",
  "country": "Brasil",
  "state": "SP",
  "city": "São Paulo",
  "district": "Centro",
  "street": "Rua Exemplo",
  "number": "10",
  "adminPassword": "substitua-por-uma-senha-forte"
}
```

Retorna `{ company, admin }`, com `admin.username = "admin@saojoseltda"`. Não retorna senha ou hash. O status padrão da empresa é `active`.

## Entrar

`POST /api/auth/sign-in/username`:

```json
{
  "username": "admin@saojoseltda",
  "password": "substitua-por-uma-senha-forte"
}
```

O Better Auth retorna a sessão e configura o cookie. `/sign-in/email` e `/sign-up/email` estão desabilitados. O campo interno `email` é mantido por compatibilidade com o Better Auth e recebe um endereço único em `users.invalid`, que não é usado para envio de mensagens. Recuperação por e-mail não está implementada.

Se usar o cliente do Better Auth, habilite `usernameClient()` de `better-auth/client/plugins` e use `authClient.signIn.username({ username, password })`.

## Cadastrar outro usuário

Com o cookie da sessão do administrador, envie `POST /api/users`:

```json
{
  "name": "Ana Silva",
  "username": "ana+silva@saojoseltda",
  "password": "outra-senha-forte"
}
```

A role padrão é `user`. Um administrador pode enviar `"role": "admin"` para criar outro administrador da própria empresa. Para `admin`, a empresa é obtida da conta autenticada e um `companyId` diferente é rejeitado. Um `super_admin` pode enviar `companyId` para escolher outra empresa e também pode atribuir `super_admin`. O username deve sempre usar o sufixo da empresa escolhida e permanece imutável.

## Instalações da empresa

Uma empresa pode ter várias instalações. Cada instalação tem um `companyId` obrigatório, com chave estrangeira e índice. As relações Drizzle são `companies.installations` e `installations.company`. A exclusão da empresa também exclui suas instalações (`ON DELETE CASCADE`).

As rotas exigem autenticação:

- `POST /api/installations`: `admin` cadastra na própria empresa; `super_admin` pode informar `companyId` para escolher qualquer empresa.
- `GET /api/installations`: lista todas para `super_admin` e apenas as da própria empresa para `admin` e `user`.
- `GET /api/installations/:id`: consulta uma instalação dentro do escopo permitido.
- `PATCH /api/installations/:id`: `admin` edita na própria empresa; `super_admin` edita em qualquer empresa. O vínculo `companyId` é imutável nessa rota.
- `DELETE /api/installations/:id`: exclusão conforme o mesmo escopo de administração.

O perfil `user` não pode criar, editar ou excluir instalações. IDs nas URLs são UUIDs.

Exemplo de cadastro com a sessão do administrador da empresa:

```json
{
  "name": "Unidade Centro",
  "description": "Instalação principal",
  "zipcode": "01001000",
  "country": "Brasil",
  "state": "SP",
  "city": "São Paulo",
  "district": "Centro",
  "street": "Rua Exemplo",
  "number": "100",
  "latitude": -23.55,
  "longitude": -46.63,
  "status": "active"
}
```

O `companyId` omitido é obtido da conta autenticada. Latitude deve estar entre -90 e 90; longitude, entre -180 e 180. O status padrão no cadastro é `active`. O nome mantém a restrição de unicidade do schema original.

Consultas internas com o Drizzle (aplique o escopo de autorização antes de consultar):

```ts
await db.query.companies.findFirst({
  where: eq(companies.id, companyId),
  with: { installations: true },
});

await db.query.installations.findFirst({
  where: eq(installations.id, installationId),
  with: { company: true },
});
```

A migração `0007_company_installations` cria a tabela, o enum `installation_status`, a chave estrangeira e o índice. Aplique com `npm run db:migrate`.

## Setores da instalação

Uma instalação pode ter vários setores. Cada setor tem um `installationId` obrigatório, com chave estrangeira e índice. As relações Drizzle são `installations.sectors` e `sectors.installation`. Não há `companyId` duplicado no setor: sua empresa é determinada pela instalação.

As rotas exigem autenticação:

- `POST /api/sectors`: cadastra um setor em uma instalação existente.
- `GET /api/sectors` e `GET /api/sectors/:id`: consultam os setores permitidos para a conta.
- `PATCH /api/sectors/:id`: aceita `name`, `description` e/ou `status`. O vínculo `installationId` não pode ser alterado nessa rota.
- `DELETE /api/sectors/:id`: exclui um setor.

`super_admin` consulta e gerencia todos os setores; `admin` consulta e gerencia os setores das instalações da própria empresa; `user` apenas consulta os setores da própria empresa. IDs nas URLs são UUIDs. O nome mantém a unicidade definida no schema original.

Exemplo de `POST /api/sectors`:

```json
{
  "installationId": "UUID-da-instalacao",
  "name": "Produção",
  "description": "Área de produção da unidade",
  "status": "active"
}
```

O status padrão no cadastro é `active`. Excluir uma instalação remove seus setores em cascata; excluir a empresa remove suas instalações e, consequentemente, seus setores.

Consultas internas com o Drizzle, após verificar o escopo de autorização:

```ts
await db.query.installations.findFirst({
  where: eq(installations.id, installationId),
  with: { sectors: true },
});

await db.query.sectors.findFirst({
  where: eq(sectors.id, sectorId),
  with: { installation: true },
});
```

A migração `0008_installation_sectors` cria a tabela, o enum, a chave estrangeira e o índice. Aplique com `npm run db:migrate`.

## Devices do setor

Um setor pode ter vários devices. Cada device tem um `sectorId` obrigatório, com chave estrangeira e índice. As relações Drizzle são `sectors.devices` e `devices.sector`. A empresa é obtida pela cadeia device → setor → instalação → empresa, sem duplicar `companyId` ou `installationId` no device.

Rotas autenticadas:

- `POST /api/devices`: cadastra um device em um setor existente.
- `GET /api/devices` e `GET /api/devices/:id`: consultam os devices permitidos para a conta.
- `PATCH /api/devices/:id`: aceita `name`, `devicesType`, `serialNumber`, `version`, `macAddress` e/ou `status`. O vínculo `sectorId` não pode ser alterado nessa rota.
- `DELETE /api/devices/:id`: exclui um device.

`super_admin` consulta e gerencia todos; `admin` consulta e gerencia apenas devices da própria empresa; `user` apenas consulta devices da própria empresa. IDs nas URLs são UUIDs.

Exemplo de `POST /api/devices`:

```json
{
  "sectorId": "UUID-do-setor",
  "name": "Medidor principal",
  "devicesType": "ac",
  "serialNumber": "SN-001",
  "version": "1.0",
  "macAddress": "00:11:22:33:44:55",
  "status": "active"
}
```

`name`, `sectorId` e `devicesType` são obrigatórios. Os tipos permitidos são `ac`, `dc`, `env`, `act` e `adv`; não há tipo padrão na API ou no banco. O status padrão é `active`; `serialNumber`, `version` e `macAddress` são opcionais. Excluir um setor remove seus devices em cascata, inclusive quando a exclusão começa pela instalação ou pela empresa.

A migração `0010_required_device_type` adiciona a coluna `devices_type` obrigatória. Se a tabela já contiver devices, adapte essa migração antes de executá-la: adicione a coluna permitindo nulos, preencha cada registro com o tipo correto e então aplique `SET NOT NULL`. Nenhum tipo é inferido automaticamente para equipamentos existentes. O seed preserva registros existentes e não faz esse preenchimento retroativo.

Consultas internas com o Drizzle, após verificar o escopo de autorização:

```ts
await db.query.sectors.findFirst({
  where: eq(sectors.id, sectorId),
  with: { devices: true },
});

await db.query.devices.findFirst({
  where: eq(devices.id, deviceId),
  with: { sector: true },
});
```

A migração `0009_sector_devices` cria a tabela, os enums declarados no schema, a chave estrangeira e o índice. Aplique com `npm run db:migrate`.

## Migrações

As migrações estão em `drizzle/`. Com `DATABASE_URL` disponível no ambiente:

```sh
npx drizzle-kit migrate
```

As migrações `0002` e `0003` exigem empresa e username obrigatórios. Se houver registros anteriores, prepare o preenchimento de `company_id`, `username_suffix` e `username`, e a criação do administrador de cada empresa antes de aplicar essas constraints. Não existe backfill automático: o sistema não inventa vínculos ou senhas de usuários existentes. A migração `0004` contém as constraints diferidas e deve ser aplicada por migração; `drizzle-kit push` sozinho não as instala.

A migração `0005` adiciona `role`, atribui `admin` aos usuários automáticos existentes (`admin@...`) e `user` aos demais. Nenhum usuário recebe `super_admin` automaticamente. A migração `0006` impede rebaixar o administrador automático para `user` no banco.

## Validação

```sh
npm run build
npm run lint
npx vitest run src/auth/auth-options.spec.ts
```

Os testes PostgreSQL exigem um banco **vazio e descartável**, indicado explicitamente em `DATABASE_TEST_URL`. Eles aplicam todas as migrações e deixam os dados de teste nesse banco. Nunca usam `DATABASE_URL`.

```powershell
$env:DATABASE_TEST_URL = 'postgresql://usuario:senha@localhost:5432/banco_descartavel'
npx vitest run src/auth/auth-options.spec.ts src/companies/companies.integration.spec.ts
```

Os testes cobrem login, criação atômica, escopo de leitura, operações administrativas, tentativas de elevação de privilégio e revogação de sessões.
