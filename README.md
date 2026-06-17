# Planx Designer

Visual Pipeline Designer for **Planx 4.0** — the high-performance, multi-tenant, plugin-first iPaaS.

## What It Does

- Visually build **linear pipelines**: Source → Processors → Sink
- Dynamically discover plugins from the Control Plane API
- Edit per-node opaque JSON config with syntax highlighting
- Preview as YAML or JSON
- Submit to the Control Plane for execution

## What It Does NOT Do

- Execute pipelines
- Support DAG / branching / fan-in / fan-out
- Manage runtime state or sessions

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 |
| Language | TypeScript |
| Build | Vite 7 |
| Styling | TailwindCSS v4 |
| Canvas | React Flow (XYFlow) |
| State | Zustand |
| Icons | Lucide |
| Config Editor | CodeMirror 6 |

## Getting Started

```bash
npm install
npm run dev
```

The dev server starts at `http://localhost:5173`.

Set the Control Plane API base URL via environment variable:

```bash
VITE_API_BASE_URL=http://localhost:8080/api/v1
```

## Project Structure

```
src/
├── api/            # Control Plane HTTP client
├── components/
│   ├── canvas/     # React Flow pipeline canvas
│   ├── palette/    # Dynamic plugin palette
│   ├── editor/     # Config panel + JSON editor
│   ├── preview/    # YAML/JSON spec preview
│   └── toolbar/    # Pipeline toolbar
├── lib/            # Pure utility functions
├── stores/         # Zustand state stores
└── types/          # TypeScript definitions
```

## Related Repositories

- [planx-spec](../planx-spec/) — Canonical specifications
- [planx-engine](../planx-engine/) — Core orchestration engine
- [planx-sdk-go](../planx-sdk-go/) — Go SDK
