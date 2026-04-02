import { z } from "zod";

/**
 * Build a Zod validation schema from dynamic field definitions.
 * Shared across RecordsPage, RecordDetailPage, and DynamicForm.
 */
export function buildZodSchema(fields) {
  const shape = {};
  for (const field of fields) {
    let rule;
    switch (field.type) {
      case "number":
      case "currency":
        rule = z.coerce.number({
          invalid_type_error: `${field.label} must be a number`,
        });
        if (!field.is_required) rule = rule.optional();
        break;
      case "boolean":
        rule = z.boolean().default(false);
        break;
      case "email":
        rule = field.is_required
          ? z.string().email("Invalid email").min(1, `${field.label} is required`)
          : z.string().email("Invalid email").optional().or(z.literal(""));
        break;
      case "url":
        rule = field.is_required
          ? z.string().url("Invalid URL").min(1, `${field.label} is required`)
          : z.string().url("Invalid URL").optional().or(z.literal(""));
        break;
      case "multiselect":
      case "table_multiselect":
        rule = field.is_required
          ? z.array(z.string()).min(1, `${field.label} is required`)
          : z.array(z.string()).default([]);
        break;
      case "rating":
        rule = field.is_required
          ? z.number().min(1, `${field.label} is required`)
          : z.number().optional();
        break;
      case "geolocation":
        rule = z.any().optional();
        break;
      case "file":
      case "attach_image":
      case "signature":
        rule = z.any().optional();
        break;
      case "child_table":
        rule = z.array(z.record(z.any())).default([]);
        break;
      default:
        rule = field.is_required
          ? z.string().min(1, `${field.label} is required`)
          : z.string().optional();
    }
    shape[field.name] = rule;
  }
  return z.object(shape);
}

/**
 * Build default form values from field definitions and an optional existing record.
 */
export function buildDefaultValues(fields, record = null) {
  return Object.fromEntries(
    fields.map((f) => {
      const existing = record?.[f.name];
      if (existing !== undefined && existing !== null) return [f.name, existing];
      if (f.type === "boolean") return [f.name, false];
      if (f.type === "multiselect" || f.type === "table_multiselect") return [f.name, []];
      if (f.type === "file" || f.type === "attach_image") return [f.name, null];
      if (f.type === "signature") return [f.name, ""];
      if (f.type === "geolocation") return [f.name, null];
      if (f.type === "rating") return [f.name, 0];
      return [f.name, ""];
    }),
  );
}
