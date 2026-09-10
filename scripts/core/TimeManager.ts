/**
 * 时间管理：所有"现在几点"都走这里。
 * 关键：作物用"种植时间戳"而非"剩余时间"，杀进程后再开能正确算出进度。
 *
 * Phase 2 接服务端校时后，把 serverTimeOffset 填上即可防本地改时间作弊。
 */
export class TimeManager {
    private _serverTimeOffset = 0;

    /** 当前时间戳（毫秒） */
    now(): number {
        return Date.now() + this._serverTimeOffset;
    }

    /** Phase 2 用：同步服务端时间 */
    syncServerTime(serverNow: number) {
        this._serverTimeOffset = serverNow - Date.now();
    }

    /** 给定种植时间戳 + 总时长，算出当前阶段（0 ~ stages-1） */
    getCropStage(plantedAt: number, duration: number, stages: number): number {
        const elapsedSec = (this.now() - plantedAt) / 1000;
        const progress = Math.min(Math.max(elapsedSec / duration, 0), 1);
        return Math.min(Math.floor(progress * stages), stages - 1);
    }

    /** 是否已成熟 */
    isReady(plantedAt: number, duration: number): boolean {
        return this.now() - plantedAt >= duration * 1000;
    }

    /** 是否已枯萎（成熟后超过 witherWindow 时间） */
    isWithered(plantedAt: number, duration: number, witherWindow: number): boolean {
        return this.now() - plantedAt >= (duration + witherWindow) * 1000;
    }

    /** 剩余成熟时间（秒），已成熟返回 0 */
    secondsToReady(plantedAt: number, duration: number): number {
        const remain = duration - (this.now() - plantedAt) / 1000;
        return Math.max(0, Math.floor(remain));
    }
}