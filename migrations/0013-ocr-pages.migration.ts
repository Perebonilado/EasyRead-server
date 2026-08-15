/**
 * OCR: where a page's text came from.
 *
 * A scanned page has no text layer, so its row used to stay empty forever and
 * the whole document fell back to a plain viewer. Now the pipeline reads such
 * pages with a vision model and writes the result into the same `text` column
 * every later step already consumes. `text_source` records the provenance so
 * the reader can be honest about it — "read from a scan by AI" is a different
 * promise than "this is the document's own text".
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

const STEPS_WITH_OCR = [
  'convert',
  'extract',
  'ocr',
  'summarize',
  'topics',
  'embed',
  'simplify_standard',
  'simplify_easiest',
  'export',
];

export const up: Migration = async ({ context }) => {
  await context.addColumn('document_pages', 'text_source', {
    type: DataTypes.ENUM('extracted', 'ocr'),
    allowNull: false,
    defaultValue: 'extracted',
  });
  // The ledger must be able to record the new step.
  await context.changeColumn('pipeline_runs', 'step', {
    type: DataTypes.ENUM(...STEPS_WITH_OCR),
    allowNull: false,
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('document_pages', 'text_source');
  await context.changeColumn('pipeline_runs', 'step', {
    type: DataTypes.ENUM(...STEPS_WITH_OCR.filter((step) => step !== 'ocr')),
    allowNull: false,
  });
};
