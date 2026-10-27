import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, errorMessage } from "../api/client";
import Button from "../components/ui/Button";
import { Notice, QueryBoundary } from "../components/ui/Feedback";
import PageHeader from "../components/ui/PageHeader";
import Panel from "../components/ui/Panel";
import { useAuth } from "../context/AuthContext";
import { ROLE_LABELS } from "../utils/constants";
import { formatDate } from "../utils/format";
import styles from "./AuditLogs.module.css";

export default function Users() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["users"], queryFn: adminApi.users });
  const onDone = { onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }) };
  const role = useMutation({ mutationFn: ({ id, value }) => adminApi.setRole(id, value), ...onDone });
  const status = useMutation({ mutationFn: ({ id, value }) => adminApi.setStatus(id, value), ...onDone });
  const err = role.error || status.error;

  return (
    <>
      <PageHeader title="Users" subtitle="People register as applicants. Grant loan officer or administrator access here; every change is logged." />
      {err && <Notice tone="danger">{errorMessage(err)}</Notice>}
      <Panel padded={false} className={styles.panel}>
        <QueryBoundary query={query}>
          {({ items }) => (
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
                <tbody>
                  {items.map((u) => {
                    const self = u.id === me.id;
                    return (
                      <tr key={u.id}>
                        <td>{u.name}{self && <span className={styles.sub}>You</span>}</td>
                        <td>{u.email}</td>
                        <td>
                          <select aria-label={`Role for ${u.name}`} value={u.role} disabled={self || role.isPending}
                            onChange={(e) => role.mutate({ id: u.id, value: e.target.value })}>
                            {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </td>
                        <td>{u.isActive ? "Active" : "Disabled"}</td>
                        <td>{u.lastLoginAt ? formatDate(u.lastLoginAt, true) : "Never"}</td>
                        <td className={styles.right}>
                          {!self && (
                            <Button variant={u.isActive ? "secondary" : "primary"} size="sm"
                              onClick={() => status.mutate({ id: u.id, value: !u.isActive })}>
                              {u.isActive ? "Disable" : "Enable"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </QueryBoundary>
      </Panel>
    </>
  );
}
