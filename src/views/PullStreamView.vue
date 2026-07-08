<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { pullRtmp, pullRtsp } from "@/api/iptv";

const loading = ref(false);
const form = ref({
  protocol: "rtmp",
  url: "rtmp://127.0.0.1:1935/live/source_stream",
  stream_id: "pulled_stream",
});

async function submit() {
  if (!form.value.url.trim() || !form.value.stream_id.trim()) {
    ElMessage.warning("请填写 URL 与 stream_id");
    return;
  }

  loading.value = true;
  try {
    const payload = {
      url: form.value.url.trim(),
      stream_id: form.value.stream_id.trim(),
    };
    const result =
      form.value.protocol === "rtmp"
        ? await pullRtmp(payload)
        : await pullRtsp(payload);
    ElMessage.success("拉流任务已提交");
    console.info(result);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "拉流失败");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div>
    <h1 class="page-title">API 拉流</h1>

    <el-card shadow="never" style="max-width: 720px">
      <el-form label-width="120px" @submit.prevent="submit">
        <el-form-item label="协议">
          <el-radio-group v-model="form.protocol">
            <el-radio value="rtmp">RTMP Pull</el-radio>
            <el-radio value="rtsp">RTSP Pull</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="远端 URL" required>
          <el-input
            v-model="form.url"
            placeholder="rtmp://host/app/key 或 rtsp://host/path?transport=udp"
          />
        </el-form-item>
        <el-form-item label="本地 stream_id" required>
          <el-input v-model="form.stream_id" placeholder="转发到本地的 stream_id" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="submit">开始拉流</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-alert
      style="margin-top: 16px; max-width: 720px"
      type="info"
      :closable="false"
      title="说明"
      description="RTSP UDP 拉流请在 URL 末尾加 ?transport=udp。拉流成功后可在「流管理」查看并复制播放地址。"
    />
  </div>
</template>
