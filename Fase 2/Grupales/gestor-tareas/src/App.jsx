import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import Login from "./pages/Login";
import AdminPanel from "./pages/AdminPanel";
import Perfil from "./pages/Perfil";
import MyTasks from "./pages/MyTasks";
import Dashboard from "./pages/Graficos"; 
import HistorialTareas from "./pages/HistorialTareas"; // <--- Importación agregada
import Header from "./components/Header";
import { SessionProvider, useSession } from "./Providers/SessionProvider";
import TaskForm from "./components/TaskForm";
import TaskList from "./components/TaskList";
import MyTasksPage from "./pages/MyTasks";
import Solicitudes from "./pages/Solicitudes";
import AdminTareas from "./pages/admin/AdminTareas";
import AdminVacaciones from "./pages/admin/AdminVacaciones";
import AdminUsuarios from "./pages/admin/AdminUsuarios";
import AdminProyectos from "./pages/admin/AdminProyectos";
import AdminEntregables from "./pages/admin/AdminEntregables";
import Aprobaciones from "./pages/admin/Aprobaciones";
import Graficos from "./pages/Graficos";
import Seguimiento from "./pages/Seguimiento";
import GestionPM from "./pages/pm/GestionPM";
import PMPanel from "./pages/PMPanel";
import PMEntregables from "./pages/pm/PMEntregables";
import PMTareas from "./pages/pm/PMTareas";
import ControlTareas from "./pages/admin/ControlTareas";


// Componente para rutas protegidas
function RequireAuth() {
  const { session, loading } = useSession();
  if (loading) return <div className="p-10 text-center">Cargando...</div>;
  if (!session) return <Navigate to="/login" replace />;

  return (
    <div>
      <Header />
      <Outlet /> {/* Aquí se renderizan las rutas hijas */}
    </div>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          {/* Login */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />

          {/* Bloque protegido */}
          <Route element={<RequireAuth />}>
            <Route path="dashboard" element={<TaskForm />} />
            <Route path="perfil" element={<Perfil />} />
            <Route path="solicitudes" element={<Solicitudes />} />
            <Route path="admin" element={<AdminPanel />} />
            <Route path="mytasks" element={<TaskList/>} />
            <Route path="seguimiento" element={<Seguimiento/>} />
            <Route path="historialtareas" element={<HistorialTareas/>} /> {/* <--- Ruta agregada */}

            {/* Redirección por defecto corregida a minúscula */}
            <Route path="" element={<Navigate to="dashboard" replace />} />

            {/* ADMIN */}
            <Route path="admin" element={<AdminPanel />} />
            <Route path="admin/tareas" element={<AdminTareas />} />
            <Route path="admin/vacaciones" element={<AdminVacaciones />} />
            <Route path="admin/usuarios" element={<AdminUsuarios />} />
            <Route path="admin/proyectos" element={<AdminProyectos />} />
            <Route path="admin/entregables" element={<AdminEntregables />} />
            <Route path="admin/aprobaciones" element={<Aprobaciones />} />
            <Route path="graficos" element={<Graficos />} />
            <Route path="admin/controltareas" element={<ControlTareas />} />

            {/* PM PANEL */}
            <Route path="PMPanel" element={<PMPanel />} /> 
            <Route path="pm/GestionPM" element={<GestionPM />} />
            <Route path="pm/PMEntregables" element={<PMEntregables />} />
            <Route path="pm/PMTareas" element={<PMTareas />} />

          </Route>
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}