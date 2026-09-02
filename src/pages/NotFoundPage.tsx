import { useEffect } from "react";
import { Link } from "react-router-dom";
import { BrandMark } from "../components/Icons";
import { resolveRouteTitle } from "../routing";

export function NotFoundPage() {
  useEffect(() => {
    document.title = resolveRouteTitle("/not-found", { authState: "signed-in" });
  }, []);

  return (
    <main className="not-found-page">
      <div className="not-found-mark"><BrandMark size={48} /></div>
      <p className="eyebrow">Page not found</p>
      <h1>This page could not be found.</h1>
      <p>The link may be incomplete or the page may have moved.</p>
      <Link className="btn btn-primary" to="/">Back to Overview</Link>
    </main>
  );
}
