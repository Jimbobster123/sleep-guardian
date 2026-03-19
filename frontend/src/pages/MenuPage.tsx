import { Navigate } from 'react-router-dom';

export default function MenuPage() {
  // Menu UI moved to the Home page.
  return <Navigate to="/" replace />;
}
