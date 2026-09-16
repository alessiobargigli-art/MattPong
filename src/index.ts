import { DurableObject } from "cloudflare:workers";

type PlayerSide = "left" | "right";
type ClientMessage = { type: "move"; y: number } | { type: "ping" };

type Snapshot = {
  type: "state";
  code: string;
  waiting: boolean;
  leftY: number;
  rightY: number;
  ballX: number;
  ballY: number;
  leftScore: number;
  rightScore: number;
};

const WIDTH = 1600;
const HEIGHT = 900;
const PADDLE_HALF = 90;
const BALL_R = 18;
const PADDLE_X_LEFT = 80;
const PADDLE_X_RIGHT = 1520;
const TICK_MS = 1000 / 60;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/room/create")) {
      const code = randomCode();
      return Response.json({ code });
    }
    if (url.pathname.startsWith("/ws/")) {
      const code = url.pathname.split("/").pop()?.toUpperCase() ?? "";
      if (!/^[A-Z0-9]{6}$/.test(code)) return new Response("Invalid room code", { status: 400 });
      const id = env.ROOMS.idFromName(code);
      return env.ROOMS.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export class GameRoom extends DurableObject<Env> {
  private sockets = new Map<WebSocket, PlayerSide>();
  private leftY = HEIGHT / 2;
  private rightY = HEIGHT / 2;
  private ballX = WIDTH / 2;
  private ballY = HEIGHT / 2;
  private vx = 560;
  private vy = 220;
  private leftScore = 0;
  private rightScore = 0;
  private code = "";
  private timer?: number;

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const url = new URL(request.url);
    this.code = url.pathname.split("/").pop()?.toUpperCase() ?? this.code;
    if (this.sockets.size >= 2) return new Response("Room full", { status: 409 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    const side: PlayerSide = this.sockets.size === 0 ? "left" : "right";
    this.sockets.set(server, side);

    server.send(JSON.stringify({ type: "joined", side, code: this.code }));
    server.addEventListener("message", (event) => this.onMessage(server, event.data));
    server.addEventListener("close", () => this.onClose(server));
    server.addEventListener("error", () => this.onClose(server));

    this.ensureLoop();
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  private onMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string") return;
    let msg: ClientMessage;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", t: Date.now() }));
      return;
    }
    if (msg.type === "move" && Number.isFinite(msg.y)) {
      const y = Math.max(PADDLE_HALF, Math.min(HEIGHT - PADDLE_HALF, msg.y * HEIGHT));
      const side = this.sockets.get(socket);
      if (side === "left") this.leftY = y;
      if (side === "right") this.rightY = y;
    }
  }

  private onClose(socket: WebSocket) {
    this.sockets.delete(socket);
    if (this.sockets.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.resetBall(Math.random() < 0.5 ? -1 : 1);
    }
    this.broadcast();
  }

  private ensureLoop() {
    if (this.timer) return;
    let last = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (this.sockets.size >= 2) this.step(dt);
      this.broadcast();
    }, TICK_MS) as unknown as number;
  }

  private step(dt: number) {
    this.ballX += this.vx * dt;
    this.ballY += this.vy * dt;

    if (this.ballY - BALL_R <= 0 && this.vy < 0) this.vy *= -1;
    if (this.ballY + BALL_R >= HEIGHT && this.vy > 0) this.vy *= -1;

    if (this.vx < 0 && this.ballX - BALL_R <= PADDLE_X_LEFT + 14 && this.ballX > PADDLE_X_LEFT - 40) {
      if (Math.abs(this.ballY - this.leftY) <= PADDLE_HALF + BALL_R) this.bounceFromPaddle(this.leftY, 1);
    }
    if (this.vx > 0 && this.ballX + BALL_R >= PADDLE_X_RIGHT - 14 && this.ballX < PADDLE_X_RIGHT + 40) {
      if (Math.abs(this.ballY - this.rightY) <= PADDLE_HALF + BALL_R) this.bounceFromPaddle(this.rightY, -1);
    }

    if (this.ballX < -80) {
      this.rightScore++;
      this.resetBall(1);
    } else if (this.ballX > WIDTH + 80) {
      this.leftScore++;
      this.resetBall(-1);
    }
  }

  private bounceFromPaddle(paddleY: number, direction: 1 | -1) {
    const offset = Math.max(-1, Math.min(1, (this.ballY - paddleY) / PADDLE_HALF));
    const speed = Math.min(1200, Math.hypot(this.vx, this.vy) * 1.06);
    const angle = offset * 0.9;
    this.vx = Math.cos(angle) * speed * direction;
    this.vy = Math.sin(angle) * speed;
  }

  private resetBall(direction: 1 | -1) {
    this.ballX = WIDTH / 2;
    this.ballY = HEIGHT / 2;
    this.vx = 560 * direction;
    this.vy = (Math.random() * 2 - 1) * 300;
  }

  private broadcast() {
    const snapshot: Snapshot = {
      type: "state",
      code: this.code,
      waiting: this.sockets.size < 2,
      leftY: this.leftY,
      rightY: this.rightY,
      ballX: this.ballX,
      ballY: this.ballY,
      leftScore: this.leftScore,
      rightScore: this.rightScore,
    };
    const payload = JSON.stringify(snapshot);
    for (const socket of this.sockets.keys()) {
      try { socket.send(payload); } catch { this.sockets.delete(socket); }
    }
  }
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  crypto.getRandomValues(new Uint32Array(6)).forEach(v => out += alphabet[v % alphabet.length]);
  return out;
}
