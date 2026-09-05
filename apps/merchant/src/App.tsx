import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireMerchant, RequireSuperAdmin } from './components/RequireAuth';
import { LoginScreen } from './screens/LoginScreen';
import { OrderScreen } from './screens/OrderScreen';
import { OrdersScreen } from './screens/OrdersScreen';
import { GlobalCatalogListScreen } from './screens/GlobalCatalogListScreen';
import { GlobalCatalogDetailScreen } from './screens/GlobalCatalogDetailScreen';
import { GlobalItemDetailScreen } from './screens/GlobalItemDetailScreen';
import { MerchantCatalogScreen } from './screens/MerchantCatalogScreen';
import { AddFromGlobalScreen } from './screens/AddFromGlobalScreen';
import { CreateItemScreen } from './screens/CreateItemScreen';
import { MerchantItemDetailScreen } from './screens/MerchantItemDetailScreen';
import { MerchantMenusScreen } from './screens/MerchantMenusScreen';
import { DinerQueueScreen } from './screens/DinerQueueScreen';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<OrdersScreen />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/orders/:id" element={<OrderScreen />} />
        <Route
          path="/global-catalog"
          element={
            <RequireSuperAdmin>
              <GlobalCatalogListScreen />
            </RequireSuperAdmin>
          }
        />
        <Route
          path="/global-catalog/:catalogId"
          element={
            <RequireSuperAdmin>
              <GlobalCatalogDetailScreen />
            </RequireSuperAdmin>
          }
        />
        <Route
          path="/global-catalog/:catalogId/items/:itemId"
          element={
            <RequireSuperAdmin>
              <GlobalItemDetailScreen />
            </RequireSuperAdmin>
          }
        />
        <Route
          path="/diner"
          element={
            <RequireMerchant>
              <DinerQueueScreen />
            </RequireMerchant>
          }
        />
        <Route
          path="/catalog"
          element={
            <RequireMerchant>
              <MerchantCatalogScreen />
            </RequireMerchant>
          }
        />
        <Route
          path="/catalog/add-from-global"
          element={
            <RequireMerchant>
              <AddFromGlobalScreen />
            </RequireMerchant>
          }
        />
        <Route
          path="/catalog/menus"
          element={
            <RequireMerchant>
              <MerchantMenusScreen />
            </RequireMerchant>
          }
        />
        <Route
          path="/catalog/items/new"
          element={
            <RequireMerchant>
              <CreateItemScreen />
            </RequireMerchant>
          }
        />
        <Route
          path="/catalog/items/:itemId"
          element={
            <RequireMerchant>
              <MerchantItemDetailScreen />
            </RequireMerchant>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
