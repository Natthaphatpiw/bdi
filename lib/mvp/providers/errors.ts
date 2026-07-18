export class ProviderUnavailableError extends Error {
  constructor(
    message: string,
    public readonly providerKind: "model" | "knowledge",
    public readonly retryable = true,
  ) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

export class ProviderValidationError extends Error {
  constructor(message: string, public readonly issues: string[] = []) {
    super(message);
    this.name = "ProviderValidationError";
  }
}
