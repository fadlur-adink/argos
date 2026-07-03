import { logger } from "./logger";
import { loadConfig } from "./config";
import { initDb, getReview, insertReview, updateReviewStatus } from "./db";
import { EventQueue } from "./queue";
import { startServer } from "./server";
import { MergeRequestEvent } from "./parser";
import { verifyGlabAuth, getMrDetails, getMrDiff } from "./gitlab";
import {
  createWorktree,
  removeWorktree,
  cleanupOrphanedWorktrees,
} from "./git";
import { generateReview } from "./engine";
import { sendTelegramNotification } from "./telegram";
import { sendEmailNotification } from "./email";
import { sendDesktopNotification } from "./notifier";
import fs from "fs-extra";
import * as path from "path";

async function bootstrap() {
  logger.info("Starting Argos");

  try {
    // 1. Load and validate configuration
    const config = await loadConfig();

    // 2. Initialize database
    await initDb(path.join(__dirname, "../state/agent.db"));

    // 3. Verify GitLab CLI Authentication
    await verifyGlabAuth();

    // 4. Cleanup any orphaned worktrees from previous crashes
    const baseWorktreeDir = path.join(__dirname, "../state/worktrees");
    const repoPaths = Object.values(config.repositories).map(
      (r) => r.localPath,
    );
    try {
      await cleanupOrphanedWorktrees(baseWorktreeDir, repoPaths);
    } catch (e: any) {
      logger.warn(
        `Failed to cleanup orphaned worktrees during startup: ${e.message}`,
      );
    }

    // 5. Initialize Event Queue
    const queue = new EventQueue(async (event: MergeRequestEvent) => {
      logger.info(
        `Started processing event for MR !${event.mrId} in project ${event.projectName}`,
      );

      const repoConfig = config.repositories[event.projectName];
      if (!repoConfig) {
        logger.warn(
          `Project ${event.projectName} not found in config. Skipping.`,
        );
        return;
      }

      const timestamp = Date.now();
      const worktreePath = path.join(
        baseWorktreeDir,
        `${event.projectName}-mr-${event.mrId}-${timestamp}`,
      );

      try {
        // Step 1: Get MR details
        const details = await getMrDetails(repoConfig.localPath, event.mrId);
        logger.info(
          `MR Title: ${details.title} (Source: ${details.source_branch}) (Commit: ${details.sha})`,
        );

        // Step 1.5: Deduplication check
        const existingReview = await getReview(
          event.projectName,
          event.mrId,
          details.sha,
        );

        let reviewId: number;
        if (existingReview) {
          if (!event.forceRetry && (existingReview.status === "COMPLETED" || existingReview.status === "PENDING")) {
            logger.info(
              `Review for MR !${event.mrId} at commit ${details.sha} is already ${existingReview.status}. Skipping.`,
            );
            return;
          }
          reviewId = existingReview.id;
          await updateReviewStatus(reviewId, "PENDING");
        } else {
          reviewId = await insertReview(
            event.projectName,
            event.mrId,
            details.sha,
          );
        }

        // Step 2: Create isolated worktree
        await createWorktree(repoConfig.localPath, event.mrId, worktreePath);

        // Step 3: Fetch Diff
        const diff = await getMrDiff(repoConfig.localPath, event.mrId);

        // Step 4: Run AI Review Engine
        // The agent will read its own context directly from the repository
        const report = await generateReview(
          event.mrId,
          details,
          diff,
          repoConfig.localPath,
          path.join(__dirname, "../state"),
        );

        // Step 5: Save the report
        const reportDir = path.join(__dirname, "../reviews", event.projectName);
        await fs.ensureDir(reportDir);
        const reportFilename = `mr-${event.mrId}-${details.sha}.md`;
        const reportPath = path.join(reportDir, reportFilename);

        await fs.writeFile(reportPath, report, "utf-8");
        logger.info(`Saved AI review report to ${reportPath}`);

        await updateReviewStatus(reviewId, "COMPLETED", reportPath);

        // Step 6: Send Telegram notification
        const telegramMessage = `*AI Review Completed* 🚀
*Project:* ${event.projectName}
*MR:* [!${event.mrId}](${event.mrUrl})
*Title:* ${details.title}
*Type:* AI Review Report
        
A new AI review report has been generated.
*Path:* \`${reportPath}\``;
        await sendTelegramNotification(config, telegramMessage);

        // Step 7: Send Email notification
        const emailSubject = `[AI Review] ${event.projectName} - MR !${event.mrId}: ${details.title}`;
        const emailMessage = `AI Review Completed

Project: ${event.projectName}
MR: !${event.mrId}
URL: ${event.mrUrl}
Title: ${details.title}

A new AI review report has been generated.
Path: ${reportPath}

Please check the report for detailed findings.`;
        await sendEmailNotification(config, emailSubject, emailMessage);

        // Step 8: Send Desktop Notification
        const desktopTitle = `AI Review: ${event.projectName} !${event.mrId}`;
        const desktopMessage = `Review complete for: ${details.title}\nClick to view report!`;
        const dashboardUrl = `${config.publicUrl}/?id=${reviewId}`; // Link to the new Web UI
        await sendDesktopNotification(
          desktopTitle,
          desktopMessage,
          dashboardUrl,
        );
      } catch (error: any) {
        logger.error(
          `Error during review of MR !${event.mrId}: ${error.message}`,
        );
        // If we fail mid-pipeline but have a reviewId, we could update it,
        // however we need the reviewId from inside the try block.
        // It's handled by updating the DB before exiting.
        try {
          const details = await getMrDetails(repoConfig.localPath, event.mrId);
          const existingReview = await getReview(
            event.projectName,
            event.mrId,
            details.sha,
          );
          if (existingReview && existingReview.status === "PENDING") {
            await updateReviewStatus(existingReview.id, "FAILED");
          }
        } catch (e) {
          // Ignore errors in failure handling
        }
      } finally {
        // Step 4: Always clean up the worktree
        await removeWorktree(repoConfig.localPath, worktreePath);
      }
    });

    // 6. Start HTTP Server
    startServer(config, queue);
  } catch (err: any) {
    logger.fatal(`Failed to start Argos: ${err.message}`);
    process.exit(1);
  }
}

// Start the application
bootstrap();
