// Remove the explicit import; types should be global via worker-configuration.d.ts
// import type { Message, MessageBatch, R2PutOptions } from '@cloudflare/workers-types';
import type { R2MessageObject, PersistenceQueueMessage } from '../types';
import {
  sendEventBatch,
  trackMessagePersistedR2,
  trackMessagePersistenceFailedR2,
} from '../services/analytics-service'; // Import analytics
import type { AnalyticsEvent } from '../services/analytics-service'; // Import type for batch
import type { Logger } from '../utils/logger';

// Define MAX_SAFE_INTEGER for inversion and calculate required padding length
const MAX_TIMESTAMP = Number.MAX_SAFE_INTEGER; // Or a suitable slightly smaller number if needed
const PADDING_LENGTH = String(MAX_TIMESTAMP).length;

/**
 * Processes a batch of messages from the persistence queue.
 *
 * @param batch The message batch
 * @param env Environment bindings
 * @param logger Logger instance
 * @param ctx ExecutionContext
 */
export async function processPersistenceQueue(
  batch: MessageBatch<PersistenceQueueMessage>,
  env: Env,
  logger: Logger,
  ctx: ExecutionContext,
): Promise<void> {
  logger.info(`Processing batch of ${batch.messages.length} from queue: ${batch.queue}`);

  const writePromises: Promise<{ success: boolean; message: Message<PersistenceQueueMessage> }>[] =
    [];
  const analyticsEvents: AnalyticsEvent[] = []; // Batch analytics events

  for (const message of batch.messages) {
    logger.debug(`Processing message ID: ${message.id}`, {
      internalMessageId: message.body.messageId,
    });

    // Basic validation of the message body structure
    if (
      !message.body ||
      typeof message.body.organizationId !== 'string' ||
      typeof message.body.channel !== 'string' ||
      typeof message.body.timestamp !== 'number' ||
      typeof message.body.messageId !== 'string' ||
      typeof message.body.payload !== 'string'
      // Optional: Add check for persistenceOption if needed
    ) {
      logger.error(`Invalid message structure received from queue ${batch.queue}`, {
        messageId: message.id,
      });
      // Mark as failed to prevent infinite retries
      message.retry({ delaySeconds: 60 * 60 });
      continue; // Skip this message
    }

    try {
      const { organizationId, channel, timestamp, messageId, payload } = message.body;

      // Add log for Org ID being used for the write key - Embed value in string
      logger.info(`[Consumer] Constructing key with Org ID: ${organizationId}`);

      // --- Calculate and format inverted timestamp ---
      const invertedTimestamp = MAX_TIMESTAMP - timestamp;
      if (invertedTimestamp < 0) {
        // Handle potential future timestamps or calculation errors
        logger.error(
          `Calculated negative inverted timestamp for message ${messageId}. Original: ${timestamp}`,
        );
        // Mark for retry or DLQ
        message.retry({ delaySeconds: 60 * 60 });
        continue;
      }
      const formattedInvertedTimestamp = String(invertedTimestamp).padStart(PADDING_LENGTH, '0');
      // --- End timestamp inversion ---

      // Construct R2 key using the formatted inverted timestamp
      const encodedChannelName = encodeURIComponent(channel);
      const key = `${organizationId}/${encodedChannelName}/${formattedInvertedTimestamp}-${messageId}.json`;
      // Embed key in string
      logger.debug(`[Consumer] Attempting to write to R2 key: ${key}`);

      // Create content to store - use ORIGINAL timestamp here
      const content: R2MessageObject = {
        messageId,
        channel, // Store original channel name for clarity
        timestamp, // <<< Store original timestamp
        payload,
      };
      const contentString = JSON.stringify(content);

      // Embed content length in string
      logger.debug(`[Consumer] Content string length: ${contentString.length} for key: ${key}`);
      if (contentString.length === 0) {
        logger.warn(`[Consumer] Attempting to put empty content string to R2 for key: ${key}`);
      }

      // Add raw console log for wrangler dev visibility
      console.log(
        `[RAW LOG] Attempting R2 PUT for key: ${key} with content length: ${contentString.length}`,
      );

      // R2PutOptions remains simple
      let r2PutOptions: R2PutOptions = {
        httpMetadata: { contentType: 'application/json' },
      };

      // Prepare the R2 put operation promise
      const promise = env.sock8_message_history // Use correct binding name from wrangler.jsonc
        .put(key, contentString, r2PutOptions) // Pass options object
        .then(() => {
          logger.debug(`R2 put successful for key: ${key}`);
          // Add success event to batch
          analyticsEvents.push(
            trackMessagePersistedR2({
              organizationId: organizationId,
              channel: channel,
              messageId: messageId,
              r2Key: key,
              sizeBytes: contentString.length,
            }),
          );
          return { success: true, message: message };
        })
        .catch((err: unknown) => {
          logger.error(
            `R2 put failed for key: ${key}`,
            err instanceof Error ? err : new Error(String(err)),
          );
          if (!(err instanceof Error)) {
            try {
              logger.error(`R2 put error structure: ${JSON.stringify(err)}`);
            } catch {
              /* ignore stringify errors */
            }
          }
          // Add failure event to batch
          analyticsEvents.push(
            trackMessagePersistenceFailedR2({
              organizationId: organizationId,
              channel: channel,
              messageId: messageId,
              r2Key: key,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
          return { success: false, message: message };
        });

      writePromises.push(promise);
    } catch (error: unknown) {
      logger.error(
        `Error preparing R2 write for message ID ${message.id}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      // Mark for retry if preparation fails synchronously
      message.retry({ delaySeconds: 60 });
    }
  }

  // Await all R2 writes concurrently
  const results = await Promise.all(writePromises);

  // Process results: Ack successes, retry failures
  let batchHasFailures = false;
  results.forEach((result) => {
    if (result.success) {
      result.message.ack();
    } else {
      batchHasFailures = true;
      result.message.retry({ delaySeconds: 60 });
    }
  });

  if (batchHasFailures) {
    logger.warn(
      `Some R2 writes failed for batch from queue ${batch.queue}. Failed messages marked for retry.`,
    );
    // Consider implementing dead-letter queue logic if retries consistently fail
  } else if (results.length > 0) {
    logger.info(`All ${results.length} R2 writes for batch from queue ${batch.queue} succeeded.`);
  } else if (batch.messages.length > 0) {
    logger.warn(
      `Batch from queue ${batch.queue} had ${batch.messages.length} messages, but 0 write operations were attempted/completed (likely due to processing errors).`,
    );
  }

  // Send the batch of analytics events using the ExecutionContext passed from the queue handler
  if (analyticsEvents.length > 0) {
    sendEventBatch(ctx, env, logger, analyticsEvents);
  }
}
