import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function HistorialTareas() {
  const [tareas, setTareas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState(""); 
  const [stats, setStats] = useState({ totalHoras: "0.0", totalTareas: 0 });

  const fetchHistorial = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      // Consulta limpia con joins explícitos
      const { data, error } = await supabase
        .from("tareas")
        .select(`
          *,
          proyectos!proyecto_id (
            nombre
          ),
          codigos_tarea:codigo_id (
            codigo,
            descripcion,
            proyectos!proyecto_id (
              nombre
            )
          )
        `)
        .eq("usuario_id", user.id)
        .order("fecha", { ascending: false });

      if (error) throw error;

      console.log("DEBUG TAREAS:", data);
      setTareas(data || []);
      
      const horas = (data || []).reduce((acc, t) => acc + (Number(t.horas) || 0), 0);
      setStats({ 
        totalHoras: horas.toFixed(1),
        totalTareas: (data || []).length 
      });

    } catch (error) {
      console.error("Error:", error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistorial();
  }, []);

  // Función auxiliar para normalizar el estado técnico visible al usuario
  const obtenerEstadoLegible = (estadoId) => {
    const id = String(estadoId || "").toLowerCase().trim();
    if (["completada", "completado", "finalizada", "finalizado", "terminada", "terminado", "resuelto", "resuelta"].includes(id)) {
      return "Completada";
    }
    return "Pendiente";
  };

  const filteredTareas = tareas.filter(t => {
    // CORRECCIÓN: Evaluamos sobre el estado mapeado del campo real 'estado_id'
    const estadoReal = obtenerEstadoLegible(t.estado_id);
    const matchesStatus = filterStatus === "Todos" ? true : estadoReal === filterStatus;
    
    const matchesDate = !dateFilter ? true : t.fecha === dateFilter;
    const search = searchTerm.toLowerCase();
    
    const nombreProyecto = 
      t.proyectos?.nombre || 
      t.proyecto || 
      (Array.isArray(t.proyectos) ? t.proyectos[0]?.nombre : null) ||
      t.codigos_tarea?.proyectos?.nombre || 
      "";

    const matchesSearch = 
      (t.descripcion?.toLowerCase() || "").includes(search) ||
      (t.codigos_tarea?.codigo?.toLowerCase() || "").includes(search) ||
      nombreProyecto.toLowerCase().includes(search);
    
    return matchesStatus && matchesSearch && matchesDate;
  });

  return (
    <div className="min-h-screen bg-[#f1f5f9] p-4 md:p-12 font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-700">
      <div className="max-w-6xl mx-auto">
        
        {/* HEADER */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-16">
          <div className="relative">
            <div className="absolute -left-6 top-0 w-1 h-full bg-gradient-to-b from-indigo-600 to-violet-400 rounded-full hidden md:block"></div>
            <h1 className="text-6xl font-black text-slate-900 tracking-tighter mb-2">
              Historial<span className="text-indigo-600">.</span>
            </h1>
            <p className="text-slate-500 font-medium flex items-center gap-2 tracking-tight">
              Análisis detallado de tu actividad técnica
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 bg-white/50 backdrop-blur-md p-2 rounded-[2.5rem] shadow-sm border border-white/50">
            <div className="relative">
              <input 
                type="date"
                value={dateFilter}
                className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-bold text-slate-600 shadow-sm"
                onChange={(e) => setDateFilter(e.target.value)}
              />
            </div>

            <div className="relative group min-w-[280px]">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </span>
              <input 
                type="text" 
                placeholder="Filtrar por proyecto o código..."
                className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-5 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm shadow-sm"
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </header>

        {/* STATS CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          <div className="md:col-span-1 bg-white p-7 rounded-[2.5rem] shadow-sm border border-white relative overflow-hidden group hover:shadow-xl transition-all duration-500">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-50 rounded-full group-hover:scale-150 transition-transform duration-700"></div>
            <p className="relative text-[11px] font-black uppercase tracking-[0.15em] text-slate-400 mb-4">Inversión Total</p>
            <div className="relative flex items-baseline gap-2">
              <span className="text-5xl font-black text-slate-900 tracking-tighter">{stats.totalHoras}</span>
              <span className="text-sm font-bold text-indigo-500 uppercase">Hs</span>
            </div>
          </div>

          <div className="md:col-span-1 bg-white p-7 rounded-[2.5rem] shadow-sm border border-white group hover:shadow-xl transition-all duration-500">
            <p className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400 mb-4">Tareas</p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black text-slate-900 tracking-tighter">{stats.totalTareas}</span>
              <span className="text-sm font-bold text-slate-300 uppercase">Items</span>
            </div>
          </div>

          <div className="md:col-span-2 bg-slate-900 p-7 rounded-[2.5rem] shadow-2xl shadow-indigo-900/20 text-white relative overflow-hidden">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-indigo-300 mb-5">Filtrar por estado técnico</p>
            <div className="flex flex-wrap gap-2">
              {["Todos", "Pendiente", "Completada"].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-6 py-2.5 rounded-2xl font-black text-[10px] tracking-widest transition-all duration-300 ${
                    filterStatus === status 
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/40 scale-105" 
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                  }`}
                >
                  {status.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* FEED DE ACTIVIDAD */}
        <div className="space-y-4">
          {loading ? (
            <div className="py-32 flex flex-col items-center justify-center">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[10px]">Sincronizando Base de Datos</p>
            </div>
          ) : filteredTareas.map((t) => {
            const nombreProyecto = 
              t.proyectos?.nombre || 
              t.proyecto || 
              (Array.isArray(t.proyectos) ? t.proyectos[0]?.nombre : null) ||
              t.codigos_tarea?.proyectos?.nombre || 
              'Proyecto No Asignado';

            const estadoLegible = obtenerEstadoLegible(t.estado_id);

            return (
              <div key={t.id} className="group bg-white/70 backdrop-blur-sm p-3 rounded-[2.5rem] border border-white shadow-sm hover:shadow-2xl hover:shadow-indigo-500/10 hover:bg-white transition-all duration-500 flex flex-col md:flex-row items-center">
                
                <div className="bg-white rounded-[2rem] m-1 px-7 py-6 flex flex-col items-center justify-center min-w-[110px] shadow-sm group-hover:shadow-md transition-all">
                  <span className="text-3xl font-black text-slate-900 mb-0.5 tracking-tighter">
                    {new Date(t.fecha).getUTCDate()}
                  </span>
                  <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                    {new Date(t.fecha).toLocaleString('es-ES', { month: 'short', timeZone: 'UTC' })}
                  </span>
                </div>

                <div className="flex-1 p-6">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span className="bg-slate-900 text-white text-[9px] font-black px-3 py-1.5 rounded-xl tracking-tighter">
                      {t.codigos_tarea?.codigo || "S/C"}
                    </span>
                    <div className="h-1 w-1 bg-slate-300 rounded-full"></div>
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.1em]">
                      {nombreProyecto}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 leading-tight group-hover:text-indigo-600 transition-colors">
                    {t.descripcion || t.codigos_tarea?.descripcion || "Sin descripción registrada."}
                  </h3>
                </div>

                <div className="flex items-center gap-8 p-6 md:border-l border-slate-100 min-w-[220px]">
                  <div className="flex flex-col items-center">
                    <span className="text-3xl font-black text-slate-900 tracking-tighter">
                      {Number(t.horas).toFixed(1)}
                    </span>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Hs Invertidas</span>
                  </div>

                  <div className={`ml-auto px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    estadoLegible === 'Completada' 
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm shadow-emerald-100/50' 
                      : 'bg-amber-50 text-amber-600 border border-amber-100 shadow-sm shadow-amber-100/50'
                  }`}>
                    {estadoLegible}
                  </div>
                </div>
              </div>
            );
          })}

          {!loading && filteredTareas.length === 0 && (
            <div className="py-20 text-center bg-white rounded-[3rem] border-4 border-dashed border-slate-100">
               <p className="text-slate-300 font-black uppercase tracking-widest text-sm">No se encontraron registros</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}