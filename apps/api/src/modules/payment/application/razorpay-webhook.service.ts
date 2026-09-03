import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PaymentRepository } from '../infrastructure/payment.repository';
import { PaymentService } from './payment.service';
import { verifyWebhookSignature } from '../domain/razorpay-signature';
import type { WebhookIngestResult } from '../domain/payment.types';

/**
 * Razorpay webhook ingestion (P1.7.28). Closes the legacy no-op-stub gap (doc 56
 * §D): the RAW body HMAC is verified server-side, the event is persisted
 * idempotently (`WebhookEvent.providerEventId @unique`), and a redelivered event
 * is a no-op — it cannot create a second PaymentAttempt/Transaction or move a
 * captured payment backward. Only `payment.captured` / `payment.failed` are
 * processed in this slice; other events are ingested and marked PROCESSED (ignored).
 */
@Injectable()
export class RazorpayWebhookService {
  constructor(
    private readonly repo: PaymentRepository,
    private readonly payments: PaymentService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Ingest a Razorpay webhook. `rawBody` MUST be the exact bytes received (for a
   * byte-accurate HMAC). `signature` is the `x-razorpay-signature` header.
   */
  async ingest(rawBody: string, signature: string): Promise<WebhookIngestResult> {
    const webhookSecret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET')!;
    if (!verifyWebhookSignature({ rawBody, signature, webhookSecret })) {
      throw new BadRequestException('Invalid webhook signature');
    }

    let payload: RazorpayWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
    } catch {
      throw new BadRequestException('Invalid webhook body');
    }

    const type = payload.event;
    // Prefer a provider-unique event id; fall back to the payment entity id so a
    // redelivery of the same logical event is still deduplicated.
    const providerEventId = payload.id ?? payload.payload?.payment?.entity?.id ?? '';
    if (!type || !providerEventId) {
      throw new BadRequestException('Webhook missing event type or id');
    }

    const { id, duplicate } = await this.repo.ingestWebhookEvent({
      providerEventId,
      type,
      payload: payload as unknown as Prisma.InputJsonValue,
    });
    if (duplicate) {
      return {
        webhookEventId: id,
        providerEventId,
        type,
        duplicate: true,
        processingStatus: 'RECEIVED',
      };
    }

    let status: 'PROCESSED' | 'FAILED' = 'PROCESSED';
    try {
      await this.process(type, payload);
    } catch {
      status = 'FAILED';
    }
    await this.repo.setWebhookProcessed(id, status);
    return {
      webhookEventId: id,
      providerEventId,
      type,
      duplicate: false,
      processingStatus: status,
    };
  }

  private async process(type: string, payload: RazorpayWebhookPayload): Promise<void> {
    const entity = payload.payload?.payment?.entity;
    if (!entity) return; // non-payment events: ingested + ignored in this slice

    if (type === 'payment.captured') {
      const intent = await this.repo.findIntentByRazorpayOrderId(entity.order_id ?? '');
      if (!intent) return; // unknown order: recorded, nothing to reconcile here
      // The whole body is HMAC-verified, so `entity.amount` is trusted; still gate
      // it against the server-authoritative intent amount.
      if (entity.amount !== undefined && BigInt(entity.amount) !== intent.amountMinor) {
        throw new BadRequestException('Webhook captured amount does not match the intent');
      }
      // Idempotent capture — shares the razorpayPaymentId-unique guard with the
      // client handoff path, so at most one attempt + transaction is created.
      await this.payments.captureForIntent(intent, entity.id, `webhook:${entity.id}`);
      return;
    }

    if (type === 'payment.failed') {
      const intent = await this.repo.findIntentByRazorpayOrderId(entity.order_id ?? '');
      if (intent) await this.repo.markIntentFailed(intent.id);
    }
  }
}

interface RazorpayWebhookPayload {
  id?: string;
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id: string;
        order_id?: string;
        amount?: number | string;
        status?: string;
      };
    };
  };
}
