/**
 * Opens an artist's or label's page, carrying where it was opened from (C221): the page's crumb
 * then names and leads back to that origin, and the sidebar can light it.
 */
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import type { EntityKind } from "../../api/cuepointBridge.types";
import { entityPath, originState, type PageOrigin } from "./discoverLinks";

export function useOpenPage(origin: PageOrigin = "discover"): (kind: EntityKind, ref: string) => void {
  const navigate = useNavigate();
  return useCallback(
    (kind, ref) => navigate(entityPath(kind, ref), { state: originState(origin) }),
    [navigate, origin],
  );
}
