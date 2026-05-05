import React, { useEffect, useState } from 'react';
import { usersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Plus, User, CheckCircle, AlertTriangle, X, Edit2 } from 'lucide-react';

const ROLES = ['admin', 'manager', 'employee'];

export default function Team() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [performance, setPerformance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ username: '', email: '', password: '', new_password: '', role: 'employee', full_name: '', phone: '', department: '' });

  const load = async () => {
    try {
      const [usersRes, perfRes] = await Promise.all([
        usersAPI.getAll(),
        usersAPI.getPerformance()
      ]);
      setUsers(usersRes.data || []);
      setPerformance(perfRes.data || []);
    } catch { toast.error('Failed to load team'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const getPerfData = (userId) => performance.find(p => p.id === userId) || {};

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editUser) {
        await usersAPI.update(editUser.id, form);
        toast.success('User updated');
      } else {
        await usersAPI.create(form);
        toast.success('User created');
      }
      setShowForm(false);
      setEditUser(null);
      setForm({ username: '', email: '', password: '', new_password: '', role: 'employee', full_name: '', phone: '', department: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Action failed');
    }
  };

  const roleColor = (r) => ({
    admin: 'bg-purple-100 text-purple-700',
    manager: 'bg-blue-100 text-blue-700',
    employee: 'bg-gray-100 text-gray-600'
  }[r] || 'bg-gray-100');

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Team Management</h2>
          <p className="text-sm text-gray-500">{users.length} team members</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setShowForm(true); setEditUser(null); }} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Add User
          </button>
        )}
      </div>

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map(u => {
          const perf = getPerfData(u.id);
          return (
            <div key={u.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                    {u.full_name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{u.full_name}</p>
                    <p className="text-xs text-gray-500">@{u.username}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${roleColor(u.role)}`}>
                    {u.role}
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => {
                        setEditUser(u);
                        setForm({ username: u.username, email: u.email, password: '', new_password: '', role: u.role, full_name: u.full_name, phone: u.phone || '', department: u.department || '' });
                        setShowForm(true);
                      }}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <Edit2 size={14} className="text-gray-400" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1 text-sm text-gray-500 mb-3">
                <p>{u.email}</p>
                {u.department && <p>{u.department}</p>}
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-800">{perf.stages_completed || 0}</p>
                  <p className="text-xs text-gray-400">Completed</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-800">{perf.projects_assigned || 0}</p>
                  <p className="text-xs text-gray-400">Projects</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-red-500">{perf.stages_delayed || 0}</p>
                  <p className="text-xs text-gray-400">Delayed</p>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-xs text-gray-400">{u.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Performance Table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-800">Performance Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Member', 'Role', 'Dept', 'Projects', 'Stages Done', 'Delayed'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {performance.map(p => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium">{p.full_name}</td>
                  <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full capitalize ${roleColor(p.role)}`}>{p.role}</span></td>
                  <td className="px-4 py-2.5 text-gray-500">{p.department || '-'}</td>
                  <td className="px-4 py-2.5">{p.projects_assigned}</td>
                  <td className="px-4 py-2.5 text-green-600 font-medium">{p.stages_completed}</td>
                  <td className="px-4 py-2.5 text-red-500">{p.stages_delayed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-semibold">{editUser ? 'Edit User' : 'Add New User'}</h3>
              <button onClick={() => { setShowForm(false); setEditUser(null); }}><X size={20} className="text-gray-500" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3">
              <div>
                <label className="label">Username * <span className="text-blue-500 font-normal normal-case text-xs">(used for login)</span></label>
                <input type="text" className="input" required value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
              </div>
              <div>
                <label className="label">Full Name *</label>
                <input type="text" className="input" required value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Email *</label>
                <input type="email" className="input" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              {!editUser ? (
                <div>
                  <label className="label">Password *</label>
                  <input type="password" className="input" required value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                </div>
              ) : (
                <div>
                  <label className="label">New Password <span className="text-gray-400 font-normal">(leave blank to keep)</span></label>
                  <input type="password" className="input" value={form.new_password || ''} onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Role</label>
                  <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Department</label>
                  <input type="text" className="input" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Phone</label>
                <input type="text" className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              {editUser && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="is_active" checked={form.is_active !== false} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                  <label htmlFor="is_active" className="text-sm text-gray-700">Active</label>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowForm(false); setEditUser(null); }} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">{editUser ? 'Update' : 'Create'} User</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
