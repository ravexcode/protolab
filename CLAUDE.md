# ProtoLab

The project guide is shared by every agent and lives in AGENTS.md:

@AGENTS.md

## Claude Code notes

- Project skills are in `.claude/skills/`. Invoke `frontend-design` before any interface work and `web-design-guidelines` to review it afterwards.
- To let Claude Code edit boards live, start the bridge (`npm run bridge`), register it once with `claude mcp add --transport http --scope user protolab http://127.0.0.1:7337/mcp`, then press MCP and Conectar in the site.
- Chrome is the reference browser. Headless checks need `--enable-unsafe-swiftshader --use-angle=swiftshader` for the 3D view.
