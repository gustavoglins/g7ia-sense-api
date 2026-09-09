import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DATABASE_CONNECTION } from './database-connection.js';
import * as authSchema from '../auth/schema.js';
import * as companiesSchema from '../companies/companies.schema.js';
import * as installationsSchema from '../installations/installations.schema.js';
import * as sectorsSchema from '../sectors/sectors.schema.js';
import * as devicesSchema from '../devices/devices.schema.js';
import * as telemetrySchema from '../telemetry/telemetry.schema.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: (configService: ConfigService) => {
        const pool = new Pool({
          connectionString: configService.getOrThrow('DATABASE_URL'),
        });
        return drizzle(pool, {
          schema: {
            ...authSchema,
            ...companiesSchema,
            ...installationsSchema,
            ...sectorsSchema,
            ...devicesSchema,
            ...telemetrySchema,
          },
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}
