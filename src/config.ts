import { z } from "zod";
import fs from "fs-extra";
import path from "node:path";
import { logger } from "./logger";

export const RepositoryConfigSchema = z.object({
  projectId: z.number(),
  localPath: z.string().min(1, "localPath cannot be empty"),
});

export const EmailConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  secure: z.boolean().default(false),
  auth: z.object({
    user: z.string().min(1),
    pass: z.string().min(1),
  }),
  from: z.email(),
  to: z.array(z.email()).min(1),
});

export const ConfigSchema = z.object({
  port: z.number().default(8000),
  publicUrl: z.string().default("http://localhost:8000"),
  repositories: z.record(z.string(), RepositoryConfigSchema),
  telegram: z
    .object({
      botToken: z.string().optional().or(z.literal("")),
      chatId: z.string().optional().or(z.literal("")),
    })
    .optional(),
  email: EmailConfigSchema.optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
export type RepositoryConfig = z.infer<typeof RepositoryConfigSchema>;

const CONFIG_PATH = path.join(__dirname, "..", "config", "config.json");

export async function loadConfig(): Promise<Config> {
  logger.info(`Loading configuration from ${CONFIG_PATH}`);

  if (!(await fs.pathExists(CONFIG_PATH))) {
    const errorMsg = `Configuration file missing at ${CONFIG_PATH}. Please copy config/config.example.json to config/config.json and configure your repositories.`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  let rawConfig;
  try {
    rawConfig = await fs.readJson(CONFIG_PATH);
  } catch (err: any) {
    logger.error(`Failed to parse configuration JSON: ${err.message}`);
    throw new Error(`Invalid JSON in configuration file: ${err.message}`);
  }

  const parseResult = ConfigSchema.safeParse(rawConfig);
  if (!parseResult.success) {
    logger.error(
      `Configuration schema validation failed: ${parseResult.error.message}`,
    );
    throw new Error(`Configuration validation failed`);
  }

  const config = parseResult.data;

  // Validate that all local paths exist
  for (const [repoName, repoConfig] of Object.entries(config.repositories)) {
    if (!(await fs.pathExists(repoConfig.localPath))) {
      const errorMsg = `Repository ${repoName} is configured with localPath '${repoConfig.localPath}', but this directory does not exist on disk.`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  logger.info("Configuration successfully loaded and validated.");
  return config;
}
