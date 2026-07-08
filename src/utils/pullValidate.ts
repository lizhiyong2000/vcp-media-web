export function detectProtocol(url: string): string {
  const lower = url.toLowerCase();
  if (lower.startsWith("rtmp://")) return "rtmp";
  if (lower.startsWith("rtsp://")) return "rtsp";
  if (lower.endsWith(".m3u8") || lower.includes(".m3u8?")) return "hls";
  if (lower.endsWith(".flv") || lower.includes(".flv?")) return "flv";
  if (lower.startsWith("http://") || lower.startsWith("https://")) return "flv";
  return "unknown";
}

export function sanitizeStreamId(channelName: string, id: number): string {
  const sanitized = channelName
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32);
  const base = sanitized || "iptv";
  return `${base}_${id}`;
}

export function buildValidationTask(
  item: { id: number; channel_name: string; url: string },
): import("@/stores/pullValidateStore").ValidationTaskResult {
  return {
    itemId: item.id,
    channelName: item.channel_name,
    url: item.url,
    streamId: sanitizeStreamId(item.channel_name, item.id),
    protocol: detectProtocol(item.url),
    status: "pending",
  };
}
