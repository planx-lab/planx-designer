import { LayoutDashboard, Workflow, Activity, GitBranch, Cpu } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ViewId } from '@/stores/useUIStore';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { DesignerView } from '@/components/DesignerView';
import { Dashboard } from '@/components/admin/Dashboard';
import { ExecutionsPage } from '@/components/admin/ExecutionsPage';
import { PipelinesPage } from '@/components/admin/PipelinesPage';
import { PluginsPage } from '@/components/admin/PluginsPage';

const navItems: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'designer', label: 'Designer', icon: Workflow },
  { id: 'executions', label: 'Executions', icon: Activity },
  { id: 'pipelines', label: 'Pipelines', icon: GitBranch },
  { id: 'plugins', label: 'Plugins', icon: Cpu },
];

/** Map the URL pathname to a ViewId (default: designer). */
function pathnameToView(pathname: string): ViewId {
  const seg = pathname.replace(/^\//, '').split('/')[0];
  if (seg && navItems.some((n) => n.id === seg)) return seg as ViewId;
  return 'designer';
}

function TenantInput() {
  const tenantId = usePipelineStore((s) => s.tenantId);
  const setTenantId = usePipelineStore((s) => s.setTenantId);
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor="tenant-id" className="text-xs text-foreground/50 font-medium">Tenant</label>
      <input
        id="tenant-id"
        type="text"
        value={tenantId}
        onChange={(e) => setTenantId(e.target.value)}
        placeholder="Tenant ID"
        aria-label="Tenant ID"
        className="bg-transparent text-xs text-foreground/80 placeholder:text-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent rounded px-1 w-28 text-right border-b border-transparent focus:border-accent"
      />
    </div>
  );
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeView = pathnameToView(location.pathname);

  const setActiveView = (v: ViewId) => navigate(`/${v === 'designer' ? '' : v}`);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* Top-level navigation bar */}
      <header className="h-12 shrink-0 border-b border-border bg-surface flex items-center px-4 gap-1">
        {/* Logo */}
        <span className="font-mono font-semibold text-sm text-foreground mr-4">
          Planx <span className="text-accent">x</span>
        </span>

        {/* Nav tabs */}
        <nav className="flex items-center gap-0.5" aria-label="Primary">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveView(id)}
              aria-current={activeView === id ? 'page' : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                activeView === id
                  ? 'bg-accent/15 text-accent'
                  : 'text-foreground/60 hover:text-foreground hover:bg-surface-hover'
              }`}
            >
              <Icon size={14} aria-hidden />
              {label}
            </button>
          ))}
        </nav>

        {/* Spacer + tenant ID (right side) */}
        <div className="flex-1" />
        <TenantInput />
      </header>

      {/* View content — full height below nav */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {activeView === 'dashboard' && <div className="flex-1 min-h-0 overflow-auto"><Dashboard /></div>}
        <div className={activeView === 'designer' ? 'flex-1 min-h-0 overflow-hidden' : 'hidden'}>
          <DesignerView />
        </div>
        {activeView === 'executions' && <div className="flex-1 min-h-0 overflow-auto"><ExecutionsPage /></div>}
        {activeView === 'pipelines' && <div className="flex-1 min-h-0 overflow-auto"><PipelinesPage /></div>}
        {activeView === 'plugins' && <div className="flex-1 min-h-0 overflow-auto"><PluginsPage /></div>}
      </main>
    </div>
  );
}

export default App;
