import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api";
import { usePolling } from "../hooks/usePolling";
import { formatCount, formatRelative } from "../lib/format";
import { CommandPalette } from "./CommandPalette";
import { Icon, type IconName } from "./icons";

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "/", label: "Overview", icon: "overview", end: true },
  { to: "/queries", label: "Queries", icon: "queries" },
  { to: "/rules", label: "Rules", icon: "rules" },
  { to: "/system", label: "System", icon: "system" },
];

function isMac(): boolean {
  return typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.userAgent);
}

export function Layout() {
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const status = usePolling(api.system, 15000);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    setPaletteOpen(false);
  }, [location.pathname]);

  const section = NAV.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)));
  const online = status.data !== null && status.error === null;
  const rulesCount = status.data?.rules_count ?? null;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            n/
          </div>
          <div>
            <div className="brand-name">nullify</div>
            <div className="brand-sub">dns control</div>
          </div>
        </div>

        <nav className="nav" aria-label="Main">
          <div className="nav-label">Workspace</div>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              <Icon name={item.icon} size={15} />
              <span>{item.label}</span>
              {item.to === "/rules" && rulesCount !== null ? (
                <span className="nav-count">{formatCount(rulesCount)}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-line">
            <span className={`dot ${online ? "live" : "bad"}`} />
            {online ? "resolver online" : "api unreachable"}
          </div>
          <div className="status-line">
            {online && status.data ? `${formatCount(status.data.blocklist_size)} blocked domains` : "waiting for api"}
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            <span>nullify</span>
            <span aria-hidden="true">/</span>
            <span className="current">{section?.label.toLowerCase() ?? "dashboard"}</span>
          </div>

          <div className="topbar-right">
            <div className="topbar-status" title="Dashboard refresh state">
              <span className={`dot ${online ? "live" : "bad"}`} />
              <span>{online ? "api connected" : "offline"}</span>
              {status.updatedAt ? <span>· {formatRelative(status.updatedAt)}</span> : null}
            </div>
            <button
              type="button"
              className="search-trigger"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search pages and actions"
            >
              <Icon name="search" size={13} />
              <span>Search</span>
              <span className="kbd">{isMac() ? "⌘K" : "Ctrl K"}</span>
            </button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
