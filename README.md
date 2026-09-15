# Abo-Killer: an AG-UI demo

**Abo-Killer** looks through a year of (fake) bank statements, finds your subscriptions and cancels the ones you choose. It is an [AG-UI](https://docs.ag-ui.com) agent running on **Gemma 4** through **llama.cpp**, with an **Angular** app built on **CopilotKit** for Angular.

On the way it shows the four things a teammate does that a spinner can't:

- **SEE:** the tool reports its progress while it runs.
- **ASK:** the agent proposes, and the human decides.
- **DECIDE:** an interrupt ends the run with a question, and the answer resumes it.
- **DELEGATE:** one subagent per provider, in parallel.

This repository is the live-coding demo of the talk. `main` has the finished code. For every step there is a start branch and a solution branch, so you can type the talk yourself.

```
Angular + CopilotKit (:5180)  ──POST RunAgentInput──▶  AG-UI server (:8930)  ──Chat Completions──▶  llama-server + Gemma 4 (:8080)
  /sse          fetch + @ag-ui/client helpers           /hello  no model, just the protocol
  /copilotkit   CopilotKit over SSE                     /agui   Gemma 4
  /protobuf     CopilotKit over protobuf                /abo    Abo-Killer
  /abo          Abo-Killer                              The Accept header picks SSE or protobuf
```

## Prerequisites

- **Node.js 26.** Tested with 26.4 (see `.nvmrc`). The agent runs its TypeScript directly with Node, without a build step.
- **pnpm 11.5.3.** Any pnpm 11 switches to the version pinned in `package.json`, or run `corepack enable`.
- **llama.cpp:** `llama-server` on your `PATH`, for example with `brew install llama.cpp`.
- **Gemma 4 26B-A4B** as a GGUF file, for example `gemma-4-26B-A4B-it-Q4_K_M.gguf`. Set `GEMMA_GGUF` to its path. Without it, `pnpm llama` looks for `~/Models/gemma-4-26B-A4B/gemma-4-26B-A4B-it-Q4_K_M.gguf`.

## Run it

```bash
pnpm install
```

Then use two terminals:

```bash
pnpm llama     # llama-server with Gemma 4 on :8080
```

```bash
pnpm dev       # the agent on :8930 and the Angular app on :5180
```

Open http://localhost:5180.

| Port | What | Start it alone |
|---|---|---|
| 8080 | `llama-server` with Gemma 4 | `pnpm llama` |
| 8930 | AG-UI server, `apps/agent` | `pnpm agent` (`nx run agent:serve`) |
| 5180 | Angular app, `apps/web` | `pnpm web` (`nx run web:serve`) |

The routes of the Angular app:

| Route | What it shows | Agent |
|---|---|---|
| `/sse` | A client without CopilotKit: POST a `RunAgentInput`, read the events with `@ag-ui/client` | `/agui` or `/hello` |
| `/copilotkit` | CopilotKit's chat over SSE. Gemma's reasoning shows up without any code for it | `/agui` |
| `/protobuf` | The same chat over protobuf | `/agui` |
| `/abo` | Abo-Killer: SEE, ASK, DECIDE, DELEGATE | `/abo` |

Both servers watch their files: the agent restarts (`node --watch`) and Angular reloads when you save.

### Checks

```bash
pnpm smoke                   # POST /agui over SSE and validate every event (needs llama-server)
pnpm smoke /hello --proto    # /hello over protobuf, no model needed
pnpm typecheck               # nx run-many -t typecheck
pnpm build                   # nx run-many -t build
```

## The steps of the talk

Every step has a branch pair. The start branch is what the audience sees, and the solution branch has the step typed in. The start of a step is the same commit as the solution of the step before, so you can type on without switching branches.

| Step | Slide | Branches | Files |
|---|---|---|---|
| 1 | Step 1 · Backend With the AG-UI Libraries | `01-backend-start` → `01-backend-solution` | `apps/agent/src/hello.ts`, `apps/agent/src/server.ts` |
| 2 | Step 2 · The Gemma Agent | none, runs on `01-backend-solution` | `apps/agent/src/agent.ts`, `apps/agent/src/turn.ts` (read only) |
| 3 | Step 3 · A Client Without CopilotKit | `03-sse-client-start` → `03-sse-client-solution` | `apps/web/src/app/examples/sse-client.ts` |
| 4 | Step 4 · CopilotKit for Angular | `04-copilotkit-start` → `04-copilotkit-solution` | `apps/web/src/app/app.config.ts`, `apps/web/src/app/examples/copilot-page.ts` |
| 5 | Step 5 · The Same Chat Over Protobuf | `05-protobuf-start` → `05-protobuf-solution` | `apps/web/src/app/app.config.ts`, `apps/web/src/app/protobuf-http-agent.ts`, `apps/agent/src/server.ts` (the guard) |
| 6 | SEE · The Tool Reports Its Progress | `06-see-start` → `06-see-solution` | `apps/agent/src/abo/scan.ts`, `apps/web/src/app/abo/abo-page.ts` |
| 7 | ASK · The UI Offers a Tool | `07-ask-start` → `07-ask-solution` | `apps/web/src/app/abo/abo-page.ts` |
| 8 | DECIDE · End the Run With a Question | `08-decide-start` → `08-decide-solution` | `apps/agent/src/abo/agent.ts`, `apps/web/src/app/abo/abo-page.ts`, `apps/web/src/app/abo/approval-card.ts` |
| 9 | DELEGATE · A Lane Is Just Activity | `09-delegate-start` → `09-delegate-solution` | `apps/agent/src/abo/agent.ts`, `apps/web/src/app/abo/abo-page.ts` |

### Type a step yourself

1. Switch to the start branch, and start the servers if they aren't running:

   ```bash
   git switch 03-sse-client-start
   pnpm install
   pnpm llama     # terminal 1
   pnpm dev       # terminal 2
   ```

2. Open the files from the table. Where the step goes, you find two arrows:

   ```ts
   // ▶ step 3: POST a RunAgentInput, read the events with @ag-ui/client
   // ◀ step 3
   ```

   Type the code between them, and delete any placeholder line in between (in templates the arrows are `<!-- … -->` comments).

3. Compare with the solution:

   ```bash
   git diff --stat 03-sse-client-solution    # no output: you typed exactly the solution
   git diff 03-sse-client-solution           # what is still different
   ```

4. Stuck? Take the solution. This discards what you typed:

   ```bash
   git switch -f 03-sse-client-solution
   ```

   `03-sse-client-solution` is the same commit as `04-copilotkit-start`, so you can go on with step 4 right there.

`git log --oneline 09-delegate-solution` shows the whole course, one commit per step. `main` has the complete code, where the steps are marked with `@live` comments. The step branches are generated from those markers (see [Maintaining the steps](#maintaining-the-steps)).

## Abo-Killer without a browser

`abo-flow` plays the whole flow the way the Angular app does, with `@ag-ui/client`, and prints the events of every run. It needs the agent and `llama-server` running.

- **Run 1:** `scan_statements` (SEE), then `choose_subscriptions` with the agent's proposal (ASK).
- **Run 2:** `send_cancellations` ends with an interrupt (DECIDE).
- **Run 3:** resumes with "approved": one subagent per provider (DELEGATE), then a summary.

```bash
pnpm nx run agent:abo-flow
```

Add `--record <dir>` to also write each run's events to `<dir>/abo-run-1.jsonl`, `abo-run-2.jsonl` and `abo-run-3.jsonl`. A relative directory is resolved against the repository root, and `recordings/` is gitignored:

```bash
pnpm nx run agent:abo-flow --record recordings
```

`pnpm abo-flow` is the same command. Set `AGENT_URL` to play against another agent.

## Settings

| Variable | Default | Used by |
|---|---|---|
| `GEMMA_GGUF` | `~/Models/gemma-4-26B-A4B/gemma-4-26B-A4B-it-Q4_K_M.gguf` | `pnpm llama` |
| `REASONING_BUDGET` | `-1` (unlimited) | `pnpm llama`. Gemma 4 can think for over 1,000 tokens; `512` keeps answers quick |
| `LLAMA_URL` | `http://127.0.0.1:8080` | agent |
| `PORT` | `8930` | agent |
| `AGENT_URL` | `http://localhost:8930` (smoke), `http://localhost:8930/abo` (abo-flow) | `smoke`, `abo-flow` |

## Version pins

- `@ag-ui/core`, `@ag-ui/client`, `@ag-ui/encoder` and `@ag-ui/proto` are pinned to exactly **0.0.59**, the version `@copilotkit/angular` **0.5.2** depends on.
- `@copilotkit/angular` 0.5.2 needs Angular 22 and TypeScript ~6.0. zod stays on 3.25.76.
- SDK 0.0.59's protobuf binding can't encode reasoning, activity or tool-result events, so the server skips them on protobuf and logs a warning. Rich features stay on SSE.

## Maintaining the steps

For the speaker, on `main`. The `live` commands also work on a step branch: there they read the steps from `main` and keep the arrows, so after `pnpm live:solve 4` on `04-copilotkit-start`, `git diff --stat 04-copilotkit-solution` shows nothing.

| Command | What it does |
|---|---|
| `pnpm live:reset` | Opens every step (the arrows) and saves the solution in `tools/live/.solution/` |
| `pnpm live:solve 3` | Puts step 3 back (`all` for every step) |
| `pnpm live:status` | Which steps are open |
| `pnpm live show 3` | Prints the code of step 3 |
| `pnpm live:done` | Restores the complete solution |
| `pnpm steps:generate` | Rebuilds the step commits and branches from the last commit on `main` |
| `pnpm steps:verify` | Checks every branch pair: the diff is exactly the step's code, typecheck and build pass, `/hello` answers |

## License

[MIT](LICENSE)
