# basic_3d

This is a tiny 3D-ish demo rendered on a 2D canvas with no external 3D libraries (no WebGL/WebGPU/OpenGL). It projects 3D points with a simple perspective divide and draws filled faces to make a castle and moving avatars.

Inspired by: https://www.youtube.com/watch?v=qjWkNZ0SXfo

Video summary (very brief): it builds a 3D illusion from scratch using the simple projection formula `x' = x / z`, `y' = y / z`, maps those normalized coordinates into canvas space, animates/rotates points and a cube, and draws faces with the 2D canvas API — emphasizing that you can do convincing 3D without any external 3D engine.

## How It Works
- All geometry is stored as 3D points and box faces.
- A custom projection turns 3D points into 2D screen space using `x' = x / depth` and `y' = y / depth`.
- The viewer has yaw/pitch, and the scene is rotated with optional axis toggles.
- Faces are drawn back-to-front with a simple depth sort.
- A near-plane check avoids lines shooting to infinity when the camera is inside geometry.

## Controls
- Arrow keys: move relative to view (forward/back, strafe left/right)
- J/K: move along world Z
- A/D/Z/S: look left/right/up/down
- Buttons on the page mirror the same actions (tap/hold for mobile)

## Multiplayer
- A lightweight WebSocket server keeps authoritative positions and view.
- Clients send input; the server simulates and broadcasts positions ~30 Hz.
- Each player gets a random name and color, rendered as a small box with a label.

## Run Locally
```
npm install
npm start
```
Then open `http://localhost:3000`.

## Share Over the Web (Cloudflare Tunnel)
Quick tunnel (ephemeral URL):
```
cloudflared tunnel --url http://localhost:3000
```

Background quick tunnel:
```
nohup cloudflared tunnel --url http://localhost:3000 >/tmp/cloudflared.log 2>&1 &
tail -n 20 /tmp/cloudflared.log
```

Note: quick tunnels are not guaranteed to be stable. For a persistent URL, create a named tunnel and a hostname in your Cloudflare account.
