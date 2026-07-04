<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Cpu, DataAnalysis, Monitor, Platform } from "@element-plus/icons-vue";

const route = useRoute();
const router = useRouter();

const activeMenu = computed(() => {
  if (route.path.startsWith("/servers")) return "/servers";
  if (route.path.startsWith("/devices")) return "/devices";
  return route.path;
});

function navigate(path: string) {
  router.push(path);
}
</script>

<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="brand">
        <el-icon><Monitor /></el-icon>
        <span>VCP Media</span>
      </div>
      <el-menu :default-active="activeMenu" router @select="navigate">
        <el-menu-item index="/">
          <el-icon><DataAnalysis /></el-icon>
          <span>概览</span>
        </el-menu-item>
        <el-menu-item index="/servers">
          <el-icon><Platform /></el-icon>
          <span>Media Server</span>
        </el-menu-item>
        <el-menu-item index="/devices">
          <el-icon><Cpu /></el-icon>
          <span>设备</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div>流媒体管理控制台</div>
        <div class="header-sub">Media Server · 设备 · vcp-media-manager</div>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout {
  min-height: 100vh;
}

.aside {
  background: #111827;
  color: #fff;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px 16px;
  font-size: 18px;
  font-weight: 700;
}

.aside :deep(.el-menu) {
  border-right: none;
  background: transparent;
}

.aside :deep(.el-menu-item) {
  color: #d1d5db;
}

.aside :deep(.el-menu-item.is-active) {
  background: rgba(37, 99, 235, 0.2);
  color: #fff;
}

.header {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 72px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}

.header-sub {
  font-size: 12px;
  color: #6b7280;
}

.main {
  padding: 24px;
}
</style>
