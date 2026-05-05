import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, FolderKanban, BarChart3,
  Users, ClipboardList, ChevronLeft, ChevronRight, X
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/audit-log', label: 'Audit Log', icon: ClipboardList },
];

export default function Sidebar({ open, setOpen }) {
  const { user } = useAuth();

  return (
    <>
      {/* Mobile: full drawer */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-blue-900 text-white flex flex-col transform transition-transform duration-300
        md:hidden
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between h-16 px-4 border-b border-blue-800">
          <div>
            <p className="font-bold text-lg leading-tight">SST</p>
            <p className="text-blue-300 text-xs">App Management</p>
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-blue-800">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(item => {
            if (item.roles && !item.roles.includes(user?.role)) return null;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-sm font-medium
                  ${isActive ? 'bg-blue-700 text-white' : 'text-blue-200 hover:bg-blue-800 hover:text-white'}`
                }
              >
                <item.icon size={22} className="flex-shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-blue-800 p-3">
          <NavLink
            to="/profile"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-2 py-2 rounded-lg transition-colors
              ${isActive ? 'bg-blue-700' : 'hover:bg-blue-800'}`
            }
          >
            <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold">{user?.full_name?.[0]?.toUpperCase()}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.full_name}</p>
              <p className="text-xs text-blue-300 capitalize">{user?.role}</p>
            </div>
          </NavLink>
        </div>
      </aside>

      {/* Desktop: collapsible sidebar */}
      <aside className={`
        hidden md:flex
        ${open ? 'w-64' : 'w-16'} transition-all duration-300 bg-blue-900 text-white flex-col flex-shrink-0
      `}>
        <div className="flex items-center justify-between h-16 px-4 border-b border-blue-800">
          {open && (
            <div>
              <p className="font-bold text-lg leading-tight">SST</p>
              <p className="text-blue-300 text-xs">App Management</p>
            </div>
          )}
          <button
            onClick={() => setOpen(!open)}
            className="p-1.5 rounded-lg hover:bg-blue-800 transition-colors ml-auto"
          >
            {open ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>

        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(item => {
            if (item.roles && !item.roles.includes(user?.role)) return null;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium
                  ${isActive ? 'bg-blue-700 text-white' : 'text-blue-200 hover:bg-blue-800 hover:text-white'}`
                }
              >
                <item.icon size={20} className="flex-shrink-0" />
                {open && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-blue-800 p-3">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex items-center gap-3 px-2 py-2 rounded-lg transition-colors
              ${isActive ? 'bg-blue-700' : 'hover:bg-blue-800'}`
            }
          >
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold">{user?.full_name?.[0]?.toUpperCase()}</span>
            </div>
            {open && (
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{user?.full_name}</p>
                <p className="text-xs text-blue-300 capitalize">{user?.role}</p>
              </div>
            )}
          </NavLink>
        </div>
      </aside>
    </>
  );
}
