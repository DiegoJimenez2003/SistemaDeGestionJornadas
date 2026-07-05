import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import DuocLogo from "../assets/logoduoc.png";
import { 
  Users, Clock, 
  RefreshCw, Zap, Activity, AlertTriangle, Download, Trophy, Calendar, PieChart as PieIcon
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
  const añoActual = new Date().getFullYear();

  const [stats, setStats] = useState({ 
    usuarios: 0, pendientes: 0, horasMes: 0, entregables: 0, enRiesgo: 0, atrasadas: 0,
    horasIncidentes: 0,
    indiceBurnoutGeneral: 0,
    desviacionPlazosPromedio: 0
  });
  const [chartData, setChartData] = useState([]);
  const [pieData, setPieData] = useState([]);
  const [riesgoData, setRiesgoData] = useState([]);
  const [tareasAtrasadasList, setTareasAtrasadasList] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth()); 

  const [proyectosActivos, setProyectosActivos] = useState([]);

  useEffect(() => { loadDashboard(); }, [selectedMonth]); 

  async function loadDashboard() {
    try {
      setLoading(true);
      
      const [tareasRes, codigosRes, entregablesRes, perfilesRes, proyectosRes, eventosRes] = await Promise.all([
        supabase.from("tareas").select("*"),
        supabase.from("codigos_tarea").select("*"),
        supabase.from("entregables").select("*"),
        supabase.from("perfiles").select("*"),
        supabase.from("proyectos").select("*"),
        supabase.from("eventos_jornada").select("*")
      ]);

      const rawTareas = tareasRes.data || [];
      const safeCodigos = codigosRes.data || [];
      const allEntregables = entregablesRes.data || [];
      const safePerfiles = perfilesRes.data || [];
      const allProyectos = proyectosRes.data || [];
      const allEventos = eventosRes.data || [];
      
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      const allTareas = rawTareas.map(t => {
        const codigoRelacionado = safeCodigos.find(c => Number(c.id) === Number(t.codigo_id));
        const perfilRelacionado = safePerfiles.find(p => 
          String(p.user_id || p.id || '').toLowerCase() === String(t.usuario_id || '').toLowerCase()
        );
        
        let nombreConstruido = "";
        if (perfilRelacionado) {
          const nombre = perfilRelacionado.nombre || "";
          const apellido = perfilRelacionado.apellido || "";
          nombreConstruido = `${nombre} ${apellido}`.trim();
        }
        
        if (!nombreConstruido) {
          if (t.nombre_trabajador && !t.nombre_trabajador.includes("-")) {
            nombreConstruido = t.nombre_trabajador.trim();
          } else if (t.usuario_id) {
            nombreConstruido = `Usuario (${String(t.usuario_id).substring(0, 6)})`;
          } else {
            nombreConstruido = "Colaborador General";
          }
        }

        let proyectoPadre = allProyectos.find(p => p.id === t.proyecto_id);
        if (!proyectoPadre && codigoRelacionado) {
          proyectoPadre = allProyectos.find(p => p.id === codigoRelacionado.proyecto_id || p.nombre === codigoRelacionado.proyecto);
        }

        return {
          ...t,
          codigos_tarea: codigoRelacionado ? {
            codigo: codigoRelacionado.codigo,
            descripcion: codigoRelacionado.descripcion,
            entregable_id: codigoRelacionado.entregable_id
          } : null,
          trabajador_final: nombreConstruido,
          proyecto_entidad: proyectoPadre || null,
          proyecto_nombre_final: proyectoPadre ? proyectoPadre.nombre : (t.proyecto || "Sin Proyecto Asignado")
        };
      });

      const tareasMes = allTareas.filter(t => {
        const fechaTarea = new Date(t.fecha || t.created_at);
        return fechaTarea.getMonth() === selectedMonth && fechaTarea.getFullYear() === añoActual;
      });

      const nombresBrutos = [...new Set(tareasMes.map(t => t.trabajador_final))];
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
        colaboradorOficial: mapaNombresOficiales[t.trabajador_final]
      }));

      const statsPorUsuario = {};
      tareasNormalizadas.forEach(t => {
        const oficial = t.colaboradorOficial;
        statsPorUsuario[oficial] = (statsPorUsuario[oficial] || 0) + (Number(t.horas) || 0);
      });

      const formattedChartData = Object.keys(statsPorUsuario)
        .map(k => {
          const hhCargadas = statsPorUsuario[k];
          const factorBurnout = Math.min(Math.round((hhCargadas / 160) * 100), 150);
          return { 
            name: k, 
            value: Number(hhCargadas.toFixed(2)),
            burnout: factorBurnout
          };
        })
        .sort((a, b) => b.value - a.value);

      setChartData(formattedChartData);

      const proyMap = {};
      tareasNormalizadas.forEach(t => {
        const proyecto = t.proyecto_nombre_final;
        const oficial = t.colaboradorOficial;
        const key = `${proyecto}---${oficial}`; 
        if (!proyMap[key]) {
          proyMap[key] = { 
            proyecto, 
            colaborador: oficial, 
            hours: 0,
            proyectoEntidad: t.proyecto_entidad
          };
        }
        proyMap[key].hours += (Number(t.horas) || 0);
      });

      const listaProyectosFinal = Object.values(proyMap).map(item => {
        let diasDesviacion = 0;
        let estadoCronograma = "En Fecha";
        
        if (item.proyectoEntidad && item.proyectoEntidad.fecha_fin_planificada) {
          const finPlanificado = new Date(item.proyectoEntidad.fecha_fin_planificada);
          const finReal = item.proyectoEntidad.fecha_fin_real ? new Date(item.proyectoEntidad.fecha_fin_real) : hoy;
          
          if (finReal > finPlanificado && item.proyectoEntidad.porcentaje_avance < 100) {
            const diffTime = Math.abs(finReal - finPlanificado);
            diasDesviacion = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            estadoCronograma = `Retraso de ${diasDesviacion} días`;
          }
        }

        return {
          proyecto: item.proyecto,
          colaborador: item.colaborador,
          horas: Number(item.hours.toFixed(2)),
          desviacionDias: diasDesviacion,
          estadoCronograma
        };
      }).sort((a, b) => b.horas - a.horas);

      setProyectosActivos(listaProyectosFinal);

      const atrasadas = tareasNormalizadas.filter(t => {
        if (!t.fecha_vencimiento) return false;
        const vencimiento = new Date(t.fecha_vencimiento);
        vencimiento.setHours(0, 0, 0, 0);
        return vencimiento < hoy && t.revision_id !== "aprobada" && t.estado_id !== "completada";
      });
      setTareasAtrasadasList(atrasadas);

      const saludEntregables = allEntregables.map(ent => {
        const horasConsumidas = tareasNormalizadas
          .filter(t => 
            t.codigos_tarea?.entregable_id === ent.id || 
            t.entregable?.trim().toLowerCase() === ent.nombre?.trim().toLowerCase()
          )
          .reduce((acc, curr) => acc + (Number(curr.horas) || 0), 0);
        
        return {
          nombre: ent.nombre,
          proyecto: allProyectos.find(p => p.id === ent.proyecto_id)?.nombre || "Operación Interna",
          limite: Number(ent.horas_presupuestadas || 0),
          consumido: horasConsumidas,
          percentage: ent.horas_presupuestadas > 0 ? (horasConsumidas / ent.horas_presupuestadas) * 100 : 0
        };
      });
      
      const riesgoFormateado = saludEntregables.map(e => ({ ...e, porcentaje: e.percentage })).sort((a, b) => b.porcentaje - a.porcentaje);
      setRiesgoData(riesgoFormateado);

      const QA_eventosMes = allEventos.filter(ev => {
        const fechaEv = new Date(ev.fecha);
        return fechaEv.getMonth() === selectedMonth && fechaEv.getFullYear() === añoActual;
      });
      const totalHorasIncidentes = QA_eventosMes.reduce((acc, curr) => acc + (Number(curr.horas_afectadas) || 0), 0);

      const pendientes = tareasNormalizadas.filter(t => t.revision_id === "pendiente" || t.revision_id === "sin_revisar" || !t.revision_id).length;
      const totalHoras = tareasNormalizadas.reduce((acc, t) => acc + (Number(t.horas) || 0), 0);
      
      const proyectosConRetraso = listaProyectosFinal.filter(p => p.desviacionDias > 0);
      const avgDesviacion = proyectosConRetraso.length > 0
        ? Math.round(proyectosConRetraso.reduce((acc, curr) => acc + curr.desviacionDias, 0) / proyectosConRetraso.length)
        : 0;

      const avgBurnout = formattedChartData.length > 0
        ? Math.round(formattedChartData.reduce((acc, curr) => acc + curr.burnout, 0) / formattedChartData.length)
        : 0;

      setStats({
        usuarios: formattedChartData.length,
        pendientes,
        horasMes: Number(totalHoras.toFixed(2)),
        entregables: allEntregables.length,
        enRiesgo: riesgoFormateado.filter(e => e.porcentaje >= 100).length,
        atrasadas: atrasadas.length,
        horasIncidentes: Number(totalHorasIncidentes.toFixed(2)),
        indiceBurnoutGeneral: avgBurnout,
        desviacionPlazosPromedio: avgDesviacion
      });

      const aprobadasCount = tareasNormalizadas.filter(t => t.revision_id === 'aprobada' || t.estado_id === 'completada').length;
      setPieData([
        { name: 'Pendientes/Riesgo', value: pendientes + atrasadas.length },
        { name: 'Aprobados/Completos', value: aprobadasCount || 1 }
      ]);

    } catch (error) {
      console.error("Error crítico cargando la analítica corporativa:", error);
    } finally { 
      setLoading(false); 
    }
  }

  // 📄 GENERACIÓN DE PDF COMPLETA, DINÁMICA Y CON EXPLICACIONES DE NEGOCIO (CORREGIDA)
  const generatePDF = () => {
    const doc = new jsPDF();
    const primaryColor = [99, 102, 241]; 
    const accentColor = [244, 63, 94];  
    
    // Encabezado Corporativo elegante
    doc.setFillColor(238, 242, 255); 
    doc.rect(0, 0, 210, 40, 'F');

    doc.setTextColor(49, 46, 129);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("REPORTE DE CONTROL DE GESTIÓN OPERACIONAL", 14, 22);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`PERIODO EVALUADO: ${MONTHS[selectedMonth].toUpperCase()} ${añoActual}`, 14, 30);
    doc.text(`FECHA DE EMISIÓN: ${new Date().toLocaleString()}`, 14, 35);

    if (DuocLogo) {
      try {
        doc.addImage(DuocLogo, 'PNG', 160, 10, 40, 0, undefined, 'FAST');
      } catch (error) {
        console.warn("Logo omitido.");
      }
    }

    // 🌟 MOTOR DE RECOMENDACIONES DINÁMICAS (CORREGIDA VARIABLE RECOMENDACION)
    let diagnostico = "";
    let recomendacion = "";

    if (stats.atrasadas === 0 && stats.indiceBurnoutGeneral <= 85 && stats.horasIncidentes === 0) {
      diagnostico = "La operación se despliega bajo condiciones de rendimiento óptimo y estabilidad total de cronograma.";
      recomendacion = "Se valida el flujo actual de entregas. Se sugiere mantener el esquema de asignación vigente y registrar el presente ciclo operativo como línea base referencial de eficiencia para futuros proyectos.";
    } else {
      diagnostico = `Se identifican desviaciones operacionales localizadas: existen ${stats.atrasadas} tareas fuera de plazo contractual, pérdidas de productividad asociadas a incidencias técnicas (${stats.horasIncidentes} HH) y un índice de sobrecarga del equipo situado en un ${stats.indiceBurnoutGeneral}%.`;
      recomendacion = "Se recomienda activar planes de contingencia sobre las tareas vencidas, balancear de manera proactiva las cargas del personal sobreexigido y auditar los cuellos de botella técnicos para mitigar la fuga de HH operacionales.";
    }

    const planTexto = `DIAGNÓSTICO: ${diagnostico}\n\nPLAN DE ACCIÓN SUGERIDO: ${recomendacion}`;

    // Contenedor del Resumen Ejecutivo de Gobernanza
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240); 
    doc.rect(14, 46, 182, 38, 'FD');
    
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("RESUMEN EJECUTIVO DE GOBERNANZA", 18, 52);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const splitPlan = doc.splitTextToSize(planTexto, 174);
    doc.text(splitPlan, 18, 58);

    // Tabla de KPIs Principales
    autoTable(doc, {
      startY: 88,
      head: [['Dimensión Operativa', 'Métrica', 'Estado']],
      body: [
        ['Inversión de Esfuerzo Acumulado', `${stats.horasMes} HH`, 'Horas totales registradas'],
        ['Desviación de Plazos Promedio', `${stats.desviacionPlazosPromedio} Días`, stats.desviacionPlazosPromedio > 5 ? 'Atención Requerida' : 'Bajo Control'],
        ['Índice de Carga del Equipo (Burnout)', `${stats.indiceBurnoutGeneral}%`, stats.indiceBurnoutGeneral > 85 ? 'Sobrecarga Activa' : 'Normalidad Nominal'],
        ['Tiempo Muerto por Incidencias', `${stats.horasIncidentes} HH`, stats.horasIncidentes > 10 ? 'Impacto Moderado' : 'Impacto Bajo'],
        ['Entregables Sobre Presupuesto', stats.enRiesgo, stats.enRiesgo > 0 ? 'Desviación en Costos' : 'Óptimo']
      ],
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 4 }
    });

    // 🌟 SECCIÓN EXPLICATIVA DE MÉTRICAS CORPORATIVAS
    let yMetricas = doc.lastAutoTable.finalY + 8;
    doc.setFillColor(241, 245, 249);
    doc.rect(14, yMetricas, 182, 30, 'F');
    
    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("GUÍA RÁPIDA DE INDICADORES PARA LA TOMA DE DECISIONES:", 18, yMetricas + 5);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const descMetricas = 
      "• Desviación Plazos: Días promedio de retraso comparando la entrega planificada versus el avance real. Permite anticipar multas.\n" +
      "• Incidentes (HH): Horas laborables perdidas por problemas técnicos o bloqueos del entorno. Mide la fuga de dinero/tiempo.\n" +
      "• Burnout Promedio: Nivel de saturación del equipo basado en una jornada base de 160 horas al mes. Evita la rotación de personal.";
    
    const splitDesc = doc.splitTextToSize(descMetricas, 174);
    doc.text(splitDesc, 18, yMetricas + 11);

    // Distribución por colaborador
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Distribución de Carga por Colaborador", 14, yMetricas + 44);
    
    autoTable(doc, {
      startY: yMetricas + 48,
      head: [['Colaborador', 'Horas Reportadas', 'Carga Relativa (%)', 'Estado Operativo']],
      body: chartData.map(u => [
        u.name, 
        `${u.value} h`, 
        `${u.burnout}%`,
        u.burnout > 100 ? 'Riesgo de Saturación' : 'Rendimiento Balanceado'
      ]),
      headStyles: { fillColor: [71, 85, 105] },
      alternateRowStyles: { fillGray: 250 },
      styles: { fontSize: 9 }
    });

    doc.setFont("helvetica", "bold");
    doc.text("Cronograma e Hitos de Proyectos", 14, doc.lastAutoTable.finalY + 12);

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 16,
      head: [['Proyecto', 'Colaborador Asignado', 'Esfuerzo Ejecutado', 'Estatus de Cronograma']],
      body: proyectosActivos.map(p => [
        p.proyecto,
        p.colaborador,
        `${p.horas} h`,
        p.estadoCronograma
      ]),
      headStyles: { fillColor: [63, 63, 70] },
      styles: { fontSize: 9 },
      alternateRowStyles: { fillGray: 245 }
    });

    // Control de Incumplimientos
    if (tareasAtrasadasList.length > 0) {
      doc.addPage();
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("ALERTAS OPERATIVAS: DETALLE DE TAREAS EXPIRADAS", 14, 20);
      
      autoTable(doc, {
        startY: 25,
        head: [['Colaborador', 'Proyecto', 'Descripción de la Tarea', 'Vencimiento', 'Horas']],
        body: tareasAtrasadasList.map(t => [
          t.trabajador_final,
          t.proyecto_nombre_final,
          t.codigos_tarea?.descripcion || t.descripcion || 'Sin especificar',
          new Date(t.fecha_vencimiento).toLocaleDateString(),
          `${t.horas}h`
        ]),
        headStyles: { fillColor: accentColor },
        styles: { fontSize: 8.5 },
        columnStyles: { 2: { cellWidth: 65 } }
      });
    }

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    if(doc.lastAutoTable.finalY > 160) doc.addPage(); 
    doc.text("Salud Presupuestaria de Entregables (HH)", 14, doc.lastAutoTable.finalY + 12);
    
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 16,
      head: [['Proyecto', 'Entregable Evaluado', 'Presupuesto Base', 'Esfuerzo Real', 'Consumo (%)']],
      body: riesgoData.map(e => [
        e.proyecto,
        e.nombre,
        `${e.limite} HH`,
        `${e.consumido} HH`,
        `${Math.round(e.porcentaje)}%`
      ]),
      styles: { fontSize: 8.5 },
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
      <p className="text-slate-500 font-bold animate-pulse tracking-widest uppercase text-xs">Cargando Motores Algorítmicos e Inteligencia de Negocio...</p>
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
                <span className="flex items-center gap-1"><Calendar size={14}/> Anual {añoActual}</span>
                <span className="text-emerald-500">● Motor Analítico Duoc V2 Activo</span>
              </div>
            </div>
          </div>
          
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
          <KPICard title="Desviación Plazos" value={`${stats.desviacionPlazosPromedio}d`} icon={<Calendar/>} color="amber" alert={stats.desviacionPlazosPromedio > 5} />
          <KPICard title="Atrasadas" value={stats.atrasadas} icon={<AlertTriangle/>} color="fuchsia" alert={stats.atrasadas > 0} />
          <KPICard title="Incidentes (HH)" value={`${stats.horasIncidentes}h`} icon={<Zap/>} color="rose" alert={stats.horasIncidentes > 10} />
          <KPICard title="Usuarios Activos" value={stats.usuarios} icon={<Users/>} color="blue" />
          <KPICard title="Burnout Promedio" value={`${stats.indiceBurnoutGeneral}%`} icon={<PieIcon/>} color="emerald" alert={stats.indiceBurnoutGeneral > 90} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-8">
            
            {/* CORREGIDO: aspect={2} asegura un cálculo matemático exacto para evitar el error de width(-1) */}
            <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm relative overflow-hidden">
              <h3 className="text-xl font-black text-slate-800 uppercase italic mb-8">HH por Trabajador e Índice de Desgaste</h3>
              <div className="w-full">
                <ResponsiveContainer width="100%" aspect={2}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 'bold'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} />
                    <Tooltip 
                      contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 10px 15px rgba(0,0,0,0.1)'}} 
                      formatter={(value, name) => name === "value" ? [`${value} Horas`, "Carga Reportada"] : [`${value}%`, "Riesgo Integridad"]}
                    />
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
                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em]">Incidencias Críticas de SLA</p>
                  </div>
                  <h3 className="text-3xl font-black text-slate-900 italic uppercase tracking-tighter">Tareas Atrasadas</h3>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-black text-slate-900 leading-none">{tareasAtrasadasList.length}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Alertas Expiradas</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tareasAtrasadasList.length === 0 ? (
                  <div className="col-span-full py-16 flex flex-col items-center justify-center bg-slate-50/50 rounded-[2.5rem] border-2 border-dashed border-slate-100">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 text-emerald-500">
                      <Trophy size={30} />
                    </div>
                    <p className="text-slate-500 font-bold italic text-sm">Operación Óptima - Sin retrasos</p>
                  </div>
                ) : (
                  tareasAtrasadasList.map((t, i) => {
                    const nombreAMostrar = t.colaboradorOficial || t.trabajador_final;

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
                                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-tighter mt-1 truncate">{t.proyecto_nombre_final}</p>
                              </div>
                            </div>
                            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                              <p className="text-[10px] font-black text-slate-400 uppercase mb-1">{t.codigos_tarea?.codigo || 'T-EXP'}</p>
                              <p className="text-xs font-bold text-slate-600 leading-tight italic line-clamp-2">{t.codigos_tarea?.descripcion || t.descripcion || 'Sin descripción técnica'}</p>
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

            <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden relative flex flex-col">
              <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3 italic uppercase shrink-0">
                <Zap className="text-rose-500" /> Control Presupuestario de Entregables
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

          {/* CORREGIDO: aspect en el gráfico de torta para blindar contra errores dimensionales */}
          <div className="lg:col-span-4 space-y-8">
            <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
               <PieIcon size={120} className="absolute top-0 right-0 p-4 opacity-10" />
               <h3 className="text-lg font-bold mb-6 italic tracking-tighter">Eficiencia del Backlog</h3>
               <div className="w-full">
                <ResponsiveContainer width="100%" aspect={1.2}>
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
                    <p className="text-[10px] font-bold text-rose-400 uppercase">Bloqueadas / Pendientes</p>
                    <p className="text-xl font-black">{stats.pendientes + stats.atrasadas}</p>
                  </div>
                  <div className="text-center p-4 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-[10px] font-bold text-emerald-400 uppercase">Garantía SLA</p>
                    <p className="text-xl font-black italic">OPTIMAL</p>
                  </div>
              </div>
            </div>

            <div className="bg-slate-800 p-8 rounded-[3rem] text-white shadow-xl">
              <h3 className="text-xl font-black italic tracking-tighter uppercase mb-8">Estatus de Colaboradores</h3>
              <div className="flex flex-col gap-3">
                {chartData.map((user, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/5 border border-white/10 px-4 py-3 rounded-2xl">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${user.burnout > 100 ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'}`} />
                      <span className="text-sm font-medium truncate">{user.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-black opacity-60">{user.value}h</span>
                      <span className={`text-xs font-black ${user.burnout > 100 ? 'text-rose-400' : 'text-indigo-300'}`}>{user.burnout}%</span>
                    </div>
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
        <div className={`bg-gradient-to-br ${themes[color]} text-white p-4 rounded-2xl mb-4 shadow-lg ${alert ? 'animate-bounce' : ''}`}>
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