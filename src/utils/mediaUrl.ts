/** HLS 为分段请求，可走 Vite/Nginx 同源反代。 */
export function toProxiedHlsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith("/hls/")) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    if (url.startsWith("/hls/")) return url;
  }
  return url;
}

/**
 * HTTP-FLV 为长连接 chunked 流，不能经 Vite dev proxy（会缓冲导致画面静止）。
 * 保持直连 media-server（需服务端 Access-Control-Allow-Origin: *）。
 */
export function toDirectFlvUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url;
}
