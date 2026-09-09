import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  pgEnum,
  uuid,
} from 'drizzle-orm/pg-core';

const companyStatus = pgEnum('company_status', ['active', 'inactive']);

export const companies = pgTable('companies', {
  id: uuid('id').defaultRandom().primaryKey(),

  name: varchar('name', { length: 255 }).notNull(),
  legalName: varchar('legal_name', { length: 255 }).notNull().unique(),

  taxId: varchar('taxId', { length: 255 }).notNull().unique(),

  email: varchar('email', { length: 255 }).unique(),
  phone: varchar('phone', { length: 30 }).unique(),
  website: varchar('website', { length: 255 }).unique(),

  zipcode: varchar('zipcode', { length: 100 }).notNull(),
  country: varchar('country', { length: 100 }).notNull(),
  state: varchar('state', { length: 100 }).notNull(),
  city: varchar('city', { length: 100 }).notNull(),
  district: varchar('district', { length: 100 }).notNull(),
  street: varchar('street', { length: 255 }).notNull(),
  number: varchar('number', { length: 20 }).notNull(),
  complement: varchar('complement', { length: 255 }),

  status: companyStatus('status').notNull(),

  notes: text('notes'),

  // users

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});
