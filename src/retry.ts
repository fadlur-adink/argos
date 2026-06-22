import { logger } from './logger';

/**
 * Executes a promise-returning function with exponential backoff retry logic.
 *
 * @param fn The asynchronous function to execute.
 * @param maxRetries The maximum number of retry attempts.
 * @param baseDelayMs The base delay in milliseconds (doubles on each retry).
 * @param context A string describing the operation for logging purposes.
 * @returns The result of the function if successful.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number,
  context: string
): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      if (attempt > maxRetries) {
        logger.error(`[Retry] All ${maxRetries} attempts failed for '${context}'. Last error: ${error.message}`);
        throw error;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(`[Retry] Attempt ${attempt} failed for '${context}': ${error.message}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
