<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  createDevice,
  deleteDevice,
  fetchDevices,
  fetchRegions,
  fetchServers,
  type Device,
  type MediaServer,
  type Region,
} from "@/api/client";

const router = useRouter();
const loading = ref(false);
const devices = ref<Device[]>([]);
const regions = ref<Region[]>([]);
const servers = ref<MediaServer[]>([]);

const createDialogVisible = ref(false);
const createForm = ref({
  id: "",
  name: "",
  regionId: "",
  serverId: "",
  description: "",
});

const serversInSelectedRegion = computed(() =>
  servers.value.filter((s) => s.regionId === createForm.value.regionId),
);

async function load() {
  loading.value = true;
  try {
    const [deviceData, regionData, serverData] = await Promise.all([
      fetchDevices(),
      fetchRegions(),
      fetchServers(),
    ]);
    devices.value = deviceData.devices ?? [];
    regions.value = regionData.regions ?? [];
    servers.value = serverData.servers ?? [];
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载失败");
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  createForm.value = {
    id: "",
    name: "",
    regionId: regions.value[0]?.id ?? "",
    serverId: "",
    description: "",
  };
  createDialogVisible.value = true;
}

async function submitCreate() {
  if (!createForm.value.id.trim()) {
    ElMessage.warning("请输入设备 ID（通常与推流 stream_id 一致）");
    return;
  }
  if (!createForm.value.name.trim()) {
    ElMessage.warning("请输入设备名称");
    return;
  }
  if (!createForm.value.regionId) {
    ElMessage.warning("请选择区域");
    return;
  }
  try {
    await createDevice({
      id: createForm.value.id.trim(),
      name: createForm.value.name.trim(),
      regionId: createForm.value.regionId,
      serverId: createForm.value.serverId || undefined,
      description: createForm.value.description.trim() || undefined,
    });
    ElMessage.success("设备已创建");
    createDialogVisible.value = false;
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "创建失败");
  }
}

async function removeDevice(row: Device) {
  await ElMessageBox.confirm(`确认删除设备 ${row.name}（${row.id}）？`, "删除确认", {
    type: "warning",
  });
  try {
    await deleteDevice(row.id);
    ElMessage.success("已删除");
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "删除失败");
  }
}

function regionName(regionId: string) {
  return regions.value.find((r) => r.id === regionId)?.name ?? regionId;
}

function serverName(serverId: string) {
  return servers.value.find((s) => s.id === serverId)?.name ?? serverId;
}

onMounted(load);
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
      <h1 class="page-title" style="margin: 0">设备</h1>
      <div>
        <el-button @click="load">刷新</el-button>
        <el-button type="primary" @click="openCreate">添加设备</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="devices" stripe>
      <el-table-column prop="id" label="设备 ID" min-width="160" />
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column label="区域" min-width="120">
        <template #default="{ row }">{{ regionName(row.regionId) }}</template>
      </el-table-column>
      <el-table-column label="媒体节点" min-width="140">
        <template #default="{ row }">{{ serverName(row.serverId) }}</template>
      </el-table-column>
      <el-table-column label="推流状态" width="110">
        <template #default="{ row }">
          <el-tag :type="row.streamOnline ? 'success' : 'info'" size="small">
            {{ row.streamOnline ? "在线" : "离线" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="备注" min-width="160" show-overflow-tooltip />
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="router.push(`/devices/${row.id}`)">详情</el-button>
          <el-button link type="danger" @click="removeDevice(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="createDialogVisible" title="添加设备" width="520px">
      <el-form label-width="110px">
        <el-form-item label="设备 ID" required>
          <el-input v-model="createForm.id" placeholder="与推流 stream_id 一致，如 cam01" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="createForm.name" placeholder="如 门口摄像头" />
        </el-form-item>
        <el-form-item label="区域" required>
          <el-select v-model="createForm.regionId" style="width: 100%">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="媒体节点">
          <el-select v-model="createForm.serverId" clearable placeholder="默认选区域内首个节点" style="width: 100%">
            <el-option
              v-for="s in serversInSelectedRegion"
              :key="s.id"
              :label="s.name"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="createForm.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>
