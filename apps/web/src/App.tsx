import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { CartScreen } from './screens/CartScreen';
import { CheckoutScreen } from './screens/CheckoutScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ItemScreen } from './screens/ItemScreen';
import { LoginScreen } from './screens/LoginScreen';
import { OrderScreen } from './screens/OrderScreen';
import { OrdersScreen } from './screens/OrdersScreen';
import { AddressesScreen } from './screens/AddressesScreen';
import { FavoritesScreen } from './screens/FavoritesScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { RestaurantScreen } from './screens/RestaurantScreen';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/restaurants/:id" element={<RestaurantScreen />} />
        <Route path="/items/:id" element={<ItemScreen />} />
        <Route path="/cart" element={<CartScreen />} />
        <Route path="/checkout" element={<CheckoutScreen />} />
        <Route path="/orders" element={<OrdersScreen />} />
        <Route path="/orders/:id" element={<OrderScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/favorites" element={<FavoritesScreen />} />
        <Route path="/addresses" element={<AddressesScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
