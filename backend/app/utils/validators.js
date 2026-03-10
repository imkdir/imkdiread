function asNonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asOptionalString(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asStringArray(value) {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  return normalized;
}

module.exports = { asNonEmptyString, asOptionalString, asStringArray };
