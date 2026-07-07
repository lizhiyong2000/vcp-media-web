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
  is_valid?: boolean;
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

export default iptvApi;
