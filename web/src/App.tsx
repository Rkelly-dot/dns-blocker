import { Link, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { EmptyState, PageHeader } from "./components/ui";
import { Overview } from "./pages/Overview";
import { Queries } from "./pages/Queries";
import { Rules } from "./pages/Rules";
import { System } from "./pages/System";

function NotFound() {
  return (
    <div className="page">
      <PageHeader eyebrow="404" title="Page not found" description="That route does not exist in this dashboard." />
      <div className="panel">
        <EmptyState
          title="Nothing here"
          text="Use the navigation or the command palette to get back to the resolver."
          actions={
            <Link className="btn btn-sm btn-primary" to="/">
              Back to overview
            </Link>
          }
        />
      </div>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="queries" element={<Queries />} />
        <Route path="rules" element={<Rules />} />
        <Route path="system" element={<System />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
