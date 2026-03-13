import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";

import type { Quote, Work } from "../types";
import {
  buildFinderLabel,
  buildLocalPdfUrl,
  explainPassage,
  fetchWorkById,
  finishWorkProgress,
  saveProgress,
  saveQuote,
  saveDropboxLink,
  uploadWorkFile,
  updateWorkAction,
  updateWorkRating,
  type DetailToggleAction,
} from "../services/detailPageService";
import type { DetailFilePickerOption } from "../components/detail/DetailFilePickerModal";
import type { DetailEditingForm } from "../components/detail/DetailQuoteModal";

interface UseDetailPageOptions {
  workId: string;
  initialWork?: Work;
}

type EditTarget = "quote" | "progress";

function createEmptyForm(
  target: EditTarget,
  currentPage?: number,
): DetailEditingForm {
  return {
    target,
    quote: "",
    pageNumber: target === "progress" && currentPage ? String(currentPage) : "",
    explanation: "",
  };
}

function normalizeDropboxLink(rawLink: string): string {
  const trimmed = rawLink.trim();
  try {
    const url = new URL(trimmed);
    if (!url.hostname.includes("dropbox.com")) {
      return trimmed;
    }
    url.searchParams.delete("dl");
    url.searchParams.delete("raw");
    url.searchParams.set("raw", "1");
    return url.toString();
  } catch {
    return trimmed;
  }
}

export function useDetailPage({ workId, initialWork }: UseDetailPageOptions) {
  const [work, setWork] = useState<Work | null>(initialWork || null);
  const [loading, setLoading] = useState(!initialWork);
  const [read, setRead] = useState(!!initialWork?.read);
  const [liked, setLiked] = useState(!!initialWork?.liked);
  const [shelved, setShelved] = useState(!!initialWork?.shelved);
  const [rating, setRating] = useState(initialWork?.rating || 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [isAddQuoteModalOpen, setIsAddQuoteModalOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<DetailEditingForm>(
    createEmptyForm("quote"),
  );
  const [isSavingQuote, setIsSavingQuote] = useState(false);
  const [isPDFViewerOpen, setIsPDFViewerOpen] = useState(false);
  const [viewerInitialUrl, setViewerInitialUrl] = useState<string | null>(null);
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const [filePickerOptions, setFilePickerOptions] = useState<
    DetailFilePickerOption[]
  >([]);
  const [isActionDrawerOpen, setIsActionDrawerOpen] = useState(false);
  const [isExplaining, setIsExplaining] = useState(false);
  const [isDropboxLinkModalOpen, setIsDropboxLinkModalOpen] = useState(false);
  const [dropboxLinkDraft, setDropboxLinkDraft] = useState("");
  const [dropboxLinkError, setDropboxLinkError] = useState<string | null>(null);
  const [isDropboxSaving, setIsDropboxSaving] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadModalVersion, setUploadModalVersion] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const workRef = useRef(work);
  const editingFormRef = useRef(editingForm);

  useEffect(() => {
    workRef.current = work;
  }, [work]);

  useEffect(() => {
    editingFormRef.current = editingForm;
  }, [editingForm]);

  const getEditEmptyForm = useCallback(
    (target: EditTarget): DetailEditingForm => {
      return createEmptyForm(target, workRef.current?.current_page);
    },
    [],
  );

  const fetchData = useCallback(async () => {
    if (!workId) return;

    if (!workRef.current) {
      setLoading(true);
    }

    try {
      const loadedWork = await fetchWorkById(workId);
      if (!loadedWork) {
        setWork(null);
        setLoading(false);
        return;
      }

      setWork(loadedWork);
      setLoading(false);
      setRead(!!loadedWork.read);
      setLiked(!!loadedWork.liked);
      setShelved(!!loadedWork.shelved);
      setRating(loadedWork.rating || 0);
    } catch (err) {
      console.error("Failed to fetch work:", err);
      setLoading(false);
    }
  }, [workId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleGlobalPaste = useCallback((e: ClipboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
    e.preventDefault();

    let pastedText = e.clipboardData?.getData("text/plain") || "";
    pastedText = pastedText.trim();

    if (pastedText.length <= 0) return;

    let cleanedText = pastedText.replace(/-\r?\n/g, "");
    cleanedText = cleanedText
      .split(/\r?\n\s*\r?\n/)
      .map((paragraph) => paragraph.replace(/\r?\n/g, " "))
      .join("\n\n");
    cleanedText = cleanedText.replace(/ {2,}/g, " ");

    if (!cleanedText.includes(" ") && cleanedText.length > 0) {
      window.dispatchEvent(
        new CustomEvent("open-dictionary", { detail: cleanedText }),
      );
      return;
    }

    setIsAddQuoteModalOpen(true);
    setIsSavingQuote(false);
    setEditingForm({
      target: "quote",
      quote: cleanedText,
      pageNumber: "",
      explanation: "",
    });
  }, []);

  useEffect(() => {
    window.addEventListener("paste", handleGlobalPaste);
    return () => window.removeEventListener("paste", handleGlobalPaste);
  }, [handleGlobalPaste]);

  const toggleActionDrawer = useCallback(() => {
    setIsActionDrawerOpen((prev) => !prev);
  }, []);

  const toggleAction = useCallback(
    (action: DetailToggleAction) => {
      const current =
        action === "read" ? read : action === "liked" ? liked : shelved;
      const newValue = !current;

      if (action === "read") setRead(newValue);
      if (action === "liked") setLiked(newValue);
      if (action === "shelved") setShelved(newValue);

      updateWorkAction(workId, action, newValue).catch((err) =>
        console.error("Failed to update action:", err),
      );
    },
    [liked, read, shelved, workId],
  );

  const handleStarMouseMove = useCallback(
    (e: React.MouseEvent<Element>, starIndex: number) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const newHoverRating = x < 12 ? starIndex * 2 - 1 : starIndex * 2;

      if (hoverRating !== newHoverRating) {
        setHoverRating(newHoverRating);
      }
    },
    [hoverRating],
  );

  const handleStarClick = useCallback(() => {
    const newRating = hoverRating;
    setRating(newRating);

    updateWorkRating(workId, newRating).catch((err) =>
      console.error("Failed to update rating:", err),
    );
  }, [hoverRating, workId]);

  const openEditFormModal = useCallback(
    (target: EditTarget) => {
      setIsAddQuoteModalOpen(true);
      setEditingForm(getEditEmptyForm(target));
      setIsSavingQuote(false);
    },
    [getEditEmptyForm],
  );

  const handleQuoteInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target;
      setEditingForm((prev) => ({
        ...prev,
        [name]: value,
      }));
    },
    [],
  );

  const closeAddQuoteModal = useCallback(() => {
    setIsAddQuoteModalOpen(false);
    setEditingForm(getEditEmptyForm("quote"));
  }, [getEditEmptyForm]);

  const submitQuoteToDB = useCallback(
    async (form: DetailEditingForm) => {
      const quote = form.quote.trim();
      const parsedPageNumber = form.pageNumber.trim().length
        ? Number(form.pageNumber)
        : null;

      try {
        const success = await saveQuote(workId, {
          quote,
          pageNumber: parsedPageNumber,
          explanation: form.explanation,
        });

        if (!success) {
          setIsSavingQuote(false);
          return;
        }

        setEditingForm(getEditEmptyForm("quote"));
        setIsAddQuoteModalOpen(false);
        setIsSavingQuote(false);
        void fetchData();
      } catch (err) {
        console.error("Failed to save quote:", err);
        setIsSavingQuote(false);
      }
    },
    [fetchData, getEditEmptyForm, workId],
  );

  const submitProgressToDB = useCallback(
    async (form: DetailEditingForm) => {
      const parsedPageNumber = Number(form.pageNumber);
      try {
        const data = await saveProgress(workId, {
          note: form.quote.trim(),
          pageNumber: parsedPageNumber,
        });

        if (!data.success) return;

        setRead(!!data.read);
        setShelved(false);
        setEditingForm(getEditEmptyForm("quote"));
        setIsAddQuoteModalOpen(false);
        void fetchData();
      } catch (err) {
        console.error("Failed to save progress:", err);
      }
    },
    [fetchData, getEditEmptyForm, workId],
  );

  const handleAddQuote = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const form = editingFormRef.current;

      if (form.target === "quote") {
        setIsSavingQuote(true);
        setTimeout(() => {
          void submitQuoteToDB(form);
        }, 1200);
        return;
      }

      void submitProgressToDB(form);
    },
    [submitProgressToDB, submitQuoteToDB],
  );

  const handleProgressFinished = useCallback(async () => {
    const note = editingFormRef.current.quote.trim();
    try {
      const success = await finishWorkProgress(workId, note);
      if (!success) return;

      setRead(true);
      setShelved(false);
      setEditingForm(getEditEmptyForm("quote"));
      setIsAddQuoteModalOpen(false);
      void fetchData();
    } catch (err) {
      console.error("Failed to finish work:", err);
    }
  }, [fetchData, getEditEmptyForm, workId]);

  const handleExplainPassage = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      const text = editingFormRef.current.quote;
      if (!text) return;

      setIsExplaining(true);
      try {
        const data = await explainPassage(workId, text);
        if (data.success) {
          setEditingForm((prev) => ({
            ...prev,
            quote: data.cleanedQuote || text,
            explanation: data.explanation || "",
          }));
        } else {
          alert(data.error || "Failed to analyze passage.");
        }
      } catch {
        alert("Network error while analyzing passage.");
      } finally {
        setIsExplaining(false);
      }
    },
    [workId],
  );

  const openPDFViewer = useCallback(
    (initialUrl: string | null) => {
      if (!initialUrl || initialUrl === viewerInitialUrl) return;
      setIsPDFViewerOpen(true);
      setViewerInitialUrl(initialUrl);
    },
    [viewerInitialUrl],
  );

  const closePDFViewer = useCallback(() => {
    setIsPDFViewerOpen(false);
    setViewerInitialUrl(null);
  }, []);

  const openDropboxLinkModal = useCallback(() => {
    setDropboxLinkDraft(work?.dropbox_link || "");
    setDropboxLinkError(null);
    setIsDropboxLinkModalOpen(true);
  }, [work?.dropbox_link]);

  const closeDropboxLinkModal = useCallback(() => {
    setIsDropboxLinkModalOpen(false);
    setDropboxLinkError(null);
  }, []);

  const handleDropboxLinkChange = useCallback((value: string) => {
    setDropboxLinkDraft(value);
    setDropboxLinkError(null);
  }, []);

  const handleDropboxLinkSubmit = useCallback(async () => {
    const trimmed = dropboxLinkDraft.trim();
    if (!trimmed) {
      setDropboxLinkError("Please provide a Dropbox link.");
      return;
    }

    const normalizedLink = normalizeDropboxLink(trimmed);
    setIsDropboxSaving(true);
    try {
      const response = await saveDropboxLink(workId, normalizedLink);
      if (!response.success) {
        setDropboxLinkError(response.error || "Failed to save Dropbox link.");
        return;
      }

      setWork((prev) =>
        prev ? { ...prev, dropbox_link: normalizedLink } : prev,
      );
      closeDropboxLinkModal();
      openPDFViewer(normalizedLink);
    } catch (error) {
      console.error("Failed to save Dropbox link:", error);
      setDropboxLinkError("Failed to save Dropbox link.");
    } finally {
      setIsDropboxSaving(false);
    }
  }, [closeDropboxLinkModal, dropboxLinkDraft, openPDFViewer, workId]);

  const togglePDFViewer = useCallback(
    (source: "dropbox") => {
      if (isPDFViewerOpen) {
        closePDFViewer();
        return;
      }

      if (source === "dropbox") {
        if (work?.dropbox_link) {
          openPDFViewer(work.dropbox_link);
        } else {
          openDropboxLinkModal();
        }
      }
    },
    [
      closePDFViewer,
      isPDFViewerOpen,
      openDropboxLinkModal,
      openPDFViewer,
      work,
    ],
  );

  const openLocalPdfViewer = useCallback(
    (fileUrl: string) => {
      const preparedUrl = buildLocalPdfUrl(fileUrl, work?.current_page);
      setIsFilePickerOpen(false);
      openPDFViewer(preparedUrl);
    },
    [openPDFViewer, work],
  );

  const closeFilePicker = useCallback(() => {
    setIsFilePickerOpen(false);
    setFilePickerOptions([]);
  }, []);

  const openUploadModal = useCallback(() => {
    setUploadError(null);
    setUploadModalVersion((prev) => prev + 1);
    setIsUploadModalOpen(true);
  }, []);

  const closeUploadModal = useCallback(() => {
    setUploadError(null);
    setIsUploadModalOpen(false);
  }, []);

  const handleWorkFileUpload = useCallback(
    async (file: File) => {
      setIsUploadingFile(true);
      setUploadError(null);
      try {
        const response = await uploadWorkFile(workId, file);
        if (!response.success) {
          setUploadError(response.error || "Failed to upload file.");
          return;
        }

        closeUploadModal();
        if (response.url) {
          openLocalPdfViewer(response.url);
        }
        await fetchData();
      } catch (error) {
        console.error("Failed to upload work file:", error);
        setUploadError("Failed to upload file.");
      } finally {
        setIsUploadingFile(false);
      }
    },
    [closeUploadModal, fetchData, openLocalPdfViewer, workId],
  );

  const handleFinderButtonClick = useCallback(() => {
    if (!work?.file_urls?.length) {
      openUploadModal();
      return;
    }

    if (work.file_urls.length === 1) {
      openLocalPdfViewer(work.file_urls[0]);
      return;
    }

    const options = work.file_urls.map((url) => ({
      url,
      label: buildFinderLabel(url, work.id),
    }));
    setFilePickerOptions(options);
    setIsFilePickerOpen(true);
  }, [openLocalPdfViewer, openUploadModal, work]);

  const handleFilePickerSelect = useCallback(
    (option: DetailFilePickerOption) => {
      setFilePickerOptions([]);
      openLocalPdfViewer(option.url);
    },
    [openLocalPdfViewer],
  );

  const displayRating = hoverRating > 0 ? hoverRating : rating;
  const displayQuotes = useMemo(
    () =>
      (work?.quotes || []).filter(
        (q: Quote) =>
          q.quote.trim().length > 0 && !q.quote.startsWith("@notes:"),
      ),
    [work?.quotes],
  );

  return {
    work,
    loading,
    read,
    liked,
    shelved,
    hoverRating,
    isAddQuoteModalOpen,
    editingForm,
    isSavingQuote,
    isPDFViewerOpen,
    viewerInitialUrl,
    isFilePickerOpen,
    filePickerOptions,
    isActionDrawerOpen,
    isExplaining,
    displayRating,
    displayQuotes,
    fetchData,
    toggleActionDrawer,
    toggleAction,
    handleStarMouseMove,
    handleStarClick,
    setHoverRating,
    openEditFormModal,
    handleQuoteInputChange,
    handleAddQuote,
    handleProgressFinished,
    closeAddQuoteModal,
    handleExplainPassage,
    togglePDFViewer,
    closePDFViewer,
    handleFinderButtonClick,
    handleFilePickerSelect,
    closeFilePicker,
    isDropboxLinkModalOpen,
    dropboxLinkDraft,
    dropboxLinkError,
    isDropboxSaving,
    handleDropboxLinkChange,
    handleDropboxLinkSubmit,
    closeDropboxLinkModal,
    isUploadModalOpen,
    uploadModalVersion,
    uploadError,
    isUploadingFile,
    closeUploadModal,
    handleWorkFileUpload,
  };
}
