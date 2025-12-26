import { z } from "zod";

const CUSTOM_TYPE_START_IDENTIFIER = "<<CUSTOM-TYPE-START-IDENTIFIER>>";
const CUSTOM_TYPE_END_IDENTIFIER = "<<CUSTOM-TYPE-END-IDENTIFIER>>";

const FileType = z.union([
  z.instanceof(Uint8Array),
  z.instanceof(ArrayBuffer),
  z.string(),
]);

const File = (mediaType?: string) =>
  z
    .union([
      FileType,
      z.object({
        data: FileType,
        filename: z.string().optional(),
        mediaType: z.string().optional(),
      }),
    ])
    .meta({ type: "file", ...(mediaType ? { mediaType } : {}) });

export const Audio = (mediaType?: string) => File(mediaType || "audio/mpeg");

/**
 * History represents the conversation history in a DSPy signature.
 * It is a Zod schema for an array of records (messages), marked with metadata
 * to identify it as a history field during adapter formatting.
 *
 * This uses Zod v4's native .meta() support.
 */
export const History = () =>
  z.array(z.record(z.string(), z.any())).meta({ history: true });

export const Image = () => FileType.meta({ type: "image" });

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
 * @returns An array of messages with the content split into a list of content blocks around custom types.
 */
export function split_message_content_for_custom_types(messages: any[]): any[] {
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }

    const pattern = new RegExp(
      `${CUSTOM_TYPE_START_IDENTIFIER}(.*?)${CUSTOM_TYPE_END_IDENTIFIER}`,
      "gs" // flags
    );

    const result = [];
    let last_end = 0;
    const content = message.content;
    for (const match of content.matchAll(pattern)) {
      const start = match.index;
      const end = match.index + match[0].length;

      if (start > last_end) {
        result.push({ type: "text", text: content.slice(last_end, start) });
      }
      const custom_type_content = match.group(1).trim();
      const parsed = null;
      for (const parse_fn of [
        JSON.parse,
        _parse_doubly_quoted_json,
        json_repair.parse,
      ]) {
        try {
          parsed = parse_fn(custom_type_content);
          break;
        } catch (e) {
          continue;
        }
      }

      if (start > last_end) {
        result.push({ type: "text", text: content.slice(last_end, start) });
      }
    }
  }
}
