/**
 * Keystroke Dynamics Tracker.
 * Captures key down/up events with timestamps.
 * Used as confidence modifier, not core stress signal.
 */

export interface KeystrokeEvent {
  key: string;
  timestamp_ms: number;
  event_type: "down" | "up";
}

export class KeystrokeTracker {
  private events: KeystrokeEvent[] = [];
  private isTracking = false;
  private handleKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private handleKeyUp: ((e: KeyboardEvent) => void) | null = null;

  start(): void {
    if (this.isTracking) return;
    this.events = [];
    this.isTracking = true;

    this.handleKeyDown = (e: KeyboardEvent) => {
      if (!this.isTracking) return;
      this.events.push({
        key: e.key,
        timestamp_ms: performance.now(),
        event_type: "down",
      });
    };

    this.handleKeyUp = (e: KeyboardEvent) => {
      if (!this.isTracking) return;
      this.events.push({
        key: e.key,
        timestamp_ms: performance.now(),
        event_type: "up",
      });
    };

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
  }

  getEvents(): KeystrokeEvent[] {
    return [...this.events];
  }

  getStats(): { count: number; errorRate: number; speed: number } {
    const downEvents = this.events.filter((e) => e.event_type === "down");
    const backspaces = downEvents.filter(
      (e) => e.key === "Backspace" || e.key === "Delete"
    ).length;
    const errorRate = downEvents.length > 0 ? backspaces / downEvents.length : 0;

    let speed = 0;
    if (downEvents.length >= 2) {
      const totalMs = downEvents[downEvents.length - 1].timestamp_ms - downEvents[0].timestamp_ms;
      speed = totalMs > 0 ? (downEvents.length / totalMs) * 60000 : 0;
    }

    return { count: downEvents.length, errorRate, speed };
  }

  stop(): void {
    this.isTracking = false;
    if (this.handleKeyDown) window.removeEventListener("keydown", this.handleKeyDown);
    if (this.handleKeyUp) window.removeEventListener("keyup", this.handleKeyUp);
    this.handleKeyDown = null;
    this.handleKeyUp = null;
  }

  reset(): void {
    this.events = [];
  }
}
