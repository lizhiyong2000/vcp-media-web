import { createRouter, createWebHistory } from "vue-router";
import DashboardView from "@/views/DashboardView.vue";
import ServersView from "@/views/ServersView.vue";
import ServerDetailView from "@/views/ServerDetailView.vue";
import DevicesView from "@/views/DevicesView.vue";
import DeviceDetailView from "@/views/DeviceDetailView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "dashboard", component: DashboardView },
    { path: "/servers", name: "servers", component: ServersView },
    { path: "/servers/:id", name: "server-detail", component: ServerDetailView, props: true },
    { path: "/devices", name: "devices", component: DevicesView },
    { path: "/devices/:id", name: "device-detail", component: DeviceDetailView, props: true },
  ],
});

export default router;
