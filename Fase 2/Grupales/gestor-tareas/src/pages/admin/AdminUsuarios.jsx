import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { 
  Mail, Briefcase, Calendar, ChevronLeft, Plus, Users, 
  Trash2, Cake, X, Clock, CheckCircle2, Hash, BookOpen, Activity, Info,
  UserMinus, UserCheck // Nuevos iconos para el estado
} from "lucide-react";
import AlloyLogo from "../../assets/User.png";

export default function AdminUsuarios() {
  const navigate = useNavigate();
  const alloy = { dark: "#4b4b54", blue1: "#37788a", green: "#6ec5ac" };

  const [usuarios, setUsuarios] = useState([]);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserBirth, setNewUserBirth] = useState(""); 
  const [msg, setMsg] = useState("");

  const [selectedUser, setSelectedUser] = useState(null);
  const [tareas, setTareas] = useState([]);
  const [loadingTareas, setLoadingTareas] = useState(false);

  useEffect(() => {
    loadUsuarios();
  }, []);

  async function loadUsuarios() {
    try {
      const { data: perfilesData, error: errorP } = await supabase
        .from("perfiles")
        .select("*")
        .order("activo", { ascending: false }) // Primero los activos
        .order("nombre", { ascending: true });

      if (errorP) throw errorP;

      const { data: usuariosData, error: errorU } = await supabase
        .from("usuarios")
        .select("id, correo");

      const datosCombinados = (perfilesData || []).map(perfil => {
        const infoUsuario = (usuariosData || []).find(u => u.id === perfil.user_id);
        return {
          ...perfil,
          usuarios: { correo: infoUsuario ? infoUsuario.correo : "Sin correo" }
        };
      });

      setUsuarios(datosCombinados);
    } catch (err) {
      setMsg("❌ Error de conexión: " + err.message);
    }
  }

  async function abrirExpediente(usuario) {
    setSelectedUser(usuario);
    setLoadingTareas(true);
    try {
      const { data, error } = await supabase
        .from("tareas")
        .select(`
          *,
          codigos_tarea:codigo_id (
            codigo,
            descripcion,
            proyecto,
            entregable
          )
        `)
        .eq("usuario_id", usuario.user_id)
        .gt("horas", 0.00) 
        .order("fecha", { ascending: false });

      if (error) throw error;
      setTareas(data || []);
    } catch (err) {
      setTareas([]);
    } finally {
      setLoadingTareas(false);
    }
  }

  const getStatusBadge = (t) => {
    const est = t.estado?.toLowerCase();
    const rev = t.revision?.toLowerCase();
    if (rev === 'aprobado' || est === 'completada') {
      return <span className="flex items-center gap-1 text-[#6ec5ac] text-[9px] font-black uppercase"><CheckCircle2 className="w-3 h-3"/> Completada</span>;
    } else if (est === 'en progreso' || est === 'desarrollo') {
      return <span className="flex items-center gap-1 text-blue-500 text-[9px] font-black uppercase"><Activity className="w-3 h-3"/> En Progreso</span>;
    } else {
      return <span className="flex items-center gap-1 text-amber-500 text-[9px] font-black uppercase"><Clock className="w-3 h-3"/> Pendiente / Revisión</span>;
    }
  };

  async function crearUsuario() {
    if (!newUserName || !newUserEmail) return setMsg("⚠ Nombre y Correo son obligatorios.");
    try {
      const { data: userData, error: userError } = await supabase.from("usuarios").insert([{ nombre: newUserName, correo: newUserEmail }]).select().single();
      if (userError) throw userError;
      // Añadimos activo: true explícitamente al crear
      await supabase.from("perfiles").insert([{ user_id: userData.id, nombre: newUserName, fecha_nacimiento: newUserBirth || null, vacaciones_disponibles: 15, activo: true }]);
      setMsg("✅ Usuario creado.");
      setNewUserName(""); setNewUserEmail(""); setNewUserBirth("");
      loadUsuarios();
    } catch (error) { setMsg("❌ Error: " + error.message); }
  }

  // REEMPLAZO DE ELIMINAR POR CAMBIO DE ESTADO (Toggle)
  async function toggleEstadoUsuario(id, nombre, estadoActual) {
    const confirmacion = window.confirm(`¿Deseas ${estadoActual ? 'desactivar' : 'activar'} a ${nombre}? Se conservarán todos sus datos históricos.`);
    if (!confirmacion) return;

    try {
      const { error } = await supabase
        .from("perfiles")
        .update({ activo: !estadoActual })
        .eq("user_id", id);

      if (error) throw error;
      setMsg(`✅ Usuario ${!estadoActual ? 'activado' : 'desactivado'}.`);
      loadUsuarios();
    } catch (error) {
      setMsg("❌ Error al cambiar estado.");
    }
  }

  const formatBirthday = (dateStr) => {
    if (!dateStr) return "No registrado";
    const date = new Date(dateStr + "T00:00:00"); 
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'long' });
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* HEADER */}
        <button onClick={() => navigate("/admin")} className="group flex items-center gap-2 text-slate-400 hover:text-[#37788a] transition-colors">
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="font-medium text-sm">Volver al Panel</span>
        </button>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tight">
              <span style={{ color: alloy.blue1 }}>Directorio de Equipo</span>
            </h1>
            <p className="text-slate-500 font-medium">Gestión de colaboradores y accesos</p>
          </div>
          <div className="bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-2">
            <Users className="w-4 h-4 text-[#6ec5ac]" />
            <span className="text-sm font-bold text-slate-700">{usuarios.length} Total</span>
          </div>
        </div>

        {msg && <div className="p-4 text-center rounded-2xl bg-white border border-blue-100 text-blue-600 font-bold shadow-sm">{msg}</div>}

        {/* MODAL / CARD DE EXPEDIENTE TÉCNICO */}
        {selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1e1e24]/80 backdrop-blur-md transition-all">
            <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-500 relative">
              
              <div className="grid grid-cols-1 lg:grid-cols-12 h-full max-h-[85vh]">
                
                {/* Panel Lateral Izquierdo */}
                <div className="lg:col-span-4 bg-slate-50 p-8 border-r border-slate-100 flex flex-col items-center text-center">
                  <div className="relative mb-6">
                    <img src={selectedUser.avatar_url || AlloyLogo} className={`w-32 h-32 rounded-[2.5rem] object-cover shadow-2xl border-4 border-white ${!selectedUser.activo && 'grayscale opacity-70'}`} />
                    <div className={`absolute -bottom-2 -right-2 p-2 rounded-xl text-white ${selectedUser.activo ? 'bg-[#6ec5ac]' : 'bg-red-400'}`}>
                      {selectedUser.activo ? <Activity className="w-5 h-5" /> : <UserMinus className="w-5 h-5" />}
                    </div>
                  </div>
                  <h2 className="text-2xl font-black text-slate-800 leading-tight">{selectedUser.nombre}</h2>
                  {!selectedUser.activo && <p className="text-red-500 font-bold text-[10px] uppercase mt-1">Colaborador Inactivo</p>}
                  <p className="text-[#37788a] font-bold text-xs uppercase mt-2">{selectedUser.cargo || "Especialista"}</p>
                  
                  <div className="w-full mt-10 space-y-3">
                    <div className="bg-white p-4 rounded-2xl shadow-sm flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Horas Reales</span>
                      <span className="text-xl font-black text-slate-700">
                        {tareas.reduce((acc, t) => acc + (Number(t.horas) || 0), 0).toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Panel Derecho */}
                <div className="lg:col-span-8 p-8 flex flex-col bg-white overflow-hidden">
                  <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-50">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-[#37788a]" /> Bitácora de Trabajo
                    </h3>
                    <button onClick={() => setSelectedUser(null)} className="p-2 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-full transition-all">
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-2 space-y-6 max-h-[60vh] custom-scrollbar">
                    {loadingTareas ? (
                      <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#37788a]"></div></div>
                    ) : tareas.length > 0 ? (
                      tareas.map((t) => (
                        <div key={t.id} className="relative pl-8 border-l-2 border-slate-100 pb-2">
                          <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-4 border-[#37788a]"></div>
                          <div className="bg-slate-50 hover:bg-white hover:shadow-xl transition-all p-5 rounded-3xl border border-transparent hover:border-slate-100">
                            <div className="flex justify-between items-start mb-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="bg-[#4b4b54] text-white text-[9px] font-bold px-2 py-0.5 rounded">
                                    <Hash className="w-3 h-3 inline mr-1" />
                                    {t.codigos_tarea?.codigo || t.codigo_id}
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase">{t.fecha}</span>
                                </div>
                                <h4 className="text-lg font-black text-slate-800">
                                  {t.codigos_tarea?.proyecto || t.proyecto}
                                </h4>
                                <p className="text-[11px] font-bold text-[#37788a] uppercase italic">
                                  {t.codigos_tarea?.descripcion}
                                </p>
                              </div>
                              <div className="bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-100 text-center">
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Horas</p>
                                <p className="text-md font-black text-[#37788a]">{t.horas}</p>
                              </div>
                            </div>
                            <div className="bg-white/50 p-3 rounded-xl border border-slate-100 mb-4">
                              <p className="text-sm text-slate-500 italic leading-relaxed">
                                "{t.entregable || "Sin descripción de actividad"}"
                              </p>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-slate-200/50">
                               <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase ${t.urgencia === 'Alta' ? 'bg-red-50 text-red-500' : 'bg-slate-200 text-slate-600'}`}>
                                Urgencia: {t.urgencia}
                              </span>
                              {getStatusBadge(t)}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-20 bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-100">
                        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">No hay actividad registrada</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FORMULARIO DE REGISTRO */}
        <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-white">
          <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Plus className="w-5 h-5 p-1 bg-[#6ec5ac] text-white rounded-full" />
            Nuevo Registro
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input className="bg-slate-50 p-4 rounded-2xl border-none outline-none text-sm" placeholder="Nombre completo" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} />
            <input className="bg-slate-50 p-4 rounded-2xl border-none outline-none text-sm" placeholder="Correo" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} />
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-slate-400 ml-2 mb-1 uppercase">Fecha Nacimiento</label>
              <input type="date" className="bg-slate-50 p-3.5 rounded-2xl border-none text-sm" value={newUserBirth} onChange={(e) => setNewUserBirth(e.target.value)} />
            </div>
            <button onClick={crearUsuario} className="bg-[#4b4b54] text-white font-bold rounded-2xl hover:scale-[1.02] transition-all shadow-lg h-[52px] self-end">
              Ingresar trabajador
            </button>
          </div>
        </div>

        {/* LISTADO DE TARJETAS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {usuarios.map((u) => (
            <div key={u.user_id} className={`bg-white rounded-[2rem] overflow-hidden border transition-all group flex flex-col ${u.activo ? 'border-slate-100 shadow-sm hover:shadow-2xl' : 'border-red-50 bg-red-50/10 opacity-75 grayscale-[0.5]'}`}>
              <div className="p-6 flex-grow">
                <div className="flex items-center gap-4 mb-6">
                  <div className="relative">
                    <img src={u.avatar_url || AlloyLogo} className={`w-20 h-20 rounded-[1.5rem] object-cover ${!u.activo && 'opacity-50'}`} />
                    <div className={`absolute -top-2 -right-2 text-white text-[10px] font-bold px-2 py-1 rounded-lg ${u.activo ? 'bg-[#6ec5ac]' : 'bg-red-500'}`}>
                      {u.activo ? 'ACTIVO' : 'INACTIVO'}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-xl font-bold leading-tight mb-1 truncate ${u.activo ? 'text-slate-800' : 'text-slate-400'}`}>
                      {u.nombre}
                    </h3>
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded-md">
                      <Briefcase className="w-3 h-3 text-slate-500" />
                      <span className="text-[10px] font-bold text-slate-500 uppercase">{u.cargo || "Staff"}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 bg-slate-50/50 p-4 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg shadow-sm"><Mail className="w-4 h-4 text-[#37788a]" /></div>
                    <span className="text-sm text-slate-600 font-medium truncate">{u.usuarios?.correo || "Sin correo"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg shadow-sm"><Cake className="w-4 h-4 text-pink-400" /></div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Cumpleaños</span>
                    </div>
                    <span className="text-sm font-black text-slate-700">{formatBirthday(u.fecha_nacimiento)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg shadow-sm"><Calendar className="w-4 h-4 text-[#6ec5ac]" /></div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Vacaciones</span>
                    </div>
                    <span className="text-lg font-black text-slate-700">{u.vacaciones_disponibles || 0} <span className="text-[10px] font-normal text-slate-400">DÍAS</span></span>
                  </div>
                </div>
              </div>
              
              <div className="flex border-t border-slate-100">
                <button 
                  onClick={() => abrirExpediente(u)}
                  className="flex-1 py-4 bg-slate-50 hover:bg-[#37788a] hover:text-white text-[#37788a] text-[10px] font-black transition-all uppercase tracking-widest border-r border-slate-100"
                >
                  Gestionar Avance
                </button>
                {/* BOTÓN DINÁMICO: DESACTIVAR / REACTIVAR */}
                <button 
                  onClick={() => toggleEstadoUsuario(u.user_id, u.nombre, u.activo)} 
                  className={`px-6 py-4 bg-slate-50 transition-all flex items-center justify-center ${u.activo ? 'hover:bg-red-500 hover:text-white text-red-400' : 'hover:bg-emerald-500 hover:text-white text-emerald-500'}`}
                  title={u.activo ? "Dar de baja" : "Reactivar usuario"}
                >
                  {u.activo ? <UserMinus className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}