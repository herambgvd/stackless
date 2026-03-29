/**
 * Centralised date/time formatting utilities.
 * All functions accept ISO strings, Date objects, or timestamps.
 * Always treat input as UTC when no timezone is specified.
 */

import { formatDistanceToNow, format, isValid, parseISO, differenceInDays } from "date-fns";

/**
 * Safely parse any date value to a Date object.
 * Appends 'Z' if the string has no timezone info so browsers treat it as UTC.
 */
export function parseTs(val) {
  if (!val) return null;
  if (val instanceof Date) return isValid(val) ? val : null;
  if (typeof val === "number") {
    const d = new Date(val);
    return isValid(d) ? d : null;
  }
  if (typeof val === "string") {
    // If no timezone suffix, treat as UTC
    const normalized =
      /[Z+\-]\d*$/.test(val.trim()) ? val : val + "Z";
    const d = parseISO(normalized);
    return isValid(d) ? d : null;
  }
  return null;
}

/** "Jan 15, 2024" */
export function fmtDate(val) {
  const d = parseTs(val);
  if (!d) return "—";
  return format(d, "MMM d, yyyy");
}

/** "Jan 15, 2024 at 10:30 AM" */
export function fmtDateTime(val) {
  const d = parseTs(val);
  if (!d) return "—";
  return format(d, "MMM d, yyyy 'at' h:mm a");
}

/** "10:30 AM" */
export function fmtTime(val) {
  const d = parseTs(val);
  if (!d) return "—";
  return format(d, "h:mm a");
}

/**
 * Smart timestamp:
 * - < 7 days ago → "2 hours ago" (with full datetime as title tooltip)
 * - ≥ 7 days ago → "Jan 15, 2024" (with full datetime as title tooltip)
 *
 * Returns { label: string, title: string } so callers can render:
 *   <span title={title}>{label}</span>
 */
export function fmtSmart(val) {
  const d = parseTs(val);
  if (!d) return { label: "—", title: "" };
  const title = fmtDateTime(d);
  const daysAgo = differenceInDays(new Date(), d);
  const label =
    daysAgo < 7
      ? formatDistanceToNow(d, { addSuffix: true })
      : fmtDate(d);
  return { label, title };
}

/**
 * Always relative: "2 hours ago"
 * Safe — returns "—" if date is invalid instead of throwing.
 */
export function fmtRelative(val) {
  const d = parseTs(val);
  if (!d) return "—";
  return formatDistanceToNow(d, { addSuffix: true });
}
