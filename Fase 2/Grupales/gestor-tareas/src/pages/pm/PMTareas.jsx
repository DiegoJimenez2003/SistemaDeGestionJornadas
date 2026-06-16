import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function PMTareas() {
  const navigate = useNavigate();
  const alloy = {
    purple: "#6c5ce7",
    green: "#6ec5ac",
    blue1: "#37788a",
    blue2: "#387a8b",
  };

  const [usuarios, setUsuarios] = useState([]);
  const [codigos, setCodigos] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [entregablesDB, setEntregablesDB] = useState([]);
  const [loading, setLoading] = useState(true);

  // Formulario 1: Crear
  const [newCodigoNombre, setNewCodigoNombre] = useState("");
  const [newTareaDesc, setNewTareaDesc] = useState("");
  const [newProyecto, setNewProyecto] = useState("");
  const [newEntregable, setNewEntregable] = useState("");
  const [tipoSeleccion, setTipoSeleccion] = useState("entregable");

  // Formulario 2: Asignar
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedCode, setSelectedCode] = useState("");
  const [importancia, setImportancia] = useState("Media");
  const [urgencia, setUrgencia] = useState("Baja");
  const [prioritaria, setPrioritaria] = useState(false);
  const [dificultad, setDificultad] = useState("Media");
  const [fechaVencimiento, setFechaVencimiento] = useState("");

  // ESTADOS MONITOR PROYECTOS (Añadidos)
  const [proyectoExpandido, setProyectoExpandido] = useState(null);
  const [entregablesMonitor, setEntregablesMonitor] = useState([]);
  const [modalTareas, setModalTareas] = useState({ abierto: false, entregable: null, proyecto: null, tareas: [] });

  const [msg, setMsg] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirm, setShowConfirm] = useState({ show: false, type: null });

  // Filtros de asignación
  const [filtroProyectoAsignacion, setFiltroProyectoAsignacion] = useState("");
  const [usuariosFiltrados, setUsuariosFiltrados] = useState([]);
  const [codigosFiltrados, setCodigosFiltrados] = useState([]);

  useEffect(() => { fetchPMData(); }, []);

  useEffect(() => {
  async function fetchRecursosProyecto() {
    if (!filtroProyectoAsignacion) {
      setUsuariosFiltrados([]);
      setCodigosFiltrados([]);
      return;
    }

    const proyActual = proyectos.find(p => p.nombre === filtroProyectoAsignacion);
    if (!proyActual) return;

    // 1. Obtener recursos del proyecto
    const { data: recursos } = await supabase
      .from("proyecto_recursos")
      .select("user_id, perfiles(nombre, activo)")
      .eq("proyecto_id", proyActual.id);

    setUsuariosFiltrados(
      recursos?.filter(r => r.perfiles?.activo !== false)
        .map(r => ({ id: r.user_id, nombre: r.perfiles.nombre })) || []
    );

    // 2. LÓGICA DE FILTRADO REAL
    // Filtramos los códigos base por proyecto
    let disponibles = codigos.filter(c => c.proyecto === filtroProyectoAsignacion);

    if (selectedUser) {
      // Buscamos TODOS los registros en la tabla 'tareas' para este usuario en este proyecto
      // Independientemente de si están 'Pendiente', 'En_progreso' o 'Completado'
      const { data: tareasExistentes } = await supabase
        .from("tareas")
        .select("codigo_id")
        .eq("usuario_id", selectedUser)
        .eq("proyecto", filtroProyectoAsignacion);

      if (tareasExistentes && tareasExistentes.length > 0) {
        const idsAsignados = tareasExistentes.map(t => t.codigo_id);
        
        // REGLA: Si el ID del código ya existe en la tabla tareas para este usuario, 
        // significa que ya fue "Asignada", por lo tanto se oculta.
        disponibles = disponibles.filter(c => !idsAsignados.includes(c.id));
      }
    }

    setCodigosFiltrados(disponibles);
  }
  fetchRecursosProyecto();
}, [filtroProyectoAsignacion, selectedUser, proyectos, codigos]);


  useEffect(() => {
    async function fetchEntregables() {
      if (!newProyecto) { setEntregablesDB([]); return; }
      const { data } = await supabase.from("entregables").select("*").eq("proyecto_nombre", newProyecto).eq("tipo", tipoSeleccion);
      setEntregablesDB(data || []);
    }
    fetchEntregables();
  }, [newProyecto, tipoSeleccion]);

  async function fetchPMData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: asignaciones } = await supabase.from("proyecto_encargados").select("proyecto_id").eq("user_id", user.id);
      const idsAsignados = asignaciones?.map(a => a.proyecto_id) || [];
      if (idsAsignados.length > 0) {
        const { data: p } = await supabase.from("proyectos").select("*").in("id", idsAsignados);
        setProyectos(p || []);
        const nombresProyectos = p.map(proy => proy.nombre);
        const { data: c } = await supabase.from("codigos_tarea").select("*").in("proyecto", nombresProyectos);
        setCodigos(c || []);
        const { data: u } = await supabase.from("perfiles").select("user_id, nombre").eq("activo", true).order("nombre");
        setUsuarios(u?.map(user => ({ id: user.user_id, nombre: user.nombre })) || []);
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }

  // Lógica de Monitor (Nueva)
  async function toggleProyectoMonitor(proyecto) {
    if (proyectoExpandido === proyecto.id) {
      setProyectoExpandido(null);
      setEntregablesMonitor([]);
    } else {
      setProyectoExpandido(proyecto.id);
      const { data } = await supabase.from("entregables").select("*").eq("proyecto_nombre", proyecto.nombre);
      setEntregablesMonitor(data || []);
    }
  }

  const verTareasEntregable = async (entregableNombre, proyectoNombre) => {
    // IMPORTANTE: Cambiamos 'tu_tabla_reportes' por 'tareas'
    const { data, error } = await supabase
      .from('tareas') 
      .select(`
        *,
        codigos_tarea (
          codigo,
          descripcion,
          proyecto,
          entregable
        )
      `)
      .eq('entregable', entregableNombre)
      .eq('proyecto', proyectoNombre)
      .order('fecha', { ascending: false }); // Ordenar por los más recientes

    if (error) {
      console.error("Error al obtener historial:", error);
      setMsg("❌ No se pudo cargar el historial.");
    } else {
      setModalTareas({
        abierto: true,
        entregable: entregableNombre,
        proyecto: proyectoNombre,
        tareas: data || []
      });
    }
  };

  async function cambiarRevision(tareaId, nuevoEstado) {
    const { error } = await supabase
      .from("tareas")
      .update({ revision: nuevoEstado })
      .eq("id", tareaId);

    if (!error) {
      // Volvemos a pedir los datos con el JOIN para no perder la descripción
      const { data } = await supabase
        .from("tareas")
        .select("*, codigos_tarea(codigo, descripcion, proyecto, entregable)")
        .eq("entregable", modalTareas.entregable)
        .eq("proyecto", modalTareas.proyecto);
        
      setModalTareas({ ...modalTareas, tareas: data || [] });
    }
  }

  // Funciones de Formulario (Tus originales)
  async function handleCrearCodigo() {
    if (!newCodigoNombre || !newTareaDesc || !newProyecto) return setMsg("⚠ Completa los campos marcados.");
    setShowConfirm({ show: false, type: null });
    setIsProcessing(true);
    const { error } = await supabase.from("codigos_tarea").insert([{ 
      codigo: newCodigoNombre, descripcion: newTareaDesc, proyecto: newProyecto, entregable: newEntregable || "General"
    }]);
    if (!error) { setMsg("✨ Código guardado."); setNewCodigoNombre(""); setNewTareaDesc(""); fetchPMData(); }
    setIsProcessing(false);
  }

  async function handleAsignarTarea() {
    if (!selectedUser || !selectedCode || !fechaVencimiento) return setMsg("⚠ Falta elegir trabajador, tarea o fecha límite.");
    setShowConfirm({ show: false, type: null });
    setIsProcessing(true);
    try {
      const { data: ex } = await supabase.from("tareas_asignadas").select("id").eq("usuario_id", selectedUser).eq("codigo_id", Number(selectedCode));
      if (ex?.length > 0) throw new Error("Esta persona ya tiene esta tarea.");
      const codigoObj = codigos.find(c => c.id === Number(selectedCode));
      const userObj = usuarios.find(u => u.id === selectedUser);
      await supabase.from("tareas_asignadas").insert([{ usuario_id: selectedUser, codigo_id: Number(selectedCode) }]);
      const { error: errTarea } = await supabase.from("tareas").insert([{
        usuario_id: selectedUser, nombre_trabajador: userObj.nombre, codigo_id: codigoObj.id,
        proyecto: codigoObj.proyecto, entregable: codigoObj.entregable, estado: "Pendiente",
        revision: "sin_revisar", fecha: new Date().toISOString().split('T')[0],
        fecha_vencimiento: fechaVencimiento, importancia, urgencia, prioritaria, dificultad, horas: 0
      }]);
      if (errTarea) throw errTarea;
      setMsg("🚀 Tarea enviada correctamente.");
      setSelectedUser(""); setSelectedCode(""); setFechaVencimiento("");
    } catch (err) { setMsg(`❌ Error: ${err.message}`); } finally { setIsProcessing(false); }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-slate-400">Cargando...</div>;

  return (
    <div className="min-h-screen bg-[#F1F5F9] py-8 px-4 pb-20">
      
      {/* MODAL MONITOR (HISTORIAL DE REPORTES DETALLADO) */}
      {modalTareas.abierto && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="p-6 border-b flex justify-between items-center bg-white">
              <div>
                <h3 className="text-xl font-black uppercase italic text-slate-800">{modalTareas.entregable}</h3>
                <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">{modalTareas.proyecto}</p>
              </div>
              <button onClick={() => setModalTareas({ ...modalTareas, abierto: false })} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold hover:bg-slate-200 transition-colors">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4 bg-slate-50/50">
              {modalTareas.tareas.length === 0 ? (
                <div className="text-center py-10 text-slate-300 font-bold uppercase text-xs tracking-widest">Sin reportes registrados</div>
              ) : (
                modalTareas.tareas.map(t => (
                  <div key={t.id} className="p-6 border-2 border-white rounded-[2rem] bg-white shadow-sm flex flex-col gap-4">
                    
                    {/* INFO PRINCIPAL: TRABAJADOR Y HORAS */}
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                           <span className="text-[9px] font-black bg-blue-100 text-blue-600 px-2 py-0.5 rounded-md uppercase">
                            {t.codigos_tarea?.codigo || 'S/C'}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">ID: #{t.id}</span>
                        </div>
                        <p className="font-black text-slate-800 uppercase text-sm italic">{t.nombre_trabajador}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-black italic text-slate-900 leading-none">{t.horas} <span className="text-xs not-italic text-slate-400">HH</span></p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Reportado: {t.fecha}</p>
                      </div>
                    </div>

                    {/* BLOQUE DE INFORMACIÓN DESDE LA TABLA CODIGOS_TAREA */}
                    <div className="bg-slate-900 rounded-[1.5rem] p-5 text-white relative overflow-hidden shadow-inner">
                      <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-2 opacity-60">
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div>
                          <p className="text-[9px] font-black uppercase tracking-[0.2em]">Ficha Técnica de Tarea</p>
                        </div>
                        
                        <div className="space-y-3">
                          <div>
                            <p className="text-[8px] font-bold text-white/40 uppercase mb-1">Descripción de Obra / Tarea:</p>
                            <p className="text-xs font-medium leading-relaxed italic border-l-2 border-purple-500/50 pl-3">
                              {t.codigos_tarea?.descripcion || "⚠️ No se encontró descripción vinculada a este código."}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/10">
                            <div>
                              <p className="text-[8px] font-bold text-white/40 uppercase">Proyecto Maestro:</p>
                              <p className="text-[10px] font-black truncate text-purple-300 uppercase">{t.codigos_tarea?.proyecto || 'No especificado'}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[8px] font-bold text-white/40 uppercase">Fase/Entregable:</p>
                              <p className="text-[10px] font-black truncate text-purple-300 uppercase">{t.codigos_tarea?.entregable || 'General'}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Icono decorativo de fondo */}
                      <div className="absolute top-2 right-2 opacity-[0.03]">
                        <svg width="80" height="80" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
                      </div>
                    </div>

                    {/* ESTADO DE REVISIÓN */}
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest italic">Confidencial - Uso Interno PM</span>
                      <span className={`text-[8px] font-black uppercase px-3 py-1 rounded-full ${
                        t.revision === 'aprobada' ? 'bg-green-100 text-green-600 shadow-sm' : 
                        t.revision === 'rechazada' ? 'bg-rose-100 text-rose-600 shadow-sm' : 'bg-slate-100 text-slate-400'
                      }`}>
                        Revisión: {t.revision || 'Pendiente'}
                      </span>
                    </div>

                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMACIÓN FORMULARIOS */}
      {showConfirm.show && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl">
            <h3 className="text-xl font-bold text-slate-800 mb-4">¿Confirmar envío?</h3>
            <p className="text-slate-500 mb-6 text-sm">Se asignará la tarea con fecha límite: <span className="font-bold text-rose-500">{fechaVencimiento}</span></p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm({ show: false, type: null })} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-xs uppercase text-slate-400">Corregir</button>
              <button onClick={showConfirm.type === 'crear' ? handleCrearCodigo : handleAsignarTarea} className="flex-1 py-3 text-white rounded-xl font-bold text-xs uppercase shadow-lg" style={{ backgroundColor: showConfirm.type === 'crear' ? alloy.blue2 : alloy.green }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex justify-between items-center">
          <button onClick={() => navigate("/PMPanel")} className="text-slate-400 font-bold text-xs uppercase">← Volver</button>
          <h1 className="text-2xl font-black text-slate-800 uppercase italic">Panel de Control <span className="text-purple-600">PM</span></h1>
          <div className="w-10"></div>
        </header>

        {msg && <div className="p-4 bg-slate-800 text-white text-center rounded-2xl font-bold text-sm animate-pulse">{msg}</div>}

        <div className="grid lg:grid-cols-2 gap-8">
          {/* SECCIÓN 1: CREAR */}
          <section className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold">1</div>
              <h2 className="font-black text-slate-700 uppercase text-sm tracking-widest">Crear Nueva Tarea</h2>
            </div>
            <div className="space-y-4">
              <input className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent outline-none font-bold text-sm" placeholder="Ej: PLANO-01" value={newCodigoNombre} onChange={e => setNewCodigoNombre(e.target.value)} />
              <input className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent outline-none font-bold text-sm" placeholder="Descripción de la tarea para la tabla..." value={newTareaDesc} onChange={e => setNewTareaDesc(e.target.value)} />
              <select className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent outline-none font-bold text-sm" value={newProyecto} onChange={e => {setNewProyecto(e.target.value); setNewEntregable("");}}>
                <option value="">-- Elige un proyecto --</option>
                {proyectos.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
              </select>
              <div className="flex bg-slate-50 p-1.5 rounded-2xl gap-2">
                <button onClick={() => setTipoSeleccion("entregable")} className={`flex-1 py-2 text-[10px] font-bold rounded-xl ${tipoSeleccion === 'entregable' ? 'bg-white shadow text-purple-600' : 'text-slate-400'}`}>ENTREGABLE</button>
                <button onClick={() => setTipoSeleccion("actividad")} className={`flex-1 py-2 text-[10px] font-bold rounded-xl ${tipoSeleccion === 'actividad' ? 'bg-white shadow text-purple-600' : 'text-slate-400'}`}>ACTIVIDAD</button>
              </div>
              <select disabled={!newProyecto} className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent outline-none font-bold text-sm disabled:opacity-50" value={newEntregable} onChange={e => setNewEntregable(e.target.value)}>
                <option value="">¿En qué fase va?</option>
                {entregablesDB.map(item => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}
              </select>
              <button onClick={() => setShowConfirm({ show: true, type: 'crear' })} className="w-full py-4 rounded-2xl text-white font-bold text-xs uppercase tracking-widest shadow-lg" style={{ backgroundColor: alloy.purple }}>💾 Guardar Tarea</button>
            </div>
          </section>

          {/* SECCIÓN 2: ASIGNAR */}
<section className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-200">
  <div className="flex items-center gap-3 mb-6">
    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">2</div>
    <h2 className="font-black text-slate-700 uppercase text-sm tracking-widest">Asignar a Trabajador</h2>
  </div>
  
  <div className="space-y-4">
    {/* A. PRIMERO EL PROYECTO */}
    <div className="space-y-1">
      <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">1. Seleccionar Proyecto</label>
      <select 
        className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-emerald-50 outline-none font-bold text-sm" 
        value={filtroProyectoAsignacion} 
        onChange={e => {
          setFiltroProyectoAsignacion(e.target.value);
          setSelectedUser("");
          setSelectedCode("");
        }}
      >
        <option value="">-- Elige un proyecto --</option>
        {proyectos.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
      </select>
    </div>

    {/* B. SEGUNDO EL TRABAJADOR (FILTRADO) */}
    <div className="space-y-1">
      <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">2. Recurso Asignado</label>
      <select 
        disabled={!filtroProyectoAsignacion}
        className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent outline-none font-bold text-sm disabled:opacity-50" 
        value={selectedUser} 
        onChange={e => setSelectedUser(e.target.value)}
      >
        <option value="">{filtroProyectoAsignacion ? "-- Seleccionar trabajador --" : "⚠️ Selecciona proyecto primero"}</option>
        {usuariosFiltrados.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
      </select>
    </div>

    {/* C. TERCERO EL CÓDIGO (FILTRADO) */}
<div className="space-y-1">
  <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">3. Código de Tarea</label>
  <select 
    disabled={!selectedUser}
    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent outline-none font-bold text-sm disabled:opacity-50 transition-all" 
    value={selectedCode} 
    onChange={e => setSelectedCode(e.target.value)}
  >
    {!selectedUser ? (
      <option value="">⚠️ Selecciona trabajador para ver tareas</option>
    ) : codigosFiltrados.length === 0 ? (
      <option value="">🚫 Sin tareas pendientes (Todo completado)</option>
    ) : (
      <>
        <option value="">-- Seleccionar código disponible --</option>
        {codigosFiltrados.map(c => (
          <option key={c.id} value={c.id}>
            {c.codigo} - {c.entregable}
          </option>
        ))}
      </>
    )}
  </select>
  
</div>

    {/* EL RESTO DE SELECTS (Importancia, Urgencia, etc.)*/}
    <div className="grid grid-cols-2 gap-4">
      <select className="w-full p-3 bg-slate-50 rounded-xl font-bold text-xs outline-none" value={importancia} onChange={e => setImportancia(e.target.value)}>
        <option value="Alta">🔴 Importancia: Alta</option>
        <option value="Media">🟡 Importancia: Media</option>
        <option value="Baja">🟢 Importancia: Baja</option>
      </select>
      <select className="w-full p-3 bg-slate-50 rounded-xl font-bold text-xs outline-none" value={urgencia} onChange={e => setUrgencia(e.target.value)}>
        <option value="Alta">⚡ Urgencia: Alta</option>
        <option value="Baja">⏳ Urgencia: Baja</option>
      </select>
    </div>

              <div className="grid grid-cols-2 gap-4">
                <select className="w-full p-3 bg-slate-50 rounded-xl font-bold text-xs outline-none" value={dificultad} onChange={e => setDificultad(e.target.value)}>
                  <option value="Alta">💪 Difícil</option>
                  <option value="Media">⚙ Normal</option>
                  <option value="Baja">✅ Fácil</option>
                </select>
                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl cursor-pointer">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">¿Prioritaria?</span>
                  <input type="checkbox" checked={prioritaria} onChange={e => setPrioritaria(e.target.checked)} className="w-5 h-5 accent-orange-500" />
                </label>
              </div>
              <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">4. Fecha limite - Entrega</label>
              <input type="date" className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold text-sm" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)} />
    <button onClick={() => setShowConfirm({ show: true, type: 'asignar' })} disabled={isProcessing || !selectedCode || !selectedUser} className="w-full py-4 rounded-2xl text-white font-bold text-xs uppercase tracking-widest shadow-lg disabled:bg-slate-300" style={{ backgroundColor: (selectedCode && selectedUser) ? alloy.green : '' }}>
      {isProcessing ? "Asignando..." : "📢 Enviar Tarea"}
    </button>
  </div>
</section>
        </div>

        {/* MONITOR DE OPERACIONES */}
        <div className="space-y-4 pt-10">
          <h2 className="text-center font-black text-slate-400 uppercase text-xs tracking-[0.3em] italic">Monitor de Operaciones</h2>
          {proyectos.map(p => {
            const expandido = proyectoExpandido === p.id;
            return (
              <div key={p.id} className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 flex justify-between items-center cursor-pointer hover:bg-slate-50" onClick={() => toggleProyectoMonitor(p)}>
                  <h3 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter">{p.nombre}</h3>
                  <div className={`p-2 rounded-full ${expandido ? 'bg-slate-900 text-white rotate-180' : 'bg-slate-100'} transition-all`}>
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </div>
                {expandido && (
                  <div className="p-6 bg-slate-50 border-t grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {entregablesMonitor.map(ent => (
                      <button key={ent.id} onClick={() => verTareasEntregable(ent.nombre, p.nombre)} className="p-4 bg-white rounded-2xl border hover:border-purple-400 text-left shadow-sm group">
                        <p className="text-[9px] font-black text-purple-600 uppercase mb-1">{ent.tipo}</p>
                        <p className="text-xs font-black uppercase text-slate-800">{ent.nombre}</p>
                        <span className="text-[8px] font-bold text-slate-400 uppercase group-hover:text-purple-400 transition-colors">Ver historial →</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}