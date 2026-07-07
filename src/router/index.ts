import { createRouter, createWebHistory } from "vue-router";
import DashboardView from "@/views/DashboardView.vue";
import ServersView from "@/views/ServersView.vue";
import ServerDetailView from "@/views/ServerDetailView.vue";
import DevicesView from "@/views/DevicesView.vue";
import DeviceDetailView from "@/views/DeviceDetailView.vue";
import IptvDashboardView from "@/views/IptvDashboardView.vue";
import IptvChannelsView from "@/views/IptvChannelsView.vue";
import IptvSourcesView from "@/views/IptvSourcesView.vue";
import IptvPlayItemsView from "@/views/IptvPlayItemsView.vue";
import PullValidateView from "@/views/PullValidateView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "dashboard", component: DashboardView },
    { path: "/servers", name: "servers", component: ServersView },
    { path: "/servers/:id", name: "server-detail", component: ServerDetailView, props: true },
    { path: "/devices", name: "devices", component: DevicesView },
    { path: "/devices/:id", name: "device-detail", component: DeviceDetailView, props: true },
    { path: "/iptv", name: "iptv", component: IptvDashboardView },
    { path: "/iptv/channels", name: "iptv-channels", component: IptvChannelsView },
    { path: "/iptv/sources", name: "iptv-sources", component: IptvSourcesView },
    { path: "/iptv/playitems", name: "iptv-playitems", component: IptvPlayItemsView },
    { path: "/iptv/pull-validate", name: "iptv-pull-validate", component: PullValidateView },
  ],
});

export default router;
