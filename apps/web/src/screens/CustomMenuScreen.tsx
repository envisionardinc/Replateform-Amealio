import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StatusPanel } from '../components/StatusPanel';
import { Banner } from '../design-system/Banner';
import { discoverApi, type ConsumerMenu } from '../lib/api';
import { ComboCard, MenuItemCard } from './RestaurantScreen';

export function CustomMenuScreen() {
  const { restaurantId = '', menuId = '' } = useParams();
  const [menu, setMenu] = useState<ConsumerMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMenu(await discoverApi.customMenu(menuId, 'HOME_DELIVERY'));
    } catch (err) {
      setMenu(null);
      setError(err instanceof Error ? err.message : 'Menu not found');
    } finally {
      setLoading(false);
    }
  }, [menuId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sections =
    menu?.sections?.filter(
      (section) => section.items.length > 0 || (section.combos?.length ?? 0) > 0,
    ) ?? [];
  const hasCombos = (menu?.combos?.length ?? 0) > 0;

  return (
    <section>
      <p>
        <Link to={`/restaurants/${restaurantId || menu?.restaurantId || ''}`}>← Restaurant</Link>
      </p>
      <StatusPanel loading={loading} error={error} onRetry={() => void load()}>
        <h1>{menu?.menu?.name ?? 'Custom menu'}</h1>
        <p className="lede">
          Custom Menu references merchant catalog items. Publication, channel, and modifier rules
          match the Standard menu.
        </p>
        {menu && menu.items.length === 0 && !hasCombos ? (
          <Banner tone="empty">This custom menu has no published items for this channel.</Banner>
        ) : null}
        {sections.length > 0
          ? sections.map((section) => (
              <div key={section.id}>
                <h2>{section.name}</h2>
                {(section.combos ?? []).map((combo) => (
                  <ComboCard key={combo.id} combo={combo} />
                ))}
                {section.items.map((item) => (
                  <MenuItemCard key={item.id} item={item} />
                ))}
              </div>
            ))
          : menu?.items.map((item) => <MenuItemCard key={item.id} item={item} />)}
      </StatusPanel>
    </section>
  );
}
