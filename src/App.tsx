import { useState } from 'react';
import {
  LayoutDashboard,
  Workflow,
  Activity,
  GitBranch,
  Cpu,
  Menu,
  X,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ViewId } from '@/stores/useUIStore';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { setTenant } from '@/hooks/queries';
import { DesignerView } from '@/components/DesignerView';
import { Dashboard } from '@/components/admin/Dashboard';
import { ExecutionsPage } from '@/components/admin/ExecutionsPage';
import { PipelinesPage } from '@/components/admin/PipelinesPage';
import { PluginsPage } from '@/components/admin/PluginsPage';
import { StatusIndicator } from '@/components/shell/StatusIndicator';

// Nav items grouped by intent (unified-ui-design.md §4.1/§4.2): Build is the
// authoring workspace; Operate is the monitoring suite. Separating the two in
// the sidebar answers "which mode am I in?" at a glance.
type NavGroup = { label: string; items: NavItem[] };
type NavItem = { id: ViewId; label: string; icon: typeof LayoutDashboard };

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'BUILD',
    items: [{ id: 'designer', label: 'Designer', icon: Workflow }],
  },
  {
    label: 'OPERATE',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'executions', label: 'Executions', icon: Activity },
      { id: 'pipelines', label: 'Pipelines', icon: GitBranch },
      { id: 'plugins', label: 'Plugins', icon: Cpu },
    ],
  },
];

const ALL_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Map the URL pathname to a ViewId (default: designer). */
function pathnameToView(pathname: string): ViewId {
  const seg = pathname.replace(/^\//, '').split('/')[0];
  if (seg && ALL_ITEMS.some((n) => n.id === seg)) return seg as ViewId;
  return 'designer';
}

function TenantInput() {
  // Bind to usePipelineStore.tenantId (the source already wired to submitPipeline
  // API calls) and persist to localStorage on change so getTenant() — used by
  // useHealth/useExecutions — stays in sync. (unified-ui-design.md §4.2; this
  // also resolves the latent drift between the three tenant copies.)
  const tenantId = usePipelineStore((s) => s.tenantId);
  const setTenantId = usePipelineStore((s) => s.setTenantId);
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor="tenant-id" className="text-xs text-foreground/50 font-medium">
        Tenant
      </label>
      <input
        id="tenant-id"
        type="text"
        value={tenantId}
        onChange={(e) => {
          const next = e.target.value;
          setTenant(next);
          setTenantId(next);
        }}
        placeholder="Tenant ID"
        aria-label="Tenant ID"
        className="bg-transparent text-xs text-foreground/80 placeholder:text-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent rounded px-1 w-28 text-right border-b border-transparent focus:border-accent"
      />
    </div>
  );
}

function Sidebar({
  activeView,
  onNavigate,
}: {
  activeView: ViewId;
  onNavigate: (v: ViewId) => void;
}) {
  return (
    <nav className="flex flex-col gap-4 p-3" aria-label="Primary">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <span className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-foreground/40">
            {group.label}
          </span>
          {group.items.map(({ id, label, icon: Icon }) => {
            const active = activeView === id;
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2 px-2 py-1.5 text-sm font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  active
                    ? 'bg-accent/15 text-accent'
                    : 'text-foreground/70 hover:text-foreground hover:bg-surface-hover'
                }`}
              >
                <Icon size={16} aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeView = pathnameToView(location.pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const setActiveView = (v: ViewId) => {
    navigate(`/${v === 'designer' ? '' : v}`);
    setSidebarOpen(false);
  };

  return (
    <div className="h-screen flex bg-background text-foreground">
      {/* Sidebar — fixed left rail on md+, slide-over on mobile. */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-56 shrink-0 border-r border-border bg-surface transform transition-transform duration-200 md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-12 items-center justify-between px-4 border-b border-border">
          <span className="font-mono font-semibold text-sm text-foreground">
            Planx <span className="text-accent">x</span>
          </span>
          <button
            className="md:hidden text-foreground/60 hover:text-foreground"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        </div>
        <Sidebar activeView={activeView} onNavigate={setActiveView} />
      </aside>

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* Main column: top bar + view content. */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-12 shrink-0 border-b border-border bg-surface flex items-center px-4 gap-3">
          {/* Hamburger (mobile only) */}
          <button
            className="md:hidden text-foreground/70 hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>

          <div className="flex-1" />

          <StatusIndicator />
          <div className="w-px h-5 bg-border" />
          <TenantInput />
        </header>

        {/* View content — full height below the top bar. */}
        <main className="flex-1 min-h-0 overflow-hidden">
          {activeView === 'dashboard' && (
            <div className="flex-1 min-h-0 overflow-auto">
              <Dashboard />
            </div>
          )}
          <div className={activeView === 'designer' ? 'flex-1 min-h-0 overflow-hidden' : 'hidden'}>
            <DesignerView />
          </div>
          {activeView === 'executions' && (
            <div className="flex-1 min-h-0 overflow-auto">
              <ExecutionsPage />
            </div>
          )}
          {activeView === 'pipelines' && (
            <div className="flex-1 min-h-0 overflow-auto">
              <PipelinesPage />
            </div>
          )}
          {activeView === 'plugins' && (
            <div className="flex-1 min-h-0 overflow-auto">
              <PluginsPage />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
