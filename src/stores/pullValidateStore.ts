import { reactive, computed } from "vue";
import type { IptvPlayItem } from "@/api/iptv";
import type { PlayUrls } from "@/api/client";

export interface PullQueueItem {
  /** 播放地址数据 */
  item: IptvPlayItem;
  /** 加入时间 */
  addedAt: number;
}

// 验证结果中的截图信息
export interface SnapshotResult {
  /** snapshot entry ID */
  snapshotId: string;
  /** 状态 */
  status: "pending" | "capturing" | "completed" | "error";
  /** 错误信息 */
  error?: string;
  /** 完成后加载 URL */
  imageUrl?: string;
}

// 单条拉流验证的任务结果
export interface ValidationTaskResult {
  /** 播放地址 ID */
  itemId: number;
  channelName: string;
  url: string;
  streamId: string;
  protocol: string;
  /** 拉流验证状态 */
  status: "pending" | "submitting" | "success" | "error" | "no-stream" | "done";
  /** 消息 */
  message?: string;
  /** 截图结果 */
  snapshot?: SnapshotResult;
  /** 播放地址 (拉流成功后获取) */
  playUrls?: PlayUrls;
  /** 完成时间 */
  completedAt?: number;
}

// 持久化的验证项状态（供播放地址页读取）
export interface ValidatedItemState {
  itemId: number;
  channelName: string;
  status: "success" | "error" | "no-stream" | "done";
  snapshot?: SnapshotResult;
  playUrls?: PlayUrls;
  completedAt: number;
}

const state = reactive<{
  queue: PullQueueItem[];
  /** 最近一次验证的所有任务结果 */
  lastResults: ValidationTaskResult[];
  /** 是否已完成过一次验证 */
  hasResults: boolean;
  /** 持久化的验证结果，key=itemId (不会被清空，供其他页面读取) */
  validatedItems: Record<number, ValidatedItemState>;
}>({
  queue: [],
  lastResults: [],
  hasResults: false,
  validatedItems: {},
});

export function usePullValidateStore() {
  const queueCount = computed(() => state.queue.length);

  const queuedIds = computed(() => new Set(state.queue.map((q) => q.item.id)));

  /** 添加到拉流验证队列 */
  function addToQueue(items: IptvPlayItem[]) {
    for (const item of items) {
      const exists = state.queue.some((q) => q.item.id === item.id);
      if (exists) continue;
      state.queue.push({ item, addedAt: Date.now() });
    }
  }

  /** 从队列移除 */
  function removeFromQueue(id: number) {
    state.queue = state.queue.filter((q) => q.item.id !== id);
  }

  /** 清除整个队列 */
  function clearQueue() {
    state.queue = [];
  }

  /** 批量移除 */
  function removeBatch(ids: Set<number>) {
    state.queue = state.queue.filter((q) => !ids.has(q.item.id));
  }

  /** 保存验证结果 */
  function saveResults(results: ValidationTaskResult[]) {
    state.lastResults = results;
    state.hasResults = true;
  }

  /** 更新单个任务的截图信息 */
  function updateTaskSnapshot(itemId: number, snapshot: SnapshotResult) {
    const task = state.lastResults.find((r) => r.itemId === itemId);
    if (task) {
      task.snapshot = snapshot;
    }
  }

  /** 更新单个任务的状态 */
  function updateTaskStatus(itemId: number, status: ValidationTaskResult["status"], message?: string) {
    const task = state.lastResults.find((r) => r.itemId === itemId);
    if (task) {
      task.status = status;
      if (message !== undefined) task.message = message;
      if (status === "done" || status === "error" || status === "no-stream") {
        task.completedAt = Date.now();
      }
    }
  }

  /** 更新任务的播放地址 */
  function updateTaskPlayUrls(itemId: number, playUrls: PlayUrls) {
    const task = state.lastResults.find((r) => r.itemId === itemId);
    if (task) {
      task.playUrls = playUrls;
    }
  }

  /** 将验证完成的任务持久化到 validatedItems */
  function persistCompletedResults() {
    for (const task of state.lastResults) {
      const finalStatuses: ValidationTaskResult["status"][] = ["success", "error", "no-stream", "done"];
      if (finalStatuses.includes(task.status) && task.completedAt) {
        state.validatedItems[task.itemId] = {
          itemId: task.itemId,
          channelName: task.channelName,
          status: task.status === "success" ? "done" : (task.status as "error" | "no-stream" | "done"),
          snapshot: task.snapshot,
          playUrls: task.playUrls,
          completedAt: task.completedAt,
        };
      }
    }
  }

  /** 获取指定 itemId 的验证状态 */
  function getValidatedItem(itemId: number): ValidatedItemState | undefined {
    return state.validatedItems[itemId];
  }

  /** 更新持久化验证项的快照 (支持从播放地址页触发) */
  function updateValidatedItemSnapshot(itemId: number, snapshot: SnapshotResult) {
    const item = state.validatedItems[itemId];
    if (item) {
      item.snapshot = snapshot;
    }
  }

  /** 清除验证结果 */
  function clearResults() {
    state.lastResults = [];
    state.hasResults = false;
  }

  // 使用 getter 确保组件始终获取 state 的最新引用，
  // 避免因 state.lastResults/state.queue 重新赋值导致引用断裂
  const store = {
    get queue() { return state.queue; },
    queueCount,
    queuedIds,
    get lastResults() { return state.lastResults; },
    get hasResults() { return state.hasResults; },
    get validatedItems() { return state.validatedItems; },
    addToQueue,
    removeFromQueue,
    clearQueue,
    removeBatch,
    saveResults,
    updateTaskSnapshot,
    updateTaskStatus,
    updateTaskPlayUrls,
    persistCompletedResults,
    getValidatedItem,
    updateValidatedItemSnapshot,
    clearResults,
  };

  return store;
}
