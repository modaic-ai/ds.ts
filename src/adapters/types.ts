import { z } from "zod";

/**
 * Special types in DS.ts like File, Image, Audio, etc. are all functions that return a Zod schema.
 * The zod schema should have name: string and format: function(any) in its meata field
 * Name will be used to tell the LLM what the type is during adapter formatting.
 * Format will be used to turn the type into a dictionary to be sent as a message to the LLM
 * Example:
 * {"type": "image", image: "https://example.com/image.png"}
 */
export const CUSTOM_TYPE_START_IDENTIFIER = "<<CUSTOM-TYPE-START-IDENTIFIER>>";
export const CUSTOM_TYPE_END_IDENTIFIER = "<<CUSTOM-TYPE-END-IDENTIFIER>>";

const DataType = z.union([
  z.instanceof(Uint8Array),
  z.instanceof(ArrayBuffer),
  z.string(),
]);

const FileType = z.union([
  DataType,
  z.object({
    data: DataType,
    filename: z.string().optional(),
    mediaType: z.string().optional(),
  }),
]);

function format_file_type(
  data: z.infer<typeof FileType>,
  defaultMediaType: string,
  type: string = "file"
): {
  type: string;
  mediaType: string;
  data: z.infer<typeof DataType>;
  filename?: string;
} {
  if (
    typeof data === "string" ||
    data instanceof Uint8Array ||
    data instanceof ArrayBuffer
  ) {
    return { type, mediaType: defaultMediaType, data: data };
  }

  if (typeof data === "object" && data !== null && "data" in data) {
    return {
      type,
      mediaType: data.mediaType ?? defaultMediaType,
      data: data.data,
      filename: data.filename,
    };
  }

  throw new Error(`Invalid data for ${type}`);
}

export const File = (
  description?: string,
  name: string = "File",
  mediaType: string = "application/octet-stream"
) =>
  FileType.meta({
    name,
    desc: description,
    format: (data: z.infer<typeof FileType>) =>
      format_file_type(data, mediaType, "file"),
  });

export const Audio = (description?: string, mediaType: string = "audio/mpeg") =>
  File(description, "Audio", mediaType);

/**
 * History represents the conversation history in a DSPy signature.
 * It is a Zod schema for an array of records (messages), marked with metadata
 * to identify it as a history field during adapter formatting.
 *
 * This uses Zod v4's native .meta() support.
 */
export const History = () =>
  z.array(z.record(z.string(), z.any())).meta({ history: true });

export const Image = () =>
  DataType.meta({
    name: "Image",
    format: (data: z.infer<typeof DataType>) => {
      return { type: "image", image: data };
    },
  });

// Helper for putting tool results in your signature input
export const ToolResults = () =>
  z.array(
    z.object({
      type: z.enum(["tool-result", "tool-error"]),
      toolCallId: z.string(),
      toolName: z.string(),
      input: z.record(z.string(), z.any()),
      output: z.record(z.string(), z.any()).optional(),
      error: z.string().optional(),
      dynamic: z.boolean(),
      providerMetadata: z.record(z.string(), z.any()),
    })
  );

/**
 * Split user message content into a list of content blocks.
 *
 * This function splits each user message's content in the `messages` array into a list of content blocks,
 * so that custom types like `dspy.Image` can be properly formatted for better quality. For example,
 * the split content may look like the following if the user message contains a `dspy.Image` object:
 *
 * ```
 * [
 *   { "type": "text", "text": "{text_before_image}" },
 *   { "type": "image_url", "image_url": { "url": "{image_url}" } },
 *   { "type": "text", "text": "{text_after_image}" }
 * ]
 * ```
 *
 * This is implemented by finding the `<<CUSTOM-TYPE-START-IDENTIFIER>>` and `<<CUSTOM-TYPE-END-IDENTIFIER>>`
 * markers in the user message content and splitting the content around them. These reserved identifiers
 * denote custom types, as in `dspy.Type`.
 *
 * @param messages - An array of messages sent to the language model. The format is the same as
 * [OpenAI API's messages format](https://platform.openai.com/docs/guides/chat-completions/response-format).
 * @param context - A mapping of keys to special types populated during adapter formatting.
 * @returns An array of messages with the content split into a list of content blocks around custom types.
 */
export function split_message_content_for_custom_types(
  messages: any[],
  context: Record<string, { type: z.ZodType; value: any }> = {}
): any[] {
  for (const message of messages) {
    if (message.role !== "user" || typeof message.content !== "string") {
      // Custom type messages are only in user messages
      continue;
    }

    const pattern = new RegExp(
      `${CUSTOM_TYPE_START_IDENTIFIER}(.*?)${CUSTOM_TYPE_END_IDENTIFIER}`,
      "gs" // flags
    );
    const result = [];
    let last_end = 0;
    // DSPy adapter always formats user input into a string content before custom type splitting
    const content = message.content;

    for (const match of content.matchAll(pattern)) {
      const start = match.index!;
      const end = start + match[0].length;

      // Add text before the current block
      if (start > last_end) {
        result.push({ type: "text", text: content.slice(last_end, start) });
      }

      // Parse the JSON inside the block
      const custom_type_id = match[1].trim();
      const custom_type_info = context[custom_type_id];

      if (custom_type_info) {
        const { type: field, value } = custom_type_info;
        if (is_custom_type(field)) {
          // We cast to any then CustomTypeMeta to avoid conflicts with Zod's internal meta() type
          const meta = (field as any).meta() as CustomTypeMeta;
          const formatted = meta.format(value);
          if (Array.isArray(formatted)) {
            result.push(...formatted);
          } else {
            result.push(formatted);
          }
        } else {
          result.push({ type: "text", text: String(value) });
        }
      } else {
        throw new Error(`Custom type ${custom_type_id} not found in context`);
      }
      last_end = end;
    }

    if (last_end === 0) {
      // No custom type found, return the original message
      continue;
    }

    // Add any remaining text after the last match
    if (last_end < content.length) {
      result.push({ type: "text", text: content.slice(last_end) });
    }
    message.content = result;
  }
  return messages;
}

export interface CustomTypeMeta {
  name: string;
  format: (value: any) => any;
  desc?: string;
}

export function is_custom_type(
  type: z.ZodType
): type is z.ZodType & { meta: () => CustomTypeMeta } {
  const type_any = type as any;
  const meta = type_any.meta?.() || type_any._def?.meta;

  return (
    meta &&
    typeof meta.name === "string" &&
    typeof meta.format === "function" &&
    typeof type_any.meta === "function"
  );
}
