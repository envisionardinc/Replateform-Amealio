export type TaxonomyChip = {
  id: string;
  label: string;
  type: string | null;
  available: boolean;
  restaurantCount: number;
};

/** One selected category, or none. Clicking the selected chip clears it. */
export function toggleCategory(current: string, next: string, available: boolean): string {
  if (!available) return current;
  return current === next ? '' : next;
}
