<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import { toDirectFlvUrl, toDirectWebrtcWsUrl, toProxiedHlsUrl } from "@/utils/mediaUrl";
import { WebrtcPlayer } from "@/utils/webrtcPlayer";

export type PreviewProtocol = "hls" | "flv" | "webrtc";

const props = defineProps<{
  hlsUrl?: string | null;
  flvUrl?: string | null;
  webrtcWsUrl?: string | null;
  streamId?: string | null;
  online?: boolean;
}>();

const videoRef = ref<HTMLVideoElement | null>(null);
const errorMessage = ref("");
const protocol = ref<PreviewProtocol>("hls");

let hls: Hls | null = null;
let flvPlayer: mpegts.Player | null = null;
let webrtcPlayer: WebrtcPlayer | null = null;

const proxiedHlsUrl = computed(() => toProxiedHlsUrl(props.hlsUrl));
const directFlvUrl = computed(() => toDirectFlvUrl(props.flvUrl));
const directWebrtcWsUrl = computed(() => toDirectWebrtcWsUrl(props.webrtcWsUrl));

const canUseHls = computed(() => Boolean(proxiedHlsUrl.value));
const canUseFlv = computed(() => Boolean(directFlvUrl.value));
const canUseWebrtc = computed(() => Boolean(directWebrtcWsUrl.value && props.streamId));
const hasPlayableUrl = computed(
  () => canUseHls.value || canUseFlv.value || canUseWebrtc.value,
);

const activeUrl = computed(() => {
  if (protocol.value === "hls") return proxiedHlsUrl.value;
  if (protocol.value === "flv") return directFlvUrl.value;
  return directWebrtcWsUrl.value;
});

const protocolHint = computed(() => {
  if (protocol.value === "hls") return "HLS（m3u8）· 首帧需等待切片生成（约 1–3 秒）";
  if (protocol.value === "flv") {
    return "HTTP-FLV · 低延迟直连 media-server · 支持 H.264 和 H.265";
  }
  return `WebRTC · 超低延迟 · 信令 ${directWebrtcWsUrl.value ?? ""} · stream_id=${props.streamId ?? ""}`;
});

function pickDefaultProtocol(): PreviewProtocol {
  if (canUseHls.value) return "hls";
  if (canUseFlv.value) return "flv";
  if (canUseWebrtc.value) return "webrtc";
  return "hls";
}

function ensureSupportedProtocol() {
  if (protocol.value === "hls" && !canUseHls.value) {
    if (canUseFlv.value) protocol.value = "flv";
    else if (canUseWebrtc.value) protocol.value = "webrtc";
  } else if (protocol.value === "flv" && !canUseFlv.value) {
    if (canUseHls.value) protocol.value = "hls";
    else if (canUseWebrtc.value) protocol.value = "webrtc";
  } else if (protocol.value === "webrtc" && !canUseWebrtc.value) {
    if (canUseHls.value) protocol.value = "hls";
    else if (canUseFlv.value) protocol.value = "flv";
  }
}

function destroyPlayer() {
  if (hls) {
    hls.destroy();
    hls = null;
  }
  if (flvPlayer) {
    flvPlayer.pause();
    flvPlayer.unload();
    flvPlayer.detachMediaElement();
    flvPlayer.destroy();
    flvPlayer = null;
  }
  if (webrtcPlayer) {
    webrtcPlayer.stop();
    webrtcPlayer = null;
  }
  if (videoRef.value) {
    videoRef.value.removeAttribute("src");
    videoRef.value.srcObject = null;
    videoRef.value.load();
  }
}

function startHls(video: HTMLVideoElement, url: string) {
  if (!Hls.isSupported()) {
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      void video.play().catch((err) => {
        errorMessage.value = `HLS 播放失败：${err.message}`;
      });
      return;
    }
    errorMessage.value = "当前浏览器不支持 HLS 播放";
    return;
  }

  hls = new Hls({
    enableWorker: false,
    lowLatencyMode: false,
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 6,
    manifestLoadingTimeOut: 10000,
    manifestLoadingMaxRetry: 6,
    levelLoadingMaxRetry: 6,
    fragLoadingMaxRetry: 6,
  });
  hls.loadSource(url);
  hls.attachMedia(video);
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data.fatal) return;
    switch (data.type) {
      case Hls.ErrorTypes.NETWORK_ERROR:
        errorMessage.value = `HLS 网络错误：${data.details}（等待切片或检查流是否在线）`;
        hls?.startLoad();
        break;
      case Hls.ErrorTypes.MEDIA_ERROR:
        errorMessage.value = `HLS 媒体错误：${data.details}`;
        hls?.recoverMediaError();
        break;
      default:
        errorMessage.value = `HLS 播放失败：${data.type} / ${data.details}`;
        break;
    }
  });
  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    errorMessage.value = "";
    void video.play().catch((err) => {
      errorMessage.value = `自动播放被阻止：${err.message}`;
    });
  });
}

function startFlv(video: HTMLVideoElement, url: string) {
  flvPlayer = mpegts.createPlayer(
    {
      type: "flv",
      url,
      isLive: true,
      hasVideo: true,
      hasAudio: false,
    },
    {
      enableWorker: false,
      enableStashBuffer: false,
      stashInitialSize: 128,
      lazyLoad: false,
      autoCleanupSourceBuffer: true,
      autoCleanupMaxBackwardDuration: 3,
      autoCleanupMinBackwardDuration: 2,
      fixAudioTimestampGap: true,
    },
  );
  flvPlayer.attachMediaElement(video);
  flvPlayer.load();
  flvPlayer.play();
  flvPlayer.on(mpegts.Events.ERROR, (_type, _detail, info) => {
    errorMessage.value = `FLV 播放失败：${info ?? "unknown"}`;
  });
  flvPlayer.on(mpegts.Events.STATISTICS_INFO, () => {
    errorMessage.value = "";
  });
}

function startWebrtc(video: HTMLVideoElement) {
  const wsUrl = directWebrtcWsUrl.value;
  const streamId = props.streamId;
  if (!wsUrl || !streamId) {
    errorMessage.value = "暂无 WebRTC 信令地址或 stream_id";
    return;
  }

  webrtcPlayer = new WebrtcPlayer({
    wsUrl,
    streamId,
    video,
    onError: (message) => {
      errorMessage.value = message;
    },
  });
  webrtcPlayer.start();
}

async function startPlayback() {
  destroyPlayer();
  errorMessage.value = "";

  await nextTick();

  const video = videoRef.value;
  if (!video || !props.online) return;

  if (protocol.value === "hls") {
    const url = proxiedHlsUrl.value;
    if (!url) {
      errorMessage.value = "暂无 HLS 地址";
      return;
    }
    startHls(video, url);
    return;
  }

  if (protocol.value === "flv") {
    const url = directFlvUrl.value;
    if (!url) {
      errorMessage.value = "暂无 HTTP-FLV 地址";
      return;
    }
    startFlv(video, url);
    return;
  }

  startWebrtc(video);
}

watch(protocol, () => {
  if (props.online && hasPlayableUrl.value) {
    void startPlayback();
  }
});

watch(
  () =>
    [props.hlsUrl, props.flvUrl, props.webrtcWsUrl, props.streamId, props.online] as const,
  () => {
    if (!props.online) {
      destroyPlayer();
      return;
    }
    ensureSupportedProtocol();
    if (hasPlayableUrl.value) {
      void startPlayback();
    } else {
      destroyPlayer();
    }
  },
);

onMounted(() => {
  protocol.value = pickDefaultProtocol();
  if (props.online && hasPlayableUrl.value) {
    void startPlayback();
  }
});

onBeforeUnmount(() => {
  destroyPlayer();
});
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="header-row">
        <span>实时预览</span>
        <el-radio-group v-if="online && hasPlayableUrl" v-model="protocol" size="small">
          <el-radio-button value="hls" :disabled="!canUseHls">HLS</el-radio-button>
          <el-radio-button value="flv" :disabled="!canUseFlv">HTTP-FLV</el-radio-button>
          <el-radio-button value="webrtc" :disabled="!canUseWebrtc">WebRTC</el-radio-button>
        </el-radio-group>
      </div>
    </template>

    <div v-if="!online" class="offline">
      <el-empty description="设备尚未推流，推流后此处自动显示画面" />
    </div>
    <div v-else-if="!hasPlayableUrl" class="offline">
      <el-empty description="暂无可用的 HLS / HTTP-FLV / WebRTC 播放地址" />
    </div>
    <div v-else class="player-wrap">
      <video ref="videoRef" class="player" controls muted playsinline autoplay />
      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <p v-else class="hint">{{ protocolHint }}</p>
      <p v-if="activeUrl" class="hint muted mono">{{ activeUrl }}</p>
      <p class="hint muted">
        RTMP / RTSP 无法在浏览器内直接播放；WebRTC 需 media-server 信令端口（默认 9080）可达。
      </p>
    </div>
  </el-card>
</template>

<style scoped>
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.player-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.player {
  width: 100%;
  max-height: 420px;
  background: #000;
  border-radius: 8px;
}

.hint {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
}

.hint.muted {
  color: #9ca3af;
}

.error {
  margin: 0;
  font-size: 13px;
  color: #dc2626;
}

.offline {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
