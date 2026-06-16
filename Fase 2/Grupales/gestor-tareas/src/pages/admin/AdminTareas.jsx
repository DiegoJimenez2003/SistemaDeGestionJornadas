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
  const [newProyecto, setNewProyecto] = useState("");
  const [newEntregable, setNewEntregable] = useState("");

  const [importancia, setImportancia] = useState("Media");
  const [urgencia, setUrgencia] = useState("Baja");
  const [prioritaria, setPrioritaria] = useState(false);
  const [dificultad, setDificultad] = useState("Media");

  const [msg, setMsg] = useState("");
  const [vista, setVista] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filtroProyectoAsignacion, setFiltroProyectoAsignacion] = useState("");
  const [filtroEntregableAsignacion, setFiltroEntregableAsignacion] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");

  const [showConfirm, setShowConfirm] = useState({ show: false, type: null });

  const infoCodigoSeleccionado = codigos.find(c => c.id === Number(selectedCode));

  const [usuariosFiltrados, setUsuariosFiltrados] = useState([]);

  async function loadData() {
    const { data: p } = await supabase.from("perfiles").select("user_id, nombre, activo");
    const { data: c } = await supabase.from("codigos_tarea").select("*");
    const { data: proj } = await supabase.from("proyectos").select("*");
    
    const usuariosActivos = (p || [])
      .filter(perfil => perfil.activo !== false)
      .map(perfil => ({
        id: perfil.user_id,
        nombre: perfil.nombre
      }));

    setUsuarios(usuariosActivos);
    setCodigos(c || []);
    setProyectos(proj || []);
  }

  useEffect(() => {
    async function fetchEntregables() {
      if (!newProyecto) { setEntregablesDB([]); return; }
      const { data } = await supabase
        .from("entregables")
        .select("*")
        .eq("proyecto_nombre", newProyecto)
        .eq("tipo", tipoSeleccion)
        .lt("progreso_manual", 100); 
      setEntregablesDB(data || []);
    }
    fetchEntregables();
  }, [newProyecto, tipoSeleccion]);

  async function loadTareas() {
    // ACTUALIZACIÓN: Incluimos evidencia_url en la query
    const query = `*, codigos_tarea (codigo, descripcion)`;
    const { data: activas } = await supabase.from("tareas").select(query).eq("revision", "sin_revisar").neq("estado", "Pendiente").order("created_at", { ascending: false });
    const { data: hist } = await supabase.from("tareas").select(query).in("revision", ["aprobada", "rechazada"]).order("created_at", { ascending: false });
    
    // ACTUALIZACIÓN: Aseguramos que traiga evidencia_url de las propuestas
    const { data: prop } = await supabase.from("tareas_propuestas").select("*").order("created_at", { ascending: false });
    
    setTareasActivas(activas || []);
    setHistorial(hist || []);
    setTareasPropuestas(prop || []);
  }

  async function revisarTarea(id, estado) {
    if (isProcessing) return;
    setIsProcessing(true);
    const { error } = await supabase.from("tareas").update({ revision: estado }).eq("id", id);
    if (!error) {
      setTareasActivas(prev => prev.filter(t => t.id !== id));
      setMsg(`✅ Tarea ${estado}.`);
      loadTareas();
    }
    setIsProcessing(false);
  }

  async function revisarPropuesta(propuesta, estado) {
    if (isProcessing) return;
    setIsProcessing(true);
    setMsg("⏳ Procesando aprobación oficial...");

    try {
      if (estado === "aprobada") {
        await supabase.from("proyectos").upsert({ nombre: propuesta.proyecto }, { onConflict: 'nombre' });
        const { data: entregableData, error: errEnt } = await supabase.from("entregables").upsert({ proyecto_nombre: propuesta.proyecto, nombre: propuesta.entregable, tipo: "entregable" }, { onConflict: 'proyecto_nombre, nombre' }).select();
        if (errEnt || !entregableData || entregableData.length === 0) throw new Error(`No se pudo crear el entregable.`);
        
        const entregableConfirmado = entregableData[0];
        const { data: codigoData, error: errCod } = await supabase.from("codigos_tarea").insert([{
          codigo: propuesta.codigo_propuesto || "M-NUEVO",
          descripcion: propuesta.descripcion_propuesta,
          proyecto: propuesta.proyecto,
          entregable: entregableConfirmado.nombre
        }]).select().single();
        if (errCod) throw new Error(`Error en Códigos: ${errCod.message}`);

        // ACTUALIZACIÓN: Se añade evidencia_url: propuesta.evidencia_url para que la tarea final herede el archivo
        const { error: errTarea } = await supabase.from("tareas").insert([{
          usuario_id: propuesta.usuario_id,
          nombre_trabajador: propuesta.nombre_trabajador,
          fecha: propuesta.fecha,
          proyecto: propuesta.proyecto,
          entregable: entregableConfirmado.nombre,
          codigo_id: codigoData.id,
          horas: propuesta.horas,
          estado: "Completada",
          revision: "aprobada",
          evidencia_url: propuesta.evidencia_url // <--- HEREDA EL ARCHIVO
        }]);
        if (errTarea) throw new Error(`Error en Tareas: ${errTarea.message}`);
      }

      await supabase.from("tareas_propuestas").delete().eq("id", propuesta.id);
      setTareasPropuestas(prev => prev.filter(p => p.id !== propuesta.id));
      setMsg(estado === "aprobada" ? "✅ Proceso completado." : "❌ Propuesta rechazada.");
      await loadData();
      await loadTareas();
    } catch (error) {
      setMsg(`❌ ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function crearTarea() {
    if (!newCodigoNombre || !newTareaDesc || !newProyecto) return setMsg("⚠ Requeridos.");
    setShowConfirm({ show: false, type: null });
    
    if (newEntregable) {
        const { data: ent } = await supabase.from("entregables")
            .select("progreso_manual")
            .eq("nombre", newEntregable)
            .eq("proyecto_nombre", newProyecto)
            .single();
        if (ent && ent.progreso_manual >= 100) return setMsg("❌ Error: Este entregable ya está cerrado.");
    }

    const { error } = await supabase.from("codigos_tarea").insert([{ 
      codigo: newCodigoNombre, 
      descripcion: newTareaDesc, 
      proyecto: newProyecto, 
      entregable: newEntregable || "General"
    }]);
    
    if (!error) { 
      setMsg("✅ Código Creado."); 
      setNewCodigoNombre("");
      setNewTareaDesc("");
      loadData(); 
    }
  }

  async function asignarTarea() {
    if (!selectedUser || !selectedCode || !fechaVencimiento) return setMsg("⚠ Faltan campos (incluyendo fecha de vencimiento).");
    setShowConfirm({ show: false, type: null });
    setIsProcessing(true);
    setMsg("⏳ Verificando y asignando...");

    try {
      const codigoSeleccionado = codigos.find(c => c.id === Number(selectedCode));

      const { data: entCheck } = await supabase.from("entregables")
        .select("progreso_manual")
        .eq("nombre", codigoSeleccionado.entregable)
        .eq("proyecto_nombre", codigoSeleccionado.proyecto)
        .single();

      if (entCheck && entCheck.progreso_manual >= 100) {
        throw new Error("No se puede asignar: El entregable de este código está al 100%.");
      }

      const { data: existente } = await supabase
        .from("tareas_asignadas")
        .select("id")
        .eq("usuario_id", selectedUser)
        .eq("codigo_id", Number(selectedCode));

      if (existente && existente.length > 0) {
        throw new Error("Este trabajador ya tiene este código asignado.");
      }

      const usuarioSeleccionado = usuarios.find(u => u.id === selectedUser);

      const { error: errAsig } = await supabase.from("tareas_asignadas").insert([{ 
        usuario_id: selectedUser, 
        codigo_id: Number(selectedCode) 
      }]);
      if (errAsig) throw errAsig;

      const { error: errTarea } = await supabase.from("tareas").insert([{
        usuario_id: selectedUser,
        nombre_trabajador: usuarioSeleccionado?.nombre || "Usuario",
        codigo_id: codigoSeleccionado.id,
        proyecto: codigoSeleccionado.proyecto,
        entregable: codigoSeleccionado.entregable,
        horas: 0,
        estado: "Pendiente",
        revision: "sin_revisar",
        fecha: new Date().toISOString().split('T')[0], 
        fecha_vencimiento: fechaVencimiento,
        importancia,
        urgencia,
        prioritaria,
        dificultad
      }]);
      if (errTarea) throw errTarea;

      setMsg("✅ Tarea vinculada con éxito.");
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

  useEffect(() => {
  async function fetchRecursosProyecto() {
    if (!filtroProyectoAsignacion) {
      setUsuariosFiltrados([]);
      return;
    }

    const proyActual = proyectos.find(p => p.nombre === filtroProyectoAsignacion);
    if (!proyActual) return;

    const { data, error } = await supabase
      .from("proyecto_recursos")
      .select("user_id, perfiles(nombre, apellido, activo)")
      .eq("proyecto_id", proyActual.id);

    if (!error && data) {
      const mapeados = data
        .filter(r => r.perfiles?.activo !== false)
        .map(r => ({
          id: r.user_id,
          nombre: `${r.perfiles.nombre} ${r.perfiles.apellido}`
        }));
      setUsuariosFiltrados(mapeados);
    }
  }
  fetchRecursosProyecto();
}, [filtroProyectoAsignacion, proyectos]);

  useEffect(() => { loadData(); loadTareas(); }, []);

  const codigosFiltrados = codigos.filter(c => {
    if (!filtroProyectoAsignacion) return false;
    const coincideProyecto = c.proyecto === filtroProyectoAsignacion;
    const coincideEntregable = filtroEntregableAsignacion 
      ? c.entregable === filtroEntregableAsignacion 
      : true;
    return coincideProyecto && coincideEntregable;
  });

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 font-sans text-gray-900 relative">
      
      {/* --- MODAL DE CONFIRMACIÓN --- */}
      {showConfirm.show && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in duration-200">
            <h3 className="text-lg font-bold text-gray-800 mb-2">¿Estás seguro?</h3>
            <p className="text-sm text-gray-600 mb-6">
              Revisa que todos los datos sean correctos antes de proceder con la {showConfirm.type === 'crear' ? 'creación del código' : 'asignación'}.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowConfirm({ show: false, type: null })}
                className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition"
              >
                Editar
              </button>
              <button 
                onClick={showConfirm.type === 'crear' ? crearTarea : asignarTarea}
                className="flex-1 py-2 text-white rounded-xl font-bold transition"
                style={{ backgroundColor: showConfirm.type === 'crear' ? alloy.blue2 : alloy.green }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-8">
        <button onClick={() => navigate("/admin")} className="text-gray-400 hover:text-gray-600 flex items-center gap-2">← Volver al Panel</button>
        <h1 className="text-3xl font-bold text-center" style={{ color: alloy.blue1 }}>Administración de Tareas</h1>

        {msg && <div className="p-3 text-center rounded-lg bg-blue-50 text-blue-700 border border-blue-100 font-medium"> {msg} </div>}

        <div className="bg-white shadow-md rounded-xl p-6 border-l-4 border-[#37788a]">
          <h2 className="text-xl font-semibold mb-4" style={{ color: alloy.blue1 }}>Gestión de Flujo</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button onClick={() => setVista("activas")} className="py-3 rounded-lg font-semibold text-white transition hover:brightness-90 shadow-md" style={{ backgroundColor: alloy.green }}>Tareas Activas ({tareasActivas.length})</button>
            <button onClick={() => setVista("propuestas")} className="py-3 rounded-lg font-semibold text-white transition hover:brightness-90 shadow-md" style={{ backgroundColor: alloy.orange }}>Tareas Propuestas ({tareasPropuestas.length})</button>
            <button onClick={() => setVista("historial")} className="py-3 rounded-lg font-semibold text-white transition hover:brightness-90 shadow-md" style={{ backgroundColor: alloy.dark }}>Historial</button>
          </div>
        </div>

        {/* --- VISTA TAREAS ACTIVAS --- */}
        {vista === "activas" && (
          <div className="bg-white shadow-md rounded-xl p-6 animate-in fade-in duration-300 border-t-4 border-[#6ec5ac]">
            <h2 className="text-xl font-bold mb-6 text-[#6ec5ac]">Por Revisar</h2>
            {tareasActivas.length === 0 ? (
              <p className="text-center text-gray-400">Sin tareas.</p>
            ) : (
              <div className="space-y-4">
                {tareasActivas.map((t) => (
                  <div key={t.id} className="p-4 border rounded-xl flex flex-col md:flex-row justify-between gap-4 bg-white hover:shadow-md transition">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="font-bold text-gray-800">{t.nombre_trabajador}</p>
                        <span className="text-[10px] bg-gray-100 px-2 py-1 rounded text-gray-500 font-medium">Creada: {t.fecha}</span>
                        {t.prioritaria && <span className="text-[9px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-black">PRIORITARIA</span>}
                      </div>
                      <p className="text-xs text-blue-600 font-black uppercase">{t.proyecto} | {t.codigos_tarea?.codigo}</p>
                      <p className="text-sm italic text-gray-700 mt-1 mb-3">"{t.codigos_tarea?.descripcion}"</p>

                      {/* ACTUALIZACIÓN: Botón de Evidencia en Activas */}
                      {t.evidencia_url && (
                        <a href={t.evidencia_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mb-3 text-[10px] bg-cyan-50 text-cyan-700 px-2 py-1 rounded font-bold hover:bg-cyan-100">
                          📎 VER ARCHIVO ADJUNTO
                        </a>
                      )}

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 border-t pt-3">
                        <div><p className="text-[9px] font-bold text-gray-400 uppercase">Estatus</p><p className={`text-xs font-bold ${t.estado === "Completada" ? "text-green-600" : "text-orange-600"}`}>{t.estado}</p></div>
                        <div><p className="text-[9px] font-bold text-gray-400 uppercase">Vencimiento</p><p className="text-xs font-bold text-rose-600">{t.fecha_vencimiento || "Sin fecha"}</p></div>
                        <div><p className="text-[9px] font-bold text-gray-400 uppercase">Consumo</p><p className="text-xs font-bold text-gray-800">{t.horas}h</p></div>
                        <div><p className="text-[9px] font-bold text-gray-400 uppercase">Urgencia / Imp.</p><p className="text-xs text-gray-600">{t.urgencia} / {t.importancia}</p></div>
                        <div className="col-span-2 md:col-span-1"><p className="text-[9px] font-bold text-gray-400 uppercase">Hito</p><p className="text-xs text-gray-600 truncate">{t.entregable || "N/A"}</p></div>
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

        {/* --- VISTA PROPUESTAS --- */}
        {vista === "propuestas" && (
          <div className="bg-white shadow-md rounded-xl p-6 animate-in fade-in duration-300 border-t-4 border-[#e67e22]">
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
                        <p className="col-span-2"><span className="font-bold uppercase text-gray-400">Hito:</span> {p.entregable}</p>
                      </div>
                      <p className="text-sm bg-white p-3 rounded-lg border border-orange-100 italic text-gray-700">"{p.descripcion_propuesta}"</p>
                      
                      {/* ACTUALIZACIÓN: Botón de Evidencia en Propuestas */}
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

        {/* --- HISTORIAL --- */}
        {vista === "historial" && (
          <div className="bg-white shadow-md rounded-xl p-6 animate-in fade-in duration-300 border-t-4 border-[#4b4b54]">
            <h2 className="text-xl font-bold mb-6 text-[#4b4b54]">Historial de Revisiones</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-gray-400 uppercase text-[10px]">
                    <th className="pb-2">Fecha</th>
                    <th className="pb-2">Trabajador</th>
                    <th className="pb-2">Proyecto / Código</th>
                    <th className="pb-2">Horas</th>
                    <th className="pb-2">Archivo</th>
                    <th className="pb-2">Revisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {historial.map(h => (
                    <tr key={h.id} className="hover:bg-gray-50 transition">
                      <td className="py-3 text-gray-500 text-xs">{h.fecha}</td>
                      <td className="py-3 font-bold text-gray-800">{h.nombre_trabajador}</td>
                      <td className="py-3">
                        <p className="font-medium text-gray-700 uppercase text-[11px]">{h.proyecto}</p>
                        <p className="text-[10px] text-blue-500">{h.codigos_tarea?.codigo}</p>
                      </td>
                      <td className="py-3 text-gray-600 font-bold">{h.horas}h</td>
                      
                      {/* ACTUALIZACIÓN: Columna Archivo en Historial */}
                      <td className="py-3">
                        {h.evidencia_url ? (
                          <a href={h.evidencia_url} target="_blank" rel="noreferrer" className="text-cyan-600 hover:text-cyan-800 font-bold text-[10px]">VER</a>
                        ) : (
                          <span className="text-gray-300 text-[10px]">-</span>
                        )}
                      </td>

                      <td className="py-3">
                        <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase ${h.revision === 'aprobada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {h.revision}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ... (Resto del componente: SECCIÓN CREAR Y ASIGNAR sin cambios) ... */}
        <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow border-l-4 border-[#387a8b]">
              <h2 className="font-bold text-[#387a8b] mb-4 uppercase text-xs tracking-widest">1. Definir Nuevo Código</h2>
              <div className="space-y-3">
                <input className="w-full p-2 border rounded text-sm" placeholder="Código (Ej: REV-01)" value={newCodigoNombre} onChange={e => setNewCodigoNombre(e.target.value)} />
                <input className="w-full p-2 border rounded text-sm" placeholder="Descripción de la tarea" value={newTareaDesc} onChange={e => setNewTareaDesc(e.target.value)} />
                <select className="w-full p-2 border rounded text-sm bg-white" value={newProyecto} onChange={e => {setNewProyecto(e.target.value); setNewEntregable("");}}>
                  <option value="">Selecciona un Proyecto</option>
                  {proyectos.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                </select>
                <div className="flex gap-2">
                    <button onClick={() => setTipoSeleccion("entregable")} className={`flex-1 text-[10px] p-2 rounded font-bold ${tipoSeleccion === 'entregable' ? 'bg-[#37788a] text-white' : 'bg-gray-100'}`}>ENTREGABLE</button>
                    <button onClick={() => setTipoSeleccion("actividad")} className={`flex-1 text-[10px] p-2 rounded font-bold ${tipoSeleccion === 'actividad' ? 'bg-[#37788a] text-white' : 'bg-gray-100'}`}>HITO/ACT</button>
                </div>
                <select disabled={!newProyecto} className="w-full p-2 border rounded text-sm bg-white" value={newEntregable} onChange={e => setNewEntregable(e.target.value)}>
                  <option value="">Seleccionar {tipoSeleccion}...</option>
                  {entregablesDB.map(item => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}
                </select>
                <button onClick={() => setShowConfirm({ show: true, type: 'crear' })} className="w-full py-3 text-white rounded-lg font-bold shadow-lg" style={{ backgroundColor: alloy.blue2 }}>Guardar Código</button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow border-l-4 border-[#6ec5ac]">
              <h2 className="font-bold text-[#6ec5ac] mb-4 uppercase text-xs tracking-widest">2. Asignar a Trabajador</h2>
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-400 uppercase">1. Proyecto de destino</label>
                <select className="w-full p-2 border border-blue-200 rounded text-sm bg-blue-50/50" value={filtroProyectoAsignacion} onChange={e => {setFiltroProyectoAsignacion(e.target.value); setSelectedUser(""); setSelectedCode("");}}>
                  <option value="">Selecciona un Proyecto...</option>
                  {proyectos.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                </select>
                <label className="text-[10px] font-bold text-gray-400 uppercase">2. Personal asignado al proyecto</label>
                <select disabled={!filtroProyectoAsignacion} className="w-full p-2 border rounded text-sm bg-white disabled:bg-gray-50" value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
                  <option value="">{filtroProyectoAsignacion ? "Selecciona trabajador..." : "Selecciona proyecto primero"}</option>
                  {usuariosFiltrados.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
                <label className="text-[10px] font-bold text-gray-400 uppercase">3. Hito / Entregable</label>
                <select className="w-full p-2 border border-blue-200 rounded text-sm bg-blue-50/50" value={filtroEntregableAsignacion} disabled={!filtroProyectoAsignacion} onChange={e => {setFiltroEntregableAsignacion(e.target.value); setSelectedCode("");}}>
                  <option value="">Todos los entregables...</option>
                  {[...new Set(codigos.filter(c => c.proyecto === filtroProyectoAsignacion).map(c => c.entregable))].map(ent => (
                    <option key={ent} value={ent}>{ent}</option>
                  ))}
                </select>
                <label className="text-[10px] font-bold text-gray-400 uppercase">4. Código de Tarea</label>
                <select className="w-full p-2 border rounded text-sm bg-white" value={selectedCode} onChange={e => setSelectedCode(e.target.value)} disabled={!filtroProyectoAsignacion}>
                  <option value="">{filtroProyectoAsignacion ? "Selecciona código" : "Selecciona proyecto primero"}</option>
                  {codigosFiltrados.map(c => <option key={c.id} value={c.id}>{c.codigo} - {c.descripcion.substring(0, 40)}...</option>)}
                </select>

                {selectedCode && infoCodigoSeleccionado && (
                  <div className="p-3 bg-slate-50 border rounded-lg animate-in fade-in slide-in-from-top-1 duration-200">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Descripción del código:</p>
                    <p className="text-xs italic text-gray-600">"{infoCodigoSeleccionado.descripcion}"</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Importancia</label>
                    <select className="w-full p-2 border rounded text-sm bg-white" value={importancia} onChange={e => setImportancia(e.target.value)}>
                      <option value="Alta">Alta</option>
                      <option value="Media">Media</option>
                      <option value="Baja">Baja</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Urgencia</label>
                    <select className="w-full p-2 border rounded text-sm bg-white" value={urgencia} onChange={e => setUrgencia(e.target.value)}>
                      <option value="Alta">Alta</option>
                      <option value="Baja">Baja</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Dificultad</label>
                    <select className="w-full p-2 border rounded text-sm bg-white" value={dificultad} onChange={e => setDificultad(e.target.value)}>
                      <option value="Alta">Alta</option>
                      <option value="Media">Media</option>
                      <option value="Baja">Baja</option>
                    </select>
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer bg-slate-50 p-2 rounded-lg border w-full">
                      <input type="checkbox" checked={prioritaria} onChange={e => setPrioritaria(e.target.checked)} className="w-4 h-4 accent-[#6ec5ac]" />
                      <span className="text-[10px] font-bold uppercase text-gray-600">¿Es Prioritaria?</span>
                    </label>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Fecha Límite / Entrega</label>
                  <input type="date" className="w-full p-2 border rounded text-sm bg-white" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)} />
                </div>
                <button onClick={() => setShowConfirm({ show: true, type: 'asignar' })} disabled={isProcessing || !selectedCode} className="w-full py-3 text-white rounded-lg font-bold shadow-lg disabled:opacity-50" style={{ backgroundColor: alloy.green }}>
                  {isProcessing ? "Asignando..." : "Vincular Tarea"}
                </button>
              </div>
            </div>
        </div>
      </div>
    </div>
  );
}