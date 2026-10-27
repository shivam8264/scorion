import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { applicantApi } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import Button from "../components/ui/Button";
import { EmptyState, QueryBoundary } from "../components/ui/Feedback";
import PageHeader from "../components/ui/PageHeader";
import { formatDate, formatINR, formatPct } from "../utils/format";
import styles from "./MyApplications.module.css";

export default function MyApplications() {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["mine"], queryFn: applicantApi.mine });
  return (
    <>
      <PageHeader title="My applications" subtitle="See every decision and the reasons behind it."
        actions={<Button onClick={() => navigate("/apply")}>Apply for a loan</Button>} />
      <QueryBoundary query={query}>
        {({ items }) =>
          items.length === 0 ? (
            <div className={styles.emptyWrap}>
              <EmptyState title="You have not applied yet" action={<Link to="/apply">Start an application</Link>}>
                It takes about three minutes. You will see your result and an explanation straight away.
              </EmptyState>
            </div>
          ) : (
            <ul className={styles.list}>
              {items.map((a) => {
                const d = a.latestDecision;
                return (
                  <li key={a._id} className={styles.item}>
                    <div className={styles.main}>
                      <strong>{formatINR(a.loanAmountRequested)} over {a.loanTenureMonths} months</strong>
                      <span>{a.loanPurpose || "General purpose"}, submitted {formatDate(a.createdAt)}</span>
                    </div>
                    <div className={styles.score}>
                      <span>Credit score</span>
                      <strong>{d?.creditScore ?? "-"}</strong>
                    </div>
                    <div className={styles.score}>
                      <span>Default risk</span>
                      <strong>{d ? formatPct(d.riskScore) : "-"}</strong>
                    </div>
                    <StatusBadge value={a.status} />
                    {d && <Link className={styles.link} to={`/decisions/${d._id}`}>View explanation</Link>}
                  </li>
                );
              })}
            </ul>
          )
        }
      </QueryBoundary>
    </>
  );
}
