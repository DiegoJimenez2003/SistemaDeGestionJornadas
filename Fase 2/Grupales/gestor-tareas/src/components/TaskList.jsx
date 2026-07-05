import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient"; 

export default function SuperTaskManager() {
  const [tasks, setTasks] = useState([]); 
  const [dailyPlan, setDailyPlan] = useState([]); 
  const [isSent, setIsSent] = useState(false);
  const [loading, setLoading] = useState(true);

  // Control de Evidencias
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  // Modales
  const [showReportingModal, setShowReportingModal] = useState(null);
  const [showEventModal, setShowEventModal] = useState(false);

  // Formulario Reporte
  const [progreso, setProgreso] = useState(0);
  const [horas, setHoras] = useState(2);
  const [comentario, setComentario] = useState("");

  // Eventos/Imprevistos
  const [evento, setEvento] = useState({ tipo: "Incidencia Técnica", desc: "", hh: 1 });

  const getToday = () => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santiago",
    }).format(new Date());
  };

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error("❌ NO HAY USUARIO LOGUEADO");
        return setLoading(false);
      }
      
      const hoy = getToday();

      // 1. Obtener los códigos asignados
      const { data: asignaciones, error: errorAsignadas } = await supabase
        .from("tareas_asignadas")
        .select("*")
        .eq("usuario_id", user.id);

      if (errorAsignadas) console.error("❌ Error en tareas_asignadas:", errorAsignadas);

      const { data: todosLosCodigos } = await supabase.from("codigos_tarea").select("*");

      // Traemos el historial de ejecución real de las tareas
      const { data: tareasMetadatos } = await supabase
        .from("tareas")
        .select("*")
        .eq("usuario_id", user.id);

      const safeAsignaciones = asignaciones || [];
      const safeCodigos = todosLosCodigos || [];
      const safeMetadatos = tareasMetadatos || [];

      // Generamos el backlog inicial cruzando asignaciones con códigos y metadatos
      const backlogFiltrado = safeAsignaciones
        .map(asig => {
          const codigoRelacionado = safeCodigos.find(c => Number(c.id) === Number(asig.codigo_id));
          const metaRelacionado = safeMetadatos.find(t => Number(t.codigo_id) === Number(asig.codigo_id));
          
          return {
            id: metaRelacionado?.id || null, 
            asignacion_id: asig.id,
            codigo_id: asig.codigo_id,
            codigo: codigoRelacionado?.codigo || "S/C", 
            descripcion: codigoRelacionado?.descripcion || "Sin descripción",
            proyecto: codigoRelacionado?.proyecto || "Proyecto Desconocido",
            proyecto_id: codigoRelacionado?.proyecto_id,
            entregable: codigoRelacionado?.entregable || "General",
            importancia: metaRelacionado?.importancia_id || "media",
            urgencia: metaRelacionado?.urgencia_id || "baja",
            dificultad: metaRelacionado?.dificultad_id || "media",
            prioritaria: metaRelacionado?.prioritaria || false,
            horas_acumuladas: metaRelacionado?.horas || 0, // 🌟 Renombrado para claridad (suma acumulada histórica)
            fecha_vencimiento: metaRelacionado?.fecha_vencimiento || "Sin Fecha",
            estado_real: metaRelacionado?.estado_id || "en_progreso", 
            revision: metaRelacionado?.revision_id || "pendiente"    
          };
        })
        // 🔥 FILTRO CRÍTICO: Remueve del backlog SÓLO si ya está completada e historial aprobado por admin
        .filter(task => !(task.estado_real === "completada" && task.revision === "aprobada"));

      setTasks(backlogFiltrado);

      // 2. Planificación del día
      const { data: planData } = await supabase
        .from("planificacion_diaria")
        .select("*")
        .eq("usuario_id", user.id)
        .eq("fecha", hoy);

      const safePlan = planData || [];
      if (safePlan.length > 0) {
        const mappedPlan = safePlan.map(registro => {
          const metaReal = safeMetadatos.find(m => Number(m.id) === Number(registro.tarea_id));
          const codigoRelacionado = safeCodigos.find(c => Number(c.id) === Number(metaReal?.codigo_id));
          
          return {
            id: registro.tarea_id,
            codigo_id: metaReal?.codigo_id,
            codigo: codigoRelacionado?.codigo || "S/C",
            descripcion: codigoRelacionado?.descripcion || "Tarea de Planificación",
            proyecto: codigoRelacionado?.proyecto || "General",
            entregable: codigoRelacionado?.entregable || "General",
            plan_id: registro.id, 
            tarea_id: registro.tarea_id, 
            estado_plan_id: registro.estado_plan_id, 
            progreso_actual: registro.progreso_reportado || 0,
            horas_hoy: registro.horas_reales || 0, // 🔍 Horas registradas específicamente en este día
            comentario_admin: registro.comentario_admin,
            ya_reportado: registro.horas_reales > 0 || registro.progreso_reportado > 0 // 🔑 Bandera de bloqueo para el botón
          };
        });

        setDailyPlan(mappedPlan);

        // Si hay tareas vigentes propuestas, aprobadas o finalizadas de hoy, bloqueamos el backlog
        const tieneTareasVivas = mappedPlan.some(item => 
          item.estado_plan_id === 'propuesto' || 
          item.estado_plan_id === 'aprobado'
        );

        setIsSent(tieneTareasVivas);
      } else {
        setDailyPlan([]);
        setIsSent(false);
      }

    } catch (err) {
      console.error("Error en el proceso:", err);
    } finally {
      setLoading(false);
    }
  }

  const toggleTaskInPlan = (task) => {
    if (isSent) return;
    setDailyPlan((prev) => {
      const exists = prev.find((t) => String(t.codigo_id) === String(task.codigo_id));
      return exists ? prev.filter((t) => String(t.codigo_id) !== String(task.codigo_id)) : [...prev, task];
    });
  };

  const handleSendProposal = async () => {
    if (dailyPlan.length === 0) return alert("Selecciona tareas del Backlog primero.");
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return alert("Sesión inválida.");
      
      const hoy = getToday();

      // Limpieza de registros rechazados anteriores de hoy
      const { error: errorClean } = await supabase
        .from("planificacion_diaria")
        .delete()
        .eq("usuario_id", user.id)
        .eq("fecha", hoy)
        .eq("estado_plan_id", "rechazado");

      if (errorClean) console.error("Error al limpiar plan rechazado:", errorClean);

      const registrosPlan = [];

      for (const t of dailyPlan) {
        let tareaRealId = null;

        const { data: tareaExistente } = await supabase
          .from("tareas")
          .select("id")
          .eq("usuario_id", user.id)
          .eq("codigo_id", t.codigo_id)
          .maybeSingle();

        if (tareaExistente) {
          tareaRealId = tareaExistente.id;
        } else {
          const { data: nuevaTarea, error: errorInsertTarea } = await supabase
            .from("tareas")
            .insert([{
              usuario_id: user.id,
              codigo_id: t.codigo_id,
              proyecto_id: t.proyecto_id || null,
              estado_id: "en_progreso",
              fecha: hoy,
              revision_id: "pendiente",
              horas: 0 // Base inicia en cero horas acumuladas
            }])
            .select("id")
            .single();

          if (errorInsertTarea) throw errorInsertTarea;
          tareaRealId = nuevaTarea.id;
        }

        registrosPlan.push({
          usuario_id: user.id,
          tarea_id: tareaRealId, 
          estado_plan_id: "propuesto", 
          fecha: hoy,
          progreso_reportado: 0,
          horas_reales: 0
        });
      }

      const { error: errorPlan } = await supabase.from("planificacion_diaria").insert(registrosPlan);
      if (errorPlan) throw errorPlan;

      alert("Jornada enviada al Administrador. Estado: Esperando Aprobación.");
      await fetchData();
    } catch (err) {
      alert("Error al enviar jornada: " + err.message);
    }
  };

  const submitTaskReport = async () => {
    try {
      setUploading(true);
      let fileUrl = null;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sin sesión activa");

      if (file) {
        const userIdentifier = user.email ? user.email.split('@')[0].replace(/[.]/g, '_') : user.id;
        const filePath = `${userIdentifier}/${Date.now()}_${file.name.replace(/\s/g, '_')}`;

        const { error: uploadError } = await supabase.storage
          .from('evidencias_tareas')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('evidencias_tareas').getPublicUrl(filePath);
        fileUrl = publicUrl;
      }

      // 🔍 LÓGICA DE ACUMULACIÓN DE HORAS HISTÓRICAS
      // Primero consultamos cuántas horas llevaba acumuladas esta tarea en días anteriores
      const { data: tareaActual, error: errorFetchTarea } = await supabase
        .from("tareas")
        .select("horas")
        .eq("id", showReportingModal.tarea_id)
        .single();

      if (errorFetchTarea) throw errorFetchTarea;

      const horasAnteriores = parseFloat(tareaActual?.horas || 0);
      const horasNuevasDeHoy = parseFloat(horas);
      const totalHorasAcumuladas = horasAnteriores + horasNuevasDeHoy; // 🌟 SUMA DE LOS DOS O MÁS REPORTES

      // Determinar estado final de la tarea global
      const estadoTareaGlobal = parseInt(progreso) >= 100 ? "completada" : "en_progreso";

      // 1. Actualizar la ejecución real acumulada en la tabla `tareas`
      const { error: errorTarea } = await supabase
        .from("tareas")
        .update({
          estado_id: estadoTareaGlobal,
          horas: totalHorasAcumuladas, // Guardamos el total sumado e histórico
          evidencia_url: fileUrl || tareaActual?.evidencia_url
        })
        .eq("id", showReportingModal.tarea_id);

      if (errorTarea) throw errorTarea;

      // 2. Actualizar planificacion_diaria para congelar de forma aislada el día de HOY
      const { error: errorPlan } = await supabase
        .from("planificacion_diaria")
        .update({
          horas_reales: horasNuevasDeHoy, // Guarda solo las horas dedicadas HOY
          progreso_reportado: parseInt(progreso), 
          comentarios_cierre: comentario,
          evidencia_url: fileUrl,
          estado_plan_id: "aprobado" // Mantenemos "aprobado" para respetar la FK maestra de tu BD
        })
        .eq("id", showReportingModal.plan_id);

      if (errorPlan) throw errorPlan;

      setShowReportingModal(null);
      setProgreso(0);
      setComentario("");
      setFile(null);
      await fetchData();
      alert("¡Reporte diario guardado y horas acumuladas con éxito!");

    } catch (err) {
      console.error("❌ Error detallado al reportar:", err.message || err);
      alert("Error al guardar horas: " + (err.message || "Error desconocido"));
    } finally {
      setUploading(false);
    }
  };

  const saveEvent = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!evento.desc.trim()) return alert("Describe el suceso.");

      const { error } = await supabase.from("eventos_jornada").insert([{
        usuario_id: user.id,
        tipo: evento.tipo,
        descripcion: evento.desc,
        horas_afectadas: parseFloat(evento.hh),
        fecha: getToday()
      }]);

      if (error) throw error;
      alert("Evento registrado");
      setShowEventModal(false);
      setEvento({ tipo: "Incidencia Técnica", desc: "", hh: 1 });
      await fetchData();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  if (loading) return <div className="p-20 text-center font-bold text-cyan-700 animate-pulse">CARGANDO MÓDULOS...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* BACKLOG */}
        <div className={`lg:col-span-7 space-y-6 transition-all duration-500 ${isSent ? 'opacity-40 grayscale-[0.8] pointer-events-none' : ''}`}>
          <header className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-black text-slate-900 uppercase italic tracking-tighter">Backlog</h1>
              <p className="text-[#37788a] text-[10px] font-black uppercase tracking-[0.3em]">Mis Códigos Asignados</p>
            </div>
            {isSent && <span className="bg-slate-900 text-white px-4 py-2 rounded-full text-[10px] font-black uppercase italic animate-pulse">Jornada enviada</span>}
          </header>

          <div className="grid gap-3">
            {tasks.map(task => {
              const inPlan = dailyPlan.find(d => String(d.codigo_id) === String(task.codigo_id));
              return (
                <div key={task.codigo_id} className={`bg-white p-6 rounded-[2.5rem] border-2 transition-all ${inPlan ? 'border-[#37788a] shadow-xl' : 'border-transparent shadow-sm'}`}>
                  <div className="flex justify-between items-start">
                    <div className="space-y-3 flex-1">
                      <div className="flex flex-wrap gap-2">
                        <span className="bg-slate-900 text-white text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-tighter">
                          {task.codigo || 'S/C'}
                        </span>
                        <span className={`text-[8px] font-black px-2 py-1 rounded-md uppercase ${task.estado_real === 'completada' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                          {task.estado_real === 'completada' ? 'Completada (Falta aprobación)' : `En Progreso (${task.progreso_actual || 0}%)`}
                        </span>
                      </div>
                      
                      <h3 className="font-black text-slate-800 text-lg leading-tight uppercase">{task.descripcion || "Sin Descripción"}</h3>
                      
                      <div className="flex gap-2">
                        <span className="text-[9px] font-black px-3 py-1 bg-slate-100 rounded-lg uppercase text-slate-600">Imp: {task.importancia}</span>
                        <span className="text-[9px] font-black px-3 py-1 bg-slate-100 rounded-lg uppercase text-slate-600">Urg: {task.urgencia}</span>
                        <span className="text-[9px] font-black px-3 py-1 bg-slate-100 rounded-lg uppercase text-slate-600">Dif: {task.dificultad}</span>
                      </div>

                      <div className="flex items-center gap-4">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{task.proyecto || "General"}</p>
                        <span className="text-[9px] font-black text-[#37788a] uppercase">Total Acumulado: {task.horas_acumuladas || 0} HH</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => toggleTaskInPlan(task)} 
                      className={`ml-4 px-6 py-3 rounded-2xl font-black text-[10px] uppercase transition-all ${inPlan ? 'bg-red-500 text-white shadow-lg shadow-red-200' : 'bg-slate-100 text-slate-600'}`}
                    >
                      {inPlan ? "Quitar" : "Incluir"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* JORNADA DIARIA */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#37788a] rounded-[3.5rem] p-10 text-white shadow-2xl sticky top-8 border-4 border-white/20">
            <div className="flex justify-between items-center mb-10">
              <div>
                <h2 className="text-3xl font-black italic uppercase tracking-tighter leading-none">Mi Jornada</h2>
                <p className="text-[10px] font-black text-white/50 uppercase mt-2 tracking-widest">{getToday()}</p>
              </div>
              <button onClick={() => setShowEventModal(true)} className="bg-white/10 hover:bg-white/30 p-4 rounded-3xl transition-all active:scale-90">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </button>
            </div>

            {dailyPlan.some(item => item.estado_plan_id === 'rechazado') && (
              <div className="mb-6 p-4 bg-red-600/30 border border-red-400/50 rounded-3xl text-[11px] font-bold text-red-100 backdrop-blur-md">
                ⚠️ <span className="uppercase font-black text-white">Tu planificación fue rechazada.</span> Corrige o cambia las tareas desde el Backlog y vuelve a enviarla.
                {dailyPlan.find(item => item.comentario_admin)?.comentario_admin && (
                  <p className="mt-2 text-white italic bg-black/20 p-2 rounded-xl text-[10px]">
                    "Motivo: {dailyPlan.find(item => item.comentario_admin).comentario_admin}"
                  </p>
                )}
              </div>
            )}

            <div className="space-y-4 min-h-[300px]">
              {dailyPlan.map(item => (
                <div key={item.plan_id || item.codigo_id} className="bg-white/10 backdrop-blur-2xl p-6 rounded-[2.5rem] border border-white/10 group transition-all">
                  <div className="flex justify-between items-center">
                    <div className="max-w-[65%]">
                        <span className="text-[8px] font-black text-white/40 uppercase block mb-1">
                          {item.codigo || 'S/C'}
                        </span>
                        <p className="font-black text-sm uppercase leading-tight">{item.descripcion || "Tarea de Planificación"}</p>
                        {item.ya_reportado && (
                          <span className="text-[9px] block text-cyan-200 mt-1 font-bold">
                            Reportado hoy: {item.horas_hoy} HH ({item.progreso_actual}%)
                          </span>
                        )}
                    </div>
                    
                    {item.estado_plan_id === 'aprobado' ? (
                      /* 🔑 CONTROL DE BLOQUEO CRÍTICO: Si ya fue reportado hoy, se bloquea sin importar el porcentaje */
                      item.ya_reportado ? (
                        <div className={`p-3 rounded-2xl font-black text-[9px] uppercase italic tracking-widest text-center border ${
                          item.progreso_actual >= 100 
                            ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30' 
                            : 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                        }`}>
                          {item.progreso_actual >= 100 ? "Completada" : "Reportada"}
                        </div>
                      ) : (
                        <button onClick={() => {
                          setProgreso(item.progreso_actual || 0);
                          setShowReportingModal(item);
                        }} className="bg-white text-[#37788a] px-5 py-3 rounded-2xl text-[10px] font-black uppercase shadow-xl hover:bg-orange-400 hover:text-white transition-all">
                          Reportar
                        </button>
                      )
                    ) : item.estado_plan_id === 'rechazado' ? (
                      <span className="text-[9px] font-black uppercase text-red-300 bg-red-900/40 px-3 py-1 rounded-xl italic">Rechazado</span>
                    ) : (
                      <span className="text-[8px] font-black uppercase text-orange-200 animate-pulse italic">En Revisión</span>
                    )}
                  </div>
                </div>
              ))}

              {dailyPlan.length === 0 && (
                <div className="h-64 flex items-center justify-center border-2 border-dashed border-white/10 rounded-[3rem]">
                  <p className="text-white/20 text-xs font-black uppercase tracking-widest text-center leading-loose">No hay tareas<br/>seleccionadas</p>
                </div>
              )}
            </div>

            <div className="pt-10">
              {!isSent ? (
                <button onClick={handleSendProposal} className="w-full bg-orange-400 hover:bg-orange-500 py-7 rounded-[2.5rem] font-black uppercase text-sm tracking-[0.2em] shadow-2xl transition-all transform active:scale-95">
                  {dailyPlan.some(item => item.estado_plan_id === 'rechazado') ? "Reenviar Jornada" : "Activar Jornada"}
                </button>
              ) : (
                <div className="text-center p-6 bg-slate-900/30 rounded-[2.5rem] border border-white/5 backdrop-blur-lg">
                  <p className="text-[11px] font-black text-white uppercase tracking-[0.4em]">Control de Jornada Activo</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DE REPORTE DIARIO */}
      {showReportingModal && (
        <div className="fixed inset-0 bg-slate-900/95 flex items-center justify-center z-50 p-6 backdrop-blur-xl">
           <div className="bg-white p-10 rounded-[4rem] w-full max-w-lg shadow-2xl border-b-[12px] border-[#37788a]">
              <header className="mb-8 text-center">
                <div className="flex flex-col items-center gap-2">
                  <span className="bg-slate-900 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                    {showReportingModal.codigo}
                  </span>
                  <h3 className="font-black uppercase tracking-tighter text-3xl text-slate-800 mt-2 leading-none">
                    {showReportingModal.descripcion}
                  </h3>
                </div>
              </header>
              
              <div className="space-y-6">
                <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 shadow-inner">
                  <div className="flex justify-between items-center mb-6">
                    <label className="text-[10px] font-black uppercase text-slate-400">Progreso Total Actual</label>
                    <span className="font-black text-4xl text-[#37788a]">{progreso}%</span>
                  </div>
                  <input type="range" className="w-full h-3 bg-slate-200 rounded-full appearance-none accent-[#37788a] cursor-pointer" value={progreso} onChange={(e) => setProgreso(e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-6">
                   <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-2">Horas de Hoy</label>
                    <input type="number" step="0.5" className="w-full bg-transparent font-black text-3xl outline-none text-slate-800" value={horas} onChange={(e) => setHoras(e.target.value)} />
                   </div>
                   <div className="bg-slate-900 p-6 rounded-3xl flex flex-col justify-center items-center">
                    <label className="text-[10px] font-black uppercase text-slate-400 mb-2">Estado Resultante</label>
                    <span className="text-white font-black text-xs uppercase italic tracking-tighter">
                      {parseInt(progreso) >= 100 ? "Completada" : "En Progreso"}
                    </span>
                   </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-3xl border border-dashed border-slate-300">
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-2">Evidencia</label>
                  <input 
                    type="file" 
                    onChange={(e) => setFile(e.target.files[0])}
                    className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-[#37788a] file:text-white cursor-pointer"
                  />
                </div>

                <textarea 
                  className="w-full p-6 bg-slate-50 border border-slate-100 rounded-3xl text-sm font-medium outline-none h-24 resize-none" 
                  placeholder="Observaciones de hoy..." 
                  value={comentario} 
                  onChange={(e) => setComentario(e.target.value)} 
                />

                <div className="flex flex-col gap-4">
                  <button 
                    onClick={submitTaskReport} 
                    disabled={uploading}
                    className="w-full bg-[#37788a] text-white py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-widest shadow-xl transition-all"
                  >
                    {uploading ? "Subiendo..." : "Sincronizar Reporte"}
                  </button>                  
                  <button onClick={() => setShowReportingModal(null)} className="text-slate-400 font-black text-[10px] uppercase tracking-widest">Cancelar</button>
                </div>
              </div>
           </div>
        </div>
      )}

      {/* MODAL DE INCIDENCIAS */}
      {showEventModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-[4rem] p-12 max-w-sm w-full space-y-8 shadow-2xl">
            <h3 className="text-3xl font-black uppercase text-slate-800 italic tracking-tighter text-center">Imprevisto</h3>
            <div className="space-y-6">
              <select className="w-full p-5 bg-slate-50 border border-slate-200 rounded-3xl font-black text-xs uppercase outline-none" value={evento.tipo} onChange={(e) => setEvento({...evento, tipo: e.target.value})}>
                <option value="Incidencia Técnica">Incidencia Técnica</option>
                <option value="Ineficiencia">Ineficiencia</option>
                <option value="Tarea No Programada">Tarea No Programada</option>
                <option value="Permiso Administrativo">Permiso Administrativo</option>
                <option value="Falta de Material">Falta de Material</option>
                <option value="Clima/Entorno">Clima/Entorno</option>
              </select>
              <textarea placeholder="Describe el suceso..." className="w-full p-6 bg-slate-50 border border-slate-200 rounded-3xl h-32 text-sm outline-none" value={evento.desc} onChange={(e) => setEvento({...evento, desc: e.target.value})} />
              <div className="flex items-center gap-4 bg-slate-100 p-5 rounded-3xl">
                <span className="text-[10px] font-black uppercase text-slate-400">HH</span>
                <input type="number" step="0.5" className="bg-transparent font-black text-xl w-full text-right outline-none" value={evento.hh} onChange={(e) => setEvento({...evento, hh: e.target.value})} />
              </div>
            </div>
            <div className="space-y-4">
                <button onClick={saveEvent} className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black uppercase text-[10px] tracking-widest">Registrar</button>
                <button onClick={() => setShowEventModal(false)} className="w-full text-slate-400 font-black text-[10px] uppercase text-center">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}