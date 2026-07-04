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

export async function pullRtmp(payload: { url: string; stream_id: string }) {
  const { data } = await api.post("/pull/rtmp", payload);
  return data;
}

export async function pullRtsp(payload: { url: string; stream_id: string }) {
  const { data } = await api.post("/pull/rtsp", payload);
  return data;
}

export async function fetchPlayUrls(id: string) {
  const { data } = await api.get<{ streamId: string; playUrls: PlayUrls }>(
    `/play-urls/${encodeURIComponent(id)}`,
  );
  return data;
}

export default api;
