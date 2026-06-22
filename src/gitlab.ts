import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "./logger";
import { withRetry } from "./retry";

const execAsync = promisify(exec);

export interface GitLabMRDetails {
  title: string;
  description: string;
  source_branch: string;
  target_branch: string;
  author?: {
    name: string;
    username: string;
  };
  state: string;
  sha: string;
}

export async function verifyGlabAuth(): Promise<void> {
  try {
    logger.info("Verifying glab CLI authentication...");
    let output = "";
    try {
      const { stdout, stderr } = await execAsync(
        "glab auth status",
      );
      output = stdout + "\n" + stderr;
    } catch (e: any) {
      // glab returns exit code 1 if ANY host is unauthenticated, but we only need ONE to be.
      output = (e.stdout || "") + "\n" + (e.stderr || "");
    }

    if (output.includes("Logged in to") || output.includes("Token found")) {
      logger.info("glab CLI is authenticated for at least one host.");
    } else {
      logger.warn(
        "glab CLI might not be fully authenticated, check output: " + output,
      );
      throw new Error("No active GitLab token found.");
    }
  } catch (error: any) {
    logger.fatal(`glab CLI authentication failed: ${error.message}`);
    throw new Error(
      'glab CLI is not authenticated or not installed. Please run "glab auth login" or ensure it is in your PATH.',
    );
  }
}

export async function getMrDetails(
  localRepoPath: string,
  mrId: number,
): Promise<GitLabMRDetails> {
  try {
    logger.debug(`Fetching MR !${mrId} details from ${localRepoPath}...`);
    const { stdout } = await withRetry(
      () => execAsync(`glab mr view ${mrId} -F json`, { cwd: localRepoPath }),
      3,
      1000,
      `fetch MR !${mrId} details`
    );
    const details = JSON.parse(stdout) as GitLabMRDetails;
    return details;
  } catch (error: any) {
    logger.error(
      `Failed to fetch MR !${mrId} details in ${localRepoPath}: ${error.message}`,
    );
    throw new Error(`Failed to fetch GitLab MR details: ${error.message}`);
  }
}

export async function getMrDiff(
  localRepoPath: string,
  mrId: number,
): Promise<string> {
  try {
    logger.debug(`Fetching MR !${mrId} diff from ${localRepoPath}...`);
    const { stdout } = await withRetry(
      () => execAsync(`glab mr diff ${mrId}`, {
        cwd: localRepoPath,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large diffs
      }),
      3,
      1000,
      `fetch MR !${mrId} diff`
    );
    return stdout;
  } catch (error: any) {
    logger.error(
      `Failed to fetch MR !${mrId} diff in ${localRepoPath}: ${error.message}`,
    );
    throw new Error(`Failed to fetch GitLab MR diff: ${error.message}`);
  }
}
