<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import DevicePlayUrlsPanel from "@/components/DevicePlayUrlsPanel.vue";
import StreamPlayer from "@/components/StreamPlayer.vue";
import {
  fetchDevice,
  fetchDevicePlayUrls,
  fetchRegions,
  fetchServers,
  updateDevice,
  type Device,
  type MediaServer,
  type PlayUrls,
  type Region,
} from "@/api/client";

const props = defineProps<{ id: string }>();
const router = useRouter();

const loading = ref(false);
const device = ref<Device | null>(null);
const playUrls = ref<PlayUrls | null>(null);
const streamOnline = ref(false);
const regions = ref<Region[]>([]);
const servers = ref<MediaServer[]>([]);
const editDialogVisible = ref(false);
const editForm = ref({
  name: "",
  regionId: "",
  serverId: "",
  description: "",
});

let pollTimer: ReturnType<typeof setInterval> | null = null;

const serversInSelectedRegion = computed(() =>
  servers.value.filter((s) => s.regionId === editForm.value.regionId),
);

async function loadPlayUrls() {
  try {
    const data = await fetchDevicePlayUrls(props.id);
    playUrls.value = data.playUrls;
    streamOnline.value = data.streamOnline;
  } catch {
    playUrls.value = null;
    streamOnline.value = false;
  }
}

async function load() {
  loading.value = true;
  try {
    const [deviceData, regionData, serverData] = await Promise.all([
      fetchDevice(props.id),
      fetchRegions(),
      fetchServers(),
    ]);
    device.value = deviceData;
    regions.value = regionData.regions ?? [];
    servers.value = serverData.servers ?? [];
    streamOnline.value = deviceData.streamOnline;
    await loadPlayUrls();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载失败");
  } finally {
    loading.value = false;
  }
}

function openEdit() {
  if (!device.value) return;
  editForm.value = {
    name: device.value.name,
    regionId: device.value.regionId,
    serverId: device.value.serverId,
    description: device.value.description ?? "",
  };
  editDialogVisible.value = true;
}

async function submitEdit() {
  if (!device.value) return;
  try {
    const updated = await updateDevice(device.value.id, {
      name: editForm.value.name.trim(),
      regionId: editForm.value.regionId,
      serverId: editForm.value.serverId || undefined,
      description: editForm.value.description.trim() || undefined,
    });
    device.value = updated;
    editDialogVisible.value = false;
    ElMessage.success("已保存");
    await loadPlayUrls();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存失败");
  }
}

function regionName(regionId: string) {
  return regions.value.find((r) => r.id === regionId)?.name ?? regionId;
}

function serverName(serverId: string) {
  return servers.value.find((s) => s.id === serverId)?.name ?? serverId;
}

watch(() => props.id, load, { immediate: true });

onMounted(() => {
  pollTimer = setInterval(() => {
    void loadPlayUrls();
  }, 5000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <div v-loading="loading">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
      <h1 class="page-title" style="margin: 0">设备详情 · {{ id }}</h1>
      <el-button @click="openEdit">编辑</el-button>
    </div>

    <el-row :gutter="16">
      <el-col :span="14" :xs="24">
        <StreamPlayer
          :hls-url="playUrls?.hls"
          :flv-url="playUrls?.httpFlv"
          :online="streamOnline"
        />
      </el-col>
      <el-col :span="10" :xs="24">
        <el-card shadow="never" style="margin-bottom: 16px">
          <template #header>基本信息</template>
          <el-descriptions v-if="device" :column="1" border>
            <el-descriptions-item label="设备 ID">{{ device.id }}</el-descriptions-item>
            <el-descriptions-item label="名称">{{ device.name }}</el-descriptions-item>
            <el-descriptions-item label="区域">{{ regionName(device.regionId) }}</el-descriptions-item>
            <el-descriptions-item label="媒体节点">
              <el-button
                v-if="device"
                link
                type="primary"
                @click="router.push(`/servers/${device.serverId}`)"
              >
                {{ serverName(device.serverId) }}
              </el-button>
            </el-descriptions-item>
            <el-descriptions-item label="推流状态">
              <el-tag :type="streamOnline ? 'success' : 'info'" size="small">
                {{ streamOnline ? "在线" : "离线" }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="备注">{{ device.description || "-" }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
        <DevicePlayUrlsPanel :device-id="id" :play-urls="playUrls" :stream-online="streamOnline" />
      </el-col>
    </el-row>

    <el-dialog v-model="editDialogVisible" title="编辑设备" width="520px">
      <el-form label-width="110px">
        <el-form-item label="设备 ID">
          <el-input :model-value="id" disabled />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item label="区域" required>
          <el-select v-model="editForm.regionId" style="width: 100%">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="媒体节点">
          <el-select v-model="editForm.serverId" clearable style="width: 100%">
            <el-option
              v-for="s in serversInSelectedRegion"
              :key="s.id"
              :label="s.name"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="editForm.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
