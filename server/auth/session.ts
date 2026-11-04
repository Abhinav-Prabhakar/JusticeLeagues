import { createHash, randomBytes } from "node:crypto";
import { newId, type Db } from "../db";

export const SESSION_COOKIE = "jl_session";
export const SESSION_DAYS = 30;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export interface SessionUser {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  bio: string;
  homeNeighborhood: string | null;
  causes: string[];
  createdAt: string;
}

/** Issue an opaque token; only its SHA-256 hash is stored at rest. */
export function createSession(db: Db, profileId: string): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600_000);
  db.prepare("INSERT INTO sessions (id, profile_id, token_hash, expires_at) VALUES (?, ?, ?, ?)").run(
    newId("ses"),
    profileId,
    hashToken(token),
    expiresAt.toISOString(),
  );
  return { token, expiresAt };
}

export function destroySession(db: Db, token: string): void {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

export function userForToken(db: Db, token: string | undefined): SessionUser | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT p.id, p.email, p.handle, p.display_name, p.bio, p.home_neighborhood, p.causes, p.created_at
         FROM sessions s
         JOIN profiles p ON p.id = s.profile_id
        WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), new Date().toISOString()) as
    | {
        id: string;
        email: string;
        handle: string;
        display_name: string;
        bio: string;
        home_neighborhood: string | null;
        causes: string;
        created_at: string;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio,
    homeNeighborhood: row.home_neighborhood,
    causes: JSON.parse(row.causes) as string[],
    createdAt: row.created_at,
  };
}

export function purgeExpiredSessions(db: Db): number {
  const result = db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
  return Number(result.changes);
}
