<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import {
  Delete,
  ArrowLeft,
  Select,
  InfoFilled,
  CopyDocument,
  Link,
  View,
} from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import {
  retryPullTask,
  stopPullTask,
  pullTaskStatusLabel,
  pullTaskStatusTagType,
  isTerminalPullTask,
  type IptvPlayItem,
  type PullTask,
} from "@/api/iptv";
import {
  usePullValidateStore,
  type ValidationTaskResult,
} from "@/stores/pullValidateStore";
import { detectProtocol } from "@/utils/pullValidate";
import {
  usePullValidateRunner,
  fetchPullTaskDetail,
} from "@/composables/usePullValidateRunner";

const router = useRouter();
const store = usePullValidateStore();
const { runningCount, isSubmitting } = usePullValidateRunner();

const selectedIds = ref<Set<number>>(new Set());
const isAllSelected = computed(() => {
  if (store.queue.length === 0) return false;
  return store.queue.every((q) => selectedIds.value.has(q.item.id));
});
const selectedCount = computed(() => selectedIds.value.size);

const hasActiveQueueWork = computed(() =>
  store.queue.some((q) => {
    const task = store.getActiveTask(q.item.id);
    return task && !isTerminalPullTask(task.backendStatus || "")
      && task.status !== "done"
      && task.status !== "error";
  }),
);

const showResultPanel = ref(false);
const showDetailDrawer = ref(false);
const detailItemId = ref<number | null>(null);
const detailPullTask = ref<PullTask | null>(null);
const detailLoading = ref(false);
const snapshottingTasks = ref<Set<number>>(new Set());

const stats = computed(() => {
  const results = store.listActiveTasks();
  return {
    success: results.filter((r) => r.status === "done" || r.status === "success").length,
    error: results.filter((r) => r.status === "error").length,
    withSnapshot: results.filter((r) => r.snapshot?.status === "completed").length,
  };
});

const detailTask = computed(() =>
  detailItemId.value != null ? store.getActiveTask(detailItemId.value) : undefined,
);

function toggleAll() {
  if (isAllSelected.value) {
    store.queue.forEach((q) => selectedIds.value.delete(q.item.id));
  } else {
    store.queue.forEach((q) => selectedIds.value.add(q.item.id));
  }
}

function toggleItem(id: number) {
  if (selectedIds.value.has(id)) selectedIds.value.delete(id);
  else selectedIds.value.add(id);
}

function getProtocolTagType(protocol: string): string {
  switch (protocol) {
    case "rtmp": return "success";
    case "rtsp": return "warning";
    case "hls": return "";
    case "flv": return "info";
    default: return "danger";
  }
}

function getQueueStatus(itemId: number) {
  const task = store.getActiveTask(itemId);
  if (!task) return { text: "待提交", type: "info" };
  if (task.backendStatus) {
    return {
      text: pullTaskStatusLabel(task.backendStatus),
      type: pullTaskStatusTagType(task.backendStatus),
    };
  }
  const map: Record<string, { text: string; type: string }> = {
    pending: { text: "待提交", type: "info" },
    submitting: { text: "提交中", type: "warning" },
    success: { text: "处理中", type: "warning" },
    error: { text: "失败", type: "danger" },
    done: { text: "已完成", type: "success" },
  };
  return map[task.status] || { text: task.status, type: "info" };
}

function statusText(status: ValidationTaskResult["status"]): string {
  const map: Record<string, string> = {
    pending: "待提交",
    submitting: "提交中",
    success: "处理中",
    error: "失败",
    "no-stream": "无流",
    done: "已完成",
  };
  return map[status] || status;
}

function statusType(status: ValidationTaskResult["status"]): string {
  const map: Record<string, string> = {
    pending: "info",
    submitting: "warning",
    success: "warning",
    error: "danger",
    "no-stream": "info",
    done: "success",
  };
  return map[status] || "info";
}

async function stopTaskIfRunning(itemId: number) {
  const task = store.getActiveTask(itemId);
  if (!task?.taskId || isTerminalPullTask(task.backendStatus || "")) return;
  try {
    await stopPullTask(task.taskId);
  } catch {
    // ignore stop errors while removing
  }
}

async function removeSelected() {
  if (selectedIds.value.size === 0) {
    ElMessage.warning("请先选择要移除的项目");
    return;
  }
  for (const id of selectedIds.value) {
    await stopTaskIfRunning(id);
  }
  store.removeBatch(selectedIds.value);
  selectedIds.value.clear();
}

async function removeFromQueue(item: IptvPlayItem) {
  await stopTaskIfRunning(item.id);
  store.removeFromQueue(item.id);
  selectedIds.value.delete(item.id);
}

function goToPlayItems() {
  router.push("/iptv/playitems");
}

function onQueueRowClick(row: { item: IptvPlayItem }) {
  openTaskDetail(row.item.id);
}

async function openTaskDetail(itemId: number) {
  detailItemId.value = itemId;
  showDetailDrawer.value = true;
  detailLoading.value = true;
  detailPullTask.value = null;
  const task = store.getActiveTask(itemId);
  if (task?.taskId) {
    detailPullTask.value = await fetchPullTaskDetail(task.taskId);
  }
  detailLoading.value = false;
}

async function refreshTaskDetail() {
  if (detailItemId.value == null) return;
  const task = store.getActiveTask(detailItemId.value);
  if (!task?.taskId) return;
  detailLoading.value = true;
  detailPullTask.value = await fetchPullTaskDetail(task.taskId);
  detailLoading.value = false;
}

async function stopRunningTask(task: ValidationTaskResult) {
  if (!task.taskId) {
    ElMessage.warning("任务尚未创建，无法停止");
    return;
  }
  try {
    await stopPullTask(task.taskId);
    store.updateTaskStatus(task.itemId, "error", "任务已停止");
    task.backendStatus = "stopped";
    store.persistTaskResult(task);
    store.removeFromQueue(task.itemId);
    ElMessage.success(`${task.channelName} 已停止`);
    await refreshTaskDetail();
  } catch (err: unknown) {
    const message =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      || (err as { message?: string })?.message
      || "停止任务失败";
    ElMessage.error(message);
  }
}

async function retryValidateTask(task: ValidationTaskResult) {
  if (snapshottingTasks.value.has(task.itemId)) return;
  if (!task.taskId) {
    ElMessage.warning("任务尚未创建，无法重试");
    return;
  }
  snapshottingTasks.value.add(task.itemId);
  try {
    const resp = await retryPullTask(task.taskId);
    const updated = resp.data;
    if (updated) {
      task.backendStatus = updated.status;
      task.errorMessage = updated.error_message ?? undefined;
    } else {
      task.backendStatus = "pending";
      task.errorMessage = undefined;
    }
    task.status = "success";
    task.message = "已重新加入队列";
    if (!store.queue.some((q) => q.item.id === task.itemId)) {
      const item = { id: task.itemId, channel_name: task.channelName, url: task.url } as IptvPlayItem;
      store.addToQueue([item]);
    }
    ElMessage.success(`${task.channelName} 已重新加入队列`);
    await refreshTaskDetail();
  } catch (err: unknown) {
    const message =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      || (err as { message?: string })?.message
      || "重试失败";
    ElMessage.error(message);
  } finally {
    snapshottingTasks.value.delete(task.itemId);
  }
}

function onImageError(snapshotId: string) {
  void snapshotId;
}

function openImageUrl(imageUrl?: string) {
  if (imageUrl) window.open(imageUrl, "_blank");
}

function copyPlayUrl(url: string) {
  navigator.clipboard.writeText(url).then(() => {
    ElMessage.success("已复制到剪贴板");
  });
}

function resetValidation() {
  store.clearResults();
  selectedIds.value.clear();
  showResultPanel.value = false;
}

function closeResultPanel() {
  showResultPanel.value = false;
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 19);
}
</script>

<template>
  <div>
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title" style="margin-bottom: 0">拉流验证</h1>
        <el-tag type="warning" size="default" style="margin-left: 12px">
          队列: {{ store.queueCount.value }} 条
        </el-tag>
        <el-tag type="primary" size="default" style="margin-left: 8px">
          运行中: {{ runningCount }} / 5
        </el-tag>
        <el-button
          v-if="store.hasResults && !showResultPanel"
          type="success"
          plain
          size="small"
          style="margin-left: 12px"
          :icon="InfoFilled"
          @click="showResultPanel = true"
        >
          查看验证记录
        </el-button>
      </div>
      <div class="page-header-right">
        <el-button @click="goToPlayItems">
          <el-icon><ArrowLeft /></el-icon>
          去播放地址页添加
        </el-button>
        <el-button
          type="danger"
          :icon="Delete"
          :disabled="selectedCount === 0"
          @click="removeSelected"
        >
          移除选中 ({{ selectedCount }})
        </el-button>
      </div>
    </div>

    <el-alert style="margin-bottom: 16px" type="info" :closable="false" show-icon>
      <template #title>
        在「播放地址」页添加后会自动进入队列并开始验证（任务中心最多 5 路并发，其余排队等待）。
        点击列表行可查看任务详情。
      </template>
    </el-alert>

    <el-empty
      v-if="store.queue.length === 0"
      description="队列为空，请先在播放地址页面选择地址添加"
    >
      <el-button type="primary" @click="goToPlayItems">
        <el-icon><Select /></el-icon>
        前往播放地址页
      </el-button>
    </el-empty>

    <el-card v-else shadow="never">
      <div v-if="hasActiveQueueWork || isSubmitting" class="progress-area" style="margin-bottom: 12px">
        <el-progress :percentage="100" :indeterminate="true" :stroke-width="6" />
        <p style="color: #909399; text-align: center; margin: 8px 0 0">
          任务中心处理中（运行 {{ runningCount }} / 5）...
        </p>
      </div>

      <el-table
        :data="store.queue"
        stripe
        style="width: 100%"
        row-key="item.id"
        @row-click="onQueueRowClick"
      >
        <el-table-column width="48" align="center">
          <template #header>
            <el-checkbox
              :model-value="isAllSelected"
              :indeterminate="selectedCount > 0 && !isAllSelected"
              @change="toggleAll"
              @click.stop
            />
          </template>
          <template #default="{ row }">
            <el-checkbox
              :model-value="selectedIds.has(row.item.id)"
              @change="() => toggleItem(row.item.id)"
              @click.stop
            />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag
              :type="getQueueStatus(row.item.id).type"
              size="small"
              effect="dark"
            >
              {{ getQueueStatus(row.item.id).text }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="协议" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="getProtocolTagType(detectProtocol(row.item.url))" size="small" effect="dark">
              {{ detectProtocol(row.item.url).toUpperCase() }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="频道" min-width="140">
          <template #default="{ row }">
            <span style="font-weight: 500">{{ row.item.channel_name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="播放地址" min-width="280" show-overflow-tooltip>
          <template #default="{ row }">
            <span style="font-family: monospace; font-size: 13px">{{ row.item.url }}</span>
          </template>
        </el-table-column>
        <el-table-column label="任务 ID" width="90" align="center">
          <template #default="{ row }">
            {{ store.getActiveTask(row.item.id)?.taskId || "-" }}
          </template>
        </el-table-column>
        <el-table-column label="播源" width="120">
          <template #default="{ row }">{{ row.item.source }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small" type="primary" link
              :icon="View"
              @click.stop="openTaskDetail(row.item.id)"
            >详情</el-button>
            <el-button
              size="small" type="danger" link
              @click.stop="removeFromQueue(row.item)"
            >移除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 任务详情 -->
    <el-drawer
      v-model="showDetailDrawer"
      :title="detailTask ? `任务详情 - ${detailTask.channelName}` : '任务详情'"
      size="560px"
      @open="refreshTaskDetail"
    >
      <div v-loading="detailLoading">
        <template v-if="detailTask">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="频道">{{ detailTask.channelName }}</el-descriptions-item>
            <el-descriptions-item label="协议">{{ detailTask.protocol.toUpperCase() }}</el-descriptions-item>
            <el-descriptions-item label="Stream ID">
              <code>{{ detailTask.streamId }}</code>
            </el-descriptions-item>
            <el-descriptions-item label="任务 ID">
              {{ detailPullTask?.id || detailTask.taskId || "-" }}
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag
                size="small"
                :type="detailPullTask
                  ? pullTaskStatusTagType(detailPullTask.status)
                  : statusType(detailTask.status)"
              >
                {{
                  detailPullTask
                    ? pullTaskStatusLabel(detailPullTask.status)
                    : statusText(detailTask.status)
                }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item v-if="detailPullTask?.error_message" label="错误">
              {{ detailPullTask.error_message }}
            </el-descriptions-item>
            <el-descriptions-item label="播放地址">
              <span style="word-break: break-all">{{ detailTask.url }}</span>
            </el-descriptions-item>
            <el-descriptions-item v-if="detailPullTask" label="重试次数">
              {{ detailPullTask.retry_count }}
            </el-descriptions-item>
            <el-descriptions-item v-if="detailPullTask" label="创建时间">
              {{ formatTime(detailPullTask.created_at) }}
            </el-descriptions-item>
            <el-descriptions-item v-if="detailPullTask?.started_at" label="开始时间">
              {{ formatTime(detailPullTask.started_at) }}
            </el-descriptions-item>
            <el-descriptions-item v-if="detailPullTask?.completed_at" label="完成时间">
              {{ formatTime(detailPullTask.completed_at) }}
            </el-descriptions-item>
            <el-descriptions-item v-if="detailPullTask?.snapshot_id" label="截图 ID">
              {{ detailPullTask.snapshot_id }}
            </el-descriptions-item>
          </el-descriptions>

          <div
            v-if="detailTask.snapshot?.status === 'completed' && detailTask.snapshot.imageUrl"
            class="snapshot-thumb"
            style="margin-top: 16px"
            @click="openImageUrl(detailTask.snapshot.imageUrl)"
          >
            <img
              :src="detailTask.snapshot.imageUrl"
              :alt="`${detailTask.channelName} 截图`"
              @error="() => onImageError(detailTask?.snapshot?.snapshotId || '')"
            />
          </div>

          <div v-if="detailTask.playUrls" class="result-card-urls" style="margin-top: 16px">
            <div class="urls-title">
              <el-icon><Link /></el-icon>
              <span>播放地址</span>
            </div>
            <div class="urls-list">
              <div v-if="detailTask.playUrls.rtmp" class="url-item">
                <el-tag size="small" type="success" effect="plain">RTMP</el-tag>
                <code class="url-text">{{ detailTask.playUrls.rtmp }}</code>
                <el-button size="small" type="primary" link @click="copyPlayUrl(detailTask.playUrls.rtmp)">
                  <el-icon><CopyDocument /></el-icon>
                </el-button>
              </div>
              <div v-if="detailTask.playUrls.httpFlv" class="url-item">
                <el-tag size="small" effect="plain">FLV</el-tag>
                <code class="url-text">{{ detailTask.playUrls.httpFlv }}</code>
                <el-button size="small" type="primary" link @click="copyPlayUrl(detailTask.playUrls.httpFlv)">
                  <el-icon><CopyDocument /></el-icon>
                </el-button>
              </div>
              <div v-if="detailTask.playUrls.hls" class="url-item">
                <el-tag size="small" type="warning" effect="plain">HLS</el-tag>
                <code class="url-text">{{ detailTask.playUrls.hls }}</code>
                <el-button size="small" type="primary" link @click="copyPlayUrl(detailTask.playUrls.hls)">
                  <el-icon><CopyDocument /></el-icon>
                </el-button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <template #footer>
        <div style="display: flex; gap: 8px; justify-content: flex-end">
          <el-button @click="refreshTaskDetail">刷新</el-button>
          <el-button
            v-if="detailTask?.taskId && detailPullTask && !isTerminalPullTask(detailPullTask.status)"
            type="danger"
            @click="detailTask && stopRunningTask(detailTask)"
          >
            停止
          </el-button>
          <el-button
            v-if="detailTask && (detailTask.status === 'error' || detailTask.status === 'done')"
            type="primary"
            :loading="snapshottingTasks.has(detailTask.itemId)"
            @click="detailTask && retryValidateTask(detailTask)"
          >
            重试
          </el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 验证记录 -->
    <el-drawer
      v-model="showResultPanel"
      title="拉流验证记录"
      size="640px"
      @close="closeResultPanel"
    >
      <div v-if="store.lastResults.length > 0" class="result-summary">
        <div class="result-count success">
          <span class="result-num">{{ stats.success }}</span>
          <span>成功</span>
        </div>
        <div class="result-count error">
          <span class="result-num">{{ stats.error }}</span>
          <span>失败</span>
        </div>
        <div class="result-count snapshot">
          <span class="result-num">{{ stats.withSnapshot }}</span>
          <span>已截图</span>
        </div>
      </div>

      <div v-if="store.lastResults.length > 0" class="results-list">
        <div
          v-for="task in store.lastResults"
          :key="task.itemId"
          class="result-card"
          :class="{
            'result-success': task.status === 'done' || task.status === 'success',
            'result-error': task.status === 'error',
          }"
          @click="openTaskDetail(task.itemId)"
        >
          <div class="result-card-header">
            <div class="result-card-title">
              <span class="channel-name">{{ task.channelName }}</span>
              <el-tag size="small" effect="plain">{{ task.protocol.toUpperCase() }}</el-tag>
            </div>
            <el-tag size="small" :type="statusType(task.status)" effect="dark">
              {{ task.backendStatus ? pullTaskStatusLabel(task.backendStatus) : statusText(task.status) }}
            </el-tag>
          </div>
          <div class="result-card-url" :title="task.url">{{ task.url }}</div>
          <div v-if="task.message" class="result-card-msg">{{ task.message }}</div>
          <div
            v-if="task.snapshot?.status === 'completed' && task.snapshot.imageUrl"
            class="snapshot-thumb"
            @click.stop="openImageUrl(task.snapshot.imageUrl)"
          >
            <img :src="task.snapshot.imageUrl" :alt="`${task.channelName} 截图`" />
          </div>
        </div>
      </div>
      <el-empty v-else description="暂无验证记录" />

      <template #footer>
        <el-button @click="resetValidation">清空记录</el-button>
        <el-button @click="closeResultPanel">关闭</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.page-header-left,
.page-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.progress-area {
  padding: 8px 0;
}
.result-summary {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}
.result-count {
  flex: 1;
  text-align: center;
  padding: 12px;
  border-radius: 8px;
  background: #f5f7fa;
}
.result-count.success { background: #f0f9eb; color: #67c23a; }
.result-count.error { background: #fef0f0; color: #f56c6c; }
.result-count.snapshot { background: #ecf5ff; color: #409eff; }
.result-num {
  display: block;
  font-size: 24px;
  font-weight: 700;
}
.results-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.result-card {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: box-shadow 0.2s;
}
.result-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.result-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.result-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.channel-name {
  font-weight: 600;
}
.result-card-url {
  font-family: monospace;
  font-size: 12px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.result-card-msg {
  margin-top: 6px;
  font-size: 13px;
  color: #606266;
}
.snapshot-thumb {
  margin-top: 10px;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  max-width: 240px;
}
.snapshot-thumb img {
  width: 100%;
  display: block;
}
.result-card-urls .urls-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  margin-bottom: 8px;
}
.url-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.url-text {
  flex: 1;
  font-size: 12px;
  word-break: break-all;
}
:deep(.el-table__row) {
  cursor: pointer;
}
</style>
