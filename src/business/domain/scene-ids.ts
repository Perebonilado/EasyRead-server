/**
 * Names made into keys and ids, one way everywhere: the writer's names,
 * the artist's group ids, and the ids code gives what it draws itself.
 */

/**
 * A name reduced to what it is, for matching. The writer says "renal
 * pelvis" and the artist writes `<g id="renal-pelvis">` or `renalPelvis`,
 * and all three are the same part (242b871).
 */
export const idKey = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]/g, '');

/** A word reduced the same way, to find a phrase in its sentence. */
export const wordKey = idKey;

/**
 * The id a thing or a named group is written with: "renal pelvis" is
 * `renal-pelvis`. One function, so the id the artist is asked for, the id
 * its retry notes name and the writer's ids cannot drift apart.
 */
export const groupId = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
