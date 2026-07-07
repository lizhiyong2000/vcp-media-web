<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { Search, VideoPlay, PictureFilled, Link, CopyDocument } from "@element-plus/icons-vue";
import {
  fetchPlayItems,
  fetchPlayItemSources,
  exportM3u8,
  type IptvPlayItem,
} from "@/api/iptv";
import { snapshotImageUrl } from "@/api/client";
import { usePullValidateStore, type ValidatedItemState } from "@/stores/pullValidateStore";
import { ElMessage } from "element-plus";

const router = useRouter();
const store = usePullValidateStore();

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

// 多选
const selectedIds = ref<Set<number>>(new Set());
const isAllSelected = computed(() => {
  if (playItems.value.length === 0) return false;
  return playItems.value.every((item) => selectedIds.value.has(item.id));
});
const selectedCount = computed(() => selectedIds.value.size);

function toggleAll() {
  if (isAllSelected.value) {
    playItems.value.forEach((item) => selectedIds.value.delete(item.id));
  } else {
    playItems.value.forEach((item) => {
      if (!store.queuedIds.value.has(item.id)) {
        selectedIds.value.add(item.id);
      }
    });
  }
}

function toggleItem(id: number) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id);
  } else {
    selectedIds.value.add(id);
  }
}

// 添加到拉流验证队列
function addToPullValidate() {
  if (selectedCount.value === 0) {
    ElMessage.warning("请先选择播放地址");
    return;
  }
  const selected = playItems.value.filter((item) =>
    selectedIds.value.has(item.id) && !store.queuedIds.value.has(item.id)
  );
  if (selected.length === 0) {
    ElMessage.info("选中的地址已在队列中");
    return;
  }
  store.addToQueue(selected);
  selectedIds.value.clear();
  ElMessage.success(`已添加 ${selected.length} 条到拉流验证队列`);
}

// 跳转到拉流验证页
function goToPullValidate() {
  router.push("/iptv/pull-validate");
}

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
  selectedIds.value.clear();
  loadPlayItems();
}

function onPageChange(page: number) {
  pageNum.value = page;
  selectedIds.value.clear();
  loadPlayItems();
}

function handleSizeChange(size: number) {
  pageSize.value = size;
  pageNum.value = 1;
  selectedIds.value.clear();
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

// 验证结果相关
function getValidatedState(itemId: number): ValidatedItemState | undefined {
  return store.validatedItems[itemId];
}

function validatedStatusTag(itemId: number) {
  const v = getValidatedState(itemId);
  if (!v) return { text: "", type: "" };
  if (v.status === "done") return { text: "拉流成功", type: "success" };
  if (v.status === "no-stream") return { text: "无流", type: "info" };
  if (v.status === "error") return { text: "拉流失败", type: "danger" };
  return { text: "", type: "" };
}

onMounted(() => {
  loadPlayItems();
  loadSources();
});
</script>

<template>
  <div>
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title" style="margin-bottom: 0">IPTV 播放地址</h1>
      </div>
      <div class="page-header-right">
        <el-button :loading="exporting" @click="handleExport">
          导出 M3U8
        </el-button>
        <el-button
          type="primary"
          :icon="VideoPlay"
          :disabled="selectedCount === 0"
          @click="addToPullValidate"
        >
          添加到拉流验证 ({{ selectedCount }})
        </el-button>
        <el-badge :value="store.queueCount.value" :hidden="store.queueCount.value === 0" :max="99">
          <el-button type="warning" plain @click="goToPullValidate">
            去验证
          </el-button>
        </el-badge>
      </div>
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
      <el-table-column width="50" align="center">
        <template #header>
          <el-checkbox
            :model-value="isAllSelected"
            :indeterminate="selectedCount > 0 && !isAllSelected"
            @change="toggleAll"
          />
        </template>
        <template #default="{ row }">
          <el-checkbox
            :model-value="selectedIds.has(row.id) || store.queuedIds.value.has(row.id)"
            :disabled="store.queuedIds.value.has(row.id)"
            @change="() => toggleItem(row.id)"
          />
        </template>
      </el-table-column>
      <el-table-column label="源状态" width="80" align="center">
        <template #default="{ row }">
          <template v-if="store.queuedIds.value.has(row.id)">
            <el-tag type="warning" size="small">待验证</el-tag>
          </template>
          <template v-else-if="row.last_checked === null">
            <el-tag type="warning" size="small">未验证</el-tag>
          </template>
          <template v-else>
            <el-tag :type="row.is_valid ? 'success' : 'danger'" size="small">
              {{ row.is_valid ? '有效' : '无效' }}
            </el-tag>
          </template>
        </template>
      </el-table-column>
      <el-table-column label="拉流验证" width="140" align="center">
        <template #default="{ row }">
          <template v-if="getValidatedState(row.id)">
            <div class="validate-cell">
              <el-tag :type="validatedStatusTag(row.id).type" size="small" effect="dark">
                {{ validatedStatusTag(row.id).text }}
              </el-tag>
              <div class="validate-actions">
                <el-popover
                  v-if="getValidatedState(row.id)?.snapshot?.status === 'completed'"
                  placement="left"
                  :width="280"
                  trigger="hover"
                >
                  <template #reference>
                    <el-icon class="validate-icon" color="#409eff"><PictureFilled /></el-icon>
                  </template>
                  <img
                    :src="getValidatedState(row.id)!.snapshot!.imageUrl"
                    style="width: 100%; border-radius: 4px"
                    @error="($event.target as HTMLImageElement).style.display='none'"
                  />
                </el-popover>
                <el-popover
                  v-if="getValidatedState(row.id)?.playUrls"
                  placement="left"
                  :width="320"
                  trigger="click"
                >
                  <template #reference>
                    <el-icon class="validate-icon" color="#67c23a"><Link /></el-icon>
                  </template>
                  <div class="play-urls-popover">
                    <div v-if="getValidatedState(row.id)!.playUrls!.rtmp" style="margin-bottom:6px">
                      <el-tag size="small" type="success">RTMP</el-tag>
                      <code style="font-size:11px;word-break:break-all;display:block;margin-top:2px">
                        {{ getValidatedState(row.id)!.playUrls!.rtmp }}
                      </code>
                      <el-button size="small" text @click="copyUrl(getValidatedState(row.id)!.playUrls!.rtmp!)">
                        <el-icon><CopyDocument /></el-icon>
                      </el-button>
                    </div>
                    <div v-if="getValidatedState(row.id)!.playUrls!.httpFlv" style="margin-bottom:6px">
                      <el-tag size="small" type="">FLV</el-tag>
                      <code style="font-size:11px;word-break:break-all;display:block;margin-top:2px">
                        {{ getValidatedState(row.id)!.playUrls!.httpFlv }}
                      </code>
                      <el-button size="small" text @click="copyUrl(getValidatedState(row.id)!.playUrls!.httpFlv!)">
                        <el-icon><CopyDocument /></el-icon>
                      </el-button>
                    </div>
                    <div v-if="getValidatedState(row.id)!.playUrls!.hls">
                      <el-tag size="small" type="warning">HLS</el-tag>
                      <code style="font-size:11px;word-break:break-all;display:block;margin-top:2px">
                        {{ getValidatedState(row.id)!.playUrls!.hls }}
                      </code>
                      <el-button size="small" text @click="copyUrl(getValidatedState(row.id)!.playUrls!.hls!)">
                        <el-icon><CopyDocument /></el-icon>
                      </el-button>
                    </div>
                  </div>
                </el-popover>
              </div>
            </div>
          </template>
          <template v-else>
            <span class="not-validated">-</span>
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

.page-header-left {
  display: flex;
  align-items: center;
}

.page-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

/* 验证结果列 */
.validate-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.validate-actions {
  display: flex;
  gap: 6px;
}
.validate-icon {
  cursor: pointer;
  font-size: 16px;
  transition: transform 0.2s;
}
.validate-icon:hover {
  transform: scale(1.2);
}
.not-validated {
  color: #c0c4cc;
}
.play-urls-popover code {
  font-family: monospace;
}
</style>
