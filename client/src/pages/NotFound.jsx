import { Link } from "react-router-dom";
import { EmptyState } from "../components/ui/Feedback";

export default function NotFound() {
  return (
    <EmptyState title="This page does not exist" action={<Link to="/">Go to your home page</Link>}>
      The link may be out of date, or you may not have access to it.
    </EmptyState>
  );
}
