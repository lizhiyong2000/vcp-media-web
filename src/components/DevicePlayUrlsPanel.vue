<script setup lang="ts">
import type { PlayUrls } from "@/api/client";

defineProps<{
  deviceId: string;
  playUrls?: PlayUrls | null;
  streamOnline?: boolean;
}>();

async function copy(text: string) {
  await navigator.clipboard.writeText(text);
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      播放地址 · {{ deviceId }}
      <el-tag v-if="streamOnline" type="success" size="small" style="margin-left: 8px">在线</el-tag>
      <el-tag v-else type="info" size="small" style="margin-left: 8px">离线</el-tag>
    </template>
    <el-descriptions v-if="playUrls" :column="1" border>
      <el-descriptions-item label="RTMP">
        <span class="mono">{{ playUrls.rtmp }}</span>
        <el-button link type="primary" @click="copy(playUrls.rtmp)">复制</el-button>
      </el-descriptions-item>
      <el-descriptions-item label="RTSP">
        <span class="mono">{{ playUrls.rtsp }}</span>
        <el-button link type="primary" @click="copy(playUrls.rtsp)">复制</el-button>
      </el-descriptions-item>
      <el-descriptions-item v-if="playUrls.httpFlv" label="HTTP-FLV">
        <span class="mono">{{ playUrls.httpFlv }}</span>
        <el-button link type="primary" @click="copy(playUrls.httpFlv!)">复制</el-button>
      </el-descriptions-item>
      <el-descriptions-item v-if="playUrls.hls" label="HLS">
        <span class="mono">{{ playUrls.hls }}</span>
        <el-button link type="primary" @click="copy(playUrls.hls!)">复制</el-button>
      </el-descriptions-item>
      <el-descriptions-item label="WebRTC 测试页">
        <a :href="playUrls.webrtcTestPage" target="_blank" rel="noreferrer">{{ playUrls.webrtcTestPage }}</a>
      </el-descriptions-item>
    </el-descriptions>
    <el-empty v-else description="暂无播放地址" />
  </el-card>
</template>
