import { useCallback, useState, type DragEventHandler } from "react";
import { pickFirstDroppedPath, type FileDropKind } from "../api/fileDropUtils";

interface UseFileDropOptions {
  kind: FileDropKind;
  onFile: (path: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}

export function useFileDrop({ kind, onFile, onError, disabled = false }: UseFileDropOptions) {
  const [dragOver, setDragOver] = useState(false);

  const onDragOver: DragEventHandler<HTMLElement> = useCallback(
    (event) => {
      if (disabled) return;
      event.preventDefault();
      event.stopPropagation();
      setDragOver(true);
    },
    [disabled],
  );

  const onDragLeave: DragEventHandler<HTMLElement> = useCallback(
    (event) => {
      if (disabled) return;
      event.preventDefault();
      event.stopPropagation();
      setDragOver(false);
    },
    [disabled],
  );

  const onDrop: DragEventHandler<HTMLElement> = useCallback(
    (event) => {
      if (disabled) return;
      event.preventDefault();
      event.stopPropagation();
      setDragOver(false);
      void (async () => {
        const result = await pickFirstDroppedPath(event.dataTransfer?.files, kind);
        if ("error" in result) {
          onError?.(result.error);
          return;
        }
        onFile(result.path);
      })();
    },
    [disabled, kind, onError, onFile],
  );

  return {
    dragOver,
    dropHandlers: { onDragOver, onDragLeave, onDrop },
  };
}
