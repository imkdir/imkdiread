import React, { useEffect, useState } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { Link } from "react-router-dom";
import type { Work } from "../types";

import "./GoodreadsImages.css";

interface CoverProps {
  work: Work;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  linkClassName?: string;
  imageClassName?: string;
  imageStyle?: React.CSSProperties;
  in_transition?: boolean;
}

function joinClasses(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function GoodreadsCover({
  work,
  disabled,
  className,
  style,
  linkClassName,
  imageClassName,
  imageStyle,
  in_transition,
}: CoverProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const mouseXSpring = useSpring(x, { stiffness: 240, damping: 22 });
  const mouseYSpring = useSpring(y, { stiffness: 240, damping: 22 });

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["10deg", "-10deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-10deg", "10deg"]);
  const glareBackground = useMotionTemplate`radial-gradient(circle at ${mouseX}px ${mouseY}px, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 18%, rgba(255,255,255,0) 58%)`;

  useEffect(() => {
    setIsLoaded(false);
  }, [work.cover_img_url]);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextMouseX = event.clientX - rect.left;
    const nextMouseY = event.clientY - rect.top;

    mouseX.set(nextMouseX);
    mouseY.set(nextMouseY);
    x.set(nextMouseX / rect.width - 0.5);
    y.set(nextMouseY / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      className={joinClasses("goodreads-cover", className)}
      style={{
        ...style,
        rotateX,
        rotateY,
        transformPerspective: 1200,
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      whileHover={{ scale: 1.03, y: -4 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
    >
      <Link
        to={disabled ? "#" : `/work/${work.id}`}
        state={{ work }}
        className={joinClasses("goodreads-cover__link", linkClassName)}
      >
        <motion.img
          layoutId={in_transition ? `work-cover-${work.id}` : undefined}
          src={work.cover_img_url as string}
          alt={work.title}
          className={joinClasses("goodreads-cover__image", imageClassName)}
          style={{
            opacity: isLoaded ? 1 : 0,
            ...imageStyle,
          }}
          onLoad={() => setIsLoaded(true)}
        />

        <motion.div
          className="goodreads-cover__glare"
          style={{
            background: glareBackground,
            opacity: isHovered ? 1 : 0,
          }}
        />
      </Link>
    </motion.div>
  );
}
