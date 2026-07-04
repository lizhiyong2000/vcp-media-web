<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { createStream, deleteStream, fetchStreams, type StreamItem } from "@/api/client";

const router = useRouter();
const loading = ref(false);
const streams = ref<StreamItem[]>([]);
const createDialogVisible = ref(false);
const createForm = ref({
  stream_id: "",
  protocol: "RTMP",
  pull_url: "",
});

async function load() {
  loading.value = true;
  try {
    const data = await fetchStreams();
    streams.value = data.streams ?? [];
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载失败");
  } finally {
    loading.value = false;
  }
}

async function submitCreate() {
  if (!createForm.value.stream_id.trim()) {
    ElMessage.warning("请输入 stream_id");
    return;
  }
  try {
    await createStream({
      stream_id: createForm.value.stream_id.trim(),
      protocol: createForm.value.protocol,
      pull_url: createForm.value.pull_url.trim() || undefined,
    });
    ElMessage.success("创建成功");
    createDialogVisible.value = false;
    createForm.value = { stream_id: "", protocol: "RTMP", pull_url: "" };
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "创建失败");
  }
}

async function removeStream(row: StreamItem) {
  await ElMessageBox.confirm(`确认删除流 ${row.id}？`, "删除确认", { type: "warning" });
  try {
    await deleteStream(row.id);
    ElMessage.success("已删除");
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "删除失败");
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
      <h1 class="page-title" style="margin: 0">流管理</h1>
      <div>
        <el-button @click="load">刷新</el-button>
        <el-button type="primary" @click="createDialogVisible = true">创建流</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="streams" stripe>
      <el-table-column prop="id" label="Stream ID" min-width="180" />
      <el-table-column prop="status_description" label="状态" min-width="120" />
      <el-table-column prop="playback_description" label="播放状态" min-width="120" />
      <el-table-column prop="protocol" label="协议" min-width="100" />
      <el-table-column prop="tracks" label="轨道数" width="90" />
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="router.push(`/streams/${row.id}`)">详情</el-button>
          <el-button link type="danger" @click="removeStream(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="createDialogVisible" title="创建流" width="480px">
      <el-form label-width="100px">
        <el-form-item label="Stream ID" required>
          <el-input v-model="createForm.stream_id" placeholder="例如 live_cam01" />
        </el-form-item>
        <el-form-item label="协议">
          <el-select v-model="createForm.protocol" style="width: 100%">
            <el-option label="RTMP" value="RTMP" />
            <el-option label="RTSP" value="RTSP" />
            <el-option label="WebRTC" value="WebRTC" />
          </el-select>
        </el-form-item>
        <el-form-item label="Pull URL">
          <el-input v-model="createForm.pull_url" placeholder="可选，预配置拉流地址" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>
