import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function ControlTareas() {
  const [tareas, setTareas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingTarea, setEditingTarea] = useState(null);

  const fetchTareas = async () => {
    setLoading(true);
    try {
      // Consulta optimizada según tus llaves foráneas reales de la BD
      const { data, error } = await supabase
        .from("tareas")
        .select(`
          *,
          perfiles:usuario_id (
            user_id,
            nombre,
            apellido
          ),
          codigos_tarea:codigo_id (
            id,
            codigo,
            descripcion,
            entregable,
            proyectos:proyecto_id (
              id,
              nombre,
              clientes:cliente_id (
                id,
                nombre
              )
            )
          )
        `)
        .order("id", { ascending: false });

      if (error) throw error;
      
      console.log("Datos recibidos de Supabase en Panel Admin:", data?.[0]); 
      setTareas(data || []);
    } catch (error) {
      console.error("Error en fetchTareas:", error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTareas();
  }, []);

  const handleDelete = async (id) => {
    const seguro = window.confirm("¿Estás seguro de eliminar esta tarea permanentemente?");
    if (seguro) {
      try {
        const { error } = await supabase.from("tareas").delete().eq("id", id);
        if (error) throw error;
        fetchTareas();
      } catch (error) {
        alert("No se pudo eliminar: " + error.message);
      }
    }
  };

  const handleUpdate = async () => {
    const seguro = window.confirm("¿Confirmas que deseas guardar los cambios en esta tarea?");
    if (seguro) {
      try {
        // 1. ACTUALIZAR EL CÓDIGO SI SE MODIFICÓ
        if (editingTarea.codigos_tarea?.id) {
            const { error: errorCod } = await supabase
              .from("codigos_tarea")
              .update({ codigo: editingTarea.codigos_tarea.codigo })
              .eq("id", editingTarea.codigos_tarea.id);
            
            if (errorCod) throw errorCod;
        }

        // 2. PAYLOAD LIMPIO: Campos estrictos de la tabla 'tareas' (Cambiado a 'estado_id')
        const payload = {
          proyecto: editingTarea.proyecto || null,
          entregable: editingTarea.entregable || null,
          descripcion: editingTarea.descripcion || null,
          codigo_id: editingTarea.codigo_id,
          horas: parseFloat(editingTarea.horas) || 0,
          estado_id: editingTarea.estado_id, // <-- CORREGIDO: Campo real de la BD
          revision: editingTarea.revision || "pendiente",
          importancia: editingTarea.importancia || "Media",
          urgencia: editingTarea.urgencia || "Baja",
          dificultad: editingTarea.dificultad || "Media",
          prioritaria: editingTarea.prioritaria || false,
          fecha_vencimiento: editingTarea.fecha_vencimiento || null
        };

        const { error } = await supabase
          .from("tareas")
          .update(payload)
          .eq("id", editingTarea.id);

        if (error) throw error;
        setEditingTarea(null);
        fetchTareas();
      } catch (error) {
        alert("Error al actualizar: " + error.message);
      }
    }
  };

  const filteredTareas = tareas.filter(t => {
    const search = searchTerm.toLowerCase();
    
    // Extracción segura según tu árbol de relaciones real de BD
    const cliente = t.codigos_tarea?.proyectos?.clientes?.nombre || "";
    const proyecto = t.codigos_tarea?.proyectos?.nombre || t.proyecto || "";
    const trabajador = t.perfiles ? `${t.perfiles.nombre || ''} ${t.perfiles.apellido || ''}` : (t.nombre_trabajador || "");
    const codigo = t.codigos_tarea?.codigo || "";

    return (
      trabajador.toLowerCase().includes(search) ||
      proyecto.toLowerCase().includes(search) ||
      cliente.toLowerCase().includes(search) ||
      codigo.toLowerCase().includes(search)
    );
  });

  // Helper para mostrar visualmente los badges de forma prolija
  const esCompletada = (estadoId) => {
    return ["completada", "completado", "finalizada", "finalizado", "terminada", "terminado"].includes(String(estadoId || "").toLowerCase().trim());
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-[1600px] mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-6 bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-white">
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-slate-800 flex items-center gap-3">
              <span className="w-3 h-10 bg-indigo-600 rounded-full"></span>
              CENTRAL DE OPERACIONES
            </h1>
            <p className="text-slate-400 font-medium ml-6">Auditoría técnica de tiempos y entregables</p>
          </div>
          <div className="relative w-full md:w-1/3">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">🔍</span>
            <input 
              type="text" 
              placeholder="Buscar por cliente, código, nombre..." 
              className="w-full pl-12 pr-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50 focus:bg-white focus:border-indigo-500 outline-none transition-all shadow-inner text-sm font-medium"
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead>
                <tr className="bg-slate-50/50 text-slate-400 text-[11px] font-bold uppercase tracking-[0.2em]">
                  <th className="p-6 border-b border-slate-100">Colaborador</th>
                  <th className="p-6 border-b border-slate-100">Proyecto & Cliente</th>
                  <th className="p-6 border-b border-slate-100 w-[25%]">Tarea y Detalle Técnico</th>
                  <th className="p-6 border-b border-slate-100 text-center">Adjunto</th>
                  <th className="p-6 border-b border-slate-100 text-center">Estado Real</th>
                  <th className="p-6 border-b border-slate-100 text-center">Revisión (Backlog)</th>
                  <th className="p-6 border-b border-slate-100 text-center">Inversión Hs</th>
                  <th className="p-6 border-b border-slate-100 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredTareas.map((t) => {
                  const nombreCompleto = t.perfiles ? `${t.perfiles.nombre || ''} ${t.perfiles.apellido || ''}` : (t.nombre_trabajador || "Sin asignar");
                  const completada = esCompletada(t.estado_id);
                  
                  return (
                    <tr key={t.id} className="hover:bg-indigo-50/20 transition-all group">
                      
                      <td className="p-6">
                        <div className="flex items-center gap-4">
                          <div className="w-11 h-11 rounded-2xl bg-slate-800 text-white flex items-center justify-center font-bold text-sm shadow-lg transform group-hover:rotate-6 transition-transform">
                            {(nombreCompleto[0] || '?').toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 text-sm">
                              {nombreCompleto}
                            </div>
                            <div className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider mt-0.5">
                              {t.fecha || "Sin fecha"}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="p-6">
                        <div className="text-sm font-bold text-slate-700 mb-1">
                          {t.codigos_tarea?.proyectos?.nombre || t.proyecto || "Proyecto General"}
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          Cli: {t.codigos_tarea?.proyectos?.clientes?.nombre || "N/A"}
                        </div>
                      </td>

                      <td className="p-6">
                        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 group-hover:bg-white group-hover:border-indigo-100 transition-all">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="bg-indigo-600 text-white text-[10px] px-3 py-1 rounded-lg font-mono font-bold shadow-md shadow-indigo-200">
                              {t.codigos_tarea?.codigo || "S/C"}
                            </span>
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                              {t.codigos_tarea?.entregable || t.entregable || "LOG"}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed font-medium italic">
                            "{t.descripcion || t.codigos_tarea?.descripcion || "No hay detalles técnicos registrados."}"
                          </p>
                        </div>
                      </td>

                      <td className="p-6 text-center">
                        {t.evidencia_url ? (
                          <a 
                            href={t.evidencia_url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="inline-flex items-center justify-center w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                            title="Ver evidencia"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                          </a>
                        ) : (
                          <span className="text-slate-300 italic text-[10px] font-bold uppercase tracking-widest">Sin archivo</span>
                        )}
                      </td>

                      <td className="p-6 text-center">
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${
                          completada ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-blue-100 text-blue-700 border-blue-200'
                        }`}>
                          {completada ? 'Completada' : 'En Progreso'}
                        </span>
                      </td>

                      <td className="p-6 text-center">
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${
                          t.revision === 'aprobada' ? 'bg-emerald-600 text-white border-emerald-700' :
                          t.revision === 'rechazada' ? 'bg-red-100 text-red-700 border-red-200' :
                          'bg-amber-100 text-amber-700 border-amber-200'
                        }`}>
                          {t.revision || 'pendiente'}
                        </span>
                      </td>

                      <td className="p-6 text-center">
                        <div className="inline-block bg-white border-2 border-slate-100 rounded-2xl px-4 py-2 shadow-sm group-hover:border-indigo-200 transition-all">
                          <span className="text-2xl font-black text-slate-800 tracking-tighter">{t.horas || 0}</span>
                          <span className="text-[9px] text-slate-400 font-bold block -mt-1 uppercase">Horas</span>
                        </div>
                      </td>

                      <td className="p-6 text-right">
                        <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => setEditingTarea(t)}
                            className="p-3 bg-white border border-slate-100 text-slate-400 hover:text-indigo-600 hover:shadow-xl rounded-xl transition-all hover:-translate-y-1"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                          </button>
                          <button 
                            onClick={() => handleDelete(t.id)}
                            className="p-3 bg-white border border-slate-100 text-slate-400 hover:text-red-500 hover:shadow-xl rounded-xl transition-all hover:-translate-y-1"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL DE EDICIÓN */}
      {editingTarea && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[2.5rem] p-10 max-w-xl w-full shadow-2xl border border-white">
            <h2 className="text-2xl font-black text-slate-800 tracking-tighter uppercase mb-8 border-b border-slate-50 pb-6 text-center">Auditar Tarea</h2>
            <div className="space-y-6">
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="text-[10px] font-black text-indigo-600 uppercase mb-2 block tracking-widest">Código Tarea</label>
                   <input 
                    type="text"
                    className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-5 py-4 outline-none focus:border-indigo-500 transition-all font-mono font-bold text-slate-700 shadow-inner"
                    value={editingTarea.codigos_tarea?.codigo || ''}
                    onChange={e => setEditingTarea({
                        ...editingTarea,
                        codigos_tarea: { ...editingTarea.codigos_tarea, codigo: e.target.value }
                    })}
                   />
                </div>

                <div>
                  <label className="text-[10px] font-black text-indigo-600 uppercase mb-2 block tracking-widest">Estado Real</label>
                  <select 
                    className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-5 py-4 outline-none focus:border-indigo-500 transition-all font-bold text-slate-700 shadow-inner"
                    value={editingTarea.estado_id || 'en_progreso'}
                    onChange={e => setEditingTarea({...editingTarea, estado_id: e.target.value})}
                  >
                    {/* Guardamos strings técnicos legibles en minúsculas */}
                    <option value="en_progreso">En Progreso</option>
                    <option value="completada">Completada</option>
                  </select>
                </div>
              </div>

              {/* REVISIÓN DE LA JORNADA */}
              <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100">
                <label className="text-[10px] font-black text-indigo-700 uppercase mb-2 block tracking-widest">Revisión de Tarea (Cierre de Backlog)</label>
                <select 
                  className="w-full bg-white border-2 border-indigo-200 rounded-2xl px-5 py-4 outline-none focus:border-indigo-500 transition-all font-bold text-slate-800 shadow-sm"
                  value={editingTarea.revision || 'pendiente'}
                  onChange={e => setEditingTarea({...editingTarea, revision: e.target.value})}
                >
                  <option value="pendiente">Pendiente (Mantiene en Backlog)</option>
                  <option value="aprobada">Aprobada (Desaparece del Backlog)</option>
                  <option value="rechazada">Rechazada (Mantiene en Backlog)</option>
                </select>
              </div>

              <div>
                  <label className="text-[10px] font-black text-indigo-600 uppercase mb-2 block tracking-widest">Descripción / Reporte Técnico</label>
                  <textarea 
                    rows="3"
                    className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-5 py-4 outline-none focus:border-indigo-500 transition-all font-medium text-slate-700 shadow-inner italic"
                    value={editingTarea.descripcion || ''}
                    onChange={e => setEditingTarea({...editingTarea, descripcion: e.target.value})}
                  />
              </div>

              <div className="pt-4 flex gap-4">
                <button 
                  onClick={() => setEditingTarea(null)} 
                  className="flex-1 font-bold text-slate-400 hover:text-slate-600 transition-colors"
                >
                  DESCARTAR
                </button>
                <button 
                  onClick={handleUpdate}
                  className="flex-1 bg-indigo-600 text-white py-5 rounded-2xl font-bold shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all"
                >
                  GUARDAR CAMBIOS
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}