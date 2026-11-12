import * as fs from "fs-extra";
import * as path from "path";
import { spawn } from "child_process";
import { logger } from "./logger";
import { GitLabMRDetails } from "./gitlab";
import { withRetry } from "./retry";

export async function generateReview(
  mrId: number,
  details: GitLabMRDetails,
  diff: string,
  repoPath: string,
  stateDir: string,
): Promise<string> {
  logger.info(`Generating AI review for MR !${mrId}...`);

  // Truncate diff if it's excessively large (e.g., > 100k characters)
  const MAX_DIFF_LENGTH = 100000;
  let finalDiff = diff;
  if (diff.length > MAX_DIFF_LENGTH) {
    logger.warn(
      `Diff for MR !${mrId} exceeds ${MAX_DIFF_LENGTH} chars. Truncating.`,
    );
    finalDiff =
      diff.substring(0, MAX_DIFF_LENGTH) +
      "\n\n[DIFF TRUNCATED DUE TO SIZE LIMIT]";
  }

  const prompt = `
You are an expert AI code reviewer. Your task is to review a GitLab Merge Request based strictly on the provided repository context and the MR diff.

# Repository Knowledge Base
The target repository is located at \`${repoPath}\`.
Use your file reading tools to read \`AGENTS.md\` and explore the \`.agents\` or \`graphify-out\` directories within this repository to understand the architectural conventions and rules before reviewing the diff.

# Merge Request Information
Title: ${details.title}
Description: ${details.description}
Source Branch: ${details.source_branch}
Target Branch: ${details.target_branch}

# Task
1. Classify the MR into EXACTLY ONE of the following types based on the title and diff:
   - "Feature": introduces new functionality.
   - "Bug Fix": resolves an existing defect.
   - "Unit Test": adds or modifies test coverage without changing production logic.

2. Generate a structured Markdown report. The report MUST contain the following common sections in order:
   - **MR Type Classification**
   - **Executive Summary**
   - **Key Changes**
   - **Potential Bugs**
   - **Security Concerns**
   - **Performance Concerns**
   - **Review Questions**

3. In addition to the common sections, include these specific sections based on the classification:
   - If "Feature": add "Design & Architecture Notes", "API or Contract Changes", "Missing Test Scenarios".
   - If "Bug Fix": add "Root Cause Assessment", "Fix Correctness", "Regression Risk", "Missing Test Coverage".
   - If "Unit Test": add "Coverage Assessment", "Test Quality & Assertions", "Missing Scenarios", "Test Maintainability".

4. For each finding, use EXACTLY this format:

    [SEVERITY: High|Medium|Low]
    File: <path>
    Issue: <short  title>
    Why it matters: <technical  explanation>
    Suggested fix: <specific  recommendation>

If no meaningful issues are found, reply exactly: "No significant issues found.".

Output ONLY the Markdown report. Do not include any other conversational text. Prioritize correctness over style.

# Git Diff
\`\`\`diff
${finalDiff}
\`\`\`
`;

  const promptsDir = path.join(stateDir, "prompts");
  await fs.ensureDir(promptsDir);
  const promptFile = path.join(promptsDir, `prompt-${mrId}-${Date.now()}.txt`);

  try {
    // Write prompt to file to bypass command line length limits
    // Write prompt to file just for debugging purposes (optional)
    await fs.writeFile(promptFile, prompt, "utf-8");
    const promptContent = await fs.readFile(promptFile, "utf-8");
    logger.debug(`Prompt written to ${promptFile}`);

    return await withRetry(
      () => {
        return new Promise<string>((resolve, reject) => {
          logger.info(`Invoking agy CLI for MR !${mrId}...`);

          // Timeout: kill the process if it takes longer than 20 minutes.
          // agy is a full agent that browses files, runs commands, and runs
          // tests — the example output shows 40+ tool-use steps.
          const TIMEOUT_MS = 20 * 60 * 1000;
          let timedOut = false;

          // Invoke agy via bash shell substitution — spawn() passes args
          // as raw argv entries which agy's Go flag parser can't handle
          // for large multi-line prompts.
          // --dangerously-skip-permissions: agy is an agent that reads files,
          //   runs commands, etc. Without this flag it hangs waiting for
          //   interactive permission approvals that never come.
          // --print-timeout: agy's own internal timeout (default 5m is too
          //   short for the full agentic review workflow).
          // const child = spawn("bash", [
          //   "-c",
          //   `agy --model gemini-3.1-pro --dangerously-skip-permissions --print-timeout 10m --print "$(< '${promptFile}')"`,
          // ]);
          const child = spawn(
            "agy",
            [
              "--model",
              "gemini-3.8-flash-high",
              "--dangerously-skip-permissions",
              "--add-dir",
              repoPath,
              "--print-timeout",
              "20m",
              "--print",
              promptContent,
            ],
            {
              // Pipes stdout to capture the markdown, but passes stderr to the parent terminal.
              // This satisfies agy's TUI detection logic and prevents pipe-clogging.
              stdio: ["ignore", "pipe", "inherit"],
              env: {
                ...process.env,
                TERM: "xterm-256color", // Forces agy to recognize a valid terminal footprint
                IO_NONINTERACTIVE: "true", // Hints to Go binaries to skip interactive prompts
              },
            },
          );

          const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
            logger.error(
              `agy CLI timed out after ${TIMEOUT_MS / 1000}s for MR !${mrId}`,
            );
          }, TIMEOUT_MS);

          let stdoutData = "";
          let stderrData = "";

          child.stdout.on("data", (chunk) => {
            stdoutData += chunk.toString();
          });

          // child.stderr.on("data", (chunk) => {
          //   const text = chunk.toString();
          //   stderrData += text;
          //   // Log stderr lines in real-time so the user can see progress
          //   for (const line of text
          //     .split("\n")
          //     .filter((l: string) => l.trim())) {
          //     logger.debug(`agy: ${line}`);
          //   }
          // });

          child.on("error", (err) => {
            clearTimeout(timer);
            logger.error(`Failed to start agy: ${err.message}`);
            reject(err);
          });

          child.on("close", (code) => {
            clearTimeout(timer);

            if (timedOut) {
              reject(new Error(`agy timed out after ${TIMEOUT_MS / 1000}s`));
              return;
            }

            if (code !== 0) {
              logger.error(`agy CLI exited with code ${code}`);
              reject(new Error(`agy exited with code ${code}: ${stderrData}`));
              return;
            }

            logger.info(`Successfully generated AI review for MR !${mrId}`);
            resolve(stdoutData);
          });
        });
      },
      2,
      2000,
      `agy CLI generation for MR !${mrId}`,
    );
  } catch (error: any) {
    logger.error(`AI Engine failed for MR !${mrId}: ${error.message}`);
    if (error.stdout) {
      logger.debug(`agy stdout: ${error.stdout}`);
    }
    if (error.stderr) {
      logger.debug(`agy stderr: ${error.stderr}`);
    }
    throw new Error(`AI Review Generation failed: ${error.message}`);
  } finally {
    // Cleanup prompt file
    try {
      await fs.remove(promptFile);
      logger.debug(`Cleaned up prompt file ${promptFile}`);
    } catch (e) {
      logger.warn(`Failed to remove prompt file ${promptFile}`);
    }
  }
}
