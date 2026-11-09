// Every narration line in the edit, by id, written for the ear (numbers in words, acronyms dotted,
// names respelled where Kokoro misreads them). Scenes place these by id; measure.ts voices each one and
// writes its spoken length to vo-lengths.json, and every beat is held for at least its line.
// Respellings: "Reddis" (Redis), "oh-embed" (oEmbed), "exe dot dev", "Nest J.S.", "Bull M.Q.",
// "x A.I." (xAI), "P.N.P.M." (pnpm), "system D" (systemd), "codex exec" stays as written.
export const SCRIPT: Record<string, string> = {
  // ---------------------------------------------------------------- hook
  h1: 'This is News Digest. Every line of its code was written by an A.I. agent.',
  h3: 'One Codex agent, on one exe dot dev V.M., paid for by a hundred-dollar-a-month ChatGPT subscription.',
  h4: 'It picks the next task, writes the code, tests it, ships it, and starts again. A closed loop. We only steer.',
  h5: 'And it is fast: about two hundred iterations, and two hundred commits, every single day.',
  h6: 'Nine days in, that’s over fifteen hundred commits, and ninety thousand lines of TypeScript.',

  // ---------------------------------------------------------------- product, briefly
  title: 'First, the product, in thirty seconds.',
  p1: 'Every morning at seven, it publishes an edition: for each topic, a short brief, the top stories, and the most interesting posts from X and Bluesky.',
  p3: 'Behind it, an admin console tracks sources, spend, and what every edition cost.',
  p4: 'That’s the product. Now for the interesting part: how it gets built.',

  // ---------------------------------------------------------------- the factory: overview
  f1a: 'Here’s the whole factory. It lives on one V.M., right next to the app it builds.',
  f1c: 'A system D unit runs the supervisor, a plain bash loop. Each pass, it pulls main, renders a prompt, and runs codex exec, headless.',
  f1d: 'Codex edits the code, runs the tests, commits, pushes, and restarts the live services.',
  f1e: 'Its model calls go through the exe dot dev L.L.M. gateway, onto the ChatGPT subscription.',
  f1f: 'Then it checks the live app, and picks its next task. Build, ship, observe, repeat: a closed loop.',
  f1g: 'The only way in for humans is the repo itself. We steer by pushing to GitHub.',

  // ---------------------------------------------------------------- fresh sessions
  f2a: 'The key design decision: there is no long-running chat.',
  f2b: 'Every iteration is a brand-new Codex session, with an empty context window. Memory lives in files and git history.',
  f2d: 'The one thing carried forward is a ten-line summary, handed from each iteration to the next.',
  f2e: 'So context never rots, a crash costs at most one step, and any iteration can be replayed from its prompt.',

  // ---------------------------------------------------------------- the loop
  f3a: 'Here’s one iteration. After a stop-file check and a pacing check, it pulls main, renders the prompt, and runs Codex, with a seventy-five minute timeout.',
  f3e: 'Then it classifies the result from the C.L.I.’s event stream, never from the agent’s own words.',
  f3f: 'It reverts any edit to owner files, pushes, health-checks every service, and records token usage.',
  f3g: 'Crashes and timeouts retry in five minutes. A quota wall waits for the reset. An expired login retries every fifteen.',

  // ---------------------------------------------------------------- the prompt
  f4b: 'Every iteration gets the same short prompt. Orient cheaply: the steering file, the open tasks, and the tail of the progress log.',
  f4c: 'Fix broken things first: failing tests, crashed services, a stalled source, a failed edition.',
  f4d: 'Otherwise, do one meaningful, verified step: typecheck, lint, tests, and Playwright for anything visual. Then commit, push, and restart.',
  f4f: 'Only two slots change from run to run: a budget line, and the previous iteration’s summary.',

  // ---------------------------------------------------------------- velocity
  v1: 'And that loop is fast. A typical iteration takes about eight minutes, end to end.',
  v2: 'So the factory runs about two hundred iterations a day, and lands about two hundred commits a day.',
  v3: 'That’s one shipped change roughly every seven minutes, all day and all night, weekends included.',
  v4: 'Tens of thousands of lines change every day, and every iteration deploys its own work to the live app.',

  // ---------------------------------------------------------------- memory files
  f5b: 'The repo’s files form a chain of command. The mission is the product vision. The steering file holds current priorities, and overrides it.',
  f5d: 'The agent keeps its own task list and progress log. Owner files are protected: if it edits the mission, the supervisor reverts it.',
  f5e: 'In the steering file, the agent may only append acks, and tidy the ranked list. It never reorders it.',

  // ---------------------------------------------------------------- steering
  f6a: 'So how do we steer? Mostly through lead sessions: Claude Code, running on a laptop.',
  f6b: 'A lead session reads the agent’s logs, reviews the morning’s edition, and finds the real cause of what’s wrong.',
  f6c: 'It proposes steering. The owner approves. It goes into steering dot M.D., and gets pushed.',
  f6d: 'Within minutes, the next iteration pulls it, re-ranks its tasks, and starts. When it’s done, it appends an ack.',
  f6f: 'That closes the loop. Humans set direction. The factory does the building.',

  // ---------------------------------------------------------------- github footage
  f7a: 'Here’s the real steering file. One ranked list at the top, and only the owner changes the ranking.',
  f7b: 'Under each item, the agent’s acks: dated, tied to an iteration, and specific.',
  f7c: 'And here’s the history: a new commit every few minutes, all day and all night.',


  // ---------------------------------------------------------------- quota pacing
  f9a: 'Now, the economics. The hundred-dollar plan has a weekly limit, not unlimited tokens.',
  f9b: 'On day one, the agent burned straight through it, and hit the quota wall over a hundred times in two days.',
  f9c: 'So the supervisor budgets it. Before each iteration, it compares the quota used with how much of the week has passed.',
  f9d: 'If usage runs more than ten points ahead, it waits, up to an hour, then runs one iteration anyway, so it never stalls.',
  f9e: 'The effect: it works its way down the weekly limit gradually, instead of burning it in a day and idling for six.',
  f9f: 'Each prompt also carries a budget line, so the agent knows when to economize: capped output, narrow reads, smaller steps.',
  f9g: 'In eight days, the agent has read two point four billion tokens, ninety-seven percent from cache, and written nearly nine million.',
  f9h: 'The plan’s fee for those days is about twenty-six dollars. That’s roughly a cent per million tokens, and under two cents per commit.',

  // ---------------------------------------------------------------- guardrails
  f10a: 'Hard guardrails live outside the model. Tests never call paid A.P.I.s, and one command, P.N.P.M. check, gates every commit.',

  // ---------------------------------------------------------------- evidence
  f11a: 'It checks its own UI, too: over a thousand Playwright screenshots, committed to the repo, light and dark, desktop and mobile.',
  f12a: 'And it runs its own observability, including a Grafana dashboard just for the agent: iterations, exit codes, and quota.',

  // ---------------------------------------------------------------- under the hood
  a1b: 'Now, the product. It’s TypeScript end to end. A Nest J.S. A.P.I. serves a React app, and a separate worker process runs every job.',
  a1c: 'Postgres seventeen and Reddis seven run in Docker, bound to loopback. Everything else is a system D user unit.',
  a1d: 'Outside calls reach feeds, Hacker News, Anthropic, x A.I., and X’s embed service, all through ports.',

  a2a: 'Collection runs all day on Bull M.Q. queues: feeds and Hacker News every thirty minutes, and X links every hour, each verified through oh-embed.',
  a2c: 'Just before seven, a capped x A.I. search looks for viral posts the news hasn’t reached yet.',

  a3b: 'Each topic runs in parallel. Hundreds of candidate articles meet cheap rules first: no A.I., just quality filters.',
  a3c: 'Haiku triages the survivors in batches of fifty, four at a time, cached per item, so a rerun only pays for new articles.',
  a3d: 'The top forty are grouped into stories by A.I., never by keyword rules. Ten go to the editor.',
  a3e: 'Sonnet picks the stories and writes the brief. Its output is schema-checked, and any story without a real source is rejected.',
  a3g: 'The result is one immutable snapshot. And if the budget runs out, a topic falls back to non-A.I. ranking. The edition still ships.',

  a4a: 'The product’s A.I. has its own budget, completely separate from the coding plan.',
  a4b: 'Haiku triages and Sonnet edits, inside an Anthropic workspace with a hard fifteen-dollar monthly limit.',
  a4c: 'In the app, that becomes fourteen dollars a month, at most a dollar a day, with Sonnet capped at eighty percent of each day.',
  a4d: 'Grok’s X search runs on a fifteen-dollar prepaid x A.I. balance, capped at forty cents a day and twelve dollars a month.',
  a4e: 'Every call first reserves its worst-case cost in a Postgres ledger, under a lock. Over a cap, it’s refused, and the fallback runs.',
  a4f: 'A morning edition costs about thirty cents of A.I., and its share of the day is held in reserve until it has run.',


  a6a: 'Observability is self-hosted on the same V.M.: logs, metrics and alerts, with ten Grafana dashboards the agent built and maintains.',

  // ---------------------------------------------------------------- end
  end: 'One V.M., one agent, one subscription, and a steering file. That’s the factory behind News Digest.',
};
