import React from "react";

type LogLine = {
  id: string;
  ts: string;
  meta: string;
  message: string;
};

type ManusProgress = {
  status: string;
  taskId?: string;
  taskUrl?: string;
  messages: { id: string; role: string; text: string }[];
};

type ReaderProfile = {
  location: string;
  topics: string;
};

type NewsCategory = "Local" | "International" | "Interest" | "Social" | "Other";

type NewsItem = {
  title: string;
  summary: string;
  url?: string;
  source?: string;
  category: NewsCategory;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  tags?: string[];
};

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
const PROFILE_STORAGE_KEY = "manus.reader.profile";
const CACHE_STORAGE_KEY = "manus.news.cache";
const NEWS_MEDIA_PER_PAGE = 2;
const NEWS_TEXT_PER_PAGE = 3;

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

function loadProfile(): ReaderProfile | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.topics === "string") {
      return {
        location: parsed.location || "",
        topics: parsed.topics || "",
      };
    }
  } catch {
    return null;
  }
  return null;
}

function saveProfile(profile: ReaderProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

function loadCachedBrief(): { summary: string; items: NewsItem[] } | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(CACHE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.summary === "string" && Array.isArray(parsed?.items)) {
      return { summary: parsed.summary, items: parsed.items };
    }
  } catch {
    return null;
  }
  return null;
}

function saveCachedBrief(payload: { summary: string; items: NewsItem[]; updatedAt: string }) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(payload));
}

export default function App() {
  const manusConfig = useManusConfig();
  const useManus = manusConfig.enabled && !!manusConfig.key;

  const [profile, setProfile] = React.useState<ReaderProfile | null>(() => loadProfile());
  const [draft, setDraft] = React.useState<ReaderProfile>(() =>
    profile ? { ...profile } : { location: "", topics: "" }
  );
  const [showOnboarding, setShowOnboarding] = React.useState(() => !profile);
  const [brief, setBrief] = React.useState("");
  const [stories, setStories] = React.useState<NewsItem[]>([]);
  const [running, setRunning] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [lastUpdated, setLastUpdated] = React.useState<string | null>(null);
  const [logs, setLogs] = React.useState<LogLine[]>([]);
  const [page, setPage] = React.useState(1);
  const [manusProgress, setManusProgress] = React.useState<ManusProgress>({
    status: "idle",
    messages: [],
  });
  const useCachedBrief = import.meta.env.VITE_DEMO_MODE === "true";

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
    const mediaPages = Math.ceil(
      stories.filter((story, index) => index > 0 && story.mediaUrl).length / NEWS_MEDIA_PER_PAGE
    );
    const textPages = Math.ceil(
      stories.filter((story, index) => index > 0 && !story.mediaUrl).length / NEWS_TEXT_PER_PAGE
    );
    const totalPages = Math.max(1, Math.max(mediaPages, textPages));
    if (page > totalPages) setPage(totalPages);
  }, [page, stories]);

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

  async function handleOnboardingSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextProfile = {
      location: draft.location.trim(),
      topics: draft.topics.trim(),
    };
    if (!nextProfile.topics) return;
    setProfile(nextProfile);
    saveProfile(nextProfile);
    setShowOnboarding(false);
    await runBrief(nextProfile);
  }

  async function runBrief(nextProfile: ReaderProfile) {
    if (running) return;
    setBrief("");
    setStories([]);
    setLogs([]);
    setPage(1);
    setRunning(true);
    startRef.current = Date.now();
    setManusProgress({ status: useManus ? "running" : "demo", messages: [] });
    appendLog(`Building brief for ${nextProfile.topics}.`, "brief");
    try {
      if (useCachedBrief) {
        const cached = loadCachedBrief();
        if (cached) {
          setBrief(cached.summary);
          setStories(cached.items);
          appendLog("Loaded cached briefing from local storage.", "brief");
          return;
        }
        appendLog("No cached briefing found; running live fetch.", "brief");
      }
      if (!useManus) {
        const demo = buildDemoBrief(nextProfile);
        setBrief(demo.summary);
        const withImages = await generateAiMedia(demo.items, nextProfile, appendLog);
        setStories(withImages);
        saveCachedBrief({ summary: demo.summary, items: withImages, updatedAt: new Date().toISOString() });
        appendLog("Generated demo brief locally.", "demo");
        return;
      }

      const taskResult = await runManusTask(
        buildNewsPrompt(nextProfile, manusConfig),
        manusConfig,
        appendLog,
        (partial) => {
          const parsed = parseNewsText(extractManusText(partial));
          if (parsed.summary) setBrief(parsed.summary);
          if (parsed.items.length) setStories(parsed.items);
          setManusProgress({
            status: partial.status || "running",
            taskId: partial.id,
            taskUrl: partial.metadata?.task_url || partial.metadata?.taskUrl,
            messages: extractManusMessages(partial),
          });
        }
      );

      const fileText = await fetchManusOutputFile(taskResult, appendLog);
      const parsed = parseNewsText(fileText || extractManusText(taskResult));
      setBrief(parsed.summary);
      const withImages = await generateAiMedia(parsed.items, nextProfile, appendLog);
      setStories(withImages);
      saveCachedBrief({ summary: parsed.summary, items: withImages, updatedAt: new Date().toISOString() });
      setManusProgress({
        status: taskResult.status || "completed",
        taskId: taskResult.id,
        taskUrl: taskResult.metadata?.task_url || taskResult.metadata?.taskUrl,
        messages: extractManusMessages(taskResult),
      });
      appendLog("Manus brief ready.", "manus");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown Manus error";
      appendLog(`Brief failed: ${message}`, "error");
    } finally {
      setRunning(false);
      setLastUpdated(new Date().toLocaleString());
    }
  }

  const leadStory = stories[0];
  const extraStories = stories.slice(1);
  const mediaStories = extraStories.filter((story) => story.mediaUrl);
  const textStories = extraStories.filter((story) => !story.mediaUrl);
  const totalPages = Math.max(
    1,
    Math.max(
      Math.ceil(mediaStories.length / NEWS_MEDIA_PER_PAGE),
      Math.ceil(textStories.length / NEWS_TEXT_PER_PAGE)
    )
  );
  const safePage = Math.min(page, totalPages);
  const pagedMedia = getPagedSlice(mediaStories, safePage, totalPages);
  const pagedText = getPagedSlice(textStories, safePage, totalPages);
  const leadSize = getStorySize(leadStory);

  return (
    <div className="page page--news">
      <header className="masthead">
        <div className="masthead__title">
          <p className="eyebrow">Manus Gazette</p>
          <h1>Daily Briefing</h1>
          <p className="subtitle">A personalized newspaper-style roundup of social signals.</p>
        </div>
        {profile && !showOnboarding && (
          <div className="masthead__meta">
            <div>
              <p className="eyebrow">Edition</p>
              <p className="masthead__value">{profile.location || "Global"}</p>
            </div>
            <div>
              <p className="eyebrow">Topics</p>
              <p className="masthead__value">{profile.topics}</p>
            </div>
            <div>
              <p className="eyebrow">Updated</p>
              <p className="masthead__value">{lastUpdated || "—"}</p>
            </div>
          </div>
        )}
      </header>

      <main className="grid">
        {showOnboarding && (
          <section className="panel panel--wide panel--paper">
            <div className="panel__header panel__header--tight">
              <div>
                <p className="eyebrow">Onboarding</p>
                <h3>Set your newsroom desk</h3>
              </div>
            </div>
            <form className="onboarding__form" onSubmit={handleOnboardingSubmit}>
              <label className="field">
                <span>Location focus</span>
                <input
                  type="text"
                  placeholder="Global, Singapore, Bay Area"
                  value={draft.location}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      location: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Topics to track</span>
                <input
                  type="text"
                  placeholder="AI policy, product launches, fintech, consumer tech"
                  value={draft.topics}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      topics: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <div className="onboarding__actions">
                <button className="button button--paper" type="submit" disabled={running}>
                  Start the briefing
                </button>
              </div>
            </form>
          </section>
        )}

        {profile && !showOnboarding && (
          <section className="panel panel--wide panel--paper">
            <div className="panel__header panel__header--tight">
              <div>
                <p className="eyebrow">Front page</p>
                <h3>Your personalized edition</h3>
                <p className="muted">Pulling signals from social chatter and community discussion.</p>
              </div>
              <div className="panel__actions">
                <button
                  className="button button--paper"
                  type="button"
                  onClick={() => profile && runBrief(profile)}
                  disabled={running}
                >
                  {running ? "Gathering" : "Refresh"}
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => {
                    if (profile) {
                      setDraft(profile);
                      setShowOnboarding(true);
                    }
                  }}
                >
                  Update topics
                </button>
              </div>
            </div>

            {running && <p className="muted">Composing your front page... sit tight.</p>}

            <div className="news-layout">
              {!running && leadStory ? (
                <article className={`news-lead ${leadSize}`}>
                  <p className="news-kicker">Lead story</p>
                  {leadStory.mediaUrl && leadStory.mediaType === "image" && (
                    <img className="news-media" src={leadStory.mediaUrl} alt={leadStory.title} />
                  )}
                  {leadStory.mediaUrl && leadStory.mediaType === "video" && (
                    <a className="news-link" href={leadStory.mediaUrl} target="_blank" rel="noreferrer">
                      Watch the clip
                    </a>
                  )}
                  <h4 className="news-lead__title">{leadStory.title}</h4>
                  {leadStory.tags?.length ? (
                    <div className="tag-row">
                      {leadStory.tags.map((tag) => (
                        <span key={`${leadStory.title}-${tag}`} className="chip chip--paper">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="news-lead__summary markdown">
                    {brief ? renderMarkdown(brief) : <p className="muted">No brief yet.</p>}
                  </div>
                  {leadStory.url && (
                    <a className="news-link" href={leadStory.url} target="_blank" rel="noreferrer">
                      Read the source
                    </a>
                  )}
                </article>
              ) : (
                <article className="news-lead news-lead--placeholder">
                  <p className="news-kicker">Lead story</p>
                  <p className="muted">Front page will appear once the briefing completes.</p>
                </article>
              )}

              <div className="news-sections">
                {extraStories.length === 0 ? (
                  <div className="news-card news-card--empty">
                    <p className="muted">Related stories will appear here once the brief is ready.</p>
                  </div>
                ) : (
                  <>
                    <section className="news-section">
                      <h5 className="news-section__title">Secondary stories</h5>
                      <div className="news-section__grid news-section__grid--featured">
                        {pagedMedia.length === 0 ? (
                          <p className="muted">No media-rich stories on this page.</p>
                        ) : (
                          pagedMedia.map((story) => (
                            <article
                              key={`${story.title}-${story.url ?? "story"}`}
                              className="news-card news-card--featured"
                            >
                              {story.mediaUrl && story.mediaType === "image" && (
                                <img className="news-media" src={story.mediaUrl} alt={story.title} />
                              )}
                              {story.mediaUrl && story.mediaType === "video" && (
                                <a className="news-link" href={story.mediaUrl} target="_blank" rel="noreferrer">
                                  Watch the clip
                                </a>
                              )}
                              <h6 className="news-card__title">{story.title}</h6>
                              {story.tags?.length ? (
                                <div className="tag-row">
                                  {story.tags.map((tag) => (
                                    <span key={`${story.title}-${tag}`} className="chip chip--paper">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              <p className="news-card__summary">{story.summary}</p>
                              {story.url && (
                                <a className="news-link" href={story.url} target="_blank" rel="noreferrer">
                                  Source link
                                </a>
                              )}
                            </article>
                          ))
                        )}
                      </div>
                    </section>
                    <section className="news-section">
                      <h5 className="news-section__title">More briefs</h5>
                      <div className="news-section__grid news-section__grid--compact">
                        {pagedText.length === 0 ? (
                          <p className="muted">No additional briefs on this page.</p>
                        ) : (
                          pagedText.map((story) => (
                            <article
                              key={`${story.title}-${story.url ?? "story"}`}
                              className="news-card news-card--compact"
                            >
                              <h6 className="news-card__title">{story.title}</h6>
                              {story.tags?.length ? (
                                <div className="tag-row">
                                  {story.tags.map((tag) => (
                                    <span key={`${story.title}-${tag}`} className="chip chip--paper">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              <p className="news-card__summary">{story.summary}</p>
                              {story.url && (
                                <a className="news-link" href={story.url} target="_blank" rel="noreferrer">
                                  Source link
                                </a>
                              )}
                            </article>
                          ))
                        )}
                      </div>
                    </section>
                  </>
                )}
              </div>
              {totalPages > 1 && (
                <div className="news-pagination">
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={safePage === 1}
                  >
                    Previous page
                  </button>
                  <span className="news-pagination__label">
                    Page {safePage} of {totalPages}
                  </span>
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={safePage === totalPages}
                  >
                    Next page
                  </button>
                </div>
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
              <p className="muted">No trace yet. Start a briefing to watch the agent work.</p>
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

function manusHeaders(manusConfig: ReturnType<typeof useManusConfig>) {
  return {
    "Content-Type": "application/json",
    API_KEY: manusConfig.key,
  };
}

async function runManusTask(
  prompt: string,
  manusConfig: ReturnType<typeof useManusConfig>,
  appendLog: (message: string, meta?: string) => void,
  onProgress?: (data: any) => void
) {
  const createUrl = `${manusConfig.base}${manusConfig.taskPaths.create}`;
  const payload = {
    prompt,
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

function extractManusText(task: any) {
  const outputs: any[] = task?.output || [];
  const assistantOutputs = outputs.filter((o) => o?.role === "assistant");
  const lastAssistant = assistantOutputs[assistantOutputs.length - 1];
  const lastText = (lastAssistant?.content || [])
    .map((c: any) => c?.text)
    .filter(Boolean)
    .join("\n\n");

  if (lastText) return lastText;

  return outputs
    .filter((o) => o?.role !== "user")
    .flatMap((o) => o?.content || [])
    .map((c: any) => c?.text)
    .filter(Boolean)
    .join("\n\n");
}

async function fetchManusOutputFile(task: any, appendLog: (message: string, meta?: string) => void) {
  const outputs: any[] = task?.output || [];
  const fileUrl = outputs
    .flatMap((o) => o?.content || [])
    .map((c: any) => c?.fileUrl)
    .find(Boolean);

  if (!fileUrl) return "";

  try {
    const target = import.meta.env.DEV ? `/manus-file?url=${encodeURIComponent(fileUrl)}` : fileUrl;
    const res = await fetch(target);
    if (!res.ok) {
      appendLog(`Failed to fetch Manus file (${res.status})`, "manus");
      return "";
    }
    const text = await res.text();
    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown file fetch error";
    appendLog(`Manus file fetch error (${message})`, "manus");
    return "";
  }
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

function parseNewsText(text: string): { summary: string; items: NewsItem[] } {
  if (!text) return { summary: "", items: [] };
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const items: NewsItem[] = [];
  const summaryLines: string[] = [];
  let sawBullets = false;

  for (const line of lines) {
    if (/^[-*]\s+/.test(line)) {
      sawBullets = true;
      const item = parseNewsBullet(line);
      if (item) items.push(item);
      continue;
    }
    if (!sawBullets && !line.startsWith("#")) {
      summaryLines.push(line);
    }
  }

  const summary = summaryLines.join(" ").trim();
  const trimmedItems = items.slice(0, 18);
  if (!trimmedItems.length && summary) {
    const title = summary.split(".")[0]?.trim() || "Top story";
    trimmedItems.push({ title, summary, category: "Other", tags: [] });
  }
  return { summary, items: trimmedItems };
}

function parseNewsBullet(line: string): NewsItem | null {
  const cleaned = line.replace(/^[-*]\s+/, "").trim();
  const media = extractMedia(cleaned);
  const cleanedWithoutMedia = media.cleanedText;
  const markdownLink = cleaned.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
  if (markdownLink) {
    const title = markdownLink[1];
    const url = markdownLink[2];
    const summary = cleanedWithoutMedia
      .replace(markdownLink[0], "")
      .replace(/^[-–—:]+\s*/, "")
      .trim();
    const parsed = parseCategory(summary);
    return {
      title,
      summary: parsed.summary || "Details in the linked source.",
      url,
      category: parsed.category,
      mediaUrl: media.mediaUrl,
      mediaType: media.mediaType,
      tags: parsed.tags,
    };
  }

  const urlMatch = cleanedWithoutMedia.match(/https?:\/\/\S+/);
  if (urlMatch) {
    const url = urlMatch[0].replace(/[),.]+$/, "");
    const withoutUrl = cleanedWithoutMedia.replace(urlMatch[0], "").trim();
    const parts = withoutUrl.split(" - ");
    const title = parts[0] || "Source link";
    const summary = parts.slice(1).join(" - ").trim() || "Details in the linked source.";
    const parsed = parseCategory(summary);
    return {
      title,
      summary: parsed.summary,
      url,
      category: parsed.category,
      mediaUrl: media.mediaUrl,
      mediaType: media.mediaType,
      tags: parsed.tags,
    };
  }

  if (!cleanedWithoutMedia) return null;
  const parsed = parseCategory("");
  return {
    title: cleanedWithoutMedia,
    summary: "",
    category: parsed.category,
    mediaUrl: media.mediaUrl,
    mediaType: media.mediaType,
    tags: parsed.tags,
  };
}

function buildNewsPrompt(profile: ReaderProfile, manusConfig: ReturnType<typeof useManusConfig>) {
  const locationLine = profile.location ? `Location: ${profile.location}.` : "Location: Global.";
  return `${manusConfig.systemPrompt}\n\nYou are preparing a newspaper platform daily briefing. Search fast and shallow, prioritizing speed over depth.\n${locationLine}\nUser interests: ${profile.topics}.\n\nCoverage requirements:\n- Local news (based on location)\n- International news\n- User interest topics\n- Social drama and trending chatter (especially from social media)\n- Only include items from the past 7 days\n- Order items from best match to least relevant\n\nReturn:\n1) A 2-3 sentence front-page summary.\n2) 12-18 bullet items formatted as \"- [Title](URL) - category label (Local/International/Interest/Social) + one-sentence summary.\"\n3) Optional tags: add bracketed tags after the category (example: \"Local [Technology, Policy] - ...\").\nPrefer credible, recent sources with direct links so readers can open them.`;
}

function buildDemoBrief(profile: ReaderProfile): { summary: string; items: NewsItem[] } {
  const topics = profile.topics
    .split(",")
    .map((topic) => topic.trim())
    .filter(Boolean);
  const summary = `Tracking ${topics.slice(0, 3).join(", ") || "your topics"} with a social-first lens. Local context: ${
    profile.location || "global"
  }.`;
  const items = topics.slice(0, 6).map((topic, index) => ({
    title: `${topic} watch`,
    summary: `Early chatter highlights emerging themes and differing opinions in ${topic}.`,
    url: index === 0 ? "https://news.ycombinator.com" : undefined,
    category: "Interest",
    tags: [topic],
  }));
  return { summary, items };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function extractMedia(text: string): {
  mediaUrl?: string;
  mediaType?: "image" | "video";
  cleanedText: string;
} {
  let cleanedText = text;
  let mediaUrl: string | undefined;
  let mediaType: "image" | "video" | undefined;

  const markdownImage = text.match(/!\[[^\]]*]\((https?:\/\/[^)]+)\)/);
  if (markdownImage) {
    mediaUrl = markdownImage[1];
    mediaType = isImageUrl(mediaUrl) ? "image" : undefined;
    cleanedText = cleanedText.replace(markdownImage[0], "").trim();
  }

  const mediaTag = cleanedText.match(/media:\s*(https?:\/\/\S+)/i);
  if (mediaTag) {
    mediaUrl = mediaUrl || mediaTag[1].replace(/[),.]+$/, "");
    mediaType = mediaType || inferMediaType(mediaUrl);
    cleanedText = cleanedText.replace(mediaTag[0], "").trim();
  }

  return { mediaUrl, mediaType, cleanedText };
}

function inferMediaType(url: string): "image" | "video" | undefined {
  if (isImageUrl(url)) return "image";
  if (isVideoUrl(url)) return "video";
  return undefined;
}

function isImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp)$/i.test(url);
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov)$/i.test(url) || /youtu\.be|youtube\.com|vimeo\.com/i.test(url);
}

function getPagedSlice(items: NewsItem[], page: number, totalPages: number) {
  if (items.length === 0) return [];
  const start = Math.floor(((page - 1) * items.length) / totalPages);
  const end = Math.floor((page * items.length) / totalPages);
  return items.slice(start, end);
}

async function generateAiMedia(
  items: NewsItem[],
  profile: ReaderProfile,
  appendLog: (message: string, meta?: string) => void
) {
  if (!items.length) return items;
  appendLog("Generating AI images for stories...", "media");
  const next = [...items];
  let abortRemaining = false;

  for (let index = 0; index < next.length; index += 1) {
    if (abortRemaining) break;
    const item = next[index];
    try {
      const prompt = buildImagePrompt(item, profile);
      const result = await requestAiImage(prompt);
      if (result.error) {
        if (result.error.includes("Missing OPENAI_API_KEY")) {
          appendLog("Missing OPENAI_API_KEY; skipping AI images.", "media");
          abortRemaining = true;
        } else {
          appendLog(`AI image failed for "${item.title}" (${result.error})`, "media");
        }
        continue;
      }
      if (!result.url) continue;
      next[index] = {
        ...item,
        mediaUrl: result.url,
        mediaType: "image",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown image error";
      appendLog(`AI image failed for "${item.title}" (${message})`, "media");
    }
  }

  return next;
}

async function requestAiImage(prompt: string): Promise<{ url?: string; error?: string }> {
  const response = await fetch("/ai-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { error: data?.error || "AI image request failed" };
  }
  return { url: data?.url };
}

function buildImagePrompt(item: NewsItem, profile: ReaderProfile) {
  const tags = item.tags?.length ? `Tags: ${item.tags.join(", ")}.` : "";
  const location = profile.location ? `Location: ${profile.location}.` : "Location: Global.";
  return `Create a photojournalistic newspaper illustration. ${location} Category: ${item.category}. ${tags}\nTitle: ${item.title}.\nSummary: ${item.summary}\nStyle: cinematic, realistic, no text, no logos.`;
}

function parseCategory(text: string): { category: NewsCategory; summary: string; tags: string[] } {
  if (!text) return { category: "Other", summary: text, tags: [] };
  const tagMatch = text.match(/\[(.+?)\]/);
  const tags = tagMatch
    ? tagMatch[1]
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
  const cleaned = tagMatch ? text.replace(tagMatch[0], "").trim() : text;
  const match = cleaned.match(/^(Local|International|Interest|Social)\b[\s:|-]*(.*)$/i);
  if (!match) return { category: "Other", summary: cleaned, tags };
  const category = normalizeCategory(match[1]);
  const summary = match[2]?.trim() || "";
  return { category, summary, tags };
}

function normalizeCategory(raw: string): NewsCategory {
  const normalized = raw.toLowerCase();
  if (normalized.startsWith("local")) return "Local";
  if (normalized.startsWith("international")) return "International";
  if (normalized.startsWith("interest")) return "Interest";
  if (normalized.startsWith("social")) return "Social";
  return "Other";
}

function getStorySize(story?: NewsItem) {
  if (!story) return "news-card--compact";
  const summaryLength = story.summary?.length ?? 0;
  if (story.mediaUrl || summaryLength > 180) return "news-card--featured";
  if (summaryLength < 80 && !story.mediaUrl) return "news-card--compact";
  return "news-card--standard";
}
