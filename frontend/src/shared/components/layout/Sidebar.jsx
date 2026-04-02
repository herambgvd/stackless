import { useState, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Bell,
  Bot,
  BookOpen,
  Box,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Cpu,
  FileText,
  FolderOpen,
  GitBranch,
  Grid3X3,
  HardDrive,
  Inbox,
  Key,
  LayoutDashboard,
  LayoutTemplate,
  Layers,
  Mail,
  MessageSquare,
  Network,
  Package,
  Paintbrush,
  Pencil,
  Play,
  Plug,
  ScrollText,
  Settings2,
  Shield,
  ShieldCheck,
  Sparkles,
  Table2,
  Terminal,
  UserCheck,
  UserCog,
  Users,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BarChart2,
  Workflow,
  Zap,
  BriefcaseBusiness,
  Wrench,
  Radio,
  BadgeCheck,
  Building2,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useAuthStore } from "@/shared/store/auth.store";
import { schemaApi } from "@/apps/app-builder/api/schema.api";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";

// ── Plain nav item ──────────────────────────────────────────────────────────

function NavItem({ label, icon, to, isActive, collapsed, indent }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={to}
          className={cn(
            "flex items-center gap-2.5 rounded-md py-1.5 text-sm font-medium transition-colors",
            indent ? "px-2" : "px-3",
            isActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {icon}
          {!collapsed && <span className="truncate">{label}</span>}
        </Link>
      </TooltipTrigger>
      {collapsed && <TooltipContent side="right">{label}</TooltipContent>}
    </Tooltip>
  );
}

// ── Collapsible nav group (dropdown) ─────────────────────────────────────────

function NavGroup({ label, icon, items, currentPath, collapsed, isOpen, onOpen, onForceOpen }) {
  const hasActive = items.some((item) =>
    item.exact
      ? currentPath === item.to
      : currentPath === item.to || currentPath.startsWith(item.to + "/"),
  );

  // Auto-expand this group when a child route becomes active (without toggling)
  useEffect(() => {
    if (hasActive) onForceOpen();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActive]);

  // Collapsed sidebar — render individual icon pills
  if (collapsed) {
    return (
      <>
        {items.map((item) => {
          const isActive = item.exact
            ? currentPath === item.to
            : currentPath === item.to || currentPath.startsWith(item.to + "/");
          return (
            <NavItem
              key={item.to}
              label={item.label}
              icon={<item.icon className="h-4 w-4" />}
              to={item.to}
              isActive={isActive}
              collapsed
            />
          );
        })}
      </>
    );
  }

  return (
    <div>
      {/* Group header button */}
      <button
        onClick={onOpen}
        className={cn(
          "w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors select-none",
          hasActive
            ? "text-primary"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        <span className={cn("h-4 w-4 shrink-0", hasActive ? "text-primary" : "text-muted-foreground/60")}>
          {icon}
        </span>
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-150",
            isOpen ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>

      {/* Children */}
      {isOpen && (
        <div className="ml-3 mt-0.5 mb-1 space-y-0.5 border-l border-border/60 pl-2">
          {items.map((item) => {
            const isActive = item.exact
              ? currentPath === item.to
              : currentPath === item.to || currentPath.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── App nav item with expandable sub-items ──────────────────────────────────

function AppNavItem({ app, currentPath, collapsed, isBuilder }) {
  const isAppActive = currentPath.startsWith(`/apps/${app.id}`);
  const [open, setOpen] = useState(isAppActive);
  if (isAppActive && !open) setOpen(true);

  const subItems = [
    { label: "Records", icon: Table2, suffix: "/records" },
    ...(isBuilder
      ? [
          { label: "Schema Builder", icon: Pencil, suffix: "/builder" },
          { label: "Flow Designer", icon: Workflow, suffix: "/flow" },
        ]
      : []),
  ];

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to={`/apps/${app.id}/records`}
            className={cn(
              "flex items-center justify-center rounded-md p-2 transition-colors",
              isAppActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Box
              className="h-4 w-4"
              style={{ color: isAppActive ? undefined : app.color || undefined }}
            />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{app.name}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isAppActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        <Box
          className="h-4 w-4 shrink-0"
          style={{ color: app.color || undefined }}
        />
        <span className="flex-1 truncate text-left">{app.name}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-2">
          {subItems.map((sub) => {
            const to = `/apps/${app.id}${sub.suffix}`;
            const subActive = currentPath.startsWith(to);
            return (
              <Link
                key={sub.suffix}
                to={to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  subActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <sub.icon className="h-3.5 w-3.5 shrink-0" />
                <span>{sub.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Thin divider between sections ───────────────────────────────────────────

function Divider() {
  return <div className="my-1 border-t border-border/40" />;
}

// ── Main Sidebar ────────────────────────────────────────────────────────────

export function Sidebar({ collapsed, onToggle }) {
  const { location } = useRouterState();
  const { user } = useAuthStore();
  const currentPath = location.pathname;
  const [openGroup, setOpenGroup] = useState(() => {
    const p = location.pathname;
    if (["/tasks", "/approvals/inbox", "/calendar"].some(r => p === r || p.startsWith(r + "/"))) return "mywork";
    if (["/apps", "/ai-builder", "/templates", "/scripts", "/print-formats"].some(r => p === r || p.startsWith(r + "/"))) return "build";
    if (["/rules", "/approvals/flows", "/workflow-templates", "/workflows/runs"].some(r => p === r || p.startsWith(r + "/"))) return "automation";
    if (["/notifications", "/email-campaigns", "/email-inbox", "/desk-chat"].some(r => p === r || p.startsWith(r + "/"))) return "communication";
    if (["/settings/profile", "/settings/security", "/api-keys", "/settings/letter-heads", "/settings/branding", "/settings/email-config", "/settings/tenant-config", "/integrations", "/billing"].some(r => p === r || p.startsWith(r + "/"))) return "account";
    if (p.startsWith("/admin/")) return "administration";
    return "mywork";
  });

  const isSuperAdmin = user?.is_superuser;
  const isOrgAdmin = user?.is_superuser || user?.roles?.includes("admin");
  const isBuilder =
    isOrgAdmin ||
    user?.roles?.includes("builder") ||
    user?.roles?.includes("Builder");

  const { data: apps = [] } = useQuery({
    queryKey: ["sidebar", "apps"],
    queryFn: () => schemaApi.listApps(),
    enabled: !isSuperAdmin,
    staleTime: 30_000,
  });

  const initials = user?.full_name
    ? user.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "??";

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex h-full flex-col border-r border-border bg-card transition-all duration-200",
          collapsed ? "w-[56px]" : "w-60",
        )}
      >
        {/* ── Logo ── */}
        {collapsed ? (
          <div className="flex h-14 items-center justify-center border-b border-border shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onToggle}
                  className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors"
                  aria-label="Expand sidebar"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand</TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <div className="flex h-14 items-center gap-2.5 border-b border-border px-3 shrink-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
              <Zap className="h-4 w-4" />
            </div>
            <span className="font-semibold text-foreground text-base flex-1">Stackless</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onToggle}
                  className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors shrink-0"
                  aria-label="Collapse sidebar"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Collapse</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* ── Navigation ── */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {isSuperAdmin ? (

            /* ── Super Admin ── */
            <>
              {!collapsed && (
                <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest select-none">
                  Platform
                </p>
              )}
              <NavItem label="Organizations" icon={<Building2 className="h-4 w-4" />} to="/admin/tenants"
                isActive={currentPath.startsWith("/admin/tenants")} collapsed={collapsed} />
              <NavItem label="Packages" icon={<Package className="h-4 w-4" />} to="/admin/packages"
                isActive={currentPath.startsWith("/admin/packages")} collapsed={collapsed} />
              <NavItem label="Usage & Metering" icon={<BarChart2 className="h-4 w-4" />} to="/admin/usage"
                isActive={currentPath.startsWith("/admin/usage")} collapsed={collapsed} />

              <Divider />

              {!collapsed && (
                <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest select-none">
                  Configuration
                </p>
              )}
              <NavItem label="AI Settings" icon={<Bot className="h-4 w-4" />} to="/admin/ai-config"
                isActive={currentPath.startsWith("/admin/ai-config")} collapsed={collapsed} />
              <NavItem label="Background Jobs" icon={<Cpu className="h-4 w-4" />} to="/admin/jobs"
                isActive={currentPath.startsWith("/admin/jobs")} collapsed={collapsed} />

              <Divider />

              {!collapsed && (
                <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest select-none">
                  Logs
                </p>
              )}
              <NavItem label="Error Logs" icon={<AlertCircle className="h-4 w-4" />} to="/admin/error-logs"
                isActive={currentPath.startsWith("/admin/error-logs")} collapsed={collapsed} />
              <NavItem label="Request Log" icon={<Network className="h-4 w-4" />} to="/admin/request-logs"
                isActive={currentPath.startsWith("/admin/request-logs")} collapsed={collapsed} />
              <NavItem label="Audit Logs" icon={<ScrollText className="h-4 w-4" />} to="/admin/audit-logs"
                isActive={currentPath.startsWith("/admin/audit-logs")} collapsed={collapsed} />
            </>

          ) : (
            <>
              {/* Dashboard — always top-level */}
              <NavItem
                label="Dashboard"
                icon={<LayoutDashboard className="h-4 w-4" />}
                to="/dashboard"
                isActive={currentPath === "/dashboard" || currentPath.startsWith("/dashboard/")}
                collapsed={collapsed}
              />

              <Divider />

              {/* ── APPS ── */}
              {!collapsed && (
                <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest select-none">
                  Apps
                </p>
              )}
              {apps.length === 0
                ? !collapsed && (
                    <p className="px-3 py-1.5 text-xs text-muted-foreground/50 italic">
                      {isBuilder ? "No apps yet" : "No apps assigned"}
                    </p>
                  )
                : apps.map((app) => (
                    <AppNavItem
                      key={app.id}
                      app={app}
                      currentPath={currentPath}
                      collapsed={collapsed}
                      isBuilder={isBuilder}
                    />
                  ))}

              <Divider />

              {/* ── MY WORK ── */}
              <NavGroup
                label="My Work"
                icon={<BriefcaseBusiness className="h-4 w-4" />}
                currentPath={currentPath}
                collapsed={collapsed}
                isOpen={openGroup === "mywork"}
                onOpen={() => setOpenGroup(g => g === "mywork" ? null : "mywork")}
                onForceOpen={() => setOpenGroup("mywork")}
                items={[
                  { label: "My Tasks",       icon: ClipboardList, to: "/tasks" },
                  { label: "Approval Inbox", icon: Inbox,         to: "/approvals/inbox" },
                  { label: "Calendar",       icon: CalendarDays,  to: "/calendar" },
                ]}
              />

              {/* ── BUILD ── (builders + admins only) */}
              {isBuilder && (
                <>
                  <NavGroup
                    label="Build"
                    icon={<Wrench className="h-4 w-4" />}
                    currentPath={currentPath}
                    collapsed={collapsed}
                    isOpen={openGroup === "build"}
                    onOpen={() => setOpenGroup(g => g === "build" ? null : "build")}
                    onForceOpen={() => setOpenGroup("build")}
                    items={[
                      { label: "All Apps",      icon: Grid3X3,       to: "/apps", exact: true },
                      { label: "AI Builder",    icon: Sparkles,      to: "/ai-builder" },
                      { label: "Templates",     icon: Layers,        to: "/templates" },
                      { label: "Scripts",       icon: Terminal,      to: "/scripts" },
                      { label: "Print Formats", icon: FileText,      to: "/print-formats" },
                    ]}
                  />

                  {/* ── AUTOMATION ── */}
                  <NavGroup
                    label="Automation"
                    icon={<Workflow className="h-4 w-4" />}
                    currentPath={currentPath}
                    collapsed={collapsed}
                    isOpen={openGroup === "automation"}
                    onOpen={() => setOpenGroup(g => g === "automation" ? null : "automation")}
                    onForceOpen={() => setOpenGroup("automation")}
                    items={[
                      { label: "Rules Engine",      icon: BookOpen,       to: "/rules" },
                      { label: "Approval Flows",    icon: GitBranch,      to: "/approvals/flows" },
                      { label: "Wf. Templates",     icon: LayoutTemplate, to: "/workflow-templates" },
                      { label: "Workflow Runs",     icon: Play,           to: "/workflows/runs" },
                    ]}
                  />

                  {/* ── COMMUNICATION ── */}
                  <NavGroup
                    label="Communication"
                    icon={<Radio className="h-4 w-4" />}
                    currentPath={currentPath}
                    collapsed={collapsed}
                    isOpen={openGroup === "communication"}
                    onOpen={() => setOpenGroup(g => g === "communication" ? null : "communication")}
                    onForceOpen={() => setOpenGroup("communication")}
                    items={[
                      { label: "Notifications",   icon: Bell,          to: "/notifications" },
                      { label: "Email Campaigns", icon: Mail,          to: "/email-campaigns" },
                      { label: "Email Inbox",     icon: Inbox,         to: "/email-inbox" },
                      { label: "Desk Chat",       icon: MessageSquare, to: "/desk-chat" },
                    ]}
                  />
                </>
              )}

              <Divider />

              {/* ── ACCOUNT ── */}
              <NavGroup
                label="Account"
                icon={<BadgeCheck className="h-4 w-4" />}
                currentPath={currentPath}
                collapsed={collapsed}
                isOpen={openGroup === "account"}
                onOpen={() => setOpenGroup(g => g === "account" ? null : "account")}
                onForceOpen={() => setOpenGroup("account")}
                items={[
                  { label: "My Profile",     icon: UserCog,    to: "/settings/profile" },
                  { label: "Security (2FA)", icon: ShieldCheck, to: "/settings/security" },
                  { label: "Billing & Plan", icon: CreditCard,  to: "/billing" },
                  { label: "API Keys",       icon: Key,        to: "/api-keys" },
                  { label: "Letter Heads",   icon: FileText,   to: "/settings/letter-heads" },
                  ...(isOrgAdmin ? [
                    { label: "Branding",     icon: Paintbrush, to: "/settings/branding" },
                    { label: "Email Config", icon: Mail,       to: "/settings/email-config" },
                    { label: "Tenant Config", icon: Wrench,    to: "/settings/tenant-config" },
                  ] : []),
                  ...(isBuilder
                    ? [{ label: "Integrations", icon: Plug, to: "/integrations" }]
                    : []),
                ]}
              />

              {/* ── ADMINISTRATION ── (org admins only) */}
              {isOrgAdmin && (
                <NavGroup
                  label="Administration"
                  icon={<Shield className="h-4 w-4" />}
                  currentPath={currentPath}
                  collapsed={collapsed}
                  isOpen={openGroup === "administration"}
                  onOpen={() => setOpenGroup(g => g === "administration" ? null : "administration")}
                  onForceOpen={() => setOpenGroup("administration")}
                  items={[
                    { label: "User Management",     icon: UserCog,    to: "/admin/users" },
                    { label: "Roles & Permissions", icon: Shield,     to: "/admin/rbac" },
                    { label: "Role Profiles",       icon: UserCheck,  to: "/admin/role-profiles" },
                    { label: "Audit Logs",          icon: ScrollText, to: "/admin/audit-logs" },
                    { label: "Error Logs",          icon: AlertCircle, to: "/admin/error-logs" },
                    { label: "Request Log",         icon: Network,    to: "/admin/request-logs" },
                    { label: "Background Jobs",     icon: Cpu,        to: "/admin/jobs" },
                    { label: "System Console",      icon: Terminal,   to: "/admin/console" },
                    { label: "File Manager",        icon: FolderOpen, to: "/admin/files" },
                    { label: "Property Setter",     icon: Settings2,  to: "/admin/property-setter" },
                    { label: "DB Backup / Restore", icon: HardDrive,  to: "/admin/backup" },
                  ]}
                />
              )}
            </>
          )}
        </nav>

        {/* ── User footer ── */}
        <div className="border-t border-border p-2 space-y-1 shrink-0">
          {!collapsed && user && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{user.full_name}</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  {user.roles?.length > 0 && (
                    <span
                      className={cn(
                        "text-[9px] font-semibold px-1 py-0.5 rounded uppercase tracking-wide shrink-0",
                        isOrgAdmin
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          : isBuilder
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {isOrgAdmin ? "Admin" : user.roles[0]}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </aside>
    </TooltipProvider>
  );
}
