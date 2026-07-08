import axios from "axios";

const iptvApi = axios.create({
  baseURL: "/iptv",
  timeout: 15000,
});

// ===================== 类型定义 =====================

export interface IptvChannel {
  id: number;
  name: string;
  source: string;
  category: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface IptvPlayItem {
  id: number;
  channel_name: string;
  url: string;
  source: string;
  category: string | null;
  is_valid: boolean;
  fail_count: number;
  last_checked: string | null;
  resolution: string | null;
  bitrate: number | null;
  created_at: string;
  updated_at: string;
}

export interface IptvPlaylistSource {
  id: number;
  name: string;
  url: string;
  category: string | null;
  enabled: boolean;
  last_count: number | null;
  last_status: string | null;
  last_fetch_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IptvSourceStats {
  name: string;
  total: number;
  valid: number;
}

export interface IptvStats {
  total_channels: number;
  total_play_items: number;
  valid_play_items: number;
  invalid_play_items: number;
  total_sources: number;
  active_sources: number;
  sources: IptvSourceStats[];
}

export interface IptvApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface IptvPageResponse<T> {
  total: number;
  page_num: number;
  page_size: number;
  items: T[];
}

export interface IptvVerificationResult {
  total: number;
  valid: number;
  invalid: number;
}

// ===================== 播放地址 API =====================

export async function fetchPlayItems(params: {
  channel?: string;
  source?: string;
  pull_status?: "unvalidated" | "running" | "completed" | "snapshot_ok" | "failed";
  keyword?: string;
  page_num?: number;
  page_size?: number;
}) {
  const { data } = await iptvApi.get<IptvApiResponse<IptvPageResponse<IptvPlayItem>>>(
    "/api/playitems",
    { params },
  );
  return data;
}

export async function exportM3u8() {
  const response = await iptvApi.get("/api/playitems/export", {
    responseType: "blob",
  });
  return response.data;
}

export async function fetchPlayItemSources() {
  const { data } = await iptvApi.get<IptvApiResponse<string[]>>("/api/playitems/sources");
  return data;
}

// ===================== 频道 API =====================

export async function fetchChannels(params: {
  keyword?: string;
  source?: string;
  page_num?: number;
  page_size?: number;
}) {
  const { data } = await iptvApi.get<IptvApiResponse<IptvPageResponse<IptvChannel>>>(
    "/api/channels",
    { params },
  );
  return data;
}

export async function fetchChannelSources() {
  const { data } = await iptvApi.get<IptvApiResponse<string[]>>("/api/channels/sources");
  return data;
}

export async function fetchChannelPlayItems(
  channelId: number,
  params?: { page_num?: number; page_size?: number },
) {
  const { data } = await iptvApi.get<IptvApiResponse<IptvPageResponse<IptvPlayItem>>>(
    `/api/channels/${channelId}/playitems`,
    { params },
  );
  return data;
}

// ===================== 播源管理 API =====================

export async function fetchSources() {
  const { data } = await iptvApi.get<IptvApiResponse<IptvPlaylistSource[]>>("/api/sources");
  return data;
}

export async function addSource(payload: {
  name: string;
  url: string;
  category?: string;
}) {
  const { data } = await iptvApi.post<IptvApiResponse<IptvPlaylistSource>>(
    "/api/sources",
    payload,
  );
  return data;
}

export async function deleteSource(id: number) {
  const { data } = await iptvApi.delete<IptvApiResponse<string>>(`/api/sources/${id}`);
  return data;
}

export async function toggleSource(id: number, enabled: boolean) {
  const { data } = await iptvApi.post<IptvApiResponse<string>>(
    `/api/sources/${id}/toggle`,
    { enabled },
  );
  return data;
}

export async function fetchSourceNow(id: number) {
  const { data } = await iptvApi.post<IptvApiResponse<string>>(`/api/sources/${id}/fetch`);
  return data;
}

// ===================== 统计 & 触发 API =====================

export async function fetchIptvStats() {
  const { data } = await iptvApi.get<IptvApiResponse<IptvStats>>("/api/stats");
  return data;
}

export async function triggerScrape() {
  const { data } = await iptvApi.post<IptvApiResponse<string>>("/api/scrape");
  return data;
}

export async function triggerVerify() {
  const { data } = await iptvApi.post<IptvApiResponse<string>>("/api/verify");
  return data;
}

// ===================== 拉流验证 API =====================

export interface PullValidateTask {
  url: string;
  stream_id: string;
  protocol?: string;
  channel_name?: string;
  play_item_id?: number;
}

export interface PullValidateResult {
  task_id: number;
  stream_id: string;
  url: string;
  protocol: string;
  status: string;
  message: string;
}

export interface PullValidateResponse {
  results: PullValidateResult[];
  tasks: PullTask[];
  total: number;
  queued: number;
  error: number;
}

export interface PullTask {
  id: number;
  channel_name?: string | null;
  play_item_id?: number | null;
  url: string;
  stream_id: string;
  protocol: string;
  status: string;
  error_message?: string | null;
  snapshot_id?: string | null;
  snapshot_status?: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface PullTaskListResponse {
  total: number;
  running: number;
  items: PullTask[];
}

const TERMINAL_PULL_TASK_STATUSES = new Set([
  "completed",
  "failed",
  "stopped",
  "error",
]);

export function isTerminalPullTask(status: string): boolean {
  return TERMINAL_PULL_TASK_STATUSES.has(status);
}

export function pullTaskStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "排队中",
    pulling: "拉流中",
    snapshotting: "截图中",
    completed: "已完成",
    failed: "失败",
    stopped: "已停止",
    error: "错误",
  };
  return map[status] || status;
}

export function pullTaskStatusTagType(status: string): string {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
    case "error":
    case "stopped":
      return "danger";
    case "pulling":
    case "snapshotting":
      return "warning";
    case "pending":
      return "info";
    default:
      return "";
  }
}

export async function pullValidateTasks(tasks: PullValidateTask[]) {
  const { data } = await iptvApi.post<IptvApiResponse<PullValidateResponse>>(
    "/api/pull/validate",
    { tasks },
  );
  return data;
}

export async function listPullTasks(status?: string, limit = 100) {
  const { data } = await iptvApi.get<IptvApiResponse<PullTaskListResponse>>(
    "/api/pull/tasks",
    { params: { status, limit } },
  );
  return data;
}

/** 构建截图缩略图 URL（经 iptv-manager 代理 media-server） */
export function snapshotImageUrl(snapshotId: string): string {
  return `/iptv/api/snapshot-image/${encodeURIComponent(snapshotId)}`;
}

export async function getPullTask(taskId: number) {
  const { data } = await iptvApi.get<IptvApiResponse<PullTask>>(
    `/api/pull/tasks/${taskId}`,
  );
  return data;
}

export async function stopPullTask(taskId: number) {
  const { data } = await iptvApi.post<IptvApiResponse<PullTask>>(
    `/api/pull/tasks/${taskId}/stop`,
  );
  return data;
}

export async function retryPullTask(taskId: number) {
  const { data } = await iptvApi.post<IptvApiResponse<PullTask>>(
    `/api/pull/tasks/${taskId}/retry`,
  );
  return data;
}

export async function waitPullTasks(
  taskIds: number[],
  timeoutMs = 180_000,
  pollMs = 1500,
): Promise<Map<number, PullTask>> {
  const deadline = Date.now() + timeoutMs;
  const pending = new Set(taskIds.filter((id) => id > 0));
  const result = new Map<number, PullTask>();

  while (pending.size > 0 && Date.now() < deadline) {
    for (const taskId of [...pending]) {
      try {
        const resp = await getPullTask(taskId);
        const task = resp.data;
        if (!task) continue;
        if (TERMINAL_PULL_TASK_STATUSES.has(task.status)) {
          result.set(taskId, task);
          pending.delete(taskId);
        }
      } catch {
        // ignore transient errors while polling
      }
    }
    if (pending.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
  return result;
}

export async function pullRtmp(payload: { url: string; stream_id: string }) {
  const { data } = await iptvApi.post("/api/pull/rtmp", payload);
  return data;
}

export async function pullRtsp(payload: { url: string; stream_id: string }) {
  const { data } = await iptvApi.post("/api/pull/rtsp", payload);
  return data;
}

export async function pullHls(payload: { url: string; stream_id: string }) {
  const { data } = await iptvApi.post("/api/pull/hls", payload);
  return data;
}

export async function pullFlv(payload: { url: string; stream_id: string }) {
  const { data } = await iptvApi.post("/api/pull/flv", payload);
  return data;
}

export default iptvApi;
