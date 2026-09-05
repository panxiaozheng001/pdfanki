export interface ApiKeyLookup {
  envVar: string;
  /* Required and nullable rather than optional: the lookup always answers, and
     undefined is the answer "that variable is not set", which every caller reads. */
  apiKey: string | undefined;
}

export function getProviderEnvVarName(provider: string): string {
  return `${provider.trim().toUpperCase()}_API_KEY`;
}

export function providerRequiresApiKey(provider: string): boolean {
  return provider.trim().toLowerCase() !== "codex";
}

/**
 * Read the API key for a provider from process.env.
 * Does not throw; caller can decide whether to enforce.
 */
export function readProviderApiKey(provider: string): ApiKeyLookup {
  const envVar = getProviderEnvVarName(provider);
  const apiKey = process.env[envVar];
  return { envVar, apiKey };
}
