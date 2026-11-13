/**
 * Follow / Following on an artist or label page (DEC-317): one grey button that says what is so and
 * undoes it. Only a page linked to one Beatport id is followable; the page decides whether to draw this.
 */
import { useEffect, useState } from "react";

import type { EntityKind } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { userMessage } from "../../api/userMessage";
import { reportUnexpected } from "../../reporting/reporting";
import { quoted } from "../../format/words";
import { refusalText } from "./discoverFormat";
import { NO_ENGINE } from "./discoverTools";

interface FollowButtonProps {
  kind: EntityKind;
  beatportId: number;
  name: string;
  followed: boolean;
}

export function FollowButton({ kind, beatportId, name, followed: initial }: FollowButtonProps) {
  const { push } = useToast();
  const [followed, setFollowed] = useState(initial);
  const [busy, setBusy] = useState(false);
  // Another page, or the page read again, says what is so now.
  useEffect(() => setFollowed(initial), [initial, kind, beatportId]);

  const toggle = async () => {
    const add = window.cuepoint?.addFollow;
    const remove = window.cuepoint?.removeFollow;
    if (!add || !remove) return void push(NO_ENGINE, "warning");
    setBusy(true);
    try {
      const answer = followed
        ? await remove({ kind, beatport_id: beatportId })
        : await add({ kind, beatport_id: beatportId, name });
      if (answer.refusal) return void push(refusalText(answer.refusal), "warning");
      setFollowed(answer.value.followed);
      push(
        answer.value.followed
          ? `Following ${quoted(name)}. Their new releases are in Discover, under Following.`
          : `Unfollowed ${quoted(name)}.`,
        "success",
      );
    } catch (cause) {
      reportUnexpected(cause);
      push(userMessage(cause), "warning");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="secondary"
      icon={followed ? "check" : "plus"}
      disabled={busy}
      onClick={() => void toggle()}
    >
      {followed ? "Following" : "Follow"}
    </Button>
  );
}
