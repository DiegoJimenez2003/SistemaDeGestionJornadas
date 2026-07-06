import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function TaskForm() {
  const [loading, setLoading] = useState(false);
  const [assignedCodes, setAssignedCodes] = useState([]);
  const [isManual, setIsManual] = useState(false);

  const [dbProyectos, setDbProyectos] = useState([]);
  const [dbEntregables, setDbEntregables] = useState([]);
  const [solicitarNuevoProyecto, setSolicitarNuevoProyecto] = useState(false);
  const [solicitarNuevoEntregable, setSolicitarNuevoEntregable] = useState(false);

  // Se inicializan los estados adaptados a los valores default de la BD (texto / minúsculas)
  const initialForm = {
    usuario_id: "",
    nombre_trabajador: "",
    fecha: "",
    proyecto: "",       // Se usa el nombre/texto para la propuesta manual
    proyecto_id: "",    // ID real para la inserción en la tabla de tareas estándar
    entregable: "",     // Se usa el nombre/texto para la propuesta manual
    codigo_id: "",
    codigo_propuesto: "",
    descripcion_manual: "", 
    horas: "",
    estado_id: "en_progreso",  // Acorde a la nueva BD ('en_progreso', 'completada', etc)
    revision_id: "pendiente",  // Acorde a la nueva BD ('pendiente', etc)
  };

  const [form, setForm] = useState(initialForm);

  const alloy = {
    green: "#6ec5ac",
    blue1: "#37788a",
    blue2: "#38788b",
    orange: "#e67e22",
    red: "#ef4444"
  };

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: perfil } = await supabase.from("perfiles").select("nombre, apellido").eq("user_id", user.id).single();
        const userName = perfil ? `${perfil.nombre} ${perfil.apellido}` : user.email;
        setForm(prev => ({ ...prev, usuario_id: user.id, nombre_trabajador: userName }));
      }
      const { data: proy } = await supabase.from("proyectos").select("*").order("nombre");
      setDbProyectos(proy || []);
    }
    init();
  }, []);

  // Carga entregables basados en el ID del proyecto seleccionado (Nueva BD)
  useEffect(() => {
    async function loadEntregables() {
      if (isManual && form.proyecto_id && !solicitarNuevoProyecto) {
        const { data } = await supabase.from("entregables").select("id, nombre").eq("proyecto_id", form.proyecto_id);
        setDbEntregables(data || []);
      }
    }
    loadEntregables();
  }, [form.proyecto_id, isManual, solicitarNuevoProyecto]);

  // FUNCIÓN PARA CARGAR CÓDIGOS FILTRANDO COMPLETADOS
  const loadCodes = async () => {
    if (!form.usuario_id || isManual) { setAssignedCodes([]); return; }
    
    const { data, error } = await supabase
      .from("tareas_asignadas")
      .select(`
        codigos_tarea (
          id, 
          codigo, 
          descripcion, 
          proyecto, 
          entregable,
          proyecto_id,
          tareas ( estado_id )
        )
      `)
      .eq("usuario_id", form.usuario_id);

    if (error) {
      console.error("Error cargando códigos:", error);
      return;
    }

    if (data) {
      const filtered = data
        .map(item => item.codigos_tarea)
        .filter(c => {
          if (!c) return false;
          // Ajustado al nuevo string 'completada' de la BD
          const isFinished = c.tareas?.some(t => t.estado_id === "completada");
          return !isFinished;
        });
      
      setAssignedCodes(filtered);
    }
  };

  useEffect(() => {
    loadCodes();
  }, [form.usuario_id, isManual]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name === "codigo_id" && !isManual) {
      const selected = assignedCodes.find(c => String(c.id) === String(value));
      setForm(prev => ({
        ...prev,
        codigo_id: value,
        proyecto: selected ? selected.proyecto : "",
        proyecto_id: selected ? selected.proyecto_id : "",
        entregable: selected ? selected.entregable : ""
      }));
    } else if (name === "proyecto" && isManual) {
      // Si selecciona de la lista en modo manual, guardamos el ID y buscamos el nombre
      if (solicitarNuevoProyecto) {
        setForm(prev => ({ ...prev, proyecto: value, proyecto_id: "" }));
      } else {
        const selectedProj = dbProyectos.find(p => p.id === value);
        setForm(prev => ({ 
          ...prev, 
          proyecto_id: value, 
          proyecto: selectedProj ? selectedProj.nombre : "",
          entregable: "" 
        }));
      }
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleReset = () => {
    setForm(prev => ({
      ...initialForm,
      usuario_id: prev.usuario_id,
      nombre_trabajador: prev.nombre_trabajador
    }));
    setIsManual(false);
    setSolicitarNuevoProyecto(false);
    setSolicitarNuevoEntregable(false);
  };

  const toggleManual = () => {
    setIsManual(!isManual);
    setSolicitarNuevoProyecto(false);
    setSolicitarNuevoEntregable(false);
    setForm(prev => ({ ...prev, codigo_id: "", proyecto: "", proyecto_id: "", entregable: "", descripcion_manual: "", codigo_propuesto: "" }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.usuario_id || !form.fecha || (isManual ? !form.descripcion_manual : !form.codigo_id)) return alert("Faltan campos obligatorios.");
    setLoading(true);
    let error;

    if (isManual) {
      const { error: err } = await supabase.from("tareas_propuestas").insert([{
        usuario_id: form.usuario_id, 
        nombre_trabajador: form.nombre_trabajador, 
        fecha: form.fecha, 
        proyecto: form.proyecto,
        entregable: form.entregable, 
        codigo_propuesto: form.codigo_propuesto || "M-SOLICITUD", 
        descripcion_propuesta: form.descripcion_manual,
        horas: form.horas ? Number(form.horas) : 0, 
        estado_revision: "pendiente_admin"
      }]);
      error = err;
    } else {
      // Inserción adaptada a la tabla "tareas" estructural
      const { codigo_propuesto, descripcion_manual, proyecto, entregable, ...payloadNormal } = form;
      const { error: err } = await supabase.from("tareas").insert([{
        proyecto_id: payloadNormal.proyecto_id || null,
        usuario_id: payloadNormal.usuario_id,
        codigo_id: payloadNormal.codigo_id ? Number(payloadNormal.codigo_id) : null,
        fecha: payloadNormal.fecha,
        horas: form.horas ? Number(form.horas) : 0,
        estado_id: payloadNormal.estado_id,       // 'en_progreso' o 'completada'
        revision_id: payloadNormal.revision_id,   // 'pendiente'
      }]);
      error = err;
    }

    setLoading(false);
    if (error) alert("Error: " + error.message);
    else { 
      alert("✅ Registro procesado con éxito."); 
      handleReset();
      loadCodes(); 
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[83vh] px-4 py-10 transition-all duration-500">
      
      <form onSubmit={handleSubmit} className="bg-white shadow-[0_20px_50px_rgba(0,0,0,0.1)] rounded-[2.5rem] p-10 w-full max-w-4xl border-t-[10px] transition-all duration-500" style={{ borderColor: isManual ? alloy.orange : alloy.blue1 }}>
        
        {/* Header Section */}
        <div className="relative flex flex-col md:flex-row items-center justify-between mb-12 gap-6">
          <button type="button" onClick={handleReset} className="flex items-center gap-2 text-[10px] font-black text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest group">
            <span className="text-lg group-hover:rotate-90 transition-transform duration-300">↺</span> Limpiar Formulario
          </button>
          
          <h2 className="text-2xl font-black text-center tracking-tight" style={{ color: isManual ? alloy.orange : alloy.blue2 }}>
            {isManual ? "PROPUESTA DE TAREA" : "REGISTRO DE ACTIVIDADES"}
          </h2>

          <button type="button" onClick={toggleManual} className="text-[9px] font-black px-5 py-2.5 rounded-full shadow-sm transition-all border-2 uppercase tracking-widest active:scale-95" style={{ backgroundColor: isManual ? "#fff1f1" : "#f0fdfa", color: isManual ? alloy.orange : alloy.blue1, borderColor: isManual ? alloy.orange : alloy.blue1 }}>
            {isManual ? "✕ CANCELAR" : "+ NO ESTÁ EN LISTA"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <div className="md:col-span-2 space-y-6">
            
            {/* TRABAJADOR Y FECHA */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="font-black text-[10px] uppercase text-gray-300 ml-1">Colaborador</label>
                <div className="mt-1.5 p-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold text-gray-500 flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]"></div>
                  {form.nombre_trabajador}
                </div>
              </div>
              <div>
                <label className="font-black text-[10px] uppercase text-gray-300 ml-1">Fecha de Ejecución</label>
                <div className="flex gap-2 mt-1.5">
                  <input type="date" name="fecha" value={form.fecha} onChange={handleChange} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all" />
                  <button type="button" onClick={() => setForm(p => ({...p, fecha: new Date().toISOString().split("T")[0]}))} className="px-4 py-3 text-white font-black rounded-2xl text-[10px] shadow-md transition-transform active:scale-90" style={{ backgroundColor: isManual ? alloy.orange : alloy.blue1 }}>HOY</button>
                </div>
              </div>
            </div>

            {/* SECCIÓN VINCULACIÓN */}
            <div className="bg-gray-50/50 p-6 rounded-[2rem] space-y-5 border border-gray-100 relative overflow-hidden">
               <div className="flex justify-between items-center relative z-10">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Información de Proyecto</span>
                  {isManual && (
                    <button type="button" onClick={() => { setSolicitarNuevoProyecto(!solicitarNuevoProyecto); setForm(p => ({...p, proyecto: "", proyecto_id: ""})); }} className="text-[9px] font-black text-orange-500 underline uppercase hover:text-orange-700">
                      {solicitarNuevoProyecto ? "Volver a la lista" : "¿Proyecto nuevo?"}
                    </button>
                  )}
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                  <div className="flex flex-col">
                    <label className="text-[9px] font-black text-gray-400 mb-1.5 ml-1">PROYECTO</label>
                    {isManual ? (
                      solicitarNuevoProyecto ? (
                        <input name="proyecto" placeholder="Nombre del proyecto..." value={form.proyecto} onChange={handleChange} className="p-3 border border-orange-200 rounded-xl text-sm bg-white font-bold outline-none focus:ring-4 focus:ring-orange-50" />
                      ) : (
                        <select name="proyecto" value={form.proyecto_id} onChange={handleChange} className="p-3 border border-gray-200 rounded-xl text-sm bg-white font-bold outline-none cursor-pointer">
                          <option value="">Seleccionar Proyecto...</option>
                          {dbProyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                      )
                    ) : (
                      <div className="p-3.5 bg-white border border-blue-100 rounded-xl text-sm font-black text-blue-900 shadow-sm min-h-[48px] flex items-center">
                        {form.proyecto || <span className="text-gray-300 font-normal italic">Pendiente de tarea...</span>}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[9px] font-black text-gray-400 mb-1.5 ml-1">ENTREGABLE / HITO</label>
                    {isManual ? (
                      (solicitarNuevoEntregable || solicitarNuevoProyecto) ? (
                        <input name="entregable" placeholder="Nombre del entregable..." value={form.entregable} onChange={handleChange} className="p-3 border border-orange-200 rounded-xl text-sm bg-white font-bold outline-none focus:ring-4 focus:ring-orange-50" />
                      ) : (
                        <div className="relative">
                          <select name="entregable" value={form.entregable} onChange={handleChange} disabled={!form.proyecto_id} className="w-full p-3 border border-gray-200 rounded-xl text-sm bg-white font-bold disabled:opacity-50 cursor-pointer outline-none">
                            <option value="">Seleccionar Hito...</option>
                            {dbEntregables.map((e, idx) => <option key={idx} value={e.nombre}>{e.nombre}</option>)}
                          </select>
                          {form.proyecto_id && !solicitarNuevoEntregable && (
                            <button type="button" onClick={() => setSolicitarNuevoEntregable(true)} className="absolute -bottom-5 right-1 text-[8px] font-black text-orange-400 hover:text-orange-600">+ SOLICITAR OTRO</button>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="p-3.5 bg-white border border-blue-100 rounded-xl text-sm font-black text-blue-900 shadow-sm min-h-[48px] flex items-center">
                        {form.entregable || <span className="text-gray-300 font-normal italic">Pendiente de tarea...</span>}
                      </div>
                    )}
                  </div>
               </div>
            </div>

            {/* HORAS Y ESTADO */}
            <div className="grid grid-cols-2 gap-8">
              <div>
                <label className="font-black text-[10px] uppercase text-gray-300 ml-1">Horas Dedicadas</label>
                <input type="number" name="horas" step="0.5" placeholder="0.0" value={form.horas} onChange={handleChange} className="w-full mt-1.5 p-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-black text-center outline-none focus:border-green-400 focus:ring-4 focus:ring-green-50 transition-all" />
              </div>
              <div>
                <label className="font-black text-[10px] uppercase text-gray-300 ml-1">Estado de Avance</label>
                <select name="estado_id" value={form.estado_id} onChange={handleChange} className="w-full mt-1.5 p-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none cursor-pointer">
                  <option value="en_progreso">En progreso</option>
                  <option value="completada">Completada</option>
                </select>
              </div>
            </div>

            <div className="flex justify-center pt-8">
              <button type="submit" disabled={loading} className="w-full md:w-auto px-20 py-4 rounded-[1.5rem] text-white font-black shadow-2xl transition-all active:scale-[0.97] hover:brightness-110 text-sm tracking-[0.2em]" style={{ backgroundColor: isManual ? alloy.orange : alloy.green }}>
                {loading ? "PROCESANDO..." : "REGISTRAR ACTIVIDAD"}
              </button>
            </div>
          </div>

          {/* Columna Derecha */}
          <div className="md:border-l md:pl-10 border-gray-100 space-y-6">
            {!isManual ? (
              <div className="h-full flex flex-col">
                <label className="font-black text-[10px] uppercase text-blue-400 mb-2 tracking-widest">Tarea Asignada</label>
                <select name="codigo_id" value={form.codigo_id} onChange={handleChange} className="w-full p-4 border-2 border-blue-100 rounded-2xl text-sm font-black text-blue-800 shadow-sm outline-none focus:ring-4 focus:ring-blue-50 transition-all cursor-pointer">
                  <option value="">CÓDIGO DE TAREA</option>
                  {assignedCodes.map((c) => <option key={c.id} value={c.id}>{c.codigo}</option>)}
                </select>
                <div className="mt-6 flex-1 p-6 bg-blue-50/30 rounded-[2rem] text-[11px] border border-blue-100/50 italic text-blue-800/60 leading-relaxed shadow-inner">
                  <span className="font-black block mb-3 not-italic text-blue-400 text-[9px] tracking-[0.2em] uppercase">Alcance del Administrador</span>
                  {assignedCodes.find(c => String(c.id) === String(form.codigo_id))?.descripcion || "Selecciona una tarea de la lista superior para visualizar los requerimientos específicos de tu asignación."}
                </div>
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500 h-full flex flex-col">
                <label className="font-black text-[10px] uppercase text-orange-400 mb-2 tracking-widest">Nueva Tarea</label>
                <input name="codigo_propuesto" value={form.codigo_propuesto} onChange={handleChange} className="w-full p-4 bg-orange-50 border border-orange-100 rounded-2xl text-sm font-black text-orange-900 outline-none" placeholder="Nombre o código..." />
                
                <label className="font-black text-[10px] uppercase text-orange-400 mt-6 mb-2 tracking-widest">Descripción</label>
                <textarea name="descripcion_manual" value={form.descripcion_manual} onChange={handleChange} className="w-full p-5 bg-white border border-orange-100 rounded-[2rem] text-xs flex-1 outline-none shadow-inner focus:ring-4 focus:ring-orange-50 transition-all font-medium" placeholder="Describe detalladamente la actividad realizada..." />
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}