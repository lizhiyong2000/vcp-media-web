import { ref, onMounted, onUnmounted } from "vue";
import {
  pullValidateTasks,
  getPullTask,
  listPullTasks,
  snapshotImageUrl,
  isTerminalPullTask,
  pullTaskStatusLabel,
  type PullTask,
} from "@/api/iptv";
import { fetchPlayUrls } from "@/api/client";
import {
  usePullValidateStore,
  type ValidationTaskResult,
} from "@/stores/pullValidateStore";

const POLL_INTERVAL_MS = 1500;

function mapPullTaskToStore(
  itemId: number,
  pullTask: PullTask,
  update: ReturnType<typeof usePullValidateStore>,
) {
  update.updateTaskId(itemId, pullTask.id);

  const task = update.getActiveTask(itemId);
  if (!task) return;

  task.backendStatus = pullTask.status;
  task.errorMessage = pullTask.error_message;

  const status = pullTask.status;
  if (status === "completed") {
    update.updateTaskStatus(itemId, "done", "验证完成");
    if (pullTask.snapshot_id) {
      update.updateTaskSnapshot(itemId, {
        snapshotId: pullTask.snapshot_id,
        status: "completed",
        imageUrl: snapshotImageUrl(pullTask.snapshot_id),
      });
    }
    return;
  }
  if (status === "failed" || status === "error") {
    update.updateTaskStatus(itemId, "error", pullTask.error_message || "验证失败");
    return;
  }
  if (status === "stopped") {
    update.updateTaskStatus(itemId, "error", "任务已停止");
    return;
  }
  update.updateTaskStatus(itemId, "success", pullTaskStatusLabel(status));
}

export function usePullValidateRunner() {
  const store = usePullValidateStore();
  const runningCount = ref(0);
  const isSubmitting = ref(false);
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let tickInFlight = false;

  async function submitPending() {
    const pendingItems = store.queue.filter((q) => {
      const task = store.getActiveTask(q.item.id);
      return task
        && !task.taskId
        && task.status === "pending"
        && !task.backendStatus;
    });
    if (pendingItems.length === 0) return;

    for (const q of pendingItems) {
      store.updateTaskStatus(q.item.id, "submitting", "正在提交任务...");
    }

    const payload = pendingItems.map((q) => {
      const task = store.getActiveTask(q.item.id)!;
      return {
        url: task.url,
        stream_id: task.streamId,
        protocol: task.protocol,
        channel_name: task.channelName,
        play_item_id: task.itemId,
      };
    });

    isSubmitting.value = true;
    try {
      const response = await pullValidateTasks(payload);
      const data = response.data;
      if (!data) {
        throw new Error(response.message || "创建任务失败");
      }

      const resultMap = new Map<string, (typeof data.results)[number]>();
      for (const r of data.results) {
        resultMap.set(r.stream_id, r);
      }

      for (const q of pendingItems) {
        const task = store.getActiveTask(q.item.id);
        if (!task) continue;
        const result = resultMap.get(task.streamId);
        if (!result || result.status === "error" || result.task_id <= 0) {
          store.updateTaskStatus(q.item.id, "error", result?.message || "创建任务失败");
          continue;
        }
        store.updateTaskId(q.item.id, result.task_id);
        store.updateTaskStatus(q.item.id, "success", result.message || "已加入任务队列");
        const active = store.getActiveTask(q.item.id);
        if (active) active.backendStatus = "pending";
      }
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { message?: string } }; message?: string })
          ?.response?.data?.message
        || (err as { message?: string })?.message
        || "拉流请求失败";
      for (const q of pendingItems) {
        const task = store.getActiveTask(q.item.id);
        if (task?.status === "submitting") {
          store.updateTaskStatus(q.item.id, "error", errorMsg);
        }
      }
    } finally {
      isSubmitting.value = false;
    }
  }

  async function pollActiveTasks() {
    try {
      const listResp = await listPullTasks(undefined, 200);
      if (listResp.data) {
        runningCount.value = listResp.data.running;
      }

      const tasksToPoll = store.queue
        .map((q) => store.getActiveTask(q.item.id))
        .filter(
          (task): task is ValidationTaskResult =>
            !!task?.taskId
            && task.status !== "done"
            && task.status !== "error"
            && !isTerminalPullTask(task.backendStatus || ""),
        );

      for (const task of tasksToPoll) {
        const resp = await getPullTask(task.taskId!);
        const pullTask = resp.data;
        if (!pullTask) continue;

        mapPullTaskToStore(task.itemId, pullTask, store);

        if (isTerminalPullTask(pullTask.status)) {
          const latest = store.getActiveTask(task.itemId);
          if (latest && pullTask.status === "completed") {
            try {
              const data = await fetchPlayUrls(latest.streamId);
              store.updateTaskPlayUrls(task.itemId, data.playUrls);
            } catch {
              // ignore
            }
          }
          if (latest) store.persistTaskResult(latest);
          store.removeFromQueue(task.itemId);
        }
      }
    } catch {
      // ignore transient poll errors
    }
  }

  async function tick() {
    if (tickInFlight) return;
    tickInFlight = true;
    try {
      await submitPending();
      await pollActiveTasks();
    } finally {
      tickInFlight = false;
    }
  }

  function startPolling() {
    if (pollTimer) return;
    void tick();
    pollTimer = setInterval(() => void tick(), POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  onMounted(startPolling);
  onUnmounted(stopPolling);

  return {
    runningCount,
    isSubmitting,
    tick,
    startPolling,
    stopPolling,
  };
}

export async function fetchPullTaskDetail(taskId: number): Promise<PullTask | null> {
  const resp = await getPullTask(taskId);
  return resp.data ?? null;
}
