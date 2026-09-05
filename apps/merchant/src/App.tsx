import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LoginScreen } from './screens/LoginScreen';
import { OrderScreen } from './screens/OrderScreen';
import { OrdersScreen } from './screens/OrdersScreen';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<OrdersScreen />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/orders/:id" element={<OrderScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
