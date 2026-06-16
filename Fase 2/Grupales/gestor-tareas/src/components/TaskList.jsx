import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function SuperTaskManager() {
  const [tasks, setTasks] = useState([]); // Backlog
  const [dailyPlan, setDailyPlan] = useState([]); // Plan del día
  const [isSent, setIsSent] = useState(false);
  const [loading, setLoading] = useState(true);

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  // Modales
  const [showReportingModal, setShowReportingModal] = useState(null);
  const [showEventModal, setShowEventModal] = useState(false);

  // Estados para Reporte de Tarea
  const [progreso, setProgreso] = useState(0);
  const [horas, setHoras] = useState(2);
  const [comentario, setComentario] = useState("");

  // Estado para Eventos
  const [evento, setEvento] = useState({ tipo: "Incidencia", desc: "", hh: 1 });

  const getToday = () => new Date().toISOString().split("T")[0];

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn("⚠️ DEBUG: No se encontró ningún usuario logueado en Supabase.");
      return setLoading(false);
    }

    const hoy = getToday();

    // 1. Cargar Planificación del día
    const { data: planHoy, error: errorPlanHoy } = await supabase
      .from("planificacion_diaria")
      .select(`
        id,
        estado_plan,
        progreso_reportado,
        tarea_id,
        comentario_admin,
        tareas (
          id, entregable, proyecto, estado, revision, horas,
          importancia, urgencia, dificultad,
          codigos_tarea (codigo)
        )
      `)
      .eq("usuario_id", user.id)
      .eq("fecha", hoy);

    if (errorPlanHoy) {
      console.error("❌ DEBUG ERROR [planificacion_diaria]:", errorPlanHoy);
    }

    const planEsValido = planHoy && planHoy.length > 0 && planHoy.some(p => p.estado_plan !== 'rechazado');

    if (planEsValido) {
      const formatted = planHoy.map(p => ({
        ...p.tareas,
        plan_id: p.id,
        estado_plan: p.estado_plan,
        progreso_actual: p.progreso_reportado,
        comentario_admin: p.comentario_admin
      }));
      setDailyPlan(formatted);
      setIsSent(true); 
    } else {
      setDailyPlan([]);
      setIsSent(false); 
    }

    // 2. Cargar Backlog de Tareas Asignadas (Filtro Corregido)
    const { data: backlog, error: errorBacklog } = await supabase
      .from("tareas")
      .select(`
        *, 
        codigos_tarea (
          id, codigo, descripcion,
          tareas ( estado, revision )
        )
      `)
      .eq("usuario_id", user.id)
      .order("id", { ascending: false });

    console.log("--- 🕵️‍♂️ INICIO DE CONTROL DEBUG DE TAREAS ---");
    console.log("1. ID del usuario logueado actual:", user.id);
    console.log("2. ¿Hubo error de Supabase al traer tareas?:", errorBacklog || "Ninguno. Todo OK con el servidor.");
    console.log("3. Tareas 'crudas' devueltas por la Base de Datos:", backlog);

    if (backlog) {
      // CORRECCIÓN: La tarea solo se oculta si ya se completó Y fue aprobada por el admin.
      // De lo contrario, permanecerá visible en tu Backlog para que puedas seguir sumando horas.
      const finalTasks = backlog.filter(tarea => {
        const terminadaYArchivada = tarea.estado === "Completada" && tarea.revision === "aprobada";
        return !terminadaYArchivada; 
      });
      
      console.log("4. Tareas finales tras filtros de React (lo que debería pintarse):", finalTasks);
      console.log("--- 🕵️‍♂️ FIN DE CONTROL DEBUG TAREAS ---");
      
      setTasks(finalTasks);
    } else {
      console.log("4. Tareas finales: El backlog vino nulo.");
      console.log("--- 🕵️‍♂️ FIN DE CONTROL DEBUG TAREAS ---");
    }

    setLoading(false);
  }

  const toggleTaskInPlan = (task) => {
    if (isSent) return;
    setDailyPlan((prev) => {
      const exists = prev.find((t) => t.id === task.id);
      return exists ? prev.filter((t) => t.id !== task.id) : [...prev, task];
    });
  };

  const handleSendProposal = async () => {
    if (dailyPlan.length === 0) return alert("Selecciona tareas primero.");
    const { data: { user } } = await supabase.auth.getUser();

    const registros = dailyPlan.map(t => ({
      usuario_id: user.id,
      tarea_id: t.id,
      estado_plan: "propuesto", 
      fecha: getToday(),
      progreso_reportado: 0
    }));

    const { error } = await supabase.from("planificacion_diaria").insert(registros);

    if (!error) {
      alert("Plan enviado. Pendiente de aprobación por el Administrador.");
      fetchData();
    } else {
      alert("Error: " + error.message);
    }
  };

  const submitTaskReport = async () => {
    try {
      setUploading(true);
      let fileUrl = null;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No hay sesión activa");

      const userIdentifier = user.email 
        ? user.email.split('@')[0].replace(/[.]/g, '_') 
        : user.id;

      const userFolder = userIdentifier; 

      if (file) {
        const timestamp = Date.now();
        const fileName = `${timestamp}_${file.name.replace(/\s/g, '_')}`;
        const filePath = `${userFolder}/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('evidencias_tareas')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false 
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('evidencias_tareas')
          .getPublicUrl(filePath);
        
        fileUrl = publicUrl;

        const blobUrl = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', file.name);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      }

      let nuevoEstado = parseInt(progreso) >= 100 ? "Completada" : "En Progreso";
      const horasNum = parseFloat(horas);
      const horasPrevias = parseFloat(showReportingModal.horas || 0);

      const { error: errorPlan } = await supabase
        .from("planificacion_diaria")
        .update({
          horas_reales: horasNum,
          progreso_reportado: progreso,
          comentarios_cierre: comentario,
          evidencia_url: fileUrl, 
          estado_plan: "finalizado"
        })
        .eq("id", showReportingModal.plan_id);

      if (errorPlan) throw errorPlan;

      const { error: errorTarea } = await supabase
        .from("tareas")
        .update({
          estado: nuevoEstado,
          horas: horasPrevias + horasNum,
          evidencia_url: fileUrl 
        })
        .eq("id", showReportingModal.id);

      if (errorTarea) throw errorTarea;

      setShowReportingModal(null);
      setProgreso(0);
      setComentario("");
      setFile(null);
      fetchData();
      alert(`Reporte guardado. Archivo organizado en la carpeta de: ${userFolder}`);

    } catch (err) {
      console.error("Error:", err);
      alert("Error al reportar: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const saveEvent = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      if (!evento.desc.trim()) {
        alert("Por favor, describe el suceso.");
        return;
      }

      const { error } = await supabase.from("eventos_jornada").insert([
        {
          usuario_id: user.id,
          tipo: evento.tipo,
          descripcion: evento.desc,
          horas_afectadas: parseFloat(evento.hh), 
          fecha: getToday(),
        },
      ]);

      if (error) throw error;

      alert("Evento registrado con éxito");
      setShowEventModal(false);
      setEvento({ tipo: "Incidencia Técnica", desc: "", hh: 1 }); 
      
    } catch (err) {
      console.error("Error al guardar evento:", err);
      alert("No se pudo registrar: " + (err.message || "Error desconocido"));
    }
  };

  if (loading) return <div className="p-20 text-center font-bold text-cyan-700 animate-pulse">CARGANDO...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* COLUMNA IZQUIERDA: BACKLOG */}
        <div className={`lg:col-span-7 space-y-6 transition-all duration-500 ${isSent ? 'opacity-40 grayscale-[0.8] pointer-events-none' : ''}`}>
          <header className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-black text-slate-900 uppercase italic tracking-tighter">Backlog</h1>
              <p className="text-[#37788a] text-[10px] font-black uppercase tracking-[0.3em]">Total Tareas Pendientes</p>
            </div>
            {isSent && <span className="bg-slate-900 text-white px-4 py-2 rounded-full text-[10px] font-black uppercase italic animate-pulse">Jornada enviada</span>}
          </header>

          <div className="grid gap-3">
            {tasks.map(task => {
              const inPlan = dailyPlan.find(d => d.id === task.id);
              return (
                <div key={task.id} className={`bg-white p-6 rounded-[2.5rem] border-2 transition-all ${inPlan ? 'border-[#37788a] shadow-xl' : 'border-transparent shadow-sm'}`}>
                  <div className="flex justify-between items-start">
                    <div className="space-y-3 flex-1">
                      <div className="flex flex-wrap gap-2">
                        <span className="bg-slate-900 text-white text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-tighter">
                          {task.codigos_tarea?.codigo || 'S/C'}
                        </span>
                        <span className={`text-[8px] font-black px-2 py-1 rounded-md uppercase ${task.prioritaria ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                          {task.prioritaria ? 'Prioritaria' : 'En Backlog'}
                        </span>
                      </div>
                      <h3 className="font-black text-slate-800 text-lg leading-tight uppercase">{task.entregable}</h3>
                      
                      <div className="flex gap-2">
                        <span className="text-[9px] font-black px-3 py-1 bg-slate-100 rounded-lg uppercase text-slate-600">Imp: {task.importancia || 0}</span>
                        <span className="text-[9px] font-black px-3 py-1 bg-slate-100 rounded-lg uppercase text-slate-600">Urg: {task.urgencia || 0}</span>
                        <span className="text-[9px] font-black px-3 py-1 bg-slate-100 rounded-lg uppercase text-slate-600">Dif: {task.dificultad || 0}</span>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <p className="text-xs text-slate-600 font-medium leading-relaxed italic">
                          {task.codigos_tarea?.descripcion || task.descripcion || "Sin descripción adicional registrada."}
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{task.proyecto}</p>
                        <span className="text-[9px] font-black text-[#37788a] uppercase">Acumulado: {task.horas || 0} HH</span>
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

        {/* COLUMNA DERECHA: PANEL DE CONTROL DIARIO */}
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

            <div className="space-y-4 min-h-[300px]">
              {dailyPlan.map(item => (
                <div key={item.id} className="bg-white/10 backdrop-blur-2xl p-6 rounded-[2.5rem] border border-white/10 group transition-all">
                  <div className="flex justify-between items-center">
                    <div className="max-w-[65%]">
                        <span className="text-[8px] font-black text-white/40 uppercase block mb-1">
                          {item.codigos_tarea?.codigo}
                        </span>
                        <p className="font-black text-sm uppercase leading-tight">{item.entregable}</p>
                    </div>
                    
                    {item.estado_plan === 'aprobado' ? (
                      <button onClick={() => setShowReportingModal(item)} className="bg-white text-[#37788a] px-5 py-3 rounded-2xl text-[10px] font-black uppercase shadow-xl hover:bg-orange-400 hover:text-white transition-all">Reportar</button>
                    ) : item.estado_plan === 'finalizado' ? (
                      <div className="p-3 bg-white/20 rounded-2xl text-white font-black text-[9px] uppercase italic tracking-widest">Listo</div>
                    ) : item.estado_plan === 'rechazado' ? (
                      <span className="text-[8px] font-black uppercase text-red-400 italic">Rechazado por Jefe</span>
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

            {dailyPlan.length > 0 && dailyPlan.find(t => t.comentario_admin) && (
              <div className="mt-8 bg-slate-900/40 border border-white/10 p-6 rounded-[2.5rem] backdrop-blur-md">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-2 h-2 bg-amber-400 rounded-full animate-ping" />
                  <p className="text-[9px] font-black text-amber-400 uppercase tracking-[0.2em]">Instrucciones del Administrador</p>
                </div>
                <p className="text-xs text-white/90 font-medium leading-relaxed italic ml-5">
                  "{dailyPlan.find(t => t.comentario_admin)?.comentario_admin}"
                </p>
              </div>
            )}

            <div className="pt-10">
              {!isSent ? (
                <button onClick={handleSendProposal} className="w-full bg-orange-400 hover:bg-orange-500 py-7 rounded-[2.5rem] font-black uppercase text-sm tracking-[0.2em] shadow-2xl transition-all transform active:scale-95">Activar Jornada</button>
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
                    {showReportingModal.codigos_tarea?.codigo}
                  </span>
                  <h3 className="font-black uppercase tracking-tighter text-3xl text-slate-800 mt-2 leading-none">
                    {showReportingModal.entregable}
                  </h3>
                  <div className="flex gap-2 mt-2">
                    <span className="text-[8px] font-black uppercase bg-slate-100 px-2 py-1 rounded text-slate-500">Imp: {showReportingModal.importancia}</span>
                    <span className="text-[8px] font-black uppercase bg-slate-100 px-2 py-1 rounded text-slate-500">Urg: {showReportingModal.urgencia}</span>
                    <span className="text-[8px] font-black uppercase bg-slate-100 px-2 py-1 rounded text-slate-500">Dif: {showReportingModal.dificultad}</span>
                  </div>
                </div>
              </header>
              
              <div className="space-y-6">
                <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 shadow-inner">
                  <div className="flex justify-between items-center mb-6">
                    <label className="text-[10px] font-black uppercase text-slate-400">Progreso</label>
                    <span className="font-black text-4xl text-[#37788a]">{progreso}%</span>
                  </div>
                  <input type="range" className="w-full h-3 bg-slate-200 rounded-full appearance-none accent-[#37788a] cursor-pointer" value={progreso} onChange={(e) => setProgreso(e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-6">
                   <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-2">Horas Hoy</label>
                    <input type="number" className="w-full bg-transparent font-black text-3xl outline-none text-slate-800" value={horas} onChange={(e) => setHoras(e.target.value)} />
                   </div>
                   <div className="bg-slate-900 p-6 rounded-3xl flex flex-col justify-center items-center">
                    <label className="text-[10px] font-black uppercase text-slate-400 mb-2">Siguiente Estado</label>
                    <span className="text-white font-black text-xs uppercase italic tracking-tighter">
                      {progreso >= 100 ? "Completada" : "En Progreso"}
                    </span>
                   </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-3xl border border-dashed border-slate-300">
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-2">
                    Evidencia (Documentos u Imágenes)
                  </label>
                  <input 
                    type="file" 
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
                    onChange={(e) => setFile(e.target.files[0])}
                    className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-[#37788a] file:text-white hover:file:bg-slate-800 cursor-pointer"
                  />
                  {file && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] text-cyan-700 font-bold italic">✓ {file.name}</span>
                      <span className="text-[8px] bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full uppercase font-black">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  )}
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
                    className={`w-full ${uploading ? 'bg-slate-400' : 'bg-[#37788a]'} text-white py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all`}
                  >
                    {uploading ? "Subiendo Archivo..." : "Sincronizar Reporte"}
                  </button>                  
                  <button onClick={() => setShowReportingModal(null)} className="text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-slate-600 transition-colors">Cancelar</button>
                </div>
              </div>
           </div>
        </div>
      )}

      {/* MODAL DE INCIDENCIAS */}
      {showEventModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-[4rem] p-12 max-w-sm w-full space-y-8 shadow-2xl border-t-[10px] border-orange-400">
            <h3 className="text-3xl font-black uppercase text-slate-800 italic tracking-tighter text-center">Imprevisto</h3>
            <div className="space-y-6">
              <select className="w-full p-5 bg-slate-50 border border-slate-200 rounded-3xl font-black text-xs uppercase outline-none focus:ring-2 ring-orange-400/20" onChange={(e) => setEvento({...evento, tipo: e.target.value})}>
                <option>Incidencia Técnica</option>
                <option>Ineficiencia</option>
                <option>Tarea No Programada</option>
                <option>Permiso Administrativo</option>
                <option>Falta de Material</option>
                <option>Clima/Entorno</option>
              </select>
              <textarea placeholder="Describe el suceso..." className="w-full p-6 bg-slate-50 border border-slate-200 rounded-3xl h-32 text-sm outline-none" onChange={(e) => setEvento({...evento, desc: e.target.value})} />
              <div className="flex items-center gap-4 bg-slate-100 p-5 rounded-3xl">
                <span className="text-[10px] font-black uppercase text-slate-400">HH</span>
                <input type="number" className="bg-transparent font-black text-xl w-full text-right outline-none" value={evento.hh} onChange={(e) => setEvento({...evento, hh: e.target.value})} />
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