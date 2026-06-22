import { logger } from './logger';
import { MergeRequestEvent } from './parser';

export type ProcessEventFn = (event: MergeRequestEvent) => Promise<void>;

export class EventQueue {
  private readonly queue: MergeRequestEvent[] = [];
  private isProcessing = false;
  private readonly processor: ProcessEventFn;

  constructor(processor: ProcessEventFn) {
    this.processor = processor;
  }

  public enqueue(event: MergeRequestEvent) {
    this.queue.push(event);
    logger.info(`Enqueued event for MR !${event.mrId} in project ${event.projectName}`);
    // Start processing asynchronously
    setImmediate(() => this.processNext());
  }

  private async processNext() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const event = this.queue.shift();
    if (!event) {
      this.isProcessing = false;
      return;
    }

    try {
      logger.info(`Processing event for MR !${event.mrId} in project ${event.projectName}`);
      await this.processor(event);
      logger.info(`Successfully processed event for MR !${event.mrId}`);
    } catch (error: any) {
      logger.error(`Error processing event for MR !${event.mrId}: ${error.message}`);
    } finally {
      this.isProcessing = false;
      // Process next item in the queue
      setImmediate(() => this.processNext());
    }
  }
}
