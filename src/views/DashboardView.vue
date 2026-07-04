<script setup lang="ts">
import { ref, onMounted } from "vue";
import { fetchDevices, fetchHealth, fetchMetrics, fetchStreams } from "@/api/client";

const loading = ref(true);
const health = ref<{
  status: string;
  regionCount?: number;
  serverCount?: number;
  servers?: Array<{ name: string; status: string; apiUrl: string }>;
  error?: string;
} | null>(null);
const deviceCount = ref(0);
const onlineDeviceCount = ref(0);
const streamCount = ref(0);
const metricsPreview = ref<string>("");

async function load() {
  loading.value = true;
  try {
    const [healthData, deviceData, streamsData, metricsData] = await Promise.all([
      fetchHealth(),
      fetchDevices(),
      fetchStreams(),
      fetchMetrics(),
    ]);
    health.value = healthData;
    deviceCount.value = deviceData.count ?? deviceData.devices?.length ?? 0;
    onlineDeviceCount.value = deviceData.devices?.filter((d) => d.streamOnline).length ?? 0;
    streamCount.value = streamsData.count ?? streamsData.streams?.length ?? 0;
    metricsPreview.value = JSON.stringify(metricsData, null, 2);
  } catch (error) {
    health.value = {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <h1 class="page-title">概览</h1>

    <div class="card-grid">
      <el-card shadow="hover">
        <template #header>管理后端</template>
        <el-tag :type="health?.status === 'healthy' ? 'success' : 'warning'">
          {{ health?.status ?? "unknown" }}
        </el-tag>
      </el-card>

      <el-card shadow="hover">
        <template #header>注册设备</template>
        <div style="font-size: 32px; font-weight: 700">{{ deviceCount }}</div>
        <div style="font-size: 13px; color: #6b7280; margin-top: 4px">
          推流在线 {{ onlineDeviceCount }}
        </div>
      </el-card>

      <el-card shadow="hover">
        <template #header>媒体流总数</template>
        <div style="font-size: 32px; font-weight: 700">{{ streamCount }}</div>
      </el-card>

      <el-card shadow="hover">
        <template #header>区域 / 节点</template>
        <div>{{ health?.regionCount ?? 0 }} 区域 · {{ health?.serverCount ?? 0 }} 节点</div>
      </el-card>
    </div>

    <el-card shadow="never" style="margin-top: 16px">
      <template #header>媒体节点状态</template>
      <el-table :data="health?.servers ?? []" size="small" stripe>
        <el-table-column prop="name" label="节点" />
        <el-table-column prop="apiUrl" label="API" min-width="220" />
        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="row.status === 'healthy' ? 'success' : 'danger'" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" style="margin-top: 16px">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span>运行指标（摘要）</span>
          <el-button size="small" @click="load">刷新</el-button>
        </div>
      </template>
      <pre class="mono" style="margin: 0; max-height: 320px; overflow: auto">{{ metricsPreview }}</pre>
    </el-card>
  </div>
</template>
