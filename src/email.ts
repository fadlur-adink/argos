import * as nodemailer from 'nodemailer';
import { Config } from './config';
import { logger } from './logger';

/**
 * Sends an email notification using the provided configuration.
 * Gracefully handles failures without throwing, so the pipeline isn't disrupted.
 */
export async function sendEmailNotification(config: Config, subject: string, message: string): Promise<void> {
  if (!config.email) {
    logger.debug('Email notification skipped (not configured).');
    return;
  }

  const { host, port, secure, auth, from, to } = config.email;

  if (to.length === 0) {
    logger.debug('Email notification skipped (no recipients).');
    return;
  }

  try {
    logger.info(`Sending email notification to ${to.length} recipient(s)...`);
    
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user: auth.user,
        pass: auth.pass,
      },
    });

    const info = await transporter.sendMail({
      from,
      to: to.join(', '), // List of receivers
      subject,
      text: message, // plain text body
    });

    logger.info(`Email notification sent successfully: ${info.messageId}`);
  } catch (error: any) {
    // We catch and log, but do not throw.
    // Failure to notify should not mark the review itself as failed.
    logger.error(`Failed to send Email notification: ${error.message}`);
  }
}
