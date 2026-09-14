import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * One answered data request and the payload that answered it.
 * Deliberately not a BaseTable: the table has no created_at/updated_at/deleted_at.
 * Two properties of a row that the type cannot carry:
 *  - **Append-only, never deduplicated.** An identical `request` inserts a new row. Sharing
 *    one across callers would hand one caller's payload — computed under their entitlements
 *    — to another; Filters can dedupe (docs/adr/0007) only because they dedupe per owner,
 *    and there is no owner here to scope it to.
 *  - **The id is a bearer capability.** With no owner column, holding the id is the whole of
 *    the permission to read `data`, which is why it defaults to gen_random_uuid() — 122
 *    unstructured random bits — rather than the uuidv7() the rest of this schema uses.
 *
 * `data` holds the payload inline and is unbounded, so a find() pays for all of it.
 */
@Entity('data_requests')
export default class DataRequestEntity {
  @PrimaryColumn('uuid', {
    default: () => 'gen_random_uuid()',
  })
  id: string;

  @Column('jsonb', { nullable: false })
  request: object;

  @Column('jsonb', { nullable: false })
  data: object;
}
