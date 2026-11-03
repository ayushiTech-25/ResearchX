import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Activity, ArrowUpRight, BookMarked, BookOpen, BrainCircuit, ChevronDown, Command, Compass, FlaskConical, LayoutDashboard, LogOut, Menu, Moon, Network, Search, Settings, Sun, UserRound, UsersRound, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";
import { useToast } from "./Toast";

const links = [
  { title: "Overview", items: [
    { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
    { label: "Discover papers", to: "/papers", icon: BookOpen },
    { label: "Researchers", to: "/researchers", icon: UsersRound },
    { label: "Research trends", to: "/trends", icon: Activity },
  ] },
  { title: "Your workspace", items: [
    { label: "AI assistant", to: "/assistant", icon: BrainCircuit },
    { label: "Paper analyzer", to: "/analyzer", icon: FlaskConical },
    { label: "Research network", to: "/network", icon: Network },
    { label: "Saved research", to: "/saved", icon: BookMarked },
  ] },
];

const titleMap: Record<string, string> = {
  "/dashboard": "Dashboard", "/papers": "Discover papers", "/researchers": "Researcher explorer",
  "/trends": "Research trends", "/assistant": "AI research assistant", "/analyzer": "AI paper analyzer",
  "/network": "Research network", "/saved": "Saved research", "/workspace": "Research workspace",
  "/profile": "Your profile", "/settings": "Settings", "/login": "Welcome back", "/register": "Create your account",
};

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem("researchos-theme") === "dark");
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notify = useToast();
  const userQuery = useQuery({ queryKey: ["auth", "me"], queryFn: api.me, retry: false });
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => { queryClient.setQueryData(["auth", "me"], null); navigate("/login"); },
    onError: (error: Error) => notify(error.message, "error"),
  });
  const title = titleMap[location.pathname]
    ?? (location.pathname.startsWith("/researchers/") ? "Researcher profile" : location.pathname.startsWith("/papers/") ? "Paper details" : "Research workspace");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("researchos-theme", next ? "dark" : "light");
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><BrainCircuit size={21} strokeWidth={2.1} /></div>
          <div><span className="brand-name">Research<span>X</span></span><span className="brand-caption">INTELLIGENCE PLATFORM</span></div>
          <button className="icon-button mobile-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={19} /></button>
        </div>
        <div className="workspace-switch"><div className="workspace-avatar">A</div><div className="workspace-meta"><strong>Academic workspace</strong><span>Personal plan</span></div><ChevronDown size={16} className="text-slate-400" /></div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {links.map((group) => <div className="nav-group" key={group.title}>
            <p className="nav-heading">{group.title}</p>
            {group.items.map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link${isActive ? " nav-link-active" : ""}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === "AI assistant" && <span className="nav-new">AI</span>}</NavLink>)}
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="upgrade-card"><div className="upgrade-icon"><Command size={16} /></div><strong>Research, accelerated.</strong><p>Make sense of the literature with AI.</p><NavLink to="/assistant">Explore AI tools <ArrowUpRight size={14} /></NavLink></div>
          <NavLink to="/settings" className="nav-link"><Settings size={18} /><span>Settings</span></NavLink>
          <div className="user-row"><button className="user-profile" onClick={() => navigate("/profile")}><div className="user-avatar">{userQuery.data?.user?.name?.[0]?.toUpperCase() ?? "R"}</div><div className="user-meta"><strong>{userQuery.isLoading ? "Checking account…" : userQuery.isError ? "Account unavailable" : userQuery.data?.user?.name ?? "Researcher"}</strong><span>{userQuery.data?.user?.email ?? (userQuery.isError ? "Could not verify sign-in" : "Sign in to sync")}</span></div></button>{userQuery.data?.user && <button className="logout-icon" aria-label="Sign out" disabled={logout.isPending} onClick={() => logout.mutate()}><LogOut size={15} /></button>}</div>
        </div>
      </aside>
      {mobileOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{title}</strong></div></div>
          <div className="topbar-right"><NavLink to="/papers" className="global-search"><Search size={16} /><span>Search research...</span><kbd>⌘ K</kbd></NavLink><span className="topbar-divider" /><button className="icon-button theme-toggle" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={toggleTheme}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button><NavLink to="/profile" className="header-user">{userQuery.data?.user?.name?.[0]?.toUpperCase() ?? <UserRound size={17} />}</NavLink></div>
        </header>
        <div className="page-content"><Outlet /></div>
      </main>
    </div>
  );
}

export function AuthLayout() {
  const location = useLocation();
  const isRegister = location.pathname === "/register";
  return <div className="auth-shell"><div className="auth-brand"><div className="brand-mark"><BrainCircuit size={21} /></div><span className="brand-name">Research<span>X</span></span></div><div className="auth-content"><Outlet /></div><div className="auth-aside"><div className="auth-glow" /><div className="auth-aside-inner"><div className="auth-kicker"><Compass size={16} /> RESEARCH, REIMAGINED</div><h2>{isRegister ? "Your next discovery starts here." : "Make the literature work for you."}</h2><p>One calm, intelligent workspace for finding the signal in scientific research.</p><div className="auth-quote"><div className="quote-orbit">✳</div><p>“A good research question is already half the answer.”</p><span>— ResearchX field notes</span></div><div className="auth-footnote">Built for the curious minds moving science forward.</div></div></div></div>;
}
