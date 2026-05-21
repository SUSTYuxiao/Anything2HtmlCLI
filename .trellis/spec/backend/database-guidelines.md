# Database Guidelines

**Status: N/A for this project.**

`a2h` is a stateless CLI tool. It reads stdin / a file, calls the local
`claude` CLI, writes a single HTML file (or stdout). No database, no
ORM, no persistence layer of any kind.

If a future feature requires persistence (e.g. caching LLM responses),
this file should be repurposed at that time — not before.
