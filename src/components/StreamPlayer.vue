<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Hls from "hls.js";
import flvjs from "flv.js";
import { toDirectFlvUrl, toProxiedHlsUrl } from "@/utils/mediaUrl";

export type PreviewProtocol = "hls" | "flv";

const props = defineProps<{
  hlsUrl?: string | null;
  flvUrl?: string | null;
  online?: boolean;
}>();

const videoRef = ref<HTMLVideoElement | null>(null);
const errorMessage = ref("");
const protocol = ref<PreviewProtocol>("hls");

let hls: Hls | null = null;
let flvPlayer: flvjs.Player | null = null;

const proxiedHlsUrl = computed(() => toProxiedHlsUrl(props.hlsUrl));
const directFlvUrl = computed(() => toDirectFlvUrl(props.flvUrl));

const canUseHls = computed(() => Boolean(proxiedHlsUrl.value));
const canUseFlv = computed(() => Boolean(directFlvUrl.value));
const hasPlayableUrl = computed(() => canUseHls.value || canUseFlv.value);

const activeUrl = computed(() =>
  protocol.value === "hls" ? proxiedHlsUrl.value : directFlvUrl.value,
);

const protocolHint = computed(() => {
  if (protocol.value === "hls") return "HLS（m3u8）· 首帧需等待切片生成（约 1–3 秒）";
  return "HTTP-FLV · 低延迟直连 media-server · 需 H.264（不支持 H.265 FLV）";
});

function pickDefaultProtocol(): PreviewProtocol {
  if (canUseHls.value) return "hls";
  if (canUseFlv.value) return "flv";
  return "hls";
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
  if (videoRef.value) {
    videoRef.value.removeAttribute("src");
    videoRef.value.load();
  }
}

function startHls(video: HTMLVideoElement, url: string) {
  // 始终用 hls.js：Chrome 等对跨域/直播 m3u8 原生支持不稳定
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
  if (!flvjs.isSupported()) {
    errorMessage.value = "当前浏览器不支持 HTTP-FLV 播放（MSE）";
    return;
  }
  flvPlayer = flvjs.createPlayer(
    {
      type: "flv",
      url,
      isLive: true,
      hasVideo: true,
      // 默认无音轨；hasAudio:true 但流无 AAC 会导致画面卡住
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
  flvPlayer.on(flvjs.Events.ERROR, (_type, _detail, info) => {
    errorMessage.value = `FLV 播放失败：${info ?? "unknown"}（浏览器仅支持 H.264 FLV）`;
  });
  flvPlayer.on(flvjs.Events.STATISTICS_INFO, () => {
    errorMessage.value = "";
  });
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

  const url = directFlvUrl.value;
  if (!url) {
    errorMessage.value = "暂无 HTTP-FLV 地址";
    return;
  }
  startFlv(video, url);
}

watch(protocol, () => {
  if (props.online && hasPlayableUrl.value) {
    void startPlayback();
  }
});

watch(
  () => [props.hlsUrl, props.flvUrl, props.online] as const,
  () => {
    if (!props.online) {
      destroyPlayer();
      return;
    }
    if (protocol.value === "hls" && !canUseHls.value && canUseFlv.value) {
      protocol.value = "flv";
    } else if (protocol.value === "flv" && !canUseFlv.value && canUseHls.value) {
      protocol.value = "hls";
    }
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
        </el-radio-group>
      </div>
    </template>

    <div v-if="!online" class="offline">
      <el-empty description="设备尚未推流，推流后此处自动显示画面" />
    </div>
    <div v-else-if="!hasPlayableUrl" class="offline">
      <el-empty description="暂无可用的 HLS / HTTP-FLV 播放地址" />
    </div>
    <div v-else class="player-wrap">
      <video ref="videoRef" class="player" controls muted playsinline autoplay />
      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <p v-else class="hint">{{ protocolHint }}</p>
      <p v-if="activeUrl" class="hint muted mono">{{ activeUrl }}</p>
      <p class="hint muted">
        RTMP / RTSP 无法在浏览器内直接播放；HLS 需等待首个切片生成后再刷新。
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
