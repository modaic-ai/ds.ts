import { z } from "zod";

/**
 * Gets a string representation of a Zod schema's type.
 */
export function getAnnotationName(schema: z.ZodType): string {
  const typeName = (schema.def as any).typeName;
  switch (typeName) {
    case "ZodString":
      return "string";
    case "ZodNumber":
      return "number";
    case "ZodBoolean":
      return "boolean";
    case "ZodArray":
      return "array";
    case "ZodObject":
      return "object";
    case "ZodEnum":
      return "enum";
    case "ZodNativeEnum":
      return "enum";
    case "ZodOptional":
      return `optional ${getAnnotationName(
        (schema as z.ZodOptional<any>).def.innerType
      )}`;
    case "ZodNullable":
      return `nullable ${getAnnotationName(
        (schema as z.ZodNullable<any>).def.innerType
      )}`;
    default:
      return typeName ? typeName.replace("Zod", "").toLowerCase() : "unknown";
  }
}

/**
 * Formats a record of fields into a descriptive string, mirroring DSPy's get_field_description_string.
 */
export function getFieldDescriptionString(fields: z.ZodRawShape): string {
  const fieldDescriptions = Object.entries(fields).map(([name, field], idx) => {
    const typeName = getAnnotationName(field as any);
    const desc = (field as any).description || "";

    let fieldMessage = `${idx + 1}. \`${name}\` (${typeName}): ${desc}`;

    if ((field as any).constraints) {
      fieldMessage += `\nConstraints: ${(field as any).constraints}`;
    }

    return fieldMessage;
  });
  return fieldDescriptions.join("\n").trim();
}

/**
 * Extracts field names and their schemas from a ZodObject.
 */
export function getFields(schema: z.ZodObject<any>): z.ZodRawShape {
  return schema.shape;
}

/**
 * Formats a field value for inclusion in a prompt.
 */
export function formatFieldValue(value: any): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

/**
 * Parses a string value from the LM response into the expected type based on the schema.
 */
export function parseValue(schema: z.ZodType, value: string): any {
  // If the schema is a string, return the raw value
  if (schema instanceof z.ZodString) {
    return value.trim();
  }

  // Otherwise, try to parse as JSON
  try {
    const parsed = JSON.parse(value);
    return schema.parse(parsed);
  } catch (e) {
    // If JSON parsing fails, but it's a string schema, we already handled it.
    // If it's a number or boolean, try direct conversion.
    if (schema instanceof z.ZodNumber) {
      const num = Number(value.trim());
      if (!isNaN(num)) return schema.parse(num);
    }
    if (schema instanceof z.ZodBoolean) {
      const bool = value.trim().toLowerCase();
      if (bool === "true") return schema.parse(true);
      if (bool === "false") return schema.parse(false);
    }
    throw e;
  }
}

export function format_field_value(
  field: z.ZodType,
  value: any,
  assume_text: boolean = true
): string | { type: "text"; text: string } {
  // pretty sure this is the same logic as DSPy but wouldn't hurt to check
  // TODO: check DSPy
  let string_value = null;
  if (Array.isArray(value) && field instanceof z.ZodString) {
    string_value = _format_input_list_field_value(value);
  } else {
    string_value = JSON.stringify(value, null, 2);
  }
  if (assume_text) {
    return string_value;
  } else {
    return { type: "text", text: string_value };
  }
}

export function _format_input_list_field_value(value: any[]): string {
  if (value.length === 0) return "N/A";
  if (value.length === 1) return _format_blob(value[0]);
  return value
    .map((txt, idx) => `[${idx + 1}] ${_format_blob(txt)}`)
    .join("\n");
}

export function _format_blob(blob: string): string {
  if (!blob.includes("\n") && !blob.includes("«") && !blob.includes("»")) {
    return `«${blob}»`;
  }
  return `«««\n    ${blob.replace("\n", "\n    ")}\n»»»`;
}
