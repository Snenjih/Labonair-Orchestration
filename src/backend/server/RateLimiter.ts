export class RateLimiter {
  private windows = new Map<string, number[]>();

  constructor(
    private readonly maxRequests = 30,
    private readonly windowMs = 60_000,
  ) {}

  check(deviceId: string): boolean {
    const now = Date.now();
    const recent = (this.windows.get(deviceId) ?? []).filter(t => now - t < this.windowMs);
    if (recent.length >= this.maxRequests) { return false; }
    recent.push(now);
    this.windows.set(deviceId, recent);
    return true;
  }

  reset(deviceId: string): void {
    this.windows.delete(deviceId);
  }

  clear(): void {
    this.windows.clear();
  }
}
