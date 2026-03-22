import type React from "react";

import { AppIcon } from "../AppIcon";
import { Modal } from "../Modal";

interface DetailTranslateModalResult {
  detectedLanguage: string;
  originalText: string;
  translation: string;
  translatorNote?: string | null;
  targetLanguage: string;
}

interface DetailTranslateModalProps {
  isOpen: boolean;
  isTranslating: boolean;
  inputValue: string;
  selectedLanguage: string;
  languageOptions: Array<{
    value: string;
    label: string;
  }>;
  result: DetailTranslateModalResult | null;
  error?: string | null;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onInputChange: (value: string) => void;
  onLanguageSelect: (value: string) => void;
}

export function DetailTranslateModal({
  isOpen,
  isTranslating,
  inputValue,
  selectedLanguage,
  languageOptions,
  result,
  error,
  onClose,
  onSubmit,
  onInputChange,
  onLanguageSelect,
}: DetailTranslateModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      cardClassName="detail-translate-modal-card"
    >
      <form className="detail-translate-form" onSubmit={onSubmit}>
        <div className="detail-translate-header">
          <div className="detail-translate-header__title-row">
            <AppIcon
              name="dictionary"
              size={18}
              className="detail-translate-header__icon"
            />
            <h3 className="detail-modal-title detail-translate-modal-title">
              Translate Passage
            </h3>
          </div>
          <p className="detail-translate-header__subtitle">
            Paste a sentence or short passage on the left, then read the
            translation on the right.
          </p>
        </div>

        <div className="detail-translate-grid">
          <section className="detail-translate-pane detail-translate-pane--source">
            <div className="detail-translate-pane__header">
              <span className="detail-label">Original</span>
              {result?.detectedLanguage && (
                <span className="detail-translate-pane__meta">
                  {result.detectedLanguage}
                </span>
              )}
            </div>
            <textarea
              value={inputValue}
              onChange={(event) => onInputChange(event.target.value)}
              className="detail-input detail-translate-input"
              placeholder="Paste the sentence you want translated..."
              autoFocus
            />
          </section>

          <section className="detail-translate-pane detail-translate-pane--result">
            <div className="detail-translate-pane__header detail-translate-pane__header--stacked">
              <span className="detail-label">Translation</span>
              <div className="detail-translate-language-strip" role="tablist">
                {languageOptions.map((option) => {
                  const isActive = option.value === selectedLanguage;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      disabled={isTranslating}
                      className={`detail-translate-language-pill${isActive ? " detail-translate-language-pill--active" : ""}`}
                      onClick={() => onLanguageSelect(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="detail-translate-output">
              {result?.translation ? (
                <>
                  <p className="detail-translate-output__text">
                    {result.translation}
                  </p>
                  {result.translatorNote && (
                    <div className="detail-translate-output__note">
                      <span className="detail-label">Translator's note</span>
                      <p className="detail-translate-output__note-text">
                        {result.translatorNote}
                      </p>
                    </div>
                  )}
                  <div className="detail-translate-output__footer">
                    <span className="detail-translate-output__target">
                      {result.targetLanguage}
                    </span>
                  </div>
                </>
              ) : (
                <div className="detail-translate-output__empty">
                  {isTranslating
                    ? "Translating..."
                    : "Your translation will appear here."}
                </div>
              )}
            </div>
          </section>
        </div>

        {error && <p className="detail-translate-error">{error}</p>}

        <div className="detail-form-actions detail-translate-actions">
          <button
            type="button"
            onClick={onClose}
            className="detail-btn detail-btn--cancel"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isTranslating || !inputValue.trim()}
            className="detail-btn detail-btn--save"
          >
            {isTranslating ? "Translating..." : "Translate"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
