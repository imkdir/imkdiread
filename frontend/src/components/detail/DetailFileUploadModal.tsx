import React, { useRef, useState } from "react";
import finderIcon from "../../assets/imgs/finder.png";
import { Modal } from "../Modal";

interface DetailFileUploadModalProps {
  isOpen: boolean;
  isUploading: boolean;
  error?: string | null;
  onUpload: (file: File) => void;
  onClose: () => void;
}

export function DetailFileUploadModal({
  isOpen,
  isUploading,
  error,
  onUpload,
  onClose,
}: DetailFileUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const handleClose = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onClose();
  };

  const handleUpload = () => {
    if (!selectedFile) return;
    onUpload(selectedFile);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="modal-header">
        <img src={finderIcon} alt="Finder icon" width={20} />
        <p className="modal-subtitle">Upload a PDF to our server.</p>
      </div>

      <div className="detail-upload-file-row">
        <button
          type="button"
          className="detail-upload-file-trigger"
          onClick={() => fileInputRef.current?.click()}
        >
          {selectedFile ? "Change file" : "Choose PDF"}
        </button>
        <span
          className="detail-upload-file-label"
          title={selectedFile?.name ?? ""}
        >
          {selectedFile?.name ?? "No file selected"}
        </span>
      </div>

      {error && <p className="modal-error">{error}</p>}

      <div className="modal-actions">
        <button
          type="button"
          className="modal-btn modal-btn--cancel"
          onClick={handleClose}
          disabled={isUploading}
        >
          Cancel
        </button>
        <button
          type="button"
          className="modal-btn modal-btn--save"
          onClick={handleUpload}
          disabled={!selectedFile || isUploading}
        >
          {isUploading ? "Uploading..." : "Upload"}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={handleFileChange}
      />
    </Modal>
  );
}
