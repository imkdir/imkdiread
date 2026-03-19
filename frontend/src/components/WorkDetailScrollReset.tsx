import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

const WORK_DETAIL_PATH_PATTERN = /^\/work\/[^/]+$/;

export const WorkDetailScrollReset = () => {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    if (!WORK_DETAIL_PATH_PATTERN.test(pathname)) {
      return;
    }

    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};
