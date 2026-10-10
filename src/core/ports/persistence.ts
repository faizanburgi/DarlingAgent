import type { PersistedApproval, PersistedArtifact, PersistedEvent, PersistedTask } from "../domain.js";

export interface VersionedRecord {
  id: string;
  revision: number;
}

export type CreateResult<T> =
  | { ok: true; record: T }
  | { ok: false; reason: "duplicate_id" };

export type UpdateResult<T> =
  | { ok: true; record: T }
  | { ok: false; reason: "not_found" | "revision_conflict" };

/**
 * A storage boundary only. Implementations own durability, serialization, and
 * transaction mechanics; the core owns no database or filesystem dependency.
 */
export interface VersionedRepository<T extends VersionedRecord> {
  get(id: string): Promise<T | undefined>;
  create(record: T): Promise<CreateResult<T>>;
  update(record: T, expectedRevision: number): Promise<UpdateResult<T>>;
}

export interface EventRepository extends VersionedRepository<PersistedEvent> {}
export interface TaskRepository extends VersionedRepository<PersistedTask> {}
export interface ApprovalRepository extends VersionedRepository<PersistedApproval> {}
export interface ArtifactMetadataRepository extends VersionedRepository<PersistedArtifact> {}
