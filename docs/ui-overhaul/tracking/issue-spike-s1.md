## Goal

Prove two-process model: Electron main spawns Python engine and polls `/health`.

## Tasks

- [x] ADR-001–003 accepted
- [ ] `GET /health` on loopback-only bind (`python -m cuepoint.engine`)
- [ ] `electron` devDependency + `electron:dev` script
- [ ] Main: port, token, spawn, health poll with backoff
- [ ] Preload: `contextBridge` with sanitized engine status (no token in renderer storage)
- [ ] Renderer: engine-connected indicator

## Reference

- [spike-s1-engine-health.md](../../../apps/desktop-electron/docs/spike-s1-engine-health.md)
- [003-http-ipc.md](../adr/003-http-ipc.md)

## Exit criteria

`npm run electron:dev` opens window; health poll succeeds on Windows.
