import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyticsAPI } from '../services/api';
import { Download, FileText, TrendingUp, ArrowUpRight, X, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

/* ─── Multi-Arc Radial Status Chart (pure SVG) ─── */
const STATUS_ARCS = [
  { key: 'active',    label: 'Active',    color: '#6d28d9', track: '#ede9fe' },
  { key: 'completed', label: 'Completed', color: '#10b981', track: '#d1fae5' },
  { key: 'delayed',   label: 'Delayed',   color: '#ef4444', track: '#fee2e2' },
  { key: 'on_hold',   label: 'On Hold',   color: '#f59e0b', track: '#fef3c7' },
];

const RadialChart = ({ counts, total }) => {
  const size   = 220;
  const cx     = size / 2;
  const cy     = size / 2;
  const baseR  = 42;
  const gap    = 18;
  const stroke = 13;

  return (
    <div className="flex items-center gap-6">
      {/* SVG */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          {STATUS_ARCS.map((s, i) => {
            const r     = baseR + i * gap;
            const circ  = 2 * Math.PI * r;
            const pct   = total > 0 ? (counts[s.key] || 0) / total : 0;
            const offset = circ - pct * circ;
            return (
              <g key={s.key}>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke={s.track} strokeWidth={stroke} />
                <circle
                  cx={cx} cy={cy} r={r} fill="none"
                  stroke={s.color} strokeWidth={stroke}
                  strokeDasharray={circ} strokeDashoffset={offset}
                  strokeLinecap="round"
                  style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 1.2s ease' }}
                />
              </g>
            );
          })}
          {/* Center */}
          <text x={cx} y={cy - 8}  textAnchor="middle" fontSize="30" fontWeight="800" fill="#111827">{total}</text>
          <text x={cx} y={cy + 10} textAnchor="middle" fontSize="10" fill="#9ca3af" fontWeight="500">Total Projects</text>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex-1 space-y-3.5">
        {STATUS_ARCS.map(s => {
          const count = counts[s.key] || 0;
          const pct   = total > 0 ? Math.round(count / total * 100) : 0;
          return (
            <div key={s.key}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="text-sm text-gray-600">{s.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-800">{count}</span>
                  <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                </div>
              </div>
              <div className="w-full rounded-full h-1.5" style={{ background: s.track }}>
                <div
                  className="h-1.5 rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: s.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const STAT_CARDS = [
  { key: 'total',     label: 'Total Projects', grad: 'from-blue-600 to-blue-400',     shadow: 'shadow-blue-200' },
  { key: 'active',    label: 'Running',         grad: 'from-violet-600 to-violet-400', shadow: 'shadow-violet-200' },
  { key: 'completed', label: 'Completed',       grad: 'from-emerald-500 to-green-400', shadow: 'shadow-green-200' },
  { key: 'delayed',   label: 'Delayed',         grad: 'from-rose-500 to-red-400',      shadow: 'shadow-red-200' },
];

const PRIORITY_META = {
  critical: { label: 'Critical', bar: 'bg-rose-500',   track: 'bg-rose-100' },
  high:     { label: 'High',     bar: 'bg-orange-500', track: 'bg-orange-100' },
  medium:   { label: 'Medium',   bar: 'bg-blue-500',   track: 'bg-blue-100' },
  low:      { label: 'Low',      bar: 'bg-green-500',  track: 'bg-green-100' },
};

/* ─── Priority Projects Modal ─── */
const PriorityModal = ({ priority, projects, navigate, onClose }) => {
  const meta = {
    critical: { label: 'Critical', bg: 'bg-rose-500',   light: 'bg-rose-50',   border: 'border-rose-200',   text: 'text-rose-700' },
    high:     { label: 'High',     bg: 'bg-orange-500', light: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
    medium:   { label: 'Medium',   bg: 'bg-blue-500',   light: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700' },
    low:      { label: 'Low',      bg: 'bg-green-500',  light: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700' },
  }[priority] || {};

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold text-white ${meta.bg}`}>
              {meta.label} Priority
            </span>
            <span className="text-sm text-gray-400">{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>
        {/* List */}
        <div className="px-4 py-3 space-y-2 max-h-80 overflow-y-auto">
          {projects.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-6">No projects</p>
          ) : projects.map(proj => (
            <div
              key={proj.id}
              onClick={() => { navigate(`/projects/${proj.id}`); onClose(); }}
              className={`flex items-center justify-between rounded-xl border ${meta.light} ${meta.border} px-3 py-2.5 cursor-pointer hover:brightness-95 transition-all`}
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-blue-600">{proj.project_number}</p>
                <p className="text-sm font-medium text-gray-800 truncate">{proj.customer_name}</p>
                <p className="text-xs text-gray-400 truncate">{proj.company_name}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <div className="text-right">
                  <p className="text-xs font-bold text-gray-700">{proj.progress_percentage}%</p>
                  <p className="text-xs text-gray-400">Stage {proj.current_stage}/19</p>
                </div>
                <ChevronRight size={14} className="text-gray-300" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default function Analytics() {
  const navigate = useNavigate();
  const [projData, setProjData] = useState(null);
  const [dashData, setDashData] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [priorityModal, setPriorityModal] = useState(null); // { priority, projects }

  useEffect(() => {
    Promise.all([
      analyticsAPI.getDashboard(),
      analyticsAPI.getProjects(),
      analyticsAPI.getPayments(),
    ]).then(([d, p]) => {
      setDashData(d.data);
      setProjData(p.data);
    }).catch(() => toast.error('Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  const handleExport = async (type) => {
    try {
      const res = type === 'excel' ? await analyticsAPI.exportExcel() : await analyticsAPI.exportPDF();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `projects_report.${type === 'excel' ? 'xlsx' : 'pdf'}`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    } catch { toast.error('Export failed'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  );

  const p        = dashData?.projects || {};
  const projects = projData?.project_list || [];
  const total    = projects.length || 0;

  // Status counts from projects list
  const statusCounts = {};
  projects.forEach(pr => { statusCounts[pr.status] = (statusCounts[pr.status] || 0) + 1; });

  // Priority counts
  const priorityCounts = ['critical','high','medium','low'].map(k => ({
    ...PRIORITY_META[k], key: k,
    count: projects.filter(pr => pr.priority === k).length,
    pct:   total > 0 ? Math.round(projects.filter(pr => pr.priority === k).length / total * 100) : 0,
  }));

  const topProjects = [...projects]
    .sort((a, b) => Number(b.progress_percentage) - Number(a.progress_percentage))
    .slice(0, 6);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Analytics & Reports</h2>
          <p className="text-sm text-gray-400">Real-time overview of all projects</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleExport('pdf')} className="btn-secondary flex items-center gap-2 text-sm">
            <FileText size={15} /> PDF
          </button>
          <button onClick={() => handleExport('excel')} className="btn-primary flex items-center gap-2 text-sm">
            <Download size={15} /> Excel
          </button>
        </div>
      </div>

      {/* Gradient Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map(c => (
          <div key={c.key} className={`bg-gradient-to-br ${c.grad} rounded-2xl p-5 shadow-lg ${c.shadow} text-white`}>
            <p className="text-sm font-medium opacity-80 mb-2">{c.label}</p>
            <p className="text-4xl font-extrabold tracking-tight">{p[c.key] || 0}</p>
            <div className="mt-3 flex items-center gap-1 opacity-70 text-xs font-medium">
              <TrendingUp size={12} /><span>Projects</span>
            </div>
          </div>
        ))}
      </div>

      {/* Two-panel row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* LEFT: Radial Status Chart */}
        <div className="card space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-gray-800 text-base">Project Status</h3>
              <p className="text-xs text-gray-400 mt-0.5">Distribution across all projects</p>
            </div>
            <span className="text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full font-medium">
              {total} projects
            </span>
          </div>

          <RadialChart counts={statusCounts} total={total} />

          {/* Priority strip — clickable */}
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5">Priority Breakdown</p>
            <div className="space-y-2">
              {priorityCounts.map(pc => (
                <div
                  key={pc.key}
                  onClick={() => setPriorityModal({ priority: pc.key, projects: projects.filter(pr => pr.priority === pc.key) })}
                  className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-gray-50 cursor-pointer transition-colors group"
                  title={`View ${pc.label} priority projects`}
                >
                  <span className="text-xs text-gray-500 w-14 shrink-0">{pc.label}</span>
                  <div className={`flex-1 rounded-full h-2 ${pc.track}`}>
                    <div className={`h-2 rounded-full transition-all duration-700 ${pc.bar}`} style={{ width: `${pc.pct}%` }} />
                  </div>
                  <span className="text-xs font-bold text-gray-700 w-5 text-right">{pc.count}</span>
                  <ChevronRight size={12} className="text-gray-300 group-hover:text-gray-500 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Top Projects */}
        <div className="card space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-gray-800 text-base">Top Projects</h3>
              <p className="text-xs text-gray-400 mt-0.5">Sorted by completion progress</p>
            </div>
          </div>
          <div className="space-y-1">
            {topProjects.map((proj, i) => {
              const pct = Number(proj.progress_percentage || 0);
              const barColor =
                pct === 100               ? 'bg-emerald-500' :
                proj.status === 'delayed' ? 'bg-rose-500'    :
                pct >= 50                 ? 'bg-blue-500'    : 'bg-violet-500';
              return (
                <div
                  key={proj.id}
                  onClick={() => navigate(`/projects/${proj.id}`)}
                  className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <span className="text-xs font-bold text-gray-300 w-4 shrink-0">#{i+1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-semibold text-blue-600 shrink-0">{proj.project_number}</span>
                        <span className="text-sm text-gray-700 truncate">{proj.customer_name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <span className="text-xs font-bold text-gray-700">{pct}%</span>
                        <ArrowUpRight size={12} className="text-gray-300 group-hover:text-blue-400 transition-colors" />
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div className={`h-1.5 rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {topProjects.length === 0 && <p className="text-gray-400 text-sm text-center py-10">No projects yet</p>}
          </div>
        </div>

      </div>

      {/* Priority Modal */}
      {priorityModal && (
        <PriorityModal
          priority={priorityModal.priority}
          projects={priorityModal.projects}
          navigate={navigate}
          onClose={() => setPriorityModal(null)}
        />
      )}
    </div>
  );
}
