import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 15000,
});

export interface Region {
  id: string;
  name: string;
}

export interface MediaServer {
  id: string;
  regionId: string;
  name: string;
  apiUrl: string;
  publicHost: string;
  rtmpPort: number;
  rtspPort: number;
  webrtcPort?: number;
  httpPort?: number;
  status?: string;
  streamCount?: number;
  deviceCount?: number;
}

export interface MediaServerDetail extends MediaServer {
  regionName?: string;
  health?: {
    status?: string;
    detail?: Record<string, unknown>;
    error?: string;
  };
  streams?: StreamItem[];
  devices?: Device[];
  metrics?: Record<string, unknown>;
}

export interface StreamInfo {
  status?: string;
  statusDescription?: string;
  playbackStatus?: string;
  playbackDescription?: string;
  protocol?: string;
  tracks?: number;
}

export interface Device {
  id: string;
  name: string;
  regionId: string;
  serverId: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  streamOnline: boolean;
  stream?: StreamInfo | null;
}

export interface PlayUrls {
  rtmp: string;
  rtsp: string;
  httpFlv?: string | null;
  hls?: string | null;
  webrtcTestPage: string;
  webrtcSignalingUrl: string;
}

export interface StreamItem {
  id: string;
  status?: string;
  status_description?: string;
  playback_status?: string;
  playback_description?: string;
  source?: string;
  protocol?: string;
  pull_url?: string | null;
  tracks?: number;
  serverId?: string;
  regionId?: string;
}

export interface HealthResponse {
  status: string;
  adminServer?: boolean;
  regionCount?: number;
  serverCount?: number;
  servers?: Array<{
    serverId: string;
    regionId: string;
    name: string;
    apiUrl: string;
    status: string;
    error?: string;
  }>;
}

export async function fetchHealth() {
  const { data } = await api.get<HealthResponse>("/health");
  return data;
}

export async function fetchRegions() {
  const { data } = await api.get<{ regions: Region[]; count: number }>("/regions");
  return data;
}

export async function fetchServers() {
  const { data } = await api.get<{ servers: MediaServer[]; count: number }>("/servers");
  return data;
}

export async function fetchServer(id: string) {
  const { data } = await api.get<MediaServerDetail>(`/servers/${encodeURIComponent(id)}`);
  return data;
}

export async function fetchDevices() {
  const { data } = await api.get<{ devices: Device[]; count: number }>("/devices");
  return data;
}

export async function fetchDevice(id: string) {
  const { data } = await api.get<Device>(`/devices/${encodeURIComponent(id)}`);
  return data;
}

export async function createDevice(payload: {
  id: string;
  name: string;
  regionId: string;
  serverId?: string;
  description?: string;
}) {
  const { data } = await api.post<Device>("/devices", payload);
  return data;
}

export async function updateDevice(
  id: string,
  payload: {
    name: string;
    regionId: string;
    serverId?: string;
    description?: string;
  },
) {
  const { data } = await api.put<Device>(`/devices/${encodeURIComponent(id)}`, payload);
  return data;
}

export async function deleteDevice(id: string) {
  const { data } = await api.delete<{ deleted: string }>(`/devices/${encodeURIComponent(id)}`);
  return data;
}

export async function fetchDevicePlayUrls(id: string) {
  const { data } = await api.get<{
    deviceId: string;
    streamOnline: boolean;
    playUrls: PlayUrls;
  }>(`/devices/${encodeURIComponent(id)}/play-urls`);
  return data;
}

export async function fetchStreams() {
  const { data } = await api.get<{ streams: StreamItem[]; count: number }>("/streams");
  return data;
}

export async function fetchStream(id: string) {
  const { data } = await api.get<Record<string, unknown> & { playUrls?: PlayUrls }>(
    `/streams/${encodeURIComponent(id)}`,
  );
  return data;
}

export async function createStream(payload: {
  stream_id: string;
  protocol?: string;
  pull_url?: string;
}) {
  const { data } = await api.post("/streams", payload);
  return data;
}

export async function deleteStream(id: string) {
  const { data } = await api.delete(`/streams/${encodeURIComponent(id)}`);
  return data;
}

export async function fetchMetrics() {
  const { data } = await api.get<Record<string, unknown>>("/metrics");
  return data;
}

interface StreamRingMetrics {
  latest_seq?: number;
  latest_idr_seq?: number | null;
}

interface StreamMetricsEntry {
  stream_id?: string;
  ring?: StreamRingMetrics;
}

function collectStreamMetricsEntries(data: Record<string, unknown>): StreamMetricsEntry[] {
  const direct = data.streams;
  if (Array.isArray(direct)) {
    return direct as StreamMetricsEntry[];
  }

  const servers = data.servers;
  if (servers && typeof servers === "object") {
    const out: StreamMetricsEntry[] = [];
    for (const serverMetrics of Object.values(servers as Record<string, unknown>)) {
      if (!serverMetrics || typeof serverMetrics !== "object") continue;
      const streams = (serverMetrics as Record<string, unknown>).streams;
      if (Array.isArray(streams)) {
        out.push(...(streams as StreamMetricsEntry[]));
      }
    }
    return out;
  }

  return [];
}

/** Wait until a pull stream has published video frames (IDR preferred). */
export async function waitForStreamKeyframe(
  streamId: string,
  maxWaitMs = 120_000,
  pollMs = 1000,
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const metrics = await fetchMetrics();
      const entry = collectStreamMetricsEntries(metrics).find(
        (item) => item.stream_id === streamId,
      );
      const ring = entry?.ring;
      if (ring?.latest_idr_seq != null && ring.latest_idr_seq > 0) {
        return true;
      }
      if ((ring?.latest_seq ?? 0) > 0) {
        return true;
      }
    } catch {
      // ignore transient metrics errors during batch validation
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return false;
}

export async function fetchPlayUrls(id: string) {
  const { data } = await api.get<{ streamId: string; playUrls: PlayUrls }>(
    `/play-urls/${encodeURIComponent(id)}`,
  );
  return data;
}

// ===================== Snapshot API =====================

export interface SnapshotEntry {
  id: string;
  stream_id: string;
  created_at_ms: number;
  completed_at_ms: number | null;
  path: string;
  url: string;
  format: string;
  bytes: number;
  status: "pending" | "completed" | "error";
  error: string | null;
}

export interface SnapshotListResponse {
  snapshots: SnapshotEntry[];
}

/** Submit a snapshot capture request for a given stream */
export async function captureSnapshot(
  streamId: string,
): Promise<SnapshotEntry> {
  const { data } = await api.post<{ snapshot: SnapshotEntry; message: string }>("/snapshot", {
    stream_id: streamId,
  });
  return data.snapshot;
}

/** List all snapshot entries, optionally filtered by stream_id */
export async function fetchSnapshots(streamId?: string): Promise<SnapshotListResponse> {
  const params = streamId ? { stream_id: streamId } : undefined;
  const { data } = await api.get<SnapshotListResponse>("/snapshots", { params });
  return data;
}

/** Poll snapshot status until completed or failed */
export async function waitSnapshot(
  snapshotId: string,
  maxWaitMs: number = 130_000,
): Promise<SnapshotEntry> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const { data } = await api.get<{ snapshot: SnapshotEntry }>(
      `/snapshots/${encodeURIComponent(snapshotId)}`,
    );
    if (data.snapshot.status === "completed" || data.snapshot.status === "error" || data.snapshot.status === "failed") {
      return data.snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`snapshot ${snapshotId} timed out`);
}

export default api;
