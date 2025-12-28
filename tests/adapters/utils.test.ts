import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  get_annotation_name,
  get_field_description_string,
  extract_custom_type_from_annotation,
  parseValue,
  formatFieldValue,
  format_field_value,
  _format_input_list_field_value,
  _format_blob,
  translate_field_type,
} from "../../src/adapters/utils";
import {
  Image,
  Audio,
  CUSTOM_TYPE_START_IDENTIFIER,
  CUSTOM_TYPE_END_IDENTIFIER,
} from "../../src/adapters/types";

describe("get_annotation_name", () => {
  test("basic types", () => {
    expect(get_annotation_name(z.string())).toBe("string");
    expect(get_annotation_name(z.number())).toBe("number");
    expect(get_annotation_name(z.boolean())).toBe("boolean");
    expect(get_annotation_name(z.null())).toBe("null");
    expect(get_annotation_name(z.undefined())).toBe("undefined");
    expect(get_annotation_name(z.any())).toBe("any");
    expect(get_annotation_name(z.unknown())).toBe("unknown");
  });

  test("complex types", () => {
    expect(get_annotation_name(z.object({ name: z.string() }))).toBe(
      "object({ name: string })"
    );
    expect(get_annotation_name(z.array(z.number()))).toBe("array(number)");
    expect(get_annotation_name(z.union([z.string(), z.number()]))).toBe(
      "union(string | number)"
    );
    expect(get_annotation_name(z.tuple([z.string(), z.number()]))).toBe(
      "tuple([string, number])"
    );
  });

  test("wrappers", () => {
    expect(get_annotation_name(z.string().optional())).toBe("optional(string)");
    expect(get_annotation_name(z.string().nullable())).toBe("nullable(string)");
    expect(get_annotation_name(z.string().default("test"))).toBe(
      'default(string, "test")'
    );
  });

  test("custom names via metadata", () => {
    const custom = z.string().meta({ name: "MyCustomType" });
    expect(get_annotation_name(custom)).toBe("MyCustomType");
  });
});

describe("get_field_description_string", () => {
  test("basic fields", () => {
    const fields = {
      name: z.string().describe("the name"),
      age: z.number().describe("the age"),
    };
    const result = get_field_description_string(fields);
    expect(result).toContain("1. `name` (string): the name");
    expect(result).toContain("2. `age` (number): the age");
  });

  test("fields with custom types and meta descriptions", () => {
    const fields = {
      photo: Image().describe("the photo"),
    };
    // Note: Image() meta has name: "Image", format: ..., and we'll check its integration
    const result = get_field_description_string(fields);
    expect(result).toContain("1. `photo` (Image): the photo");
  });

  test("constraints from metadata", () => {
    const fields = {
      count: z.number().meta({ constraints: "must be positive" }),
    };
    const result = get_field_description_string(fields);
    expect(result).toContain("Constraints: must be positive");
  });
});

describe("extract_custom_type_from_annotation", () => {
  test("top level custom type", () => {
    const img = Image();
    const result = extract_custom_type_from_annotation(img);
    expect(result).toHaveLength(1);
    expect(get_annotation_name(result[0]!)).toBe("Image");
  });

  test("nested custom types", () => {
    const schema = z.object({
      profile: z.object({
        avatar: Image(),
      }),
      files: z.array(Audio()),
    });
    const result = extract_custom_type_from_annotation(schema);
    expect(result).toHaveLength(2);
    const names = result.map((t) => get_annotation_name(t));
    expect(names).toContain("Image");
    expect(names).toContain("Audio");
  });
});

describe("parseValue and formatFieldValue", () => {
  test("formatFieldValue", () => {
    expect(formatFieldValue("hello")).toBe("hello");
    expect(formatFieldValue(null)).toBe("");
    expect(formatFieldValue(undefined)).toBe("");
    expect(formatFieldValue({ a: 1 })).toBe(JSON.stringify({ a: 1 }, null, 2));
  });

  test("parseValue basic", () => {
    expect(parseValue(z.string(), " hello ")).toBe("hello");
    expect(parseValue(z.number(), " 42 ")).toBe(42);
    expect(parseValue(z.boolean(), " true ")).toBe(true);
    expect(parseValue(z.boolean(), " false ")).toBe(false);
  });

  test("parseValue JSON", () => {
    const schema = z.object({ a: z.number() });
    expect(parseValue(schema, '{"a": 1}')).toEqual({ a: 1 });
  });

  test("parseValue errors", () => {
    expect(() => parseValue(z.number(), "not a number")).toThrow();
    expect(() =>
      parseValue(z.object({ a: z.number() }), "invalid json")
    ).toThrow();
  });
});

describe("format_field_value and blobs", () => {
  test("_format_blob", () => {
    expect(_format_blob("hello")).toBe("«hello»");
    expect(_format_blob("hello\nworld")).toBe("«««\n    hello\n    world\n»»»");
  });

  test("_format_input_list_field_value", () => {
    expect(_format_input_list_field_value([])).toBe("N/A");
    expect(_format_input_list_field_value(["a"])).toBe("«a»");
    expect(_format_input_list_field_value(["a", "b"])).toBe("[1] «a»\n[2] «b»");
  });

  test("format_field_value with standard types", () => {
    expect(format_field_value(z.string(), "test")).toBe('"test"'); // JSON.stringify
    expect(format_field_value(z.string(), ["a", "b"])).toBe("[1] «a»\n[2] «b»");
  });

  test("format_field_value with custom types", () => {
    const context: Record<string, any> = {};
    const imgField = Image();
    const val = "data:image/png;base64,abc";
    const result = format_field_value(imgField, val, context) as string;

    expect(result).toContain(CUSTOM_TYPE_START_IDENTIFIER);
    expect(result).toContain(CUSTOM_TYPE_END_IDENTIFIER);

    // Extract UUID
    const uuid = result
      .replace(CUSTOM_TYPE_START_IDENTIFIER, "")
      .replace(CUSTOM_TYPE_END_IDENTIFIER, "");

    expect(context[uuid]).toBeDefined();
    expect(context[uuid].type).toBe(imgField);
    expect(context[uuid].value).toBe(val);
  });

  test("format_field_value with custom types and null context", () => {
    const imgField = Image();
    const stringVal = "{img}";
    expect(format_field_value(imgField, stringVal, null)).toBe(stringVal);

    const nonStringVal = { url: "test" };
    expect(() => format_field_value(imgField, nonStringVal, null)).toThrow(
      "Context dict is required to format custom types"
    );
  });
});

describe("translate_field_type", () => {
  test("string", () => {
    expect(translate_field_type("my_field", z.string())).toBe("{my_field}");
  });

  test("boolean", () => {
    expect(translate_field_type("my_field", z.boolean())).toBe(
      "{{my_field}}        # note: the value you produce must be true or false"
    );
  });

  test("number", () => {
    expect(translate_field_type("my_field", z.number())).toBe(
      "{{my_field}}        # note: the value you produce must be a single float value"
    );
    expect(translate_field_type("my_field", z.number().int())).toBe(
      "{{my_field}}        # note: the value you produce must be a single integer value"
    );
  });

  test("enum", () => {
    const schema = z.enum(["a", "b"]);
    expect(translate_field_type("my_field", schema)).toBe(
      "{{my_field}}        # note: the value you produce value must be one of: a, b"
    );
  });

  test("object", () => {
    const schema = z.object({ a: z.number() });
    const result = translate_field_type("my_field", schema);
    expect(result).toContain(
      "{{my_field}}        # note: the value you produce must adhere to the JSON schema:"
    );
    expect(result).toContain('"a": "number"'); // check generated schema snippet
  });
});
