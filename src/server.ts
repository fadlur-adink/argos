import express from 'express';
import { logger } from './logger';
import { parseGitLabEmail, MergeRequestEvent } from './parser';
import { EventQueue } from './queue';
import { Config } from './config';
import { getAllReviews, getReviewById } from './db';
import fs from 'fs-extra';
import path from 'path';

export function startServer(config: Config, queue: EventQueue) {
  const app = express();
  
  // Parse JSON bodies
  app.use(express.json());

  app.get('/status', (req, res) => {
    return res.status(200).json({ status: 'ok', uptime: process.uptime() });
  });

  // Serve static UI
  const publicDir = path.join(__dirname, '../public');
  app.use(express.static(publicDir));

  // Get all reviews
  app.get('/api/reviews', async (req, res) => {
    try {
      const reviews = await getAllReviews();
      res.json(reviews);
    } catch (err: any) {
      logger.error(`Error fetching reviews: ${err.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get specific review content
  app.get('/api/reviews/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const review = await getReviewById(id);
      if (!review) return res.status(404).json({ error: 'Review not found' });

      if (!review.report_path || !(await fs.pathExists(review.report_path))) {
        return res.status(404).json({ error: 'Markdown report not found on disk' });
      }

      const markdown = await fs.readFile(review.report_path, 'utf-8');
      res.json({ ...review, markdown });
    } catch (err: any) {
      logger.error(`Error fetching review ${req.params.id}: ${err.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Retry a specific review
  app.post('/api/reviews/:id/retry', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const review = await getReviewById(id);
      if (!review) return res.status(404).json({ error: 'Review not found' });

      const event: MergeRequestEvent = {
        projectUrl: '',
        projectName: review.project_name,
        mrId: review.mr_id,
        mrTitle: 'Retried Review',
        mrUrl: '', 
        action: 'updated',
        forceRetry: true
      };

      queue.enqueue(event);
      res.json({ status: 'Retrying' });
    } catch (err: any) {
      logger.error(`Error retrying review ${req.params.id}: ${err.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/webhook', (req, res) => {
    const { subject, body } = req.body;
    
    if (!subject || !body) {
      logger.warn('Received webhook with missing subject or body');
      return res.status(400).json({ error: 'Missing subject or body' });
    }

    const event = parseGitLabEmail(subject, body);

    if (!event) {
      logger.warn('Failed to parse GitLab email payload into a recognized MR event');
      return res.status(422).json({ error: 'Unprocessable or unrecognized event format' });
    }

    // Check if the project is in our configuration
    if (!config.repositories[event.projectName]) {
      logger.warn(`Received event for unconfigured project: ${event.projectName}`);
      return res.status(422).json({ error: 'Project not configured' });
    }

    // Enqueue for processing
    queue.enqueue(event);

    // Respond immediately
    return res.status(202).json({ status: 'Accepted', event });
  });

  app.listen(config.port, () => {
    logger.info(`HTTP Server listening on port ${config.port}`);
  });
}
