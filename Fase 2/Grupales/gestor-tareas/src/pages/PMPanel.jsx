import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function PMPanel() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isPM, setIsPM] = useState(false);

  // Paleta de colores consistente con tu marca
  const alloy = {
    blue: "#37788a",
    green: "#6ec5ac",
    purple: "#6c5ce7",
    indigo: "#4834d4",
    dark: "#4b4b54",
  };

  useEffect(() => {
    const checkAuth = async () => {
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

      // Permitimos entrada si es admin o pm
      if (error || (perfil?.rol !== "pm" && perfil?.rol !== "admin")) {
        navigate("/dashboard");
        return;
      }

      setIsPM(true);
      setLoading(false);
    };

    checkAuth();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 font-medium animate-pulse">
        Cargando Panel de Control PM...
      </div>
    );
  }

  if (!isPM) return null;

  return (
    <div className="min-h-screen bg-[#f8fafc] px-6 py-12">
      <div className="max-w-5xl mx-auto space-y-12">
        {/* ENCABEZADO */}
        <header className="text-center space-y-2">
          <h1 className="text-4xl font-black tracking-tighter uppercase italic" style={{ color: alloy.blue }}>
            Project Manager Hub
          </h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.3em]">
            Gestión Operativa y Control de Proyectos
          </p>
        </header>

        {/* GRID DE BOTONES */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* 1. GESTIÓN DE ENTREGABLES PM */}
          <button
            onClick={() => navigate("/pm/PMEntregables")}
            className="group relative overflow-hidden rounded-[2.5rem] p-10 text-left shadow-xl transition-all hover:-translate-y-1 hover:shadow-2xl"
            style={{ background: "linear-gradient(135deg, #6c5ce7, #a29bfe)" }}
          >
            <div className="absolute -top-4 -right-4 opacity-10 text-[160px] font-black select-none pointer-events-none group-hover:scale-110 transition-transform">
              🎯
            </div>
            <h2 className="text-2xl font-black text-white mb-3 relative z-10 uppercase italic tracking-tight">
              Gestión de Entregables PM
            </h2>
            <p className="text-white/80 max-w-xs relative z-10 text-sm leading-relaxed">
              Configuración de hitos, carga de documentos técnicos y control de cumplimiento de fases.
            </p>
          </button>

          {/* 2. GESTIÓN TAREAS PM */}
          <button
            onClick={() => navigate("/pm/PMTareas")}
            className="group relative overflow-hidden rounded-[2.5rem] p-10 text-left shadow-xl transition-all hover:-translate-y-1 hover:shadow-2xl"
            style={{ background: "linear-gradient(135deg, #37788a, #2a5d6b)" }}
          >
            <div className="absolute -top-4 -right-4 opacity-10 text-[160px] font-black select-none pointer-events-none group-hover:scale-110 transition-transform">
              ⚙️
            </div>
            <h2 className="text-2xl font-black text-white mb-3 relative z-10 uppercase italic tracking-tight">
              Gestión Tareas PM
            </h2>
            <p className="text-white/80 max-w-xs relative z-10 text-sm leading-relaxed">
              Asignación masiva, edición de backlogs y priorización de códigos de tarea para el equipo.
            </p>
          </button>

          {/* 3. SEGUIMIENTO Y APROBACIONES (ANCHO COMPLETO) */}
          <button
            onClick={() => navigate("/pm/GestionPM")}
            className="group relative overflow-hidden rounded-[2.5rem] p-10 text-left shadow-xl transition-all hover:-translate-y-1 hover:shadow-2xl md:col-span-2"
            style={{ background: "linear-gradient(135deg, #6ec5ac, #4fb9a0)" }}
          >
            <div className="absolute -top-10 right-10 opacity-10 text-[180px] font-black select-none pointer-events-none group-hover:rotate-12 transition-transform">
              📋
            </div>
            <div className="relative z-10">
              <h2 className="text-3xl font-black text-white mb-3 uppercase italic tracking-tight">
                Seguimiento y Aprobaciones
              </h2>
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                <p className="text-white/90 max-w-xl text-sm leading-relaxed">
                  Validación de jornadas diarias, revisión de reportes de avance y feedback directo sobre el progreso del personal.
                </p>
                <div className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-full self-start">
                  <span className="text-white text-[10px] font-black uppercase tracking-widest">Control en Tiempo Real</span>
                </div>
              </div>
            </div>
          </button>

        </div>

    
        
      </div>
    </div>
  );
}