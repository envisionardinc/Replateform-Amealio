import { formatMinor } from '../lib/money';

type QuoteTotalsProps = {
  currencyCode: string;
  merchandiseSubtotalMinor: string;
  discountMinor?: string;
  taxTotalMinor?: string;
  feeTotalMinor?: string;
  grandTotalMinor?: string;
};

export function QuoteTotals({
  currencyCode,
  merchandiseSubtotalMinor,
  discountMinor = '0',
  taxTotalMinor = '0',
  feeTotalMinor = '0',
  grandTotalMinor,
}: QuoteTotalsProps) {
  const total = grandTotalMinor ?? merchandiseSubtotalMinor;
  return (
    <dl className="quote-totals">
      <div className="row">
        <dt>Subtotal</dt>
        <dd>{formatMinor(merchandiseSubtotalMinor, currencyCode)}</dd>
      </div>
      {Number(discountMinor) > 0 ? (
        <div className="row">
          <dt>Discount</dt>
          <dd>−{formatMinor(discountMinor, currencyCode)}</dd>
        </div>
      ) : null}
      <div className="row">
        <dt>Tax</dt>
        <dd>{formatMinor(taxTotalMinor, currencyCode)}</dd>
      </div>
      <div className="row">
        <dt>Fees</dt>
        <dd>{formatMinor(feeTotalMinor, currencyCode)}</dd>
      </div>
      <div className="row">
        <dt>Total</dt>
        <dd className="price">{formatMinor(total, currencyCode)}</dd>
      </div>
    </dl>
  );
}
