import React from "react";

type StepStatus = "pending" | "active" | "done" | "error";

type Step = {
  id: string;
  title: string;
  detail: string;
  status: StepStatus;
};

type LogLine = {
  id: string;
  ts: string;
  meta: string;
  message: string;
};

type Hit = {
  title: string;
  snippet: string;
  url: string;
};

type ManusProgress = {
  status: string;
  taskId?: string;
  taskUrl?: string;
  messages: { id: string; role: string; text: string }[];
};

const stepsTemplate: Step[] = [
  { id: "understand", title: "Understand request", detail: "Frame the task with the LLM", status: "pending" },
  { id: "plan", title: "Plan search", detail: "Draft queries and sources", status: "pending" },
  { id: "search", title: "Search web", detail: "Execute web queries", status: "pending" },
  { id: "synthesize", title: "Synthesize", detail: "Summarize findings", status: "pending" },
];

const suggestions = [
  "Best cafes to work from in Berlin with Wi-Fi speed details",
  "Find tutorials to learn Rust for building CLI tools",
  "Summarize how to start containerizing a Python API with security best practices",
];

const DEFAULT_MANUS_BASE = "https://api.manus.ai";
const DEFAULT_MANUS_TASKS = {
  create: "/v1/tasks",
  get: (id: string) => `/v1/tasks/${id}`,
};
const DEFAULT_MANUS_AGENT = "manus-1.6";
const DEFAULT_MANUS_SYSTEM_PROMPT =
  "You are a social web researcher. Search and summarize signals from social platforms (Reddit, Twitter/X, Facebook groups, YouTube comments) and user conversations. Focus on lived experience, opinions, comparisons, and sentiment-not official marketing copy. Return the most relevant links/posts and a concise synthesis of what people are saying. Be brief, avoid fluff, and prioritize recency and credibility.";
const DEFAULT_MANUS_POLL_INTERVAL = 2000;
const DEFAULT_MANUS_MAX_POLL_MS = 10 * 60 * 1000; // 10 minutes

function useManusConfig() {
  const base = (import.meta.env.DEV ? "/manus" : DEFAULT_MANUS_BASE).replace(/\/$/, "");
  return {
    key: import.meta.env.VITE_MANUS_API_KEY || "",
    base,
    enabled: true,
    agentProfile: DEFAULT_MANUS_AGENT,
    systemPrompt: DEFAULT_MANUS_SYSTEM_PROMPT,
    taskPaths: {
      create: DEFAULT_MANUS_TASKS.create,
      get: DEFAULT_MANUS_TASKS.get(":id"),
    },
    pollIntervalMs: DEFAULT_MANUS_POLL_INTERVAL,
    maxPollMs: DEFAULT_MANUS_MAX_POLL_MS,
  };
}

function formatElapsed(ms: number) {
  const mins = Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor((ms % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}

export default function App() {
  const manusConfig = useManusConfig();
  const useManus = manusConfig.enabled && !!manusConfig.key;

  const [query, setQuery] = React.useState("");
  const [steps, setSteps] = React.useState<Step[]>(() => stepsTemplate.map((s) => ({ ...s })));
  const [logs, setLogs] = React.useState<LogLine[]>([]);
  const [results, setResults] = React.useState<Hit[]>([]);
  const [summary, setSummary] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [manusProgress, setManusProgress] = React.useState<ManusProgress>({
    status: "idle",
    messages: [],
  });

  const startRef = React.useRef<number | null>(null);

  const appendLog = React.useCallback((message: string, meta = "") => {
    setLogs((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        ts: new Date().toLocaleTimeString(),
        meta,
        message,
      },
    ]);
  }, []);

  React.useEffect(() => {
    appendLog(
      useManus ? `Manus enabled (base ${manusConfig.base}).` : "Manus disabled or key missing; demo mode.",
      "mode"
    );
    if (useManus) {
      appendLog("Using Manus system prompt tailored for social browsing.", "manus");
    }
  }, [appendLog, manusConfig.base, useManus]);

  React.useEffect(() => {
    if (!running || !startRef.current) {
      setElapsed(0);
      return;
    }
    const id = window.setInterval(() => {
      if (startRef.current) setElapsed(Date.now() - startRef.current);
    }, 200);
    return () => window.clearInterval(id);
  }, [running]);

  const resetUI = React.useCallback(() => {
    setSteps(stepsTemplate.map((s) => ({ ...s })));
    setLogs([]);
    setResults([]);
    setSummary("");
    setElapsed(0);
    setManusProgress({ status: "idle", messages: [] });
  }, []);

  const setStep = React.useCallback((id: string, status: StepStatus, detail?: string) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === id ? { ...step, status, detail: detail ?? step.detail } : step
      )
    );
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) return;
    if (!query.trim()) return;
    resetUI();
    setRunning(true);
    startRef.current = Date.now();
    try {
      await runAgent(query.trim());
    } finally {
      setRunning(false);
    }
  }

  async function runAgent(userQuery: string) {
    appendLog(`User: "${userQuery}"`, "input");
    try {
      // Step 1: understand
      setStep("understand", "active");
      const framed = await frameWithLLM(userQuery, useManus, manusConfig, appendLog);
      setStep("understand", "done", framed.intent);
      appendLog(`LLM framing: ${framed.intent}`, useManus ? "manus" : "llm");

      // Step 2: plan
      setStep("plan", "active");
      const plan = buildPlan(framed, userQuery);
      setStep("plan", "done", `Queries: ${plan.queries.join(" | ")}`);
      appendLog(`Planned search queries: ${plan.queries.join(" | ")}`, "agent");

      // Step 3: search
      setStep("search", "active");
      if (useManus) {
        const taskResult = await runManusTask(userQuery, manusConfig, appendLog, (partial) => {
          const synthesized = extractManusOutput(partial);
          setSummary(synthesized.summary);
          setResults(synthesized.cards);
          setManusProgress({
            status: partial.status || "running",
            taskId: partial.id,
            taskUrl: partial.metadata?.task_url || partial.metadata?.taskUrl,
            messages: extractManusMessages(partial),
          });
        });
        const synthesized = extractManusOutput(taskResult);
        setSummary(synthesized.summary);
        setResults(synthesized.cards);
        setManusProgress({
          status: taskResult.status || "completed",
          taskId: taskResult.id,
          taskUrl: taskResult.metadata?.task_url || taskResult.metadata?.taskUrl,
          messages: extractManusMessages(taskResult),
        });
        setStep("search", "done", "Manus task completed");
        setStep("synthesize", "done", "Summary ready");
        appendLog("Generated synthesis via Manus task.", "manus");
      } else {
        const collected: { query: string; hits: Hit[] }[] = [];
        for (const q of plan.queries) {
          appendLog(`Searching: ${q}`, "web");
          const hits = await searchWeb(q, manusConfig, appendLog);
          collected.push({ query: q, hits });
          setResults(collected.flatMap((c) => c.hits));
        }
        const totalHits = collected.reduce((acc, c) => acc + c.hits.length, 0);
        setStep("search", "done", `${totalHits} total hits`);

        // Step 4: synthesize
        setStep("synthesize", "active");
        const synth = await synthesizeWithLLM(collected, framed, manusConfig, appendLog);
        setSummary(synth);
        setStep("synthesize", "done", "Summary ready");
        appendLog("Generated short synthesis for the user.", "llm");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      appendLog(`Agent error: ${message}`, "error");
      setStep("synthesize", "error", "Failed to complete");
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__badges">
          <span className="pill pill--ghost">LLM + Agent</span>
          <span className="pill pill--ghost">Web Search Wrapper</span>
        </div>
        <h1>Manus Web Agent Console</h1>
        <p className="subtitle">
          Drive a Manus-style agent that thinks, searches, and shows its background process while it
          works.
        </p>
      </header>

      <main className="grid">
        <section className="panel panel--primary">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Search orchestrator</p>
              <h2>Ask a question</h2>
              <p className="muted">
                The agent will reason about the request, craft searches, fetch results, and
                synthesize a brief.
              </p>
            </div>
            <div className="status-dot">{running ? "running" : useManus ? "Manus" : "demo"}</div>
          </div>

          <form className="form" onSubmit={handleSubmit}>
            <label className="label" htmlFor="query-input">
              What should the agent look up?
            </label>
            <div className="input-row">
              <input
                id="query-input"
                name="query"
                type="text"
                placeholder="e.g. Compare the newest MacBook Air vs Dell XPS 13 for remote work"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                required
              />
              <button type="submit" className="button" disabled={running}>
                {running ? "Working..." : "Run agent"}
              </button>
            </div>
          </form>

          <div className="chips">
            {suggestions.map((text) => (
              <button key={text} className="chip" onClick={() => setQuery(text)}>
                {text}
              </button>
            ))}
          </div>

          <div className="progress">
            {steps.map((step) => (
              <div
                key={step.id}
                className={[
                  "step",
                  step.status === "active" ? "step--active" : "",
                  step.status === "done" ? "step--done" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <p className="step__title">{step.title}</p>
                <div className="step__status">
                  <span className="step__dot" />
                  <span>
                    {step.status === "pending"
                      ? "pending"
                      : step.status === "active"
                      ? "in progress"
                      : step.status === "done"
                      ? "complete"
                      : "error"}
                  </span>
                </div>
                <p className="step__detail">{step.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {useManus && (
          <section className="panel panel--wide">
            <div className="panel__header panel__header--tight">
              <div>
                <p className="eyebrow">Manus activity</p>
                <h3>Live task</h3>
              </div>
              <div className="pill pill--ghost">
                {manusProgress.status}
                {manusProgress.taskUrl ? (
                  <a
                    style={{ marginLeft: 8, color: "var(--accent)", textDecoration: "none" }}
                    href={manusProgress.taskUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    open
                  </a>
                ) : null}
              </div>
            </div>
            <div className="results results--stack">
              {manusProgress.messages.length === 0 ? (
                <p className="muted">Waiting for Manus task output...</p>
              ) : (
                manusProgress.messages.map((m) => (
                  <div key={m.id} className="result-card">
                    <h4>{m.role}</h4>
                    <div className="markdown">{renderMarkdown(m.text)}</div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        <section className="panel panel--wide">
          <div className="panel__header panel__header--tight">
            <div>
              <p className="eyebrow">Background process</p>
              <h3>Agent trace</h3>
            </div>
            <div className="pill pill--ghost">{formatElapsed(elapsed)}</div>
          </div>
          <div className="log">
            {logs.length === 0 ? (
              <p className="muted">No trace yet. Submit a query to watch the agent work.</p>
            ) : (
              logs.map((line) => (
                <p key={line.id} className="log__line">
                  <span className="log__meta">[{line.ts}] {line.meta}</span>
                  <br />
                  {line.message}
                </p>
              ))
            )}
          </div>
        </section>

      </main>
    </div>
  );
}

async function frameWithLLM(
  query: string,
  useManus: boolean,
  manusConfig: ReturnType<typeof useManusConfig>,
  appendLog: (message: string, meta?: string) => void
) {
  if (!useManus) return pseudoLLMFrame(query);
  appendLog("Delegating framing to Manus task API.", "manus");
  // We will let the Manus task handle the full workflow; use a simple intent here.
  return { intent: "Delegated to Manus agent", queries: [] };
}

function manusHeaders(manusConfig: ReturnType<typeof useManusConfig>) {
  return {
    "Content-Type": "application/json",
    API_KEY: manusConfig.key,
  };
}

async function searchWeb(
  query: string,
  manusConfig: ReturnType<typeof useManusConfig>,
  appendLog: (message: string, meta?: string) => void
): Promise<Hit[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const hits = extractDuckDuckGo(data, query);
    if (!hits.length) throw new Error("No hits returned");
    return hits;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown web search error";
    appendLog(`Search fallback for "${query}" (${message})`, "offline");
    return fallbackResults(query);
  }
}

function extractDuckDuckGo(data: any, query: string): Hit[] {
  const topics = data.RelatedTopics || [];
  return topics
    .slice(0, 4)
    .map((topic: any) => {
      const text = topic.Text || "";
      const parts = text.split(" - ");
      return {
        title: parts[0] || query,
        snippet: parts.slice(1).join(" - ") || "No snippet available",
        url: topic.FirstURL || "#",
      };
    })
    .filter((r: Hit) => r.url !== "#");
}

function fallbackResults(query: string): Hit[] {
  return [
    {
      title: `Overview for "${query}"`,
      snippet: "Simulated hit: this is a placeholder when live search is unavailable.",
      url: "#",
    },
    {
      title: "How-to and best practices",
      snippet: "Offline mode: replace this with real search results when networking is enabled.",
      url: "#",
    },
  ];
}

async function synthesizeWithLLM(
  collected: { query: string; hits: Hit[] }[],
  framed: { intent: string },
  manusConfig: ReturnType<typeof useManusConfig>,
  appendLog: (message: string, meta?: string) => void
) {
  return synthesizeLocally(collected, framed);
}

function synthesizeLocally(collected: { hits: Hit[] }[], framed: { intent: string }) {
  const total = collected.reduce((acc, c) => acc + c.hits.length, 0);
  const first = collected[0]?.hits[0]?.title || "the top sources";
  return `${framed.intent}. Collected ${total} documents; starting from ${first}, the agent suggests reviewing the listed sources for depth.`;
}

async function pseudoLLMFrame(query: string) {
  await wait(350);
  const action = query.toLowerCase().includes("compare")
    ? "compare options and surface pros/cons"
    : query.toLowerCase().includes("how")
    ? "outline steps and relevant guides"
    : "surface the most credible sources";
  return {
    intent: `Goal: ${action}`,
    queries: [],
  };
}

function buildPlan(framed: { queries?: string[] }, baseQuery: string) {
  const seed = framed.queries?.length ? framed.queries.join(" ") : baseQuery.trim();
  const terms = seed.split(" ").slice(0, 6).join(" ");
  const variants = framed.queries?.length
    ? framed.queries
    : [`${terms} latest information`, `${terms} expert review`, `${terms} statistics`];
  return { queries: variants };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runManusTask(
  prompt: string,
  manusConfig: ReturnType<typeof useManusConfig>,
  appendLog: (message: string, meta?: string) => void,
  onProgress?: (data: any) => void
) {
  const createUrl = `${manusConfig.base}${manusConfig.taskPaths.create}`;
  const payload = {
    prompt: buildManusPrompt(prompt, manusConfig),
    agentProfile: manusConfig.agentProfile,
    taskMode: "agent",
    hideInTaskList: true,
  };

  appendLog("Creating Manus task...", "manus");
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: manusHeaders(manusConfig),
    body: JSON.stringify(payload),
  });
  if (!createRes.ok) throw new Error(`Create task failed: HTTP ${createRes.status}`);
  const createData = await createRes.json();
  const taskId = createData.task_id || createData.taskId || createData.id;
  if (!taskId) throw new Error("Create task succeeded but no task id returned");

  appendLog(`Task created: ${taskId}. Polling for completion...`, "manus");
  const start = Date.now();
  while (Date.now() - start < manusConfig.maxPollMs) {
    await wait(manusConfig.pollIntervalMs);
    const url = `${manusConfig.base}${resolveTaskGetPath(manusConfig.taskPaths.get, taskId)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: manusHeaders(manusConfig),
    });
    if (!res.ok) {
      appendLog(`Poll failed (HTTP ${res.status}); continuing`, "manus");
      continue;
    }
    const data = await res.json();
    if (onProgress) onProgress(data);
    if (data.status && data.status !== "running" && data.status !== "pending") {
      appendLog(`Task status: ${data.status}`, "manus");
    }
    if (data.status === "completed") {
      appendLog("Task completed.", "manus");
      return data;
    }
    if (data.status === "failed") {
      const err = data.error || "Task failed";
      throw new Error(err);
    }
  }
  throw new Error("Manus task polling timed out");
}

function resolveTaskGetPath(template: string, taskId: string) {
  return template.replace(":id", taskId);
}

function extractManusOutput(task: any): { summary: string; cards: Hit[] } {
  const outputs: any[] = task?.output || [];
  const text = outputs
    .flatMap((o) => o?.content || [])
    .map((c: any) => c?.text)
    .filter(Boolean)
    .join("\n\n");
  const summary =
    text ||
    task?.instructions ||
    "Manus task completed, but no textual output was provided. Check your Manus configuration.";
  const card: Hit = {
    title: "Manus agent result",
    snippet: summary.slice(0, 240) + (summary.length > 240 ? "..." : ""),
    url: task?.task_url || task?.taskUrl || "#",
  };
  return { summary, cards: [card] };
}

function extractManusMessages(task: any): { id: string; role: string; text: string }[] {
  const outputs: any[] = task?.output || [];
  return outputs.map((o) => {
    const text = (o?.content || [])
      .map((c: any) => c?.text)
      .filter(Boolean)
      .join(" ")
      .trim();
    return { id: o?.id || Math.random().toString(), role: o?.role || "message", text };
  });
}

function buildManusPrompt(userQuery: string, manusConfig: ReturnType<typeof useManusConfig>) {
  return `${manusConfig.systemPrompt}\n\nUser query: ${userQuery}\n\nInstructions: Prioritize social platform content (Reddit, Twitter/X, Facebook groups, YouTube comments). Provide the top relevant links/posts and a concise synthesis of opinions and comparisons. Keep it brief and actionable.`;
}

function renderMarkdown(text: string) {
  if (!text) return null;
  const blocks = text.split(/\n{2,}/g);
  return blocks.map((block, blockIndex) => {
    const lines = block.split("\n");
    const isList = lines.every((line) => /^[-*]\s+/.test(line));
    if (isList) {
      return (
        <ul key={`md-list-${blockIndex}`}>
          {lines.map((line, idx) => (
            <li key={`md-li-${blockIndex}-${idx}`}>{renderInline(line.replace(/^[-*]\s+/, ""))}</li>
          ))}
        </ul>
      );
    }
    const headingMatch = block.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const HeadingTag = level <= 2 ? "h4" : "h5";
      return <HeadingTag key={`md-h-${blockIndex}`}>{renderInline(content)}</HeadingTag>;
    }
    return (
      <p key={`md-p-${blockIndex}`} className="markdown__paragraph">
        {renderInline(block)}
      </p>
    );
  });
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return parts
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={`md-strong-${index}`}>{part.slice(2, -2)}</strong>;
      }
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        return (
          <a key={`md-link-${index}`} href={href} target="_blank" rel="noreferrer">
            {label}
          </a>
        );
      }
      return <React.Fragment key={`md-text-${index}`}>{part}</React.Fragment>;
    });
}
