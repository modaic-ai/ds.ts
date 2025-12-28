import type { Signature } from "./signatures/signature";

/**
 * Exception raised when adapter cannot parse the LM response.
 */
export class AdapterParseError extends Error {
  override readonly name = "AdapterParseError";
  readonly adapter_name: string;
  readonly signature: Signature;
  readonly lm_response: string;
  readonly parsed_result: Record<string, any> | null;

  constructor(
    adapter_name: string,
    signature: Signature,
    lm_response: string,
    message: string | null = null,
    parsed_result: Record<string, any> | null = null
  ) {
    super();

    this.adapter_name = adapter_name;
    this.signature = signature;
    this.lm_response = lm_response;
    this.parsed_result = parsed_result;

    let fullMessage = message ? `${message}\n\n` : "";
    fullMessage +=
      `Adapter ${adapter_name} failed to parse the LM response. \n\n` +
      `LM Response: ${lm_response} \n\n` +
      `Expected to find output fields in the LM response: [${Object.keys(
        signature.output_fields
      ).join(", ")}] \n\n`;

    if (parsed_result != null) {
      fullMessage += `Actual output fields parsed from the LM response: [${Object.keys(
        parsed_result
      ).join(", ")}] \n\n`;
    }

    this.message = fullMessage;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
