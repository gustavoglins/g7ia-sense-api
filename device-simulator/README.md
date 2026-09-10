# Simulador de devices

Projeto independente que simula os três devices definidos em
`seed/company.example.json` da G7IA Sense API:

| Device           | Tipo | Serial           |
| ---------------- | ---- | ---------------- |
| Medidor inicial  | AC   | DEMO-G7I-001     |
| Medidor DC       | DC   | DEMO-G7I-DC-001  |
| Sensor ambiental | ENV  | DEMO-G7I-ENV-001 |

Ele não usa NestJS, Drizzle nem acessa o banco. Como devices IoT reais, cada
simulador conhece somente sua configuração, a URL da API e sua própria chave
WRITE. Os devices ligados enviam imediatamente e depois a cada 15 segundos.

## Preparar a API e a seed

Na pasta da API, aplique as migrações e execute novamente a seed. Ela preserva
o device AC existente e cria apenas os devices DC e ENV que estiverem faltando:

```powershell
npm run db:migrate
$env:SEED_ADMIN_PASSWORD = 'sua-senha-do-seed'
npm run db:seed
Remove-Item Env:SEED_ADMIN_PASSWORD
```

O seed imprime as chaves dos devices DC e ENV quando os cria. As três chaves
também podem ser consultadas em `GET /api/devices`, usando uma sessão autenticada;
copie o valor `apiKeys.write` correspondente a cada device.

## Configuração

Requer Node.js 20.6 ou superior. Dentro desta pasta, copie o exemplo:

```powershell
Copy-Item .env.example .env
```

Configure quais devices ficam ligados e suas respectivas chaves:

```env
API_URL=http://localhost:3000/api/telemetry

DEVICE_AC_ENABLED=true
DEVICE_AC_WRITE_API_KEY=g7_write_chave_do_medidor_ac

DEVICE_DC_ENABLED=true
DEVICE_DC_WRITE_API_KEY=g7_write_chave_do_medidor_dc

DEVICE_ENV_ENABLED=true
DEVICE_ENV_WRITE_API_KEY=g7_write_chave_do_sensor_ambiental
```

Cada flag aceita somente `true` ou `false`. Um device desligado não precisa ter
uma chave configurada. Para executar apenas AC e ENV, por exemplo:

```env
DEVICE_AC_ENABLED=true
DEVICE_DC_ENABLED=false
DEVICE_ENV_ENABLED=true
```

Por compatibilidade, quando `DEVICE_AC_ENABLED` não estiver definido, o AC fica
ligado e pode continuar usando a antiga variável `DEVICE_WRITE_API_KEY`. DC e
ENV ficam desligados enquanto suas flags não forem informadas.

## Execução

Com a API em execução:

```powershell
npm start
```

Use `Ctrl+C` para encerrar. Falhas de rede ou respostas HTTP de erro são
registradas sem mostrar as chaves, e somente o simulador afetado aguarda o
próximo intervalo para tentar novamente.

## Dados gerados

- AC: `v1`, `a1`, `fp1` e `rssi`.
- DC: `vdc1`, `cc1`, `vdc2`, `cc2`, `vdc3`, `cc3` e `rssi`.
- ENV: `temp`, `humidity`, `solar`, `light`, `wind`, `h2` e `rssi`.

Todos os valores são enviados como strings, conforme os schemas da API.

## Testes

```powershell
npm test
```

O projeto não possui dependências externas. A pasta pode ser movida para outro
repositório sem depender do código da API.
