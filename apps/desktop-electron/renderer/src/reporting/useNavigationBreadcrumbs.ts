import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { findOwningDestination } from "../components/shell/navRegistry";
import { reportNavigation } from "./reporting";

/**
 * A step for each destination the user opens (REPORT-06, DEC-126): its id from the
 * navigation registry (`library`, `clean`), never the path, the hash or a query. A
 * page under a destination (an Artist page, a Set) is its destination's id too.
 */
export function useNavigationBreadcrumbs(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    const destination = findOwningDestination(pathname);
    if (destination) reportNavigation(destination.id);
  }, [pathname]);
}
