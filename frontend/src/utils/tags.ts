export function isGenreTag(tag: string): boolean {
  return typeof tag === "string" && tag.startsWith("genre:");
}

export function formatTagLabel(tag: string): string {
  if (!tag) return "";

  if (isGenreTag(tag)) {
    return tag
      .slice("genre:".length)
      .split("-")
      .join(" ");
  }

  return tag;
}
