import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs-extra';
import * as path from 'path';
import { logger } from './logger';

const execAsync = promisify(exec);

export async function createWorktree(localRepoPath: string, mrId: number, targetPath: string): Promise<void> {
  try {
    logger.info(`Fetching MR !${mrId} refs in ${localRepoPath}...`);
    // Fetch the MR head directly using Git (works for forks and internal branches)
    await execAsync(`git fetch origin refs/merge-requests/${mrId}/head`, { cwd: localRepoPath });
    
    logger.info(`Creating Git worktree at ${targetPath}...`);
    // Ensure parent directory exists
    await fs.ensureDir(path.dirname(targetPath));
    
    // Add worktree and checkout FETCH_HEAD
    // We use --detach because FETCH_HEAD is a commit SHA, not a local branch name
    await execAsync(`git worktree add --detach ${targetPath} FETCH_HEAD`, { cwd: localRepoPath });
    logger.info(`Successfully created Git worktree at ${targetPath}`);
  } catch (error: any) {
    logger.error(`Failed to create worktree for MR !${mrId}: ${error.message}`);
    throw new Error(`Failed to create Git worktree: ${error.message}`);
  }
}

export async function removeWorktree(localRepoPath: string, targetPath: string): Promise<void> {
  try {
    // Check if the directory exists before trying to remove
    if (await fs.pathExists(targetPath)) {
      logger.info(`Removing Git worktree at ${targetPath}...`);
      // Use --force to remove even if it has untracked files or detached HEAD
      await execAsync(`git worktree remove --force ${targetPath}`, { cwd: localRepoPath });
      logger.info(`Successfully removed Git worktree at ${targetPath}`);
    }
  } catch (error: any) {
    logger.error(`Failed to remove worktree at ${targetPath} via git: ${error.message}`);
    // Fallback: manually delete the directory if git worktree remove fails, 
    // then git worktree prune will clean up the administrative files later
    try {
       await fs.remove(targetPath);
       logger.info(`Manually removed directory at ${targetPath}`);
    } catch(err: any) {
       logger.error(`Failed to manually remove directory at ${targetPath}: ${err.message}`);
    }
  }
}

export async function cleanupOrphanedWorktrees(baseWorktreeDir: string, configuredReposPaths: string[]): Promise<void> {
  try {
    logger.info('Running cleanup of orphaned Git worktrees...');
    
    // 1. First, prune from all configured repos to clean up git's internal state
    // This removes administrative pointers to worktrees that no longer exist on disk
    for (const repoPath of configuredReposPaths) {
      if (await fs.pathExists(repoPath)) {
        try {
          await execAsync('git worktree prune', { cwd: repoPath });
        } catch (e: any) {
          logger.warn(`Failed to prune worktrees in ${repoPath}: ${e.message}`);
        }
      }
    }

    // 2. Then, remove any remaining directories in our state/worktrees folder
    if (await fs.pathExists(baseWorktreeDir)) {
      const items = await fs.readdir(baseWorktreeDir);
      for (const item of items) {
        const itemPath = path.join(baseWorktreeDir, item);
        const stat = await fs.stat(itemPath);
        if (stat.isDirectory()) {
          logger.warn(`Found orphaned worktree directory: ${itemPath}. Removing...`);
          // Note: since we prune afterwards, we can just delete the directory safely
          // Actually, we should prune again after deleting, but git handles missing dirs fine
          await fs.remove(itemPath);
        }
      }
      
      // Prune one more time just in case we deleted directories that git still tracked
      for (const repoPath of configuredReposPaths) {
        if (await fs.pathExists(repoPath)) {
          try {
            await execAsync('git worktree prune', { cwd: repoPath });
          } catch (e) {
            // ignore second prune errors
          }
        }
      }
    } else {
      await fs.ensureDir(baseWorktreeDir);
    }
    
    logger.info('Worktree cleanup completed.');
  } catch (error: any) {
    logger.error(`Failed to cleanup orphaned worktrees: ${error.message}`);
  }
}
