import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { ChatAdapter } from "../../src/adapters/chat_adapter";
import { JSONAdapter } from "../../src/adapters/json_adapter";
import { Signature } from "../../src/signatures/signature";
import { Image, Audio, File, History } from "../../src/adapters/types";

describe("Custom Type Lifecycle Tests", () => {
  // Common test data
  const testImageUrl = "https://example.com/image.png";
  const testAudioUrl = "https://example.com/audio.mp3";
  const testFileUrl = "https://example.com/file.pdf";
  const testUint8Array = new Uint8Array([1, 2, 3, 4]);

  describe("ChatAdapter.format", () => {
    test("Image type formatting", () => {
      const adapter = new ChatAdapter();
      const signature = new Signature({
        input: z.object({ photo: Image() }),
        output: z.object({ caption: z.string() }),
      });

      const messages = adapter.format(signature, [], { photo: testImageUrl });

      // Find the user message
      const userMessage = messages.find((m) => m.role === "user");
      expect(userMessage).toBeDefined();
      expect(Array.isArray(userMessage!.content)).toBe(true);

      const content = userMessage!.content as unknown as any[];
      const imageBlock = content.find((b) => b.type === "image");
      expect(imageBlock).toEqual({ type: "image", image: testImageUrl });
    });

    test("Audio type formatting", () => {
      const adapter = new ChatAdapter();
      const signature = new Signature({
        input: z.object({ clip: Audio("An audio clip") }),
        output: z.object({ transcript: z.string() }),
      });

      const messages = adapter.format(signature, [], { clip: testAudioUrl });

      const userMessage = messages.find((m) => m.role === "user");
      const content = userMessage!.content as unknown as any[];
      const audioBlock = content.find((b) => b.type === "file");
      expect(audioBlock).toEqual({
        type: "file",
        mediaType: "audio/mpeg",
        data: testAudioUrl,
      });
    });

    test("File type formatting with custom mediaType", () => {
      const adapter = new ChatAdapter();
      const signature = new Signature({
        input: z.object({
          document: File("A PDF doc", "PDF", "application/pdf"),
        }),
        output: z.object({ summary: z.string() }),
      });

      const messages = adapter.format(signature, [], {
        document: testUint8Array,
      });

      const userMessage = messages.find((m) => m.role === "user");
      const content = userMessage!.content as unknown as any[];
      const fileBlock = content.find((b) => b.type === "file");
      expect(fileBlock).toEqual({
        type: "file",
        mediaType: "application/pdf",
        data: testUint8Array,
      });
    });

    test("History type formatting", () => {
      const adapter = new ChatAdapter();
      const signature = new Signature({
        input: z.object({
          history: History(),
          question: z.string(),
        }),
        output: z.object({ answer: z.string() }),
      });

      const historyData = [
        { question: "What is 2+2?", answer: "4" },
        { question: "What is 3+3?", answer: "6" },
      ];

      const messages = adapter.format(signature, [], {
        history: historyData,
        question: "What is 4+4?",
      });

      // Should have System message + 2 rounds of history (4 messages) + 1 current user message = 6 messages
      expect(messages.length).toBe(6);
      expect(messages[0]!.role).toBe("system");

      // Round 1
      expect(messages[1]!.role).toBe("user");
      expect(messages[1]!.content).toContain("What is 2+2?");
      expect(messages[2]!.role).toBe("assistant");
      expect(messages[2]!.content).toContain("4");

      // Round 2
      expect(messages[3]!.role).toBe("user");
      expect(messages[3]!.content).toContain("What is 3+3?");
      expect(messages[4]!.role).toBe("assistant");
      expect(messages[4]!.content).toContain("6");

      // Current
      expect(messages[5]!.role).toBe("user");
      expect(messages[5]!.content).toContain("What is 4+4?");
    });
  });

  describe("JSONAdapter.format", () => {
    test("Image type formatting in JSONAdapter", () => {
      const adapter = new JSONAdapter();
      const signature = new Signature({
        input: z.object({ photo: Image() }),
        output: z.object({ caption: z.string() }),
      });

      const messages = adapter.format(signature, [], { photo: testImageUrl });

      const userMessage = messages.find((m) => m.role === "user");
      expect(userMessage).toBeDefined();
      expect(Array.isArray(userMessage!.content)).toBe(true);

      const content = userMessage!.content as unknown as any[];
      const imageBlock = content.find((b) => b.type === "image");
      expect(imageBlock).toEqual({ type: "image", image: testImageUrl });
    });

    test("History type formatting in JSONAdapter", () => {
      const adapter = new JSONAdapter();
      const signature = new Signature({
        input: z.object({
          history: History(),
          question: z.string(),
        }),
        output: z.object({ answer: z.string() }),
      });

      const historyData = [{ question: "What is 2+2?", answer: "4" }];

      const messages = adapter.format(signature, [], {
        history: historyData,
        question: "What is 3+3?",
      });

      // JSONAdapter uses assistant message as JSON
      expect(messages[2]!.role).toBe("assistant");
      // JSONAdapter.format_assistant_message_content returns a JSON string
      const parsedOutput = JSON.parse(messages[2]!.content);
      expect(parsedOutput).toEqual({ answer: "4" });
    });
  });

  describe("Multiple Custom Types", () => {
    test("Multiple custom types in one user message", () => {
      const adapter = new ChatAdapter();
      const signature = new Signature({
        input: z.object({
          image1: Image(),
          image2: Image(),
          text: z.string(),
        }),
        output: z.object({ description: z.string() }),
      });

      const messages = adapter.format(signature, [], {
        image1: "https://example.com/1.png",
        image2: "https://example.com/2.png",
        text: "Compare these two images.",
      });

      const userMessage = messages.find((m) => m.role === "user");
      const content = userMessage!.content as unknown as any[];

      const imageBlocks = content.filter((b) => b.type === "image");
      expect(imageBlocks.length).toBe(2);
      expect(imageBlocks[0]!.image).toBe("https://example.com/1.png");
      expect(imageBlocks[1]!.image).toBe("https://example.com/2.png");

      const textBlocks = content.filter((b) => b.type === "text");
      // Should have text for each field + possibly requirements suffix
      expect(
        textBlocks.some((b) => b.text.includes("Compare these two images."))
      ).toBe(true);
    });
  });
});
