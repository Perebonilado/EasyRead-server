/* eslint-disable @typescript-eslint/require-await -- in-memory fakes stand in
   for models whose interface is Promise-shaped. */
import { DocumentListQuery } from './document-list.query';

/**
 * The library is a person's own documents. A school's document carries the
 * admin's user id, since the admin uploaded it, and must not show here or
 * count as "has uploaded something".
 */
function build() {
  const wheres: Record<string, unknown>[] = [];
  const documents = {
    async findAndCountAll(options: { where: Record<string, unknown> }) {
      wheres.push(options.where);
      return { rows: [], count: 0 };
    },
    async findOne(options: { where: Record<string, unknown> }) {
      wheres.push(options.where);
      return null;
    },
  };
  const query = new DocumentListQuery(
    documents as never,
    { findAll: async () => [] } as never,
    { findAll: async () => [] } as never,
    { findOne: async () => null } as never,
  );
  return { query, wheres };
}

describe("a person's own documents", () => {
  it("lists theirs and none of a school's", async () => {
    const { query, wheres } = build();
    await query.execute('u1', {});
    expect(wheres[0]).toMatchObject({
      userId: 'u1',
      institutionId: null,
      deletedAt: null,
    });
  });

  it("does not count a school's upload as something of their own", async () => {
    const { query, wheres } = build();
    await expect(query.hasAny('u1')).resolves.toBe(false);
    expect(wheres[0]).toMatchObject({
      userId: 'u1',
      institutionId: null,
      deletedAt: null,
    });
  });
});
