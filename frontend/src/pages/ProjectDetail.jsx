import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectsAPI, stagesAPI, documentsAPI, paymentsAPI, usersAPI, emailImportAPI } from '../services/api';
import toast from 'react-hot-toast';
import { ArrowLeft, Upload, Plus, FileText, DollarSign, Clock, CheckCircle, AlertCircle, Download, Trash2, Edit2, X, Eye, Sheet } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import mammoth from 'mammoth';

const STAGE_STATUSES = ['pending', 'in_progress', 'completed', 'delayed'];

// Stage-specific extra fields — projectField:true means stored in projects table
const STAGE_EXTRA_FIELDS = {
  1:  [{ key:'description',        label:'Customer Requirement Details', type:'textarea', projectField:true }],
  2:  [
        { key:'customer_name',     label:'Customer Name *',             type:'text',     projectField:true },
        { key:'company_name',      label:'Company Name *',              type:'text',     projectField:true },
      ],
  3:  [{ key:'communication_type', label:'Communication Type',          type:'select',   projectField:true,
         options:['Call','WhatsApp','Mail'] }],
  4:  [
        { key:'customer_type',     label:'Customer Type',               type:'select',   projectField:true,
          options:['New','Existing'] },
        { key:'reference',         label:'Reference (if any)',          type:'text',     projectField:true },
      ],
  7:  [{ key:'description',        label:'Design Requirement Details',  type:'textarea', projectField:true }],
  8:  [{ key:'total_value',        label:'Quotation Value (₹)',         type:'number',   projectField:true }],
  10: [{ key:'po_reference',       label:'PO Reference Number',        type:'text',     projectField:false }],
  12: [{ key:'advance_note',       label:'Advance / Invoice Note',     type:'text',     projectField:false }],
  13: [{ key:'received_note',      label:'Payment Received Note',      type:'text',     projectField:false }],
  15: [{ key:'delivery_note',      label:'Delivery / Invoice Note',    type:'text',     projectField:false }],
  18: [{ key:'balance_note',       label:'Balance Payment Note',       type:'text',     projectField:false }],
};

const DocPreviewContent = ({ doc, projectId }) => {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [blobUrl, setBlobUrl] = useState('');
  const [msgData, setMsgData] = useState(null);
  const containerRef = useRef(null);
  const ext = doc.original_name.split('.').pop().toLowerCase();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      setMsgData(null);
      try {
        const token = localStorage.getItem('token');
        const apiBase = (import.meta.env.VITE_API_URL || '') + '/api';
        const isCloudUrl = /^https?:\/\//i.test(doc.storage_path || '');

        if (ext === 'msg') {
          const res = await fetch(`${apiBase}/documents/preview/${doc.id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Preview failed');
          setMsgData(data);
          setLoading(false);
          return;
        }

        // Cloudinary-hosted: use direct URL — most reliable on mobile devices
        if (isCloudUrl) {
          if (['jpg','jpeg','png','gif','bmp','webp','svg'].includes(ext)) {
            setBlobUrl(doc.storage_path);
            setHtml('image');
            setLoading(false);
            return;
          }
          if (['pdf','doc','docx','xls','xlsx'].includes(ext)) {
            setBlobUrl(doc.storage_path);
            setHtml('pdf'); // 'pdf' branch uses Google Docs viewer, which handles all office formats
            setLoading(false);
            return;
          }
        }

        const res = await fetch(`${apiBase}/documents/download/${doc.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);

        if (['jpg','jpeg','png','gif','bmp','webp','svg'].includes(ext)) {
          setHtml('image');
        } else if (ext === 'pdf') {
          setHtml('pdf');
        } else if (ext === 'docx') {
          const arrayBuffer = await blob.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          setHtml(result.value || '<p style="color:#999">No content to display</p>');
        } else if (ext === 'doc') {
          setHtml('doc-nopreview');
        } else {
          setHtml('unsupported');
        }
      } catch (e) {
        setError('Preview failed. Please download the file.');
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => { if (blobUrl && blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl); };
  }, [doc.id]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"/></div>;
  if (error) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <FileText size={48} className="text-gray-300" />
      <p className="text-gray-500 text-sm">Preview failed. Please download the file.</p>
    </div>
  );

  if (msgData) return (
    <div className="p-5 space-y-4 min-h-[60vh] overflow-auto">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
        <h2 className="text-base font-semibold text-gray-800">{msgData.subject}</h2>
        <div className="text-xs text-gray-500 space-y-0.5">
          {msgData.senderName && <p><span className="font-medium text-gray-600">From:</span> {msgData.senderName} {msgData.senderEmail ? `<${msgData.senderEmail}>` : ''}</p>}
          {msgData.recipients && <p><span className="font-medium text-gray-600">To:</span> {msgData.recipients}</p>}
          {msgData.date && <p><span className="font-medium text-gray-600">Date:</span> {new Date(msgData.date).toLocaleString()}</p>}
        </div>
      </div>
      {msgData.attachments?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Attachments ({msgData.attachments.length})</p>
          <div className="flex flex-wrap gap-2">
            {msgData.attachments.map((a, i) => (
              <span key={i} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-lg">
                <FileText size={12} /> {a.name} {a.size ? `(${(a.size/1024).toFixed(0)}KB)` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="border rounded-xl p-4 bg-white text-sm text-gray-800 whitespace-pre-wrap leading-relaxed min-h-[200px]">
        {msgData.body || <span className="text-gray-400 italic">No body content</span>}
      </div>
    </div>
  );

  if (html === 'image') return <img src={blobUrl} alt={doc.original_name} className="max-w-full max-h-[70vh] mx-auto rounded shadow object-contain" />;
  if (html === 'pdf') {
    // Cloudinary URL → use Google Docs viewer (renders reliably on mobile)
    // Local blob URL → use direct iframe (works on desktop)
    const isCloudUrl = blobUrl && /^https?:\/\//i.test(blobUrl);
    const src = isCloudUrl
      ? `https://docs.google.com/viewer?url=${encodeURIComponent(blobUrl)}&embedded=true`
      : blobUrl;
    return <iframe src={src} title={doc.original_name} className="w-full min-h-[70vh] rounded border-0" />;
  }
  if (html === 'doc-nopreview' || html === 'unsupported') return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <FileText size={56} className="text-blue-200" />
      <div className="text-center">
        <p className="text-gray-700 font-medium">{doc.original_name}</p>
        <p className="text-gray-400 text-sm mt-1">
          {html === 'doc-nopreview'
            ? '.doc format cannot be previewed in browser. Save as .docx to enable preview.'
            : 'This file type cannot be previewed in browser.'}
        </p>
      </div>
    </div>
  );
  return (
    <div
      ref={containerRef}
      className="p-6 bg-white min-h-[70vh] overflow-auto text-sm text-gray-800 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

const statusColor = (s) => ({
  pending: 'bg-gray-100 text-gray-500',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  delayed: 'bg-red-100 text-red-700',
  skipped: 'bg-gray-100 text-gray-500'
}[s] || 'bg-gray-100 text-gray-500');

const statusLabel = (s) => ({
  pending: 'Uncompleted',
  in_progress: 'In Progress',
  completed: 'Completed',
  delayed: 'Delayed',
  skipped: 'Skipped'
}[s] || s);

const StatusIcon = ({ s }) => {
  if (s === 'completed') return <CheckCircle size={16} className="text-green-500" />;
  if (s === 'delayed') return <AlertCircle size={16} className="text-red-500" />;
  if (s === 'in_progress') return <Clock size={16} className="text-blue-500" />;
  return <AlertCircle size={16} className="text-red-400" />;
};

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isManager, user } = useAuth();
  const canViewPayments = user?.role === 'admin' || user?.role === 'manager';
  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('stages');
  const [editStage, setEditStage] = useState(null);
  const [stageForm, setStageForm] = useState({});
  const [uploadStage, setUploadStage] = useState(null);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [uploadTab, setUploadTab] = useState('files'); // 'files' | 'email'
  const [emailCreds, setEmailCreds] = useState({ email: '', password: '', host: '', port: '' });
  const [fetchingEmails, setFetchingEmails] = useState(false);
  const [emailResults, setEmailResults] = useState([]);
  const [selectedAttachments, setSelectedAttachments] = useState([]);
  const [importingEmail, setImportingEmail] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ payment_type: 'advance', amount: '', currency: 'INR', status: 'pending', due_date: '', notes: '', reference_number: '' });
  const [editPayment, setEditPayment] = useState(null);
  const [paymentEditForm, setPaymentEditForm] = useState({});
  const [showEditProject, setShowEditProject] = useState(false);
  const [projectEditForm, setProjectEditForm] = useState({});
  const [previewDoc, setPreviewDoc] = useState(null);

  const load = useCallback(async () => {
    try {
      const [projRes, usersRes] = await Promise.all([
        projectsAPI.getById(id),
        usersAPI.getAll().catch(() => ({ data: [] }))
      ]);
      setData(projRes.data);
      setUsers(usersRes.data || []);
    } catch (err) {
      toast.error('Failed to load project');
      navigate('/projects');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const handleStageUpdate = async () => {
    try {
      // Update stage
      await stagesAPI.update(id, editStage.stage_number, stageForm);
      // Also update project-level fields if any were changed
      if (stageForm._projectFields && Object.keys(stageForm._projectFields).length > 0) {
        await projectsAPI.update(id, stageForm._projectFields);
      }
      toast.success('Stage updated');
      setEditStage(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed');
    }
  };

  const handleUpload = async () => {
    if (!files.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      if (uploadStage) fd.append('stage_number', uploadStage);
      if (notifyEmail.trim()) fd.append('notify_email', notifyEmail.trim());
      await documentsAPI.upload(id, fd);
      toast.success(`${files.length} file(s) uploaded`);
      setFiles([]);
      setNotifyEmail('');
      setUploadStage(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleFetchEmails = async () => {
    if (!emailCreds.email || !emailCreds.password) return toast.error('Enter email and password');
    setFetchingEmails(true);
    setEmailResults([]);
    setSelectedAttachments([]);
    try {
      const payload = { email: emailCreds.email, password: emailCreds.password };
      if (emailCreds.host) payload.host = emailCreds.host;
      if (emailCreds.port) payload.port = parseInt(emailCreds.port);
      const res = await emailImportAPI.fetch(payload);
      if (!res.data.emails.length) toast('No emails with attachments found');
      setEmailResults(res.data.emails);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to fetch emails');
    } finally {
      setFetchingEmails(false);
    }
  };

  const toggleAttachment = (att) => {
    setSelectedAttachments(prev => {
      const exists = prev.find(a => a.id === att.id);
      return exists ? prev.filter(a => a.id !== att.id) : [...prev, att];
    });
  };

  const handleImportFromEmail = async () => {
    if (!selectedAttachments.length) return toast.error('Select at least one attachment');
    setImportingEmail(true);
    try {
      await emailImportAPI.import({
        projectId: id,
        stageNumber: uploadStage,
        attachments: selectedAttachments.map(a => ({
          filename: a.filename,
          contentType: a.contentType,
          content: a.content,
        })),
      });
      toast.success(`${selectedAttachments.length} file(s) imported from email`);
      setEmailResults([]);
      setSelectedAttachments([]);
      setEmailCreds({ email: '', password: '', host: '', port: '' });
      setUploadStage(null);
      setUploadTab('files');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setImportingEmail(false);
    }
  };

  const handlePreview = (doc) => {
    setPreviewDoc(doc);
  };

  const handleExport = async (type) => {
    try {
      const res = type === 'excel'
        ? await projectsAPI.exportExcel(id)
        : await projectsAPI.exportPDF(id);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data?.project?.project_number}_report.${type === 'excel' ? 'xlsx' : 'pdf'}`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    } catch { toast.error('Export failed'); }
  };

  const handleDownload = async (doc) => {
    try {
      const res = await documentsAPI.download(doc.id);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.original_name;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('Download failed'); }
  };

  const handleConvert = async (doc, format) => {
    const label = format === 'docx' ? 'Word' : 'Excel';
    const toastId = toast.loading(`Converting to ${label}...`);
    try {
      const res = await documentsAPI.convert(doc.id, format);
      const baseName = doc.original_name.replace(/\.[^.]+$/, '');
      // Use filename from server's Content-Disposition header (it knows the real format)
      const cd = res.headers?.['content-disposition'] || '';
      const match = cd.match(/filename="?([^"]+)"?/i);
      const outName = match ? match[1] : `${baseName}.${format}`;
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = outName;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded as ${label}`, { id: toastId });
    } catch (err) {
      let msg = `${label} conversion failed`;
      if (err.response?.data) {
        try {
          const text = await err.response.data.text?.();
          const parsed = JSON.parse(text || '{}');
          if (parsed.error) msg += ': ' + parsed.error;
        } catch { /* ignore */ }
      }
      toast.error(msg, { id: toastId });
    }
  };

  const handleDeleteDoc = async (docId) => {
    if (!confirm('Delete this document?')) return;
    try {
      await documentsAPI.delete(docId);
      toast.success('Document deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    try {
      await paymentsAPI.create(id, paymentForm);
      toast.success('Payment added');
      setShowPaymentForm(false);
      setPaymentForm({ payment_type: 'advance', amount: '', currency: 'INR', status: 'pending', due_date: '', notes: '', reference_number: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add payment');
    }
  };

  const handlePaymentUpdate = async (e) => {
    e.preventDefault();
    try {
      await paymentsAPI.update(editPayment.id, paymentEditForm);
      toast.success('Payment updated');
      setEditPayment(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update payment');
    }
  };

  const handleProjectUpdate = async (e) => {
    e.preventDefault();
    try {
      await projectsAPI.update(id, projectEditForm);
      toast.success('Project updated');
      setShowEditProject(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update project');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  if (!data) return null;

  const { project, stages, payments, documents } = data;

  const received = payments.filter(p => p.status === 'received').reduce((s, p) => s + Number(p.amount), 0);
  const totalValue = Number(project.total_value || 0);
  const paymentSummary = {
    received,
    pending: totalValue > 0 ? Math.max(0, totalValue - received) : payments.filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.amount), 0)
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate('/projects')} className="p-2 rounded-lg hover:bg-gray-100 mt-0.5">
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold text-gray-900">{project.project_number}</h2>
              <span className={`badge-${project.status === 'active' ? 'active' : project.status === 'completed' ? 'completed' : project.status === 'delayed' ? 'delayed' : 'pending'}`}>
                {project.status}
              </span>
            </div>
            <p className="text-gray-500">{project.customer_name} — {project.company_name}</p>
          </div>
        </div>
        <div className="flex items-start gap-2 flex-wrap">
          <button onClick={() => handleExport('pdf')} className="btn-secondary flex items-center gap-1.5 text-sm py-1.5">
            <FileText size={14} /> PDF
          </button>
          <button onClick={() => handleExport('excel')} className="btn-secondary flex items-center gap-1.5 text-sm py-1.5">
            <Download size={14} /> Excel
          </button>
          {isManager && (
            <button
              onClick={() => {
                setProjectEditForm({
                  project_name: project.project_name || '',
                  customer_name: project.customer_name,
                  company_name: project.company_name,
                  communication_type: project.communication_type,
                  customer_type: project.customer_type,
                  reference: project.reference || '',
                  description: project.description || '',
                  priority: project.priority,
                  assigned_manager: project.assigned_manager || '',
                  total_value: project.total_value || '',
                  expected_end_date: project.expected_end_date ? project.expected_end_date.split('T')[0] : '',
                  status: project.status,
                });
                setShowEditProject(true);
              }}
              className="btn-secondary flex items-center gap-1.5 text-sm py-1.5"
            >
              <Edit2 size={15} /> Edit
            </button>
          )}
          <div className="text-right hidden sm:block">
            <p className="text-sm text-gray-500">Progress</p>
            <p className="text-2xl font-bold text-blue-600">{project.progress_percentage}%</p>
            <p className="text-xs text-gray-400">Stage {project.current_stage}/19</p>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="card py-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>Stage 1: Customer Requirement</span>
          <span>Stage 19: Project Closed</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-blue-500 to-blue-700 h-3 rounded-full transition-all duration-500"
            style={{ width: `${project.progress_percentage}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-xs text-gray-500">
            {project.communication_type} · {project.customer_type}
            {project.reference && ` · Ref: ${project.reference}`}
          </span>
          <span className="text-xs font-medium text-blue-600">{project.progress_percentage}% Complete</span>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Value',        value: project.total_value ? `₹${Number(project.total_value).toLocaleString('en-IN')}` : 'N/A', adminOnly: true },
          { label: 'Payment Received',   value: `₹${paymentSummary.received.toLocaleString('en-IN')}`, adminOnly: true },
          { label: 'Payment Pending',    value: `₹${paymentSummary.pending.toLocaleString('en-IN')}`, adminOnly: true },
          { label: 'Documents',          value: documents.length, adminOnly: false }
        ].filter(item => !item.adminOnly || canViewPayments).map(item => (
          <div key={item.label} className="card py-3">
            <p className="text-xs text-gray-500">{item.label}</p>
            <p className="text-lg font-bold text-gray-800 mt-0.5">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        {['stages', 'documents', ...(canViewPayments ? ['payments'] : [])].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize
              ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {tab} {tab === 'documents' ? `(${documents.length})` : tab === 'payments' ? `(${payments.length})` : `(19)`}
          </button>
        ))}
      </div>

      {/* Stages Tab */}
      {activeTab === 'stages' && (
        <div className="space-y-2">
          {stages.map((stage, idx) => (
            <div
              key={stage.id}
              className={`card py-4 border-l-4 transition-all
                ${stage.status === 'completed' ? 'border-green-500' :
                  stage.status === 'in_progress' ? 'border-blue-500' :
                  stage.status === 'delayed' ? 'border-red-500' : 'border-gray-200'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                  <div className="flex flex-col items-center mt-0.5">
                    <StatusIcon s={stage.status} />
                    {idx < stages.length - 1 && <div className="w-0.5 h-full bg-gray-200 mt-1" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-400 font-medium">Stage {stage.stage_number}</span>
                      <h4 className="font-medium text-gray-800">{stage.stage_name}</h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(stage.status)}`}>
                        {statusLabel(stage.status)}
                      </span>
                      {stage.requires_document && (
                        <span className="text-xs text-blue-500 flex items-center gap-1">
                          <FileText size={12} /> Doc required
                          {stage.is_mandatory_doc && <span className="text-red-500 font-bold">*</span>}
                        </span>
                      )}
                    </div>
                    {(stage.assigned_to_name) && (
                      <p className="text-xs text-gray-500 mt-1">Assigned: {stage.assigned_to_name}</p>
                    )}
                    {stage.comments && (
                      <p className="text-sm text-gray-600 mt-1 bg-gray-50 px-2 py-1 rounded">{stage.comments}</p>
                    )}
                    {stage.delay_reason && (
                      <p className="text-sm text-red-600 mt-1">⚠ {stage.delay_reason}</p>
                    )}
                    <div className="flex gap-4 mt-1 text-xs text-gray-400">
                      {stage.start_time && <span>Started: {format(new Date(stage.start_time), 'dd MMM yyyy, HH:mm')}</span>}
                      {stage.end_time && <span>Ended: {format(new Date(stage.end_time), 'dd MMM yyyy, HH:mm')}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setUploadStage(stage.stage_number); setFiles([]); }}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Upload document"
                  >
                    <Upload size={16} />
                  </button>
                  {isManager && (
                    <button
                      onClick={() => {
                        setEditStage(stage);
                        const extraFields = STAGE_EXTRA_FIELDS[stage.stage_number] || [];
                        const projFields = {};
                        extraFields.filter(f => f.projectField).forEach(f => {
                          projFields[f.key] = project[f.key] ?? '';
                        });
                        const nonProjDefaults = {};
                        extraFields.filter(f => !f.projectField).forEach(f => {
                          nonProjDefaults[f.key] = stage[f.key] ?? '';
                        });
                        setStageForm({
                          status: stage.status,
                          assigned_to_name: stage.assigned_to_name || '',
                          comments: stage.comments || '',
                          delay_reason: stage.delay_reason || '',
                          ...nonProjDefaults,
                          _projectFields: projFields,
                        });
                      }}
                      className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Edit stage"
                    >
                      <Edit2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-gray-800">All Documents ({documents.length})</h3>
            <button
              onClick={() => { setUploadStage(null); setFiles([]); }}
              className="btn-primary flex items-center gap-2 text-sm py-1.5"
            >
              <Upload size={16} /> Upload
            </button>
          </div>
          {documents.length === 0 ? (
            <div className="card text-center py-12">
              <FileText size={40} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No documents uploaded yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {documents.map(doc => (
                <div key={doc.id} className="card py-3 flex items-center justify-between hover:shadow-md transition-shadow">
                  <button
                    className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    onClick={() => handlePreview(doc)}
                  >
                    <FileText size={20} className="text-blue-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-blue-700 hover:underline truncate">{doc.original_name}</p>
                      <p className="text-xs text-gray-400">
                        Stage {doc.stage_number || 'General'} · {doc.uploaded_by_name} · {doc.created_at ? format(new Date(doc.created_at), 'dd MMM yyyy') : '-'}
                      </p>
                    </div>
                  </button>
                  <div className="flex gap-2 ml-3">
                    <button onClick={() => handlePreview(doc)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title="View">
                      <Eye size={16} />
                    </button>
                    <button onClick={() => handleDownload(doc)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Download original">
                      <Download size={16} />
                    </button>
                    <button onClick={() => handleConvert(doc, 'docx')} className="p-1.5 text-blue-700 hover:bg-blue-100 rounded-lg" title="Download as Word (.docx)">
                      <FileText size={16} />
                    </button>
                    <button onClick={() => handleConvert(doc, 'xlsx')} className="p-1.5 text-green-700 hover:bg-green-100 rounded-lg" title="Download as Excel (.xlsx)">
                      <Sheet size={16} />
                    </button>
                    <button onClick={() => handleDeleteDoc(doc.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Payments Tab */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-gray-800">Payments</h3>
            {isManager && (
              <button onClick={() => setShowPaymentForm(true)} className="btn-primary flex items-center gap-2 text-sm py-1.5">
                <Plus size={16} /> Add Payment
              </button>
            )}
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Received', value: paymentSummary.received, color: 'text-green-600' },
              { label: 'Balance Pending', value: paymentSummary.pending, color: 'text-yellow-600' },
              { label: 'Total Value', value: totalValue || (paymentSummary.received + paymentSummary.pending), color: 'text-blue-600' }
            ].map(item => (
              <div key={item.label} className="card py-3 text-center">
                <p className="text-xs text-gray-500">{item.label}</p>
                <p className={`text-lg font-bold ${item.color}`}>₹{item.value.toLocaleString('en-IN')}</p>
              </div>
            ))}
          </div>

          {payments.length === 0 ? (
            <div className="card text-center py-12">
              <DollarSign size={40} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No payments recorded yet</p>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Type', 'Amount', 'Status', 'Due Date', 'Received', 'Ref No.', 'Notes', ''].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2.5 capitalize font-medium">{p.payment_type}</td>
                      <td className="px-4 py-2.5 font-semibold text-gray-800">₹{Number(p.amount).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-2.5">
                        <span className={`badge-${p.status === 'received' ? 'completed' : p.status === 'pending' ? 'pending' : 'delayed'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{p.due_date ? format(new Date(p.due_date), 'dd MMM yyyy') : '-'}</td>
                      <td className="px-4 py-2.5 text-gray-500">{p.received_date ? format(new Date(p.received_date), 'dd MMM yyyy') : '-'}</td>
                      <td className="px-4 py-2.5 text-gray-500">{p.reference_number || '-'}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{p.notes || '-'}</td>
                      <td className="px-4 py-2.5">
                        {isManager && (
                          <button
                            onClick={() => {
                              setEditPayment(p);
                              setPaymentEditForm({
                                payment_type: p.payment_type,
                                amount: p.amount,
                                status: p.status,
                                due_date: p.due_date ? p.due_date.split('T')[0] : '',
                                received_date: p.received_date ? p.received_date.split('T')[0] : '',
                                reference_number: p.reference_number || '',
                                notes: p.notes || '',
                              });
                            }}
                            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit payment"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Stage Modal */}
      {editStage && (() => {
        const extraFields = STAGE_EXTRA_FIELDS[editStage.stage_number] || [];
        const setProj = (key, val) => setStageForm(f => ({ ...f, _projectFields: { ...f._projectFields, [key]: val } }));
        const setLocal = (key, val) => setStageForm(f => ({ ...f, [key]: val }));
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b shrink-0">
              <div>
                <h3 className="font-semibold text-gray-800">Stage {editStage.stage_number} — {editStage.stage_name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">Update progress for this stage</p>
              </div>
              <button onClick={() => setEditStage(null)}><X size={20} className="text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">

              {/* Stage-specific project fields */}
              {extraFields.length > 0 && (
                <div className="space-y-3 pb-3 border-b border-dashed border-gray-200">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Stage Details</p>
                  {extraFields.map(field => (
                    <div key={field.key}>
                      <label className="label">{field.label}</label>
                      {field.type === 'select' ? (
                        <select
                          className="input"
                          value={field.projectField ? (stageForm._projectFields?.[field.key] ?? '') : (stageForm[field.key] ?? '')}
                          onChange={e => field.projectField ? setProj(field.key, e.target.value) : setLocal(field.key, e.target.value)}
                        >
                          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : field.type === 'textarea' ? (
                        <textarea
                          className="input resize-none"
                          rows={3}
                          value={field.projectField ? (stageForm._projectFields?.[field.key] ?? '') : (stageForm[field.key] ?? '')}
                          onChange={e => field.projectField ? setProj(field.key, e.target.value) : setLocal(field.key, e.target.value)}
                        />
                      ) : (
                        <input
                          type={field.type}
                          className="input"
                          value={field.projectField ? (stageForm._projectFields?.[field.key] ?? '') : (stageForm[field.key] ?? '')}
                          onChange={e => field.projectField ? setProj(field.key, e.target.value) : setLocal(field.key, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Common fields */}
              <div>
                <label className="label">Status</label>
                <select className="input" value={stageForm.status} onChange={e => setStageForm(f => ({ ...f, status: e.target.value }))}>
                  {STAGE_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Assign To (Name)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Enter person's name..."
                  value={stageForm.assigned_to_name}
                  onChange={e => setStageForm(f => ({ ...f, assigned_to_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Comments</label>
                <textarea className="input resize-none" rows={2} value={stageForm.comments} onChange={e => setStageForm(f => ({ ...f, comments: e.target.value }))} />
              </div>
              {stageForm.status === 'delayed' && (
                <div>
                  <label className="label">Delay Reason</label>
                  <textarea className="input resize-none" rows={2} value={stageForm.delay_reason} onChange={e => setStageForm(f => ({ ...f, delay_reason: e.target.value }))} />
                </div>
              )}
            </div>
            <div className="flex gap-3 p-5 border-t shrink-0">
              <button onClick={() => setEditStage(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleStageUpdate} className="btn-primary flex-1">Update Stage</button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Upload Modal */}
      {uploadStage !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) { setUploadStage(null); setFiles([]); setNotifyEmail(''); setUploadTab('files'); setEmailResults([]); setSelectedAttachments([]); setEmailCreds({ email: '', password: '', host: '', port: '' }); } }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-semibold">Documents - Stage {uploadStage}</h3>
              <button onClick={() => { setUploadStage(null); setFiles([]); setNotifyEmail(''); setUploadTab('files'); setEmailResults([]); setSelectedAttachments([]); setEmailCreds({ email: '', password: '', host: '', port: '' }); }}><X size={20} className="text-gray-500" /></button>
            </div>
            {/* Tabs */}
            <div className="flex border-b">
              <button onClick={() => setUploadTab('files')} className={`flex-1 py-2.5 text-sm font-medium ${uploadTab === 'files' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                Upload Files
              </button>
              <button onClick={() => setUploadTab('email')} className={`flex-1 py-2.5 text-sm font-medium ${uploadTab === 'email' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                Import from Email
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {uploadTab === 'files' ? (
                <>
                  {/* Existing uploaded files */}
                  {(() => {
                    const stageDocs = documents.filter(d => d.stage_number === uploadStage);
                    return stageDocs.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Uploaded Files ({stageDocs.length})</p>
                        <div className="space-y-2">
                          {stageDocs.map(doc => (
                            <div key={doc.id} className="flex items-center gap-2 bg-blue-50 border border-blue-100 px-3 py-2 rounded-lg">
                              <FileText size={16} className="text-blue-500 shrink-0" />
                              <button onClick={() => doc.original_name.split('.').pop().toLowerCase() === 'msg' ? handlePreview(doc) : window.open(`/uploads/${id}/${doc.file_name}`, '_blank')} className="text-sm text-blue-700 hover:underline truncate flex-1 text-left" title="Click to open">
                                {doc.original_name}
                              </button>
                              <span className="text-xs text-gray-400 shrink-0">{(doc.file_size / 1024).toFixed(0)}KB</span>
                              <button onClick={() => handleDownload(doc)} title="Download" className="text-blue-500 hover:text-blue-700 shrink-0"><Download size={15} /></button>
                              <button onClick={() => handleDeleteDoc(doc.id)} title="Delete" className="text-red-400 hover:text-red-600 shrink-0"><Trash2 size={15} /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-2">No files uploaded yet for this stage</p>
                    );
                  })()}

                  {/* New file upload area */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Add New Files</p>
                    <label className="block w-full border-2 border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-blue-400">
                      <Upload size={22} className="text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Click to select files</p>
                      <p className="text-xs text-gray-400 mt-1">PDF, Images, Excel, Word, Outlook (.msg) — max 10MB each</p>
                      <input type="file" multiple className="hidden" accept=".pdf,.jpg,.jpeg,.png,.gif,.xlsx,.xls,.doc,.docx,.msg" onChange={e => setFiles(Array.from(e.target.files))} />
                    </label>
                    {files.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {files.map((f, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 px-3 py-1.5 rounded">
                            <FileText size={14} className="text-green-500" />
                            <span className="truncate">{f.name}</span>
                            <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} className="ml-auto text-gray-400 hover:text-red-500"><X size={13} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* Import from Email tab */
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Email Credentials</p>
                    <input
                      type="email"
                      placeholder="Email address"
                      value={emailCreds.email}
                      onChange={e => setEmailCreds(p => ({ ...p, email: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <input
                      type="password"
                      placeholder="App Password (not your login password)"
                      value={emailCreds.password}
                      onChange={e => setEmailCreds(p => ({ ...p, password: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="IMAP Host (e.g. imap.gmail.com)"
                        value={emailCreds.host}
                        onChange={e => setEmailCreds(p => ({ ...p, host: e.target.value }))}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <input
                        type="number"
                        placeholder="Port (993)"
                        value={emailCreds.port}
                        onChange={e => setEmailCreds(p => ({ ...p, port: e.target.value }))}
                        className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                    <p className="text-xs text-gray-400">Gmail: enable IMAP in settings and use an <strong>App Password</strong> from myaccount.google.com → Security.</p>
                    <button
                      onClick={handleFetchEmails}
                      disabled={fetchingEmails}
                      className="w-full btn-primary flex items-center justify-center gap-2 py-2"
                    >
                      {fetchingEmails ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : null}
                      {fetchingEmails ? 'Fetching emails...' : 'Fetch Email Attachments'}
                    </button>
                  </div>

                  {emailResults.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Select Attachments to Import</p>
                      <div className="space-y-3 max-h-60 overflow-y-auto">
                        {emailResults.map((mail, mi) => (
                          <div key={mi} className="border border-gray-200 rounded-lg p-3">
                            <p className="text-xs font-semibold text-gray-700 truncate">{mail.subject}</p>
                            <p className="text-xs text-gray-400 mb-2">{mail.from}</p>
                            <div className="space-y-1">
                              {mail.attachments.map(att => {
                                const selected = selectedAttachments.find(a => a.id === att.id);
                                return (
                                  <label key={att.id} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${selected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}>
                                    <input type="checkbox" checked={!!selected} onChange={() => toggleAttachment(att)} className="accent-blue-500" />
                                    <FileText size={13} className="text-blue-500 shrink-0" />
                                    <span className="text-xs text-gray-700 truncate flex-1">{att.filename}</span>
                                    <span className="text-xs text-gray-400 shrink-0">{(att.size / 1024).toFixed(0)}KB</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                      {selectedAttachments.length > 0 && (
                        <p className="text-xs text-blue-600 mt-1">{selectedAttachments.length} attachment(s) selected</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            {uploadTab === 'files' && (
              <div className="px-5 pb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Notify via Email (optional)</p>
                <input
                  type="email"
                  value={notifyEmail}
                  onChange={e => setNotifyEmail(e.target.value)}
                  placeholder="Enter email to notify after upload"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            )}
            <div className="flex gap-3 p-5 border-t">
              <button onClick={() => { setUploadStage(null); setFiles([]); setNotifyEmail(''); setUploadTab('files'); setEmailResults([]); setSelectedAttachments([]); setEmailCreds({ email: '', password: '', host: '', port: '' }); }} className="btn-secondary flex-1">Close</button>
              {uploadTab === 'files' ? (
                <button onClick={handleUpload} disabled={!files.length || uploading} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {uploading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Upload size={16} />}
                  {uploading ? 'Uploading...' : `Upload${files.length > 0 ? ` (${files.length})` : ''}`}
                </button>
              ) : (
                <button onClick={handleImportFromEmail} disabled={!selectedAttachments.length || importingEmail} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {importingEmail ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Download size={16} />}
                  {importingEmail ? 'Importing...' : `Import${selectedAttachments.length > 0 ? ` (${selectedAttachments.length})` : ''}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {editPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-semibold">Edit Payment</h3>
              <button onClick={() => setEditPayment(null)}><X size={20} className="text-gray-500" /></button>
            </div>
            <form onSubmit={handlePaymentUpdate} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Payment Type</label>
                  <select className="input" value={paymentEditForm.payment_type} onChange={e => setPaymentEditForm(f => ({ ...f, payment_type: e.target.value }))}>
                    <option value="advance">Advance</option>
                    <option value="balance">Balance</option>
                    <option value="milestone">Milestone</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="label">Amount (₹) *</label>
                  <input type="number" className="input" required value={paymentEditForm.amount} onChange={e => setPaymentEditForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={paymentEditForm.status} onChange={e => setPaymentEditForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="pending">Pending</option>
                    <option value="received">Received</option>
                    <option value="overdue">Overdue</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="label">Due Date</label>
                  <input type="date" className="input" value={paymentEditForm.due_date} onChange={e => setPaymentEditForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
              </div>
              {paymentEditForm.status === 'received' && (
                <div>
                  <label className="label">Received Date</label>
                  <input type="date" className="input" value={paymentEditForm.received_date} onChange={e => setPaymentEditForm(f => ({ ...f, received_date: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="label">Reference Number</label>
                <input type="text" className="input" value={paymentEditForm.reference_number} onChange={e => setPaymentEditForm(f => ({ ...f, reference_number: e.target.value }))} />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input resize-none" rows={2} value={paymentEditForm.notes} onChange={e => setPaymentEditForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditPayment(null)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {showEditProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-semibold">Edit Project</h3>
              <button onClick={() => setShowEditProject(false)}><X size={20} className="text-gray-500" /></button>
            </div>
            <form onSubmit={handleProjectUpdate} className="p-5 space-y-3 overflow-y-auto flex-1">
              <div>
                <label className="label">Project Name</label>
                <input type="text" className="input" placeholder="e.g. Conveyor Belt Design" value={projectEditForm.project_name} onChange={e => setProjectEditForm(f => ({ ...f, project_name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Customer Name *</label>
                  <input type="text" className="input" required value={projectEditForm.customer_name} onChange={e => setProjectEditForm(f => ({ ...f, customer_name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Company Name *</label>
                  <input type="text" className="input" required value={projectEditForm.company_name} onChange={e => setProjectEditForm(f => ({ ...f, company_name: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Communication</label>
                  <select className="input" value={projectEditForm.communication_type} onChange={e => setProjectEditForm(f => ({ ...f, communication_type: e.target.value }))}>
                    <option value="Call">Call</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Mail">Mail</option>
                  </select>
                </div>
                <div>
                  <label className="label">Customer Type</label>
                  <select className="input" value={projectEditForm.customer_type} onChange={e => setProjectEditForm(f => ({ ...f, customer_type: e.target.value }))}>
                    <option value="New">New</option>
                    <option value="Existing">Existing</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Priority</label>
                  <select className="input" value={projectEditForm.priority} onChange={e => setProjectEditForm(f => ({ ...f, priority: e.target.value }))}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={projectEditForm.status} onChange={e => setProjectEditForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="active">Active</option>
                    <option value="on_hold">On Hold</option>
                    <option value="delayed">Delayed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Assign Manager</label>
                  <select className="input" value={projectEditForm.assigned_manager} onChange={e => setProjectEditForm(f => ({ ...f, assigned_manager: e.target.value }))}>
                    <option value="">-- Unassigned --</option>
                    {users.filter(u => u.role === 'manager' || u.role === 'admin').map(u => (
                      <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Total Value (₹)</label>
                  <input type="number" className="input" value={projectEditForm.total_value} onChange={e => setProjectEditForm(f => ({ ...f, total_value: e.target.value }))} placeholder="0.00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Reference</label>
                  <input type="text" className="input" value={projectEditForm.reference} onChange={e => setProjectEditForm(f => ({ ...f, reference: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Expected End Date</label>
                  <input type="date" className="input" value={projectEditForm.expected_end_date} onChange={e => setProjectEditForm(f => ({ ...f, expected_end_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input resize-none" rows={2} value={projectEditForm.description} onChange={e => setProjectEditForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEditProject(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={() => setPreviewDoc(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div className="min-w-0">
                <p className="font-semibold text-gray-800 truncate">{previewDoc.original_name}</p>
                <p className="text-xs text-gray-400">Stage {previewDoc.stage_number || 'General'} · {previewDoc.uploaded_by_name}</p>
              </div>
              <div className="flex items-center gap-2 ml-3 shrink-0 flex-wrap">
                <button onClick={() => handleDownload(previewDoc)} className="btn-secondary flex items-center gap-1.5 text-sm py-1.5">
                  <Download size={15} /> Download
                </button>
                <button onClick={() => handleConvert(previewDoc, 'docx')} className="flex items-center gap-1.5 text-sm py-1.5 px-3 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors font-medium">
                  <FileText size={15} /> Word
                </button>
                <button onClick={() => handleConvert(previewDoc, 'xlsx')} className="flex items-center gap-1.5 text-sm py-1.5 px-3 rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors font-medium">
                  <Sheet size={15} /> Excel
                </button>
                <button onClick={() => setPreviewDoc(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-gray-50 rounded-b-xl">
              <DocPreviewContent doc={previewDoc} projectId={id} />
            </div>
          </div>
        </div>
      )}

      {/* Add Payment Modal */}
      {showPaymentForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-semibold">Add Payment</h3>
              <button onClick={() => setShowPaymentForm(false)}><X size={20} className="text-gray-500" /></button>
            </div>
            <form onSubmit={handleAddPayment} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Payment Type</label>
                  <select className="input" value={paymentForm.payment_type} onChange={e => setPaymentForm(f => ({ ...f, payment_type: e.target.value }))}>
                    <option value="advance">Advance</option>
                    <option value="balance">Balance</option>
                    <option value="milestone">Milestone</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="label">Amount (₹) *</label>
                  <input type="number" className="input" required value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="label">Due Date</label>
                <input type="date" className="input" value={paymentForm.due_date} onChange={e => setPaymentForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div>
                <label className="label">Reference Number</label>
                <input type="text" className="input" value={paymentForm.reference_number} onChange={e => setPaymentForm(f => ({ ...f, reference_number: e.target.value }))} placeholder="Invoice no. / Ref..." />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input resize-none" rows={2} value={paymentForm.notes} onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowPaymentForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Add Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
