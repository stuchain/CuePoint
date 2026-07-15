/** Parse Server-Sent Event frames from a fetch response body. */

export async function* readSseJsonEvents(
  response: Response,
): AsyncGenerator<Record<string, unknown>> {
  if (!response.body) {
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const block = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
      if (dataLine) {
        yield JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
      }
      separatorIndex = buffer.indexOf("\n\n");
    }
  }
}

export async function collectSseUntilTerminal(
  response: Response,
  isTerminal: (state: string) => boolean,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  for await (const event of readSseJsonEvents(response)) {
    onEvent(event);
    const state = typeof event.state === "string" ? event.state : "";
    if (state && isTerminal(state)) {
      return;
    }
    if (event.type === "error") {
      const message =
        typeof event.message === "string" ? event.message : "Job event stream failed";
      throw new Error(message);
    }
  }
}
