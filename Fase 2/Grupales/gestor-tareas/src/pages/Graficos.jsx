import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import DuocLogo from "../assets/logoduoc.png";
import { 
  Users, Clock, FileCheck, AlertCircle, 
  BarChart3, Trophy, Calendar, PieChart as PieIcon, 
  RefreshCw, Zap, Activity, AlertTriangle, Download
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell
} from "recharts";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function AdminDashboard() {
  const [stats, setStats] = useState({ 
    usuarios: 0, pendientes: 0, horasMes: 0, entregables: 0, enRiesgo: 0, atrasadas: 0 
  });
  const [chartData, setChartData] = useState([]);
  const [pieData, setPieData] = useState([]);
  const [riesgoData, setRiesgoData] = useState([]);
  const [tareasAtrasadasList, setTareasAtrasadasList] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth()); 

  // Estado para proyectos activos
  const [proyectosActivos, setProyectosActivos] = useState([]);

  useEffect(() => { loadDashboard(); }, [selectedMonth]); 

  async function loadDashboard() {
    try {
      setLoading(true);
      const [tareasRes, entregablesRes] = await Promise.all([
        supabase.from("tareas").select("*, codigos_tarea(codigo, descripcion)"),
        supabase.from("entregables").select("*")
      ]);

      const allTareas = tareasRes.data || [];
      const allEntregables = entregablesRes.data || [];
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      const tareasMes = allTareas.filter(t => {
        const fechaTarea = new Date(t.fecha || t.created_at);
        return fechaTarea.getMonth() === selectedMonth;
      });

      const nombresBrutos = [...new Set(tareasMes.map(t => (t.nombre_trabajador || "Sin Nombre").trim()))];
      const nombresOrdenados = nombresBrutos.sort((a, b) => b.length - a.length);
      
      const mapaNombresOficiales = {};
      nombresBrutos.forEach(nombreOriginal => {
        const oficial = nombresOrdenados.find(nLong => 
          nLong.toLowerCase().includes(nombreOriginal.toLowerCase())
        );
        mapaNombresOficiales[nombreOriginal] = oficial || nombreOriginal;
      });

      const tareasNormalizadas = tareasMes.map(t => ({
        ...t,
        colaboradorOficial: mapaNombresOficiales[(t.nombre_trabajador || "Sin Nombre").trim()]
      }));

      const statsPorUsuario = {};
      tareasNormalizadas.forEach(t => {
        const oficial = t.colaboradorOficial;
        statsPorUsuario[oficial] = (statsPorUsuario[oficial] || 0) + (Number(t.horas) || 0);
      });

      const formattedChartData = Object.keys(statsPorUsuario)
        .map(k => ({ name: k, value: Number(statsPorUsuario[k].toFixed(2)) }))
        .sort((a, b) => b.value - a.value);

      setChartData(formattedChartData);

      const proyMap = {};
      tareasNormalizadas.forEach(t => {
        const proyecto = t.proyecto || "Sin Proyecto";
        const oficial = t.colaboradorOficial;
        const key = `${proyecto}---${oficial}`; 
        if (!proyMap[key]) {
          proyMap[key] = { proyecto, colaborador: oficial, horas: 0 };
        }
        proyMap[key].horas += (Number(t.horas) || 0);
      });

      const listaProyectosFinal = Object.values(proyMap).map(item => ({
        ...item,
        horas: Number(item.horas.toFixed(2)) 
      })).sort((a, b) => {
        if (a.proyecto < b.proyecto) return -1;
        if (a.proyecto > b.proyecto) return 1;
        return b.horas - a.horas;
      });

      setProyectosActivos(listaProyectosFinal);

      const atrasadas = tareasNormalizadas.filter(t => {
        if (!t.fecha_vencimiento) return false;
        const vencimiento = new Date(t.fecha_vencimiento);
        vencimiento.setHours(0, 0, 0, 0);
        return vencimiento < hoy && t.revision !== "aprobada";
      });
      setTareasAtrasadasList(atrasadas);

      const saludEntregables = allEntregables.map(ent => {
        const horasConsumidas = tareasNormalizadas
          .filter(t => t.entregable?.trim().toLowerCase() === ent.nombre?.trim().toLowerCase())
          .reduce((acc, curr) => acc + (Number(curr.horas) || 0), 0);
        
        return {
          nombre: ent.nombre,
          proyecto: ent.proyecto_nombre,
          limite: ent.horas_presupuestadas || 0,
          consumido: horasConsumidas,
          porcentaje: ent.horas_presupuestadas > 0 ? (horasConsumidas / ent.horas_presupuestadas) * 100 : 0
        };
      });
      setRiesgoData(saludEntregables.sort((a, b) => b.porcentaje - a.porcentaje));

      const pendientes = tareasNormalizadas.filter(t => t.revision === "sin_revisar").length;
      const totalHoras = tareasNormalizadas.reduce((acc, t) => acc + (Number(t.horas) || 0), 0);

      setStats({
        usuarios: formattedChartData.length,
        pendientes,
        horasMes: Number(totalHoras.toFixed(2)),
        entregables: allEntregables.length,
        enRiesgo: saludEntregables.filter(e => e.porcentaje >= 100).length,
        atrasadas: atrasadas.length
      });

      setPieData([
        { name: 'Pendientes', value: pendientes },
        { name: 'Aprobados', value: tareasNormalizadas.filter(t => t.revision === 'aprobada').length }
      ]);

    } catch (error) {
      console.error("Error loading dashboard:", error);
    } finally { 
      setLoading(false); 
    }
  }

  const generatePDF = () => {
    const doc = new jsPDF();
    const primaryColor = [99, 102, 241]; 
    const accentColor = [244, 63, 94];  
    
    // Banner Azul Suave
    doc.setFillColor(238, 242, 255); 
    doc.rect(0, 0, 210, 40, 'F');

    // Texto de Cabecera
    doc.setTextColor(49, 46, 129);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("REPORTE DE GESTIÓN OPERATIVA", 14, 22);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`MES DE CONTROL: ${MONTHS[selectedMonth].toUpperCase()} ${new Date().getFullYear()}`, 14, 30);
    doc.text(`GENERADO: ${new Date().toLocaleString()}`, 14, 35);

    // --- LOGO DE LA EMPRESA ---
    if (AlloyLogo) {
      try {
        // x=165, y=5, ancho=30, alto=30 (Ajustado para formato .png)
        doc.addImage(AlloyLogo, 'PNG', 160, 10, 40, 0, undefined, 'FAST');
      } catch (error) {
        console.warn("No se pudo cargar el logo:", error);
      }
    }

    autoTable(doc, {
      startY: 45,
      head: [['Métrica de Control', 'Valor Actual']],
      body: [
        ['Total de Horas Hombre (HH)', `${stats.horasMes} h`],
        ['Colaboradores Activos', stats.usuarios],
        ['Entregables con Exceso de Presupuesto', stats.enRiesgo],
        ['Tareas con Atraso Crítico', stats.atrasadas]
      ],
      headStyles: { fillColor: [51, 65, 85], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 3 }
    });

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(14);
    doc.text("Resumen de Carga por Colaborador", 14, doc.lastAutoTable.finalY + 12);
    
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 16,
      head: [['Colaborador', 'Horas Reportadas', 'Estado de Carga']],
      body: chartData.map(u => [
        u.name, 
        `${u.value} h`, 
        u.value > 160 ? 'SOBRECARGA' : 'NORMAL'
      ]),
      headStyles: { fillColor: [71, 85, 105] },
      alternateRowStyles: { fillGray: 250 }
    });

    doc.text("Detalle de Horas por Proyecto y Colaborador", 14, doc.lastAutoTable.finalY + 12);

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 16,
      head: [['Proyecto Activo', 'Colaborador', 'Horas Cargadas']],
      body: proyectosActivos.map(p => [
        p.proyecto,
        p.colaborador,
        `${p.horas} h`
      ]),
      headStyles: { fillColor: [63, 63, 70] },
      styles: { fontSize: 9 },
      alternateRowStyles: { fillGray: 245 }
    });

    if (tareasAtrasadasList.length > 0) {
      doc.addPage();
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.setFontSize(14);
      doc.text("DETALLE DE TAREAS ATRASADAS / PENDIENTES", 14, 20);
      
      autoTable(doc, {
        startY: 25,
        head: [['Colaborador', 'Proyecto', 'Tarea / Descripción', 'Vencimiento', 'HH']],
        body: tareasAtrasadasList.map(t => [
          t.nombre_trabajador,
          t.proyecto,
          t.codigos_tarea?.descripcion || t.tarea || 'Sin descripción',
          new Date(t.fecha_vencimiento).toLocaleDateString(),
          t.horas
        ]),
        headStyles: { fillColor: accentColor },
        styles: { fontSize: 8 },
        columnStyles: { 2: { cellWidth: 60 } }
      });
    }

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(14);
    if(doc.lastAutoTable.finalY > 200) doc.addPage(); 
    doc.text("Estado de Presupuesto por Entregable", 14, doc.lastAutoTable.finalY + 12);
    
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 16,
      head: [['Proyecto', 'Entregable', 'Presupuesto', 'Consumido', '% Uso']],
      body: riesgoData.map(e => [
        e.proyecto,
        e.nombre,
        `${e.limite}h`,
        `${e.consumido}h`,
        `${Math.round(e.porcentaje)}%`
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: primaryColor },
      didParseCell: (data) => {
        if (data.column.index === 4 && parseInt(data.cell.raw) >= 100) {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    window.open(doc.output('bloburl'), '_blank');
  };
  
  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white">
      <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
      <p className="text-slate-500 font-bold animate-pulse tracking-widest uppercase">Generando Analítica Profesional...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F1F5F9] text-slate-800 p-4 lg:p-8 font-sans">
      <div className="max-w-[1500px] mx-auto space-y-8">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-center bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
          <div className="flex items-center gap-6">
            <div className="p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[1.5rem] shadow-lg shadow-indigo-200">
              <Activity className="text-white" size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight italic uppercase">
                Dashboard Ejecutivo <span className="text-indigo-600">/ {MONTHS[selectedMonth]}</span>
              </h1>
              <div className="flex gap-4 mt-1 text-slate-400 text-xs font-bold uppercase">
                <span className="flex items-center gap-1"><Calendar size={14}/> {new Date().getFullYear()}</span>
                <span className="text-emerald-500">● Sistema de Gestión Activo</span>
              </div>
            </div>
          </div>
          
          {/* Logo en el UI (derecha) */}
          <div className="flex items-center gap-4">
            <div className="flex gap-3">
                <button onClick={generatePDF} className="px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-xl transition-all font-bold flex items-center gap-3 active:scale-95">
                  <Download size={18} /> DESCARGAR INFORME
                </button>
                <button onClick={loadDashboard} className="px-8 py-4 bg-slate-900 hover:bg-black text-white rounded-2xl shadow-xl transition-all font-bold flex items-center gap-3 active:scale-95">
                  <RefreshCw size={18} /> REFRESCAR
                </button>
            </div>
          </div>
        </div>

        {/* SELECTOR MESES */}
        <div className="flex bg-white p-2 rounded-3xl shadow-sm border border-slate-200 overflow-x-auto gap-2 scrollbar-hide">
          {MONTHS.map((mes, index) => (
            <button key={mes} onClick={() => setSelectedMonth(index)}
              className={`px-6 py-2 rounded-2xl font-bold transition-all whitespace-nowrap ${selectedMonth === index ? "bg-indigo-600 text-white scale-105 shadow-md" : "text-slate-400 hover:bg-slate-100"}`}>
              {mes.substring(0, 3)}
            </button>
          ))}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
          <KPICard title="Horas Totales" value={stats.horasMes} icon={<Clock/>} color="indigo" />
          <KPICard title="Pendientes" value={stats.pendientes} icon={<RefreshCw/>} color="amber" />
          <KPICard title="Atrasadas" value={stats.atrasadas} icon={<AlertTriangle/>} color="fuchsia" alert={stats.atrasadas > 0} />
          <KPICard title="Entregables" value={stats.entregables} icon={<FileCheck/>} color="emerald" />
          <KPICard title="Usuarios" value={stats.usuarios} icon={<Users/>} color="blue" />
          <KPICard title="Exceso HH" value={stats.enRiesgo} icon={<Zap/>} color="rose" alert={stats.enRiesgo > 0} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-8">
            <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm relative overflow-hidden">
              <h3 className="text-xl font-black text-slate-800 uppercase italic mb-8">HH por Trabajador</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 'bold'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} />
                    <Tooltip contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 10px 15px rgba(0,0,0,0.1)'}} />
                    <Bar dataKey="value" radius={[10, 10, 10, 10]} barSize={45}>
                      {chartData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden relative">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-rose-50 rounded-full blur-3xl opacity-50" />
              <div className="flex justify-between items-end mb-10 relative">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-1 bg-rose-500 rounded-full" />
                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em]">Incidencias de Personal</p>
                  </div>
                  <h3 className="text-3xl font-black text-slate-900 italic uppercase tracking-tighter">Tareas Atrasadas</h3>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-black text-slate-900 leading-none">{tareasAtrasadasList.length}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Alertas</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tareasAtrasadasList.length === 0 ? (
                  <div className="col-span-full py-16 flex flex-col items-center justify-center bg-slate-50/50 rounded-[2.5rem] border-2 border-dashed border-slate-100">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 text-emerald-500">
                      <Trophy size={30} />
                    </div>
                    <p className="text-slate-500 font-bold italic text-sm">Operación al día</p>
                  </div>
                ) : (
                  tareasAtrasadasList.map((t, i) => {
                    const rawName = (t.nombre_trabajador || "Sin Nombre").trim().toLowerCase();
                    const colaboradorOficial = chartData.find(c => 
                      c.name.toLowerCase().includes(rawName) || rawName.includes(c.name.toLowerCase())
                    );
                    const nombreAMostrar = colaboradorOficial ? colaboradorOficial.name : t.nombre_trabajador;

                    return (
                      <div key={i} className="relative group transition-all duration-300">
                        <div className="h-full bg-white border border-slate-100 rounded-[2.2rem] p-6 shadow-sm group-hover:shadow-xl group-hover:shadow-rose-900/5 group-hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-rose-500" />
                          <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-black text-white shrink-0">
                                {nombreAMostrar.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-black text-slate-900 truncate leading-none">{nombreAMostrar}</p>
                                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-tighter mt-1">{t.proyecto}</p>
                              </div>
                            </div>
                            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                              <p className="text-[10px] font-black text-slate-400 uppercase mb-1">{t.codigos_tarea?.codigo || 'ID-EXT'}</p>
                              <p className="text-xs font-bold text-slate-600 leading-tight italic line-clamp-2">{t.codigos_tarea?.descripcion || 'Sin descripción técnica'}</p>
                            </div>
                            <div className="flex justify-between items-center mt-2">
                              <div className="flex items-center gap-1.5">
                                <Clock size={12} className="text-slate-400" />
                                <span className="text-[10px] font-black text-slate-500 uppercase">{t.horas} HH</span>
                              </div>
                              <div className="bg-rose-50 px-3 py-1 rounded-lg">
                                <p className="text-[10px] font-black text-rose-600 uppercase">
                                  {new Date(t.fecha_vencimiento).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3 italic uppercase shrink-0">
                <Zap className="text-rose-500" /> Monitoreo de Riesgo de Horas
              </h3>
              <div className="space-y-4 overflow-y-auto max-h-[500px] pr-2 scrollbar-hide">
                {riesgoData.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:bg-slate-100/50">
                    <div className="flex-1 min-w-0 pr-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase truncate">{item.proyecto}</p>
                      <p className="font-bold text-slate-700 truncate">{item.nombre}</p>
                    </div>
                    <div className="flex items-center gap-6 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-xs font-black text-slate-600">{item.consumido} / {item.limite} HH</p>
                        <div className="w-32 h-2 bg-slate-200 rounded-full mt-1 overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${item.porcentaje > 100 ? 'bg-rose-500' : 'bg-indigo-500'}`} 
                            style={{ width: `${Math.min(item.porcentaje, 100)}%` }} 
                          />
                        </div>
                      </div>
                      <span className={`text-xs font-black px-3 py-1 rounded-lg min-w-[55px] text-center ${item.porcentaje > 100 ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        {Math.round(item.porcentaje)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-8">
            <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
               <PieIcon size={120} className="absolute top-0 right-0 p-4 opacity-10" />
               <h3 className="text-lg font-bold mb-6 italic tracking-tighter">Distribución Revisión</h3>
               <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} innerRadius={60} outerRadius={85} paddingAngle={10} dataKey="value">
                      <Cell fill="#f43f5e" stroke="none" />
                      <Cell fill="#10b981" stroke="none" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="text-center p-4 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-[10px] font-bold text-rose-400 uppercase">Alertas</p>
                    <p className="text-xl font-black">{stats.pendientes}</p>
                  </div>
                  <div className="text-center p-4 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-[10px] font-bold text-emerald-400 uppercase">Listos</p>
                    <p className="text-xl font-black italic">CHECK</p>
                  </div>
              </div>
            </div>

            <div className="bg-slate-800 p-8 rounded-[3rem] text-white shadow-xl">
              <h3 className="text-xl font-black italic tracking-tighter uppercase mb-8">Colaboradores Activos</h3>
              <div className="flex flex-wrap gap-3">
                {chartData.map((user, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-sm font-medium">{user.name}</span>
                    <span className="text-xs font-black opacity-40">{user.value}h</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPICard({ title, value, icon, color, alert }) {
  const themes = {
    indigo: "from-indigo-500 to-indigo-600",
    amber: "from-amber-400 to-amber-600",
    emerald: "from-emerald-400 to-emerald-600",
    blue: "from-blue-500 to-blue-600",
    rose: "from-rose-500 to-rose-600",
    fuchsia: "from-fuchsia-500 to-fuchsia-600"
  };

  return (
    <div className={`bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm transition-all hover:shadow-lg ${alert ? 'ring-4 ring-rose-100' : ''}`}>
      <div className="flex flex-col items-center text-center">
        <div className={`bg-gradient-to-br ${themes[color]} text-white p-4 rounded-2xl mb-4 shadow-lg ${alert ? 'animate-pulse' : ''}`}>
          {icon}
        </div>
        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">{title}</p>
        <h4 className={`text-4xl font-black tracking-tighter ${alert ? 'text-rose-600' : 'text-slate-800'}`}>
          {value}
        </h4>
      </div>
    </div>
  );
}