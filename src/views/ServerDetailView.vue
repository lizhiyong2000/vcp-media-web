<script setup lang="ts">
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { fetchServer, type MediaServerDetail, type StreamItem } from "@/api/client";

const props = defineProps<{ id: string }>();
const router = useRouter();

const loading = ref(false);
const detail = ref<MediaServerDetail | null>(null);
const metricsText = ref("");

async function load() {
  loading.value = true;
  try {
    const data = await fetchServer(props.id);
    detail.value = data;
    metricsText.value = JSON.stringify(data.metrics ?? {}, null, 2);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载失败");
  } finally {
    loading.value = false;
  }
}

function statusTagType(status?: string) {
  if (status === "healthy") return "success";
  if (status === "unhealthy") return "danger";
  return "info";
}

function streamStatus(row: StreamItem) {
  return row.status_description ?? row.status ?? "-";
}

watch(() => props.id, load, { immediate: true });
</script>

<template>
  <div v-loading="loading">
    <h1 class="page-title">Media Server 详情 · {{ detail?.name ?? id }}</h1>

    <el-row :gutter="16">
      <el-col :span="12" :xs="24">
        <el-card shadow="never">
          <template #header>节点信息</template>
          <el-descriptions v-if="detail" :column="1" border>
            <el-descriptions-item label="节点 ID">{{ detail.id }}</el-descriptions-item>
            <el-descriptions-item label="名称">{{ detail.name }}</el-descriptions-item>
            <el-descriptions-item label="区域">
              {{ detail.regionName ?? detail.regionId }}
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="statusTagType(detail.status)" size="small">
                {{ detail.status ?? "unknown" }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="API">{{ detail.apiUrl }}</el-descriptions-item>
            <el-descriptions-item label="公网 Host">{{ detail.publicHost }}</el-descriptions-item>
            <el-descriptions-item label="RTMP 端口">{{ detail.rtmpPort }}</el-descriptions-item>
            <el-descriptions-item label="RTSP 端口">{{ detail.rtspPort }}</el-descriptions-item>
            <el-descriptions-item label="HTTP 端口">{{ detail.httpPort ?? "-" }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :span="12" :xs="24">
        <el-card shadow="never">
          <template #header>健康检查</template>
          <pre class="mono" style="margin: 0; max-height: 360px; overflow: auto">{{
            JSON.stringify(detail?.health ?? {}, null, 2)
          }}</pre>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" style="margin-top: 16px">
      <template #header>
        在线流（{{ detail?.streamCount ?? 0 }}）
      </template>
      <el-table :data="detail?.streams ?? []" size="small" stripe>
        <el-table-column prop="id" label="Stream ID" min-width="160" />
        <el-table-column label="状态" min-width="120">
          <template #default="{ row }">{{ streamStatus(row) }}</template>
        </el-table-column>
        <el-table-column prop="protocol" label="协议" width="100" />
        <el-table-column prop="tracks" label="轨道" width="80" align="center" />
      </el-table>
    </el-card>

    <el-card shadow="never" style="margin-top: 16px">
      <template #header>
        绑定设备（{{ detail?.deviceCount ?? 0 }}）
      </template>
      <el-table :data="detail?.devices ?? []" size="small" stripe>
        <el-table-column prop="id" label="设备 ID" min-width="140" />
        <el-table-column prop="name" label="名称" min-width="120" />
        <el-table-column prop="description" label="备注" min-width="160" show-overflow-tooltip />
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push(`/devices/${row.id}`)">
              详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" style="margin-top: 16px">
      <template #header>运行指标</template>
      <pre class="mono" style="margin: 0; max-height: 320px; overflow: auto">{{ metricsText }}</pre>
    </el-card>
  </div>
</template>
