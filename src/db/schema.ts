import {
  boolean,
  foreignKey,
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

export const signatureVisibility = pgEnum("signature_visibility", [
  "anonymous_public",
  "alias_public",
  "count_only",
]);

export const signatureStatus = pgEnum("signature_status", [
  "pending_review",
  "approved",
  "rejected",
  "revoked",
]);

export const organizationRole = pgEnum("organization_role", [
  "owner",
  "editor",
  "reviewer",
  "publisher",
]);

export const caseRole = pgEnum("case_role", [
  "owner",
  "editor",
  "reviewer",
  "viewer",
]);

export const caseWorkflowStatus = pgEnum("case_workflow_status", [
  "draft",
  "submitted",
  "triage",
  "needs_information",
  "under_review",
  "approved",
  "published",
  "rejected",
  "archived",
]);

export const caseVisibility = pgEnum("case_visibility", [
  "private",
  "organization",
  "unlisted",
  "public",
]);

export const caseSubmissionStatus = pgEnum("case_submission_status", [
  "submitted",
  "triage",
  "needs_information",
  "accepted",
  "rejected",
  "withdrawn",
]);

export const outboxStatus = pgEnum("outbox_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    createdBy: varchar("created_by", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("organizations_slug_key").on(table.slug)],
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 255 }).notNull(),
    role: organizationRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("organization_members_org_user_key").on(
      table.organizationId,
      table.userId,
    ),
    index("organization_members_user_idx").on(table.userId),
  ],
);

export const caseRecords = pgTable(
  "cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    createdBy: varchar("created_by", { length: 255 }).notNull(),
    code: varchar("code", { length: 64 }).notNull(),
    titleZh: varchar("title_zh", { length: 240 }).notNull(),
    titleEn: varchar("title_en", { length: 240 }).notNull(),
    summaryZh: text("summary_zh"),
    summaryEn: text("summary_en"),
    workflowNote: text("workflow_note"),
    isPublic: boolean("is_public").notNull().default(false),
    visibility: caseVisibility("visibility").notNull().default("private"),
    status: caseWorkflowStatus("status").notNull().default("draft"),
    currentPublishedVersion: integer("current_published_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("cases_code_key").on(table.code),
    index("cases_organization_status_idx").on(table.organizationId, table.status),
    index("cases_created_by_idx").on(table.createdBy),
  ],
);

export const casePublications = pgTable(
  "case_publications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => caseRecords.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    contentHash: varchar("content_hash", { length: 128 }).notNull(),
    publishedBy: varchar("published_by", { length: 255 }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("case_publications_case_version_key").on(table.caseId, table.version),
    index("case_publications_published_idx").on(table.publishedAt),
  ],
);

export const caseMembers = pgTable(
  "case_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => caseRecords.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 255 }).notNull(),
    role: caseRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("case_members_case_user_key").on(table.caseId, table.userId),
    index("case_members_user_idx").on(table.userId),
  ],
);

export const caseSubmissions = pgTable(
  "case_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submitterId: varchar("submitter_id", { length: 255 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 80 }),
    titleZh: varchar("title_zh", { length: 240 }).notNull(),
    titleEn: varchar("title_en", { length: 240 }),
    summaryZh: text("summary_zh").notNull(),
    summaryEn: text("summary_en"),
    jurisdiction: varchar("jurisdiction", { length: 120 }),
    incidentStartedAt: timestamp("incident_started_at", { withTimezone: true }),
    status: caseSubmissionStatus("status").notNull().default("submitted"),
    reviewNote: text("review_note"),
    reviewerId: varchar("reviewer_id", { length: 255 }),
    acceptedCaseId: uuid("accepted_case_id").references(() => caseRecords.id, {
      onDelete: "set null",
    }),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("case_submissions_submitter_created_idx").on(
      table.submitterId,
      table.createdAt,
    ),
    index("case_submissions_status_created_idx").on(table.status, table.createdAt),
    uniqueIndex("case_submissions_submitter_idempotency_key").on(
      table.submitterId,
      table.idempotencyKey,
    ),
  ],
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
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("entities_case_type_idx").on(table.caseId, table.type),
    uniqueIndex("entities_case_id_id_key").on(table.caseId, table.id),
  ],
);

export const entityRelations = pgTable(
  "entity_relations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => caseRecords.id, { onDelete: "cascade" }),
    fromEntityId: uuid("from_entity_id").notNull(),
    toEntityId: uuid("to_entity_id").notNull(),
    relationType: varchar("relation_type", { length: 80 }).notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    isPublic: boolean("is_public").notNull().default(false),
    status: reviewStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("entity_relations_case_idx").on(table.caseId),
    index("entity_relations_from_idx").on(table.fromEntityId),
    index("entity_relations_to_idx").on(table.toEntityId),
    foreignKey({
      columns: [table.caseId, table.fromEntityId],
      foreignColumns: [entities.caseId, entities.id],
      name: "entity_relations_case_from_entity_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.caseId, table.toEntityId],
      foreignColumns: [entities.caseId, entities.id],
      name: "entity_relations_case_to_entity_fk",
    }).onDelete("cascade"),
  ],
);

export const walletAssets = pgTable(
  "wallet_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chain: varchar("chain", { length: 40 }).notNull(),
    address: varchar("address", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("wallet_assets_chain_address_key").on(table.chain, table.address)],
);

export const caseWallets = pgTable(
  "case_wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => caseRecords.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => walletAssets.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id"),
    label: varchar("label", { length: 120 }).notNull(),
    explorerUrl: text("explorer_url").notNull(),
    isPublic: boolean("is_public").notNull().default(false),
    status: reviewStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("case_wallets_case_wallet_key").on(table.caseId, table.walletId),
    index("case_wallets_case_idx").on(table.caseId),
    foreignKey({
      columns: [table.caseId, table.entityId],
      foreignColumns: [entities.caseId, entities.id],
      name: "case_wallets_case_entity_fk",
    }).onDelete("restrict"),
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
    idempotencyKey: varchar("idempotency_key", { length: 80 }),
    title: varchar("title", { length: 240 }).notNull(),
    description: text("description"),
    publicTitle: varchar("public_title", { length: 240 }),
    publicDescription: text("public_description"),
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
    uniqueIndex("evidence_items_submitter_idempotency_key").on(
      table.submitterId,
      table.idempotencyKey,
    ),
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

export const victimSignatures = pgTable(
  "victim_signatures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => caseRecords.id, { onDelete: "restrict" }),
    signerId: varchar("signer_id", { length: 255 }).notNull(),
    alias: varchar("alias", { length: 48 }),
    visibility: signatureVisibility("visibility")
      .notNull()
      .default("anonymous_public"),
    status: signatureStatus("status").notNull().default("pending_review"),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
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
    uniqueIndex("victim_signatures_case_signer_key").on(
      table.caseId,
      table.signerId,
    ),
    index("victim_signatures_case_status_idx").on(table.caseId, table.status),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    caseId: uuid("case_id").references(() => caseRecords.id, {
      onDelete: "set null",
    }),
    evidenceId: uuid("evidence_id").references(() => evidenceItems.id, {
      onDelete: "set null",
    }),
    actorId: varchar("actor_id", { length: 255 }).notNull(),
    resourceType: varchar("resource_type", { length: 80 }),
    resourceId: uuid("resource_id"),
    requestId: varchar("request_id", { length: 120 }),
    action: varchar("action", { length: 160 }).notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_logs_case_created_idx").on(table.caseId, table.createdAt),
    index("audit_logs_evidence_created_idx").on(table.evidenceId, table.createdAt),
    index("audit_logs_resource_created_idx").on(
      table.resourceType,
      table.resourceId,
      table.createdAt,
    ),
  ],
);

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: varchar("key", { length: 128 }).primaryKey(),
    action: varchar("action", { length: 80 }).notNull(),
    subjectHash: varchar("subject_hash", { length: 64 }).notNull(),
    count: integer("count").notNull().default(1),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("rate_limit_buckets_expires_idx").on(table.expiresAt)],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: varchar("type", { length: 120 }).notNull(),
    aggregateType: varchar("aggregate_type", { length: 80 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: outboxStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("outbox_events_status_available_idx").on(table.status, table.availableAt)],
);
