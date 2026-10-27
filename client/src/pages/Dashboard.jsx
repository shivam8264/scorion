import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { applicantApi } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import Button from "../components/ui/Button";
import { EmptyState, ErrorState, Loader } from "../components/ui/Feedback";
import { SelectField, TextField } from "../components/ui/Field";
import PageHeader from "../components/ui/PageHeader";
import Pagination from "../components/ui/Pagination";
import Panel from "../components/ui/Panel";
import StatTile from "../components/ui/StatTile";
import { STATUS_LABELS } from "../utils/constants";
import { formatDate, formatINR, formatNumber, formatPct, titleCase } from "../utils/format";
import styles from "./Dashboard.module.css";

function Kpis({ stats }) {
  const d = stats.byDecision;
  const total = stats.totals.n || 0;
  return (
    <div className={styles.kpis}>
      <StatTile label="Applications scored" value={formatNumber(total)} tone="primary"
        hint={`${formatPct(total ? stats.totals.sparse / total : 0)} with thin digital history`} />
      <StatTile label="Approved" value={formatNumber(d.approve || 0)} tone="approve" hint={formatPct(total ? (d.approve || 0) / total : 0)} />
      <StatTile label="Awaiting review" value={formatNumber(stats.byStatus.pending_review || 0)} tone="refer" hint="Referred by the model" />
      <StatTile label="Declined" value={formatNumber(d.decline || 0)} tone="decline" hint={formatPct(total ? (d.decline || 0) / total : 0)} />
      <StatTile label="Average credit score" value={Math.round(stats.totals.avgCreditScore || 0)}
        hint={`Mean default risk ${formatPct(stats.totals.avgRisk || 0)}`} />
    </div>
  );
}

function DailyChart({ daily }) {
  const data = useMemo(() => {
    const byDay = {};
    for (const r of daily) {
      byDay[r.day] ??= { day: r.day.slice(5), approve: 0, refer: 0, decline: 0 };
      byDay[r.day][r.decision] = r.n;
    }
    return Object.values(byDay);
  }, [daily]);
  if (!data.length) return <EmptyState title="No decisions in the last 14 days" />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="day" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip cursor={{ fill: "var(--color-surface-alt)" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar isAnimationActive={false} dataKey="approve" name="Approve" stackId="a" fill="var(--color-approve)" />
        <Bar isAnimationActive={false} dataKey="refer" name="Refer" stackId="a" fill="var(--color-refer)" />
        <Bar isAnimationActive={false} dataKey="decline" name="Decline" stackId="a" fill="var(--color-decline)" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ page: 1, limit: 15, status: "", decision: "", search: "", sort: "newest" });
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ""));
  const stats = useQuery({ queryKey: ["stats"], queryFn: applicantApi.stats });
  const list = useQuery({ queryKey: ["applicants", params], queryFn: () => applicantApi.list(params), placeholderData: keepPreviousData });

  const set = (e) => setFilters((f) => ({ ...f, [e.target.name]: e.target.value, page: 1 }));

  return (
    <>
      <PageHeader title="Loan officer dashboard" subtitle="Every application, its model decision and the evidence behind it."
        actions={<Button onClick={() => navigate("/apply")}>New application</Button>} />

      {stats.isLoading ? <Loader /> : stats.isError ? <ErrorState error={stats.error} onRetry={stats.refetch} /> : (
        <>
          <Kpis stats={stats.data} />
          <Panel title="Decisions per day" description="Model decisions over the last 14 days.">
            <DailyChart daily={stats.data.daily} />
          </Panel>
        </>
      )}

      <Panel title="Applications" padded={false} className={styles.tablePanel}>
        <div className={styles.filters}>
          <TextField label="Search by name" name="search" value={filters.search} onChange={set} placeholder="e.g. Meera" />
          <SelectField label="Status" name="status" value={filters.status} onChange={set} placeholder="All statuses"
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
          <SelectField label="Model decision" name="decision" value={filters.decision} onChange={set} placeholder="All decisions"
            options={[{ value: "approve", label: "Approve" }, { value: "refer", label: "Refer" }, { value: "decline", label: "Decline" }]} />
          <SelectField label="Sort" name="sort" value={filters.sort} onChange={set}
            options={[{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" },
              { value: "risk_desc", label: "Highest risk first" }, { value: "risk_asc", label: "Lowest risk first" }]} />
        </div>

        {list.isLoading ? <Loader /> : list.isError ? <ErrorState error={list.error} onRetry={list.refetch} /> :
          list.data.items.length === 0 ? (
            <EmptyState title="No applications match these filters" action={<Link to="/apply">Score a new application</Link>}>
              Clear the filters or submit an application to see it here.
            </EmptyState>
          ) : (
            <>
              <div className={styles.scroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Applicant</th><th>Employment</th><th className={styles.num}>Loan</th>
                      <th className={styles.num}>Score</th><th className={styles.num}>Default risk</th>
                      <th>Model decision</th><th>Status</th><th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.items.map((a) => (
                      <tr key={a._id} tabIndex={0} className={styles.clickable}
                        onClick={() => a.decision && navigate(`/decisions/${a.decision._id}`)}
                        onKeyDown={(e) => e.key === "Enter" && a.decision && navigate(`/decisions/${a.decision._id}`)}>
                        <td><strong>{a.fullName}</strong><span className={styles.sub}>{a.age} yrs, {titleCase(a.region)}</span></td>
                        <td>{titleCase(a.employmentType)}</td>
                        <td className={styles.num}>{formatINR(a.loanAmountRequested)}</td>
                        <td className={styles.num}>{a.decision?.creditScore ?? "-"}</td>
                        <td className={styles.num}>{a.decision ? formatPct(a.decision.riskScore) : "-"}</td>
                        <td><StatusBadge value={a.decision?.decision} /></td>
                        <td><StatusBadge value={a.status} /></td>
                        <td>{formatDate(a.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total}
                onChange={(page) => setFilters((f) => ({ ...f, page }))} />
            </>
          )}
      </Panel>
    </>
  );
}
