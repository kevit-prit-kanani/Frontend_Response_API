import { apiClient } from "@/lib/api-client";

import type {
  Conversation,
  ConversationId,
  SendChatMessageRequest,
  SendChatMessageResponse,
} from "./types";

export async function sendChatMessage(
  request: SendChatMessageRequest,
): Promise<SendChatMessageResponse> {
  const response = await apiClient.post<SendChatMessageResponse>(
    "/chat",
    request,
  );

  return response.data;
}

export async function getConversationIds(): Promise<ConversationId[]> {
  const response = await apiClient.get<ConversationId[]>("/chat/ids");

  return response.data;
}

export async function getConversation(
  sessionId: string,
  previousInteractionId: string,
): Promise<Conversation> {
  const response = await apiClient.get<Conversation>("/chat/conversation", {
    params: {
      session_id: sessionId,
      previous_interaction_id: previousInteractionId,
    },
  });

  return response.data;
}
