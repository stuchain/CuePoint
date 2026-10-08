import { useEffect } from "react";

/**
 * Commands the menu sends to a part of the shell that owns its own state (FLW-20).
 *
 * The sidebar and the Inspector each keep their open/closed state to themselves, and
 * `App.tsx` answering "toggle-sidebar" must not reach into either. It says the command
 * here and whichever part listens does the toggling, the way its own shortcut does.
 */
type ShellCommand = "toggle-sidebar" | "toggle-inspector";

const EVENT = "cuepoint:shell-command";

export function emitShellCommand(command: ShellCommand): void {
  window.dispatchEvent(new CustomEvent<ShellCommand>(EVENT, { detail: command }));
}

export function useShellCommand(command: ShellCommand, run: () => void): void {
  useEffect(() => {
    const onCommand = (event: Event) => {
      if ((event as CustomEvent<ShellCommand>).detail === command) run();
    };
    window.addEventListener(EVENT, onCommand);
    return () => window.removeEventListener(EVENT, onCommand);
  }, [command, run]);
}
