import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function AdminAprobaciones() {
  const [dataRaw, setDataRaw] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [incidenciasRaw, setIncidenciasRaw] = useState([]);
  const [todosLosUsuarios, setTodosLosUsuarios] = useState([]);
  const [backlogs, setBacklogs] = useState({});
  const [loading, setLoading] = useState(true);
  const [comentarios, setComentarios] = useState({});
  const [busqueda, setBusqueda] = useState("");
  const [userRole, setUserRole] = useState("");
  
  // --- ESTADO DEL DESPLEGABLE DE ASISTENCIA ---
  const [showAsistencia, setShowAsistencia] = useState(false);

  // Helper crucial para transformar la estructura de la nueva BD a los campos planos de la vista
  const normalizarEstructuraPlana = (lista) => {
    return (lista || []).map(item => {
      const tareaRelacional = item.tareas;
      return {
        ...item,
        tareas: tareaRelacional ? {
          id: tareaRelacional.id,
          // Accedemos al join anidado: tareas -> proyectos -> nombre
          proyecto: tareaRelacional.proyecto?.nombre || "Sin Proyecto",
          // En tu tabla tareas, la descripción actúa como el entregable/detalle de la planificación
          entregable: tareaRelacional.descripcion || "Sin Descripción",
          // Accedemos al join anidado: tareas -> codigos_tarea -> codigo
          codigos_tarea: tareaRelacional.codigos_tarea ? { codigo: tareaRelacional.codigos_tarea.codigo } : null
        } : null
      };
    });
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 0. ROL Y PERFILES
      const { data: perfil } = await supabase.from("perfiles").select("rol").eq("user_id", user.id).single();
      setUserRole(perfil?.rol || "usuario");

      const { data: todosLosPerfiles } = await supabase.from("perfiles").select("user_id, nombre, apellido");
      setTodosLosUsuarios(todosLosPerfiles || []);

      // 1. PROPUESTAS (PENDIENTES) -> Corregido a estado_plan_id y joins profundos
     // Busca estas líneas dentro de tu archivo y asegúrate de que usen 'tareas' en el join
  const { data: propuestas, error: errPropuestas } = await supabase
  .from("planificacion_diaria")
  .select(`
    id, 
    estado_plan_id, 
    fecha, 
    usuario_id,
    perfiles:usuario_id (nombre, apellido),
    tareas:tarea_id (
      id,
      descripcion,
      proyecto:proyecto_id (nombre),
      codigos_tarea:codigo_id (codigo)
    )
  `)
  .eq("estado_plan_id", "propuesto");

      if (errPropuestas) console.error("Error cargando propuestas:", errPropuestas.message);

      // 2. HISTORIAL -> Excluyendo "propuesto"
      const { data: historicos, error: errHistoricos } = await supabase
  .from("planificacion_diaria")
  .select(`
    id, 
    estado_plan_id, 
    fecha, 
    horas_reales, 
    progreso_reportado, 
    comentarios_cierre, 
    usuario_id,
    perfiles:usuario_id (nombre, apellido, user_id), 
    tareas:tarea_id (
      id,
      descripcion,
      proyecto:proyecto_id (nombre),
      codigos_tarea:codigo_id (codigo)
    )
  `)
  .neq("estado_plan_id", "propuesto")
  .order('fecha', { ascending: false })
  .limit(100);

      if (errHistoricos) console.error("Error cargando históricos:", errHistoricos.message);

      // 3. EVENTOS / IMPREVISTOS
      const { data: eventos } = await supabase.from("eventos_jornada").select("*").order('fecha', { ascending: false });

      const eventosConFormato = (eventos || []).map(ev => ({
        ...ev,
        perfiles: todosLosPerfiles?.find(p => p.user_id === ev.usuario_id) || { nombre: "Usuario", apellido: "Desconocido" }
      }));

      // Seteamos los estados usando el normalizador para no romper el HTML/Tailwind
      const propuestasNormalizadas = normalizarEstructuraPlana(propuestas);
      setDataRaw(propuestasNormalizadas);
      setHistorial(normalizarEstructuraPlana(historicos));
      setIncidenciasRaw(eventosConFormato);

      // Disparar la carga del Backlog para los usuarios que tienen propuestas pendientes
      const uids = [...new Set((propuestas || []).map(d => d.usuario_id))];
      uids.forEach(uid => fetchUserBacklog(uid));

    } catch (error) {
      console.error("Error General:", error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function fetchUserBacklog(uid) {
    // Consulta adaptada a la nueva tabla de 'tareas' conectando con sus respectivas tablas maestras
    const { data, error } = await supabase
      .from("tareas")
      .select(`
        id, 
        descripcion, 
        proyecto:proyecto_id (nombre), 
        codigos_tarea:codigo_id (codigo)
      `)
      .eq("usuario_id", uid)
      .eq("estado_id", "en_progreso"); // Corregido: de 'estado' a 'estado_id' y usando el slug real

    if (error) {
      console.error("Error cargando el backlog del usuario:", error.message);
      return;
    }

    // Normalizamos el formato del backlog individual para que la sección de sugerencias funcione limpia
    const backlogMapeado = (data || []).map(t => ({
      id: t.id,
      proyecto: t.proyecto?.nombre || "Sin Proyecto",
      entregable: t.descripcion || "Sin descripción",
      codigos_tarea: t.codigos_tarea ? { codigo: t.codigos_tarea.codigo } : null
    }));

    setBacklogs(prev => ({ ...prev, [uid]: backlogMapeado }));
  }

  // --- LÓGICA DE ASISTENCIA ---
  const estatusPropuestasHoy = useMemo(() => {
    const hoy = new Date().toISOString().split('T')[0];
    const idsPendientes = new Set(dataRaw.map(d => d.usuario_id));
    const idsProcesadosHoy = new Set(
      historial.filter(h => h.fecha === hoy).map(h => h.usuario_id || h.perfiles?.user_id)
    );

    return todosLosUsuarios.map(u => ({
      nombre: `${u.nombre || "Usuario"} ${u.apellido || ""}`,
      enviado: idsPendientes.has(u.user_id) || idsProcesadosHoy.has(u.user_id)
    })).sort((a, b) => b.enviado - a.enviado);
  }, [todosLosUsuarios, dataRaw, historial]);

  // --- ACCIONES ---
  const quitarTarea = async (id) => {
    await supabase.from("planificacion_diaria").delete().eq("id", id);
    setDataRaw(prev => prev.filter(t => t.id !== id));
  };

  const agrupados = useMemo(() => {
    const filtrado = dataRaw.filter(item => 
      `${item.perfiles?.nombre} ${item.tareas?.proyecto}`.toLowerCase().includes(busqueda.toLowerCase())
    );
    return filtrado.reduce((acc, curr) => {
      let key = curr.usuario_id;
      if (!acc[key]) acc[key] = { titulo: `${curr.perfiles?.nombre || "Usuario"} ${curr.perfiles?.apellido || ""}`, tareas: [] };
      acc[key].tareas.push(curr);
      return acc;
    }, {});
  }, [dataRaw, busqueda]);

  const procesarJornada = async (grupoKey, decision) => {
    const grupo = agrupados[grupoKey];
    if (!grupo) return;
    
    // Corregido: Columna estado_plan_id según tu DDL
    const { error } = await supabase.from("planificacion_diaria")
      .update({ estado_plan_id: decision, comentario_admin: comentarios[grupoKey] || "" })
      .in("id", grupo.tareas.map(t => t.id));
      
    if (!error) fetchData();
  };

  const historialAgrupado = useMemo(() => {
    return historial.reduce((acc, curr) => {
      if (!acc[curr.fecha]) acc[curr.fecha] = { items: [], totalHH: 0, avgProg: 0 };
      acc[curr.fecha].items.push(curr);
      acc[curr.fecha].totalHH += parseFloat(curr.horas_reales || 0);
      acc[curr.fecha].avgProg += parseFloat(curr.progreso_reportado || 0);
      return acc;
    }, {});
  }, [historial]);

  const imprevistosAgrupados = useMemo(() => {
    return incidenciasRaw.reduce((acc, curr) => {
      if (!acc[curr.fecha]) acc[curr.fecha] = [];
      acc[curr.fecha].push(curr);
      return acc;
    }, {});
  }, [incidenciasRaw]);

  const agregarTareaPlan = async (usuarioId, tarea) => {
    const hoy = new Date().toISOString().split('T')[0];
    
    // Inserción adaptada con la columna estado_plan_id correcta
    const { data, error } = await supabase
  .from("planificacion_diaria")
  .insert([
    { 
      usuario_id: usuarioId, 
      tarea_id: tarea.id, 
      fecha: hoy, 
      estado_plan_id: 'propuesto' 
    }
  ])
  .select(`
    id, 
    estado_plan_id, 
    fecha, 
    usuario_id,
    perfiles:usuario_id (nombre, apellido),
    tareas:tarea_id (
      id,
      descripcion,
      proyecto:proyecto_id (nombre),
      codigos_tarea:codigo_id (codigo)
    )
  `);

    if (!error && data && data[0]) {
      const nuevoItemNormalizado = normalizarEstructuraPlana(data)[0];
      setDataRaw(prev => [...prev, nuevoItemNormalizado]);
    } else {
      console.error("Error al agregar tarea de contrapropuesta:", error?.message);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center font-black text-slate-400 animate-pulse uppercase tracking-widest">Cargando Panel de Control...</div>;

  return (
    <div className="min-h-screen bg-[#f1f5f9] p-4 md:p-8 font-sans text-slate-900">
      
      {/* HEADER DINÁMICO */}
      <header className="max-w-7xl mx-auto mb-10 relative">
        <div className="flex flex-col md:flex-row justify-between items-center md:items-end gap-6">
          <div className="w-full md:w-auto">
            <h1 className="text-4xl font-black uppercase italic tracking-tighter leading-none">Control Admin</h1>
            <p className="text-[#37788a] text-[10px] font-black uppercase tracking-widest mt-1">Gestión de Jornadas Diarias</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto md:ml-auto items-stretch sm:items-center">
            <div className="relative group flex-1 sm:flex-none">
              <span className="absolute inset-y-0 left-5 flex items-center text-slate-400 group-focus-within:text-[#37788a] transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </span>
              <input 
                type="text"
                placeholder="Buscar trabajador..."
                className="pl-12 pr-6 py-4 rounded-2xl border-none shadow-sm text-xs font-bold outline-none focus:ring-2 focus:ring-[#37788a] w-full sm:w-64 bg-white transition-all"
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>

            <div className="relative">
              <button 
                onClick={() => setShowAsistencia(!showAsistencia)}
                className={`h-full w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-sm border ${
                  showAsistencia ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-white hover:bg-slate-50'
                }`}
              >
                <div className={`w-2 h-2 rounded-full animate-pulse ${showAsistencia ? 'bg-indigo-400' : 'bg-indigo-500'}`}></div>
                <span>Asistencia</span>
                <svg className={`w-3 h-3 transition-transform duration-300 ${showAsistencia ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M19 9l-7 7-7-7"/>
                </svg>
              </button>

              {/* MENÚ FLOTANTE ASISTENCIA */}
              {showAsistencia && (
                <div className="absolute right-0 mt-3 w-64 bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white p-5 z-50 animate-in fade-in zoom-in duration-200 origin-top-right">
                  <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 px-2">Estatus Hoy</h3>
                  <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto pr-1">
                    {estatusPropuestasHoy.map((worker, idx) => (
                      <div 
                        key={idx} 
                        className={`flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all ${
                          worker.enviado 
                            ? "bg-emerald-50/50 border-emerald-100 text-emerald-700" 
                            : "bg-red-50/50 border-red-100 text-red-600"
                        }`}
                      >
                        <span className="text-[10px] font-black uppercase truncate mr-2">{worker.nombre}</span>
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${worker.enviado ? "bg-emerald-500" : "bg-red-500"}`}></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* GRILLA DE PROPUESTAS */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
        {Object.entries(agrupados).map(([key, grupo]) => (
          <div key={key} className="bg-white rounded-[2.5rem] shadow-xl border border-white overflow-hidden flex flex-col transition-transform hover:scale-[1.01]">
            {/* HEADER */}
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <h2 className="font-black uppercase text-lg italic tracking-tighter">{grupo.titulo}</h2>
              <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black">{grupo.tareas.length}</span>
            </div>
            
            {/* TAREAS PROPUESTAS */}
            <div className="p-6 space-y-3 flex-1 overflow-y-auto max-h-[220px] bg-white">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Plan Propuesto:</p>
              {grupo.tareas.map(t => (
                <div key={t.id} className="group p-3 rounded-2xl bg-slate-50 border border-slate-100 flex justify-between items-center hover:border-red-200 transition-colors">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-[8px] font-black text-[#37788a] uppercase truncate">{t.tareas?.proyecto}</p>
                    <p className="text-[11px] font-bold text-slate-800 leading-tight truncate">{t.tareas?.codigos_tarea?.codigo || t.tareas?.entregable}</p>
                  </div>
                  <button 
                    onClick={() => quitarTarea(t.id)} 
                    className="p-2 text-slate-300 hover:text-red-500 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M20 12H4"/></svg>
                  </button>
                </div>
              ))}
            </div>

            {/* SUGERIR TAREAS DESDE BACKLOG */}
            <div className="px-6 py-4 bg-slate-50/80 border-t border-b border-slate-100">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Sugerir Pendientes (Click para añadir)
              </p>
              
              <div className="flex gap-3 overflow-x-auto pb-3 snap-x">
                {backlogs[key]?.filter(b => !grupo.tareas.some(t => t.tareas?.id === b.id)).length > 0 ? (
                  backlogs[key]
                    .filter(tareaBacklog => !grupo.tareas.some(tareaPlan => tareaPlan.tareas?.id === tareaBacklog.id))
                    .map(tarea => (
                      <button 
                        key={tarea.id}
                        onClick={() => agregarTareaPlan(key, tarea)}
                        className="snap-start shrink-0 w-32 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all group"
                      >
                        <p className="text-[7px] font-black text-slate-400 uppercase truncate mb-1">{tarea.proyecto}</p>
                        <p className="text-[9px] font-extrabold text-slate-700 leading-tight h-7 line-clamp-2 mb-2">
                          {tarea.codigos_tarea?.codigo || tarea.entregable}
                        </p>
                        <div className="flex justify-center text-emerald-500 group-hover:scale-125 transition-transform">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M12 4v16m8-8H4"/>
                          </svg>
                        </div>
                      </button>
                    ))
                ) : (
                  <div className="w-full text-center py-4 bg-white/50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
                      {backlogs[key]?.length === 0 ? "Sin tareas en backlog" : "Todas las tareas asignadas"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ACCIONES DE APROBACIÓN */}
            <div className="p-6 bg-white space-y-3">
              <textarea 
                placeholder="Comentario de revisión..."
                className="w-full text-[10px] font-bold p-3 rounded-xl border-none shadow-inner bg-slate-50 outline-none focus:ring-1 focus:ring-slate-200 transition-all"
                onChange={(e) => setComentarios({...comentarios, [key]: e.target.value})}
                rows="2"
              />
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => procesarJornada(key, 'aprobado')} 
                  className="bg-[#37788a] text-white py-3.5 rounded-xl font-black text-[10px] uppercase shadow-lg shadow-[#37788a]/20 hover:bg-[#2d6372] active:scale-95 transition-all"
                >
                  Aprobar
                </button>
                <button 
                  onClick={() => procesarJornada(key, 'rechazado')} 
                  className="bg-white text-red-500 border border-red-100 py-3.5 rounded-xl font-black text-[10px] uppercase hover:bg-red-50 active:scale-95 transition-all"
                >
                  Rechazar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* HISTORIAL */}
      <section className="max-w-7xl mx-auto mt-24">
        <div className="flex items-center gap-6 mb-12">
          <div className="bg-slate-900 text-white p-4 rounded-3xl rotate-3">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div>
            <h2 className="text-3xl font-black uppercase italic tracking-tighter leading-none">Historial de Ejecución</h2>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Análisis de rendimiento y carga horaria</p>
          </div>
          <div className="h-[1px] flex-1 bg-gradient-to-r from-slate-200 to-transparent"></div>
        </div>

        <div className="grid gap-6">
          {Object.entries(historialAgrupado).map(([fecha, data]) => (
            <details key={fecha} className="group bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm transition-all hover:shadow-md">
              <summary className="flex flex-wrap items-center justify-between p-8 cursor-pointer hover:bg-slate-50/50">
                <div className="flex items-center gap-10">
                  <span className="text-xl font-black text-slate-800 tabular-nums">{fecha}</span>
                  <div className="flex gap-4">
                    <div className="flex flex-col">
                      <span className="text-[8px] font-black text-slate-400 uppercase">HH Invertidas</span>
                      <span className="text-sm font-black text-[#37788a]">{data.totalHH.toFixed(1)} hrs</span>
                    </div>
                    <div className="flex flex-col border-l border-slate-200 pl-4">
                        <span className="text-[8px] font-black text-slate-400 uppercase">Avance Prom.</span>
                        <span className="text-sm font-black text-slate-800">{(data.avgProg / data.items.length).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{data.items.length} tareas</span>
                    <div className="text-slate-300 group-open:rotate-180 transition-transform duration-300 bg-slate-100 p-2 rounded-full">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"/></svg>
                    </div>
                </div>
              </summary>

              <div className="p-8 border-t border-slate-100 bg-slate-50/40">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {data.items.map(h => (
                    <div key={h.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                            <span className="text-[9px] font-black bg-slate-900 text-white px-3 py-1 rounded-full uppercase">{h.perfiles?.nombre}</span>
                            <span className={`text-[8px] font-black px-2 py-1 rounded uppercase ${h.estado_plan_id === 'aprobado' ? 'text-green-500' : 'text-red-500'}`}>
                              ● {h.estado_plan_id}
                            </span>
                        </div>
                        <h4 className="text-sm font-black text-slate-800 uppercase leading-tight mb-1">{h.tareas?.codigos_tarea?.codigo}</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-4">{h.tareas?.proyecto}</p>
                        
                        <div className="flex gap-3 mb-4">
                           <div className="flex-1 bg-slate-50 rounded-2xl p-3 text-center">
                              <p className="text-[7px] font-black text-slate-400 uppercase">Horas</p>
                              <p className="text-xs font-black text-slate-800">{h.horas_reales || 0}h</p>
                           </div>
                           <div className="flex-1 bg-slate-50 rounded-2xl p-3 text-center">
                              <p className="text-[7px] font-black text-slate-400 uppercase">Avance</p>
                              <p className="text-xs font-black text-slate-800">{h.progreso_reportado || 0}%</p>
                           </div>
                        </div>

                        {h.comentarios_cierre && (
                          <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                            <p className="text-[8px] font-black text-blue-400 uppercase mb-1 italic">Reporte del Trabajador:</p>
                            <p className="text-[11px] text-slate-600 font-medium leading-relaxed">"{h.comentarios_cierre}"</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* IMPREVISTOS */}
      <section className="max-w-7xl mx-auto mt-24 mb-20">
        <div className="flex items-center gap-6 mb-12">
          <div className="bg-amber-500 text-white p-4 rounded-3xl -rotate-3 shadow-lg">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </div>
          <div>
            <h2 className="text-3xl font-black uppercase italic tracking-tighter leading-none text-slate-800">Imprevistos del Equipo</h2>
            <p className="text-amber-600 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Sucesos registrados fuera de planificación</p>
          </div>
          <div className="h-[1px] flex-1 bg-gradient-to-r from-amber-200 to-transparent"></div>
        </div>

        <div className="grid gap-8">
          {Object.entries(imprevistosAgrupados).map(([fecha, items]) => (
            <div key={fecha} className="bg-white rounded-[2.5rem] border border-amber-100 overflow-hidden shadow-sm">
              <div className="bg-amber-50/50 px-8 py-4 border-b border-amber-100 flex justify-between items-center">
                <span className="text-lg font-black text-slate-800 tabular-nums">{fecha}</span>
                <span className="bg-white/50 px-3 py-1 rounded-full text-[10px] font-black text-amber-600 uppercase tracking-widest">{items.length} Eventos</span>
              </div>
              <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.map(inc => (
                  <div key={inc.id} className="bg-white border border-slate-100 p-6 rounded-3xl relative hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-[9px] font-black bg-amber-500 text-white px-3 py-1 rounded-full uppercase italic">
                        {inc.tipo}
                      </span>
                      <span className="text-[10px] font-black text-slate-400 uppercase">
                        {inc.horas_afectadas} hrs
                      </span>
                    </div>
                    <h4 className="text-[11px] font-black text-slate-800 uppercase mb-3">
                      {inc.perfiles?.nombre} {inc.perfiles?.apellido}
                    </h4>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner">
                      <p className="text-[11px] text-slate-600 font-medium leading-relaxed italic">"{inc.descripcion}"</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {incidenciasRaw.length === 0 && (
            <div className="text-center py-20 bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
               <p className="text-slate-300 font-black uppercase tracking-widest text-xs">Sin registros de imprevistos</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}