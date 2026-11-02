#!/usr/bin/env node
// `cc-mcp` bin: the headless stdio MCP server on plain Node 24. stdout carries
// protocol frames only; diagnostics go to stderr.
import './ts-resolve.mjs';

const { runMcp } = await import('./mcp-main.ts');
await runMcp();
