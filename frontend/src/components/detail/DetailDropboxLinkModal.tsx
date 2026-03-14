import { AppIcon } from "../AppIcon";
import { Modal } from "../Modal";

interface DetailDropboxLinkModalProps {
  isOpen: boolean;
  value: string;
  error?: string | null;
  isSaving?: boolean;
  onClose: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function DetailDropboxLinkModal({
  isOpen,
  value,
  error,
  isSaving = false,
  onClose,
  onChange,
  onSubmit,
}: DetailDropboxLinkModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="modal-header">
        <AppIcon name="dropbox" />
        <p className="modal-subtitle">Paste a Dropbox share link here</p>
      </div>

      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="modal-input"
        placeholder="https://www.dropbox.com/s/…?dl=0"
        autoFocus
      />

      {error && <p className="modal-error">{error}</p>}

      <div className="modal-actions">
        <button
          type="button"
          className="modal-btn modal-btn--cancel"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="modal-btn modal-btn--save"
          onClick={onSubmit}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save & Open"}
        </button>
      </div>
    </Modal>
  );
}
