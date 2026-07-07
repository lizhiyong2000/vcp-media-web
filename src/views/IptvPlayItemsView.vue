<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Search } from "@element-plus/icons-vue";
import {
  fetchPlayItems,
  fetchPlayItemSources,
  exportM3u8,
  type IptvPlayItem,
} from "@/api/iptv";
import { ElMessage } from "element-plus";

const playItems = ref<IptvPlayItem[]>([]);
const total = ref(0);
const loading = ref(false);
const channel = ref("");
const source = ref("");
const isValid = ref<string>("");
const keyword = ref("");
const pageNum = ref(1);
const pageSize = ref(50);
const sourceOptions = ref<string[]>([]);
const exporting = ref(false);

async function loadPlayItems() {
  loading.value = true;
  try {
    const res = await fetchPlayItems({
      channel: channel.value || undefined,
      source: source.value || undefined,
      is_valid: isValid.value === "true" ? true : isValid.value === "false" ? false : undefined,
      keyword: keyword.value || undefined,
      page_num: pageNum.value,
      page_size: pageSize.value,
    });
    if (res.code === 0) {
      playItems.value = res.data.items;
      total.value = res.data.total;
    } else {
      ElMessage.error(res.message);
    }
  } catch {
    ElMessage.error("获取播放地址失败");
  } finally {
    loading.value = false;
  }
}

async function loadSources() {
  try {
    const res = await fetchPlayItemSources();
    if (res.code === 0) {
      sourceOptions.value = res.data;
    }
  } catch {
    // ignore
  }
}

function handleSearch() {
  pageNum.value = 1;
  loadPlayItems();
}

function onPageChange(page: number) {
  pageNum.value = page;
  loadPlayItems();
}

function handleSizeChange(size: number) {
  pageSize.value = size;
  pageNum.value = 1;
  loadPlayItems();
}

async function handleExport() {
  exporting.value = true;
  try {
    const blob = await exportM3u8();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "iptv-playlist.m3u8";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    ElMessage.success("导出成功");
  } catch {
    ElMessage.error("导出失败");
  } finally {
    exporting.value = false;
  }
}

function copyUrl(url: string) {
  navigator.clipboard.writeText(url).then(() => {
    ElMessage.success("已复制到剪贴板");
  });
}

function formatBitrate(b: number | null) {
  if (!b) return "-";
  if (b >= 1000000) return (b / 1000000).toFixed(1) + " Mbps";
  return (b / 1000).toFixed(0) + " kbps";
}

onMounted(() => {
  loadPlayItems();
  loadSources();
});
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title" style="margin-bottom: 0">IPTV 播放地址</h1>
      <el-button :loading="exporting" @click="handleExport">
        导出 M3U8
      </el-button>
    </div>

    <!-- 搜索栏 -->
    <div class="search-bar">
      <el-input
        v-model="keyword"
        placeholder="搜索频道名/URL"
        clearable
        style="width: 240px"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-input
        v-model="channel"
        placeholder="频道名"
        clearable
        style="width: 180px; margin-left: 12px"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      />
      <el-select
        v-model="source"
        placeholder="播源过滤"
        clearable
        style="width: 180px; margin-left: 12px"
        @change="handleSearch"
      >
        <el-option
          v-for="s in sourceOptions"
          :key="s"
          :label="s"
          :value="s"
        />
      </el-select>
      <el-select
        v-model="isValid"
        placeholder="验证状态"
        clearable
        style="width: 140px; margin-left: 12px"
        @change="handleSearch"
      >
        <el-option label="有效" value="true" />
        <el-option label="无效" value="false" />
      </el-select>
      <el-button type="primary" style="margin-left: 12px" @click="handleSearch">
        搜索
      </el-button>
    </div>

    <!-- 播放地址表格 -->
    <el-table
      v-loading="loading"
      :data="playItems"
      stripe
      style="width: 100%; margin-top: 16px"
    >
      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <template v-if="row.last_checked === null">
            <el-tag type="warning" size="small">未验证</el-tag>
          </template>
          <template v-else>
            <el-tag :type="row.is_valid ? 'success' : 'danger'" size="small">
              {{ row.is_valid ? '有效' : '无效' }}
            </el-tag>
          </template>
        </template>
      </el-table-column>
      <el-table-column prop="channel_name" label="频道" min-width="140">
        <template #default="{ row }">
          <span style="font-weight: 500">{{ row.channel_name }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="url" label="播放地址" min-width="260" show-overflow-tooltip />
      <el-table-column prop="source" label="播源" width="130" />
      <el-table-column prop="category" label="分类" width="90" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.category" size="small" type="info">{{ row.category }}</el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="resolution" label="分辨率" width="110" align="center">
        <template #default="{ row }">
          {{ row.resolution || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="bitrate" label="码率" width="110" align="center">
        <template #default="{ row }">
          {{ formatBitrate(row.bitrate) }}
        </template>
      </el-table-column>
      <el-table-column prop="fail_count" label="失败次数" width="90" align="center" />
      <el-table-column label="操作" width="80" align="center" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="copyUrl(row.url)">
            复制
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div style="display: flex; justify-content: flex-end; margin-top: 16px">
      <el-pagination
        v-model:current-page="pageNum"
        v-model:page-size="pageSize"
        :page-sizes="[20, 50, 100, 200]"
        :total="total"
        layout="total, sizes, prev, pager, next"
        @current-change="onPageChange"
        @size-change="handleSizeChange"
      />
    </div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.search-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
