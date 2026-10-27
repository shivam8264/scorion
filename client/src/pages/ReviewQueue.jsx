import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { decisionApi } from "../api/client";
import { EmptyState, QueryBoundary } from "../components/ui/Feedback";
import PageHeader from "../components/ui/PageHeader";
import Panel from "../components/ui/Panel";
import { formatDate, formatINR, formatPct, titleCase } from "../utils/format";
import styles from "./Dashboard.module.css";

export default function ReviewQueue() {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["review-queue"], queryFn: decisionApi.reviewQueue });
  return (
    <>
      <PageHeader title="Review queue"
        subtitle="Applications with a default risk between 30% and 60% are referred to a loan officer. Oldest first." />
      <Panel padded={false}>
        <QueryBoundary query={query}>
          {({ items }) => items.length === 0 ? (
            <EmptyState title="Nothing to review">Referred applications will appear here.</EmptyState>
          ) : (
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Applicant</th><th>Employment</th><th className={styles.num}>Loan</th>
                    <th className={styles.num}>Default risk</th><th>Strongest factor</th><th>Waiting since</th></tr>
                </thead>
                <tbody>
                  {items.map((d) => (
                    <tr key={d._id} tabIndex={0} className={styles.clickable}
                      onClick={() => navigate(`/decisions/${d._id}`)}
                      onKeyDown={(e) => e.key === "Enter" && navigate(`/decisions/${d._id}`)}>
                      <td><strong>{d.applicantId?.fullName}</strong></td>
                      <td>{titleCase(d.applicantId?.employmentType)}</td>
                      <td className={styles.num}>{formatINR(d.applicantId?.loanAmountRequested)}</td>
                      <td className={styles.num}>{formatPct(d.riskScore)}</td>
                      <td style={{ whiteSpace: "normal", maxWidth: 360 }}>{d.topFactors?.[0]}</td>
                      <td>{formatDate(d.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryBoundary>
      </Panel>
    </>
  );
}
