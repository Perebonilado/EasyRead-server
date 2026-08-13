/**
 * The full EasyRead data model (technical design §2), adapted from the
 * document's Postgres/Prisma sketch to MySQL 8 + Sequelize.
 *
 * Deviations from the document, and why:
 *   - uuid v7 is generated in application code rather than by the database;
 *     MySQL has no native uuid7(). Ids stay time-ordered, which is what the
 *     document actually wanted them for.
 *   - `jsonb` becomes `JSON` (MySQL's native JSON type).
 *   - `document_chunks` carries embeddings for the MySQL vector adapter, since
 *     pgvector isn't available here. Same `VectorStoreProvider` port either way.
 *
 * Column names are snake_case because every model uses `underscored: true`.
 */
import { DataTypes, type ModelAttributeColumnOptions } from 'sequelize';
import type { Migration } from './umzug';

const TABLE_OPTS = { charset: 'utf8mb4' };
const fk = (table: string) => ({ model: table, key: 'id' });

const id: ModelAttributeColumnOptions = {
  type: DataTypes.UUID,
  primaryKey: true,
  allowNull: false,
};
const createdAt: ModelAttributeColumnOptions = {
  type: DataTypes.DATE,
  allowNull: false,
};
const updatedAt: ModelAttributeColumnOptions = {
  type: DataTypes.DATE,
  allowNull: false,
};
const userFk = (allowNull = false): ModelAttributeColumnOptions => ({
  type: DataTypes.UUID,
  allowNull,
  references: fk('users'),
  onUpdate: 'CASCADE',
  onDelete: 'CASCADE',
});
const documentFk = (): ModelAttributeColumnOptions => ({
  type: DataTypes.UUID,
  allowNull: false,
  references: fk('documents'),
  onUpdate: 'CASCADE',
  onDelete: 'CASCADE',
});

export const up: Migration = async ({ context: q }) => {
  // ── Identity ───────────────────────────────────────────────────────────────
  await q.createTable(
    'users',
    {
      id,
      email: { type: DataTypes.STRING(320), allowNull: false, unique: true },
      password_hash: { type: DataTypes.STRING(255), allowNull: true },
      google_id: { type: DataTypes.STRING(255), allowNull: true, unique: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      email_verified_at: { type: DataTypes.DATE, allowNull: true },
      default_level: {
        type: DataTypes.ENUM('standard', 'easiest'),
        allowNull: false,
        defaultValue: 'standard',
      },
      verification_token_hash: { type: DataTypes.STRING(255), allowNull: true },
      verification_token_expires: { type: DataTypes.DATE, allowNull: true },
      reset_token_hash: { type: DataTypes.STRING(255), allowNull: true },
      reset_token_expires: { type: DataTypes.DATE, allowNull: true },
      /** Bumped to revoke every outstanding refresh-token family at once. */
      token_version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      deleted_at: { type: DataTypes.DATE, allowNull: true },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    TABLE_OPTS,
  );
  await q.addIndex('users', ['verification_token_hash'], {
    name: 'users_verification_token',
  });
  await q.addIndex('users', ['reset_token_hash'], {
    name: 'users_reset_token',
  });

  /**
   * Refresh tokens are persisted so they can be rotated and, crucially, so
   * reuse of an already-rotated token can be detected — that's the signal a
   * token was stolen, and it revokes the whole family (technical design §3.1).
   */
  await q.createTable(
    'refresh_tokens',
    {
      id,
      user_id: userFk(),
      token_hash: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
      },
      family_id: { type: DataTypes.UUID, allowNull: false },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      revoked_at: { type: DataTypes.DATE, allowNull: true },
      replaced_by_id: { type: DataTypes.UUID, allowNull: true },
      user_agent: { type: DataTypes.STRING(512), allowNull: true },
      ip: { type: DataTypes.STRING(64), allowNull: true },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    TABLE_OPTS,
  );
  await q.addIndex('refresh_tokens', ['family_id'], {
    name: 'refresh_tokens_family',
  });
  await q.addIndex('refresh_tokens', ['user_id'], {
    name: 'refresh_tokens_user',
  });

  // ── Billing ────────────────────────────────────────────────────────────────
  await q.createTable(
    'subscriptions',
    {
      id,
      user_id: { ...userFk(), unique: true },
      provider: {
        type: DataTypes.ENUM('paystack'),
        allowNull: false,
        defaultValue: 'paystack',
      },
      plan_code: { type: DataTypes.STRING(64), allowNull: false },
      subscription_code: { type: DataTypes.STRING(128), allowNull: true },
      customer_code: { type: DataTypes.STRING(128), allowNull: true },
      status: {
        type: DataTypes.ENUM(
          'active',
          'non_renewing',
          'attention',
          'cancelled',
          'expired',
        ),
        allowNull: false,
      },
      current_period_end: { type: DataTypes.DATE, allowNull: true },
      /** Last webhook payload, kept for audit when reconciling with Paystack. */
      raw: { type: DataTypes.JSON, allowNull: true },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    TABLE_OPTS,
  );

  /**
   * Usage is checked-and-incremented atomically via INSERT … ON DUPLICATE KEY
   * UPDATE, rather than recomputed from source tables on every permission call.
   */
  await q.createTable(
    'usage_counters',
    {
      id,
      user_id: userFk(),
      /** 'YYYY-MM' for monthly metrics, 'YYYY-MM-DD' for daily ones. */
      period: { type: DataTypes.STRING(16), allowNull: false },
      metric: {
        type: DataTypes.ENUM(
          'documents_uploaded',
          'easiest_conversions',
          'highlight_actions',
        ),
        allowNull: false,
      },
      count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    TABLE_OPTS,
  );
  await q.addIndex('usage_counters', ['user_id', 'period', 'metric'], {
    name: 'usage_counters_unique',
    unique: true,
  });

  await q.createTable(
    'webhook_events',
    {
      id,
      provider: { type: DataTypes.STRING(32), allowNull: false },
      /** Provider's own event id — the idempotency key for redelivery. */
      external_id: { type: DataTypes.STRING(191), allowNull: false },
      event_type: { type: DataTypes.STRING(128), allowNull: false },
      payload: { type: DataTypes.JSON, allowNull: false },
      processed_at: { type: DataTypes.DATE, allowNull: true },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    TABLE_OPTS,
  );
  await q.addIndex('webhook_events', ['provider', 'external_id'], {
    name: 'webhook_events_unique',
    unique: true,
  });

  // ── Documents ──────────────────────────────────────────────────────────────
  await q.createTable(
    'documents',
    {
      id,
      user_id: userFk(),
      title: { type: DataTypes.STRING(512), allowNull: false },
      file_name: { type: DataTypes.STRING(512), allowNull: false },
      status: {
        type: DataTypes.ENUM('uploading', 'processing', 'ready', 'failed'),
        allowNull: false,
        defaultValue: 'uploading',
      },
      page_count: { type: DataTypes.INTEGER, allowNull: true },
      source_mime_type: { type: DataTypes.STRING(128), allowNull: false },
      size_bytes: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
      original_file_ref: { type: DataTypes.STRING(512), allowNull: true },
      canonical_pdf_ref: { type: DataTypes.STRING(512), allowNull: true },
      thumbnail_ref: { type: DataTypes.STRING(512), allowNull: true },
      /** Bumped if reprocessing ever changes content; stale jobs exit early. */
      content_version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      /** Set when >60% of pages extract empty — scanned PDFs, no OCR in v1. */
      simplification_unavailable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      failure_reason: { type: DataTypes.TEXT, allowNull: true },
      deleted_at: { type: DataTypes.DATE, allowNull: true },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    TABLE_OPTS,
  );
  // Drives the library list (technical design §2.3).
  await q.addIndex('documents', ['user_id', 'deleted_at', 'created_at'], {
    name: 'documents_library',
  });

  await q.createTable(
    'document_pages',
    {
      id,
      document_id: documentFk(),
      page_number: { type: DataTypes.INTEGER, allowNull: false },
      text: { type: DataTypes.TEXT('long'), allowNull: false },
      char_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_empty: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    TABLE_OPTS,
  );
  await q.addIndex('document_pages', ['document_id', 'page_number'], {
    name: 'document_pages_unique',
    unique: true,
  });

  await q.createTable(
    'document_summaries',
    {
      id,
      document_id: { ...documentFk(), unique: true },
      summary: { type: DataTypes.TEXT, allowNull: false },
      model: { type: DataTypes.STRING(128), allowNull: false },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    TABLE_OPTS,
  );

  await q.createTable(
    'simplified_pages',
    {
      id,
      document_id: documentFk(),
      page_number: { type: DataTypes.INTEGER, allowNull: false },
      level: { type: DataTypes.ENUM('standard', 'easiest'), allowNull: false },
      /** [{ type: 'headingOne'|'headingTwo'|'paragraph'|'bullet', text }] */
      blocks: { type: DataTypes.JSON, allowNull: true },
      status: {
        type: DataTypes.ENUM('pending', 'processing', 'done', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      model: { type: DataTypes.STRING(128), allowNull: true },
      tokens_in: { type: DataTypes.INTEGER, allowNull: true },
      tokens_out: { type: DataTypes.INTEGER, allowNull: true },
      error: { type: DataTypes.TEXT, allowNull: true },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    TABLE_OPTS,
  );
  await q.addIndex(
    'simplified_pages',
    ['document_id', 'page_number', 'level'],
    {
      name: 'simplified_pages_unique',
      unique: true,
    },
  );
  // Progress queries: "how many pages of this level are done?"
  await q.addIndex('simplified_pages', ['document_id', 'level', 'status'], {
    name: 'simplified_pages_progress',
  });

  await q.createTable(
    'topics',
    {
      id,
      document_id: documentFk(),
      title: { type: DataTypes.STRING(512), allowNull: false },
      short_description: { type: DataTypes.STRING(512), allowNull: true },
      start_page: { type: DataTypes.INTEGER, allowNull: false },
      end_page: { type: DataTypes.INTEGER, allowNull: false },
      order_index: { type: DataTypes.INTEGER, allowNull: false },
      /** Which extractor produced it, for later quality comparison. */
      source: {
        type: DataTypes.ENUM('outline_pass', 'page_tagging'),
        allowNull: false,
      },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    TABLE_OPTS,
  );
  await q.addIndex('topics', ['document_id', 'order_index'], {
    name: 'topics_order',
  });

  await q.createTable(
    'topic_read_states',
    {
      id,
      topic_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('topics'),
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      user_id: userFk(),
      read_at: { type: DataTypes.DATE, allowNull: false },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    TABLE_OPTS,
  );
  await q.addIndex('topic_read_states', ['topic_id', 'user_id'], {
    name: 'topic_read_states_unique',
    unique: true,
  });

  await q.createTable(
    'reading_positions',
    {
      id,
      document_id: documentFk(),
      user_id: userFk(),
      last_page: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      furthest_page: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      level: {
        type: DataTypes.ENUM('original', 'standard', 'easiest'),
        allowNull: false,
        defaultValue: 'standard',
      },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    TABLE_OPTS,
  );
  await q.addIndex('reading_positions', ['document_id', 'user_id'], {
    name: 'reading_positions_unique',
    unique: true,
  });

  await q.createTable(
    'exports',
    {
      id,
      document_id: documentFk(),
      level: { type: DataTypes.ENUM('standard', 'easiest'), allowNull: false },
      content_version: { type: DataTypes.INTEGER, allowNull: false },
      file_ref: { type: DataTypes.STRING(512), allowNull: true },
      watermarked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      status: {
        type: DataTypes.ENUM('processing', 'done', 'failed'),
        allowNull: false,
        defaultValue: 'processing',
      },
      error: { type: DataTypes.TEXT, allowNull: true },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    TABLE_OPTS,
  );
  await q.addIndex('exports', ['document_id', 'level', 'content_version'], {
    name: 'exports_unique',
    unique: true,
  });

  await q.createTable(
    'highlight_lookups',
    {
      id,
      document_id: documentFk(),
      user_id: userFk(),
      action: {
        type: DataTypes.ENUM('explain', 'simplify', 'define', 'visualize'),
        allowNull: false,
      },
      selection: { type: DataTypes.TEXT, allowNull: false },
      page_number: { type: DataTypes.INTEGER, allowNull: true },
      /** Markdown string for explain/simplify/define; image array for visualize. */
      answer: { type: DataTypes.JSON, allowNull: true },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    TABLE_OPTS,
  );
  await q.addIndex(
    'highlight_lookups',
    ['document_id', 'user_id', 'created_at'],
    {
      name: 'highlight_lookups_history',
    },
  );

  // ── Pipeline bookkeeping ───────────────────────────────────────────────────
  /**
   * The idempotency ledger. Every job's first action is to lock its row; a
   * `done` row means the job exits immediately (technical design §2.3).
   */
  await q.createTable(
    'pipeline_runs',
    {
      id,
      document_id: documentFk(),
      step: {
        type: DataTypes.ENUM(
          'convert',
          'extract',
          'summarize',
          'topics',
          'embed',
          'simplify_standard',
          'simplify_easiest',
          'export',
        ),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('queued', 'running', 'done', 'failed', 'skipped'),
        allowNull: false,
        defaultValue: 'queued',
      },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      started_at: { type: DataTypes.DATE, allowNull: true },
      finished_at: { type: DataTypes.DATE, allowNull: true },
      error: { type: DataTypes.TEXT, allowNull: true },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    TABLE_OPTS,
  );
  await q.addIndex('pipeline_runs', ['document_id', 'step'], {
    name: 'pipeline_runs_unique',
    unique: true,
  });

  /**
   * Chunk embeddings. The MySQL vector adapter scans these by document and
   * ranks by cosine similarity in application code; the Pinecone adapter
   * ignores this table entirely. Same port either way (technical design §7).
   */
  await q.createTable(
    'document_chunks',
    {
      id,
      document_id: documentFk(),
      page_number: { type: DataTypes.INTEGER, allowNull: false },
      chunk_index: { type: DataTypes.INTEGER, allowNull: false },
      text: { type: DataTypes.TEXT, allowNull: false },
      /** Float array; JSON keeps the adapter honest without a vector type. */
      embedding: { type: DataTypes.JSON, allowNull: false },
      dimensions: { type: DataTypes.INTEGER, allowNull: false },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    TABLE_OPTS,
  );
  await q.addIndex(
    'document_chunks',
    ['document_id', 'page_number', 'chunk_index'],
    {
      name: 'document_chunks_unique',
      unique: true,
    },
  );

  /** Per-call ledger — the source for cost-per-document (technical design §6.2). */
  await q.createTable(
    'ai_call_logs',
    {
      id,
      document_id: { type: DataTypes.UUID, allowNull: true },
      task: { type: DataTypes.STRING(64), allowNull: false },
      model: { type: DataTypes.STRING(128), allowNull: false },
      prompt_id: { type: DataTypes.STRING(128), allowNull: true },
      prompt_version: { type: DataTypes.STRING(32), allowNull: true },
      tokens_in: { type: DataTypes.INTEGER, allowNull: true },
      tokens_out: { type: DataTypes.INTEGER, allowNull: true },
      latency_ms: { type: DataTypes.INTEGER, allowNull: true },
      cost_estimate: { type: DataTypes.DECIMAL(12, 6), allowNull: true },
      outcome: { type: DataTypes.STRING(32), allowNull: false },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    TABLE_OPTS,
  );
  await q.addIndex('ai_call_logs', ['document_id'], {
    name: 'ai_call_logs_document',
  });
};

export const down: Migration = async ({ context: q }) => {
  // Reverse creation order so foreign keys drop cleanly.
  for (const table of [
    'ai_call_logs',
    'document_chunks',
    'pipeline_runs',
    'highlight_lookups',
    'exports',
    'reading_positions',
    'topic_read_states',
    'topics',
    'simplified_pages',
    'document_summaries',
    'document_pages',
    'documents',
    'webhook_events',
    'usage_counters',
    'subscriptions',
    'refresh_tokens',
    'users',
  ]) {
    await q.dropTable(table);
  }
};
