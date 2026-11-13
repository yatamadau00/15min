// Derive timer time from the server plus elapsed monotonic time, not the device wall clock.
export function createServerClock(monotonic = () => performance.now()) {
  let sample: {server: number; local: number} | undefined;
  return {
    sync(server: number) {
      if (!Number.isFinite(server) || server <= 0 || (sample && server < sample.server)) return;
      sample = {server, local: monotonic()};
    },
    ready: () => sample !== undefined,
    now: () => sample ? sample.server + Math.max(0, monotonic() - sample.local) : Date.now(),
  };
}

// Shared by the 250ms display ticker and 4s synchronization; polling cannot bypass backoff.
export function createSettlementGate(monotonic = () => performance.now()) {
  let inFlight = false, nextAttempt = 0, failures = 0;
  return {
    begin() {
      if (inFlight || monotonic() < nextAttempt) return false;
      inFlight = true;
      return true;
    },
    finish(success: boolean) {
      inFlight = false;
      if (success) {failures = 0; nextAttempt = 0;}
      else {nextAttempt = monotonic() + Math.min(4000 * 2 ** failures, 60000); failures = Math.min(failures + 1, 4);}
    },
  };
}
