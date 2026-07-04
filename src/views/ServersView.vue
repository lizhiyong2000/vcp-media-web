<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { fetchRegions, fetchServers, type MediaServer, type Region } from "@/api/client";

const router = useRouter();
const loading = ref(false);
const servers = ref<MediaServer[]>([]);
const regions = ref<Region[]>([]);

async function load() {
  loading.value = true;
  try {
    const [serverData, regionData] = await Promise.all([fetchServers(), fetchRegions()]);
    servers.value = serverData.servers ?? [];
    regions.value = regionData.regions ?? [];
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载失败");
  } finally {
    loading.value = false;
  }
}

function regionName(regionId: string) {
  return regions.value.find((r) => r.id === regionId)?.name ?? regionId;
}

function statusTagType(status?: string) {
  if (status === "healthy") return "success";
  if (status === "unhealthy") return "danger";
  return "info";
}

onMounted(load);
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
      <h1 class="page-title" style="margin: 0">Media Server</h1>
      <el-button @click="load">刷新</el-button>
    </div>

    <el-table v-loading="loading" :data="servers" stripe>
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column prop="id" label="节点 ID" min-width="140" />
      <el-table-column label="区域" min-width="120">
        <template #default="{ row }">{{ regionName(row.regionId) }}</template>
      </el-table-column>
      <el-table-column prop="apiUrl" label="API 地址" min-width="220" show-overflow-tooltip />
      <el-table-column prop="publicHost" label="公网 Host" min-width="120" />
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">
            {{ row.status ?? "unknown" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="streamCount" label="在线流" width="90" align="center" />
      <el-table-column prop="deviceCount" label="绑定设备" width="100" align="center" />
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="router.push(`/servers/${row.id}`)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>
