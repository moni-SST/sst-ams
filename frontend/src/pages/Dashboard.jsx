import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyticsAPI, projectsAPI, notesAPI } from '../services/api';
import {
  FolderKanban, CheckCircle, Clock, AlertTriangle,
  Plus, ChevronLeft, ChevronRight, CalendarDays,
  X, Trash2, Pencil, Check, StickyNote
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const NOTE_COLORS = [
  { key: 'blue',   bg: 'bg-blue-500',   light: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-700' },
  { key: 'green',  bg: 'bg-green-500',  light: 'bg-green-50',  border: 'border-green-200', text: 'text-green-700' },
  { key: 'yellow', bg: 'bg-yellow-400', light: 'bg-yellow-50', border: 'border-yellow-200',text: 'text-yellow-700' },
  { key: 'red',    bg: 'bg-red-500',    light: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-700' },
  { key: 'purple', bg: 'bg-purple-500', light: 'bg-purple-50', border: 'border-purple-200',text: 'text-purple-700' },
];
const colorMeta = (key) => NOTE_COLORS.find(c => c.key === key) || NOTE_COLORS[0];

const STATUS_STYLE = {
  active:    'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  delayed:   'bg-red-100 text-red-700',
  on_hold:   'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-gray-100 text-gray-400',
};

/* ─────────────────────────── Note Modal ─────────────────────────── */
const NoteModal = ({ date, notes, onClose, onSave, onDelete, onUpdate }) => {
  const [text, setText] = useState('');
  const [color, setColor] = useState('blue');
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);

  const label = date ? new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) : '';

  const handleSave = async () => {
    if (!text.trim()) return;
    setSaving(true);
    await onSave({ note_date: date, note_text: text.trim(), color });
    setText('');
    setSaving(false);
  };

  const handleUpdate = async (id) => {
    if (!editText.trim()) return;
    await onUpdate(id, { note_text: editText.trim() });
    setEditId(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <CalendarDays size={18} className="text-blue-500" />
            <div>
              <p className="font-semibold text-gray-800 text-sm">{label}</p>
              <p className="text-xs text-gray-400">{notes.length} note{notes.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        {/* Existing notes */}
        <div className="px-5 py-3 space-y-2 max-h-52 overflow-y-auto">
          {notes.length === 0 && (
            <div className="text-center py-6">
              <StickyNote size={28} className="text-gray-200 mx-auto mb-1" />
              <p className="text-sm text-gray-400">No notes for this date</p>
            </div>
          )}
          {notes.map(n => {
            const cm = colorMeta(n.color);
            return (
              <div key={n.id} className={`rounded-xl border ${cm.light} ${cm.border} px-3 py-2.5`}>
                {editId === n.id ? (
                  <div className="flex gap-2">
                    <textarea
                      className="flex-1 text-sm bg-white border border-gray-200 rounded-lg px-2 py-1 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                      rows={2}
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      autoFocus
                    />
                    <div className="flex flex-col gap-1">
                      <button onClick={() => handleUpdate(n.id)} className="p-1 rounded-lg bg-green-500 text-white hover:bg-green-600">
                        <Check size={13} />
                      </button>
                      <button onClick={() => setEditId(null)} className="p-1 rounded-lg bg-gray-200 text-gray-500 hover:bg-gray-300">
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm ${cm.text} flex-1 leading-snug`}>{n.note_text}</p>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => { setEditId(n.id); setEditText(n.note_text); }}
                        className="p-1 rounded hover:bg-white/60 text-gray-400 hover:text-gray-600"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => onDelete(n.id)}
                        className="p-1 rounded hover:bg-white/60 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add new note */}
        <div className="px-5 pb-5 space-y-3 border-t pt-3">
          <textarea
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder-gray-300"
            rows={3}
            placeholder="Write a note for this day..."
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave(); }}
          />
          <div className="flex items-center justify-between">
            {/* Color picker */}
            <div className="flex gap-1.5">
              {NOTE_COLORS.map(c => (
                <button
                  key={c.key}
                  onClick={() => setColor(c.key)}
                  className={`w-5 h-5 rounded-full ${c.bg} transition-transform ${color === c.key ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'}`}
                />
              ))}
            </div>
            <button
              onClick={handleSave}
              disabled={!text.trim() || saving}
              className="btn-primary text-sm px-4 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
            >
              <Plus size={14} /> Save Note
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────── Calendar ─────────────────────────── */
const Calendar = ({ projects, notes, onDayClick, onMonthChange }) => {
  const today = new Date();
  const [cur, setCur] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const year  = cur.getFullYear();
  const month = cur.getMonth();

  const goToMonth = (newDate) => {
    setCur(newDate);
    onMonthChange && onMonthChange(newDate.getFullYear(), newDate.getMonth());
  };

  // Project deadlines map
  const deadlines = {};
  projects.forEach(p => {
    if (!p.expected_end_date) return;
    const d = new Date(p.expected_end_date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!deadlines[day]) deadlines[day] = [];
      deadlines[day].push(p);
    }
  });

  // Notes map
  const notesMap = {};
  notes.forEach(n => {
    const d = new Date(n.note_date + 'T00:00:00');
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!notesMap[day]) notesMap[day] = [];
      notesMap[day].push(n);
    }
  });

  const firstDow    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const isToday = (d) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  const isPast  = (d) => new Date(year, month, d) < new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const pad = (n) => String(n).padStart(2,'0');
  const dateStr = (d) => `${year}-${pad(month+1)}-${pad(d)}`;

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <CalendarDays size={17} className="text-blue-500" />
          {MONTH_NAMES[month]} {year}
        </h3>
        <div className="flex items-center gap-1">
          <button onClick={() => goToMonth(new Date(year, month - 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => goToMonth(new Date(today.getFullYear(), today.getMonth(), 1))} className="px-2.5 py-1 text-xs rounded-lg hover:bg-gray-100 text-gray-500 font-medium">
            Today
          </button>
          <button onClick={() => goToMonth(new Date(year, month + 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const hasDeadline = !!deadlines[day];
          const dayNotes    = notesMap[day] || [];
          const todayCell   = isToday(day);
          const past        = isPast(day);

          return (
            <div
              key={day}
              onClick={() => onDayClick(dateStr(day), dayNotes)}
              className={`relative flex flex-col items-center justify-start py-1.5 rounded-xl cursor-pointer transition-colors select-none
                ${todayCell
                  ? 'bg-blue-600 shadow-md shadow-blue-200'
                  : 'hover:bg-gray-100 active:bg-gray-200'}
              `}
            >
              <span className={`text-sm font-medium leading-none
                ${todayCell ? 'text-white' : past ? 'text-gray-300' : 'text-gray-700'}
              `}>{day}</span>

              {/* indicator dots */}
              <div className="flex gap-0.5 mt-1 min-h-[6px]">
                {hasDeadline && (
                  <span className={`w-1.5 h-1.5 rounded-full ${todayCell ? 'bg-white' : 'bg-orange-400'}`} />
                )}
                {dayNotes.slice(0, 2).map((n, j) => {
                  const cm = colorMeta(n.color);
                  return <span key={j} className={`w-1.5 h-1.5 rounded-full ${todayCell ? 'bg-white opacity-80' : cm.bg}`} />;
                })}
                {dayNotes.length > 2 && !todayCell && (
                  <span className="text-[8px] font-bold text-gray-400 leading-none mt-0.5">+</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-4 flex-wrap text-xs text-gray-400">
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"/>Today</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block"/>Deadline</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block"/>Note</div>
        <span className="ml-auto text-gray-300 italic">Click any date to add a note</span>
      </div>
    </div>
  );
};

/* ─────────────────────────── Monthly Notes List ─────────────────────────── */
const MonthNotesList = ({ notes, onDateClick, onNoteNavigate, onToggleComplete, month, year }) => {
  const grouped = {};
  notes.forEach(n => {
    if (!grouped[n.note_date]) grouped[n.note_date] = [];
    grouped[n.note_date].push(n);
  });
  const sortedDates = Object.keys(grouped).sort();

  if (sortedDates.length === 0) return (
    <div className="card text-center py-8">
      <StickyNote size={32} className="text-gray-200 mx-auto mb-2" />
      <p className="text-sm text-gray-400">No notes this month</p>
      <p className="text-xs text-gray-300 mt-1">Click any date on the calendar to add one</p>
    </div>
  );

  return (
    <div className="card space-y-4">
      <h3 className="font-semibold text-gray-800 flex items-center gap-2">
        <StickyNote size={16} className="text-yellow-500" />
        Notes — {MONTH_NAMES[month]} {year}
      </h3>
      <div className="space-y-3">
        {sortedDates.map(date => {
          const d = new Date(date + 'T00:00:00');
          const label = d.toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short' });
          return (
            <div key={date}>
              <p
                className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 cursor-pointer hover:text-blue-500 transition-colors inline-flex items-center gap-1"
                onClick={() => onNoteNavigate ? onNoteNavigate(date) : onDateClick && onDateClick(date, grouped[date])}
                title="Click to open notes"
              >
                <Pencil size={10} /> {label}
              </p>
              <div className="space-y-1.5">
                {grouped[date].map(n => {
                  const cm = colorMeta(n.color);
                  return (
                    <div
                      key={n.id}
                      className={`flex items-center gap-2 rounded-xl border ${cm.light} ${cm.border} px-3 py-2.5 transition-all`}
                    >
                      <p
                        className={`flex-1 text-sm leading-snug cursor-pointer ${cm.text}`}
                        onClick={() => onNoteNavigate ? onNoteNavigate(date) : onDateClick && onDateClick(date, grouped[date])}
                      >{n.note_text}</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleComplete && onToggleComplete(n); }}
                        className={`shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                          n.completed
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                        }`}
                      >
                        {n.completed ? '✓ Completed' : 'Complete'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ─────────────────────────── Upcoming Deadlines ─────────────────────────── */
const UpcomingDeadlines = ({ projects, navigate }) => {
  const today = new Date(); today.setHours(0,0,0,0);
  const withDate = projects
    .filter(p => p.expected_end_date && p.status !== 'completed' && p.status !== 'cancelled')
    .map(p => ({ ...p, _d: new Date(p.expected_end_date) }));

  const overdue  = withDate.filter(p => p._d < today).sort((a,b) => b._d - a._d).slice(0,3);
  const upcoming = withDate.filter(p => p._d >= today).sort((a,b) => a._d - b._d).slice(0,5);

  const diffLabel = (d) => {
    const n = Math.ceil((d - today) / 86400000);
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n <= 7)  return `${n}d left`;
    return d.toLocaleDateString('en-IN', { day:'numeric', month:'short' });
  };

  if (overdue.length === 0 && upcoming.length === 0)
    return (
      <div className="card text-center py-8">
        <CalendarDays size={32} className="text-gray-200 mx-auto mb-2"/>
        <p className="text-sm text-gray-400">No upcoming deadlines</p>
      </div>
    );

  return (
    <div className="card space-y-3">
      <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-orange-400 inline-block"/>Deadlines
      </h3>
      {overdue.map(p => (
        <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
          className="flex justify-between items-center rounded-lg px-3 py-2 bg-red-50 border border-red-100 cursor-pointer hover:bg-red-100 transition-colors">
          <div>
            <p className="text-xs font-semibold text-blue-600">{p.project_number}</p>
            <p className="text-sm text-gray-700 truncate max-w-[140px]">{p.customer_name}</p>
          </div>
          <span className="text-xs font-bold text-red-500">{p._d.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>
        </div>
      ))}
      {upcoming.map(p => {
        const diff = Math.ceil((p._d - today) / 86400000);
        return (
          <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
            className="flex justify-between items-center rounded-lg px-3 py-2 border border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors">
            <div>
              <p className="text-xs font-semibold text-blue-600">{p.project_number}</p>
              <p className="text-sm text-gray-700 truncate max-w-[140px]">{p.customer_name}</p>
            </div>
            <span className={`text-xs font-bold ${diff<=3?'text-orange-500':'text-gray-400'}`}>{diffLabel(p._d)}</span>
          </div>
        );
      })}
    </div>
  );
};

/* ─────────────────────────── Dashboard ─────────────────────────── */
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stats,          setStats]          = useState(null);
  const [allProjects,    setAllProjects]     = useState([]);
  const [recentProjects, setRecentProjects]  = useState([]);
  const [notes,          setNotes]           = useState([]);
  const [loading,        setLoading]         = useState(true);
  const [noteModal,      setNoteModal]       = useState(null); // { date, notes }

  const today = new Date();
  const [calMonth, setCalMonth] = useState({ year: today.getFullYear(), month: today.getMonth() });

  const loadNotes = useCallback(async (yr, mo) => {
    const m = `${yr}-${String(mo + 1).padStart(2,'0')}`;
    try {
      const res = await notesAPI.getByMonth(m);
      setNotes(res.data);
    } catch {}
  }, []);

  const handleMonthChange = useCallback((yr, mo) => {
    setCalMonth({ year: yr, month: mo });
    loadNotes(yr, mo);
  }, [loadNotes]);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, allRes, recentRes] = await Promise.all([
          analyticsAPI.getDashboard(),
          projectsAPI.getAll({ limit: 100 }),
          projectsAPI.getAll({ limit: 5 }),
        ]);
        setStats(statsRes.data);
        setAllProjects(allRes.data.projects || []);
        setRecentProjects(recentRes.data.projects || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
    loadNotes(today.getFullYear(), today.getMonth());
  }, [loadNotes]);

  const handleDayClick = (date, dayNotes) => {
    setNoteModal({ date, notes: dayNotes });
  };

  const handleSaveNote = async (data) => {
    try {
      const res = await notesAPI.create(data);
      const updated = [...notes, res.data];
      setNotes(updated);
      setNoteModal(prev => ({
        ...prev,
        notes: updated.filter(n => n.note_date === prev.date)
      }));
      toast.success('Note saved');
    } catch { toast.error('Failed to save note'); }
  };

  const handleDeleteNote = async (id) => {
    try {
      await notesAPI.remove(id);
      const updated = notes.filter(n => n.id !== id);
      setNotes(updated);
      setNoteModal(prev => ({
        ...prev,
        notes: updated.filter(n => n.note_date === prev.date)
      }));
      toast.success('Note deleted');
    } catch { toast.error('Failed to delete note'); }
  };

  const handleUpdateNote = async (id, data) => {
    try {
      const res = await notesAPI.update(id, data);
      const updated = notes.map(n => n.id === id ? res.data : n);
      setNotes(updated);
      setNoteModal(prev => prev ? ({
        ...prev,
        notes: updated.filter(n => n.note_date === prev.date)
      }) : prev);
      toast.success('Note updated');
    } catch { toast.error('Failed to update note'); }
  };

  const handleToggleNote = async (n) => {
    const newVal = !n.completed;
    setNotes(p => p.map(x => x.id === n.id ? { ...x, completed: newVal } : x));
    try {
      await notesAPI.update(n.id, { completed: newVal });
      toast.success(newVal ? 'Marked as completed' : 'Marked as incomplete');
    } catch {
      setNotes(p => p.map(x => x.id === n.id ? { ...x, completed: !newVal } : x));
      toast.error('Failed to update');
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  );

  const p = stats?.projects || {};

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-gray-500 text-sm">Welcome back, {user?.full_name}</p>
        </div>
        <button onClick={() => navigate('/projects/new')} className="btn-primary flex items-center gap-2">
          <Plus size={18}/> New Project
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:'Total Projects', value: p.total     || 0, icon: FolderKanban, color:'bg-blue-600' },
          { label:'Running',        value: p.active    || 0, icon: Clock,        color:'bg-orange-500' },
          { label:'Completed',      value: p.completed || 0, icon: CheckCircle,  color:'bg-green-600' },
          { label:'Delayed',        value: p.delayed   || 0, icon: AlertTriangle,color:'bg-red-500' },
        ].map(c => (
          <div key={c.label} className="card flex items-start gap-4">
            <div className={`p-3 rounded-xl ${c.color}`}><c.icon size={22} className="text-white"/></div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{c.value}</p>
              <p className="text-sm text-gray-500">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Calendar + Deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Calendar projects={allProjects} notes={notes} onDayClick={handleDayClick} onMonthChange={handleMonthChange} />
        </div>
        <UpcomingDeadlines projects={allProjects} navigate={navigate} />
      </div>

      {/* Monthly Notes List */}
      <MonthNotesList
        notes={notes}
        onDateClick={handleDayClick}
        onNoteNavigate={(date) => navigate(`/notes/${date}`)}
        onToggleComplete={handleToggleNote}
        month={calMonth.month}
        year={calMonth.year}
      />

      {/* Recent Projects */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-800">Recent Projects</h3>
          <button onClick={() => navigate('/projects')} className="text-sm text-blue-600 hover:underline">View all →</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Project No.','Customer','Company','Stage','Status','Progress'].map(h => (
                  <th key={h} className="text-left py-2 text-gray-400 font-medium text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentProjects.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-400">No projects yet</td></tr>
              ) : recentProjects.map(proj => (
                <tr key={proj.id} onClick={() => navigate(`/projects/${proj.id}`)}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                  <td className="py-3 text-blue-600 font-semibold">{proj.project_number}</td>
                  <td className="py-3 text-gray-800">{proj.customer_name}</td>
                  <td className="py-3 text-gray-500">{proj.company_name}</td>
                  <td className="py-3 text-gray-500">{proj.current_stage}/19</td>
                  <td className="py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLE[proj.status]||'bg-gray-100 text-gray-400'}`}>
                      {proj.status}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-100 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{width:`${proj.progress_percentage}%`}}/>
                      </div>
                      <span className="text-xs text-gray-500">{proj.progress_percentage}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Note Modal */}
      {noteModal && (
        <NoteModal
          date={noteModal.date}
          notes={noteModal.notes}
          onClose={() => setNoteModal(null)}
          onSave={handleSaveNote}
          onDelete={handleDeleteNote}
          onUpdate={handleUpdateNote}
        />
      )}

    </div>
  );
}
