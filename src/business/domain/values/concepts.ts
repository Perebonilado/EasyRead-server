/**
 * One concept, one spelling.
 *
 * The ledger and every lookup against it join on this normalised form, so
 * "Osmolality", "osmolality " and "OSMOLALITY" are the same entry. Exact
 * match only — no fuzzy matching in v1, because a false merge ("osmolality"
 * absorbing "osmolarity") silently marks something taught that never was.
 */
export function normaliseConcept(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/g, '')
    .trim()
    .slice(0, 300);
}
