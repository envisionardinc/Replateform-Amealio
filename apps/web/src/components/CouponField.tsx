import { useState } from 'react';
import { Banner } from '../design-system/Banner';
import { Button } from '../design-system/Button';
import { Field } from '../design-system/Field';
import type { AppliedPromotion } from '../lib/api';

type CouponFieldProps = {
  applied: AppliedPromotion | null | undefined;
  error: string | null;
  busy?: boolean;
  onApply: (code: string) => Promise<void> | void;
  onClear: () => Promise<void> | void;
};

export function CouponField({ applied, error, busy, onApply, onClear }: CouponFieldProps) {
  const [draft, setDraft] = useState(applied?.couponCode ?? '');

  return (
    <div className="coupon-field">
      <div className="row">
        <Field label="Promo code">
          <input
            name="couponCode"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
            placeholder="Enter code"
          />
        </Field>
        <Button type="button" disabled={busy} onClick={() => void onApply(draft)}>
          Apply
        </Button>
        {applied || draft ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setDraft('');
              void onClear();
            }}
          >
            Remove
          </Button>
        ) : null}
      </div>
      {applied ? (
        <p className="lede">
          {applied.title}
          {applied.couponCode ? ` · ${applied.couponCode}` : ''}
        </p>
      ) : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
    </div>
  );
}
