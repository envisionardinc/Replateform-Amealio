import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FavoriteButton } from '../components/FavoriteButton';
import { StatusPanel } from '../components/StatusPanel';
import { Badge } from '../design-system/Badge';
import { Banner } from '../design-system/Banner';
import { Card } from '../design-system/Card';
import {
  discoverApi,
  type ConsumerCombo,
  type CustomMenuSummary,
  type MenuItem,
  type Restaurant,
} from '../lib/api';
import { formatMinor } from '../lib/money';

export function RestaurantScreen() {
  const { id = '' } = useParams();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [combos, setCombos] = useState<ConsumerCombo[]>([]);
  const [customMenus, setCustomMenus] = useState<CustomMenuSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [place, menu, customs] = await Promise.all([
        discoverApi.restaurant(id),
        discoverApi.menu(id, 'HOME_DELIVERY'),
        discoverApi.customMenus(id),
      ]);
      setRestaurant(place);
      setItems(menu.items);
      setCombos(menu.combos ?? []);
      setCustomMenus(customs.menus);
    } catch (err) {
      setRestaurant(null);
      setItems([]);
      setCombos([]);
      setCustomMenus([]);
      setError(err instanceof Error ? err.message : 'Restaurant unavailable');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <p>
        <Link to="/">← Home</Link>
      </p>
      <StatusPanel loading={loading} error={error} onRetry={() => void load()}>
        <div className="row">
          <h1>{restaurant?.name}</h1>
          {restaurant ? (
            <FavoriteButton
              targetType="RESTAURANT"
              targetId={restaurant.id}
              next={`/restaurants/${restaurant.id}`}
            />
          ) : null}
        </div>
        <p className="lede">
          {restaurant?.city ?? ''} · Standard menu is assembled from published catalog items.
          Channel rules use Home Delivery on this slice.
        </p>
        {restaurant ? (
          <div className="row-actions">
            <Link className="btn btn-primary" to={`/restaurants/${restaurant.id}/book-a-table`}>
              Book a Table
            </Link>
          </div>
        ) : null}
        {customMenus.length > 0 ? (
          <div>
            <h2>Custom menus</h2>
            {customMenus.map((menu) => (
              <Card key={menu.id}>
                <div className="row">
                  <div>
                    <h2>
                      <Link to={`/restaurants/${id}/menus/${menu.id}`}>{menu.name}</Link>
                    </h2>
                    <p className="lede">Merchant-configured menu. Same orderability rules.</p>
                  </div>
                  <Link to={`/restaurants/${id}/menus/${menu.id}`}>Open</Link>
                </div>
              </Card>
            ))}
          </div>
        ) : null}
        {combos.length > 0 ? (
          <div>
            <h2>Combos</h2>
            {combos.map((combo) => (
              <ComboCard key={combo.id} combo={combo} />
            ))}
          </div>
        ) : null}
        <h2>À la carte</h2>
        {items.length === 0 ? (
          <Banner tone="empty">This restaurant has no published items.</Banner>
        ) : null}
        {items.map((item) => (
          <MenuItemCard key={item.id} item={item} />
        ))}
      </StatusPanel>
    </section>
  );
}

export function MenuItemCard({ item }: { item: MenuItem }) {
  const variant = item.variants.find((row) => row.available) ?? item.variants[0];
  const sellable =
    item.orderable !== false && item.availability === 'AVAILABLE' && variant?.available;
  const configurable =
    item.variants.length > 1 || (item.modifierGroups ?? []).some((g) => g.available);
  return (
    <Card media={item.name}>
      <div className="row">
        <div>
          <h2>
            <Link to={`/items/${item.id}`}>{item.name}</Link>
          </h2>
          <p className="lede">{item.description || item.availability}</p>
          {variant ? (
            <p className="price">
              {configurable ? 'From ' : ''}
              {formatMinor(variant.priceMinor, variant.currencyCode)}
              {variant.size ? ` · ${variant.size}` : ''}
            </p>
          ) : null}
          {!sellable ? (
            <Badge tone="warning">
              {item.soldOut || item.availability === 'SOLDOUT' ? 'Sold out' : 'Not orderable'}
            </Badge>
          ) : null}
        </div>
        <Link to={`/items/${item.id}`}>{configurable ? 'Customize' : 'Details'}</Link>
      </div>
    </Card>
  );
}

export function ComboCard({ combo }: { combo: ConsumerCombo }) {
  const sellable = combo.orderable !== false && combo.availability === 'AVAILABLE';
  return (
    <Card media={combo.name}>
      <div className="row">
        <div>
          <h2>
            <Link to={`/combos/${combo.id}`}>{combo.name}</Link>
          </h2>
          <p className="lede">{combo.description || 'Meal deal'}</p>
          <p className="price">{formatMinor(combo.comboPriceMinor, combo.currencyCode)}</p>
          {!sellable ? <Badge tone="warning">Not orderable</Badge> : null}
        </div>
        <Link to={`/combos/${combo.id}`}>{combo.substitutable ? 'Choose' : 'Details'}</Link>
      </div>
    </Card>
  );
}
