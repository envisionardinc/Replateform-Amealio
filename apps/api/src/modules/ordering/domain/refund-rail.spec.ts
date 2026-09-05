import { refundMethodFromPaymentIntent } from './refund-rail';

describe('refundMethodFromPaymentIntent', () => {
  it('maps RAZORPAY intent to the existing Razorpay refund rail', () => {
    expect(refundMethodFromPaymentIntent('RAZORPAY')).toBe('RAZORPAY');
  });

  it('maps WALLET intent to the existing wallet refund rail', () => {
    expect(refundMethodFromPaymentIntent('WALLET')).toBe('WALLET');
  });

  it('does not invent a new rail for other stored methods', () => {
    expect(refundMethodFromPaymentIntent('SCAN_AND_PAY')).toBe('WALLET');
    expect(refundMethodFromPaymentIntent('DIRECT_MERCHANT')).toBe('WALLET');
  });
});
