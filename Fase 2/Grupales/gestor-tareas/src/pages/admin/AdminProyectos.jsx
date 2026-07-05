import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function AdminProyectos() {
  const navigate = useNavigate();
  const alloy = {
    green: "#6ec5ac",
    dark: "#4b4b54",
    blue1: "#37788a",
    blue2: "#387a8b",
    orange: "#e67e22"
  };

  // =========================
  // ESTADOS
  // =========================
  const [proyectos, setProyectos] = useState([]);
  const [pms, setPms] = useState([]); 
  const [clientes, setClientes] = useState([]); 
  const [nombre, setNombre] = useState("");
  const [clienteId, setClienteId] = useState(""); 
  const [descripcion, setDescripcion] = useState("");
  const [estadoId, setEstadoId] = useState("activo"); // Adaptado a estado_id
  
  // FECHAS FORMULARIO CREAR
  const [fechaInicioPlan, setFechaInicioPlan] = useState("");
  const [fechaFinPlan, setFechaFinPlan] = useState("");
  const [fechaInicioReal, setFechaInicioReal] = useState("");
  const [fechaFinReal, setFechaFinReal] = useState("");
  const [porcentajeAvance, setPorcentajeAvance] = useState(0);

  const [encargados, setEncargados] = useState([""]); 
  const [msg, setMsg] = useState("");
  const [trabajadores, setTrabajadores] = useState([]); 

  // Filtro de clientes en el historial
  const [filtroCliente, setFiltroCliente] = useState("");

  // ESTADOS EDICIÓN DE PROYECTO (DENTRO DEL ACORDEÓN)
  const [editFechas, setEditFechas] = useState({ id: null, inicioReal: "", finReal: "", avance: 0, estadoId: "" });

  // MODALES
  const [proyectoExpandido, setProyectoExpandido] = useState(null); 
  const [entregablesProy, setEntregablesProy] = useState([]); 
  const [modalTareas, setModalTareas] = useState({ abierto: false, entregableNombre: "", tareas: [] });
  
  const [modalCliente, setModalCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: "", rut: "", contacto: "", correo: "" });

  // =========================
  // CARGA DE DATOS
  // =========================
  async function loadData() {
    const { data: dataProy, error: errorProy } = await supabase
      .from("proyectos")
      .select(`
        *, 
        clientes (id, nombre),
        proyecto_encargados (user_id, perfiles (nombre, apellido, rol, activo)),
        proyecto_recursos (user_id, perfiles (nombre, apellido, rol, activo))
      `)
      .order("created_at", { ascending: false });

    if (!errorProy) setProyectos(dataProy || []);

    const { data: dataClientes } = await supabase
      .from("clientes")
      .select("*")
      .order("nombre");
    setClientes(dataClientes || []);

    const { data: dataPms } = await supabase
      .from("perfiles")
      .select("user_id, nombre, apellido, rol")
      .in("rol", ["pm", "admin"])
      .eq("activo", true); 

    setPms(dataPms || []);

    const { data: dataWorkers } = await supabase
      .from("perfiles")
      .select("user_id, nombre, apellido, rol")
      .eq("activo", true); 

    setTrabajadores(dataWorkers || []);
  }

  // Cargar entregables vinculados por proyecto_id
  async function toggleProyecto(proyecto) {
    if (proyectoExpandido === proyecto.id) {
      setProyectoExpandido(null);
      setEntregablesProy([]);
      setEditFechas({ id: null, inicioReal: "", finReal: "", avance: 0, estadoId: "" });
    } else {
      setProyectoExpandido(proyecto.id);
      
      setEditFechas({
        id: proyecto.id,
        inicioReal: proyecto.fecha_inicio_real || "",
        finReal: proyecto.fecha_fin_real || "",
        avance: proyecto.porcentaje_avance || 0,
        estadoId: proyecto.estado_id || "activo"
      });

      const { data } = await supabase
        .from("entregables")
        .select("*")
        .eq("proyecto_id", proyecto.id); // Cambio clave: Filtrado por id relacional
      setEntregablesProy(data || []);
    }
  }

  // Actualizar las fechas reales y progreso mapeados al nuevo modelo
  async function guardarCambiosProyecto(proyectoId) {
    const { error } = await supabase
      .from("proyectos")
      .update({
        fecha_inicio_real: editFechas.inicioReal || null,
        fecha_fin_real: editFechas.finReal || null,
        porcentaje_avance: Number(editFechas.avance),
        estado_id: editFechas.estadoId // Guardando en la nueva columna de catálogo
      })
      .eq("id", proyectoId);

    if (error) {
      alert("Error al actualizar el proyecto: " + error.message);
    } else {
      setMsg("✅ Proyecto actualizado correctamente.");
      loadData();
      setTimeout(() => setMsg(""), 3000);
    }
  }

  // Cargar tareas del entregable con relaciones limpias
  async function verTareasEntregable(entregable) {
    const { data, error } = await supabase
      .from("tareas")
      .select("*, codigos_tarea(codigo)")
      .eq("entregable_id", entregable.id) // Filtrado por relación numérica
      .eq("proyecto_id", entregable.proyecto_id);
    
    if (!error) {
      setModalTareas({ abierto: true, entregableNombre: entregable.nombre, tareas: data || [] });
    }
  }

  // =========================
  // LOGICA ACCIONES
  // =========================
  const handleEncargadoChange = (index, value) => {
    const nuevosEncargados = [...encargados];
    nuevosEncargados[index] = value;
    if (value !== "" && index === nuevosEncargados.length - 1) nuevosEncargados.push("");
    setEncargados(nuevosEncargados);
  };

  const eliminarEncargado = (index) => {
    if (encargados.length > 1) setEncargados(encargados.filter((_, i) => i !== index));
  };

  const calcularDesviacion = (planificada, real) => {
    if (!planificada || !real) return "No iniciado en la realidad";
    const datePlan = new Date(planificada);
    const dateReal = new Date(real);
    const diferenciaTiempo = dateReal - datePlan;
    const dias = Math.ceil(diferenciaTiempo / (1000 * 60 * 60 * 24));

    if (dias === 0) return "A tiempo";
    return dias > 0 ? `⚠️ +${dias} días de desfase` : `✅ ${Math.abs(dias)} días adelantado`;
  };

  async function crearClienteExpress() {
    if (!nuevoCliente.nombre) return alert("El nombre del cliente es obligatorio");
    const { data, error } = await supabase
      .from("clientes")
      .insert([nuevoCliente])
      .select()
      .single();

    if (error) {
      alert("Error al crear cliente: " + error.message);
    } else {
      setClientes([data, ...clientes]); 
      setClienteId(data.id); 
      setModalCliente(false); 
      setNuevoCliente({ nombre: "", rut: "", contacto: "", correo: "" });
    }
  }

  async function crearProyecto() {
    if (!nombre || !fechaInicioPlan) return setMsg("⚠️ El Nombre y la Fecha Estimada de Inicio son obligatorios.");
    
    const { data: nuevoProy, error } = await supabase
      .from("proyectos")
      .insert([{ 
        nombre, 
        cliente_id: clienteId || null, 
        descripcion: descripcion || null, 
        estado_id: estadoId, // Columna de catálogo asignada
        fecha_inicio_planificada: fechaInicioPlan, 
        fecha_fin_planificada: fechaFinPlan || null,
        fecha_inicio_real: fechaInicioReal || null,
        fecha_fin_real: fechaFinReal || null,
        porcentaje_avance: porcentajeAvance || 0
      }])
      .select().single();

    if (error) return setMsg("❌ " + error.message);

    const idsFinales = encargados.filter(id => id !== "");
    if (idsFinales.length > 0) {
      const inserts = idsFinales.map(uid => ({ proyecto_id: nuevoProy.id, user_id: uid }));
      await supabase.from("proyecto_encargados").insert(inserts);
    }
    setMsg("✅ Proyecto creado correctamente.");
    resetForm();
    loadData();
  }

  const resetForm = () => {
    setNombre(""); setClienteId(""); setDescripcion(""); setEstadoId("activo"); 
    setFechaInicioPlan(""); setFechaFinPlan(""); setFechaInicioReal(""); setFechaFinReal("");
    setPorcentajeAvance(0); setEncargados([""]);
  };

  const handleUpdateEncargado = async (proyectoId, currentList, index, newValue) => {
    let updatedIds = [...currentList];
    updatedIds[index] = newValue;
    const idsFinales = Array.from(new Set(updatedIds.filter(id => id !== "")));
    await supabase.from("proyecto_encargados").delete().eq("proyecto_id", proyectoId);
    if (idsFinales.length > 0) {
      const inserts = idsFinales.map(uid => ({ proyecto_id: proyectoId, user_id: uid }));
      await supabase.from("proyecto_encargados").insert(inserts);
    }
    loadData();
  };

  const eliminarEncargadoExistente = async (proyectoId, currentList, index) => {
    const updatedIds = currentList.filter((_, i) => i !== index);
    await supabase.from("proyecto_encargados").delete().eq("proyecto_id", proyectoId);
    if (updatedIds.length > 0) {
      const inserts = updatedIds.map(uid => ({ proyecto_id: proyectoId, user_id: uid }));
      await supabase.from("proyecto_encargados").insert(inserts);
    }
    loadData();
  };
  
  const agregarRecurso = async (proyectoId, userId) => {
    if (!userId) return;
    const { error } = await supabase
      .from("proyecto_recursos")
      .insert([{ proyecto_id: proyectoId, user_id: userId }]);
    if (!error) loadData();
  };

  const eliminarRecurso = async (proyectoId, userId) => {
    const { error } = await supabase
      .from("proyecto_recursos")
      .delete()
      .eq("proyecto_id", proyectoId)
      .eq("user_id", userId);
    if (!error) loadData();
  };

  useEffect(() => { loadData(); }, []);

  const proyectosFiltrados = proyectos.filter(p => {
    if (!filtroCliente) return true;
    return p.cliente_id === filtroCliente;
  });

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 relative">
      <div className="max-w-6xl mx-auto space-y-8">
        <button onClick={() => navigate("/admin")} className="text-gray-400 hover:text-gray-600 flex items-center gap-2">← Volver al Panel</button>
        <h1 className="text-3xl font-bold text-center uppercase tracking-tighter" style={{ color: alloy.blue1 }}>Gestión <span className="italic text-slate-900">Proyectos</span></h1>

        {msg && <p className="text-center p-3 font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl shadow-sm max-w-md mx-auto">{msg}</p>}

        {/* MODAL EXPRESS: CREAR CLIENTE */}
        {modalCliente && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-2xl w-full max-w-md space-y-4 shadow-xl">
              <h3 className="text-lg font-bold text-slate-800">Crear Cliente Nuevo</h3>
              <div className="space-y-2">
                <input type="text" placeholder="Nombre / Razón Social (*)" className="w-full p-2 border rounded-lg text-sm" value={nuevoCliente.nombre} onChange={(e)=>setNuevoCliente({...nuevoCliente, nombre: e.target.value})} />
                <input type="text" placeholder="RUT" className="w-full p-2 border rounded-lg text-sm" value={nuevoCliente.rut} onChange={(e)=>setNuevoCliente({...nuevoCliente, rut: e.target.value})} />
                <input type="text" placeholder="Nombre Contacto" className="w-full p-2 border rounded-lg text-sm" value={nuevoCliente.contacto} onChange={(e)=>setNuevoCliente({...nuevoCliente, contacto: e.target.value})} />
                <input type="email" placeholder="Correo" className="w-full p-2 border rounded-lg text-sm" value={nuevoCliente.correo} onChange={(e)=>setNuevoCliente({...nuevoCliente, correo: e.target.value})} />
              </div>
              <div className="flex gap-2 justify-end text-sm pt-2">
                <button onClick={() => setModalCliente(false)} className="px-4 py-2 rounded-lg text-gray-500 bg-gray-100">Cancelar</button>
                <button onClick={crearClienteExpress} className="px-4 py-2 rounded-lg text-white font-bold" style={{ backgroundColor: alloy.blue1 }}>Guardar y Asignar</button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE TAREAS */}
        {modalTareas.abierto && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
              <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="text-2xl font-black italic uppercase tracking-tighter">{modalTareas.entregableNombre}</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tareas vinculadas</p>
                </div>
                <button onClick={() => setModalTareas({ ...modalTareas, abierto: false })} className="w-10 h-10 rounded-full bg-white border shadow-sm flex items-center justify-center font-bold">✕</button>
              </div>
              <div className="p-6 overflow-y-auto space-y-3">
                {modalTareas.tareas.length === 0 ? (
                  <p className="text-center py-10 text-slate-300 font-bold uppercase text-xs">No hay tareas reportadas para este entregable</p>
                ) : (
                  modalTareas.tareas.map(t => (
                    <div key={t.id} className="p-4 border rounded-2xl flex justify-between items-center hover:bg-slate-50 transition">
                      <div>
                        <p className="font-bold text-slate-800">{t.nombre_trabajador || "Trabajador asignado"}</p>
                        <p className="text-[10px] text-blue-500 font-black uppercase">{t.codigos_tarea?.codigo} | {t.fecha}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black italic">{t.horas} HH</p>
                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase ${t.revision_id === 'aprobada' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>{t.revision_id}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* SECCION CREAR PROYECTO */}
        <div className="bg-white shadow-md rounded-xl p-6 border-l-4 border-[#387a8b]">
          <h2 className="text-xl font-semibold mb-4" style={{ color: alloy.blue2 }}>Crear nuevo proyecto</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Nombre del proyecto (*)</label>
                <input className="p-3 border rounded-lg w-full" placeholder="Ej: Sistema ERP Fase 1" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Cliente Asignado</label>
                <div className="flex gap-2">
                  <select className="flex-1 p-3 border rounded-lg bg-white text-sm" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                    <option value="">-- Seleccionar Cliente Existente --</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                  <button type="button" onClick={() => setModalCliente(true)} className="px-3 bg-slate-100 border text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-200 transition">+ Nuevo</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Estado inicial</label>
                  <select className="p-3 border rounded-lg bg-white text-sm" value={estadoId} onChange={(e) => setEstadoId(e.target.value)}>
                    <option value="activo">Activo</option>
                    <option value="pausado">Pausado</option>
                    <option value="cerrado">Cerrado</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">% Avance Inicial</label>
                  <input type="number" min="0" max="100" className="p-3 border rounded-lg w-full text-sm" value={porcentajeAvance} onChange={(e) => setPorcentajeAvance(Number(e.target.value))} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase block">Líderes / PM Encargados</label>
                {encargados.map((id, index) => (
                  <div key={index} className="flex gap-2">
                    <select className="flex-1 p-2.5 border rounded-lg bg-white text-xs" value={id} onChange={(e) => handleEncargadoChange(index, e.target.value)}>
                      <option value="">-- Seleccionar Encargado --</option>
                      {pms.map(p => <option key={p.user_id} value={p.user_id}>[{p.rol.toUpperCase()}] {p.nombre} {p.apellido}</option>)}
                    </select>
                    {index < encargados.length - 1 && <button onClick={() => eliminarEncargado(index)} className="px-2 text-red-500">✕</button>}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
              <div className="bg-white p-3 rounded-xl border-l-4 border-blue-500 shadow-sm space-y-2">
                <span className="text-xs font-black text-blue-600 uppercase tracking-wide block">1. Cronograma Estimado (Plan)</span>
                <p className="text-[11px] text-gray-400">¿Cuándo debería pasar según el contrato?</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400 font-bold block uppercase">Inicio Estimado (*)</label>
                    <input type="date" className="p-2 border rounded-md text-xs w-full mt-0.5" value={fechaInicioPlan} onChange={(e) => setFechaInicioPlan(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-bold block uppercase">Fin Estimado</label>
                    <input type="date" className="p-2 border rounded-md text-xs w-full mt-0.5" value={fechaFinPlan} onChange={(e) => setFechaFinPlan(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="bg-white p-3 rounded-xl border-l-4 border-orange-500 shadow-sm space-y-2">
                <span className="text-xs font-black text-orange-600 uppercase tracking-wide block">2. Execution Real (Día a Día)</span>
                <p className="text-[11px] text-gray-400">¿Cuándo empezó realmente?</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400 font-bold block uppercase">Inicio Real</label>
                    <input type="date" className="p-2 border rounded-md text-xs w-full mt-0.5" value={fechaInicioReal} onChange={(e) => setFechaInicioReal(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-bold block uppercase">Término Real</label>
                    <input type="date" className="p-2 border rounded-md text-xs w-full mt-0.5" value={fechaFinReal} onChange={(e) => setFechaFinReal(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Notas o Descripción</label>
                <textarea rows="2" className="p-3 border rounded-lg text-sm bg-white" placeholder="Breve alcance del proyecto..." value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
              </div>
            </div>

          </div>
          <button onClick={crearProyecto} className="mt-6 w-full py-3 text-white rounded-lg font-bold shadow-md hover:opacity-90 transition" style={{ backgroundColor: alloy.blue2 }}>Crear Proyecto Completo</button>
        </div>

        {/* HISTORIAL CON ACORDEÓN */}
        <div className="bg-white p-6 rounded-xl shadow space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-4 border-b">
            <h2 className="text-xl font-semibold">Historial y Jerarquía del Proyecto</h2>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="text-xs font-bold text-slate-400 uppercase whitespace-nowrap">Filtrar por Cliente:</label>
              <select 
                className="p-2 border rounded-xl text-xs bg-white shadow-sm outline-none"
                value={filtroCliente}
                onChange={(e) => setFiltroCliente(e.target.value)}
              >
                <option value="">-- Todos los Clientes --</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            {proyectosFiltrados.length === 0 ? (
              <p className="text-center py-10 text-slate-400 italic text-sm">No se encontraron proyectos para este filtro.</p>
            ) : (
              proyectosFiltrados.map(p => {
                const listaIds = p.proyecto_encargados?.map(e => e.user_id) || [];
                const displayIds = [...listaIds, ""];
                const esExpandido = proyectoExpandido === p.id;

                return (
                  <div key={p.id} className={`border-2 rounded-[2rem] transition-all overflow-hidden ${esExpandido ? 'border-slate-200 shadow-xl' : 'border-slate-50'}`}>
                    
                    {/* CABECERA PROYECTO */}
                    <div className="p-6 flex flex-col md:flex-row justify-between items-center gap-4 cursor-pointer hover:bg-slate-50" onClick={() => toggleProyecto(p)}>
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className={`w-3 h-3 rounded-full ${p.estado_id === 'activo' ? 'bg-green-400' : p.estado_id === 'pausado' ? 'bg-amber-400' : 'bg-slate-300'}`}></span>
                          <p className="font-black text-xl text-slate-800 uppercase italic tracking-tighter">{p.nombre}</p>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{p.porcentaje_avance}% Avance</span>
                        </div>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{p.clientes?.nombre || "Sin cliente"} | Planificado: {p.fecha_inicio_planificada || 'S/N'}</p>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex -space-x-3">
                          {p.proyecto_encargados?.map((e, i) => (
                            <div key={i} title={e.perfiles?.nombre} className="w-8 h-8 rounded-full bg-slate-800 border-2 border-white flex items-center justify-center text-[10px] text-white font-bold uppercase">
                              {e.perfiles?.nombre?.substring(0,1)}
                            </div>
                          ))}
                        </div>
                        <div className={`p-2 rounded-full ${esExpandido ? 'bg-slate-900 text-white rotate-180' : 'bg-slate-100'} transition-transform`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                      </div>
                    </div>

                    {/* CONTENIDO EXPANDIDO */}
                    {esExpandido && (
                      <div className="bg-slate-50 p-6 border-t-2 border-slate-100 space-y-6">
                        
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                          <div className="flex justify-between items-center border-b pb-2">
                            <span className="text-xs font-black text-slate-700 uppercase tracking-wide block">Control de Seguimiento en Tiempo Real</span>
                            <span className="text-[10px] text-slate-400 italic">Actualiza el progreso real del proyecto</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] text-orange-600 font-bold uppercase">Fecha Inicio Real</label>
                              <input 
                                type="date" 
                                className="p-2 border rounded-lg text-xs bg-slate-50 font-semibold"
                                value={editFechas.inicioReal}
                                onChange={(e) => setEditFechas({ ...editFechas, inicioReal: e.target.value })}
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] text-orange-600 font-bold uppercase">Fecha Fin Real</label>
                              <input 
                                type="date" 
                                className="p-2 border rounded-lg text-xs bg-slate-50 font-semibold"
                                value={editFechas.finReal}
                                onChange={(e) => setEditFechas({ ...editFechas, finReal: e.target.value })}
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] text-slate-500 font-bold uppercase">% Progreso Avance</label>
                              <input 
                                type="number" 
                                min="0" max="100"
                                className="p-2 border rounded-lg text-xs bg-slate-50 font-semibold"
                                value={editFechas.avance}
                                onChange={(e) => setEditFechas({ ...editFechas, avance: e.target.value })}
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] text-slate-500 font-bold uppercase">Estado Actual</label>
                              <select 
                                className="p-2 border rounded-lg text-xs bg-slate-50 font-semibold"
                                value={editFechas.estadoId}
                                onChange={(e) => setEditFechas({ ...editFechas, estadoId: e.target.value })}
                              >
                                <option value="activo">Activo</option>
                                <option value="pausado">Pausado</option>
                                <option value="cerrado">Cerrado</option>
                              </select>
                            </div>
                          </div>

                          <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl text-xs">
                            <div>
                              <span className="text-gray-400 block font-bold uppercase tracking-wide">Desviación Base (Tesis):</span>
                              <span className={`font-black uppercase ${p.fecha_inicio_planificada && editFechas.inicioReal && editFechas.inicioReal > p.fecha_inicio_planificada ? 'text-red-500' : 'text-emerald-600'}`}>
                                {calcularDesviacion(p.fecha_inicio_planificada, editFechas.inicioReal)}
                              </span>
                            </div>
                            <button 
                              type="button" 
                              onClick={() => guardarCambiosProyecto(p.id)}
                              className="px-4 py-2 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 transition shadow-sm text-[11px]"
                            >
                              💾 Guardar Seguimiento Real
                            </button>
                          </div>
                        </div>

                        <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 flex justify-between items-center text-xs">
                          <div>
                            <span className="text-blue-600 font-black uppercase block tracking-wide">Planificación de Línea Base Original</span>
                            <span className="text-slate-500 font-medium">Lanzamiento estimado: <strong className="text-slate-800">{p.fecha_inicio_planificada || "No definida"}</strong></span>
                            <span className="mx-2 text-slate-300">|</span>
                            <span className="text-slate-500 font-medium">Término estimado: <strong className="text-slate-800">{p.fecha_fin_planificada || "No definida"}</strong></span>
                          </div>
                        </div>

                        {/* SUBSECCIÓN JERÁRQUICA */}
                        <div className="grid md:grid-cols-3 gap-6">
                          <div className="space-y-2">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Entregables / Hitos</h4>
                            {entregablesProy.length === 0 ? (
                              <p className="text-xs italic text-slate-400">Sin entregables definidos.</p>
                            ) : (
                              entregablesProy.map(ent => (
                                <button 
                                  key={ent.id} 
                                  onClick={() => verTareasEntregable(ent)}
                                  className="w-full text-left p-3 bg-white border rounded-xl hover:border-blue-400 hover:shadow-sm transition flex justify-between items-center group"
                                >
                                  <span className="text-sm font-bold text-slate-700 uppercase">{ent.nombre}</span>
                                  <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-bold opacity-0 group-hover:opacity-100 transition-opacity">VER TAREAS</span>
                                </button>
                              ))
                            )}
                          </div>

                          <div className="space-y-2">
                            <h4 className="text-[10px] font-black text-[#37788a] uppercase tracking-widest mb-4">PM Encargado</h4>
                            {displayIds.map((uid, idx) => (
                              <div key={idx} className="flex gap-2">
                                <select 
                                  className="flex-1 p-2 text-xs border rounded-xl bg-white"
                                  value={uid}
                                  onChange={(e) => handleUpdateEncargado(p.id, listaIds, idx, e.target.value)}
                                >
                                  <option value="">{idx === displayIds.length - 1 ? "+ Agregar encargado" : "-- Quitar --"}</option>
                                  {pms.map(pm => <option key={pm.user_id} value={pm.user_id}>({pm.rol}) {pm.nombre}</option>)}
                                </select>
                                {uid !== "" && (
                                  <button onClick={() => eliminarEncargadoExistente(p.id, listaIds, idx)} className="text-red-500 text-xs">✕</button>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="space-y-2">
                            <h4 className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-4">Recursos Operativos</h4>
                            <div className="flex flex-wrap gap-1.5 pb-2">
                              {p.proyecto_recursos?.map(r => (
                                <span key={r.user_id} className="inline-flex items-center gap-1 bg-white border px-2.5 py-1 rounded-full text-[11px] font-medium text-slate-700 shadow-sm">
                                  {r.perfiles?.nombre} {r.perfiles?.apellido}
                                  <button onClick={() => eliminarRecurso(p.id, r.user_id)} className="text-red-400 hover:text-red-600 ml-0.5">✕</button>
                                </span>
                              ))}
                            </div>
                            <select 
                              className="w-full p-2 text-xs border rounded-xl bg-white"
                              value=""
                              onChange={(e) => agregarRecurso(p.id, e.target.value)}
                            >
                              <option value="">+ Asignar Operador...</option>
                              {trabajadores
                                .filter(w => !p.proyecto_recursos?.some(r => r.user_id === w.user_id))
                                .map(w => <option key={w.user_id} value={w.user_id}>{w.nombre} {w.apellido}</option>)
                              }
                            </select>
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}