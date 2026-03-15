import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementType,
  type HTMLAttributes,
} from "react";

import "./Metadata.css";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export const MetadataPillWrap = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function MetadataPillWrap({ className, ...props }, ref) {
  return <div ref={ref} className={cx("metadata-pill-wrap", className)} {...props} />;
});

export function MetadataPill({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("metadata-pill", className)} {...props}>
      <span className="metadata-pill__inner">
        {children}
        <span className="metadata-pill__glare" />
      </span>
    </div>
  );
}

type MetadataPillSegmentProps<T extends ElementType> = {
  as?: T;
  className?: string;
  divided?: boolean;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className">;

export function MetadataPillSegment<T extends ElementType = "span">({
  as,
  className,
  divided = false,
  ...props
}: MetadataPillSegmentProps<T>) {
  const Component = (as || "span") as ElementType;

  return (
    <Component
      className={cx(
        "metadata-pill__segment",
        divided && "metadata-pill__segment--divided",
        className,
      )}
      {...props}
    />
  );
}

export function MetadataDropdown({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("metadata-dropdown", className)} {...props} />;
}

type MetadataDropdownItemProps<T extends ElementType> = {
  as?: T;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className">;

export function MetadataDropdownItem<T extends ElementType = "button">({
  as,
  className,
  ...props
}: MetadataDropdownItemProps<T>) {
  const Component = (as || "button") as ElementType;

  return (
    <Component
      className={cx("metadata-dropdown__item", className)}
      {...props}
    />
  );
}
