import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { notesAPI, noteCommentsAPI, noteFilesAPI } from '../services/api';
import toast from 'react-hot-toast';
import {
  ArrowLeft, CalendarDays, Plus, Pencil, Trash2, Check, X,
  StickyNote, MessageSquare, Paperclip, Upload, Download, File,
  FileText, Image, Eye, Calendar
} from 'lucide-react';

const NOTE_COLORS = [
  { key: 'blue',   bg: 'bg-blue-500',   light: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-700' },
  { key: 'green',  bg: 'bg-green-500',  light: 'bg-green-50',  border: 'border-green-200', text: 'text-green-700' },
  { key: 'yellow', bg: 'bg-yellow-400', light: 'bg-yellow-50', border: 'border-yellow-200',text: 'text-yellow-700' },
  { key: 'red',    bg: 'bg-red-500',    light: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-700' },
  { key: 'purple', bg: 'bg-purple-500', light: 'bg-purple-50', border: 'border-purple-200',text: 'text-purple-700' },
];
const cm = (key) => NOTE_COLORS.find(c => c.key === key) || NOTE_COLORS[0];
const isImg = (name) => /\.(jpg|jpeg|png|gif|webp)$/i.test(name || '');
const isPdf = (name) => /\.pdf$/i.test(name || '');

export default function NotesDay() {
  const { date } = useParams();
  const navigate  = useNavigate();
  const fileRef   = useRef();

  const [notes,     setNotes]     = useState([]);
  const [comments,  setComments]  = useState([]);
  const [files,     setFiles]     = useState([]);
  const [loading,   setLoading]   = useState(true);

  // note edit state
  const [editNoteId,   setEditNoteId]   = useState(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [editNoteDate, setEditNoteDate] = useState('');
  const [deletingNote, setDeletingNote] = useState(null);

  // comment state
  const [cText,    setCText]    = useState('');
  const [cColor,   setCColor]   = useState('blue');
  const [cSaving,  setCSaving]  = useState(false);
  const [editCId,  setEditCId]  = useState(null);
  const [editCText,setEditCText]= useState('');

  // file state
  const [uploading,  setUploading]  = useState(false);
  const [previewFile,setPreviewFile]= useState(null); // { url, name, type }

  const label = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      })
    : '';

  useEffect(() => {
    if (!date) return;
    setLoading(true);
    Promise.all([
      notesAPI.getByDate(date),
      noteCommentsAPI.getByDate(date),
      noteFilesAPI.getByDate(date),
    ])
      .then(([nr, cr, fr]) => { setNotes(nr.data); setComments(cr.data); setFiles(fr.data); })
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  }, [date]);

  /* ── Meeting Notes edit/delete ── */
  const saveNoteEdit = async (n) => {
    if (!editNoteText.trim()) return;
    try {
      const res = await notesAPI.update(n.id, {
        note_text: editNoteText.trim(),
        ...(editNoteDate && editNoteDate !== n.note_date ? { note_date: editNoteDate } : {})
      });
      setNotes(p => p.map(x => x.id === n.id ? res.data : x));
      setEditNoteId(null);
      toast.success('Note updated');
      if (editNoteDate && editNoteDate !== n.note_date) {
        navigate(`/notes/${editNoteDate}`, { replace: true });
      }
    } catch { toast.error('Failed to update'); }
  };

  const deleteNote = async (id) => {
    try {
      await notesAPI.remove(id);
      setNotes(p => p.filter(x => x.id !== id));
      setDeletingNote(null);
      toast.success('Note deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const toggleComplete = async (n) => {
    const newVal = !n.completed;
    setNotes(p => p.map(x => x.id === n.id ? { ...x, completed: newVal } : x));
    try {
      const res = await notesAPI.update(n.id, { completed: newVal });
      setNotes(p => p.map(x => x.id === n.id ? res.data : x));
      toast.success(newVal ? 'Marked as completed' : 'Marked as incomplete');
    } catch {
      setNotes(p => p.map(x => x.id === n.id ? { ...x, completed: !newVal } : x));
      toast.error('Failed to update');
    }
  };

  /* ── Comments ── */
  const addComment = async () => {
    if (!cText.trim()) return;
    setCSaving(true);
    try {
      const res = await noteCommentsAPI.create(date, { comment_text: cText.trim(), color: cColor });
      setComments(p => [...p, res.data]);
      setCText('');
      toast.success('Comment added');
    } catch { toast.error('Failed to add'); }
    finally { setCSaving(false); }
  };

  const saveCommentEdit = async (id) => {
    if (!editCText.trim()) return;
    try {
      const res = await noteCommentsAPI.update(id, { comment_text: editCText.trim() });
      setComments(p => p.map(c => c.id === id ? res.data : c));
      setEditCId(null);
      toast.success('Updated');
    } catch { toast.error('Failed to update'); }
  };

  const deleteComment = async (id) => {
    try {
      await noteCommentsAPI.remove(id);
      setComments(p => p.filter(c => c.id !== id));
      toast.success('Deleted');
    } catch { toast.error('Failed to delete'); }
  };

  /* ── Files ── */
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await noteFilesAPI.upload(date, fd);
      setFiles(p => [...p, res.data]);
      toast.success('File uploaded');
    } catch { toast.error('Upload failed'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const openPreview = async (f) => {
    try {
      const res = await noteFilesAPI.download(f.id);
      const url = URL.createObjectURL(res.data);
      if (isImg(f.original_name) || isPdf(f.original_name)) {
        setPreviewFile({ url, name: f.original_name, type: res.data.type });
      } else {
        const a = document.createElement('a');
        a.href = url; a.download = f.original_name; a.click();
        URL.revokeObjectURL(url);
      }
    } catch { toast.error('Cannot open file'); }
  };

  const handleDownload = async (f) => {
    try {
      const res = await noteFilesAPI.download(f.id);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = f.original_name; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Download failed'); }
  };

  const deleteFile = async (id) => {
    try {
      await noteFilesAPI.remove(id);
      setFiles(p => p.filter(f => f.id !== id));
      toast.success('File deleted');
    } catch { toast.error('Failed to delete'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
          <ArrowLeft size={20} />
        </button>
        <CalendarDays size={22} className="text-blue-500" />
        <div>
          <h2 className="text-xl font-bold text-gray-900">{label}</h2>
          <p className="text-xs text-gray-400">{comments.length} comment{comments.length !== 1 ? 's' : ''} · {files.length} file{files.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Meeting Notes — with edit & delete */}
      {notes.length > 0 && (
        <div className="card space-y-2">
          <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
            <StickyNote size={15} className="text-yellow-500" /> Meeting
          </h3>
          {notes.map(n => {
            const c = cm(n.color);
            return (
              <div key={n.id} className={`rounded-xl border ${c.light} ${c.border} px-4 py-3`}>
                {editNoteId === n.id ? (
                  <div className="space-y-2">
                    <textarea
                      className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                      rows={2} value={editNoteText} onChange={e => setEditNoteText(e.target.value)} autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-gray-400" />
                      <input
                        type="date"
                        className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        value={editNoteDate}
                        onChange={e => setEditNoteDate(e.target.value)}
                      />
                      <span className="text-xs text-gray-400">Change date if needed</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => saveNoteEdit(n)}
                        className="flex items-center gap-1 px-3 py-1 rounded-lg bg-green-500 text-white text-xs font-medium hover:bg-green-600">
                        <Check size={12} /> Save
                      </button>
                      <button onClick={() => setEditNoteId(null)}
                        className="flex items-center gap-1 px-3 py-1 rounded-lg bg-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-300">
                        <X size={12} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className={`text-sm flex-1 leading-snug ${c.text}`}>
                      {n.note_text}
                    </p>
                    <button
                      onClick={() => toggleComplete(n)}
                      className={`shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                        n.completed
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                      }`}
                    >
                      {n.completed ? '✓ Completed' : 'Complete'}
                    </button>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => { setEditNoteId(n.id); setEditNoteText(n.note_text); setEditNoteDate(n.note_date); }}
                        className="p-1.5 rounded-lg hover:bg-white/60 text-gray-400 hover:text-blue-600">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => setDeletingNote(n)}
                        className="p-1.5 rounded-lg hover:bg-white/60 text-gray-400 hover:text-red-500">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Comments & Details */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
          <MessageSquare size={15} className="text-blue-500" /> Comments & Details
        </h3>
        <textarea
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder-gray-300"
          rows={3}
          placeholder="Add meeting points, decisions, action items..."
          value={cText}
          onChange={e => setCText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addComment(); }}
        />
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {NOTE_COLORS.map(c => (
              <button key={c.key} onClick={() => setCColor(c.key)}
                className={`w-5 h-5 rounded-full ${c.bg} transition-transform ${cColor === c.key ? 'scale-125 ring-2 ring-offset-1 ring-gray-300' : 'hover:scale-110'}`} />
            ))}
          </div>
          <button onClick={addComment} disabled={!cText.trim() || cSaving}
            className="btn-primary flex items-center gap-2 px-4 text-sm disabled:opacity-50">
            {cSaving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Plus size={14} />}
            {cSaving ? 'Saving...' : 'Add'}
          </button>
        </div>
        {comments.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-1">No comments yet</p>
        ) : (
          <div className="space-y-2">
            {comments.map(c => {
              const meta = cm(c.color);
              return (
                <div key={c.id} className={`rounded-xl border ${meta.light} ${meta.border} px-4 py-3`}>
                  <div className="flex items-start gap-2">
                    <span className={`w-2 h-2 rounded-full ${meta.bg} shrink-0 mt-1.5`} />
                    <div className="flex-1 min-w-0">
                      {editCId === c.id ? (
                        <div className="space-y-2">
                          <textarea
                            className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                            rows={3} value={editCText} onChange={e => setEditCText(e.target.value)} autoFocus
                          />
                          <div className="flex gap-2">
                            <button onClick={() => saveCommentEdit(c.id)}
                              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-green-500 text-white text-xs font-medium hover:bg-green-600">
                              <Check size={12} /> Save
                            </button>
                            <button onClick={() => setEditCId(null)}
                              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-300">
                              <X size={12} /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className={`text-sm ${meta.text} whitespace-pre-wrap leading-relaxed`}>{c.comment_text}</p>
                      )}
                    </div>
                    {editCId !== c.id && (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => { setEditCId(c.id); setEditCText(c.comment_text); }}
                          className="p-1.5 rounded-lg hover:bg-white/60 text-gray-400 hover:text-blue-600">
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => deleteComment(c.id)}
                          className="p-1.5 rounded-lg hover:bg-white/60 text-gray-400 hover:text-red-500">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Attachments */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
            <Paperclip size={15} className="text-blue-500" /> Attachments
          </h3>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="btn-primary flex items-center gap-2 text-sm px-4 py-1.5 disabled:opacity-50">
            {uploading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Upload size={13} />}
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
          <input ref={fileRef} type="file" className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={handleUpload} />
        </div>

        {files.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-xl py-8 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
            onClick={() => fileRef.current?.click()}>
            <Upload size={26} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Upload photos, PDFs, or documents</p>
            <p className="text-xs text-gray-300 mt-1">Max 10MB · Click to open</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map(f => (
              <div key={f.id} className="flex items-center gap-3 border border-gray-100 rounded-xl px-3 py-2.5 hover:bg-gray-50 cursor-pointer group"
                onClick={() => openPreview(f)}>
                {isImg(f.original_name)
                  ? <Image size={20} className="text-blue-400 shrink-0" />
                  : isPdf(f.original_name)
                    ? <FileText size={20} className="text-red-400 shrink-0" />
                    : <File size={20} className="text-gray-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate group-hover:text-blue-600">{f.original_name}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(f.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    {isImg(f.original_name) || isPdf(f.original_name) ? ' · tap to view' : ' · tap to download'}
                  </p>
                </div>
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => handleDownload(f)}
                    className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600" title="Download">
                    <Download size={14} />
                  </button>
                  <button onClick={() => deleteFile(f.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            <button onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500">
              <Plus size={13} /> Add more files
            </button>
          </div>
        )}
      </div>

      {/* File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => { URL.revokeObjectURL(previewFile.url); setPreviewFile(null); }}>
          <div className="relative max-w-4xl w-full max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => { URL.revokeObjectURL(previewFile.url); setPreviewFile(null); }}
              className="absolute -top-10 right-0 text-white/80 hover:text-white p-2">
              <X size={24} />
            </button>
            <p className="text-white/70 text-xs mb-2 truncate">{previewFile.name}</p>
            {isImg(previewFile.name) ? (
              <img src={previewFile.url} alt={previewFile.name}
                className="max-h-[80vh] max-w-full rounded-xl object-contain mx-auto block" />
            ) : (
              <iframe src={previewFile.url} title={previewFile.name}
                className="w-full h-[80vh] rounded-xl bg-white" />
            )}
          </div>
        </div>
      )}

      {/* Delete Note Confirm */}
      {deletingNote && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-500" />
            </div>
            <h3 className="font-semibold text-gray-800 mb-1">Delete Note</h3>
            <p className="text-sm text-gray-500 mb-5">
              Delete <strong>"{deletingNote.note_text}"</strong>? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeletingNote(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => deleteNote(deletingNote.id)}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
