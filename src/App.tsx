import { useEffect, useRef, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  Check,
  Globe2,
  LoaderCircle,
  Menu,
  MessageSquare,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { isAxiosError } from "axios";

import {
  getConversation,
  getConversationIds,
  sendChatMessage,
} from "@/entities/chat/api";
import type {
  ConversationId,
  ConversationTurn,
} from "@/entities/chat/types";
import { scrapeSite } from "@/entities/ingestion/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ActiveChat {
  sessionId: string;
  previousInteractionId: string | null;
  messages: ChatMessage[];
}

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (typeof error.response?.data?.message === "string") {
      return error.response.data.message;
    }
    return error.message;
  }

  return error instanceof Error ? error.message : "Something went wrong.";
}

function toMessages(turns: ConversationTurn[]): ChatMessage[] {
  return turns.flatMap((turn) => [
    { role: "user" as const, content: turn.user },
    { role: "assistant" as const, content: turn.system },
  ]);
}

function chatKey(chat: ConversationId): string {
  return `${chat.session_id}:${chat.previous_interaction_id}`;
}

export default function App() {
  const [chats, setChats] = useState<ConversationId[]>([]);
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  const [chatListLoading, setChatListLoading] = useState(true);
  const [chatListError, setChatListError] = useState<string | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [sourceMessage, setSourceMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    let cancelled = false;

    getConversationIds()
      .then((conversationIds) => {
        if (!cancelled) {
          setChats(conversationIds);
          setChatListError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setChatListError(getErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setChatListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages, sending]);

  async function handleScrape(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedUrl = url.trim();
    if (!submittedUrl || scraping) return;

    setScraping(true);
    setScrapeError(null);
    setSourceMessage(null);

    try {
      const result = await scrapeSite(submittedUrl, activeChat?.sessionId);
      setUrl("");

      if (activeChat) {
        setSourceMessage(
          `Added ${submittedUrl} to this chat's sources (${result.pages_uploaded} pages added).`,
        );
        setActiveChat((current) =>
          current
            ? {
                ...current,
                sessionId: result.session_id,
              }
            : current,
        );
      } else {
        setActiveChat({
          sessionId: result.session_id,
          previousInteractionId: null,
          messages: [],
        });
      }
    } catch (error) {
      setScrapeError(getErrorMessage(error));
    } finally {
      setScraping(false);
    }
  }

  async function handleSelectChat(chat: ConversationId) {
    const requestId = ++requestVersion.current;
    setConversationLoading(true);
    setConversationError(null);
    setSendError(null);
    setSourceMessage(null);
    setSidebarOpen(false);

    try {
      const conversation = await getConversation(
        chat.session_id,
        chat.previous_interaction_id,
      );
      if (requestId !== requestVersion.current) return;

      setActiveChat({
        sessionId: conversation.session_id,
        previousInteractionId: conversation.previous_interaction_id,
        messages: toMessages(conversation.interactions),
      });
    } catch (error) {
      if (requestId === requestVersion.current) {
        setConversationError(getErrorMessage(error));
      }
    } finally {
      if (requestId === requestVersion.current) {
        setConversationLoading(false);
      }
    }
  }

  function handleNewChat() {
    requestVersion.current += 1;
    setActiveChat(null);
    setConversationLoading(false);
    setConversationError(null);
    setScrapeError(null);
    setSourceMessage(null);
    setSendError(null);
    setQuery("");
    setSidebarOpen(false);
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = query.trim();
    if (!message || !activeChat || sending) return;
    const requestId = requestVersion.current;

    setQuery("");
    setSendError(null);
    setActiveChat((current) =>
      current
        ? {
            ...current,
            messages: [...current.messages, { role: "user", content: message }],
          }
        : current,
    );
    setSending(true);

    try {
      const result = await sendChatMessage({
        session_id: activeChat.sessionId,
        previous_interaction_id: activeChat.previousInteractionId,
        query: message,
      });

      if (requestId === requestVersion.current) {
        setActiveChat((current) =>
          current
          ? {
              ...current,
              sessionId: result.session_id,
              previousInteractionId: result.previous_interaction_id,
              messages: [
                ...current.messages,
                { role: "assistant", content: result.output },
              ],
            }
          : current,
        );
      }

      const conversationId: ConversationId = {
        session_id: result.session_id,
        previous_interaction_id: result.previous_interaction_id,
      };
      setChats((current) =>
        current.some((chat) => chatKey(chat) === chatKey(conversationId))
          ? current
          : [...current, conversationId],
      );
    } catch (error) {
      if (requestId === requestVersion.current) {
        setSendError(getErrorMessage(error));
      }
    } finally {
      setSending(false);
    }
  }

  const activeChatKey =
    activeChat?.previousInteractionId == null
      ? null
      : `${activeChat.sessionId}:${activeChat.previousInteractionId}`;

  return (
    <main className="flex h-dvh min-h-[520px] w-full overflow-hidden bg-[#f8f9fc] text-[#1e2433]">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-slate-950/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[276px] shrink-0 flex-col border-r border-[#e8eaf0] bg-white transition-transform duration-200 md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[76px] items-center justify-between border-b border-[#eef0f4] px-5">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex items-center gap-3 text-left"
            aria-label="Start a new chat"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#6757e8] text-white shadow-[0_5px_12px_rgba(103,87,232,0.25)]">
              <Sparkles size={18} strokeWidth={2.2} />
            </span>
            <span>
              <span className="block text-[15px] font-semibold tracking-[-0.3px] text-[#171a28]">
                Pagewise
              </span>
              <span className="block text-[11px] font-medium tracking-[0.04em] text-[#9298a8]">
                CHAT WITH THE WEB
              </span>
            </span>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X />
          </Button>
        </div>

        <div className="p-4 pb-3">
          <Button
            onClick={handleNewChat}
            className="h-10 w-full justify-center gap-2 rounded-xl bg-[#6757e8] text-[13px] font-semibold text-white shadow-[0_5px_12px_rgba(103,87,232,0.17)] hover:bg-[#5848d5]"
          >
            <Plus size={16} />
            New chat
          </Button>
        </div>

        <div className="px-5 pb-2 pt-4 text-[10px] font-bold tracking-[0.14em] text-[#a0a5b2]">
          YOUR CHATS
        </div>
        <nav
          className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4"
          aria-label="Conversations"
        >
          {chatListLoading ? (
            <div className="space-y-2 px-2 py-3" aria-label="Loading chats">
              <div className="h-9 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-9 animate-pulse rounded-lg bg-slate-100" />
            </div>
          ) : chats.length ? (
            chats.map((chat, index) => {
              const selected = activeChatKey === chatKey(chat);
              return (
                <button
                  key={chatKey(chat)}
                  type="button"
                  onClick={() => void handleSelectChat(chat)}
                  className={`flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px] transition-colors ${
                    selected
                      ? "bg-[#f0efff] font-semibold text-[#5749c8]"
                      : "text-[#62697a] hover:bg-[#f5f6f9] hover:text-[#303547]"
                  }`}
                >
                  <MessageSquare
                    size={15}
                    className={selected ? "text-[#6757e8]" : "text-[#a1a6b3]"}
                  />
                  <span className="truncate">Chat {index + 1}</span>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-3 text-[12px] leading-5 text-[#9a9eab]">
              Your conversations will show up here.
            </div>
          )}
          {chatListError && (
            <p role="alert" className="px-3 py-2 text-xs leading-5 text-red-600">
              Couldn’t load chats: {chatListError}
            </p>
          )}
        </nav>

        <div className="border-t border-[#eef0f4] p-4">
          <div className="flex items-center gap-2.5 rounded-xl bg-[#f7f8fb] px-3 py-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-[#e9e7ff] text-[#6757e8]">
              <Globe2 size={15} />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-[#40465a]">
                Your research space
              </span>
              <span className="block text-[11px] text-[#969baa]">
                Grounded in your sources
              </span>
            </span>
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-[#e9ebf1] bg-white/80 px-4 backdrop-blur sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu />
            </Button>
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-[#292e3c]">
                {activeChat ? "Research chat" : "New research"}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-[#9298a8]">
                {activeChat
                  ? "Ask questions about your sources"
                  : "Add a website to get started"}
              </div>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-[#e9eaf0] bg-white px-3 py-1.5 text-[11px] font-medium text-[#777e8e] sm:flex">
            <span className="size-1.5 rounded-full bg-[#56b58b]" />
            Private workspace
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col">
          {conversationLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f8f9fc]/85 backdrop-blur-[2px]">
              <div className="flex items-center gap-2.5 rounded-xl border border-[#eceef3] bg-white px-4 py-3 text-sm text-[#656b7b] shadow-sm">
                <LoaderCircle className="size-4 animate-spin text-[#6757e8]" />
                Loading conversation…
              </div>
            </div>
          )}

          {activeChat ? (
            <>
              <div className="shrink-0 border-b border-[#eceef3] bg-white px-4 py-3 sm:px-8">
                <form
                  onSubmit={(event) => void handleScrape(event)}
                  className="mx-auto flex w-full max-w-[900px] items-center gap-2"
                >
                  <span className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-[#f0efff] text-[#6757e8] sm:flex">
                    <Globe2 size={15} />
                  </span>
                  <Input
                    type="url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="Add another website to this chat…"
                    aria-label="Website URL to add to this chat"
                    required
                    className="h-10 flex-1 rounded-xl border-[#e8eaf0] bg-[#fafbfc] px-3 text-[13px] shadow-none focus-visible:border-[#b9b2ff] focus-visible:ring-[#6757e8]/15"
                  />
                  <Button
                    type="submit"
                    disabled={scraping || !url.trim()}
                    className="h-10 rounded-xl bg-[#6757e8] px-4 text-[12px] font-semibold text-white hover:bg-[#5848d5]"
                  >
                    {scraping ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <>
                        <Plus size={15} />
                        <span className="hidden sm:inline">Add source</span>
                      </>
                    )}
                  </Button>
                </form>
                {(scrapeError || sourceMessage) && (
                  <p
                    role={scrapeError ? "alert" : "status"}
                    className={`mx-auto mt-2 w-full max-w-[900px] text-xs ${
                      scrapeError ? "text-red-600" : "text-emerald-700"
                    }`}
                  >
                    {scrapeError ?? sourceMessage}
                  </p>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-7 sm:px-8">
                <div className="mx-auto flex w-full max-w-[760px] flex-col gap-7">
                  {activeChat.messages.length === 0 && (
                    <div className="py-14 text-center">
                      <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#eeecff] text-[#6757e8]">
                        <Sparkles size={21} />
                      </span>
                      <h1 className="text-[23px] font-semibold tracking-[-0.7px] text-[#262b3a]">
                        Your source is ready
                      </h1>
                      <p className="mt-2 text-sm text-[#858b9a]">
                        Ask a question to start exploring this website.
                      </p>
                    </div>
                  )}
                  {activeChat.messages.map((message, index) => (
                    <article
                      key={`${index}-${message.role}`}
                      className={`flex gap-3.5 ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {message.role === "assistant" && (
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#6757e8] text-white">
                          <Sparkles size={15} />
                        </span>
                      )}
                      <div
                        className={`max-w-[min(85%,680px)] whitespace-pre-wrap break-words text-[14px] leading-7 ${
                          message.role === "user"
                            ? "rounded-2xl rounded-br-md bg-[#6757e8] px-4 py-3 text-white shadow-[0_4px_12px_rgba(103,87,232,0.12)]"
                            : "pt-1 text-[#43495a] [&_a]:text-[#5749c8] [&_a]:underline [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol>li]:list-decimal [&_p]:mb-2 [&_p:last-child]:mb-0 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-100 [&_pre]:p-3 [&_strong]:font-semibold [&_table]:my-3 [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:px-2"
                        }`}
                      >
                        {message.role === "assistant" ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
                          </ReactMarkdown>
                        ) : (
                          message.content
                        )}
                      </div>
                    </article>
                  ))}
                  {sending && (
                    <div className="flex items-center gap-3.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#6757e8] text-white">
                        <Sparkles size={15} />
                      </span>
                      <div className="flex items-center gap-1.5 py-3">
                        <span className="size-1.5 animate-bounce rounded-full bg-[#a7a1e8] [animation-delay:-0.2s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-[#a7a1e8] [animation-delay:-0.1s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-[#a7a1e8]" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <div className="shrink-0 px-4 pb-5 pt-3 sm:px-8 sm:pb-7">
                <div className="mx-auto w-full max-w-[760px]">
                  {sendError && (
                    <p role="alert" className="mb-2 text-xs text-red-600">
                      Message couldn’t be sent: {sendError}
                    </p>
                  )}
                  <form
                    onSubmit={(event) => void handleSend(event)}
                    className="rounded-2xl border border-[#e5e7ee] bg-white p-2 shadow-[0_8px_28px_rgba(33,39,57,0.06)] focus-within:border-[#c8c2ff]"
                  >
                    <Textarea
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                      placeholder="Ask anything about your sources…"
                      aria-label="Your message"
                      rows={2}
                      disabled={sending}
                      className="max-h-36 min-h-14 resize-y border-0 px-3 py-2 text-[14px] leading-6 shadow-none focus-visible:ring-0"
                    />
                    <div className="flex items-center justify-between px-1 pb-0.5 pt-1">
                      <span className="text-[11px] text-[#a0a5b1]">
                        Enter to send · Shift + Enter for a new line
                      </span>
                      <Button
                        type="submit"
                        size="icon"
                        aria-label="Send message"
                        disabled={!query.trim() || sending}
                        className="size-8 rounded-xl bg-[#6757e8] text-white hover:bg-[#5848d5]"
                      >
                        {sending ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <ArrowUp size={17} />
                        )}
                      </Button>
                    </div>
                  </form>
                  <p className="mt-2 text-center text-[10px] text-[#a3a7b2]">
                    Answers are generated from the websites you add.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-5 py-10">
              <div className="w-full max-w-[580px] -translate-y-3">
                <div className="mb-7 text-center">
                  <div className="mx-auto mb-5 flex size-[58px] items-center justify-center rounded-[20px] bg-[#eeecff] text-[#6757e8] shadow-[0_6px_18px_rgba(103,87,232,0.08)]">
                    <Globe2 size={25} strokeWidth={1.8} />
                  </div>
                  <div className="mb-2 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7569d7]">
                    <Sparkles size={13} />
                    Research, made simple
                  </div>
                  <h1 className="text-[30px] font-semibold tracking-[-1.1px] text-[#252a39] sm:text-[36px]">
                    Start with a website
                  </h1>
                  <p className="mx-auto mt-3 max-w-[410px] text-[14px] leading-6 text-[#858b9a]">
                    Add a URL and Pagewise will read the page so you can ask
                    questions and find the details that matter.
                  </p>
                </div>

                <form
                  onSubmit={(event) => void handleScrape(event)}
                  className="rounded-2xl border border-[#e5e7ee] bg-white p-2 shadow-[0_12px_35px_rgba(36,42,61,0.08)] transition-shadow focus-within:shadow-[0_12px_38px_rgba(103,87,232,0.12)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="ml-2 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#f3f2ff] text-[#6757e8]">
                      <Globe2 size={17} />
                    </span>
                    <Input
                      type="url"
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      placeholder="Paste a website URL to get started"
                      aria-label="Website URL"
                      required
                      disabled={scraping}
                      className="h-12 border-0 px-1 text-[14px] shadow-none focus-visible:ring-0"
                    />
                    <Button
                      type="submit"
                      disabled={scraping || !url.trim()}
                      className="h-10 shrink-0 gap-2 rounded-xl bg-[#6757e8] px-4 text-[13px] font-semibold text-white hover:bg-[#5848d5]"
                    >
                      {scraping ? (
                        <>
                          <LoaderCircle className="size-4 animate-spin" />
                          <span className="hidden sm:inline">Reading</span>
                        </>
                      ) : (
                        <>
                          Add URL
                          <ArrowUp size={15} />
                        </>
                      )}
                    </Button>
                  </div>
                </form>
                {scrapeError && (
                  <p
                    role="alert"
                    className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-700"
                  >
                    Couldn’t read this website: {scrapeError}
                  </p>
                )}
                {scraping && (
                  <div
                    role="status"
                    className="mt-4 flex items-center justify-center gap-2 text-[12px] text-[#858b9a]"
                  >
                    <LoaderCircle className="size-3.5 animate-spin text-[#6757e8]" />
                    Fetching and indexing the website…
                  </div>
                )}
                <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-[#a0a5b1]">
                  <Check size={13} className="text-[#56a985]" />
                  Your conversations are private to your workspace
                </div>
              </div>
            </div>
          )}

          {conversationError && (
            <div
              role="alert"
              className="absolute inset-x-4 top-4 z-20 mx-auto max-w-lg rounded-xl border border-red-100 bg-white px-4 py-3 text-sm text-red-700 shadow-lg"
            >
              Couldn’t load this conversation: {conversationError}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
