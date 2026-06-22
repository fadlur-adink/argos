import { Config } from './config';
import { logger } from './logger';

/**
 * Sends a Markdown-formatted message to Telegram using the provided configuration.
 * Gracefully handles failures without throwing, so the pipeline isn't disrupted.
 */
export async function sendTelegramNotification(config: Config, message: string): Promise<void> {
  if (!config.telegram?.botToken || !config.telegram?.chatId) {
    logger.debug('Telegram notification skipped (not configured).');
    return;
  }

  try {
    logger.info('Sending Telegram notification...');
    const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
    
    // Use native fetch (available in Node.js 18+)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: config.telegram.chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Telegram API responded with ${response.status}: ${errorText}`);
      return;
    }

    logger.info('Telegram notification sent successfully.');
  } catch (error: any) {
    // We catch and log, but do not throw. 
    // Failure to notify should not mark the review itself as failed.
    logger.error(`Failed to send Telegram notification: ${error.message}`);
  }
}
