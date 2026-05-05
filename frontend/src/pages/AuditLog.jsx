import React, { useEffect, useState, useCallback } from 'react';
import { auditAPI } from '../services/api';
import { format } from 'date-fns';
import { Shield, ChevronLeft, ChevronRight, X, Clock, User, Activity, Globe, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const ACTION_COLORS = {
  LOGIN: 'bg-green-100 text-green-700',
  LOGIN_FAILED: 'bg-red-100 text-red-700',
  PASSWORD_CHANGED: 'bg-yellow-100 text-yellow-700',
  PROJECT_CREATED: 'bg-blue-100 text-blue-700',
  STAGE_UPDATED: 'bg-purple-100 text-purple-700',
  DOCUMENT_UPLOADED: 'bg-cyan-100 text-cyan-700',
  PAYMENT_CREATED: 'bg-emerald-100 text-emerald-700',
  PAYMENT_UPDATED: 'bg-orange-100 text-orange-700',
};

export default function AuditLog() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [selected, setSelected] = useState(null);
  const [clearConfirm, setClearConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 50 };
      if (action) params.action = action;
      const res = await auditAPI.getAll(params);
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
    } catch { }
    finally { setLoading(false); }
  }, [page, action]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / 50);

  const handleClearAll = async () => {
    try {
      await auditAPI.clearAll();
      setLogs([]);
      setTotal(0);
      setClearConfirm(false);
      toast.success('All audit logs cleared');
    } catch { toast.error('Failed to clear logs'); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Audit Log</h2>
          <p className="text-sm text-gray-500">{total} total records</p>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === 'admin' && (
            <button onClick={() => setClearConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50 transition-colors">
              <Trash2 size={15} /> Clear All Logs
            </button>
          )}
          <Shield size={28} className="text-blue-600" />
        </div>
      </div>

      {/* Filters */}
      <div className="card py-4">
        <div className="flex gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Action:</label>
            <select className="input w-auto" value={action} onChange={e => { setAction(e.target.value); setPage(1); }}>
              <option value="">All Actions</option>
              {Object.keys(ACTION_COLORS).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Time', 'User', 'Action', 'Entity', 'IP Address'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" /></td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="py-12 text-center text-gray-400">No audit logs found</td></tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id}
                    onClick={() => setSelected(log)}
                    className="border-b last:border-0 hover:bg-blue-50 cursor-pointer transition-colors">
                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                      {log.created_at ? format(new Date(log.created_at.replace(' ', 'T') + 'Z'), 'dd MMM yyyy, HH:mm:ss') : '-'}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-800">{log.full_name || 'System'}</p>
                      <p className="text-xs text-gray-400">@{log.username}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs capitalize">
                      {log.entity_type} {log.entity_id ? `#${log.entity_id}` : ''}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{log.ip_address || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary py-1.5 px-3">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-secondary py-1.5 px-3">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
      {/* Clear All Confirm */}
      {clearConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-500" />
            </div>
            <h3 className="font-semibold text-gray-800 mb-1">Clear All Logs</h3>
            <p className="text-sm text-gray-500 mb-5">All {total} audit log records will be permanently deleted. This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setClearConfirm(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleClearAll}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors">
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${ACTION_COLORS[selected.action] || 'bg-gray-100 text-gray-600'}`}>
                  {selected.action}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-2">
                  <Clock size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">Time</p>
                    <p className="text-sm font-medium text-gray-800">
                      {selected.created_at ? format(new Date(selected.created_at.replace(' ', 'T') + 'Z'), 'dd MMM yyyy, HH:mm:ss') : '-'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <User size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">User</p>
                    <p className="text-sm font-medium text-gray-800">{selected.full_name || 'System'}</p>
                    <p className="text-xs text-gray-400">@{selected.username}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Activity size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">Entity</p>
                    <p className="text-sm font-medium text-gray-800 capitalize">
                      {selected.entity_type} {selected.entity_id ? `#${selected.entity_id}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Globe size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">IP Address</p>
                    <p className="text-sm font-medium text-gray-800">{selected.ip_address || '-'}</p>
                  </div>
                </div>
              </div>

              {selected.new_values && (() => {
                try {
                  const parsed = JSON.parse(selected.new_values);
                  return (
                    <div>
                      <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Details</p>
                      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2">
                        {Object.entries(parsed).map(([k, v]) => (
                          <div key={k} className="flex items-start justify-between gap-4">
                            <span className="text-xs text-gray-400 capitalize shrink-0">{k.replace(/_/g, ' ')}</span>
                            <span className="text-sm font-medium text-gray-800 text-right">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                } catch { return null; }
              })()}
            </div>

            {/* Footer */}
            <div className="px-6 pb-5">
              <button onClick={() => setSelected(null)}
                className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
