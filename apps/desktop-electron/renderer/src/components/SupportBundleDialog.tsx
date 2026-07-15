import { Modal } from "./Modal";
import "./SupportBundleDialog.css";

export interface SupportBundleOptions {
  include_logs?: boolean;
  include_config?: boolean;
  sanitize?: boolean;
}

interface SupportBundleDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SupportBundleDialog({ open, onClose }: SupportBundleDialogProps) {
  const handleGenerate = async () => {
    if (!window.cuepoint?.exportSupportBundle) return;
    try {
      const result = await window.cuepoint.exportSupportBundle({
        include_logs: true,
        include_config: true,
        sanitize: true,
      });
      if (result.canceled || !result.bundle_path) return;
      if (window.cuepoint.showItemInFolder) {
        window.cuepoint.showItemInFolder(result.bundle_path);
      }
      onClose();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Modal
      open={open}
      title="Export Support Bundle"
      onClose={onClose}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
      primaryAction={{ label: "Generate Bundle", onClick: () => void handleGenerate() }}
    >
      <div className="support-bundle-dialog">
        <p>
          Generate a ZIP with diagnostics, logs, and sanitized configuration to share when
          reporting issues.
        </p>
        <ul className="support-bundle-dialog__list">
          <li>Application logs</li>
          <li>Configuration (sanitized)</li>
          <li>Diagnostics JSON</li>
        </ul>
      </div>
    </Modal>
  );
}
