import { apiClient } from "@/lib/api-client";

import type { ScrapeResponse } from "./types";

export async function scrapeSite(
  url: string,
  sessionId?: string,
): Promise<ScrapeResponse> {
  const response = await apiClient.post<ScrapeResponse>(
    "/ingestion/scrape",
    url,
    {
      params: sessionId ? { session_id: sessionId } : undefined,
    },
  );

  return response.data;
}
