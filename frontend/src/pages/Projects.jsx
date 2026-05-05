import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsAPI, analyticsAPI } from '../services/api';
import { Plus, Search, Filter, FolderOpen, ChevronLeft, ChevronRight, FileText, Download, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';

const STATUS_OPTS = ['all', 'active', 'completed', 'delayed', 'on_hold', 'cancelled'];

export default function Projects() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [projects, setProjects] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (search) params.search = search;
      if (status !== 'all') params.status = status;
      const res = await projectsAPI.getAll(params);
      setProjects(res.data.projects || []);
      setTotal(res.data.total || 0);
      setPages(res.data.pages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

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

  const handleDelete = async (proj) => {
    try {
      await projectsAPI.delete(proj.id);
      setProjects(prev => prev.filter(p => p.id !== proj.id));
      setTotal(t => t - 1);
      setDeleteConfirm(null);
      toast.success(`${proj.project_number} deleted`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const priorityColor = (p) => ({
    low: 'text-gray-500', medium: 'text-yellow-600',
    high: 'text-orange-600', critical: 'text-red-600'
  }[p] || 'text-gray-500');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Projects</h2>
          <p className="text-sm text-gray-500">{total} total projects</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button onClick={() => handleExport('pdf')} className="btn-secondary flex items-center gap-2 text-sm">
            <FileText size={15} /> PDF
          </button>
          <button onClick={() => handleExport('excel')} className="btn-secondary flex items-center gap-2 text-sm">
            <Download size={15} /> Excel
          </button>
          <button onClick={() => navigate('/projects/new')} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> New Project
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card py-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="input pl-9"
              placeholder="Search by project no., customer, company..."
              value={search}
              onChange={handleSearch}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <select
              className="input w-auto"
              value={status}
              onChange={e => { setStatus(e.target.value); setPage(1); }}
            >
              {STATUS_OPTS.map(s => (
                <option key={s} value={s}>{s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Project No.', 'Customer', 'Company', 'Type', 'Stage', 'Progress', 'Status', 'Priority', 'Created', ...(isAdmin ? [''] : [])].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-16 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" /></td></tr>
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center">
                    <FolderOpen size={40} className="text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">No projects found</p>
                    <button onClick={() => navigate('/projects/new')} className="mt-3 text-blue-600 text-sm hover:underline">Create your first project</button>
                  </td>
                </tr>
              ) : (
                projects.map(p => (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className="border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-blue-700">{p.project_number}</td>
                    <td className="px-4 py-3 text-gray-800">{p.customer_name}</td>
                    <td className="px-4 py-3 text-gray-600">{p.company_name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${p.customer_type === 'New' ? 'text-green-600' : 'text-blue-600'}`}>
                        {p.customer_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.current_stage}/19</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-1.5">
                          <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${p.progress_percentage}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{p.progress_percentage}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge-${p.status === 'active' ? 'active' : p.status === 'completed' ? 'completed' : p.status === 'delayed' ? 'delayed' : 'pending'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-xs font-medium capitalize ${priorityColor(p.priority)}`}>{p.priority}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{p.created_at ? format(new Date(p.created_at), 'dd MMM yyyy') : '-'}</td>
                    {isAdmin && (
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setDeleteConfirm(p)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                          title="Delete project"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary py-1.5 px-3">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="btn-secondary py-1.5 px-3">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-500" />
            </div>
            <h3 className="font-semibold text-gray-800 mb-1">Delete Project</h3>
            <p className="text-sm text-gray-500 mb-1">
              Are you sure you want to delete <strong>{deleteConfirm.project_number}</strong>?
            </p>
            <p className="text-xs text-gray-400 mb-5">
              {deleteConfirm.customer_name} · {deleteConfirm.company_name}
            </p>
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-5">
              This will permanently delete the project and all its data.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
