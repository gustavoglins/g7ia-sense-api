import { relations } from 'drizzle-orm';
import {
  doublePrecision,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { companies } from '../companies/companies.schema.js';
import { sectors } from '../sectors/sectors.schema.js';

export const installationStatus = pgEnum('installation_status', [
  'active',
  'inactive',
]);

export const installations = pgTable(
  'installations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 255 }).notNull().unique(),
    description: varchar('description', { length: 255 }),

    zipcode: varchar('zipcode', { length: 100 }).notNull(),
    country: varchar('country', { length: 100 }).notNull(),
    state: varchar('state', { length: 100 }).notNull(),
    city: varchar('city', { length: 100 }).notNull(),
    district: varchar('district', { length: 100 }).notNull(),
    street: varchar('street', { length: 255 }).notNull(),
    number: varchar('number', { length: 20 }).notNull(),
    complement: varchar('complement', { length: 255 }),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),

    status: installationStatus('status').notNull(),

    notes: text('notes'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [index('installations_company_id_idx').on(table.companyId)],
);

export const installationsRelations = relations(
  installations,
  ({ one, many }) => ({
    sectors: many(sectors),
    company: one(companies, {
      fields: [installations.companyId],
      references: [companies.id],
    }),
  }),
);
