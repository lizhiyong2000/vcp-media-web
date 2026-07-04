<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { ElMessage } from "element-plus";
import PlayUrlsPanel from "@/components/PlayUrlsPanel.vue";
import { fetchMetrics, fetchStream, type PlayUrls } from "@/api/client";

const props = defineProps<{ id: string }>();

const loading = ref(false);
const detail = ref<Record<string, unknown> | null>(null);
const playUrls = ref<PlayUrls | null>(null);
const metricsText = ref("");

async function load() {
  loading.value = true;
  try {
    const [streamData, metricsData] = await Promise.all([
      fetchStream(props.id),
      fetchMetrics().catch(() => ({})),
    ]);
    detail.value = streamData;
    playUrls.value = (streamData.playUrls as PlayUrls | undefined) ?? null;

    const perStream = (metricsData as { streams?: Record<string, unknown> }).streams?.[props.id];
    metricsText.value = JSON.stringify(perStream ?? metricsData, null, 2);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载失败");
  } finally {
    loading.value = false;
  }
}

watch(() => props.id, load, { immediate: true });
onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <h1 class="page-title">流详情 · {{ id }}</h1>

    <el-row :gutter="16">
      <el-col :span="12" :xs="24">
        <el-card shadow="never">
          <template #header>基本信息</template>
          <pre class="mono" style="margin: 0; max-height: 360px; overflow: auto">{{
            JSON.stringify(detail, null, 2)
          }}</pre>
        </el-card>
      </el-col>
      <el-col :span="12" :xs="24">
        <PlayUrlsPanel :stream-id="id" :play-urls="playUrls" />
      </el-col>
    </el-row>

    <el-card shadow="never" style="margin-top: 16px">
      <template #header>指标</template>
      <pre class="mono" style="margin: 0; max-height: 320px; overflow: auto">{{ metricsText }}</pre>
    </el-card>
  </div>
</template>
