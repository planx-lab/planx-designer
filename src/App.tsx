import { LayoutDashboard, Workflow, Activity, GitBranch, Cpu } from 'lucide-react';
import { useUIStore, type ViewId } from '@/stores/useUIStore';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { DesignerView } from '@/components/DesignerView';

const navItems: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'designer', label: 'Designer', icon: Workflow },
  { id: 'executions', label: 'Executions', icon: Activity },
  { id: 'pipelines', label: 'Pipelines', icon: GitBranch },
  { id: 'plugins', label: 'Plugins', icon: Cpu },
];

function TenantInput() {
  const tenantId = usePipelineStore((s) => s.tenantId);
  const setTenantId = usePipelineStore((s) => s.setTenantId);
  return (
    <input
      type="text"
      value={tenantId}
      onChange={(e) => setTenantId(e.target.value)}
      placeholder="Tenant ID"
      className="bg-transparent text-xs text-foreground/40 placeholder:text-foreground/20 focus:outline-none w-28 text-right border-b border-transparent focus:border-border"
    />
  );
}

function PlaceholderView({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-full text-foreground/30 text-sm">
      {name} &mdash; coming soon
    </div>
  );
}

export function App() {
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* Top-level navigation bar */}
      <header className="h-12 shrink-0 border-b border-border bg-surface flex items-center px-4 gap-1">
        {/* Logo */}
        <span className="font-mono font-semibold text-sm text-foreground mr-4">
          Planx <span className="text-accent">x</span>
        </span>

        {/* Nav tabs */}
        <nav className="flex items-center gap-0.5">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveView(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeView === id
                  ? 'bg-accent/15 text-accent'
                  : 'text-foreground/40 hover:text-foreground/60 hover:bg-surface-hover'
              }`}
            >
              <Icon size={14} />
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
        {activeView === 'dashboard' && <PlaceholderView name="Dashboard" />}
        {activeView === 'designer' && <DesignerView />}
        {activeView === 'executions' && <PlaceholderView name="Executions" />}
        {activeView === 'pipelines' && <PlaceholderView name="Pipelines" />}
        {activeView === 'plugins' && <PlaceholderView name="Plugins" />}
      </main>
    </div>
  );
}

export default App;
