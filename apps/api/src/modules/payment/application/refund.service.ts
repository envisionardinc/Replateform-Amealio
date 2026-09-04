import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MerchantScopeService } from '../../merchant/application/merchant-scope.service';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { RefundRepository, isUniqueViolation } from '../infrastructure/refund.repository';
import { RazorpayRefundGateway } from '../infrastructure/razorpay-refund.gateway';
import type { RefundInput, RefundRequestInput, RefundResult } from '../domain/refund.types';

/**
 * Refund service (P1.7.29 wallet + P1.7.30 live Razorpay). `requestRefund` is the
 * AUTHORIZED entry point (merchant-scoped): WALLET refunds are synchronous
 * (P1.7.29); RAZORPAY refunds are asynchronous — reserve → provider request →
 * INITIATED, with the wallet credit + transaction + full-refund coupon reversal
 * applied EXACTLY ONCE only when the refund reaches PROCESSED (via the
 * refund.processed webhook or a synchronous provider `processed`). A refund request
 * is never treated as a completed refund. The order-placement coupon commit point
 * is unchanged.
 */
@Injectable()
export class RefundService {
  constructor(
    private readonly repo: RefundRepository,
    private readonly gateway: RazorpayRefundGateway,
    private readonly scope: MerchantScopeService,
  ) {}

  /**
   * Internal WALLET refund (P1.7.29): synchronous credit + transaction, with
   * full-refund coupon reversal. Idempotent via `Refund.idempotencyKey`.
   */
  async refund(input: RefundInput): Promise<RefundResult> {
    this.validateInput(input);
    const existing = await this.repo.findRefundByIdempotencyKey(input.idempotencyKey.trim());
    if (existing) return existing;
    try {
      return await this.repo.processWalletRefund({
        paymentIntentId: input.paymentIntentId,
        requestedAmountMinor: input.amountMinor ?? null,
        idempotencyKey: input.idempotencyKey.trim(),
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        const winner = await this.repo.findRefundByIdempotencyKey(input.idempotencyKey.trim());
        if (winner) return winner;
      }
      throw e;
    }
  }

  /**
   * Authorized refund entry point. Enforces merchant tenancy (a staff member may
   * only refund an order within their merchant scope; SUPER_ADMIN platform-wide) —
   * so an arbitrary principal cannot refund another merchant's/customer's payment.
   */
  async requestRefund(principal: StaffPrincipal, input: RefundRequestInput): Promise<RefundResult> {
    this.validateInput(input);

    // Authorization: resolve the order behind the payment and assert scope.
    const ctx = await this.repo.findAuthContext(input.paymentIntentId);
    if (!ctx) throw new NotFoundException('PaymentIntent not found');
    if (!ctx.restaurantId) {
      throw new BadRequestException('Payment is not linked to an order restaurant');
    }
    await this.scope.assertRestaurantInScope(principal, ctx.restaurantId);

    // Idempotency: a prior refund with this key is returned as-is (no re-request,
    // no second provider call).
    const existing = await this.repo.findRefundByIdempotencyKey(input.idempotencyKey.trim());
    if (existing) return existing;

    const method = input.method ?? 'WALLET';
    if (method === 'WALLET') return this.refund(input);

    return this.requestProviderRefund(input);
  }

  /**
   * Order-lifecycle refund after the caller has already authorized the actor.
   * Rail is chosen by the caller from PaymentIntent.method (see refund-rail.ts).
   * Does not invent a wallet-vs-Razorpay business rule.
   */
  async executeRefund(input: RefundRequestInput): Promise<RefundResult> {
    this.validateInput(input);
    const existing = await this.repo.findRefundByIdempotencyKey(input.idempotencyKey.trim());
    if (existing) return existing;
    const method = input.method ?? 'WALLET';
    if (method === 'WALLET') return this.refund(input);
    return this.requestProviderRefund(input);
  }

  /** Asynchronous Razorpay refund: reserve → provider → INITIATED/PROCESSED. */
  private async requestProviderRefund(input: RefundRequestInput): Promise<RefundResult> {
    let reserved: { refundId: string; amount: bigint; providerPaymentId: string };
    try {
      reserved = await this.repo.reserveProviderRefund({
        paymentIntentId: input.paymentIntentId,
        requestedAmountMinor: input.amountMinor ?? null,
        idempotencyKey: input.idempotencyKey.trim(),
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        const winner = await this.repo.findRefundByIdempotencyKey(input.idempotencyKey.trim());
        if (winner) return winner;
      }
      throw e;
    }

    let provider;
    try {
      provider = await this.gateway.requestRefund({
        providerPaymentId: reserved.providerPaymentId,
        amountMinor: reserved.amount,
        idempotencyKey: input.idempotencyKey.trim(),
      });
    } catch {
      // UNKNOWN outcome (timeout/lost response): the refund stays INITIATED
      // (reserved). We do NOT fail it or issue a second provider refund — a retry
      // with the same idempotency key returns this reserved refund without calling
      // the provider again. Resolution is by webhook / reconciliation.
      throw new BadGatewayException('Refund provider request failed; refund left INITIATED');
    }

    await this.repo.attachProviderRefundId(
      reserved.refundId,
      provider.providerRefundId,
      (provider.payload ?? undefined) as Prisma.InputJsonValue | undefined,
    );

    if (provider.status === 'failed') {
      await this.repo.failProviderRefund(provider.providerRefundId);
      return this.repo.getResult(reserved.refundId);
    }
    if (provider.status === 'processed') {
      // Synchronous provider confirmation → complete now (idempotent; a later
      // duplicate refund.processed webhook is a no-op).
      const completed = await this.repo.completeProviderRefund(provider.providerRefundId);
      if (completed) return completed;
    }
    // pending → authoritative completion happens on the refund.processed webhook.
    return this.repo.getResult(reserved.refundId);
  }

  private validateInput(input: RefundInput): void {
    if (!input.paymentIntentId) throw new BadRequestException('paymentIntentId is required');
    if (!input.idempotencyKey || input.idempotencyKey.trim().length === 0) {
      throw new BadRequestException('idempotencyKey is required');
    }
    if (input.amountMinor !== undefined && input.amountMinor !== null && input.amountMinor <= 0n) {
      throw new BadRequestException('Refund amount must be greater than zero');
    }
  }
}
