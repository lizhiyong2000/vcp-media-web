<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Search } from "@element-plus/icons-vue";
import {
  fetchChannels,
  fetchChannelSources,
  fetchChannelPlayItems,
  type IptvChannel,
  type IptvPlayItem,
} from "@/api/iptv";
import { ElMessage } from "element-plus";

const channels = ref<IptvChannel[]>([]);
const total = ref(0);
const loading = ref(false);
const keyword = ref("");
const source = ref("");
const pageNum = ref(1);
const pageSize = ref(50);
const sourceOptions = ref<string[]>([]);

// 频道播放地址弹窗
const playItemsDialogVisible = ref(false);
const playItems = ref<IptvPlayItem[]>([]);
const playItemsLoading = ref(false);
const currentChannel = ref<IptvChannel | null>(null);

async function loadChannels() {
  loading.value = true;
  try {
    const res = await fetchChannels({
      keyword: keyword.value || undefined,
      source: source.value || undefined,
      page_num: pageNum.value,
      page_size: pageSize.value,
    });
    if (res.code === 0) {
      channels.value = res.data.items;
      total.value = res.data.total;
    } else {
      ElMessage.error(res.message);
    }
  } catch {
    ElMessage.error("获取频道列表失败");
  } finally {
    loading.value = false;
  }
}

async function loadSources() {
  try {
    const res = await fetchChannelSources();
    if (res.code === 0) {
      sourceOptions.value = res.data;
    }
  } catch {
    // ignore
  }
}

async function showPlayItems(channel: IptvChannel) {
  currentChannel.value = channel;
  playItemsDialogVisible.value = true;
  playItemsLoading.value = true;
  try {
    const res = await fetchChannelPlayItems(channel.id);
    if (res.code === 0) {
      playItems.value = res.data.items;
    } else {
      ElMessage.error(res.message);
    }
  } catch {
    ElMessage.error("获取播放地址失败");
  } finally {
    playItemsLoading.value = false;
  }
}

function handleSearch() {
  pageNum.value = 1;
  loadChannels();
}

function onPageChange(page: number) {
  pageNum.value = page;
  loadChannels();
}

function handleSizeChange(size: number) {
  pageSize.value = size;
  pageNum.value = 1;
  loadChannels();
}

function copyUrl(url: string) {
  navigator.clipboard.writeText(url).then(() => {
    ElMessage.success("已复制到剪贴板");
  });
}

onMounted(() => {
  loadChannels();
  loadSources();
});
</script>

<template>
  <div>
    <h1 class="page-title" style="margin-bottom: 16px">IPTV 频道</h1>

    <!-- 搜索栏 -->
    <div class="search-bar">
      <el-input
        v-model="keyword"
        placeholder="搜索频道名称"
        clearable
        style="width: 260px"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-select
        v-model="source"
        placeholder="按播源过滤"
        clearable
        style="width: 200px; margin-left: 12px"
        @change="handleSearch"
      >
        <el-option
          v-for="s in sourceOptions"
          :key="s"
          :label="s"
          :value="s"
        />
      </el-select>
      <el-button type="primary" style="margin-left: 12px" @click="handleSearch">
        搜索
      </el-button>
    </div>

    <!-- 频道表格 -->
    <el-table
      v-loading="loading"
      :data="channels"
      stripe
      style="width: 100%; margin-top: 16px"
    >
      <el-table-column prop="id" label="ID" width="70" align="center" />
      <el-table-column prop="name" label="频道名称" min-width="180">
        <template #default="{ row }">
          <span style="font-weight: 500">{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="source" label="来源" width="160" />
      <el-table-column prop="category" label="分类" width="100" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.category" size="small" type="info">{{ row.category }}</el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="updated_at" label="更新时间" width="170" align="center" />
      <el-table-column label="操作" width="120" align="center" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="showPlayItems(row)">
            播放地址
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

    <!-- 播放地址弹窗 -->
    <el-dialog
      v-model="playItemsDialogVisible"
      :title="currentChannel ? `${currentChannel.name} - 播放地址` : '播放地址'"
      width="900px"
      destroy-on-close
    >
      <el-table
        v-loading="playItemsLoading"
        :data="playItems"
        stripe
        size="small"
        max-height="500"
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
        <el-table-column prop="url" label="播放地址" min-width="300" show-overflow-tooltip />
        <el-table-column prop="source" label="播源" width="140" />
        <el-table-column prop="resolution" label="分辨率" width="110" align="center">
          <template #default="{ row }">
            {{ row.resolution || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="bitrate" label="码率" width="100" align="center">
          <template #default="{ row }">
            <span v-if="row.bitrate">{{ (row.bitrate / 1000).toFixed(0) }} kbps</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="center" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="copyUrl(row.url)">
              复制
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!playItemsLoading && playItems.length === 0" style="text-align: center; padding: 40px; color: #9ca3af">
        暂无播放地址
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.search-bar {
  display: flex;
  align-items: center;
}
</style>
