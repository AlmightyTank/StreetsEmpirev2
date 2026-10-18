export type ModerationCategories = {
  hate?: boolean;
  'hate/threatening'?: boolean;
};

type ModerationResponse = {
  results?: Array<{ categories?: ModerationCategories }>;
};

export function isHateful(categories: ModerationCategories | undefined): boolean {
  return categories?.hate === true || categories?.['hate/threatening'] === true;
}

/** Check one message with OpenAI's moderation endpoint. */
export async function moderateMessage(input: {
  text: string;
  apiKey: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const response = await (input.fetchImpl ?? fetch)('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: input.text }),
    signal: AbortSignal.timeout(input.timeoutMs),
  });

  if (!response.ok) throw new Error(`OpenAI moderation returned HTTP ${response.status}.`);
  const result = (await response.json()) as ModerationResponse;
  return isHateful(result.results?.[0]?.categories);
}
