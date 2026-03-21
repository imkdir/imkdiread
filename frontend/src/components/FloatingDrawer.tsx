import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, type MotionProps } from "framer-motion";
import { AppIcon } from "./AppIcon";
import "./FloatingDrawer.css";

interface FloatingDrawerProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  className?: string;
  variant?: "classic" | "paper";
  anchorRect?: DOMRect | null;
  defaultPlacement?: "anchor" | "center";
  defaultSize?: {
    width: number;
    height: number;
  };
  defaultViewportRatio?: {
    width: number;
    height: number;
  };
  minSize?: {
    width: number;
    height: number;
  };
  children: React.ReactNode;
  bodyStyle?: React.CSSProperties;
  motionProps?: MotionProps;
}

interface DrawerRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const VIEWPORT_PADDING = 16;
const ANCHOR_GAP = 12;
const TOP_OFFSET = 72;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getViewportBounds() {
  const maxWidth = Math.max(0, window.innerWidth - VIEWPORT_PADDING * 2);
  const maxHeight = Math.max(
    0,
    window.innerHeight - TOP_OFFSET - VIEWPORT_PADDING,
  );

  return {
    left: VIEWPORT_PADDING,
    top: TOP_OFFSET,
    maxWidth,
    maxHeight,
  };
}

function clampRect(
  rect: DrawerRect,
  minSize: { width: number; height: number },
): DrawerRect {
  const bounds = getViewportBounds();
  const width = clamp(rect.width, minSize.width, bounds.maxWidth);
  const height = clamp(rect.height, minSize.height, bounds.maxHeight);

  return {
    width,
    height,
    left: clamp(
      rect.left,
      bounds.left,
      bounds.left + bounds.maxWidth - width,
    ),
    top: clamp(rect.top, bounds.top, bounds.top + bounds.maxHeight - height),
  };
}

function getDefaultRect(
  anchorRect: DOMRect | null | undefined,
  defaultSize: { width: number; height: number },
  minSize: { width: number; height: number },
  placement: "anchor" | "center",
): DrawerRect {
  const bounds = getViewportBounds();
  const width = clamp(defaultSize.width, minSize.width, bounds.maxWidth);
  const height = clamp(defaultSize.height, minSize.height, bounds.maxHeight);

  const preferredLeft =
    placement === "center"
      ? bounds.left + (bounds.maxWidth - width) / 2
      : anchorRect
        ? anchorRect.right - width
        : bounds.left + bounds.maxWidth - width;
  const preferredTop =
    placement === "center"
      ? bounds.top + (bounds.maxHeight - height) / 2
      : anchorRect
        ? anchorRect.bottom + ANCHOR_GAP
        : bounds.top + ANCHOR_GAP;

  return clampRect(
    {
      left: preferredLeft,
      top: preferredTop,
      width,
      height,
    },
    minSize,
  );
}

export const FloatingDrawer: React.FC<FloatingDrawerProps> = ({
  isOpen,
  ...props
}) => {
  if (!isOpen) {
    return null;
  }

  return <FloatingDrawerPanel {...props} />;
};

const FloatingDrawerPanel: React.FC<Omit<FloatingDrawerProps, "isOpen">> = ({
  title,
  onClose,
  className,
  variant = "classic",
  anchorRect,
  defaultPlacement = "anchor",
  defaultSize = { width: 420, height: 560 },
  defaultViewportRatio,
  minSize = { width: 320, height: 260 },
  children,
  bodyStyle,
  motionProps,
}) => {
  const defaultRect = useMemo(
    () =>
      getDefaultRect(
        anchorRect,
        defaultViewportRatio
          ? {
              width: window.innerWidth * defaultViewportRatio.width,
              height: window.innerHeight * defaultViewportRatio.height,
            }
          : defaultSize,
        minSize,
        defaultPlacement,
      ),
    [anchorRect, defaultPlacement, defaultSize, defaultViewportRatio, minSize],
  );
  const resolvedMinSize = useMemo(
    () => ({
      width: minSize.width,
      height: minSize.height,
    }),
    [minSize.height, minSize.width],
  );
  const [rect, setRect] = useState<DrawerRect>(defaultRect);
  const activeInteractionCleanupRef = useRef<(() => void) | null>(null);

  const stopActiveInteraction = useCallback(() => {
    activeInteractionCleanupRef.current?.();
    activeInteractionCleanupRef.current = null;
  }, []);

  useEffect(() => {
    if (!rect) return;

    const handleResize = () => {
      setRect((current) =>
        current ? clampRect(current, resolvedMinSize) : current,
      );
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [rect, resolvedMinSize]);

  useEffect(() => () => stopActiveInteraction(), [stopActiveInteraction]);

  const bindPointerInteraction = useCallback(
    (
      event: React.PointerEvent<HTMLDivElement>,
      onMove: (moveEvent: PointerEvent) => void,
    ) => {
      if (event.button !== 0 || !event.isPrimary) {
        return;
      }

      event.preventDefault();
      stopActiveInteraction();

      const captureTarget = event.currentTarget;
      const pointerId = event.pointerId;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (!moveEvent.isPrimary) {
          return;
        }

        onMove(moveEvent);
      };

      const finish = () => {
        captureTarget.removeEventListener("pointermove", handlePointerMove);
        captureTarget.removeEventListener("pointerup", finish);
        captureTarget.removeEventListener("pointercancel", finish);
        captureTarget.removeEventListener("lostpointercapture", finish);
        window.removeEventListener("blur", finish);

        if (captureTarget.hasPointerCapture(pointerId)) {
          captureTarget.releasePointerCapture(pointerId);
        }

        if (activeInteractionCleanupRef.current === finish) {
          activeInteractionCleanupRef.current = null;
        }
      };

      captureTarget.setPointerCapture(pointerId);
      captureTarget.addEventListener("pointermove", handlePointerMove);
      captureTarget.addEventListener("pointerup", finish);
      captureTarget.addEventListener("pointercancel", finish);
      captureTarget.addEventListener("lostpointercapture", finish);
      window.addEventListener("blur", finish);

      activeInteractionCleanupRef.current = finish;
    },
    [stopActiveInteraction],
  );

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (
      event.target instanceof Element &&
      event.target.closest("button")
    ) {
      return;
    }

    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = rect;

    bindPointerInteraction(event, (moveEvent) => {
      setRect(
        clampRect(
          {
            ...startRect,
            left: startRect.left + (moveEvent.clientX - startX),
            top: startRect.top + (moveEvent.clientY - startY),
          },
          resolvedMinSize,
        ),
      );
    });
  };

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = rect;

    bindPointerInteraction(event, (moveEvent) => {
      setRect(
        clampRect(
          {
            ...startRect,
            width: startRect.width + (moveEvent.clientX - startX),
            height: startRect.height + (moveEvent.clientY - startY),
          },
          resolvedMinSize,
        ),
      );
    });
  };

  return (
    <motion.div
      className={`floating-drawer floating-drawer--${variant}${className ? ` ${className}` : ""}`}
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
      {...motionProps}
    >
      <div className="floating-drawer__header" onPointerDown={startDrag}>
        <h2 className="floating-drawer__title">{title}</h2>
        <button
          className="floating-drawer__close"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
          aria-label="Close"
        >
          <AppIcon name="close" size={18} />
        </button>
      </div>

      <div className="floating-drawer__body" style={bodyStyle}>
        {children}
      </div>

      <div className="floating-drawer__resize-handle" onPointerDown={startResize} />
    </motion.div>
  );
};
