# Deployment / 部署说明

## Cloudflare Pages (recommended)

The live interactive demo is entirely static. No backend, user credentials, analytics, cookies or APIs are required by the app.

### Connect GitHub (automatic updates)

1. Create a **Cloudflare Pages** project and connect the public GitHub repository `zixi526526/clow-waves-web`.
2. Choose `main` as the production branch.
3. Leave **Build command** empty (the built `dist/` files are committed to Git).
4. Set **Build output directory** to `dist`.
5. Deploy. Future commits to `main` are published automatically by Cloudflare Pages.

The custom GitHub connection requires Cloudflare Workers & Pages' GitHub App to have access to **only this repository**. It is not required for a one-off direct upload.

### Direct upload (when Git integration is not authorized)

```bash
npx wrangler pages deploy dist --project-name=clow-waves-web --branch=main
```

Direct upload is a snapshot. For subsequent changes, repeat the deployment (or set up a dedicated GitHub Action with an appropriately scoped Cloudflare API token stored as a GitHub Actions secret).

### Local build and preview

```bash
npm run build
npm run check
npx wrangler pages dev dist
```

You may also open `digital-ripples-standalone.html` directly in a browser, without Cloudflare or a server.

## Supported demo URLs / 演示参数

- `/?lang=en` – English interface (default)
- `/?lang=zh` – 中文界面
- `/?preset=warm` or `/?preset=dark` – appearance preset
- `/?clean=1` – hide controls; press **H** to show them again
- `/?demo=1` – run an automatic click demonstration

All language choices are local to the browser and no text from the demo form is sent to a server.

## Attribution

The underlying ripple mathematics and WebGL renderer derive from [Maurdekye/orgtree](https://github.com/Maurdekye/orgtree) under MIT. Retain `LICENSE`, `THIRD_PARTY_NOTICES.md`, and `PROVENANCE.md` when redistributing. This is an unofficial project and is not affiliated with Anthropic.
