/** WebRTC 播放客户端，信令协议与 vcp-media-server/webrtc/webrtc-test.html 一致。 */

export interface WebrtcPlayerOptions {
  wsUrl: string;
  streamId: string;
  video: HTMLVideoElement;
  onError?: (message: string) => void;
}

interface PendingIce {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

interface ServerMessage {
  type: string;
  sdp?: string;
  candidate?: string;
  sdp_mid?: string | null;
  sdp_mline_index?: number | null;
  message?: string;
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export class WebrtcPlayer {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private remoteStream: MediaStream | null = null;
  private generation = 0;
  private pendingServerIce: PendingIce[] = [];
  private stopped = false;

  constructor(private readonly options: WebrtcPlayerOptions) {}

  start() {
    this.stop();
    this.stopped = false;
    const { wsUrl, streamId } = this.options;
    if (!wsUrl || !streamId) {
      this.options.onError?.("缺少 WebRTC 信令地址或 stream_id");
      return;
    }

    const generation = ++this.generation;
    const socket = new WebSocket(wsUrl);
    this.ws = socket;

    socket.onopen = () => {
      if (this.stopped || this.ws !== socket || generation !== this.generation) return;
      void this.startPlay(generation, streamId);
    };

    socket.onclose = () => {
      if (this.ws !== socket) return;
      this.ws = null;
      if (!this.stopped) {
        this.options.onError?.("WebRTC 信令连接已断开");
      }
    };

    socket.onerror = () => {
      if (this.ws !== socket) return;
      this.options.onError?.("WebRTC 信令连接失败");
    };

    socket.onmessage = (ev) => {
      if (this.stopped || this.ws !== socket || generation !== this.generation) return;
      void this.handleMessage(generation, ev.data as string);
    };
  }

  stop() {
    this.stopped = true;
    this.generation += 1;
    this.pendingServerIce = [];

    const streamId = this.options.streamId;
    if (this.ws?.readyState === WebSocket.OPEN && streamId) {
      try {
        this.ws.send(JSON.stringify({ type: "stop_play", stream_id: streamId }));
      } catch {
        /* ignore */
      }
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }

    if (this.pc) {
      try {
        this.pc.ontrack = null;
        this.pc.close();
      } catch {
        /* ignore */
      }
      this.pc = null;
    }

    const video = this.options.video;
    const stream = this.remoteStream ?? (video.srcObject as MediaStream | null);
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      });
    }
    this.remoteStream = null;
    video.srcObject = null;
    video.removeAttribute("src");
    video.load();
  }

  private wsSend(payload: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket 未连接");
    }
    this.ws.send(JSON.stringify(payload));
  }

  private async startPlay(generation: number, streamId: string) {
    const { video } = this.options;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;

    pc.addTransceiver("video", { direction: "recvonly" });

    const remoteStream = new MediaStream();
    this.remoteStream = remoteStream;
    video.srcObject = remoteStream;

    pc.onicecandidate = (ev) => {
      if (!ev.candidate || this.stopped || generation !== this.generation) return;
      try {
        this.wsSend({
          type: "ice",
          candidate: ev.candidate.candidate,
          sdp_mid: ev.candidate.sdpMid,
          sdp_mline_index: ev.candidate.sdpMLineIndex,
        });
      } catch {
        /* ignore */
      }
    };

    pc.onconnectionstatechange = () => {
      if (generation !== this.generation || !this.pc) return;
      if (this.pc.connectionState === "failed") {
        this.options.onError?.("WebRTC 连接失败");
      }
    };

    pc.ontrack = (ev) => {
      if (generation !== this.generation || this.pc !== pc) {
        try {
          ev.track.stop();
        } catch {
          /* ignore */
        }
        return;
      }
      remoteStream.addTrack(ev.track);
      ev.track.onunmute = () => {
        void video.play().catch(() => {
          /* autoplay blocked */
        });
      };
      void video.play().catch(() => {
        /* autoplay blocked */
      });
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.wsSend({ type: "play", stream_id: streamId, sdp: offer.sdp });
    } catch (err) {
      this.options.onError?.(
        `WebRTC 播放失败：${err instanceof Error ? err.message : String(err)}`,
      );
      this.stop();
    }
  }

  private async handleMessage(generation: number, raw: string) {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }

    if (msg.type === "answer") {
      const pc = this.pc;
      if (!pc || generation !== this.generation) return;
      try {
        await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp ?? "" });
        await this.flushPendingServerIce();
      } catch (err) {
        this.options.onError?.(
          `WebRTC 设置 answer 失败：${err instanceof Error ? err.message : String(err)}`,
        );
        this.stop();
      }
      return;
    }

    if (msg.type === "ice") {
      await this.addServerIceCandidate({
        candidate: msg.candidate ?? "",
        sdpMid: msg.sdp_mid ?? null,
        sdpMLineIndex: msg.sdp_mline_index ?? null,
      });
      return;
    }

    if (msg.type === "error") {
      const message = msg.message ?? "unknown";
      if (/play rejected|play failed|not publishing|Stream .*not found|播放/i.test(message)) {
        this.options.onError?.(`WebRTC 播放失败：${message}`);
        this.stop();
      }
    }
  }

  private async addServerIceCandidate(ice: PendingIce) {
    const pc = this.pc;
    if (!pc) return;
    const candidateInit: RTCIceCandidateInit = {
      candidate: ice.candidate,
      sdpMid: ice.sdpMid,
      sdpMLineIndex: ice.sdpMLineIndex,
    };
    if (!pc.remoteDescription) {
      this.pendingServerIce.push(ice);
      return;
    }
    try {
      await pc.addIceCandidate(candidateInit);
    } catch {
      this.pendingServerIce.push(ice);
    }
  }

  private async flushPendingServerIce() {
    const pc = this.pc;
    if (!pc?.remoteDescription) return;
    const rest: PendingIce[] = [];
    for (const ice of this.pendingServerIce) {
      try {
        await pc.addIceCandidate({
          candidate: ice.candidate,
          sdpMid: ice.sdpMid,
          sdpMLineIndex: ice.sdpMLineIndex,
        });
      } catch {
        rest.push(ice);
      }
    }
    this.pendingServerIce = rest;
  }
}
