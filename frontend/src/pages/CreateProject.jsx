import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsAPI, usersAPI } from '../services/api';
import toast from 'react-hot-toast';
import { ArrowLeft, Save } from 'lucide-react';

export default function CreateProject() {
  const navigate = useNavigate();
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    project_name: '',
    customer_name: '',
    company_name: '',
    communication_type: 'Mail',
    customer_type: 'New',
    reference: '',
    description: '',
    priority: 'medium',
    assigned_manager: '',
    total_value: '',
    expected_end_date: ''
  });

  useEffect(() => {
    usersAPI.getAll().then(res => {
      setManagers(res.data.filter(u => u.role === 'manager' || u.role === 'admin'));
    }).catch(() => {});
  }, []);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.customer_name.trim() || !form.company_name.trim()) {
      toast.error('Customer name and company name are required');
      return;
    }
    setLoading(true);
    try {
      const res = await projectsAPI.create({
        ...form,
        assigned_manager: form.assigned_manager || null,
        total_value: form.total_value || null,
        expected_end_date: form.expected_end_date || null
      });
      toast.success(`Project ${res.data.project_number} created successfully!`);
      navigate(`/projects/${res.data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/projects')} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">New Project</h2>
          <p className="text-sm text-gray-500">Create a new project and start the workflow</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5">
        <div>
          <label className="label">Project Name</label>
          <input
            type="text" className="input"
            placeholder="e.g. Conveyor Belt Design"
            value={form.project_name}
            onChange={e => set('project_name', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Customer Name *</label>
            <input
              type="text" className="input"
              placeholder="John Doe"
              value={form.customer_name}
              onChange={e => set('customer_name', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Company Name *</label>
            <input
              type="text" className="input"
              placeholder="ABC Corporation"
              value={form.company_name}
              onChange={e => set('company_name', e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Communication Type</label>
            <select className="input" value={form.communication_type} onChange={e => set('communication_type', e.target.value)}>
              <option value="Call">Call</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Mail">Mail</option>
            </select>
          </div>
          <div>
            <label className="label">Customer Type</label>
            <select className="input" value={form.customer_type} onChange={e => set('customer_type', e.target.value)}>
              <option value="New">New Customer</option>
              <option value="Existing">Existing Customer</option>
            </select>
          </div>
        </div>

        {form.customer_type === 'New' && (
          <div>
            <label className="label">Reference (if applicable)</label>
            <input
              type="text" className="input"
              placeholder="Referred by..."
              value={form.reference}
              onChange={e => set('reference', e.target.value)}
            />
          </div>
        )}

        <div>
          <label className="label">Priority</label>
          <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Total Project Value (₹)</label>
            <input
              type="number" className="input"
              placeholder="0.00"
              value={form.total_value}
              onChange={e => set('total_value', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Expected End Date</label>
            <input
              type="date" className="input"
              value={form.expected_end_date}
              onChange={e => set('expected_end_date', e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label">Project Description</label>
          <textarea
            className="input resize-none"
            rows={3}
            placeholder="Brief description of the project..."
            value={form.description}
            onChange={e => set('description', e.target.value)}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate('/projects')} className="btn-secondary flex-1">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {loading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Save size={16} />}
            {loading ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
}
