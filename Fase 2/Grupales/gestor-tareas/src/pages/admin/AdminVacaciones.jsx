import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function AdminVacaciones() {
  const navigate = useNavigate();
  const [vacacionesPendientes, setVacacionesPendientes] = useState([]);
  const [vacacionesHistorial, setVacacionesHistorial] = useState([]);
  const [listaUsuarios, setListaUsuarios] = useState([]); 
  const [msg, setMsg] = useState("");
  const [vista, setVista] = useState(null);

  const [selectedUserId, setSelectedUserId] = useState("");
  const [diasAjuste, setDiasAjuste] = useState(0);

  const alloy = {
    green: "#6ec5ac",
    dark: "#4b4b54",
    blue1: "#37788a",
    orange: "#e67e22"
  };

  useEffect(() => {
    loadVacaciones();
    loadUsuariosConDias();
  }, []);

  async function loadUsuariosConDias() {
    try {
      // 1. Obtenemos nombres de 'usuarios'
      const { data: users, error: errU } = await supabase
        .from("usuarios")
        .select("id, nombre, correo");

      // 2. Obtenemos días de 'perfiles' usando 'user_id'
      const { data: perfiles, error: errP } = await supabase
        .from("perfiles")
        .select("user_id, vacaciones_disponibles");

      if (errU || errP) throw (errU || errP);

      // 3. Cruzamos datos: buscamos u.id en p.user_id
      const combinados = users.map(u => {
        const p = perfiles.find(perf => perf.user_id === u.id);
        return {
          ...u,
          vacaciones_disponibles: p ? p.vacaciones_disponibles : 0
        };
      });

      setListaUsuarios(combinados);
      setMsg(""); 
    } catch (error) {
      console.error("Error al cargar:", error);
      setMsg(`Error de carga: ${error.message}`);
    }
  }

  async function loadVacaciones() {
    const { data: vacs, error } = await supabase
      .from("permisos_vacaciones")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return setMsg("Error al conectar con vacaciones");

    const dataLimpia = (vacs || []).map(v => ({
      ...v,
      userName: v.nombre_usuario || "Sin nombre",
    }));

    setVacacionesPendientes(dataLimpia.filter(v => v.estado === "pendiente"));
    setVacacionesHistorial(dataLimpia.filter(v => v.estado !== "pendiente"));
  }

  async function aplicarAjusteManual() {
    if (!selectedUserId || diasAjuste === 0) {
      alert("Selecciona un usuario y cantidad de días");
      return;
    }

    const user = listaUsuarios.find(u => u.id === selectedUserId);
    const nuevoTotal = (Number(user.vacaciones_disponibles) || 0) + Number(diasAjuste);

    // Actualizamos usando 'user_id' como clave
    const { error } = await supabase
      .from("perfiles")
      .upsert({ 
        user_id: selectedUserId, 
        vacaciones_disponibles: nuevoTotal 
      }, { onConflict: 'user_id' });

    if (error) {
      setMsg("❌ Error: " + error.message);
    } else {
      setMsg(`✅ Saldo actualizado para ${user.nombre}.`);
      setDiasAjuste(0);
      loadUsuariosConDias();
    }
  }

  async function revisarVacaciones(solicitud, nuevoEstado) {
    const { error } = await supabase
      .from("permisos_vacaciones")
      .update({ estado: nuevoEstado })
      .eq("id", solicitud.id);

    if (error) return setMsg("❌ Error al actualizar solicitud");

    if (nuevoEstado === "aprobada" && solicitud.tipo === "vacaciones") {
      const { data: perfil } = await supabase
        .from("perfiles")
        .select("vacaciones_disponibles")
        .eq("user_id", solicitud.usuario_id)
        .single();

      const saldoActual = perfil ? Number(perfil.vacaciones_disponibles) : 0;
      const nuevoSaldo = saldoActual - Number(solicitud.dias_solicitados);

      await supabase
        .from("perfiles")
        .upsert({ 
          user_id: solicitud.usuario_id, 
          vacaciones_disponibles: nuevoSaldo 
        }, { onConflict: 'user_id' });
    }

    setMsg(`✅ Solicitud ${nuevoEstado}.`);
    loadVacaciones();
    loadUsuariosConDias();
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-6xl mx-auto space-y-8">
        <button onClick={() => navigate("/admin")} className="text-gray-400 hover:text-gray-600 flex items-center gap-2 font-bold text-sm">
          ← Volver al Panel
        </button>
        
        <h1 className="text-3xl font-bold text-center" style={{ color: alloy.blue1 }}>
          Administración de Vacaciones
        </h1>

        {msg && (
          <div className="p-3 text-center rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-medium">
            {msg}
          </div>
        )}

        <div className="bg-white shadow-md rounded-xl p-6 border-l-4" style={{ borderColor: alloy.green }}>
          <h2 className="text-xl font-semibold mb-4" style={{ color: alloy.green }}>Ajuste Directo de Saldo</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <select 
              className="p-3 border rounded-lg bg-white" 
              value={selectedUserId} 
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Seleccionar Colaborador...</option>
              {listaUsuarios.map(u => (
                <option key={u.id} value={u.id}>
                  {u.nombre} — ({u.vacaciones_disponibles} días)
                </option>
              ))}
            </select>
            <input 
              type="number" 
              placeholder="Días a sumar/restar" 
              className="p-3 border rounded-lg" 
              value={diasAjuste} 
              onChange={(e) => setDiasAjuste(e.target.value)} 
            />
            <button 
              onClick={aplicarAjusteManual} 
              className="py-3 rounded-lg font-bold text-white transition hover:brightness-90" 
              style={{ backgroundColor: alloy.green }}
            >
              Actualizar Días
            </button>
          </div>
        </div>

        <div className="bg-white shadow-md rounded-xl p-6 border-l-4 border-[#e67e22]">
          <h2 className="text-xl font-semibold mb-4" style={{ color: alloy.orange }}>Gestión de Solicitudes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button onClick={() => setVista("vac_pendientes")} className="py-3 rounded-lg font-semibold text-white transition" style={{ backgroundColor: alloy.orange }}>Ver pendientes</button>
            <button onClick={() => setVista("vac_historial")} className="py-3 rounded-lg font-semibold text-white transition" style={{ backgroundColor: alloy.dark }}>Ver historial</button>
          </div>
        </div>

        {vista === "vac_pendientes" && (
          <div className="bg-white shadow-md rounded-xl p-6 mt-4">
            <h2 className="text-xl font-bold mb-4" style={{ color: alloy.orange }}>Solicitudes Pendientes</h2>
            {vacacionesPendientes.length === 0 ? <p className="text-center py-4 text-gray-500">No hay solicitudes.</p> : vacacionesPendientes.map((v) => (
              <div key={v.id} className="border-b py-6 flex flex-col md:flex-row md:justify-between items-center gap-4">
                <div className="space-y-1">
                  <p className="font-bold text-lg text-gray-800">{v.userName}</p> 
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-bold uppercase mr-2">{v.tipo}</span>
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold uppercase">{v.dias_solicitados} Días</span>
                  <p className="text-sm text-gray-600">Periodo: {v.fecha_inicio} al {v.fecha_fin}</p>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => revisarVacaciones(v, "aprobada")} className="px-8 py-2.5 bg-emerald-500 text-white rounded-xl font-bold shadow-md hover:bg-emerald-600 transition-all">Aprobar</button>
                  <button onClick={() => revisarVacaciones(v, "rechazada")} className="px-8 py-2.5 bg-rose-500 text-white rounded-xl font-bold shadow-md hover:bg-rose-600 transition-all">Rechazar</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {vista === "vac_historial" && (
          <div className="bg-white shadow-md rounded-xl p-6 mt-4">
            <h2 className="text-xl font-bold mb-4 text-[#4b4b54]">Historial de Solicitudes</h2>
            {vacacionesHistorial.map((v) => (
              <div key={v.id} className="border-b py-4 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-gray-800">{v.userName}</p>
                  <p className="text-xs text-gray-400 font-bold uppercase">{v.tipo} • {v.dias_solicitados} días</p>
                </div>
                <span className={`px-4 py-1 rounded-full text-xs font-black uppercase ${v.estado === "aprobada" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {v.estado}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}