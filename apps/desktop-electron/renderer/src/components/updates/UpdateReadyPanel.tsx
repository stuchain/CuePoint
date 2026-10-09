import type { UpdateState } from "../../api/cuepointBridge.types";
import { useEffect, useRef } from "react";

import { Modal } from "../Modal";
import { whenWorkEnds } from "./restartStore";
import { ReleaseNotesView } from "./ReleaseNotesView";
import type { RestartFlow } from "./useRestartFlow";

interface UpdateReadyPanelProps {
  open: boolean;
  /** An update that is `ready` (restart to install) or `manual` (download it by hand). */
  state: UpdateState;
  onClose: () => void;
  /** The restart flow; given for `ready`. */
  flow?: RestartFlow;
}

/**
 * The panel the status strip's update item opens (DIST-07, DEC-171): the release notes, and
 * Restart now or Later (Download or Later when the person has to fetch it).
 */
export function UpdateReadyPanel({ open, state, onClose, flow }: UpdateReadyPanelProps) {
  const body = useRef<HTMLDivElement>(null);
  const confirming = flow?.confirming === true;
  // The buttons change under the one that was pressed, so focus goes to Cancel: a second Enter
  // must not pick "Restart when done".
  useEffect(() => {
    if (!confirming) return;
    const dialog = body.current?.closest('[role="dialog"]');
    const cancel = [...(dialog?.querySelectorAll("button") ?? [])].find((b) => b.textContent === "Cancel");
    cancel?.focus();
  }, [confirming]);

  const manual = state.status === "manual";
  const version = state.version ?? "";
  const title = `CuePoint ${version} is ${manual ? "out" : "ready"}`;

  if (manual || !flow) {
    return (
      <Modal
        open={open}
        title={title}
        onClose={onClose}
        secondaryAction={{ label: "Later", onClick: onClose }}
        primaryAction={{
          label: "Download",
          onClick: () => {
            void window.cuepoint?.updates?.openReleasePage?.("update");
          },
        }}
      >
        <ReleaseNotesView notes={state.notes} />
      </Modal>
    );
  }

  if (flow.confirming) {
    return (
      <Modal
        open={open}
        title={title}
        onClose={flow.cancel}
        secondaryAction={{ label: "Cancel", onClick: flow.cancel }}
        backAction={flow.unknown ? undefined : { label: "Restart now", onClick: flow.restartNow }}
        primaryAction={
          flow.unknown
            ? { label: "Restart now", onClick: flow.restartNow }
            : { label: "Restart when done", onClick: flow.restartWhenDone }
        }
      >
        <div ref={body}>
          {flow.unknown ? (
            <p className="cp-update-panel__ask">CuePoint couldn't tell whether work is still running.</p>
          ) : (
            <p className="cp-update-panel__ask">{flow.work ?? "Background work"} is still running.</p>
          )}
          <p className="cp-update-panel__note">
            {flow.unknown
              ? "Restarting now would stop anything that is."
              : "Restarting now stops it. Restarting when it is done keeps what it has finished."}
          </p>
        </div>
      </Modal>
    );
  }

  if (flow.waiting) {
    return (
      <Modal
        open={open}
        title={title}
        onClose={onClose}
        secondaryAction={{
          label: "Cancel restart",
          onClick: () => {
            flow.stopWaiting();
            onClose();
          },
        }}
        primaryAction={{ label: "Restart now", onClick: flow.restartNow }}
      >
        <p className="cp-update-panel__ask">{whenWorkEnds(flow.work)}.</p>
        <ReleaseNotesView notes={state.notes} />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      secondaryAction={{ label: "Later", onClick: onClose }}
      primaryAction={{ label: "Restart now", onClick: flow.request }}
    >
      <ReleaseNotesView notes={state.notes} />
      <p className="cp-update-panel__note">If you choose Later, CuePoint installs it when you quit.</p>
    </Modal>
  );
}
