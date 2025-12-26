import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { watch } from "node:fs";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

const clients = new Set();
const players = new Map();
const inputs = new Map();

const BASE_MOVE_SPEED = 0.9;
const LOOK_SPEED = 1.2;
const MAX_PITCH = (60 * Math.PI) / 180;
const WORLD_BOUNDS = { x: 2.2, y: 3.2, z: 2.2 };
const COLORS = ["#7bdff2", "#f2b5d4", "#b8f2e6", "#f4d35e", "#ee6c4d", "#9b5de5"];

function sendReload() {
  for (const res of clients) {
    res.write("data: reload\n\n");
  }
}

function startWatcher() {
  try {
    watch(publicDir, { persistent: true }, () => {
      sendReload();
    });
  } catch (err) {
    console.error("Failed to watch public directory:", err);
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end("Bad Request");
    return;
  }

  if (req.url === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });
    res.write("retry: 1000\n\n");
    clients.add(res);
    req.on("close", () => {
      clients.delete(res);
    });
    return;
  }

  const safeUrl = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(publicDir, safeUrl);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === ".html"
      ? "text/html"
      : ext === ".js"
        ? "application/javascript"
        : ext === ".css"
          ? "text/css"
          : "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

startWatcher();

const wss = new WebSocketServer({ server });

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function makeName() {
  return `Player-${Math.floor(1000 + Math.random() * 9000)}`;
}

function ensureInput(id) {
  if (!inputs.has(id)) {
    inputs.set(id, {
      move: { forward: 0, right: 0, up: 0 },
      speed: 0.6,
      view: { yaw: 0, pitch: 0 }
    });
  }
  return inputs.get(id);
}

function forwardVector(yaw, pitch) {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  return {
    x: sinYaw * cosPitch,
    y: cosYaw * cosPitch,
    z: -sinPitch
  };
}

wss.on("connection", (ws) => {
  const id = makeId();
  const name = makeName();
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const player = { id, name, color, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  players.set(id, player);
  ensureInput(id);

  ws.send(JSON.stringify({ type: "welcome", id, name, color }));

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.type === "hello" && typeof msg.name === "string") {
      player.name = msg.name.trim().slice(0, 16) || player.name;
      return;
    }
    if (msg.type === "reset") {
      player.x = 0;
      player.y = 0;
      player.z = 0;
      return;
    }
    if (msg.type === "input") {
      const input = ensureInput(id);
      if (msg.move) {
        input.move = {
          forward: clamp(Number(msg.move.forward) || 0, -1, 1),
          right: clamp(Number(msg.move.right) || 0, -1, 1),
          up: clamp(Number(msg.move.up) || 0, -1, 1)
        };
      }
      if (typeof msg.speed === "number") {
        input.speed = clamp(msg.speed, 0.1, 2);
      }
      if (msg.view) {
        input.view = {
          yaw: Number(msg.view.yaw) || 0,
          pitch: clamp(Number(msg.view.pitch) || 0, -MAX_PITCH, MAX_PITCH)
        };
      }
    }
  });

  ws.on("close", () => {
    players.delete(id);
    inputs.delete(id);
  });
});

let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;

  for (const player of players.values()) {
    const input = ensureInput(player.id);
    const speed = BASE_MOVE_SPEED * clamp(input.speed, 0.1, 2);
    player.yaw = input.view.yaw;
    player.pitch = clamp(input.view.pitch, -MAX_PITCH, MAX_PITCH);

    const forward = forwardVector(player.yaw, player.pitch);
    const right = { x: Math.cos(player.yaw), y: -Math.sin(player.yaw), z: 0 };
    const step = speed * dt;

    player.x += forward.x * input.move.forward * step + right.x * input.move.right * step;
    player.y += forward.y * input.move.forward * step + right.y * input.move.right * step;
    player.z += forward.z * input.move.forward * step + input.move.up * step;

    player.x = clamp(player.x, -WORLD_BOUNDS.x, WORLD_BOUNDS.x);
    player.y = clamp(player.y, -WORLD_BOUNDS.y, WORLD_BOUNDS.y);
    player.z = clamp(player.z, -WORLD_BOUNDS.z, WORLD_BOUNDS.z);
  }

  if (wss.clients.size === 0) return;
  const payload = JSON.stringify({
    type: "state",
    players: Array.from(players.values())
  });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}, 33);
