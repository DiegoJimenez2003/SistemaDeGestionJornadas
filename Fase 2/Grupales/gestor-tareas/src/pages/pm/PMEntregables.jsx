import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function PMEntregables() {
  const navigate = useNavigate();
  const alloy = {
    purple: "#6c5ce7",
    blue: "#37788a",
    green: "#6ec5ac",
  };

  const [proyectos, setProyectos] = useState([]);
  const [entregables, setEntregables] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtros y Formulario
  const [filtroProyecto, setFiltroProyecto] = useState("todos");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [proyectoSel, setProyectoSel] = useState("");
  const [tipo, setTipo] = useState("entregable");
  const [horasPresupuestadas, setHorasPresupuestadas] = useState(""); 
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: asignaciones } = await supabase
        .from("proyecto_encargados")
        .select("proyecto_id")
        .eq("user_id", user.id);

      const idsAsignados = asignaciones?.map(a => a.proyecto_id) || [];

      if (idsAsignados.length > 0) {
        const { data: p } = await supabase
          .from("proyectos")
          .select("*")
          .in("id", idsAsignados)
          .order("nombre");

        const nombresProyectos = p.map(proy => proy.nombre);
        const { data: e } = await supabase
          .from("entregables")
          .select("*")
          .in("proyecto_nombre", nombresProyectos)
          .order("created_at", { ascending: false });

        setProyectos(p || []);
        setEntregables(e || []);
      }
    } catch (error) {
      console.error("Error al sincronizar:", error);
    } finally {
      setLoading(false);
    }
  }

  const entregablesFiltrados = filtroProyecto === "todos" 
    ? entregables 
    : entregables.filter(item => item.proyecto_nombre === filtroProyecto);

  async function crearItem(e) {
    e.preventDefault();
    if (!nuevoNombre || !proyectoSel) {
      setMsg("⚠ Completa el nombre y selecciona un proyecto.");
      return;
    }

    const { error } = await supabase.from("entregables").insert([
      {
        nombre: nuevoNombre,
        proyecto_nombre: proyectoSel,
        tipo: tipo,
        horas_presupuestadas: Number(horasPresupuestadas) || 0,
        progreso_manual: 0 // Inicia en 0
      },
    ]);

    if (error) {
      setMsg("❌ Error: " + error.message);
    } else {
      setMsg(`✅ Registrado correctamente.`);
      setNuevoNombre("");
      setHorasPresupuestadas(""); 
      fetchData();
      setTimeout(() => setMsg(""), 3000);
    }
  }

  // --- NUEVA FUNCIÓN DE ACTUALIZACIÓN ---
  async function actualizarProgreso(id, nuevoValor) {
    const valor = Math.min(100, Math.max(0, Number(nuevoValor)));
    const { error } = await supabase
      .from("entregables")
      .update({ progreso_manual: valor })
      .eq("id", id);
    
    if (!error) {
      // Actualización optimista en el estado local
      setEntregables(entregables.map(ent => 
        ent.id === id ? { ...ent, progreso_manual: valor } : ent
      ));
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center font-black text-slate-400 animate-pulse uppercase italic tracking-widest">
        Sincronizando Alcances PM...
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* CABECERA */}
        <div className="relative flex items-center justify-center mb-8">
          <button 
            onClick={() => navigate("/PMPanel")} 
            className="absolute left-0 text-gray-400 hover:text-slate-900 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors"
          > ← Volver </button>
          <div className="text-center">
            <h1 className="text-3xl font-black uppercase italic tracking-tighter" style={{ color: alloy.purple }}>
              Mis Entregables <span className="text-slate-300">/</span> Alcances
            </h1>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em]">Gestión de HH y Progreso Real</p>
          </div>
        </div>

        {msg && (
          <div className="p-4 rounded-2xl bg-slate-900 text-white shadow-xl text-center font-black uppercase italic text-[10px] tracking-widest animate-bounce">
            {msg}
          </div>
        )}

        {/* FORMULARIO */}
        <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-slate-100">
          <div className="p-8 md:p-10">
            <form onSubmit={crearItem} className="grid grid-cols-1 md:grid-cols-5 gap-6 items-end">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Proyecto</label>
                <select 
                  className="w-full p-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-xs font-bold outline-none focus:border-purple-400 transition-all cursor-pointer"
                  value={proyectoSel}
                  onChange={(e) => setProyectoSel(e.target.value)}
                >
                  <option value="">Seleccionar...</option>
                  {proyectos.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Nombre Ítem</label>
                <input 
                  type="text"
                  placeholder="Ej: Memoria de Cálculo"
                  className="w-full p-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-xs font-bold outline-none focus:border-purple-400 transition-all"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Presupuesto HH</label>
                <input 
                  type="number"
                  placeholder="Horas"
                  className="w-full p-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-xs font-bold outline-none focus:border-purple-400 transition-all"
                  value={horasPresupuestadas}
                  onChange={(e) => setHorasPresupuestadas(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Clasificación</label>
                <div className="flex bg-slate-100 p-1 rounded-2xl">
                  <button 
                    type="button"
                    onClick={() => setTipo("entregable")}
                    className={`flex-1 py-3 text-[9px] font-black rounded-xl transition-all ${tipo === 'entregable' ? 'bg-white shadow-sm text-purple-600' : 'text-slate-400'}`}
                  >ENTREGABLE</button>
                  <button 
                    type="button"
                    onClick={() => setTipo("actividad")}
                    className={`flex-1 py-3 text-[9px] font-black rounded-xl transition-all ${tipo === 'actividad' ? 'bg-white shadow-sm text-purple-600' : 'text-slate-400'}`}
                  >ACT.</button>
                </div>
              </div>

              <button 
                type="submit"
                className="w-full p-4 text-white font-black text-[10px] uppercase italic rounded-2xl shadow-lg transition-all hover:scale-105 active:scale-95"
                style={{ backgroundColor: alloy.purple }}
              >
                Crear Alcance
              </button>
            </form>
          </div>
        </div>

        {/* FILTRO Y TABLA */}
        <div className="flex flex-col md:flex-row justify-between items-center px-4 gap-4">
           <div>
              <h2 className="text-lg font-black uppercase italic text-slate-800 tracking-tighter">Listado de Alcances</h2>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Mostrando {entregablesFiltrados.length} items</p>
           </div>
           <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-3xl shadow-sm border border-slate-100">
              <span className="text-[9px] font-black text-slate-400 uppercase">Filtrar Proyecto:</span>
              <select 
                className="text-[10px] font-black uppercase text-purple-600 outline-none bg-transparent cursor-pointer"
                value={filtroProyecto}
                onChange={(e) => setFiltroProyecto(e.target.value)}
              >
                <option value="todos">VER TODOS</option>
                {proyectos.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
              </select>
           </div>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="px-8 py-5">Tipo</th>
                  <th className="px-8 py-5">Nombre / Proyecto</th>
                  <th className="px-8 py-5 text-center">HH Presup.</th>
                  <th className="px-8 py-5 text-right w-64">Progreso Manual (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {entregablesFiltrados.map((item) => {
                  const completado = item.progreso_manual >= 100;
                  return (
                    <tr key={item.id} className={`hover:bg-slate-50/50 transition-colors group ${completado ? 'opacity-60 bg-emerald-50/20' : ''}`}>
                      <td className="px-8 py-5">
                        <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${item.tipo === 'entregable' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {item.tipo}
                        </span>
                      </td>
                      <td className="px-8 py-5">
                        <p className={`text-sm font-black uppercase italic tracking-tighter ${completado ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                          {item.nombre}
                        </p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">{item.proyecto_nombre}</p>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className="bg-slate-100 px-4 py-2 rounded-xl text-xs font-black text-slate-800 italic">
                          {item.horas_presupuestadas || 0} HH
                        </span>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center justify-end gap-4">
                          {completado && <span className="text-emerald-500 font-black text-[10px]">LISTO ✓</span>}
                          <div className="relative w-32 h-8 bg-slate-100 rounded-lg overflow-hidden flex items-center">
                            <input 
                              type="number"
                              min="0"
                              max="100"
                              value={item.progreso_manual}
                              onChange={(e) => actualizarProgreso(item.id, e.target.value)}
                              className="w-full h-full bg-transparent text-center text-xs font-black text-slate-800 outline-none z-10"
                            />
                            <div 
                              className="absolute left-0 top-0 h-full transition-all duration-500"
                              style={{ 
                                width: `${item.progreso_manual}%`, 
                                backgroundColor: completado ? alloy.green : alloy.purple,
                                opacity: 0.2
                              }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}