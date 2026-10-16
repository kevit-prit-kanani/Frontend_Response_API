# Frontend API contract

Use this file as the compact integration reference for frontend clients and
LLM agents.

## Base URL

Local: `http://localhost:8000`

Interactive OpenAPI docs: `/docs`

All API responses are JSON except `GET /`, which redirects to `/docs`. CORS
allows any origin, method, and header.

## Frontend client organization

Set `VITE_API_URL` to the backend origin (copy `.env.example` to `.env` for
local development). The shared Axios instance is configured in
`src/lib/api-client.ts`; endpoint functions and response/request types are
grouped by domain under `src/entities/`:

- `src/entities/ingestion/` exposes `scrapeSite`.
- `src/entities/chat/` exposes chat, conversation-list, and conversation-load
  requests.

Keep components and the assistant runtime independent of HTTP details. The
runtime adapter in `src/chat/` should map assistant-ui state to the documented
entity API contract.

The research page loads saved conversations from `GET /chat/ids`, labels them
sequentially as `Chat 1`, `Chat 2`, and so on, and loads a selected chat using
its `session_id` and `previous_interaction_id`. A new conversation begins when
a URL is scraped without an active session; its first message sends a `null`
`previous_interaction_id`. The response's ID is retained for follow-up
messages. Adding another URL from an open conversation sends that conversation's
`session_id` to `/ingestion/scrape`.

## Endpoints

### `GET /`

Redirects to the interactive API docs.

### `POST /ingestion/scrape`

**Purpose:** Crawl a site and ingest its Markdown pages into an OpenAI vector
store. Creates a new session if `session_id` is omitted; otherwise reuses the
existing session and its vector store.

**Query parameters**

| Name         | Type   | Required | Meaning                              |
| ------------ | ------ | -------- | ------------------------------------ |
| `session_id` | string | No       | Existing session to add the site to. |

**Body:** JSON string (not an object), absolute HTTP(S) URL.

```json
"https://example.com"
```

**Success `200`**

```json
{
  "session_id": "session-uuid",
  "vector_store_id": "vs_...",
  "pages_scraped": 5,
  "pages_uploaded": 4,
  "pages_skipped": 1
}
```

Same-origin links are crawled to a maximum depth of two. Already-ingested
pages are skipped. Use the returned `session_id` for chat.

**Errors:** `422` invalid URL; `503` configuration/MongoDB failure; `502`
ZenRows/OpenAI failure.

### `POST /chat`

**Purpose:** Ask a question about the session's crawled content or continue a
conversation. Relevant vector-store text and previous conversation turns are
sent to LiteLLM; Langfuse traces the generation.

**JSON body**

| Field                     | Type             | Required            | Meaning                                                                             |
| ------------------------- | ---------------- | ------------------- | ----------------------------------------------------------------------------------- |
| `session_id`              | string           | Yes                 | Session ID from scrape.                                                             |
| `previous_interaction_id` | string or `null` | No (default `null`) | Stable conversation ID returned by `/chat`. Use `null` to start a new conversation. |
| `query`                   | string           | Yes                 | User's question; non-empty.                                                         |

```json
{
  "session_id": "session-uuid",
  "previous_interaction_id": null,
  "query": "What is the site's mission?"
}
```

**Success `200`**

```json
{
  "session_id": "session-uuid",
  "previous_interaction_id": "conversation-uuid",
  "output": "The site's mission is..."
}
```

For every follow-up, send the returned `previous_interaction_id` unchanged with
the next query. It identifies the conversation document. The latest LiteLLM
response ID is stored separately and is not the conversation ID.

**Errors:** `404` unknown session/conversation; `409` concurrent/stale update;
`422` invalid request; `503` configuration/MongoDB failure; `502` provider or
completion failure.

### `GET /chat/ids`

**Purpose:** List conversations for a conversation picker.

**Parameters:** None.

**Success `200`**

```json
[
  {
    "session_id": "session-uuid",
    "previous_interaction_id": "conversation-uuid"
  }
]
```

Each entry corresponds to a conversation in MongoDB. **Error:** `503`
configuration/MongoDB failure.

### `GET /chat/conversation`

**Purpose:** Load one conversation's history for display.

**Query parameters (both required)**

| Name                      | Type   | Meaning                                     |
| ------------------------- | ------ | ------------------------------------------- |
| `session_id`              | string | Owning session ID.                          |
| `previous_interaction_id` | string | Stable conversation ID returned by `/chat`. |

Example: `GET /chat/conversation?session_id=session-uuid&previous_interaction_id=conversation-uuid`

**Success `200`**

```json
{
  "session_id": "session-uuid",
  "previous_interaction_id": "conversation-uuid",
  "interactions": [
    {
      "user": "What is the site's mission?",
      "system": "The site's mission is..."
    }
  ],
  "created_at": "2026-10-16T10:00:00Z"
}
```

`interactions` is ordered oldest to newest; each `user`/`system` pair is one
turn. **Errors:** `404` no matching ID pair; `422` missing/invalid parameter;
`503` configuration/MongoDB failure.

## Typical flow

1. `POST /ingestion/scrape`; retain `session_id`.
2. `POST /chat` with `previous_interaction_id: null`.
3. Retain the response's `previous_interaction_id`; send it on every follow-up.
4. Use `GET /chat/ids` to list conversations.
5. Use `GET /chat/conversation` to load one conversation's history.

Every endpoints are not streaming. meaning, the response will be given fully.
