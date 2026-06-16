import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function TrackingAvanceAlloy() {
  const [reporte, setReporte] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  // Estado para mostrar u ocultar los entregables al 100%
  const [mostrarCerrados, setMostrarCerrados] = useState(false);
  const [stats, setStats] = useState({ totalHH: 0, avgProgreso: 0, alertas: 0, proyectosActivos: 0 });

  const alloy = { 
    dark: "#4b4b54", 
    blue1: "#37788a", 
    green: "#6ec5ac",
    red: "#e11d48", 
    bg: "#f8fafc",
    yellow: "#fbbf24",
    gray: "#94a3b8"
  };

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsSyncing(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setLoading(false);

    const [entregablesRes, tareasRes] = await Promise.all([
      // IMPORTANTE: Traemos progreso_manual e id
      supabase.from("entregables").select("id, nombre, proyecto_nombre, horas_presupuestadas, progreso_manual"),
      supabase.from("tareas").select("entregable, proyecto, horas, estado").eq("usuario_id", user.id)
    ]);

    if (entregablesRes.data && tareasRes.data) {
      const consolidado = entregablesRes.data
        .map(ent => {
          const tareasAsociadas = tareasRes.data.filter(
            t => t.entregable === ent.nombre && t.proyecto === ent.proyecto_nombre
          );
          const horasConsumidas = tareasAsociadas.reduce((acc, curr) => acc + parseFloat(curr.horas || 0), 0);
          const presupuesto = parseFloat(ent.horas_presupuestadas || 0);
          const porcentaje = presupuesto > 0 ? (horasConsumidas / presupuesto) * 100 : 0;

          const totalT = tareasAsociadas.length;
          const completadasT = tareasAsociadas.filter(t => t.estado === "Completada").length;
          const porcentajeTareas = totalT > 0 ? (completadasT / totalT) * 100 : 0;

          return {
            ...ent,
            consumido: horasConsumidas,
            porcentaje: porcentaje,
            hasActivity: tareasAsociadas.length > 0,
            numTareas: totalT,
            completadasTareas: completadasT,
            porcentajeTareas: porcentajeTareas,
            progreso_manual: Number(ent.progreso_manual || 0)
          };
        })
        .filter(item => item.hasActivity);

      const totalHH = consolidado.reduce((acc, curr) => acc + curr.consumido, 0);
      const alertas = consolidado.filter(item => item.consumido >= item.horas_presupuestadas && item.progreso_manual < 100).length;
      const proyUnicos = [...new Set(consolidado.map(i => i.proyecto_nombre))].length;
      const avgProgreso = consolidado.length > 0 
        ? (consolidado.reduce((acc, curr) => acc + curr.porcentaje, 0) / consolidado.length) 
        : 0;

      setStats({ totalHH, avgProgreso, alertas, proyectosActivos: proyUnicos });
      setReporte(consolidado);
    }
    setLoading(false);
    setIsSyncing(false);
  }

  const getProgressColor = (pct, esCerrado) => {
    if (esCerrado) return alloy.gray;
    if (pct >= 101) return alloy.red;
    if (pct >= 50) return alloy.yellow;
    return alloy.blue1;
  };

  // Filtrar los datos según el toggle de "mostrarCerrados"
  const datosFiltrados = mostrarCerrados 
    ? reporte 
    : reporte.filter(item => item.progreso_manual < 100);

  if (loading) return <div className="p-20 text-center font-bold text-cyan-700 animate-pulse uppercase tracking-widest">Cargando Seguimiento...</div>;

  return (
    <div className="min-h-screen p-4 md:p-8 font-sans" style={{ backgroundColor: alloy.bg }}>
      <div className="max-w-7xl mx-auto space-y-8">
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b-2 border-slate-100 pb-8 gap-4">
          <div>
            <h1 className="text-4xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
              Estado <span style={{ color: alloy.blue1 }}>Avance</span>
            </h1>
            <div className="flex items-center gap-4 mt-2">
              <p className="text-[#37788a] text-[10px] font-black uppercase tracking-[0.3em] italic">Control por entregable</p>
              <button 
                onClick={() => setMostrarCerrados(!mostrarCerrados)}
                className={`text-[9px] font-black px-3 py-1 rounded-full border transition-all ${mostrarCerrados ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'}`}
              >
                {mostrarCerrados ? 'OCULTAR CERRADOS' : 'VER CERRADOS (100%)'}
              </button>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3">
            {/* NUEVO BOTÓN: IR AL HISTORIAL */}
            <a 
              href="/HistorialTareas" 
              className="flex items-center gap-3 bg-white border-2 border-slate-200 text-slate-600 px-6 py-3 rounded-full text-[10px] font-black uppercase italic transition-all hover:border-[#37788a] hover:text-[#37788a] active:scale-95 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Historial de Tareas
            </a>

            <button 
              onClick={fetchData}
              disabled={isSyncing}
              className={`flex items-center gap-3 bg-slate-900 text-white px-6 py-3 rounded-full text-[10px] font-black uppercase italic transition-all active:scale-95 shadow-xl ${isSyncing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-800'}`}
            >
              <svg className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isSyncing ? 'Sincronizando' : 'Sincronizar'}
            </button>
          </div>
        </header>

        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-50 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">HH Totales</p>
            <p className="text-3xl font-black text-slate-800 italic tracking-tighter">{stats.totalHH.toFixed(1)}</p>
          </div>
          <div className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-50 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Proyectos</p>
            <p className="text-3xl font-black text-slate-800 italic tracking-tighter">{stats.proyectosActivos}</p>
          </div>
          <div className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-50 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Uso Promedio</p>
            <p className="text-3xl font-black text-[#37788a] italic tracking-tighter">{Math.round(stats.avgProgreso)}%</p>
          </div>
          <div className={`p-6 rounded-[2.5rem] border-2 shadow-sm transition-all duration-500 ${stats.alertas > 0 ? 'bg-red-600 border-red-700 shadow-red-200' : 'bg-white border-slate-50'}`}>
            <p className={`text-[9px] font-black uppercase tracking-widest ${stats.alertas > 0 ? 'text-white/60' : 'text-slate-400'}`}>Excedidos</p>
            <p className={`text-3xl font-black italic tracking-tighter ${stats.alertas > 0 ? 'text-white animate-pulse' : 'text-slate-800'}`}>{stats.alertas}</p>
          </div>
        </div>

        {/* LISTADO DE TARJETAS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {datosFiltrados.map((item, idx) => {
            const esExcedido = item.consumido >= item.horas_presupuestadas;
            const esCerrado = item.progreso_manual >= 100;
            const saldo = item.horas_presupuestadas - item.consumido;
            const barraColor = getProgressColor(item.porcentaje, esCerrado);

            return (
              <div 
                key={idx} 
                className={`bg-white rounded-[2.5rem] border-2 shadow-sm overflow-hidden flex transition-all duration-500 
                ${esCerrado ? 'grayscale opacity-60 scale-[0.98]' : 'hover:border-slate-200'} 
                ${esExcedido && !esCerrado ? 'border-red-500 shadow-red-100' : 'border-transparent'}`}
              >
                <div className="w-3 transition-colors duration-500" style={{ backgroundColor: barraColor }}></div>
                
                <div className="flex-1 p-8 space-y-6">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex gap-2 items-center">
                         <span className={`${esCerrado ? 'bg-slate-400' : 'bg-slate-900'} text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-tighter`}>
                          {item.proyecto_nombre}
                        </span>
                        <span className="text-slate-400 text-[10px] font-black uppercase italic tracking-tighter">
                          {item.numTareas} Entradas
                        </span>
                      </div>
                      <h3 className={`text-2xl font-black uppercase italic tracking-tighter leading-none ${esCerrado ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                        {item.nombre}
                      </h3>
                    </div>
                    
                    {esCerrado ? (
                      <div className="bg-emerald-100 text-emerald-600 px-3 py-1 rounded-full text-[9px] font-black uppercase italic">
                        Finalizado ✓
                      </div>
                    ) : esExcedido ? (
                      <div className="bg-red-600 text-white px-4 py-2 rounded-2xl animate-bounce shadow-lg shadow-red-200">
                        <p className="text-[10px] font-black uppercase italic leading-none">LÍMITE HH</p>
                      </div>
                    ) : (
                      <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase italic ${item.porcentaje >= 50 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-[#37788a]'}`}>
                        {item.porcentaje >= 50 ? 'En Proceso' : 'Iniciando'}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-5 rounded-[2rem] text-center border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Presupuesto</p>
                      <p className="text-2xl font-black text-slate-700 italic tracking-tighter">{item.horas_presupuestadas} HH</p>
                    </div>
                    <div className={`p-5 rounded-[2rem] text-center border transition-colors ${esExcedido && !esCerrado ? 'bg-red-50 border-red-200' : 'bg-slate-900 border-slate-800 text-white'}`}>
                      <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${esExcedido && !esCerrado ? 'text-red-500' : 'text-white/40'}`}>Consumo Real</p>
                      <p className={`text-2xl font-black italic tracking-tighter ${esExcedido && !esCerrado ? 'text-red-600' : 'text-white'}`}>{item.consumido.toFixed(1)} HH</p>
                    </div>
                  </div>

                  <div className="space-y-5 pt-2">
                    {/* Barra de Consumo HH */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-end px-2">
                        <div className="flex items-baseline gap-1">
                          <span className={`text-2xl font-black tracking-tighter italic ${esCerrado ? 'text-slate-400' : ''}`} style={!esCerrado ? { color: barraColor } : {}}>
                            {Math.round(item.porcentaje)}%
                          </span>
                          <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Consumo HH</span>
                        </div>
                        <p className={`text-[9px] font-black uppercase italic tracking-tighter ${esExcedido && !esCerrado ? 'text-red-600' : 'text-slate-500'}`}>
                          {esExcedido ? `Exceso: ${Math.abs(saldo).toFixed(1)} HH` : `Restan: ${saldo.toFixed(1)} HH`}
                        </p>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full border border-slate-200 overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-1000"
                          style={{ width: `${Math.min(item.porcentaje, 100)}%`, backgroundColor: barraColor }}
                        />
                      </div>
                    </div>

                    {/* Barra de Avance de Tareas */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-end px-2">
                        <div className="flex items-baseline gap-1">
                          <span className={`text-2xl font-black tracking-tighter italic ${esCerrado ? 'text-slate-400' : 'text-emerald-500'}`}>
                            {Math.round(item.porcentajeTareas)}%
                          </span>
                          <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Tareas Logradas</span>
                        </div>
                        <p className="text-[9px] font-black uppercase italic tracking-tighter text-slate-500">
                          {item.completadasTareas} de {item.numTareas} Listas
                        </p>
                      </div>
                      <div className="h-4 w-full bg-slate-100 rounded-full border border-slate-200 overflow-hidden p-0.5">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 shadow-sm ${esCerrado ? 'bg-slate-300' : 'bg-emerald-400'}`}
                          style={{ width: `${item.porcentajeTareas}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {datosFiltrados.length === 0 && (
          <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-[3rem]">
            <p className="text-slate-400 font-black uppercase italic tracking-widest">No hay entregables activos para mostrar</p>
          </div>
        )}
      </div>
    </div>
  );
}