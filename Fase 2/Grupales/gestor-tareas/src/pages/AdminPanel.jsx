import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function AdminPanel() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const alloy = {
    green: "#6ec5ac",
    blue: "#37788a",
    orange: "#e67e22",
    dark: "#4b4b54",
    purple: "#6c5ce7",
    indigo: "#4834d4",
    teal: "#20c997", // Color para el nuevo botón de Control
  };

  /* =========================
      VERIFICAR ROL ADMIN
  ========================= */
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        navigate("/login");
        return;
      }

      const { data: perfil, error } = await supabase
        .from("perfiles")
        .select("rol")
        .eq("user_id", user.id)
        .single();

      if (error || perfil?.rol !== "admin") {
        navigate("/dashboard");
        return;
      }

      setIsAdmin(true);
      setLoading(false);
    };

    checkAdmin();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Cargando panel de administración...
      </div>
    );
  }

  if (!isAdmin) return null;

  /* =========================
      UI
  ========================= */
  return (
    <div className="min-h-screen bg-gray-50 px-6 py-12">
      <div className="max-w-6xl mx-auto space-y-10">
        <h1
          className="text-3xl font-extrabold text-center"
          style={{ color: alloy.blue }}
        >
          Panel de Administración
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* GESTIÓN DE TAREAS */}
          <button
            onClick={() => navigate("/admin/tareas")}
            className="relative overflow-hidden rounded-2xl p-10 text-left shadow-lg transition hover:scale-[1.01] hover:shadow-2xl"
            style={{ background: "linear-gradient(135deg, #6ec5ac, #4fb9a0)" }}
          >
            <div className="absolute top-0 right-0 opacity-10 text-[140px] font-black select-none pointer-events-none">
              ✔
            </div>
            <h2 className="text-2xl font-extrabold text-white mb-2 relative z-10">
              Gestión de Tareas
            </h2>
            <p className="text-white/90 max-w-sm relative z-10">
              Revisión, aprobación y asignación del trabajo diario.
            </p>
          </button>

          {/* CONTROL DE TAREAS (NUEVO) */}
          <button
            onClick={() => navigate("/admin/controltareas")}
            className="relative overflow-hidden rounded-2xl p-10 text-left shadow-lg transition hover:scale-[1.01] hover:shadow-2xl"
            style={{ background: "linear-gradient(135deg, #20c997, #00b894)" }}
          >
            <div className="absolute top-0 right-0 opacity-10 text-[140px] font-black select-none pointer-events-none">
              📊
            </div>
            <h2 className="text-2xl font-extrabold text-white mb-2 relative z-10">
              Control de Tareas
            </h2>
            <p className="text-white/90 max-w-sm relative z-10">
              Monitoreo de tiempos, estados y métricas de cumplimiento.
            </p>
          </button>

          {/* VACACIONES */}
          <button
            onClick={() => navigate("/admin/vacaciones")}
            className="relative overflow-hidden rounded-2xl p-10 text-left shadow-lg transition hover:scale-[1.01] hover:shadow-2xl"
            style={{ background: "linear-gradient(135deg, #e67e22, #d35400)" }}
          >
            <div className="absolute top-0 right-0 opacity-10 text-[140px] font-black select-none pointer-events-none">
              🏖
            </div>
            <h2 className="text-2xl font-extrabold text-white mb-2 relative z-10">
              Vacaciones y Permisos
            </h2>
            <p className="text-white/90 max-w-sm relative z-10">
              Gestión de solicitudes y control de días disponibles.
            </p>
          </button>

          {/* USUARIOS */}
          <button
            onClick={() => navigate("/admin/usuarios")}
            className="relative overflow-hidden rounded-2xl p-10 text-left shadow-lg transition hover:scale-[1.01] hover:shadow-2xl"
            style={{ background: "linear-gradient(135deg, #4b4b54, #2f2f35)" }}
          >
            <div className="absolute top-0 right-0 opacity-10 text-[140px] font-black select-none pointer-events-none">
              👥
            </div>
            <h2 className="text-2xl font-extrabold text-white mb-2 relative z-10">
              Gestión de Usuarios
            </h2>
            <p className="text-white/80 max-w-sm relative z-10">
              Administración de roles y control de accesos.
            </p>
          </button>

          {/* PROYECTOS */}
          <button
            onClick={() => navigate("/admin/proyectos")}
            className="relative overflow-hidden rounded-2xl p-10 text-left shadow-lg transition hover:scale-[1.01] hover:shadow-2xl md:col-span-2 lg:col-span-1"
            style={{ background: "linear-gradient(135deg, #37788a, #2a5d6b)" }}
          >
            <div className="absolute top-0 right-0 opacity-10 text-[140px] font-black select-none pointer-events-none">
              📁
            </div>
            <h2 className="text-2xl font-extrabold text-white mb-2 relative z-10">
              Gestión de Proyectos
            </h2>
            <p className="text-white/90 max-w-sm relative z-10">
              Planificación y seguimiento de hitos.
            </p>
          </button>

          {/* ENTREGABLES Y HITOS */}
          <button
            onClick={() => navigate("/admin/entregables")}
            className="relative overflow-hidden rounded-2xl p-10 text-left shadow-lg transition hover:scale-[1.01] hover:shadow-2xl md:col-span-2 lg:col-span-1"
            style={{ background: "linear-gradient(135deg, #6c5ce7, #a29bfe)" }}
          >
            <div className="absolute top-0 right-0 opacity-10 text-[140px] font-black select-none pointer-events-none">
              🎯
            </div>
            <h2 className="text-2xl font-extrabold text-white mb-2 relative z-10">
              Entregables e Hitos
            </h2>
            <p className="text-white/90 max-w-sm relative z-10">
              Cronogramas y gestión de documentos finales.
            </p>
          </button>

          {/* GESTIÓN DE JORNADAS (ANCHO COMPLETO AL FINAL) */}
          <button
            onClick={() => navigate("/admin/aprobaciones")}
            className="relative overflow-hidden rounded-2xl p-10 text-left shadow-lg transition hover:scale-[1.01] hover:shadow-2xl md:col-span-2"
            style={{ background: "linear-gradient(135deg, #4834d4, #686de0)" }}
          >
            <div className="absolute top-0 right-0 opacity-10 text-[140px] font-black select-none pointer-events-none">
              📅
            </div>
            <h2 className="text-2xl font-extrabold text-white mb-2 relative z-10">
              Gestión de Jornadas
            </h2>
            <p className="text-white/90 max-w-2xl relative z-10">
              Revisa y aprueba las propuestas de trabajo diario enviadas por el equipo.
            </p>
          </button>

        </div>
      </div>
    </div>
  );
}