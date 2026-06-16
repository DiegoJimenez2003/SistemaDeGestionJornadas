import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

// IMPORTS PARA LOS GRÁFICOS Y MÉTRICAS (CON ESTILO ALLOY)
import { 
  Users, Clock, AlertTriangle, BarChart3, 
  RefreshCw, Zap, ClipboardCheck, Search, X
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";

const COLORS = ['#37788a', '#6ec5ac', '#fbbf24', '#e11d48', '#8b5cf6'];

export default function GestionPM() {
  // =========================
  // ESTADOS
  // =========================
  const [proyectos, setProyectos] = useState([]);
  const [tareasPendientes, setTareasPendientes] = useState({});
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [proyectoAbierto, setProyectoAbierto] = useState(null);
  const [msg, setMsg] = useState("");

  // ESTADO PARA CONTROLAR QUÉ METRICAS ESTÁN VISIBLES
  const [dashboardProyectoActivo, setDashboardProyectoActivo] = useState(null);
  const [proyectoStats, setProyectoStats] = useState({});

  // ESTADOS PARA SEGUIMIENTO
  const [viewMode, setViewMode] = useState("pendientes"); // "pendientes" o "seguimiento"
  const [proyectoExpandido, setProyectoExpandido] = useState(null); 
  const [entregablesProy, setEntregablesProy] = useState([]); 
  const [modalTareas, setModalTareas] = useState({ abierto: false, entregable: null, tareas: [] });

  const alloy = { 
    dark: "#4b4b54", 
    blue1: "#37788a", 
    green: "#6ec5ac",
    red: "#e11d48", 
    bg: "#f1f5f9", // Fondo gris lavado para contraste máximo
    yellow: "#fbbf24"
  };

  useEffect(() => {
    fetchData();
  }, []);

  // =========================
  // CARGA DE DATOS (CORREGIDA)
  // =========================
  async function fetchData() {
  setIsSyncing(true);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Buscamos asignaciones del PM
    const { data: asignaciones, error: errAsig } = await supabase
      .from("proyecto_encargados")
      .select("proyecto_id")
      .eq("user_id", user.id);

    if (errAsig) throw errAsig;
    const idsAsignados = asignaciones.map(a => a.proyecto_id);

    if (idsAsignados.length > 0) {
      // 2. Traemos info de los proyectos
      const { data: proys, error: errProy } = await supabase
        .from("proyectos")
        .select(`*, proyecto_recursos (user_id, perfiles (nombre, apellido, rol, activo))`)
        .in("id", idsAsignados);

      if (errProy) throw errProy;

      // 3. TRAEMOS TODAS LAS TAREAS (Sin filtro de revisión aquí para no romper los gráficos)
      const { data: todasLasTareas, error: errAllTasks } = await supabase
        .from("tareas")
        .select(`*, codigos_tarea (codigo, descripcion)`);

      if (errAllTasks) throw errAllTasks;

      const { data: todosEntregables, error: errEntregables } = await supabase
        .from("entregables")
        .select("*");

      if (errEntregables) throw errEntregables;

      // 4. LÓGICA DE FILTRADO PARA "APROBACIÓN" (Solo sin revisar + Horas > 0)
      const proyNombres = proys.map(p => p.nombre?.trim().toLowerCase());
      const tasksPendientes = todasLasTareas.filter(t => {
        const matchId = idsAsignados.includes(t.proyecto_id);
        const matchNombre = t.proyecto && proyNombres.includes(t.proyecto.trim().toLowerCase());
        return (matchId || matchNombre) && t.revision === "sin_revisar" && Number(t.horas) > 0;
      });

      // Agrupamos para la vista de lista
      const grouped = {};
      tasksPendientes.forEach(t => {
        const pAsociado = proys.find(p => 
          p.id === t.proyecto_id || 
          p.nombre?.trim().toLowerCase() === t.proyecto?.trim().toLowerCase()
        );
        if (pAsociado) {
          if (!grouped[pAsociado.id]) grouped[pAsociado.id] = [];
          grouped[pAsociado.id].push(t);
        }
      });

      // 5. CÁLCULO DE MÉTRICAS (Usando todasLasTareas para que los gráficos NO fallen)
      const statsCalculadas = {};
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      proys.forEach(p => {
        // Filtramos tareas totales de este proyecto para el Dashboard
        const tareasDelProyecto = todasLasTareas.filter(t => 
          t.proyecto_id === p.id || 
          t.proyecto?.trim().toLowerCase() === p.nombre?.trim().toLowerCase()
        );
        
        const entregablesDelProyecto = todosEntregables.filter(e => 
          e.proyecto_nombre?.trim().toLowerCase() === p.nombre?.trim().toLowerCase()
        );

        const horasTotales = tareasDelProyecto.reduce((acc, t) => acc + (Number(t.horas) || 0), 0);
        
        const atrasadas = tareasDelProyecto.filter(t => {
          if (!t.fecha_vencimiento) return false;
          const vencimiento = new Date(t.fecha_vencimiento);
          vencimiento.setHours(0, 0, 0, 0);
          return vencimiento < hoy && t.revision !== "aprobada";
        });

        // Gráfico de Barras
        const statsPorUsuario = {};
        tareasDelProyecto.forEach(t => {
          let name = (t.nombre_trabajador || "Sin Nombre").trim();
          if (name === "Felipe") name = "Felipe Galan";
          statsPorUsuario[name] = (statsPorUsuario[name] || 0) + (Number(t.horas) || 0);
        });

        const chartDataProyecto = Object.keys(statsPorUsuario).map(k => ({
          name: k,
          value: Number(statsPorUsuario[k].toFixed(2))
        })).sort((a, b) => b.value - a.value);

        // Riesgo/Presupuesto de Entregables
        const riesgoEntregables = entregablesDelProyecto.map(ent => {
          const horasConsumidas = tareasDelProyecto
            .filter(t => t.entregable?.trim().toLowerCase() === ent.nombre?.trim().toLowerCase())
            .reduce((acc, curr) => acc + (Number(curr.horas) || 0), 0);
          
          return {
            nombre: ent.nombre,
            limite: ent.horas_presupuestadas || 0,
            consumido: horasConsumidas,
            porcentaje: ent.horas_presupuestadas > 0 ? (horasConsumidas / ent.horas_presupuestadas) * 100 : 0
          };
        }).sort((a, b) => b.porcentaje - a.porcentaje);

        statsCalculadas[p.id] = {
          horasTotales: Number(horasTotales.toFixed(2)),
          pendientes: grouped[p.id]?.length || 0,
          atrasadas: atrasadas.length,
          colaboradoresContados: chartDataProyecto.length,
          chartData: chartDataProyecto,
          riesgoData: riesgoEntregables
        };
      });

      setProyectoStats(statsCalculadas);
      setProyectos(proys);
      setTareasPendientes(grouped);
    } else {
      setProyectos([]);
      setTareasPendientes({});
    }
  } catch (error) {
    console.error("Error completo:", error);
    setMsg("❌ Error al cargar datos");
  } finally {
    setLoading(false);
    setIsSyncing(false);
  }
}

  async function revisar(id, proyId, estado) {
    const { error } = await supabase
      .from("tareas")
      .update({ 
        revision: estado,
        estado: estado === 'aprobada' ? 'Completada' : 'Pendiente'
      })
      .eq("id", id);

    if (!error) {
      setMsg(`✅ AVANCE ${estado.toUpperCase()}`);
      setTareasPendientes(prev => ({
        ...prev,
        [proyId]: prev[proyId].filter(t => t.id !== id)
      }));
      setTimeout(() => { setMsg(""); fetchData(); }, 2000);
    }
  }

  async function toggleProyecto(proyecto) {
    if (proyectoExpandido === proyecto.id) {
      setProyectoExpandido(null);
      setEntregablesProy([]);
    } else {
      setProyectoExpandido(proyecto.id);
      const { data } = await supabase
        .from("entregables")
        .select("*")
        .eq("proyecto_nombre", proyecto.nombre);
      setEntregablesProy(data || []);
    }
  }

  async function verTareasEntregable(entregable) {
    const { data, error } = await supabase
      .from("tareas")
      .select("*, codigos_tarea(codigo)")
      .eq("entregable", entregable.nombre)
      .eq("proyecto", entregable.proyecto_nombre);
    
    if (!error) {
      setModalTareas({ abierto: true, entregable: entregable.nombre, tareas: data || [] });
    }
  }

  if (loading) return <div className="p-20 text-center font-black text-slate-500 animate-pulse uppercase italic tracking-widest">Sincronizando Alloy Analytics...</div>;

  return (
    <div className="min-h-screen p-4 md:p-8 font-sans" style={{ backgroundColor: alloy.bg }}>
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* MODAL DE TAREAS SECUNDARIO */}
        {modalTareas.abierto && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col border border-slate-100">
              <div className="p-6 border-b flex justify-between items-center bg-slate-900 text-white">
                <div>
                  <h3 className="text-2xl font-black italic uppercase tracking-tighter text-[#6ec5ac]">{modalTareas.entregable}</h3>
                  <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Tareas vinculadas</p>
                </div>
                <button onClick={() => setModalTareas({ ...modalTareas, abierto: false })} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center font-bold transition-colors">✕</button>
              </div>
              <div className="p-6 overflow-y-auto space-y-3 bg-slate-50">
                {modalTareas.tareas.length === 0 ? (
                  <p className="text-center py-10 text-slate-400 font-bold uppercase text-xs">No hay tareas reportadas</p>
                ) : (
                  modalTareas.tareas.map(t => (
                    <div key={t.id} className="p-4 bg-white border border-slate-100 rounded-2xl flex justify-between items-center shadow-sm">
                      <div>
                        <p className="font-bold text-slate-800 uppercase text-sm italic">{t.nombre_trabajador === 'Felipe' ? 'Felipe Galan' : t.nombre_trabajador}</p>
                        <p className="text-[10px] text-[#37788a] font-black uppercase">{t.codigos_tarea?.codigo} | {t.fecha}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black italic text-slate-800">{t.horas} HH</p>
                        <span className={`text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase ${t.revision === 'aprobada' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>{t.revision}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* HEADER BRANDED */}
        <header className="relative flex flex-col items-center justify-center space-y-6 pb-8 border-b-2 border-slate-200">
          <div className="w-full flex justify-between items-center">
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
                Gestión <span className="text-white px-3 py-1 rounded-xl shadow-md bg-[#37788a]">PM</span>
              </h1>
              <p className="text-[#37788a] text-[10px] font-black uppercase tracking-[0.3em] mt-2 italic">Aprobación de avances y HH reportadas</p>
            </div>
            
            <button 
              onClick={fetchData} 
              disabled={isSyncing}
              className="flex items-center gap-3 bg-slate-900 text-white hover:bg-slate-800 px-6 py-3.5 rounded-full text-[10px] font-black uppercase italic shadow-xl transition-all active:scale-95"
            >
              <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
              {isSyncing ? 'Sincronizando' : 'Actualizar Datos'}
            </button>
          </div>

          {/* SELECTOR DE VISTAS ESTILO ALLOY */}
          <div className="bg-slate-300/60 p-1.5 rounded-[2rem] flex items-center shadow-inner w-full max-w-md">
            <button 
              onClick={() => setViewMode("pendientes")}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-[1.7rem] text-xs font-black uppercase tracking-widest transition-all duration-300 ${viewMode === 'pendientes' ? 'bg-[#37788a] text-white shadow-xl scale-[1.02]' : 'text-slate-600 hover:text-slate-800'}`}
            >
              <ClipboardCheck size={16} /> Aprobación
            </button>
            <button 
              onClick={() => setViewMode("seguimiento")}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-[1.7rem] text-xs font-black uppercase tracking-widest transition-all duration-300 ${viewMode === 'seguimiento' ? 'bg-[#37788a] text-white shadow-xl scale-[1.02]' : 'text-slate-600 hover:text-slate-800'}`}
            >
              <Search size={16} /> Seguimiento
            </button>
          </div>
        </header>

        {msg && <div className="bg-slate-900 text-white p-4 rounded-2xl text-center font-black uppercase italic text-[10px] tracking-widest border-b-4 border-[#6ec5ac] animate-bounce">{msg}</div>}

        {/* LISTADO PRINCIPAL */}
        <div className="grid grid-cols-1 gap-6">
          {proyectos.length === 0 ? (
            <div className="bg-white p-20 rounded-[2.5rem] border-2 border-slate-200 text-center font-black text-slate-400 italic uppercase tracking-widest">No hay proyectos asignados</div>
          ) : (
            proyectos.map((p) => {
              const tareas = tareasPendientes[p.id] || [];
              const pData = proyectoStats[p.id] || { horasTotales: 0, pendientes: 0, atrasadas: 0, colaboradoresContados: 0, chartData: [], riesgoData: [] };
              
              if (viewMode === "pendientes") {
                const isOpen = proyectoAbierto === p.id;
                const isDashboardOpen = dashboardProyectoActivo === p.id;

                return (
                  <div key={p.id} className={`bg-white rounded-[2.5rem] border-2 transition-all duration-300 overflow-hidden shadow-sm ${isOpen || isDashboardOpen ? 'border-[#37788a]/40 shadow-xl' : 'border-slate-200'}`}>
                    
                    {/* Tarjeta Encabezado Proyecto */}
                    <div className="p-6 md:p-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-slate-50/80 transition-colors">
                      <div onClick={() => { setProyectoAbierto(isOpen ? null : p.id); setDashboardProyectoActivo(null); }} className="flex items-center gap-6 cursor-pointer flex-1 w-full">
                        <div 
                          className="w-14 h-14 rounded-2xl flex items-center justify-center font-black italic text-2xl transition-all shadow-md" 
                          style={tareas.length > 0 ? { backgroundColor: alloy.blue1, color: 'white' } : { backgroundColor: '#f1f5f9', color: '#cbd5e1' }}
                        >
                          {tareas.length}
                        </div>
                        <div>
                          <span className="bg-slate-100 text-slate-500 text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter">{p.cliente || 'PROYECTO'}</span>
                          <h2 className="text-2xl font-black text-slate-800 uppercase italic tracking-tighter leading-none mt-1">{p.nombre}</h2>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end border-t sm:border-t-0 pt-3 sm:pt-0">
                        <button 
                          onClick={() => {
                            setDashboardProyectoActivo(isDashboardOpen ? null : p.id);
                            setProyectoAbierto(null);
                          }}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase italic tracking-wider transition-all border ${isDashboardOpen ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                        >
                          <BarChart3 size={14} />
                          {isDashboardOpen ? "Ocultar" : "Métricas"}
                        </button>
                        <button 
                          onClick={() => { setProyectoAbierto(isOpen ? null : p.id); setDashboardProyectoActivo(null); }}
                          className={`p-2.5 rounded-xl transition-all ${isOpen ? 'bg-[#37788a] text-white rotate-180' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                          <X size={18} className={isOpen ? "" : "rotate-45"}/>
                        </button>
                      </div>
                    </div>

                    {/* DESPLEGABLE: MÉTRICAS (DASHBOARD) */}
                    {isDashboardOpen && (
                      <div className="bg-slate-50 border-t-2 border-slate-100 p-6 md:p-8 space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                            <div className="p-3 bg-[#37788a] text-white rounded-xl"><Clock size={18}/></div>
                            <div>
                              <p className="text-[9px] font-bold text-slate-400 uppercase">HH Total</p>
                              <h4 className="text-2xl font-black text-[#37788a]">{pData.horasTotales}</h4>
                            </div>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                            <div className="p-3 bg-[#fbbf24] text-white rounded-xl"><RefreshCw size={18}/></div>
                            <div>
                              <p className="text-[9px] font-bold text-slate-400 uppercase">Pendientes</p>
                              <h4 className="text-2xl font-black text-amber-600">{tareas.length}</h4>
                            </div>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                            <div className="p-3 bg-[#e11d48] text-white rounded-xl"><AlertTriangle size={18}/></div>
                            <div>
                              <p className="text-[9px] font-bold text-slate-400 uppercase">Atrasos</p>
                              <h4 className={`text-2xl font-black ${pData.atrasadas > 0 ? 'text-rose-600 animate-pulse' : 'text-slate-700'}`}>{pData.atrasadas}</h4>
                            </div>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                            <div className="p-3 bg-[#6ec5ac] text-white rounded-xl"><Users size={18}/></div>
                            <div>
                              <p className="text-[9px] font-bold text-slate-400 uppercase">Equipo</p>
                              <h4 className="text-2xl font-black text-emerald-600">{pData.colaboradoresContados}</h4>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm lg:col-span-7">
                            <h4 className="text-xs font-black text-slate-800 uppercase italic mb-4">Carga Horaria (HH)</h4>
                            <div className="h-60">
                              {pData.chartData.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-xs text-slate-400 font-bold uppercase">Sin datos</div>
                              ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={pData.chartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontWeight: 'bold'}} />
                                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
                                    <Tooltip contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)'}} />
                                    <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={35}>
                                      {pData.chartData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                                    </Bar>
                                  </BarChart>
                                </ResponsiveContainer>
                              )}
                            </div>
                          </div>

                          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm lg:col-span-5 flex flex-col">
                            <h4 className="text-xs font-black text-slate-800 uppercase italic mb-4 flex items-center gap-2">
                              <Zap size={14} className="text-amber-500 fill-amber-500" /> Presupuesto por Entregable
                            </h4>
                            <div className="space-y-3 overflow-y-auto max-h-[220px] flex-1 pr-1">
                              {pData.riesgoData.map((item, idx) => (
                                <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                  <div className="flex justify-between items-center mb-1.5">
                                    <p className="text-[11px] font-black text-slate-700 truncate max-w-[170px] uppercase">{item.nombre}</p>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${item.porcentaje > 100 ? 'bg-rose-100 text-rose-600' : 'bg-slate-200 text-slate-800'}`}>{Math.round(item.porcentaje)}%</span>
                                  </div>
                                  <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-500 ${item.porcentaje > 100 ? 'bg-rose-500' : 'bg-[#37788a]'}`} style={{ width: `${Math.min(item.porcentaje, 100)}%` }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* DESPLEGABLE: CONTROL DE HORAS PENDIENTES (SÍ LLAMA LAS TAREAS) */}
                    {isOpen && (
                      <div className="bg-slate-50/50 border-t-2 border-slate-200 p-6 md:p-8 space-y-4">
                        {tareas.length === 0 ? (
                          <p className="text-center py-6 text-[10px] font-black text-slate-400 uppercase italic">Todo revisado</p>
                        ) : (
                          tareas.map(t => (
                            <div key={t.id} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 group hover:shadow-md transition-shadow">
                              <div className="flex-1 space-y-2 w-full">
                                <div className="flex gap-2 items-center">
                                  <span className="bg-slate-900 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase italic">{t.codigos_tarea?.codigo || 'AVANCE'}</span>
                                  <span className="text-slate-400 text-[9px] font-black uppercase italic">{t.fecha}</span>
                                </div>
                                <h3 className="text-xl font-black text-slate-800 uppercase italic leading-none">{t.nombre_trabajador === 'Felipe' ? 'Felipe Galan' : t.nombre_trabajador}</h3>
                                <p className="text-slate-600 text-xs font-medium italic">"{t.codigos_tarea?.descripcion || 'Sin descripción'}"</p>
                              </div>
                              <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                                <div className="bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100 text-center min-w-[100px]">
                                  <p className="text-2xl font-black text-slate-800 italic tracking-tighter leading-none">{t.horas}</p>
                                  <p className="text-[8px] font-black text-slate-400 uppercase">HH Reportadas</p>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => revisar(t.id, p.id, 'rechazada')} className="bg-white border-2 border-slate-200 px-4 py-3 rounded-xl text-[10px] font-black uppercase italic text-slate-400 hover:text-red-500 hover:border-red-100 transition-all active:scale-95">Rechazar</button>
                                  <button onClick={() => revisar(t.id, p.id, 'aprobada')} className="bg-slate-900 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase italic hover:bg-[#6ec5ac] transition-all shadow-lg active:scale-95">Aprobar</button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              } else {
                // MODO SEGUIMIENTO
                const esExpandido = proyectoExpandido === p.id;
                return (
                  <div key={p.id} className={`bg-white border-2 rounded-[2rem] transition-all overflow-hidden shadow-sm ${esExpandido ? 'border-[#37788a]/40 shadow-xl' : 'border-slate-200'}`}>
                    <div className="p-6 md:p-8 flex flex-col md:flex-row justify-between items-center gap-4 cursor-pointer hover:bg-slate-50" onClick={() => toggleProyecto(p)}>
                      <div className="flex-1 w-full">
                        <div className="flex items-center gap-3">
                          <span className={`w-3.5 h-3.5 rounded-full shadow-sm ${p.estado === 'activo' ? 'bg-[#6ec5ac]' : 'bg-slate-300'}`}></span>
                          <p className="font-black text-2xl text-slate-800 uppercase italic tracking-tighter leading-none">{p.nombre}</p>
                        </div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1.5">{p.cliente} | Inicio: {p.fecha_inicio}</p>
                      </div>
                      <div className={`p-2.5 rounded-full ${esExpandido ? 'bg-slate-900 text-white rotate-180' : 'bg-slate-100 text-slate-400'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    </div>

                    {esExpandido && (
                      <div className="bg-slate-50 p-6 md:p-8 border-t-2 border-slate-100 grid md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Entregables del Proyecto</h4>
                          {entregablesProy.length === 0 ? (
                            <p className="text-xs italic text-slate-400">Sin entregables definidos.</p>
                          ) : (
                            entregablesProy.map(ent => (
                              <button key={ent.id} onClick={() => verTareasEntregable(ent)} className="w-full text-left p-4 bg-white border border-slate-200 rounded-2xl hover:border-[#37788a] hover:shadow-md transition flex justify-between items-center group">
                                <span className="text-sm font-black text-slate-800 uppercase italic">{ent.nombre}</span>
                                <span className="text-[9px] bg-[#37788a] text-white px-3 py-1 rounded-xl font-black uppercase opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">Ver Tareas</span>
                              </button>
                            ))
                          )}
                        </div>
                        <div className="space-y-2 border-t md:border-t-0 md:border-l pt-6 md:pt-0 md:pl-8 border-slate-200">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Personal Asignado</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {p.proyecto_recursos?.map((res, idx) => (
                              <div key={idx} className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                                <div className="w-8 h-8 rounded-xl bg-[#37788a] text-white flex items-center justify-center text-[10px] font-black uppercase italic shadow-sm">{res.perfiles?.nombre?.substring(0, 1)}</div>
                                <span className="text-xs font-black text-slate-700 uppercase italic truncate">{res.perfiles?.nombre} {res.perfiles?.apellido}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }
            })
          )}
        </div>
      </div>
    </div>
  );
}