import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { TipRepository } from '../infrastructure/tip.repository';
import { resolveTip, TipValidationError } from '../domain/tip-calculation';
import { verifyPaymentSignature } from '../../payment/domain/razorpay-signature';
import type {
  CreateTipInput,
  RefundStatusName,
  TipBeneficiaryPolicyName,
  TipCaptureResult,
  TipPaymentRecord,
  VerifyCaptureTipInput,
} from '../domain/tip.types';

/** Order statuses on which a tip may not be created (terminal / non-collectible). */
const NON_TIPPABLE_STATUSES = new Set(['CANCELLED', 'RETURNED']);

/**
 * Tip Collection/Capture Foundation (P1.7.38, per the P1.7.42 approved policy).
 *
 * Tips are collected as a SEPARATE payment component, financially isolated from
 * the order: this service never touches `Order.grandTotalMinor`, the order
 * `PaymentIntent`, the commission basis, or merchant settlement. The tip amount is
 * ALWAYS server-calculated from `Order.grandTotalMinor` (the approved "total order
 * amount" basis) — client-calculated amounts are never trusted. Capture is
 * server-verified (Razorpay signature + amount + currency) and idempotent. The
 * merchant-configured beneficiary policy is SNAPSHOTTED for historical integrity;
 * routing/settlement of the tip is DEFERRED to P1.7.39. Donations are out of scope.
 */
@Injectable()
export class TipService {
  constructor(
    private readonly repo: TipRepository,
    private readonly config: ConfigService,
  ) {}

  /**
   * Resolve the merchant-configured tip beneficiary policy (P1.7.42: configured at
   * merchant subscription/setup). No target config field exists yet, so this
   * resolves to the baseline-viable MERCHANT policy. The value is SNAPSHOTTED onto
   * the tip so that a later merchant config change (e.g. MERCHANT → DELIVERY_PERSON)
   * never rewrites the policy that governed an already-collected tip. This is the
   * single seam to wire real per-merchant config when the merchant tip-config slice
   * lands. It is NOT a client input (customers cannot choose the beneficiary).
   */
  private resolveBeneficiaryPolicy(_merchantId: string): TipBeneficiaryPolicyName {
    return 'MERCHANT';
  }

  /**
   * Create a separate tip payment for an order. The tip amount is server-computed
   * from `Order.grandTotalMinor`; currency is taken from the order (server
   * controlled). Idempotent per provider order id.
   */
  async createTip(input: CreateTipInput): Promise<TipPaymentRecord> {
    if (!input.orderId) throw new BadRequestException('orderId is required');
    if (!input.razorpayOrderId || input.razorpayOrderId.trim().length === 0) {
      throw new BadRequestException('razorpayOrderId is required');
    }

    const order = await this.repo.findOrderForTip(input.orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (NON_TIPPABLE_STATUSES.has(order.status)) {
      throw new BadRequestException(`Cannot tip an order in status ${order.status}`);
    }

    let resolved;
    try {
      resolved = resolveTip({
        basisMinor: order.grandTotalMinor,
        percentBps: input.percentBps ?? null,
        customAmountMinor: input.customAmountMinor ?? null,
      });
    } catch (e) {
      if (e instanceof TipValidationError) throw new BadRequestException(e.message);
      throw e;
    }

    const { tip } = await this.repo.createTip({
      orderId: order.id,
      merchantId: order.merchantId,
      basisMinor: order.grandTotalMinor,
      percentBps: resolved.percentBps,
      isCustom: resolved.isCustom,
      amountMinor: resolved.amountMinor,
      currencyCode: order.currencyCode,
      beneficiaryPolicy: this.resolveBeneficiaryPolicy(order.merchantId),
      razorpayOrderId: input.razorpayOrderId.trim(),
    });
    return tip;
  }

  /**
   * Verify a Razorpay client handoff for the tip payment and mark it COLLECTED.
   * Rejects on invalid signature, unknown tip, or amount/currency mismatch. A tip
   * intent is NEVER treated as collected money — only a verified capture flips it
   * to CAPTURED. Idempotent: a repeated capture returns the existing collected tip.
   */
  async verifyAndCaptureTip(input: VerifyCaptureTipInput): Promise<TipCaptureResult> {
    if (!input.razorpayOrderId || !input.razorpayPaymentId || !input.razorpaySignature) {
      throw new BadRequestException(
        'razorpayOrderId, razorpayPaymentId and signature are required',
      );
    }

    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET')!;
    const signatureOk = verifyPaymentSignature({
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature,
      keySecret,
    });
    if (!signatureOk) throw new BadRequestException('Invalid tip payment signature');

    const tip = await this.repo.findByRazorpayOrderId(input.razorpayOrderId);
    if (!tip) throw new BadRequestException('Unknown tip payment for razorpayOrderId');

    if (input.amountMinor !== undefined && input.amountMinor !== tip.amountMinor) {
      throw new BadRequestException('Captured amount does not match the tip payment');
    }
    if (input.currencyCode !== undefined && input.currencyCode !== tip.currencyCode) {
      throw new BadRequestException('Captured currency does not match the tip payment');
    }

    // Idempotency: if this provider payment already captured this tip, no-op.
    if (tip.status === 'CAPTURED' && tip.razorpayPaymentId === input.razorpayPaymentId) {
      return { tip, created: false };
    }
    if (tip.status === 'CAPTURED') {
      throw new BadRequestException('Tip already captured with a different provider payment');
    }

    try {
      return await this.repo.recordCapture(tip.id, input.razorpayPaymentId);
    } catch (e) {
      // Concurrency: another writer captured this tip (or another tip for the same
      // order) first. The unique(razorpayPaymentId) / partial-unique(one captured
      // per order) rolled us back — return the authoritative current state.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const current = (await this.repo.findById(tip.id)) ?? tip;
        return { tip: current, created: false };
      }
      throw e;
    }
  }

  async getTipsForOrder(orderId: string): Promise<TipPaymentRecord[]> {
    return this.repo.findByOrder(orderId);
  }

  /**
   * Refund-state foundation for a collected tip (P1.7.38). Records refund state on
   * the tip WITHOUT touching the order payment — they are separate payments with
   * separately verifiable refund state (P1.7.42). The full refund lifecycle
   * (provider calls, order-refund linkage) is owned by a later slice; this only
   * establishes the auditable, idempotent refund-state representation.
   */
  async recordTipRefundState(args: {
    tipId: string;
    amountMinor: bigint;
    providerRefundId: string;
    refundStatus: RefundStatusName;
  }): Promise<TipPaymentRecord> {
    const tip = await this.repo.findById(args.tipId);
    if (!tip) throw new NotFoundException('Tip payment not found');
    if (tip.status !== 'CAPTURED' && tip.status !== 'PARTIALLY_REFUNDED') {
      throw new BadRequestException('Only a captured tip can be refunded');
    }
    if (args.amountMinor <= 0n) {
      throw new BadRequestException('Refund amount must be greater than zero');
    }
    if (tip.refundedAmountMinor + args.amountMinor > tip.amountMinor) {
      throw new BadRequestException('Refund exceeds the collected tip amount');
    }
    try {
      return await this.repo.recordRefundState(args);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Duplicate providerRefundId — idempotent: return the current tip state.
        return (await this.repo.findById(args.tipId)) ?? tip;
      }
      throw e;
    }
  }
}
