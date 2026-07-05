import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function AdminTareas() {
  const navigate = useNavigate();
  const alloy = {
    green: "#6ec5ac",
    dark: "#4b4b54",
    blue1: "#37788a",
    blue2: "#387a8b",
    orange: "#e67e22"
  };

  const [usuarios, setUsuarios] = useState([]);
  const [codigos, setCodigos] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [tareasActivas, setTareasActivas] = useState([]);
  const [tareasPropuestas, setTareasPropuestas] = useState([]);
  const [historial, setHistorial] = useState([]);

  const [entregablesDB, setEntregablesDB] = useState([]);
  const [tipoSeleccion, setTipoSeleccion] = useState("entregable");
  
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedCode, setSelectedCode] = useState("");

  const [newCodigoNombre, setNewCodigoNombre] = useState("");
  const [newTareaDesc, setNewTareaDesc] = useState("");
  const [newProyectoId, setNewProyectoId] = useState(""); 
  const [newEntregableId, setNewEntregableId] = useState(""); 

  const [importancia, setImportancia] = useState("media");
  const [urgencia, setUrgencia] = useState("baja");
  const [prioritaria, setPrioritaria] = useState(false);
  const [dificultad, setDificultad] = useState("media");

  const [msg, setMsg] = useState("");
  const [vista, setVista] = useState("activas"); 
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [filtroProyectoIdAsignacion, setFiltroProyectoIdAsignacion] = useState(""); 
  const [filtroEntregableIdAsignacion, setFiltroEntregableIdAsignacion] = useState(""); 
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [entregablesFiltradosAsig, setEntregablesFiltradosAsig] = useState([]);

  const [showConfirm, setShowConfirm] = useState({ show: false, type: null });

  const infoCodigoSeleccionado = codigos.find(c => c.id === Number(selectedCode));

  async function loadData() {
    const { data: p } = await supabase.from("perfiles").select("user_id, nombre, apellido, activo");
    const { data: c } = await supabase.from("codigos_tarea").select("*");
    const { data: proj } = await supabase.from("proyectos").select("*");
    
    const usuariosActivos = (p || [])
      .filter(perfil => perfil.activo !== false)
      .map(perfil => ({
        id: perfil.user_id,
        nombre: `${perfil.nombre || ""} ${perfil.apellido || ""}`.trim()
      }));

    setUsuarios(usuariosActivos);
    setCodigos(c || []);
    setProyectos(proj || []);
  }

  useEffect(() => {
    async function fetchEntregables() {
      if (!newProyectoId) { setEntregablesDB([]); return; }
      const { data } = await supabase
        .from("entregables")
        .select("*")
        .eq("proyecto_id", newProyectoId)
        .eq("tipo_id", tipoSeleccion); 
      setEntregablesDB(data || []);
    }
    fetchEntregables();
  }, [newProyectoId, tipoSeleccion]);

  useEffect(() => {
    async function fetchEntregablesAsignacion() {
      if (!filtroProyectoIdAsignacion) { setEntregablesFiltradosAsig([]); return; }
      const { data } = await supabase
        .from("entregables")
        .select("id, nombre")
        .eq("proyecto_id", filtroProyectoIdAsignacion);
      setEntregablesFiltradosAsig(data || []);
    }
    fetchEntregablesAsignacion();
  }, [filtroProyectoIdAsignacion]);

  async function loadTareas() {
    // Volvemos a tu query exacta original que sí funciona impecable
    const { data: activas } = await supabase
      .from("tareas")
      .select(`*, codigos_tarea(*)`)
      .eq("revision_id", "pendiente")
      .order("created_at", { ascending: false });

    const { data: hist } = await supabase
      .from("tareas")
      .select(`*, codigos_tarea(*)`)
      .in("revision_id", ["aprobada", "rechazada"])
      .order("created_at", { ascending: false });
    
    const { data: prop } = await supabase
      .from("tareas_propuestas")
      .select("*")
      .order("created_at", { ascending: false });
    
    setTareasActivas(activas || []);
    setHistorial(hist || []);
    setTareasPropuestas(prop || []);
  }

  async function revisarTarea(id, estadoRevision) {
    if (isProcessing) return;
    setIsProcessing(true);
    setMsg("⏳ Actualizando estado de revisión...");

    try {
      const nuevoEstadoGeneral = estadoRevision === "aprobada" ? "completada" : "en_progreso";

      const { error } = await supabase
        .from("tareas")
        .update({ 
          revision_id: estadoRevision, 
          estado_id: nuevoEstadoGeneral 
        })
        .eq("id", id);

      if (error) throw error;

      setMsg(`✅ Tarea procesada como ${estadoRevision.toUpperCase()} con éxito.`);
      loadTareas();
    } catch (error) {
      setMsg(`❌ Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function revisarPropuesta(propuesta, estado) {
    if (isProcessing) return;
    setIsProcessing(true);
    setMsg("⏳ Procesando aprobación oficial...");

    try {
      if (estado === "aprobada") {
        const { data: projData } = await supabase.from("proyectos").upsert({ nombre: propuesta.proyecto }, { onConflict: 'nombre' }).select().single();
        
        const { data: entregableData, error: errEnt } = await supabase
          .from("entregables")
          .upsert({ 
            proyecto_id: projData?.id, 
            nombre: propuesta.entregable, 
            tipo_id: "entregable" 
          })
          .select();
        
        if (errEnt || !entregableData || entregableData.length === 0) throw new Error(`No se pudo crear el entregable.`);
        
        const entregableConfirmado = entregableData[0];
        const { data: codigoData, error: errCod } = await supabase.from("codigos_tarea").insert([{
          codigo: propuesta.codigo_propuesto || "M-NUEVO",
          descripcion: propuesta.descripcion_propuesta,
          proyecto_id: projData?.id,
          proyecto: projData?.nombre || "Proyecto Manual",
          entregable_id: entregableConfirmado.id,
          entregable: entregableConfirmado.nombre
        }]).select().single();
        
        if (errCod) throw new Error(`Error en Códigos: ${errCod.message}`);

        const { error: errTarea } = await supabase.from("tareas").insert([{
          usuario_id: propuesta.usuario_id,
          fecha: propuesta.fecha,
          proyecto_id: projData?.id,
          codigo_id: codigoData.id,
          horas: propuesta.horas,
          descripcion: propuesta.descripcion_propuesta,
          estado_id: "en_progreso", 
          revision_id: "pendiente", 
          evidencia_url: propuesta.evidencia_url 
        }]);
        if (errTarea) throw new Error(`Error en Tareas: ${errTarea.message}`);
      }

      await supabase.from("tareas_propuestas").delete().eq("id", propuesta.id);
      setMsg(estado === "aprobada" ? "✅ Proceso completado." : "❌ Propuesta rechazada.");
      await loadData();
      await loadTareas();
    } catch (error) {
      setMsg(`❌ ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function crearCodeTarea() {
    if (!newCodigoNombre || !newTareaDesc || !newProyectoId) return setMsg("⚠ Requeridos.");
    setShowConfirm({ show: false, type: null });
    
    if (newEntregableId) {
        const { data: ent } = await supabase.from("entregables")
            .select("progreso_manual")
            .eq("id", newEntregableId)
            .single();
        if (ent && ent.progreso_manual >= 100) return setMsg("❌ Error: Este entregable ya está cerrado.");
    }

    const proyectoSeleccionado = proyectos.find(p => p.id === newProyectoId);
    const hitoSeleccionado = entregablesDB.find(e => e.id === newEntregableId);

    const { error } = await supabase.from("codigos_tarea").insert([{ 
      codigo: newCodigoNombre, 
      descripcion: newTareaDesc, 
      proyecto_id: newProyectoId,
      proyecto: proyectoSeleccionado?.nombre || "Desconocido",
      entregable_id: newEntregableId || null,
      entregable: hitoSeleccionado?.nombre || null
    }]);
    
    if (!error) { 
      setMsg("✅ Código Creado."); 
      setNewCodigoNombre("");
      setNewTareaDesc("");
      loadData(); 
    } else {
      setMsg(`❌ Error al crear código: ${error.message}`);
    }
  }

  async function asignarTarea() {
    if (!selectedUser || !selectedCode || !fechaVencimiento) return setMsg("⚠ Faltan campos.");
    setShowConfirm({ show: false, type: null });
    setIsProcessing(true);
    setMsg("⏳ Verificando y asignando...");

    try {
      const codigoSeleccionado = codigos.find(c => c.id === Number(selectedCode));

      if (codigoSeleccionado?.entregable_id) {
        const { data: entCheck } = await supabase.from("entregables")
          .select("progreso_manual")
          .eq("id", codigoSeleccionado.entregable_id)
          .single();

        if (entCheck && entCheck.progreso_manual >= 100) {
          throw new Error("No se puede asignar: El entregable de este código está al 100%.");
        }
      }

      const { data: existente } = await supabase
        .from("tareas_asignadas")
        .select("id")
        .eq("usuario_id", selectedUser)
        .eq("codigo_id", Number(selectedCode));

      if (existente && existente.length > 0) {
        throw new Error("Este trabajador ya tiene este código asignado.");
      }

      const { error: errAsig } = await supabase.from("tareas_asignadas").insert([{ 
        usuario_id: selectedUser, 
        codigo_id: Number(selectedCode) 
      }]);
      if (errAsig) throw errAsig;

      const { error: errTarea } = await supabase.from("tareas").insert([{
        usuario_id: selectedUser,
        codigo_id: codigoSeleccionado.id,
        proyecto_id: codigoSeleccionado.proyecto_id,
        descripcion: codigoSeleccionado.descripcion,
        horas: 0,
        estado_id: "en_progreso", 
        revision_id: "pendiente", 
        fecha: new Date().toISOString().split('T')[0], 
        fecha_vencimiento: fechaVencimiento,
        importancia_id: importancia,
        urgencia_id: urgencia,
        dificultad_id: dificultad,
        prioritaria
      }]);
      if (errTarea) throw errTarea;

      setMsg("✅ Tarea vinculada y enviada al Backlog con éxito.");
      setFechaVencimiento("");
      setSelectedUser("");
      setSelectedCode("");
      loadTareas();
    } catch (error) {
      setMsg(`❌ ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  useEffect(() => { loadData(); loadTareas(); }, []);

  const codigosFiltrados = codigos.filter(c => {
    if (!filtroProyectoIdAsignacion) return false;
    const coincideProyecto = c.proyecto_id === filtroProyectoIdAsignacion;
    const coincideEntregable = filtroEntregableIdAsignacion 
      ? c.entregable_id === filtroEntregableIdAsignacion 
      : true;
    return coincideProyecto && coincideEntregable;
  });

  // Helper seguro para buscar el nombre del trabajador usando el array de usuarios cargado
  const getNombreTrabajador = (uid) => {
    const user = usuarios.find(u => u.id === uid);
    return user ? user.nombre : "Cargando...";
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 font-sans text-gray-900 relative">
      
      {showConfirm.show && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-gray-800 mb-2">¿Estás seguro?</h3>
            <p className="text-sm text-gray-600 mb-6">Revisa que todos los datos sean correctos antes de proceder.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm({ show: false, type: null })} className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition">Editar</button>
              <button onClick={showConfirm.type === 'crear' ? crearCodeTarea : asignarTarea} className="flex-1 py-2 text-white rounded-xl font-bold transition" style={{ backgroundColor: showConfirm.type === 'crear' ? alloy.blue2 : alloy.green }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-8">
        <button onClick={() => navigate("/admin")} className="text-gray-400 hover:text-gray-600 flex items-center gap-2 text-xs font-bold uppercase">← Volver al Panel</button>
        <h1 className="text-3xl font-extrabold text-center uppercase tracking-tighter" style={{ color: alloy.blue1 }}>Administración de Tareas</h1>

        {msg && <div className="p-3 text-center rounded-lg bg-blue-50 text-blue-700 border border-blue-100 font-medium">{msg}</div>}

        <div className="bg-white shadow-md rounded-xl p-6 border-l-4 border-[#37788a]">
          <h2 className="text-xl font-semibold mb-4" style={{ color: alloy.blue1 }}>Gestión de Flujo</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button onClick={() => setVista("activas")} className="py-3 rounded-lg font-semibold text-white transition hover:brightness-90 shadow-md" style={{ backgroundColor: vista === "activas" ? alloy.blue1 : alloy.green }}>Tareas Activas ({tareasActivas.length})</button>
            <button onClick={() => setVista("propuestas")} className="py-3 rounded-lg font-semibold text-white transition hover:brightness-90 shadow-md" style={{ backgroundColor: vista === "propuestas" ? alloy.blue1 : alloy.orange }}>Tareas Propuestas ({tareasPropuestas.length})</button>
            <button onClick={() => setVista("historial")} className="py-3 rounded-lg font-semibold text-white transition hover:brightness-90 shadow-md" style={{ backgroundColor: vista === "historial" ? alloy.blue1 : alloy.dark }}>Historial ({historial.length})</button>
          </div>
        </div>

        {/* VISTA 1: TAREAS ACTIVAS */}
        {vista === "activas" && (
          <div className="bg-white shadow-md rounded-xl p-6 border-t-4 border-[#6ec5ac]">
            <h2 className="text-xl font-bold mb-6 text-[#6ec5ac]">Por Revisar</h2>
            {tareasActivas.length === 0 ? <p className="text-center text-gray-400">Sin tareas en revisión activa.</p> : (
              <div className="space-y-4">
                {tareasActivas.map((t) => (
                  <div key={t.id} className="p-4 border rounded-xl flex flex-col md:flex-row justify-between gap-4 bg-white hover:shadow-md transition">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] bg-gray-100 px-2 py-1 rounded text-gray-500 font-medium">Creada: {t.fecha}</span>
                        {t.prioritaria && <span className="text-[9px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-black">PRIORITARIA</span>}
                        {/* Muestra el nombre del operador de forma segura */}
                        <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-bold">👤 {getNombreTrabajador(t.usuario_id)}</span>
                      </div>
                      <p className="text-xs text-blue-600 font-black uppercase">Código: {t.codigos_tarea?.codigo || "S/C"}</p>
                      <p className="text-sm italic text-gray-700 mt-1 mb-2">"{t.descripcion || t.codigos_tarea?.descripcion}"</p>

                      {/* COMENTARIO EXTRA DEL TRABAJADOR (Aparece si la data contiene un campo comentario) */}
                      {(t.comentario_trabajador || t.comentario || t.observaciones) && (
                        <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-100 italic mb-3">
                          <strong>Comentario del personal:</strong> "{t.comentario_trabajador || t.comentario || t.observaciones}"
                        </p>
                      )}

                      {t.evidencia_url && (
                        <a href={t.evidencia_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mb-3 text-[10px] bg-cyan-50 text-cyan-700 px-2 py-1 rounded font-bold hover:bg-cyan-100">
                          📎 VER ARCHIVO ADJUNTO
                        </a>
                      )}

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 border-t pt-3">
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase">Estatus</p>
                          {/* CAMBIO A COLOR VERDE SI ESTÁ COMPLETADA */}
                          <span className={`text-xs font-black uppercase px-2 py-0.5 rounded ${t.estado_id === 'completada' ? 'bg-emerald-500 text-white' : 'text-orange-600 bg-orange-50'}`}>
                            {t.estado_id}
                          </span>
                        </div>
                        <div><p className="text-[9px] font-bold text-gray-400 uppercase">Vencimiento</p><p className="text-xs font-bold text-rose-600">{t.fecha_vencimiento || "Sin fecha"}</p></div>
                        <div><p className="text-[9px] font-bold text-gray-400 uppercase">Consumo</p><p className="text-xs font-bold text-gray-800">{t.horas}h</p></div>
                        <div><p className="text-[9px] font-bold text-gray-400 uppercase">Urgencia / Imp.</p><p className="text-xs text-gray-600">{t.urgencia_id} / {t.importancia_id}</p></div>
                      </div>
                    </div>
                    <div className="flex md:flex-col gap-2 justify-center border-l pl-4 border-gray-100">
                      <button onClick={() => revisarTarea(t.id, "aprobada")} className="px-6 py-2 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-600 shadow-sm transition">Aprobar</button>
                      <button onClick={() => revisarTarea(t.id, "rechazada")} className="px-6 py-2 bg-rose-500 text-white rounded-lg text-xs font-bold hover:bg-rose-600 shadow-sm transition">Rechazar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VISTA 2: TAREAS PROPUESTAS */}
        {vista === "propuestas" && (
          <div className="bg-white shadow-md rounded-xl p-6 border-t-4 border-[#e67e22]">
            <h2 className="text-xl font-bold mb-6 text-[#e67e22]">Propuestas Externas (Nuevas)</h2>
            {tareasPropuestas.length === 0 ? <p className="text-center text-gray-400">Sin propuestas nuevas.</p> : (
              <div className="space-y-4">
                {tareasPropuestas.map(p => (
                  <div key={p.id} className="p-4 border border-orange-100 bg-orange-50/30 rounded-xl flex flex-col md:flex-row justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-orange-500 text-white text-[9px] px-2 py-0.5 rounded-full font-black">NUEVA PROPUESTA</span>
                        <p className="font-bold text-gray-800">{p.nombre_trabajador}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] mb-2">
                        <p><span className="font-bold uppercase text-gray-400">Proyecto:</span> {p.proyecto}</p>
                        <p><span className="font-bold uppercase text-gray-400">Sugerencia:</span> {p.codigo_propuesto}</p>
                        <p className="col-span-2"><span className="font-bold uppercase text-gray-400">Hito/Entregable:</span> {p.entregable}</p>
                      </div>
                      <p className="text-sm bg-white p-3 rounded-lg border border-orange-100 italic text-gray-700">"{p.descripcion_propuesta}"</p>
                      
                      {p.evidencia_url && (
                        <div className="mt-3">
                          <a href={p.evidencia_url} target="_blank" rel="noreferrer" className="text-[10px] bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-bold hover:bg-orange-200 inline-flex items-center gap-1">
                            📎 VER ARCHIVO ADJUNTO
                          </a>
                        </div>
                      )}
                      <p className="mt-2 text-[10px] font-bold text-orange-600">Horas reportadas: {p.horas}h</p>
                    </div>
                    <div className="flex flex-row md:flex-col gap-2 justify-center">
                      <button onClick={() => revisarPropuesta(p, "aprobada")} className="px-6 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-orange-600">Aprobar y Crear Código</button>
                      <button onClick={() => revisarPropuesta(p, "rechazada")} className="px-6 py-2 bg-gray-400 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-gray-500">Rechazar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VISTA 3: HISTORIAL DE REVISIONES */}
        {vista === "historial" && (
          <div className="bg-white shadow-md rounded-xl p-6 border-t-4 border-[#4b4b54]">
            <h2 className="text-xl font-bold mb-6 text-[#4b4b54]">Historial de Revisiones Realizadas</h2>
            {historial.length === 0 ? <p className="text-center text-gray-400">No hay registros en el historial todavía.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-gray-400 uppercase text-[10px]">
                      <th className="pb-2">Fecha</th>
                      <th className="pb-2">Operador</th>
                      <th className="pb-2">Código Asoc.</th>
                      <th className="pb-2">Descripción</th>
                      <th className="pb-2">Horas</th>
                      <th className="pb-2">Archivo</th>
                      <th className="pb-2">Estado / Revisión</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {historial.map(h => (
                      <tr key={h.id} className="hover:bg-gray-50 transition">
                        <td className="py-3 text-gray-500 text-xs">{h.fecha}</td>
                        <td className="py-3 text-slate-700 font-bold text-xs">{getNombreTrabajador(h.usuario_id)}</td>
                        <td className="py-3 font-mono text-[11px] text-blue-500">{h.codigos_tarea?.codigo || "S/C"}</td>
                        <td className="py-3 text-gray-600 max-w-xs truncate">
                          {h.descripcion || h.codigos_tarea?.descripcion}
                          {(h.comentario_trabajador || h.comentario || h.observaciones) && (
                            <span className="block text-[10px] text-amber-600 italic font-medium">Obs: "{h.comentario_trabajador || h.comentario || h.observaciones}"</span>
                          )}
                        </td>
                        <td className="py-3 text-gray-600 font-bold">{h.horas}h</td>
                        <td className="py-3">
                          {h.evidencia_url ? (
                            <a href={h.evidencia_url} target="_blank" rel="noreferrer" className="text-cyan-600 hover:text-cyan-800 font-bold text-[10px]">VER</a>
                          ) : (
                            <span className="text-gray-300 text-[10px]">-</span>
                          )}
                        </td>
                        <td className="py-3 space-x-1">
                          {/* CAMBIO A COLOR VERDE SI ESTÁ COMPLETADA */}
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${h.estado_id === 'completada' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                            {h.estado_id}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${h.revision_id === 'aprobada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {h.revision_id}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* FORMULARIOS COPIADOS ÍNTEGRAMENTE */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* DEFINIR NUEVO CÓDIGO */}
          <div className="bg-white p-6 rounded-xl shadow border-l-4 border-[#387a8b]">
            <h2 className="font-bold text-[#387a8b] mb-4 uppercase text-xs tracking-widest">1. Definir Nuevo Código</h2>
            <div className="space-y-3">
              <input className="w-full p-2 border rounded text-sm font-bold" placeholder="Código (Ej: REV-01)" value={newCodigoNombre} onChange={e => setNewCodigoNombre(e.target.value)} />
              <input className="w-full p-2 border rounded text-sm font-bold" placeholder="Descripción de la tarea" value={newTareaDesc} onChange={e => setNewTareaDesc(e.target.value)} />
              
              <select className="w-full p-2 border rounded text-sm bg-white font-bold" value={newProyectoId} onChange={e => {setNewProyectoId(e.target.value); setNewEntregableId("");}}>
                <option value="">Selecciona un Proyecto</option>
                {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>

              <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button type="button" onClick={() => setTipoSeleccion("entregable")} className={`flex-1 text-[10px] p-2 rounded font-black uppercase ${tipoSeleccion === 'entregable' ? 'bg-[#37788a] text-white shadow' : 'text-gray-500'}`}>ENTREGABLE</button>
                  <button type="button" onClick={() => setTipoSeleccion("actividad")} className={`flex-1 text-[10px] p-2 rounded font-black uppercase ${tipoSeleccion === 'actividad' ? 'bg-[#37788a] text-white shadow' : 'text-gray-500'}`}>HITO/ACT</button>
              </div>

              <select disabled={!newProyectoId} className="w-full p-2 border rounded text-sm bg-white font-bold disabled:bg-gray-50" value={newEntregableId} onChange={e => setNewEntregableId(e.target.value)}>
                <option value="">Seleccionar...</option>
                {entregablesDB.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
              </select>
              
              <button onClick={() => setShowConfirm({ show: true, type: 'crear' })} className="w-full py-3 text-white rounded-lg font-black italic text-xs uppercase shadow-lg transition hover:scale-[1.02]" style={{ backgroundColor: alloy.blue2 }}>Guardar Código</button>
            </div>
          </div>

          {/* ASIGNAR TRABAJADOR */}
          <div className="bg-white p-6 rounded-xl shadow border-l-4 border-[#6ec5ac]">
            <h2 className="font-bold text-[#6ec5ac] mb-4 uppercase text-xs tracking-widest">2. Asignar a Trabajador</h2>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-gray-400 uppercase">1. Proyecto de destino</label>
              <select className="w-full p-2 border border-blue-200 rounded text-sm bg-blue-50/50 font-bold" value={filtroProyectoIdAsignacion} onChange={e => {setFiltroProyectoIdAsignacion(e.target.value); setFiltroEntregableIdAsignacion(""); setSelectedUser(""); setSelectedCode("");}}>
                <option value="">Selecciona un Proyecto...</option>
                {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>

              <label className="text-[10px] font-bold text-gray-400 uppercase">2. Personal disponible</label>
              <select disabled={!filtroProyectoIdAsignacion} className="w-full p-2 border rounded text-sm bg-white font-bold disabled:bg-gray-50" value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
                <option value="">Selecciona trabajador...</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>

              <label className="text-[10px] font-bold text-gray-400 uppercase">3. Filtrar por Hito / Entregable</label>
              <select className="w-full p-2 border border-blue-200 rounded text-sm bg-blue-50/50 font-bold text-gray-700" value={filtroEntregableIdAsignacion} disabled={!filtroProyectoIdAsignacion} onChange={e => {setFiltroEntregableIdAsignacion(e.target.value); setSelectedCode("");}}>
                <option value="">Todos los entregables...</option>
                {entregablesFiltradosAsig.map(ent => (
                  <option key={ent.id} value={ent.id}>{ent.nombre}</option>
                ))}
              </select>

              <label className="text-[10px] font-bold text-gray-400 uppercase">4. Código de Tarea disponible</label>
              <select className="w-full p-2 border rounded text-sm bg-white font-bold" value={selectedCode} onChange={e => setSelectedCode(e.target.value)} disabled={!filtroProyectoIdAsignacion}>
                <option value="">Selecciona código</option>
                {codigosFiltrados.map(c => <option key={c.id} value={c.id}>{c.codigo} - {c.descripcion?.substring(0, 40)}...</option>)}
              </select>

              {selectedCode && infoCodigoSeleccionado && (
                <div className="p-3 bg-slate-50 border rounded-lg">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Descripción del código:</p>
                  <p className="text-xs italic text-gray-600">"{infoCodigoSeleccionado.descripcion}"</p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Importancia</label>
                  <select className="w-full p-2 border rounded text-sm bg-white font-bold" value={importancia} onChange={e => setImportancia(e.target.value)}>
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Urgencia</label>
                  <select className="w-full p-2 border rounded text-sm bg-white font-bold" value={urgencia} onChange={e => setUrgencia(e.target.value)}>
                    <option value="alta">Alta</option>
                    <option value="baja">Baja</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Dificultad</label>
                  <select className="w-full p-2 border rounded text-sm bg-white font-bold" value={dificultad} onChange={e => setDificultad(e.target.value)}>
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 items-center">
                <input type="date" className="p-2 border rounded text-sm font-bold bg-white" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)} />
                <label className="flex items-center gap-2 cursor-pointer bg-slate-50 p-2 rounded border select-none">
                  <input type="checkbox" checked={prioritaria} onChange={e => setPrioritaria(e.target.checked)} className="w-4 h-4 accent-[#6ec5ac]" />
                  <span className="text-[10px] font-black uppercase text-gray-600">Prioritaria</span>
                </label>
              </div>

              <button onClick={() => setShowConfirm({ show: true, type: 'asignar' })} disabled={isProcessing || !selectedCode} className="w-full py-3 text-white font-black text-xs uppercase italic rounded-lg shadow-lg transition" style={{ backgroundColor: alloy.green }}>
                Vincular Tarea
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}