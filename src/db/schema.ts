import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const entityType = pgEnum("entity_type", [
  "person",
  "organization",
  "wallet",
  "location",
  "document",
  "other",
]);

export const reviewStatus = pgEnum("review_status", [
  "draft",
  "pending_review",
  "published",
  "rejected",
  "archived",
]);

export const evidenceVisibility = pgEnum("evidence_visibility", [
  "restricted",
  "redacted_public",
]);

export const evidenceStatus = pgEnum("evidence_status", [
  "pending_upload",
  "upload_url_failed",
  "uploaded",
  "pending_review",
  "approved",
  "rejected",
  "quarantined",
]);

export const evidenceStorageMode = pgEnum("evidence_storage_mode", [
  "private-ipfs",
  "encrypted-public-ipfs",
]);

export const caseRecords = pgTable(
  "cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    titleZh: varchar("title_zh", { length: 240 }).notNull(),
    titleEn: varchar("title_en", { length: 240 }).notNull(),
    summaryZh: text("summary_zh"),
    summaryEn: text("summary_en"),
    isPublic: boolean("is_public").notNull().default(false),
    status: reviewStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("cases_code_key").on(table.code)],
);

export const timelineEvents = pgTable(
  "timeline_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => caseRecords.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    titleZh: varchar("title_zh", { length: 240 }).notNull(),
    titleEn: varchar("title_en", { length: 240 }).notNull(),
    summaryZh: text("summary_zh"),
    summaryEn: text("summary_en"),
    isPublic: boolean("is_public").notNull().default(false),
    status: reviewStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("timeline_events_case_occurred_idx").on(table.caseId, table.occurredAt),
  ],
);

export const entities = pgTable(
  "entities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => caseRecords.id, { onDelete: "cascade" }),
    type: entityType("type").notNull(),
    label: varchar("label", { length: 240 }).notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    isPublic: boolean("is_public").notNull().default(false),
    status: reviewStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("entities_case_type_idx").on(table.caseId, table.type)],
);

export const entityRelations = pgTable(
  "entity_relations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => caseRecords.id, { onDelete: "cascade" }),
    fromEntityId: uuid("from_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    toEntityId: uuid("to_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    relationType: varchar("relation_type", { length: 80 }).notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    isPublic: boolean("is_public").notNull().default(false),
    status: reviewStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("entity_relations_case_idx").on(table.caseId),
    index("entity_relations_from_idx").on(table.fromEntityId),
    index("entity_relations_to_idx").on(table.toEntityId),
  ],
);

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => caseRecords.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id").references(() => entities.id, {
      onDelete: "set null",
    }),
    chain: varchar("chain", { length: 40 }).notNull(),
    address: varchar("address", { length: 255 }).notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    explorerUrl: text("explorer_url").notNull(),
    isPublic: boolean("is_public").notNull().default(false),
    status: reviewStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("wallets_chain_address_key").on(table.chain, table.address),
    index("wallets_case_idx").on(table.caseId),
  ],
);

export const evidenceItems = pgTable(
  "evidence_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => caseRecords.id, { onDelete: "restrict" }),
    submitterId: varchar("submitter_id", { length: 255 }).notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    description: text("description"),
    visibility: evidenceVisibility("visibility").notNull().default("restricted"),
    status: evidenceStatus("status").notNull().default("pending_upload"),
    reviewerId: varchar("reviewer_id", { length: 255 }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("evidence_items_case_status_idx").on(table.caseId, table.status),
    index("evidence_items_submitter_idx").on(table.submitterId),
  ],
);

export const evidenceFiles = pgTable(
  "evidence_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidenceItems.id, { onDelete: "cascade" }),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    storageFilename: varchar("storage_filename", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 128 }).notNull(),
    originalBytes: integer("original_bytes").notNull(),
    uploadBytes: integer("upload_bytes").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    pinataNetwork: varchar("pinata_network", { length: 16 }).notNull(),
    storageMode: evidenceStorageMode("storage_mode").notNull(),
    pinataFileId: varchar("pinata_file_id", { length: 255 }),
    cid: varchar("cid", { length: 255 }),
    encryptionAlgorithm: varchar("encryption_algorithm", { length: 64 }),
    encryptionIvBase64: text("encryption_iv_base64"),
    encryptedDekBase64: text("encrypted_dek_base64"),
    status: evidenceStatus("status").notNull().default("pending_upload"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("evidence_files_evidence_idx").on(table.evidenceId),
    uniqueIndex("evidence_files_cid_key").on(table.cid),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id").references(() => caseRecords.id, {
      onDelete: "set null",
    }),
    evidenceId: uuid("evidence_id").references(() => evidenceItems.id, {
      onDelete: "set null",
    }),
    actorId: varchar("actor_id", { length: 255 }).notNull(),
    action: varchar("action", { length: 160 }).notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_logs_case_created_idx").on(table.caseId, table.createdAt),
    index("audit_logs_evidence_created_idx").on(table.evidenceId, table.createdAt),
  ],
);
