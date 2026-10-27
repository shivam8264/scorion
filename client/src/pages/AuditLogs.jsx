import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { adminApi, errorMessage } from "../api/client";
import Button from "../components/ui/Button";
import { Notice, QueryBoundary } from "../components/ui/Feedback";
import { SelectField } from "../components/ui/Field";
import PageHeader from "../components/ui/PageHeader";
import Pagination from "../components/ui/Pagination";
import Panel from "../components/ui/Panel";
import { formatDate, titleCase } from "../utils/format";
import styles from "./AuditLogs.module.css";

const ACTIONS = ["decision_created", "decision_reviewed", "outcome_recorded", "fairness_audit_run", "user_registered",
  "user_login", "user_role_changed", "user_status_changed", "scoring_failed"];

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [expanded, setExpanded] = useState(null);
  const query = useQuery({
    queryKey: ["audit-logs", page, action],
    queryFn: () => adminApi.auditLogs({ page, limit: 25, ...(action ? { action } : {}) }),
    placeholderData: keepPreviousData,
  });
  const verify = useMutation({ mutationFn: adminApi.verifyChain });

  return (
    <>
      <PageHeader title="Audit trail"
        subtitle="Every decision, review, outcome and fairness audit is recorded here. Entries cannot be edited, and each one is chained to the previous entry by a SHA-256 hash."
        actions={<Button variant="secondary" onClick={() => verify.mutate()} loading={verify.isPending}>Verify integrity</Button>} />
      {verify.isSuccess && (verify.data.valid
        ? <Notice tone="success">Chain intact: all {verify.data.checked} entries match their hashes.</Notice>
        : <Notice tone="danger">Chain broken at entry #{verify.data.brokenAt}. {verify.data.checked} entries verified before it.</Notice>)}
      {verify.isError && <Notice tone="danger">{errorMessage(verify.error)}</Notice>}

      <Panel padded={false} className={styles.panel}>
        <div className={styles.filters}>
          <SelectField label="Action" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}
            placeholder="All actions" options={ACTIONS.map((a) => ({ value: a, label: titleCase(a) }))} />
        </div>
        <QueryBoundary query={query}>
          {(d) => (
            <>
              <div className={styles.scroll}>
                <table className={styles.table}>
                  <thead><tr><th>#</th><th>When</th><th>Action</th><th>By</th><th>Model</th><th>Hash</th><th /></tr></thead>
                  <tbody>
                    {d.items.map((e) => (
                      <Fragment key={e._id}>
                        <tr>
                          <td>{e.sequence}</td>
                          <td>{formatDate(e.timestamp, true)}</td>
                          <td>{titleCase(e.action)}</td>
                          <td>{e.performedBy?.name || "System"}<span className={styles.sub}>{titleCase(e.performedByRole || "")}</span></td>
                          <td>{e.modelVersion || "-"}</td>
                          <td><code>{e.hash.slice(0, 12)}</code></td>
                          <td className={styles.right}>
                            {e.decisionId && <Link to={`/decisions/${e.decisionId}`}>Decision</Link>}{" "}
                            <Button variant="ghost" size="sm" aria-expanded={expanded === e._id}
                              onClick={() => setExpanded(expanded === e._id ? null : e._id)}>
                              {expanded === e._id ? "Hide" : "Snapshot"}
                            </Button>
                          </td>
                        </tr>
                        {expanded === e._id && (
                          <tr className={styles.detail}>
                            <td colSpan={7}><pre>{JSON.stringify(e.snapshot, null, 2)}</pre></td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={d.page} pages={d.pages} total={d.total} onChange={setPage} />
            </>
          )}
        </QueryBoundary>
      </Panel>
    </>
  );
}
