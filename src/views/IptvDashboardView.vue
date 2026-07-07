<script setup lang="ts">
import { ref, onMounted } from "vue";
import {
  fetchIptvStats,
  triggerScrape,
  triggerVerify,
  type IptvStats,
} from "@/api/iptv";
import { ElMessage } from "element-plus";

const stats = ref<IptvStats | null>(null);
const loading = ref(false);
const scrapePending = ref(false);
const verifyPending = ref(false);

async function loadStats() {
  loading.value = true;
  try {
    const res = await fetchIptvStats();
    if (res.code === 0) {
      stats.value = res.data;
    } else {
      ElMessage.error(res.message);
    }
  } catch {
    ElMessage.error("获取统计信息失败");
  } finally {
    loading.value = false;
  }
}

async function handleScrape() {
  scrapePending.value = true;
  try {
    const res = await triggerScrape();
    if (res.code === 0) {
      ElMessage.success("播源拉取任务已触发，正在后台执行");
    } else {
      ElMessage.error(res.message);
    }
  } catch {
    ElMessage.error("触发拉取任务失败");
  } finally {
    scrapePending.value = false;
  }
}

async function handleVerify() {
  verifyPending.value = true;
  try {
    const res = await triggerVerify();
    if (res.code === 0) {
      ElMessage.success("验证任务已触发，正在后台执行");
    } else {
      ElMessage.error(res.message);
    }
  } catch {
    ElMessage.error("触发验证任务失败");
  } finally {
    verifyPending.value = false;
  }
}

const statCards = [
  { key: "total_channels", label: "频道总数", icon: "📺" },
  { key: "total_play_items", label: "播放地址总数", icon: "🔗" },
  { key: "valid_play_items", label: "有效地址", icon: "✅", color: "#10b981" },
  { key: "invalid_play_items", label: "无效地址", icon: "❌", color: "#ef4444" },
  { key: "active_sources", label: "活跃播源", icon: "📡" },
];

onMounted(loadStats);
</script>

<template>
  <div v-loading="loading">
    <div class="page-header">
      <h1 class="page-title">IPTV 概览</h1>
      <div style="display: flex; gap: 8px">
        <el-button type="primary" :loading="scrapePending" @click="handleScrape">
          手动拉取所有播源
        </el-button>
        <el-button type="warning" :loading="verifyPending" @click="handleVerify">
          手动验证播放地址
        </el-button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div v-if="stats" class="card-grid">
      <div
        v-for="card in statCards"
        :key="card.key"
        class="stat-card"
      >
        <div class="stat-icon">{{ card.icon }}</div>
        <div class="stat-value" :style="{ color: card.color }">
          {{ (stats as unknown as Record<string, number>)[card.key] }}
        </div>
        <div class="stat-label">{{ card.label }}</div>
      </div>
    </div>

    <!-- 各播源统计 -->
    <div v-if="stats && stats.sources.length > 0" style="margin-top: 24px">
      <h3 style="margin-bottom: 12px; font-size: 16px; font-weight: 600">
        各播源统计
      </h3>
      <el-table :data="stats.sources" stripe size="small" style="width: 100%; max-width: 600px">
        <el-table-column prop="name" label="播源名称" min-width="140" />
        <el-table-column prop="total" label="总地址数" width="100" align="center" />
        <el-table-column prop="valid" label="有效数" width="100" align="center">
          <template #default="{ row }">
            <span style="color: #10b981; font-weight: 600">{{ row.valid }}</span>
          </template>
        </el-table-column>
        <el-table-column label="有效率" width="100" align="center">
          <template #default="{ row }">
            <el-progress
              v-if="row.total > 0"
              :percentage="Math.round((row.valid / row.total) * 100)"
              :stroke-width="8"
              :color="row.valid / row.total > 0.5 ? '#10b981' : '#ef4444'"
            />
            <span v-else>-</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 基本信息 -->
    <div v-if="stats" style="margin-top: 24px; color: #6b7280; font-size: 13px">
      <span>播源总数：{{ stats.total_sources }}（活跃 {{ stats.active_sources }}）</span>
    </div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.stat-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  text-align: center;
}

.stat-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 4px;
}

.stat-label {
  color: #6b7280;
  font-size: 13px;
}
</style>
