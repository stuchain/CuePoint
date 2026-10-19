/**
 * The crumb over an Artist, Label or Similar tracks page (C221): the page it was opened from, as a
 * link back, then what this page is. The origin travels in the route's state (`discoverLinks.ts`);
 * a page opened with none is Discover's. The chevron after the link is drawn by the link class.
 */
import { useLocation, useNavigate } from "react-router-dom";

import { LinkButton } from "../../components/LinkButton";
import { ORIGIN_PAGE, pageOrigin } from "./discoverLinks";

export function PageCrumb({ current }: { current: string }) {
  const navigate = useNavigate();
  const origin = ORIGIN_PAGE[pageOrigin(useLocation().state)];
  return (
    <nav className="discover-crumb" aria-label="Where this page was opened from">
      <LinkButton go onClick={() => navigate(origin.path)}>
        {origin.label}
      </LinkButton>
      <span aria-current="page">{current}</span>
    </nav>
  );
}
