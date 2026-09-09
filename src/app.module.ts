import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard, AuthModule } from '@thallesp/nestjs-better-auth';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from './database/database-connection.js';
import { DatabaseModule } from './database/database.module.js';
import { UsersModule } from './users/users.module.js';
import { CompaniesModule } from './companies/companies.module.js';
import { authOptions } from './auth/auth-options.js';
import { InstallationsModule } from './installations/installations.module.js';
import { SectorsModule } from './sectors/sectors.module.js';
import { DevicesModule } from './devices/devices.module.js';
import { TelemetryModule } from './telemetry/telemetry.module.js';

@Module({
  imports: [
    UsersModule,
    ConfigModule.forRoot(),
    AuthModule.forRootAsync({
      imports: [DatabaseModule, ConfigModule],
      useFactory: (database: NodePgDatabase, configService: ConfigService) => ({
        auth: betterAuth({
          ...authOptions,
          database: drizzleAdapter(database, {
            provider: 'pg',
          }),
          // trustedOrigins: [configService.getOrThrow('FRONTEND_URL')],
          trustedOrigins: ['*'],
        }),
      }),
      inject: [DATABASE_CONNECTION, ConfigService],
    }),
    CompaniesModule,
    InstallationsModule,
    SectorsModule,
    DevicesModule,
    TelemetryModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
