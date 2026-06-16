import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Calendar, Clock, Send, FileText, ChevronRight } from "lucide-react"; // Importamos algunos iconos

const estadoStyles = {
  pendiente: "bg-amber-100 text-amber-700",
  aprobada: "bg-emerald-100 text-emerald-700",
  rechazada: "bg-rose-100 text-rose-700",
};

export default function Solicitudes() {
  const [user, setUser] = useState(null);
  const [saldo, setSaldo] = useState(0);
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    tipo: "vacaciones",
    subtipo: "",
    fecha_inicio: "",
    fecha_fin: "",
    motivo: "",
    dias: 0,
  });

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUser(user);
      await Promise.all([fetchSaldo(user.id), fetchSolicitudes(user.id)]);
      setLoading(false);
    }
    init();
  }, []);

  async function fetchSaldo(uid) {
    const { data, error } = await supabase.from("perfiles").select("vacaciones_disponibles").eq("id", uid).single();
    if (!error && data) setSaldo(data.vacaciones_disponibles ? Number(data.vacaciones_disponibles) : 0);
  }

  async function fetchSolicitudes(uid) {
    const { data } = await supabase.from("permisos_vacaciones").select("*").eq("usuario_id", uid).order("created_at", { ascending: false });
    setSolicitudes(data || []);
  }

  function calcularDias(inicio, fin) {
    if (!inicio || !fin) return 0;
    const start = new Date(inicio);
    const end = new Date(fin);
    const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1;
    return diff > 0 ? Math.floor(diff) : 0;
  }

  function handleChange(e) {
    const { name, value } = e.target;
    const updated = { ...form, [name]: value };
    if (name === "fecha_inicio" || name === "fecha_fin") {
      updated.dias = Number(calcularDias(name === "fecha_inicio" ? value : form.fecha_inicio, name === "fecha_fin" ? value : form.fecha_fin));
    }
    setForm(updated);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user) return alert("Sesión no válida");
    const { data: perfil } = await supabase.from("perfiles").select("nombre").eq("id", user.id).single();
    const nombreParaRegistro = perfil?.nombre || user.email || "Usuario Desconocido";

    const { error } = await supabase.from("permisos_vacaciones").insert({
      usuario_id: user.id,
      nombre_usuario: nombreParaRegistro,
      tipo: form.tipo,
      subtipo: form.subtipo || null,
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin,
      dias_solicitados: form.dias,
      motivo: form.motivo,
      estado: "pendiente",
    });

    if (error) return alert("Error: " + error.message);
    setForm({ tipo: "vacaciones", subtipo: "", fecha_inicio: "", fecha_fin: "", motivo: "", dias: 0 });
    await fetchSolicitudes(user.id);
    alert("Solicitud enviada");
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 font-bold text-slate-400">Cargando...</div>;

  return (
    <div className="min-h-screen bg-[#f8fafc] px-4 py-12">
      <div className="max-w-4xl mx-auto space-y-12">
        
        {/* TITULO Y SALDO */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tight"><span className="text-[#37788a]">Solicitud de Permisos y Vacaciones
 Ausencias</span></h1>
            <p className="text-slate-500 font-medium">Solicita tus días de descanso de forma sencilla</p>
          </div>
          
        </div>

        {/* FORMULARIO */}
        <form onSubmit={handleSubmit} className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-xl shadow-slate-200/50 space-y-8 border border-white relative overflow-hidden">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-slate-100 rounded-xl text-[#37788a]"><Send size={20}/></div>
             <h2 className="text-xl font-bold text-slate-800 tracking-tight">Nueva Solicitud</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="flex flex-col space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase ml-1">¿Qué solicitas?</label>
                <select
                  name="tipo"
                  value={form.tipo}
                  onChange={handleChange}
                  className="bg-slate-50 p-4 rounded-2xl border-none focus:ring-2 focus:ring-[#37788a] font-bold text-slate-700 outline-none transition-all"
                >
                  <option value="vacaciones">Vacaciones</option>
                  <option value="permiso">Permiso Especial</option>
                </select>
              </div>

              {form.tipo === "permiso" && (
                <div className="flex flex-col space-y-2 animate-in fade-in duration-300">
                  <label className="text-xs font-black text-slate-400 uppercase ml-1">Subtipo</label>
                  <select
                    name="subtipo"
                    value={form.subtipo}
                    onChange={handleChange}
                    className="bg-slate-50 p-4 rounded-2xl border-none focus:ring-2 focus:ring-[#37788a] font-bold text-slate-700 outline-none transition-all"
                  >
                    <option value="">Seleccionar...</option>
                    <option value="administrativo">Administrativo</option>
                    <option value="medico">Médico</option>
                    <option value="personal">Personal</option>
                    <option value="sin_goce">Sin goce</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase ml-1">Inicio</label>
                  <input
                    type="date"
                    name="fecha_inicio"
                    value={form.fecha_inicio}
                    onChange={handleChange}
                    className="bg-slate-50 p-4 rounded-2xl border-none focus:ring-2 focus:ring-[#37788a] font-bold text-slate-700 outline-none"
                    required
                  />
                </div>
                <div className="flex flex-col space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase ml-1">Fin</label>
                  <input
                    type="date"
                    name="fecha_fin"
                    value={form.fecha_fin}
                    onChange={handleChange}
                    className="bg-slate-50 p-4 rounded-2xl border-none focus:ring-2 focus:ring-[#37788a] font-bold text-slate-700 outline-none"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase ml-1">Motivo</label>
              <textarea
                name="motivo"
                value={form.motivo}
                onChange={handleChange}
                placeholder="Explica brevemente tu solicitud..."
                className="bg-slate-50 p-4 rounded-2xl border-none focus:ring-2 focus:ring-[#37788a] font-medium text-slate-700 h-full min-h-[160px] outline-none resize-none transition-all"
              />
            </div>
          </div>

          <div className="pt-6 border-t border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-4">
               <div className="bg-slate-800 text-white w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl">
                 {form.dias}
               </div>
               <div>
                 <p className="text-sm font-bold text-slate-800 leading-none">Días Totales</p>
                 <p className="text-xs text-slate-400 mt-1 font-medium">Cálculo automático</p>
               </div>
            </div>
            <button
              type="submit"
              className="w-full md:w-auto px-10 py-4 bg-[#37788a] text-white rounded-2xl font-black hover:bg-slate-800 transition-all shadow-lg hover:shadow-[#37788a]/30 active:scale-95 uppercase tracking-widest text-xs"
            >
              Enviar Solicitud
            </button>
          </div>
        </form>

        {/* LISTADO */}
        <div className="space-y-6">
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Clock className="text-[#6ec5ac]" size={24}/> Mis Solicitudes
          </h2>
          {solicitudes.length === 0 ? (
            <div className="bg-white p-10 rounded-[2rem] shadow-sm text-center text-slate-400 font-medium border border-slate-100 italic">No tienes solicitudes registradas aún.</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {solicitudes.map((s) => (
                <div key={s.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-50 hover:shadow-md transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-xl ${s.tipo === 'vacaciones' ? 'bg-sky-50 text-sky-600' : 'bg-indigo-50 text-indigo-600'}`}>
                        {s.tipo === 'vacaciones' ? <Calendar size={20}/> : <FileText size={20}/>}
                      </div>
                      <h3 className="font-black text-slate-800 uppercase text-sm tracking-tight">{s.tipo}</h3>
                    </div>
                    <span className={`px-4 py-1.5 text-[10px] rounded-full font-black uppercase tracking-widest ${estadoStyles[s.estado]}`}>
                      {s.estado}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-4 bg-slate-50 p-2 rounded-lg">
                    <span>{s.fecha_inicio}</span>
                    <ChevronRight size={12}/>
                    <span>{s.fecha_fin}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-600 truncate mb-4 italic">"{s.motivo || 'Sin motivo especificado'}"</p>
                  <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                    <span className="text-[10px] font-black text-slate-300 uppercase">Total días</span>
                    <span className="text-lg font-black text-slate-700">{s.dias_solicitados}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}