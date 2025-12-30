# Futsal Master - Tactical (GitHub Pages)

Esta versión está lista para GitHub Pages **sin build** usando un cargador que transpila TS/TSX en el navegador con Babel.

## Cómo publicar
1. Sube esta carpeta al **root** de tu repositorio.
2. GitHub → Settings → Pages → Deploy from a branch → `main` / `(root)`.

## Notas
- React se carga vía `importmap` (esm.sh).
- PeerJS se carga vía CDN (UMD global `Peer`).
