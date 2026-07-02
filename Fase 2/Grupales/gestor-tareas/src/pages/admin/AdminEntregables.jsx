import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function AdminEntregables() {
  const navigate = useNavigate();
  const alloy = {
    blue: "#37788a",
    purple: "#6c5ce7",
    green: "#6ec5ac",
    dark: "#4b4b54",
  };

  const [proyectos, setProyectos] = useState([]);
  const [entregables, setEntregables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actualizandoId, setActualizandoId] = useState(null); 
  
  const [filtroProyecto, setFiltroProyecto] = useState("todos");

  // Estados del Formulario
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoCodigo, setNuevoCodigo] = useState(""); // NUEVO ESTADO
  const [proyectoSel, setProyectoSel] = useState("");
  const [tipo, setTipo] = useState("entregable");
  const [horasPresupuestadas, setHorasPresupuestadas] = useState(""); 
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const { data: p } = await supabase.from("proyectos").select("*").order("nombre");
    const { data: e } = await supabase.from("entregables").select("*").order("created_at", { ascending: false });
    const { data: t } = await supabase.from("tareas").select("entregable, proyecto, horas");

    const entregablesConHoras = (e || []).map(ent => {
      const horasReales = (t || [])
        .filter(tarea => tarea.entregable === ent.nombre && tarea.proyecto === ent.proyecto_nombre)
        .reduce((acc, curr) => acc + Number(curr.horas || 0), 0);
      
      return { ...ent, horas_reales: horasReales };
    });

    setProyectos(p || []);
    setEntregables(entregablesConHoras);
    setLoading(false); 
  }

  async function actualizarProgreso(id, valor) {
    const num = Math.min(100, Math.max(0, Number(valor)));
    setActualizandoId(id);
    
    const { error } = await supabase
      .from("entregables")
      .update({ progreso_manual: num })
      .eq("id", id);

    if (error) {
      setMsg("❌ Error al actualizar: " + error.message);
    } else {
      setEntregables(prev => prev.map(item => 
        item.id === id ? { ...item, progreso_manual: num } : item
      ));
    }
    setActualizandoId(null);
  }

  const entregablesFiltrados = filtroProyecto === "todos" 
    ? entregables 
    : entregables.filter(item => item.proyecto_nombre === filtroProyecto);

  async function crearItem(e) {
    e.preventDefault();
    if (!nuevoNombre || !proyectoSel || !nuevoCodigo) {
      setMsg("⚠ Debes completar código, nombre y seleccionar un proyecto.");
      return;
    }

    // 🔍 ENCONTRAR EL PROYECTO REAL PARA OBTENER SU ID
    const proyectoEncontrado = proyectos.find(p => p.nombre === proyectoSel);
    
    if (!proyectoEncontrado) {
      setMsg("❌ Error: El proyecto seleccionado no es válido.");
      return;
    }

    const { error } = await supabase.from("entregables").insert([
      {
        nombre: nuevoNombre,
        codigo: nuevoCodigo, // NUEVO CAMPO
        proyecto_id: proyectoEncontrado.id, // 👈 ENVIAMOS EL ID EXIGIDO POR LA BD V2
        proyecto_nombre: proyectoSel,       // 👈 MANTENEMOS EL TEXTO POR COMPATIBILIDAD CON TU FRONTEND
        tipo: tipo,
        horas_presupuestadas: Number(horasPresupuestadas) || 0,
        progreso_manual: 0 
      },
    ]);

    if (error) {
      setMsg("❌ Error al guardar: " + error.message);
    } else {
      setMsg(`✅ ${tipo === 'entregable' ? 'Entregable' : 'Actividad'} creado correctamente.`);
      setNuevoNombre("");
      setNuevoCodigo(""); // RESET
      setHorasPresupuestadas(""); 
      fetchData();
    }
  }

  async function eliminarItem(id) {
    if (!confirm("¿Seguro que deseas eliminar este ítem?")) return;
    const { error } = await supabase.from("entregables").delete().eq("id", id);
    if (!error) fetchData();
  }

  if (loading) return <div className="p-10 text-center font-bold text-gray-400 animate-pulse uppercase tracking-widest">Cargando gestión de alcance...</div>;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* CABECERA */}
        <div className="relative flex items-center justify-center mb-8">
          <button 
            onClick={() => navigate("/admin")} 
            className="absolute left-0 text-gray-400 hover:text-gray-600 flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
          > ← Volver </button>
          <h1 className="text-3xl font-extrabold text-center uppercase italic tracking-tighter" style={{ color: alloy.purple }}>
            Gestión de Entregables <span className="text-gray-300">/</span> Alcance
          </h1>
        </div>

        {msg && (
          <div className="p-4 rounded-xl bg-white shadow-sm border-l-4 border-purple-500 text-purple-700 animate-bounce">
            {msg}
          </div>
        )}

        {/* FORMULARIO - Ajustado para incluir Código */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
          <div className="p-8">
            <h2 className="text-sm font-black mb-6 text-gray-400 uppercase tracking-widest">Definir Alcance y HH Presupuestadas</h2>
            <form onSubmit={crearItem} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
              <div className="md:col-span-1">
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Proyecto</label>
                <select 
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-purple-400 transition cursor-pointer font-bold"
                  value={proyectoSel}
                  onChange={(e) => setProyectoSel(e.target.value)}
                >
                  <option value="">Selecciona Proyecto</option>
                  {proyectos.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                </select>
              </div>
              {/* NUEVO INPUT CODIGO */}
              <div className="md:col-span-1">
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Código</label>
                <input 
                  type="text"
                  placeholder="Ej: ENT-001"
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-purple-400 transition font-bold"
                  value={nuevoCodigo}
                  onChange={(e) => setNuevoCodigo(e.target.value)}
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Nombre Item</label>
                <input 
                  type="text"
                  placeholder="Ej: Plano Rev0"
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-purple-400 transition font-bold"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Límite HH</label>
                <input 
                  type="number"
                  placeholder="Ej: 40"
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-purple-400 transition font-bold"
                  value={horasPresupuestadas}
                  onChange={(e) => setHorasPresupuestadas(e.target.value)}
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Clasificación</label>
                <div className="flex bg-gray-100 p-1 rounded-xl">
                  <button 
                    type="button"
                    onClick={() => setTipo("entregable")}
                    className={`flex-1 py-2 text-[10px] font-black rounded-lg transition ${tipo === 'entregable' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-500'}`}
                  >ENTREGABLE</button>
                  <button 
                    type="button"
                    onClick={() => setTipo("actividad")}
                    className={`flex-1 py-2 text-[10px] font-black rounded-lg transition ${tipo === 'actividad' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-500'}`}
                  >HITO</button>
                </div>
              </div>
              <button 
                type="submit"
                className="w-full p-3 text-white font-black text-xs uppercase italic rounded-xl shadow-lg transition hover:scale-105 active:scale-95"
                style={{ backgroundColor: alloy.purple }}
              > Registrar </button>
            </form>
          </div>
        </div>

        {/* LISTADO ACTUALIZADO con Columna Código */}
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  <th className="px-6 py-4">Código</th>
                  <th className="px-6 py-4">Status / Nombre</th>
                  <th className="px-6 py-4">Proyecto</th>
                  <th className="px-6 py-4">Ppto HH</th>
                  <th className="px-6 py-4">Real HH</th>
                  <th className="px-6 py-4">Avance (%)</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entregablesFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-10 text-center text-xs font-bold text-gray-300 uppercase tracking-widest italic">No se encontraron registros</td>
                  </tr>
                ) : (
                  entregablesFiltrados.map((item) => {
                    const excedido = item.horas_reales > item.horas_presupuestadas;
                    const completado = item.progreso_manual >= 100;
                    
                    return (
                      <tr key={item.id} className={`transition group ${completado ? 'bg-slate-50' : 'hover:bg-gray-50'}`}>
                        <td className="px-6 py-4">
                          <span className="text-[11px] font-mono font-black text-gray-500 bg-gray-100 px-2 py-1 rounded">
                            {item.codigo}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${item.tipo === 'entregable' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                              {completado ? '🔒 CERRADO' : item.tipo}
                            </span>
                            <span className={`text-sm font-black uppercase italic tracking-tighter ${completado ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                              {item.nombre}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase">{item.proyecto_nombre}</td>
                        <td className="px-6 py-4 text-sm font-mono font-bold text-gray-400">
                          {item.horas_presupuestadas || 0} HH
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-sm font-mono font-black ${excedido ? 'text-red-500 animate-pulse' : 'text-emerald-500'}`}>
                            {item.horas_reales.toFixed(1)} HH
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <input 
                              type="number"
                              min="0"
                              max="100"
                              disabled={actualizandoId === item.id}
                              defaultValue={item.progreso_manual || 0}
                              onBlur={(e) => actualizarProgreso(item.id, e.target.value)}
                              className={`w-16 p-1.5 text-center text-xs font-black rounded-lg border-2 outline-none transition
                                ${completado ? 'border-emerald-400 bg-emerald-50 text-emerald-600' : 'border-gray-100 focus:border-purple-400 text-gray-700'}`}
                            />
                            <span className={`text-[10px] font-black ${completado ? 'text-emerald-500' : 'text-gray-300'}`}>%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => eliminarItem(item.id)}
                            className="text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <svg className="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}