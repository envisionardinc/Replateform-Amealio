export type GlobalItemFormInput = {
  size?: string;
  sku?: string;
  priceRupees?: string;
  groupName?: string;
  addOnName?: string;
  addOnPriceRupees?: string;
  deliveryEnabled?: boolean;
};

export function rupeesToMinor(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return String(Math.round(amount * 100));
}

/**
 * Builds the existing sourcePayload.product snapshot Super Admin can attach
 * when creating a Global Item. Empty product fields yield no payload.
 */
export function buildGlobalItemSourcePayload(input: GlobalItemFormInput): { product: object } | undefined {
  const priceMinor = rupeesToMinor(input.priceRupees);
  const variants = priceMinor
    ? [
        {
          size: input.size?.trim() || 'Regular',
          sku: input.sku?.trim() || undefined,
          priceMinor,
          currencyCode: 'INR',
          isDefault: true,
          available: true,
        },
      ]
    : [];

  const addOnPrice = rupeesToMinor(input.addOnPriceRupees) ?? '0';
  const addOnGroups =
    input.groupName?.trim() && input.addOnName?.trim()
      ? [
          {
            name: input.groupName.trim(),
            minSelect: 0,
            maxSelect: 1,
            allowQuantity: false,
            available: true,
            addOns: [
              {
                name: input.addOnName.trim(),
                priceMinor: addOnPrice,
                available: true,
                ...(input.sku?.trim()
                  ? { variantPrices: [{ sku: input.sku.trim(), priceMinor: addOnPrice }] }
                  : {}),
              },
            ],
          },
        ]
      : [];

  const channelConfigs = input.deliveryEnabled
    ? [{ channel: 'HOME_DELIVERY', enabled: true }]
    : [];

  if (!variants.length && !addOnGroups.length && !channelConfigs.length) return undefined;
  return { product: { variants, addOnGroups, channelConfigs } };
}
