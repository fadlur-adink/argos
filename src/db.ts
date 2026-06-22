import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'node:path';
import fs from 'fs-extra';
import { logger } from './logger';

let db: Database<sqlite3.Database, sqlite3.Statement>;

export async function initDb(dbPath: string): Promise<Database<sqlite3.Database, sqlite3.Statement>> {
  logger.info(`Initializing database at ${dbPath}`);

  await fs.ensureDir(path.dirname(dbPath));

  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    logger.info('Running database schema migrations...');

    // Create reviews table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        mr_id INTEGER NOT NULL,
        commit_sha TEXT NOT NULL,
        status TEXT NOT NULL,
        report_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      )
    `);

    // Add unique constraint on project, MR, and commit to easily avoid duplicates
    await db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_mr_commit 
      ON reviews(project_name, mr_id, commit_sha)
    `);

    logger.info('Database schema successfully initialized.');
    return db;
  } catch (err: any) {
    logger.error(`Database initialization failed: ${err.message}`);
    throw err;
  }
}

export interface ReviewRecord {
  id: number;
  project_name: string;
  mr_id: number;
  commit_sha: string;
  status: string;
  report_path?: string;
  created_at: string;
  completed_at?: string;
}

export async function getReview(projectName: string, mrId: number, commitSha: string): Promise<ReviewRecord | undefined> {
  return await db.get<ReviewRecord>(
    `SELECT * FROM reviews WHERE project_name = ? AND mr_id = ? AND commit_sha = ?`,
    [projectName, mrId, commitSha]
  );
}

export async function insertReview(projectName: string, mrId: number, commitSha: string): Promise<number> {
  const result = await db.run(
    `INSERT INTO reviews (project_name, mr_id, commit_sha, status) VALUES (?, ?, ?, 'PENDING')`,
    [projectName, mrId, commitSha]
  );
  return result.lastID!;
}

export async function updateReviewStatus(id: number, status: string, reportPath?: string): Promise<void> {
  const completedAt = status === 'COMPLETED' || status === 'FAILED' ? new Date().toISOString() : null;
  await db.run(
    `UPDATE reviews SET status = ?, report_path = ?, completed_at = COALESCE(completed_at, ?) WHERE id = ?`,
    [status, reportPath || null, completedAt, id]
  );
}

export async function getAllReviews(): Promise<ReviewRecord[]> {
  return await db.all<ReviewRecord[]>(
    `SELECT * FROM reviews ORDER BY id DESC`
  );
}

export async function getReviewById(id: number): Promise<ReviewRecord | undefined> {
  return await db.get<ReviewRecord>(
    `SELECT * FROM reviews WHERE id = ?`,
    [id]
  );
}
