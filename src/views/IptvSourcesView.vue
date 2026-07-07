<script setup lang="ts">
import { ref, onMounted } from "vue";
import {
  fetchSources,
  addSource,
  deleteSource,
  toggleSource,
  fetchSourceNow,
  type IptvPlaylistSource,
} from "@/api/iptv";
import { ElMessage, ElMessageBox } from "element-plus";

const sources = ref<IptvPlaylistSource[]>([]);
const loading = ref(false);

// 添加播源
const addDialogVisible = ref(false);
const addForm = ref({ name: "", url: "", category: "" });
const addPending = ref(false);

async function loadSources() {
  loading.value = true;
  try {
    const res = await fetchSources();
    if (res.code === 0) {
      sources.value = res.data;
    } else {
      ElMessage.error(res.message);
    }
  } catch {
    ElMessage.error("获取播源列表失败");
  } finally {
    loading.value = false;
  }
}

async function handleAddSource() {
  if (!addForm.value.name.trim()) {
    ElMessage.warning("请输入播源名称");
    return;
  }
  if (!addForm.value.url.trim()) {
    ElMessage.warning("请输入播源 URL");
    return;
  }
  addPending.value = true;
  try {
    const res = await addSource({
      name: addForm.value.name.trim(),
      url: addForm.value.url.trim(),
      category: addForm.value.category.trim() || undefined,
    });
    if (res.code === 0) {
      ElMessage.success("播源添加成功");
      addDialogVisible.value = false;
      addForm.value = { name: "", url: "", category: "" };
      await loadSources();
    } else {
      ElMessage.error(res.message);
    }
  } catch {
    ElMessage.error("添加播源失败");
  } finally {
    addPending.value = false;
  }
}

async function handleDelete(source: IptvPlaylistSource) {
  try {
    await ElMessageBox.confirm(
      `确定要删除播源「${source.name}」吗？`,
      "确认删除",
      { type: "warning" },
    );
  } catch {
    return;
  }
  try {
    const res = await deleteSource(source.id);
    if (res.code === 0) {
      ElMessage.success("播源已删除");
      await loadSources();
    } else {
      ElMessage.error(res.message);
    }
  } catch {
    ElMessage.error("删除播源失败");
  }
}

async function handleToggle(source: IptvPlaylistSource) {
  const newEnabled = !source.enabled;
  try {
    const res = await toggleSource(source.id, newEnabled);
    if (res.code === 0) {
      ElMessage.success(res.data);
      await loadSources();
    } else {
      ElMessage.error(res.message);
    }
  } catch {
    ElMessage.error("操作失败");
  }
}

async function handleFetchNow(source: IptvPlaylistSource) {
  try {
    const res = await fetchSourceNow(source.id);
    if (res.code === 0) {
      ElMessage.success(res.data);
    } else {
      ElMessage.error(res.message);
    }
  } catch {
    ElMessage.error("触发拉取失败");
  }
}

function formatTime(t: string | null) {
  if (!t) return "-";
  return t;
}

onMounted(loadSources);
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title" style="margin-bottom: 0">IPTV 播源管理</h1>
      <el-button type="primary" @click="addDialogVisible = true">
        添加播源
      </el-button>
    </div>

    <!-- 播源表格 -->
    <el-table
      v-loading="loading"
      :data="sources"
      stripe
      style="width: 100%; margin-top: 16px"
    >
      <el-table-column prop="name" label="播源名称" min-width="150" />
      <el-table-column prop="url" label="URL" min-width="280" show-overflow-tooltip />
      <el-table-column prop="category" label="分类" width="100" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.category" size="small" type="info">{{ row.category }}</el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
            {{ row.enabled ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="上次拉取" width="110" align="center">
        <template #default="{ row }">
          <el-tag
            v-if="row.last_status === 'ok'"
            type="success"
            size="small"
          >
            {{ row.last_count ?? '-' }} 条
          </el-tag>
          <el-tag
            v-else-if="row.last_status === 'error'"
            type="danger"
            size="small"
          >
            失败
          </el-tag>
          <span v-else style="color: #9ca3af">未拉取</span>
        </template>
      </el-table-column>
      <el-table-column prop="last_fetch_at" label="拉取时间" width="170" align="center">
        <template #default="{ row }">
          {{ formatTime(row.last_fetch_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="260" align="center" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="handleFetchNow(row)">
            立即拉取
          </el-button>
          <el-button size="small" @click="handleToggle(row)">
            {{ row.enabled ? '禁用' : '启用' }}
          </el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)">
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加播源对话框 -->
    <el-dialog
      v-model="addDialogVisible"
      title="添加播源"
      width="480px"
      destroy-on-close
    >
      <el-form :model="addForm" label-width="70px">
        <el-form-item label="名称" required>
          <el-input v-model="addForm.name" placeholder="输入播源名称" />
        </el-form-item>
        <el-form-item label="URL" required>
          <el-input v-model="addForm.url" placeholder="输入 M3U/M3U8 播源 URL" />
        </el-form-item>
        <el-form-item label="分类">
          <el-input v-model="addForm.category" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="addPending" @click="handleAddSource">
          确认添加
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
