<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import {
  VideoPlay,
  Delete,
  RefreshLeft,
  ArrowLeft,
  Select,
  PictureFilled,
  InfoFilled,
  CopyDocument,
  Link,
  Check,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  pullValidateTasks,
  type IptvPlayItem,
  type PullValidateResult,
} from "@/api/iptv";
import {
  fetchStreams,
  captureSnapshot,
  waitSnapshot,
  snapshotImageUrl,
  fetchPlayUrls,
  type StreamItem,
} from "@/api/client";
import {
  usePullValidateStore,
  type ValidationTaskResult,
  type PullQueueItem,
  type SnapshotResult,
} from "@/stores/pullValidateStore";

const router = useRouter();
const store = usePullValidateStore();

// ===================== 多选 =====================
const selectedIds = ref<Set<number>>(new Set());
const isAllSelected = computed(() => {
  if (store.queue.length === 0) return false;
  return store.queue.every((q) => selectedIds.value.has(q.item.id));
});
const selectedCount = computed(() => selectedIds.value.size);

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

// ===================== 协议检测 =====================
function detectProtocol(url: string): string {
  const lower = url.toLowerCase();
  if (lower.startsWith("rtmp://")) return "rtmp";
  if (lower.startsWith("rtsp://")) return "rtsp";
  if (lower.endsWith(".m3u8") || lower.includes(".m3u8?")) return "hls";
  if (lower.endsWith(".flv") || lower.includes(".flv?")) return "flv";
  if (lower.startsWith("http://") || lower.startsWith("https://")) return "flv";
  return "unknown";
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
function sanitizeStreamId(channelName: string, id: number): string {
  const sanitized = channelName
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return sanitized || `iptv_${id}`;
}

// ===================== 移除 & 导航 =====================
function removeSelected() {
  if (selectedIds.value.size === 0) {
    ElMessage.warning("请先选择要移除的项目");
    return;
  }
  store.removeBatch(selectedIds.value);
  selectedIds.value.clear();
}
function removeFromQueue(item: IptvPlayItem) {
  store.removeFromQueue(item.id);
  selectedIds.value.delete(item.id);
}
function goToPlayItems() {
  router.push("/iptv/playitems");
}

// ===================== 验证 & 结果 =====================
const isPulling = ref(false);
const isSingleValidating = ref<Set<number>>(new Set()); // 正在逐条验证的 itemId
const progressText = ref("");

// 结果展示控制
const showResultPanel = ref(false);
const snapshottingTasks = ref<Set<number>>(new Set()); // 正在截图的 itemId
const snapshotImageCache = ref<Map<string, string>>(new Map()); // snapshotId -> objectURL

// 成功/失败统计
const stats = computed(() => {
  const results = store.lastResults;
  return {
    success: results.filter((r) => r.status === "success" || r.status === "done" || r.status === "no-stream").length,
    error: results.filter((r) => r.status === "error").length,
    withSnapshot: results.filter((r) => r.snapshot?.status === "completed").length,
  };
});

// 状态展示文案
function statusText(status: ValidationTaskResult["status"]): string {
  const map: Record<string, string> = {
    pending: "等待中",
    submitting: "提交中",
    success: "拉流成功",
    error: "失败",
    "no-stream": "无流（无需截图）",
    done: "已完成",
  };
  return map[status] || status;
}
function statusType(status: ValidationTaskResult["status"]): string {
  const map: Record<string, string> = {
    pending: "warning",
    submitting: "warning",
    success: "success",
    error: "danger",
    "no-stream": "info",
    done: "",
  };
  return map[status] || "info";
}

// ===================== 核心里：执行一批拉流验证 =====================
async function executeValidate(tasks: ValidationTaskResult[], queueIdsToRemove: Set<number>) {
  if (tasks.length === 0) {
    ElMessage.warning("没有需要验证的项目");
    return;
  }

  const payload = tasks.map((t) => ({
    url: t.url,
    stream_id: t.streamId,
    protocol: t.protocol,
  }));

  try {
    const response = await pullValidateTasks(payload);
    const data = response.data;

    const resultMap = new Map<string, PullValidateResult>();
    for (const r of data.results) {
      resultMap.set(r.stream_id, r);
    }
    for (const task of store.lastResults) {
      if (!tasks.some((t) => t.itemId === task.itemId)) continue;
      const result = resultMap.get(task.streamId);
      if (result) {
        const ok = result.status === "success";
        store.updateTaskStatus(task.itemId, ok ? "success" : "error", result.message);
      } else {
        store.updateTaskStatus(task.itemId, "error", "未收到返回结果");
      }
    }

    ElMessage.success(`拉流验证完成：成功 ${data.success}，失败 ${data.error}`);

    // 对成功的任务，延迟检查流发布状态、取播放地址并截图
    const successTasks = store.lastResults.filter(
      (t) => tasks.some((s) => s.itemId === t.itemId) && t.status === "success",
    );
    if (successTasks.length > 0) {
      progressText.value = `验证完成，10s 后检查发布状态并截图...`;
      await new Promise((resolve) => setTimeout(resolve, 10000));
      await doSnapshotForSuccessTasks(successTasks);
    }
  } catch (err: any) {
    const errorMsg = err?.response?.data?.error || err?.message || "拉流请求失败";
    for (const task of store.lastResults) {
      if (tasks.some((t) => t.itemId === task.itemId)) {
        if (task.status === "submitting" || task.status === "pending") {
          store.updateTaskStatus(task.itemId, "error", errorMsg);
        }
      }
    }
    ElMessage.error(errorMsg);
  }

  // 持久化结果并从队列移除已验证的项
  store.persistCompletedResults();
  store.removeBatch(queueIdsToRemove);
  selectedIds.value.clear();
}

// ===================== 开始验证（全部） =====================
async function startPullValidate() {
  if (store.queue.length === 0) {
    ElMessage.warning("队列为空，请先在播放地址页面添加");
    return;
  }
  try {
    await ElMessageBox.confirm(
      `将为 ${store.queue.length} 条播放地址创建拉流任务，确认继续？`,
      "确认拉流验证",
      { confirmButtonText: "确认", cancelButtonText: "取消", type: "info" },
    );
  } catch {
    return;
  }

  isPulling.value = true;
  progressText.value = "正在提交拉流任务...";
  snapshottingTasks.value.clear();
  snapshotImageCache.value.clear();

  const queueIdsToRemove = new Set(store.queue.map((q) => q.item.id));

  const tasks: ValidationTaskResult[] = store.queue.map((q) => ({
    itemId: q.item.id,
    channelName: q.item.channel_name,
    url: q.item.url,
    streamId: sanitizeStreamId(q.item.channel_name, q.item.id),
    protocol: detectProtocol(q.item.url),
    status: "submitting" as const,
  }));
  store.saveResults(tasks);
  showResultPanel.value = true;

  await executeValidate(tasks, queueIdsToRemove);
  isPulling.value = false;
  progressText.value = "";
}

// ===================== 验证选中的项 =====================
async function validateSelected() {
  if (selectedCount.value === 0) {
    ElMessage.warning("请先选择要验证的项目");
    return;
  }

  isPulling.value = true;
  progressText.value = `正在提交选中的 ${selectedCount.value} 个拉流任务...`;

  const selectedItems = store.queue.filter((q) => selectedIds.value.has(q.item.id));
  const queueIdsToRemove = new Set(selectedItems.map((s) => s.item.id));

  // 追加到现有结果
  const newTasks: ValidationTaskResult[] = selectedItems.map((q) => ({
    itemId: q.item.id,
    channelName: q.item.channel_name,
    url: q.item.url,
    streamId: sanitizeStreamId(q.item.channel_name, q.item.id),
    protocol: detectProtocol(q.item.url),
    status: "submitting" as const,
  }));

  if (store.hasResults) {
    // 追加到已有结果中（去重）
    const existingIds = new Set(store.lastResults.map((r) => r.itemId));
    const merged = [
      ...store.lastResults,
      ...newTasks.filter((t) => !existingIds.has(t.itemId)),
    ];
    store.saveResults(merged);
  } else {
    store.saveResults(newTasks);
  }

  showResultPanel.value = true;

  await executeValidate(newTasks, queueIdsToRemove);
  isPulling.value = false;
  progressText.value = "";
}

// ===================== 单条验证 =====================
async function validateSingle(queueItem: PullQueueItem) {
  if (isSingleValidating.value.has(queueItem.item.id)) return;
  isSingleValidating.value.add(queueItem.item.id);

  const task: ValidationTaskResult = {
    itemId: queueItem.item.id,
    channelName: queueItem.item.channel_name,
    url: queueItem.item.url,
    streamId: sanitizeStreamId(queueItem.item.channel_name, queueItem.item.id),
    protocol: detectProtocol(queueItem.item.url),
    status: "submitting" as const,
  };

  const queueIdsToRemove = new Set([queueItem.item.id]);

  if (store.hasResults) {
    const existingIds = new Set(store.lastResults.map((r) => r.itemId));
    if (!existingIds.has(task.itemId)) {
      store.saveResults([...store.lastResults, task]);
    } else {
      // 更新已有状态
      store.saveResults(
        store.lastResults.map((r) => (r.itemId === task.itemId ? task : r)),
      );
    }
  } else {
    store.saveResults([task]);
  }

  showResultPanel.value = true;

  await executeValidate([task], queueIdsToRemove);
  isSingleValidating.value.delete(queueItem.item.id);
}

// ===================== 获取播放地址 =====================
async function fetchPlayUrlsForTask(task: ValidationTaskResult) {
  try {
    const data = await fetchPlayUrls(task.streamId);
    store.updateTaskPlayUrls(task.itemId, data.playUrls);
  } catch {
    // 忽略错误
  }
}

// ===================== 截图逻辑 =====================
async function doSnapshotForSuccessTasks(successTasks: ValidationTaskResult[]) {
  progressText.value = "正在检查流发布状态...";

  // 获取所有流的发布状态
  let streams: StreamItem[] = [];
  try {
    const res = await fetchStreams();
    streams = res.streams || [];
  } catch {
    for (const task of successTasks) {
      store.updateTaskStatus(task.itemId, "no-stream", "无法获取流列表");
    }
    return;
  }

  // 筛选正在发布的流
  const publishingStreams = new Map<string, StreamItem>();
  for (const s of streams) {
    if (s.status === "publishing") {
      publishingStreams.set(s.id, s);
    }
  }

  for (const task of successTasks) {
    const stream = publishingStreams.get(task.streamId);
    if (!stream) {
      store.updateTaskStatus(task.itemId, "no-stream", "流未在发布，跳过截图");
      continue;
    }

    // 获取播放地址
    progressText.value = `正在获取 ${task.channelName} 播放地址...`;
    await fetchPlayUrlsForTask(task);

    // 调用截图
    progressText.value = `正在对 ${task.channelName} 截图...`;
    snapshottingTasks.value.add(task.itemId);

    try {
      const snapshotEntry = await captureSnapshot(task.streamId);
      store.updateTaskSnapshot(task.itemId, {
        snapshotId: snapshotEntry.id,
        status: "capturing",
      });

      // 等待截图完成
      progressText.value = `等待 ${task.channelName} 截图完成...`;
      const completed = await waitSnapshot(snapshotEntry.id, 15000);
      if (completed.status === "completed") {
        const url = snapshotImageUrl(completed.id);
        store.updateTaskSnapshot(task.itemId, {
          snapshotId: completed.id,
          status: "completed",
          imageUrl: url,
        });
        store.updateTaskStatus(task.itemId, "done", "截图已完成");
      } else {
        store.updateTaskSnapshot(task.itemId, {
          snapshotId: completed.id,
          status: "error",
          error: completed.error || "截图失败",
        });
        store.updateTaskStatus(task.itemId, "done", "截图失败");
      }
    } catch (err: any) {
      store.updateTaskSnapshot(task.itemId, {
        snapshotId: "",
        status: "error",
        error: err?.message || "截图异常",
      });
      store.updateTaskStatus(task.itemId, "done", "截图失败: " + (err?.message || ""));
    } finally {
      snapshottingTasks.value.delete(task.itemId);
    }
  }

  progressText.value = "";
  ElMessage.success(`截图完成：成功 ${stats.value.withSnapshot} 张`);
}

// ===================== 图片加载 =====================
function onImageError(snapshotId: string) {
  snapshotImageCache.value.delete(snapshotId);
}
function openImageUrl(imageUrl?: string) {
  if (imageUrl) window.open(imageUrl, "_blank");
}

// ===================== 单任务重截图 =====================
async function retrySnapshot(task: ValidationTaskResult) {
  if (snapshottingTasks.value.has(task.itemId)) return;
  snapshottingTasks.value.add(task.itemId);
  try {
    // 如果没有播放地址，先获取
    if (!task.playUrls) {
      await fetchPlayUrlsForTask(task);
    }

    const snapshotEntry = await captureSnapshot(task.streamId);
    store.updateTaskSnapshot(task.itemId, {
      snapshotId: snapshotEntry.id,
      status: "capturing",
    });
    const completed = await waitSnapshot(snapshotEntry.id, 15000);
    if (completed.status === "completed") {
      const url = snapshotImageUrl(completed.id);
      store.updateTaskSnapshot(task.itemId, {
        snapshotId: completed.id,
        status: "completed",
        imageUrl: url,
      });
      store.updateTaskStatus(task.itemId, "done", "截图已完成");
      // 同步更新持久化记录
      store.updateValidatedItemSnapshot(task.itemId, {
        snapshotId: completed.id,
        status: "completed",
        imageUrl: url,
      });
      ElMessage.success(`${task.channelName} 截图成功`);
    } else {
      store.updateTaskSnapshot(task.itemId, {
        snapshotId: completed.id,
        status: "error",
        error: completed.error || "截图失败",
      });
      ElMessage.error(`${task.channelName} 截图失败`);
    }
  } catch (err: any) {
    store.updateTaskSnapshot(task.itemId, {
      snapshotId: "",
      status: "error",
      error: err?.message || "截图异常",
    });
    ElMessage.error(`${task.channelName} 截图失败: ${err?.message || ""}`);
  } finally {
    snapshottingTasks.value.delete(task.itemId);
  }
}

// ===================== 复制播放地址 =====================
function copyPlayUrl(url: string) {
  navigator.clipboard.writeText(url).then(() => {
    ElMessage.success("已复制到剪贴板");
  });
}

// ===================== 面板控制 =====================
function resetValidation() {
  if (isPulling.value) return;
  store.clearResults();
  selectedIds.value.clear();
  showResultPanel.value = false;
}
function closeResultPanel() {
  if (isPulling.value) return;
  showResultPanel.value = false;
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
        <el-button
          v-if="store.hasResults && !showResultPanel"
          type="success"
          plain
          size="small"
          style="margin-left: 12px"
          :icon="InfoFilled"
          @click="showResultPanel = true"
        >
          查看上次验证结果
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
          :disabled="selectedCount === 0 || isPulling"
          @click="removeSelected"
        >
          移除选中 ({{ selectedCount }})
        </el-button>
        <el-button
          type="success"
          :icon="Check"
          :disabled="selectedCount === 0 || isPulling"
          :loading="isPulling"
          @click="validateSelected"
        >
          验证选中 ({{ selectedCount }})
        </el-button>
        <el-button
          type="primary"
          :icon="VideoPlay"
          :disabled="store.queue.length === 0 || isPulling"
          :loading="isPulling"
          @click="startPullValidate"
        >
          验证全部 ({{ store.queueCount.value }})
        </el-button>
      </div>
    </div>

    <!-- 提示信息 -->
    <el-alert style="margin-bottom: 16px" type="info" :closable="false" show-icon>
      <template #title>
        在「播放地址」页选择地址添加到队列后，在此处批量拉流验证。支持 RTMP / RTSP / HLS (m3u8) / HTTP-FLV 协议。
        验证成功后将自动截图并展示缩略图。
      </template>
    </el-alert>

    <!-- 空状态 -->
    <el-empty
      v-if="store.queue.length === 0"
      description="队列为空，请先在播放地址页面选择地址添加"
    >
      <el-button type="primary" @click="goToPlayItems">
        <el-icon><Select /></el-icon>
        前往播放地址页
      </el-button>
    </el-empty>

    <!-- 验证队列表格 -->
    <el-card v-else shadow="never">
      <template #header>
        <div class="table-header-inner">
          <span>待验证队列 ({{ store.queueCount.value }})</span>
          <el-button
            v-if="store.hasResults && !isPulling"
            type="warning"
            :icon="RefreshLeft"
            size="small"
            plain
            @click="resetValidation"
          >
            清空结果重新验证
          </el-button>
        </div>
      </template>

      <el-table :data="store.queue" stripe style="width: 100%">
        <el-table-column width="50" align="center">
          <template #header>
            <el-checkbox
              :model-value="isAllSelected"
              :indeterminate="selectedCount > 0 && !isAllSelected"
              :disabled="isPulling"
              @change="toggleAll"
            />
          </template>
          <template #default="{ row }">
            <el-checkbox
              :model-value="selectedIds.has(row.item.id)"
              :disabled="isPulling"
              @change="() => toggleItem(row.item.id)"
            />
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
        <el-table-column label="播放地址" min-width="300" show-overflow-tooltip>
          <template #default="{ row }">
            <span style="font-family: monospace; font-size: 13px">{{ row.item.url }}</span>
          </template>
        </el-table-column>
        <el-table-column label="播源" width="130">
          <template #default="{ row }">{{ row.item.source }}</template>
        </el-table-column>
        <el-table-column label="分辨率" width="100" align="center">
          <template #default="{ row }">{{ row.item.resolution || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small" type="primary" link
              :loading="isSingleValidating.has(row.item.id)"
              :disabled="isPulling || isSingleValidating.has(row.item.id)"
              @click="validateSingle(row)"
            >验证</el-button>
            <el-button
              size="small" type="danger" link
              :disabled="isPulling || isSingleValidating.has(row.item.id)"
              @click="removeFromQueue(row.item)"
            >移除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- ============================== 验证结果面板 (抽屉) ============================== -->
    <el-drawer
      v-model="showResultPanel"
      :title="`拉流验证结果`"
      size="640px"
      :close-on-click-modal="false"
      @close="closeResultPanel"
    >
      <!-- 进度提示 -->
      <div v-if="isPulling || progressText" class="progress-area">
        <el-progress
          :percentage="100"
          :indeterminate="isPulling"
          :stroke-width="8"
          :color="'#409eff'"
          style="margin-bottom: 12px"
        />
        <p style="color: #909399; text-align: center">{{ progressText || '处理中...' }}</p>
      </div>

      <!-- 汇总统计 -->
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

      <!-- 任务列表（详细结果） -->
      <div v-if="store.lastResults.length > 0" class="results-list">
        <div
          v-for="task in store.lastResults"
          :key="task.itemId"
          class="result-card"
          :class="{
            'result-success': task.status === 'done' || task.status === 'success',
            'result-error': task.status === 'error',
            'result-info': task.status === 'no-stream',
          }"
        >
          <!-- 头部：频道名 + 状态标签 -->
          <div class="result-card-header">
            <div class="result-card-title">
              <span class="channel-name">{{ task.channelName }}</span>
              <el-tag size="small" :type="getProtocolTagType(task.protocol)" effect="plain">
                {{ task.protocol.toUpperCase() }}
              </el-tag>
            </div>
            <div class="result-card-actions">
              <el-tag
                size="small"
                :type="statusType(task.status)"
                effect="dark"
              >
                {{ statusText(task.status) }}
              </el-tag>
              <!-- 重截图按钮：对所有成功/已完成/done的任务都可重新截图 -->
              <el-button
                v-if="task.status === 'success' || task.status === 'done' || task.status === 'no-stream'"
                size="small"
                type="primary"
                :icon="PictureFilled"
                :loading="snapshottingTasks.has(task.itemId)"
                @click="retrySnapshot(task)"
              >
                截图
              </el-button>
            </div>
          </div>

          <!-- URL -->
          <div class="result-card-url" :title="task.url">{{ task.url }}</div>

          <!-- 流 ID -->
          <div class="result-card-meta">
            <span>Stream ID: <code>{{ task.streamId }}</code></span>
          </div>

          <!-- 消息 -->
          <div v-if="task.message" class="result-card-msg" :class="task.status">
            {{ task.message }}
          </div>

          <!-- 播放地址 -->
          <div v-if="task.playUrls" class="result-card-urls">
            <div class="urls-title">
              <el-icon><Link /></el-icon>
              <span>播放地址</span>
            </div>
            <div class="urls-list">
              <div v-if="task.playUrls.rtmp" class="url-item">
                <el-tag size="small" type="success" effect="plain">RTMP</el-tag>
                <code class="url-text">{{ task.playUrls.rtmp }}</code>
                <el-button size="small" type="primary" link @click="copyPlayUrl(task.playUrls.rtmp)">
                  <el-icon><CopyDocument /></el-icon>
                </el-button>
              </div>
              <div v-if="task.playUrls.httpFlv" class="url-item">
                <el-tag size="small" type="" effect="plain">FLV</el-tag>
                <code class="url-text">{{ task.playUrls.httpFlv }}</code>
                <el-button size="small" type="primary" link @click="copyPlayUrl(task.playUrls.httpFlv)">
                  <el-icon><CopyDocument /></el-icon>
                </el-button>
              </div>
              <div v-if="task.playUrls.hls" class="url-item">
                <el-tag size="small" type="warning" effect="plain">HLS</el-tag>
                <code class="url-text">{{ task.playUrls.hls }}</code>
                <el-button size="small" type="primary" link @click="copyPlayUrl(task.playUrls.hls)">
                  <el-icon><CopyDocument /></el-icon>
                </el-button>
              </div>
            </div>
          </div>

          <!-- 截图缩略图 -->
          <div
            v-if="task.snapshot?.status === 'completed' && task.snapshot?.imageUrl"
            class="snapshot-thumb"
            @click="openImageUrl(task.snapshot?.imageUrl)"
          >
            <img
              :src="task.snapshot.imageUrl"
              :alt="`${task.channelName} 截图`"
              @error="() => onImageError(task.snapshot?.snapshotId || '')"
            />
            <div class="snapshot-overlay">
              <el-icon><PictureFilled /></el-icon>
              <span>点击查看原图</span>
            </div>
          </div>

          <!-- 截图加载中 -->
          <div v-else-if="snapshottingTasks.has(task.itemId)" class="snapshot-loading">
            <el-icon class="is-loading"><RefreshLeft /></el-icon>
            <span>正在截图中...</span>
          </div>

          <!-- 截图错误 -->
          <div
            v-else-if="task.snapshot?.status === 'error'"
            class="snapshot-error"
          >
            <span>截图失败: {{ task.snapshot.error }}</span>
          </div>
        </div>
      </div>

      <template #footer>
        <div style="display: flex; gap: 12px; justify-content: flex-end">
          <el-button :disabled="isPulling" @click="closeResultPanel">关闭</el-button>
        </div>
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
.table-header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 进度 */
.progress-area {
  padding: 16px 0 8px;
}

/* 统计卡片 */
.result-summary {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}
.result-count {
  flex: 1;
  text-align: center;
  padding: 12px 8px;
  border-radius: 8px;
  background: #f5f7fa;
}
.result-count .result-num {
  display: block;
  font-size: 26px;
  font-weight: 700;
  margin-bottom: 2px;
}
.result-count.success .result-num { color: #67c23a; }
.result-count.error .result-num { color: #f56c6c; }
.result-count.snapshot .result-num { color: #409eff; }

/* 结果卡片列表 */
.results-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.result-card {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 14px 16px;
  transition: border-color 0.2s;
}
.result-card.result-success { border-left: 4px solid #67c23a; }
.result-card.result-error { border-left: 4px solid #f56c6c; }
.result-card.result-info { border-left: 4px solid #909399; }

.result-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.result-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.channel-name {
  font-weight: 600;
  font-size: 15px;
}
.result-card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.result-card-url {
  font-size: 12px;
  color: #606266;
  font-family: monospace;
  word-break: break-all;
  margin-bottom: 4px;
  max-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.result-card-meta {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}
.result-card-meta code {
  background: #f0f2f5;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
}
.result-card-msg {
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 4px;
  margin-top: 6px;
  word-break: break-all;
}
.result-card-msg.success,
.result-card-msg.done { color: #67c23a; background: #f0f9eb; }
.result-card-msg.error { color: #f56c6c; background: #fef0f0; }
.result-card-msg.submitting { color: #e6a23c; background: #fdf6ec; }
.result-card-msg.no-stream { color: #909399; background: #f4f4f5; }

/* 播放地址 */
.result-card-urls {
  margin-top: 8px;
  padding: 8px 10px;
  background: #fafbfc;
  border-radius: 6px;
  border: 1px solid #ebeef5;
}
.urls-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 6px;
}
.urls-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.url-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}
.url-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: #fff;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  color: #303133;
}

/* 缩略图 */
.snapshot-thumb {
  position: relative;
  margin-top: 10px;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  max-width: 260px;
  border: 1px solid #e4e7ed;
}
.snapshot-thumb img {
  width: 100%;
  height: auto;
  min-height: 80px;
  display: block;
  object-fit: cover;
}
.snapshot-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: #fff;
  font-size: 13px;
  opacity: 0;
  transition: opacity 0.2s;
}
.snapshot-thumb:hover .snapshot-overlay { opacity: 1; }

.snapshot-loading {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #909399;
}
.snapshot-error {
  margin-top: 10px;
  font-size: 12px;
  color: #f56c6c;
  background: #fef0f0;
  padding: 6px 10px;
  border-radius: 4px;
}
</style>
