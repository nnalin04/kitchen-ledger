/**
 * Computes an exponential-backoff delay with up to 30 % random jitter.
 *
 * @param attempt - Zero-based retry attempt counter (0 = first retry).
 * @returns Delay in milliseconds, capped at 30 000 ms.
 *
 * Formula:
 *   base   = 1 000 ms
 *   exp    = base * 2^attempt          (doubles each attempt)
 *   capped = min(exp, 30 000)
 *   jitter = capped * (1 + rand * 0.3) (adds up to 30 % random spread)
 */
export function computeBackoffMs(attempt: number): number {
  const baseDelay = 1_000;
  const maxDelay = 30_000;
  const exponential = baseDelay * Math.pow(2, attempt);
  const capped = Math.min(exponential, maxDelay);
  const jitter = capped * (1 + Math.random() * 0.3);
  return Math.floor(jitter);
}
