import { Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  PaymentAttemptRecord,
  PaymentIntentRecord,
  PaymentMethodName,
  PaymentStatusName,
} from '../domain/payment.types';

interface IntentRow {
  id: string;
  orderId: string | null;
  amountMinor: bigint;
  currencyCode: string;
  status: string;
  method: string;
  razorpayOrderId: string | null;
  createdAt: Date;
}

interface AttemptRow {
  id: string;
  paymentIntentId: string;
  amountMinor: bigint;
  currencyCode: string;
  status: string;
  razorpayPaymentId: string | null;
  idempotencyKey: string;
  createdAt: Date;
}

/** Order fields needed to establish payment ownership + amount context. */
export interface OrderPaymentContext {
  id: string;
  userId: string | null;
  merchantId: string;
  grandTotalMinor: bigint;
  currencyCode: string;
}

/** Statuses that must never be silently overwritten by a (re)capture. */
const TERMINAL_OR_CAPTURED: PaymentStatus[] = [
  PaymentStatus.CAPTURED,
  PaymentStatus.PARTIALLY_REFUNDED,
  PaymentStatus.REFUNDED,
];

/**
 * Write/read access to `PaymentIntent`/`PaymentAttempt`/`Transaction`/`WebhookEvent`
 * (P1.7.28) over the EXISTING schema (no change). Idempotency is DB-enforced:
 * `PaymentIntent.razorpayOrderId @unique`, `PaymentAttempt.razorpayPaymentId @unique`
 * + `idempotencyKey @unique`, `WebhookEvent.providerEventId @unique`. Verification/
 * authorization is enforced by PaymentService before these writes.
 */
@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrderForPayment(orderId: string): Promise<OrderPaymentContext | null> {
    try {
      return await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          userId: true,
          merchantId: true,
          grandTotalMinor: true,
          currencyCode: true,
        },
      });
    } catch {
      return null;
    }
  }

  async findIntentByRazorpayOrderId(razorpayOrderId: string): Promise<PaymentIntentRecord | null> {
    const row = await this.prisma.paymentIntent.findUnique({ where: { razorpayOrderId } });
    return row ? toIntent(row) : null;
  }

  async findIntentById(id: string): Promise<PaymentIntentRecord | null> {
    const row = await this.prisma.paymentIntent.findUnique({ where: { id } });
    return row ? toIntent(row) : null;
  }

  /**
   * Create a PaymentIntent. Idempotent per Razorpay order: if one already exists
   * for `razorpayOrderId`, the existing intent is returned (no duplicate).
   */
  async createIntent(args: {
    orderId: string;
    amountMinor: bigint;
    currencyCode: string;
    method: PaymentMethodName;
    razorpayOrderId: string;
  }): Promise<{ intent: PaymentIntentRecord; created: boolean }> {
    try {
      const row = await this.prisma.paymentIntent.create({
        data: {
          orderId: args.orderId,
          amountMinor: args.amountMinor,
          currencyCode: args.currencyCode,
          method: args.method,
          status: 'CREATED',
          razorpayOrderId: args.razorpayOrderId,
        },
      });
      return { intent: toIntent(row), created: true };
    } catch (e) {
      if (isUniqueViolation(e)) {
        const existing = await this.prisma.paymentIntent.findUnique({
          where: { razorpayOrderId: args.razorpayOrderId },
        });
        if (existing) return { intent: toIntent(existing), created: false };
      }
      throw e;
    }
  }

  async findAttemptByRazorpayPaymentId(
    razorpayPaymentId: string,
  ): Promise<PaymentAttemptRecord | null> {
    const row = await this.prisma.paymentAttempt.findUnique({ where: { razorpayPaymentId } });
    return row ? toAttempt(row) : null;
  }

  /**
   * Atomically record a verified capture: create the PaymentAttempt (CAPTURED),
   * advance the PaymentIntent to CAPTURED (compare-and-set; never moves backward
   * from a captured/refunded state), and create the authoritative payment
   * Transaction (type=PAYMENT, direction=CREDIT) — all in ONE transaction.
   *
   * Idempotency: `razorpayPaymentId @unique` on PaymentAttempt. A concurrent or
   * repeated capture of the same provider payment throws a unique violation, the
   * whole transaction rolls back, and the caller returns the existing state — so
   * exactly ONE attempt + ONE transaction exist per provider payment.
   */
  async recordCapture(args: {
    intentId: string;
    orderId: string | null;
    userId: string | null;
    merchantId: string | null;
    amountMinor: bigint;
    currencyCode: string;
    razorpayPaymentId: string;
    idempotencyKey: string;
  }): Promise<{
    attempt: PaymentAttemptRecord;
    intent: PaymentIntentRecord;
    transactionId: string;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.paymentAttempt.create({
        data: {
          paymentIntentId: args.intentId,
          amountMinor: args.amountMinor,
          currencyCode: args.currencyCode,
          status: 'CAPTURED',
          razorpayPaymentId: args.razorpayPaymentId,
          idempotencyKey: args.idempotencyKey,
        },
      });

      // Compare-and-set: only advance to CAPTURED from a non-captured status.
      await tx.paymentIntent.updateMany({
        where: { id: args.intentId, status: { in: ['CREATED', 'AUTHORIZED', 'FAILED'] } },
        data: { status: 'CAPTURED' },
      });

      const transaction = await tx.transaction.create({
        data: {
          type: 'PAYMENT',
          direction: 'CREDIT',
          amountMinor: args.amountMinor,
          currencyCode: args.currencyCode,
          userId: args.userId,
          merchantId: args.merchantId,
          orderId: args.orderId,
          paymentIntentId: args.intentId,
        },
        select: { id: true },
      });

      const intent = await tx.paymentIntent.findUniqueOrThrow({ where: { id: args.intentId } });
      return {
        attempt: toAttempt(attempt),
        intent: toIntent(intent),
        transactionId: transaction.id,
      };
    });
  }

  /** Mark an intent FAILED without overwriting a captured/refunded state. */
  async markIntentFailed(intentId: string): Promise<void> {
    await this.prisma.paymentIntent.updateMany({
      where: { id: intentId, status: { notIn: TERMINAL_OR_CAPTURED } },
      data: { status: 'FAILED' },
    });
  }

  // ---- Webhook ingestion ----

  /**
   * Persist a webhook event idempotently. Returns `{ duplicate: true }` (with the
   * existing row id) when `providerEventId` was already ingested — the caller then
   * skips reprocessing so a redelivered event cannot create duplicate records.
   */
  async ingestWebhookEvent(args: {
    providerEventId: string;
    type: string;
    payload: Prisma.InputJsonValue;
  }): Promise<{ id: string; duplicate: boolean }> {
    try {
      const row = await this.prisma.webhookEvent.create({
        data: {
          provider: 'RAZORPAY',
          providerEventId: args.providerEventId,
          type: args.type,
          payload: args.payload,
          processingStatus: 'RECEIVED',
        },
        select: { id: true },
      });
      return { id: row.id, duplicate: false };
    } catch (e) {
      if (isUniqueViolation(e)) {
        const existing = await this.prisma.webhookEvent.findUnique({
          where: { providerEventId: args.providerEventId },
          select: { id: true },
        });
        if (existing) return { id: existing.id, duplicate: true };
      }
      throw e;
    }
  }

  async setWebhookProcessed(id: string, status: 'PROCESSED' | 'FAILED'): Promise<void> {
    await this.prisma.webhookEvent.update({
      where: { id },
      data: { processingStatus: status, processedAt: new Date() },
    });
  }
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

function toIntent(row: IntentRow): PaymentIntentRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    amountMinor: row.amountMinor,
    currencyCode: row.currencyCode,
    status: row.status as PaymentStatusName,
    method: row.method as PaymentMethodName,
    razorpayOrderId: row.razorpayOrderId,
    createdAt: row.createdAt,
  };
}

function toAttempt(row: AttemptRow): PaymentAttemptRecord {
  return {
    id: row.id,
    paymentIntentId: row.paymentIntentId,
    amountMinor: row.amountMinor,
    currencyCode: row.currencyCode,
    status: row.status as PaymentStatusName,
    razorpayPaymentId: row.razorpayPaymentId,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
  };
}
