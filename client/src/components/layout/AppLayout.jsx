import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ROLE_LABELS } from "../../utils/constants";
import styles from "./AppLayout.module.css";

const NAV = [
  { to: "/dashboard", label: "Dashboard", roles: ["loan_officer", "admin"] },
  { to: "/review", label: "Review queue", roles: ["loan_officer", "admin"] },
  { to: "/my-applications", label: "My applications", roles: ["applicant"] },
  { to: "/apply", label: "New application", roles: ["applicant", "loan_officer", "admin"] },
  { to: "/model-insights", label: "Model insights", roles: ["applicant", "loan_officer", "admin"] },
  { to: "/fairness", label: "Fairness report", roles: ["admin"], group: "Governance" },
  { to: "/audit-logs", label: "Audit trail", roles: ["admin"], group: "Governance" },
  { to: "/users", label: "Users", roles: ["admin"], group: "Governance" },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "1"
  );
  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const items = NAV.filter((n) => n.roles.includes(user.role));
  const main = items.filter((n) => !n.group);
  const governance = items.filter((n) => n.group === "Governance");
  const renderLink = (n) => (
    <NavLink
      key={n.to}
      to={n.to}
      aria-label={n.label}
      title={collapsed ? n.label : undefined}
      className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}
    >
      <span className={styles.icon} aria-hidden="true">{n.label[0]}</span>
      <span className={styles.text}>{n.label}</span>
    </NavLink>
  );

  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>Skip to content</a>
      <aside className={`${styles.sidebar} ${open ? styles.open : ""} ${collapsed ? styles.collapsed : ""}`} aria-label="Main navigation">
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">S</span>
          <div className={styles.brandText}>
            <strong>Scorion</strong>
            <span>Explainable credit scoring</span>
          </div>
        </div>
        <button
          type="button"
          className={styles.collapse}
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-controls="app-nav"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span aria-hidden="true">{collapsed ? "»" : "«"}</span>
          <span className={styles.text}>Collapse</span>
        </button>
        <nav id="app-nav" className={styles.nav}>
          {main.map(renderLink)}
          {governance.length > 0 && <p className={styles.group}><span className={styles.text}>Governance</span></p>}
          {governance.map(renderLink)}
        </nav>
        <div className={styles.user}>
          <div className={styles.userInfo}>
            <strong>{user.name}</strong>
            <span>{ROLE_LABELS[user.role]}</span>
          </div>
          <button className={styles.logout} onClick={logout} aria-label="Sign out" title="Sign out">
            <span className={styles.logoutIcon} aria-hidden="true">⏻</span>
            <span className={styles.text}>Sign out</span>
          </button>
        </div>
      </aside>
      {open && <button className={styles.scrim} aria-label="Close menu" onClick={() => setOpen(false)} />}

      <div className={styles.column}>
        <header className={styles.topbar}>
          <button className={styles.menu} onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}>
            <span /><span /><span />
          </button>
          <span className={styles.topTitle}>Saral Credit</span>
        </header>
        <main id="main" className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
