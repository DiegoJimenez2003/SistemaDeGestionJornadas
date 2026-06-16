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
  const [nombre, setNombre] = useState("");
  const [cliente, setCliente] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [estado, setEstado] = useState("activo");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [encargados, setEncargados] = useState([""]); 
  const [msg, setMsg] = useState("");
  const [trabajadores, setTrabajadores] = useState([]); 

  // NUEVOS ESTADOS PARA ROBUSTEZ
  const [proyectoExpandido, setProyectoExpandido] = useState(null); // ID del proyecto abierto
  const [entregablesProy, setEntregablesProy] = useState([]); // Entregables del proy abierto
  const [modalTareas, setModalTareas] = useState({ abierto: false, entregable: null, tareas: [] });


  // =========================
  // CARGA DE DATOS
  // =========================
  async function loadData() {
  // 1. Cargamos proyectos con sus responsables
  const { data: dataProy, error: errorProy } = await supabase
    .from("proyectos")
    .select(`
      *, 
      proyecto_encargados (user_id, perfiles (nombre, apellido, rol, activo)),
      proyecto_recursos (user_id, perfiles (nombre, apellido, rol, activo))
    `)
    .order("created_at", { ascending: false });

  if (!errorProy) setProyectos(dataProy || []);

  // 2. Cargamos PMs/Admins
  const { data: dataPms } = await supabase
    .from("perfiles")
    .select("user_id, nombre, apellido, rol")
    .in("rol", ["pm", "admin"])
    .eq("activo", true); 

  setPms(dataPms || []);

  // 3. Cargamos Trabajadores: TODOS los roles que estén activos
const { data: dataWorkers } = await supabase
  .from("perfiles")
  .select("user_id, nombre, apellido, rol")
  .eq("activo", true); 

setTrabajadores(dataWorkers || []);
}

  // Cargar entregables cuando se expande un proyecto
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

  // Cargar tareas cuando se hace click en un entregable
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

  // =========================
  // LOGICA DINAMICA (Sigue igual...)
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

  async function crearProyecto() {
    if (!nombre || !fechaInicio) return setMsg("⚠️ Nombre y fecha de inicio son obligatorios.");
    const { data: nuevoProy, error } = await supabase
      .from("proyectos")
      .insert([{ nombre, cliente: cliente || null, descripcion: descripcion || null, estado, fecha_inicio: fechaInicio, fecha_fin: fechaFin || null }])
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
    setNombre(""); setCliente(""); setDescripcion(""); setEstado("activo"); setFechaInicio(""); setFechaFin(""); setEncargados([""]);
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
  
  if (error) {
    console.error(error);
  } else {
    loadData(); // Recargamos para ver los cambios
  }
};

const eliminarRecurso = async (proyectoId, userId) => {
  const { error } = await supabase
    .from("proyecto_recursos")
    .delete()
    .eq("proyecto_id", proyectoId)
    .eq("user_id", userId);

  if (error) {
    console.error(error);
  } else {
    loadData();
  }
};

  useEffect(() => { loadData(); }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 relative">
      <div className="max-w-6xl mx-auto space-y-8">
        <button onClick={() => navigate("/admin")} className="text-gray-400 hover:text-gray-600 flex items-center gap-2">← Volver al Panel</button>
        <h1 className="text-3xl font-bold text-center uppercase tracking-tighter" style={{ color: alloy.blue1 }}>Gestión <span className="italic text-slate-900">Proyectos</span></h1>

        {/* MODAL DE TAREAS */}
        {modalTareas.abierto && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
              <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="text-2xl font-black italic uppercase tracking-tighter">{modalTareas.entregable}</h3>
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
                        <p className="font-bold text-slate-800">{t.nombre_trabajador}</p>
                        <p className="text-[10px] text-blue-500 font-black uppercase">{t.codigos_tarea?.codigo} | {t.fecha}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black italic">{t.horas} HH</p>
                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase ${t.revision === 'aprobada' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>{t.revision}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* SECCION CREAR */}
        <div className="bg-white shadow-md rounded-xl p-6 border-l-4 border-[#387a8b]">
          <h2 className="text-xl font-semibold mb-4" style={{ color: alloy.blue2 }}>Crear nuevo proyecto</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input className="p-3 border rounded-lg" placeholder="Nombre del proyecto" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <input className="p-3 border rounded-lg" placeholder="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} />
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase">Asignar Encargados</label>
              {encargados.map((id, index) => (
                <div key={index} className="flex gap-2">
                  <select className="flex-1 p-3 border rounded-lg bg-white" value={id} onChange={(e) => handleEncargadoChange(index, e.target.value)}>
                    <option value="">-- Seleccionar Encargado --</option>
                    {pms.map(p => <option key={p.user_id} value={p.user_id}>[{p.rol.toUpperCase()}] {p.nombre} {p.apellido}</option>)}
                  </select>
                  {index < encargados.length - 1 && <button onClick={() => eliminarEncargado(index)} className="px-3 text-red-500">✕</button>}
                </div>
              ))}
            </div>
            <select className="p-3 border rounded-lg" value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="activo">Activo</option>
              <option value="pausado">Pausado</option>
              <option value="cerrado">Cerrado</option>
            </select>
            <div className="grid grid-cols-2 gap-4">
              <input type="date" className="p-3 border rounded-lg w-full" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
              <input type="date" className="p-3 border rounded-lg w-full" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
            </div>
            <textarea className="p-3 border rounded-lg md:col-span-2" placeholder="Descripción..." value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
          <button onClick={crearProyecto} className="mt-6 w-full py-3 text-white rounded-lg font-bold" style={{ backgroundColor: alloy.blue2 }}>Crear Proyecto</button>
        </div>

        {/* HISTORIAL ROBUSTO CON ACORDEÓN */}
        <div className="bg-white p-6 rounded-xl shadow">
          <h2 className="text-xl font-semibold mb-6">Historial y Jerarquía del Proyecto</h2>
          <div className="space-y-4">
            {proyectos.map(p => {
              const listaIds = p.proyecto_encargados?.map(e => e.user_id) || [];
              const displayIds = [...listaIds, ""];
              const esExpandido = proyectoExpandido === p.id;

              return (
                <div key={p.id} className={`border-2 rounded-[2rem] transition-all overflow-hidden ${esExpandido ? 'border-slate-200 shadow-xl' : 'border-slate-50'}`}>
                  {/* CABECERA PROYECTO */}
                  <div className="p-6 flex flex-col md:flex-row justify-between items-center gap-4 cursor-pointer hover:bg-slate-50" onClick={() => toggleProyecto(p)}>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className={`w-3 h-3 rounded-full ${p.estado === 'activo' ? 'bg-green-400' : 'bg-slate-300'}`}></span>
                        <p className="font-black text-xl text-slate-800 uppercase italic tracking-tighter">{p.nombre}</p>
                      </div>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{p.cliente} | Inicio: {p.fecha_inicio}</p>
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
                    <div className="bg-slate-50 p-6 border-t-2 border-slate-100 grid md:grid-cols-3 gap-6">
                      {/* COLUMNA ENTREGABLES */}
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

                      {/* COLUMNA GESTIÓN ENCARGADOS */}
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
                              <button onClick={() => eliminarEncargadoExistente(p.id, listaIds, idx)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* COLUMNA GESTIÓN RECURSOS (NUEVO PERSONAL) */}
                      <div className="space-y-2 border-l pl-6 border-slate-200">
                        <h4 className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-4">Personal Asignado (Recursos)</h4>
                        <div className="space-y-2">
                          {p.proyecto_recursos?.map((res, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
                              <span className="text-xs font-bold text-slate-600">{res.perfiles?.nombre} {res.perfiles?.apellido}</span>
                              <button onClick={() => eliminarRecurso(p.id, res.user_id)} className="text-red-400 hover:text-red-600 font-bold px-2">✕</button>
                            </div>
                          ))}
                        </div>
                        <select 
                          className="w-full p-2 text-xs border-2 border-dashed border-slate-200 rounded-xl bg-transparent mt-4 italic text-slate-500"
                          value=""
                          onChange={(e) => agregarRecurso(p.id, e.target.value)}
                        >
                          <option value="">+ Asignar personal operativo</option>
                          {trabajadores
                          .filter(t => !p.proyecto_recursos?.some(r => r.user_id === t.user_id))
                          .map(t => (
                            <option key={t.user_id} value={t.user_id}>
                              {/* Añadimos el rol entre paréntesis para mayor claridad */}
                              ({t.rol.toUpperCase()}) {t.nombre} {t.apellido}
                            </option>
                          ))
                        }
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}