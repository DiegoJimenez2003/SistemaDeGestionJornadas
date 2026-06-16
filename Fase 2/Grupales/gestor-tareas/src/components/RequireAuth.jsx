import { Navigate } from "react-router-dom";
import { useSession } from "../Providers/SessionProvider";

export function RequireAuth({ children }) {
  const { session, loading } = useSession();

  if (loading) return <div className="p-10 text-center">Cargando sesión...</div>;
  if (!session) return <Navigate to="/login" replace />;

  return children;
}
