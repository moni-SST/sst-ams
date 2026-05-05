import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI, usersAPI } from '../services/api';
import toast from 'react-hot-toast';
import { User, Lock, Save, Plus, Edit2, Trash2, X, Eye, EyeOff, Users, Shield, CheckCircle, XCircle } from 'lucide-react';

/* ── User Form Modal ── */
const EMPTY_FORM = { full_name: '', username: '', email: '', role: 'employee', department: '', phone: '', password: '', confirm: '' };

function UserModal({ user, onClose, onSaved }) {
  const isEdit = !!user;
  const [form, setForm] = useState(isEdit ? {
    ...EMPTY_FORM, ...user, password: '', confirm: ''
  } : EMPTY_FORM);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isEdit && !form.password) return toast.error('Password is required');
    if (form.password && form.password !== form.confirm) return toast.error('Passwords do not match');
    if (form.password && form.password.length < 6) return toast.error('Password must be at least 6 characters');
    setLoading(true);
    try {
      const payload = { full_name: form.full_name, email: form.email, role: form.role, department: form.department, phone: form.phone };
      if (!isEdit) { payload.username = form.username; payload.password = form.password; }
      if (isEdit && form.password) payload.new_password = form.password;
      const res = isEdit ? await usersAPI.update(user.id, payload) : await usersAPI.create(payload);
      toast.success(isEdit ? 'User updated' : 'User created');
      onSaved(res.data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save user');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-semibold text-gray-800">{isEdit ? 'Edit User' : 'Add New User'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Full Name *</label>
              <input className="input" required value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Enter full name" />
            </div>
            {!isEdit && (
              <div className="col-span-2">
                <label className="label">Username *</label>
                <input className="input" required value={form.username} onChange={e => set('username', e.target.value)} placeholder="Enter username" />
              </div>
            )}
            <div className="col-span-2">
              <label className="label">Email *</label>
              <input className="input" type="email" required value={form.email} onChange={e => set('email', e.target.value)} placeholder="Enter email" />
            </div>
            <div>
              <label className="label">Role *</label>
              <select className="input" value={form.role} onChange={e => set('role', e.target.value)}>
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="label">Department</label>
              <input className="input" value={form.department} onChange={e => set('department', e.target.value)} placeholder="e.g. Sales" />
            </div>
            <div className="col-span-2">
              <label className="label">{isEdit ? 'New Password (leave blank to keep)' : 'Password *'}</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  placeholder={isEdit ? 'Enter new password to change' : 'Enter password'}
                  required={!isEdit}
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            {form.password && (
              <div className="col-span-2">
                <label className="label">Confirm Password *</label>
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={showConfirm ? 'text' : 'password'}
                    value={form.confirm}
                    onChange={e => set('confirm', e.target.value)}
                    placeholder="Confirm password"
                    required
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {loading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Save size={15} />}
              {loading ? 'Saving...' : isEdit ? 'Update' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const ROLE_COLORS = {
  admin:    'bg-purple-100 text-purple-700',
  manager:  'bg-blue-100 text-blue-700',
  employee: 'bg-green-100 text-green-700',
};

export default function Profile() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Password change
  const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [pwdLoading, setPwdLoading] = useState(false);

  // Username change
  const [newUsername, setNewUsername] = useState('');
  const [unLoading, setUnLoading] = useState(false);

  // User management
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [modal, setModal] = useState(null); // null | { user: null } | { user: {...} }
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin]);

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await usersAPI.getAll();
      setUsers(res.data);
    } catch { toast.error('Failed to load users'); }
    finally { setUsersLoading(false); }
  };

  const handleChangeUsername = async (e) => {
    e.preventDefault();
    if (!newUsername.trim()) return toast.error('Enter a new username');
    setUnLoading(true);
    try {
      await authAPI.changeUsername({ new_username: newUsername.trim() });
      toast.success('Username changed! Please login again.');
      setNewUsername('');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setTimeout(() => window.location.href = '/login', 1500);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change username');
    } finally { setUnLoading(false); }
  };

  const handleChangePwd = async (e) => {
    e.preventDefault();
    if (pwdForm.new_password !== pwdForm.confirm) return toast.error('New passwords do not match');
    if (pwdForm.new_password.length < 6) return toast.error('Password must be at least 6 characters');
    setPwdLoading(true);
    try {
      await authAPI.changePassword({ current_password: pwdForm.current_password, new_password: pwdForm.new_password });
      toast.success('Password changed successfully');
      setPwdForm({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally { setPwdLoading(false); }
  };

  const handleSaved = (saved) => {
    setUsers(prev => {
      const idx = prev.findIndex(u => u.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
  };

  const handleDelete = async (u) => {
    try {
      await usersAPI.delete(u.id);
      setUsers(prev => prev.filter(x => x.id !== u.id));
      toast.success(`${u.full_name} deleted`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    } finally { setDeleteConfirm(null); }
  };

  const toggleActive = async (u) => {
    try {
      const res = await usersAPI.update(u.id, { is_active: u.is_active ? 0 : 1 });
      handleSaved(res.data);
      toast.success(res.data.is_active ? 'User activated' : 'User deactivated');
    } catch { toast.error('Failed to update status'); }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">My Profile</h2>

      {/* Profile Info */}
      <div className="card">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
            {user?.full_name?.[0]?.toUpperCase()}
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900">{user?.full_name}</h3>
            <p className="text-gray-500 capitalize">{user?.role}</p>
          </div>
        </div>
        <div className="space-y-3">
          {[
            { label: 'Username',   value: user?.username },
            { label: 'Email',      value: user?.email },
            { label: 'Role',       value: user?.role },
            { label: 'Department', value: user?.department || 'N/A' }
          ].map(item => (
            <div key={item.label} className="flex items-center py-2 border-b border-gray-50 last:border-0">
              <span className="w-28 text-sm text-gray-500">{item.label}</span>
              <span className="text-sm font-medium text-gray-800 capitalize">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Change Password */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Lock size={18} /> Change Password</h3>
        <form onSubmit={handleChangePwd} className="space-y-4">
          <div>
            <label className="label">Current Password</label>
            <input type="password" className="input" required value={pwdForm.current_password}
              onChange={e => setPwdForm(f => ({ ...f, current_password: e.target.value }))} />
          </div>
          <div>
            <label className="label">New Password</label>
            <input type="password" className="input" required value={pwdForm.new_password}
              onChange={e => setPwdForm(f => ({ ...f, new_password: e.target.value }))} />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input type="password" className="input" required value={pwdForm.confirm}
              onChange={e => setPwdForm(f => ({ ...f, confirm: e.target.value }))} />
          </div>
          <button type="submit" disabled={pwdLoading} className="btn-primary flex items-center gap-2">
            {pwdLoading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Save size={16} />}
            {pwdLoading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Change Username */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-1 flex items-center gap-2"><User size={18} /> Change Username</h3>
        <p className="text-xs text-gray-400 mb-4">Current username: <span className="font-semibold text-gray-600">@{user?.username}</span></p>
        <form onSubmit={handleChangeUsername} className="space-y-4">
          <div>
            <label className="label">New Username</label>
            <input type="text" className="input" placeholder="Enter new username" value={newUsername}
              onChange={e => setNewUsername(e.target.value)} />
          </div>
          <button type="submit" disabled={unLoading} className="btn-primary flex items-center gap-2">
            {unLoading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Save size={16} />}
            {unLoading ? 'Updating...' : 'Update Username'}
          </button>
        </form>
      </div>

      {/* User Management — Admin only */}
      {isAdmin && (
        <div className="card">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Users size={18} /> User Management</h3>
            <button onClick={() => setModal({ user: null })} className="btn-primary flex items-center gap-2 text-sm">
              <Plus size={15} /> Add User
            </button>
          </div>

          {usersLoading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
          ) : (
            <div className="space-y-2">
              {users.map(u => (
                <div key={u.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      u.role === 'admin' ? 'bg-purple-100 text-purple-700' : u.role === 'manager' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {u.full_name?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-800">{u.full_name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-600'}`}>
                          {u.role}
                        </span>
                        {!u.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600">Inactive</span>}
                      </div>
                      <p className="text-xs text-gray-400 truncate">{u.email} {u.department ? `· ${u.department}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button onClick={() => toggleActive(u)}
                      className={`p-1.5 rounded-lg transition-colors ${u.is_active ? 'hover:bg-red-50 text-green-500 hover:text-red-500' : 'hover:bg-green-50 text-red-400 hover:text-green-500'}`}
                      title={u.is_active ? 'Deactivate' : 'Activate'}>
                      {u.is_active ? <CheckCircle size={16} /> : <XCircle size={16} />}
                    </button>
                    <button onClick={() => setModal({ user: u })} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors" title="Edit">
                      <Edit2 size={15} />
                    </button>
                    {String(u.id) !== String(user?.id) && (
                      <button onClick={() => setDeleteConfirm(u)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {users.length === 0 && <p className="text-center text-gray-400 text-sm py-6">No users found</p>}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal && (
        <UserModal user={modal.user} onClose={() => setModal(null)} onSaved={handleSaved} />
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-500" />
            </div>
            <h3 className="font-semibold text-gray-800 mb-1">Delete User</h3>
            <p className="text-sm text-gray-500 mb-5">Are you sure you want to delete <strong>{deleteConfirm.full_name}</strong>? This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
