/**
 * TimeManager — single source of "now" across both clients and server rooms.
 *
 * Phase 1: pure local clock.
 * Phase 2: server offset fed via syncServerTime() (JWT login or WS hello).
 *
 * All crop growth uses absolute epoch-ms timestamps (plantedAt / matureAt),
 * never relative duration, so a process kill / device reboot resumes growth on
 * next launch without bookkeeping.
 */

export class TimeManager {
  private _serverTimeOffset = 0;

  /** Current epoch ms (local + server offset). */
  now(): number {
    return Date.now() + this._serverTimeOffset;
  }

  /** Phase 2: called after auth handshake to anchor clock to server. */
  syncServerTime(serverNow: number): void {
    this._serverTimeOffset = serverNow - Date.now();
  }

  /** Drop the server offset; used on logout / clock-resync failure. */
  reset(): void {
    this._serverTimeOffset = 0;
  }

  /** Compute the visual growth stage given plantedAt + total duration + stage count. */
  getCropStage(plantedAt: number, duration: number, stages: number): number {
    if (duration <= 0 || stages <= 0) return 0;
    const elapsedSec = (this.now() - plantedAt) / 1000;
    const progress = Math.min(Math.max(elapsedSec / duration, 0), 1);
    return Math.min(Math.floor(progress * stages), stages - 1);
  }

  /** True if the planted crop has reached its matureAt at the current clock. */
  isReady(plantedAt: number, duration: number): boolean {
    return this.now() - plantedAt >= duration * 1000;
  }

  /** True if the crop has been ripe for longer than the witherWindow. */
  isWithered(plantedAt: number, duration: number, witherWindow: number): boolean {
    return this.now() - plantedAt >= (duration + witherWindow) * 1000;
  }

  /** Seconds remaining until ripe; 0 if already ripe. */
  secondsToReady(plantedAt: number, duration: number): number {
    const remain = duration - (this.now() - plantedAt) / 1000;
    return Math.max(0, Math.floor(remain));
  }
}