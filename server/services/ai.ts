interface GeminiRequestOptions {
  systemInstruction: string;
  prompt: string;
  responseFormat?: "json";
}

interface GeminiApiError {
  error?: {
    message?: unknown;
    status?: unknown;
  };
}

export class AIProviderError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "AIProviderError";
  }
}

const geminiModel = "gemini-3.5-flash-lite";

function mapGeminiFailure(status: number, providerError: GeminiApiError["error"] | null) {
  const detail = typeof providerError?.message === "string" ? providerError.message.toLowerCase() : "";
  const statusName = typeof providerError?.status === "string" ? providerError.status : "";

  if (detail.includes("api key not valid") || detail.includes("api_key_invalid") || statusName === "UNAUTHENTICATED" || status === 401) {
    return {
      status: 503,
      message: "Gemini rejected the configured API key. Check GEMINI_API_KEY in the server environment.",
    };
  }
  if (status === 429 || statusName === "RESOURCE_EXHAUSTED" || /quota|free.?tier|billing/i.test(detail)) {
    const quotaExceeded = /quota|free.?tier|billing|daily limit/i.test(detail);
    return quotaExceeded
      ? { status: 429, message: "Gemini API quota is exhausted or the free-tier limit was reached. Check the Gemini API project quota and billing, then try again." }
      : { status: 429, message: "Gemini is receiving too many requests. Please wait a moment and try again." };
  }
  if (status === 403) {
    return {
      status: 503,
      message: "Gemini denied access to this API key or model. Check the key’s project, API access, and model availability.",
    };
  }
  if (status === 503) {
    return {
      status: 503,
      message: "Gemini is temporarily unavailable or experiencing high demand. Please try again shortly.",
    };
  }
  return {
    status: 502,
    message: "Gemini could not complete this request. Please try again.",
  };
}

export async function generateGeminiContent(options: GeminiRequestOptions): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new AIProviderError(503, "AI provider is not configured. Set GEMINI_API_KEY in the server environment.");
  }

  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model: geminiModel,
        system_instruction: options.systemInstruction,
        input: options.prompt,
        generation_config: {
          temperature: options.responseFormat === "json" ? 0.1 : 0.4,
        },
        ...(options.responseFormat === "json"
          ? { response_format: { type: "text", mime_type: "application/json" } }
          : {}),
      }),
      signal: AbortSignal.timeout(45000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new AIProviderError(504, "Gemini took too long to respond. Please try again.");
    }
    throw new AIProviderError(502, "Could not connect to Gemini. Please check the connection and try again.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null) as GeminiApiError | null;
    const failure = mapGeminiFailure(response.status, body?.error ?? null);
    throw new AIProviderError(failure.status, failure.message);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AIProviderError(502, "Gemini returned an invalid response. Please try again.");
  }
  if (!body || typeof body !== "object" || !("steps" in body) || !Array.isArray(body.steps)) {
    throw new AIProviderError(502, "Gemini returned an invalid response. Please try again.");
  }

  const text = body.steps
    .filter((step: unknown): step is { type: string; content: unknown[] } =>
      Boolean(step && typeof step === "object" && "type" in step && step.type === "model_output" && "content" in step && Array.isArray(step.content)),
    )
    .flatMap((step) => step.content)
    .filter((content: unknown): content is { type: string; text: string } =>
      Boolean(content && typeof content === "object" && "type" in content && content.type === "text" && "text" in content && typeof content.text === "string"),
    )
    .map((content) => content.text)
    .join("")
    .trim();
  if (!text) {
    throw new AIProviderError(502, "Gemini returned an empty response. Please try again.");
  }
  return text;
}
