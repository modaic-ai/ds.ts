import { z } from "zod";
import {
  CUSTOM_TYPE_START_IDENTIFIER,
  CUSTOM_TYPE_END_IDENTIFIER,
  is_custom_type,
} from "./types";

/**
 * Gets a string representation of a Zod schema's type.
 */

export function get_annotation_name(schema: z.ZodType): string {
  const def = (schema as any)._def;
  if (!def) return "unknown";

  // Check for 'name' in metadata (Zod v4 .meta() support)
  const meta =
    typeof (schema as any).meta === "function"
      ? (schema as any).meta()
      : def.meta;
  if (meta?.name) return meta.name;

  const type = def.type;

  switch (type) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "bigint":
      return "bigint";
    case "boolean":
      return "boolean";
    case "date":
      return "date";
    case "symbol":
      return "symbol";
    case "undefined":
      return "undefined";
    case "null":
      return "null";
    case "nan":
      return "nan";
    case "void":
      return "void";
    case "any":
      return "any";
    case "unknown":
      return "unknown";
    case "never":
      return "never";

    case "object": {
      const shape = def.shape;
      const fields = Object.entries(shape || {})
        .map(
          ([key, value]) => `${key}: ${get_annotation_name(value as z.ZodType)}`
        )
        .join(", ");
      return `object({ ${fields} })`;
    }
    case "array":
      return `array(${get_annotation_name(def.element)})`;
    case "tuple": {
      const items = (def.items || [])
        .map((item: z.ZodType) => get_annotation_name(item))
        .join(", ");
      return `tuple([${items}])`;
    }
    case "union": {
      const options = (def.options || [])
        .map((option: z.ZodType) => get_annotation_name(option))
        .join(" | ");
      return `union(${options})`;
    }
    case "intersection":
      return `intersection(${get_annotation_name(
        def.left
      )}, ${get_annotation_name(def.right)})`;
    case "discriminatedUnion": {
      const options = (
        Array.isArray(def.options)
          ? def.options
          : Array.from(Object.values(def.options || {}))
      )
        .map((option: any) => get_annotation_name(option))
        .join(" | ");
      return `discriminatedUnion(${def.discriminator}, [${options}])`;
    }
    case "record":
      return `record(${get_annotation_name(def.keyType)}, ${get_annotation_name(
        def.valueType
      )})`;
    case "map":
      return `map(${get_annotation_name(def.keyType)}, ${get_annotation_name(
        def.valueType
      )})`;
    case "set":
      return `set(${get_annotation_name(def.valueType)})`;
    case "function":
      return `function(args: ${get_annotation_name(
        def.input
      )}, returns: ${get_annotation_name(def.output)})`;
    case "promise":
      return `promise(${get_annotation_name(def.innerType)})`;
    case "lazy":
      return `lazy(() => ${get_annotation_name(def.getter())})`;

    case "literal": {
      const val =
        def.values && def.values.length > 0 ? def.values[0] : def.value;
      return `literal(${JSON.stringify(val)})`;
    }
    case "enum": {
      const vals = def.values || (def.entries ? Object.keys(def.entries) : []);
      return `enum([${vals.map((v: string) => JSON.stringify(v)).join(", ")}])`;
    }
    case "nativeEnum":
      return `nativeEnum`;

    case "optional":
      return `optional(${get_annotation_name(def.innerType)})`;
    case "nullable":
      return `nullable(${get_annotation_name(def.innerType)})`;
    case "default":
      return `default(${get_annotation_name(def.innerType)}, ${JSON.stringify(
        def.defaultValue
      )})`;
    case "readonly":
      return `readonly(${get_annotation_name(def.innerType)})`;
    case "catch":
      return `catch(${get_annotation_name(def.innerType)})`;
    case "pipe": {
      const inner =
        def.in || def.schema || (schema as any).innerType?.() || def.innerType;
      return `pipe(${get_annotation_name(inner)})`;
    }

    default:
      return type ? type.toString().toLowerCase() : "unknown";
  }
}

/**
 * NOTE: aligned with dspy [x]
 * Formats a record of fields into a descriptive string, mirroring DSPy's get_field_description_string.
 */
export function get_field_description_string(fields: z.ZodRawShape): string {
  const fieldDescriptions = Object.entries(fields).map(([name, field], idx) => {
    let field_message = `${idx + 1}. \`${name}\``;
    field_message += ` (${get_annotation_name(field as any)})`;

    let desc =
      (field as any)._def?.description || (field as any).description || "";
    if (desc === `\${${name}}`) {
      desc = "";
    }

    const custom_types = extract_custom_type_from_annotation(field as any);
    for (const custom_type of custom_types) {
      const meta =
        typeof (custom_type as any).meta === "function"
          ? (custom_type as any).meta()
          : (custom_type as any)._def?.meta;
      if (meta?.desc) {
        desc += `\n    Type description of ${get_annotation_name(
          custom_type
        )}: ${meta.desc}`;
      }
    }

    field_message += `: ${desc}`;

    const fieldMeta =
      typeof (field as any).meta === "function"
        ? (field as any).meta()
        : (field as any)._def?.meta;

    if (fieldMeta?.constraints) {
      field_message += `\nConstraints: ${fieldMeta?.constraints}`;
    }

    return field_message;
  });
  return fieldDescriptions.join("\n").trim();
}

/**
 * Extracts all Zod types that have a "name" in their metadata, including nested types.
 */
export function extract_custom_type_from_annotation(
  annotation: z.ZodType
): z.ZodType[] {
  const result: z.ZodType[] = [];
  const def = (annotation as any)._def;
  if (!def) return result;

  // Check for 'name' in metadata
  const meta =
    typeof (annotation as any).meta === "function"
      ? (annotation as any).meta()
      : def.meta;

  if (meta?.name) {
    result.push(annotation);
  }

  const type = def.type;

  switch (type) {
    case "object":
      if (def.shape) {
        Object.values(def.shape).forEach((child: any) => {
          result.push(...extract_custom_type_from_annotation(child));
        });
      }
      break;
    case "array":
      if (def.element) {
        result.push(...extract_custom_type_from_annotation(def.element));
      }
      break;
    case "union":
    case "discriminatedUnion":
      if (def.options) {
        const options = Array.isArray(def.options)
          ? def.options
          : Array.from(Object.values(def.options));
        options.forEach((child: any) => {
          result.push(...extract_custom_type_from_annotation(child as any));
        });
      }
      break;
    case "intersection":
      if (def.left)
        result.push(...extract_custom_type_from_annotation(def.left));
      if (def.right)
        result.push(...extract_custom_type_from_annotation(def.right));
      break;
    case "tuple":
      if (def.items) {
        def.items.forEach((child: any) => {
          result.push(...extract_custom_type_from_annotation(child));
        });
      }
      break;
    case "record":
      if (def.valueType) {
        result.push(...extract_custom_type_from_annotation(def.valueType));
      }
      break;
    case "optional":
    case "nullable":
    case "default":
    case "readonly":
    case "catch":
    case "promise":
      if (def.innerType) {
        result.push(...extract_custom_type_from_annotation(def.innerType));
      }
      break;
    case "lazy":
      if (def.getter) {
        try {
          result.push(...extract_custom_type_from_annotation(def.getter()));
        } catch (e) {
          // Avoid potential infinite recursion
        }
      }
      break;
    case "pipe":
      const inner =
        def.in ||
        def.schema ||
        (annotation as any).innerType?.() ||
        def.innerType;
      if (inner) {
        result.push(...extract_custom_type_from_annotation(inner));
      }
      break;
  }

  return result;
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

/**
 * NOTE: aligned with dspy [x]
 */
export function format_field_value(
  field: z.ZodType,
  value: any,
  context: Record<string, { type: z.ZodType; value: any }> | null = null,
  assume_text: boolean = true
): string | { type: "text"; text: string } {
  let string_value: string;

  if (is_custom_type(field)) {
    if (context === null) {
      if (typeof value === "string") {
        string_value = value;
      } else {
        throw new Error("Context dict is required to format custom types");
      }
    } else {
      const id = crypto.randomUUID();
      context[id] = { type: field, value: value };
      string_value = `${CUSTOM_TYPE_START_IDENTIFIER}${id}${CUSTOM_TYPE_END_IDENTIFIER}`;
    }
  } else if (Array.isArray(value) && field instanceof z.ZodString) {
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

/**
 * NOTE: aligned with dspy [x]
 */
export function _format_input_list_field_value(value: any[]): string {
  if (value.length === 0) return "N/A";
  if (value.length === 1) return _format_blob(value[0]);
  return value
    .map((txt, idx) => `[${idx + 1}] ${_format_blob(txt)}`)
    .join("\n");
}

/**
 * NOTE: aligned with dspy [x]
 */
export function _format_blob(blob: string): string {
  if (!blob.includes("\n") && !blob.includes("«") && !blob.includes("»")) {
    return `«${blob}»`;
  }
  return `«««\n    ${blob.replace("\n", "\n    ")}\n»»»`;
}

/**
 * NOTE: aligned with dspy [x]
 */
export function translate_field_type(
  field_name: string,
  field: z.ZodType
): string {
  let desc = "";
  if (field instanceof z.ZodString) {
    return `{${field_name}}`;
  } else if (field instanceof z.ZodBoolean) {
    desc = "must be true or false";
  } else if (field instanceof z.ZodNumber) {
    const isInt = (field as any)._def.checks.some(
      (c: any) => c.kind === "int" || c.isInt === true
    );
    desc = `must be a single ${isInt ? "integer" : "float"} value`;
  } else if (field instanceof z.ZodBigInt) {
    desc = "must be a single bigint value";
  } else if (field instanceof z.ZodDate) {
    desc = "must be a single date value";
  } else if (field instanceof z.ZodEnum) {
    desc = "value must be one of: " + (field as z.ZodEnum).options.join(", ");
  } else if (field instanceof z.ZodObject) {
    const simplifiedShape = Object.fromEntries(
      Object.entries(field.shape).map(([k, v]) => [
        k,
        get_annotation_name(v as z.ZodType),
      ])
    );
    desc =
      "must adhere to the JSON schema: " +
      JSON.stringify(simplifiedShape, null, 2);
  }
  const note = desc ? `        # note: the value you produce ${desc}` : "";
  return `{{${field_name}}}${note}`;
}
