export function json(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

export function methodNotAllowed(methods: string[]): Response {
  return new Response(null, {
    status: 405,
    headers: { Allow: methods.join(", ") },
  });
}

export async function readJson<T>(request: Request, maxBytes = 250_000): Promise<T> {
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > maxBytes) throw new HttpError(413, "Request is too large.");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new HttpError(413, "Request is too large.");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

export async function readGzipJson<T>(request: Request, maxCompressedBytes: number, maxDecodedBytes: number): Promise<T> {
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > maxCompressedBytes) throw new HttpError(413, "Compressed request is too large.");
  const compressed = await request.arrayBuffer();
  if (compressed.byteLength > maxCompressedBytes) throw new HttpError(413, "Compressed request is too large.");

  let stream: ReadableStream<Uint8Array>;
  try {
    stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
  } catch {
    throw new HttpError(400, "Compressed request could not be opened.");
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let decodedBytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      decodedBytes += value.byteLength;
      if (decodedBytes > maxDecodedBytes) {
        await reader.cancel();
        throw new HttpError(413, "Decoded request is too large.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Compressed request could not be opened.");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export function errorResponse(error: unknown, fallback = "Request could not be completed."): Response {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  console.error(fallback, error);
  return json({ error: fallback }, 500);
}
