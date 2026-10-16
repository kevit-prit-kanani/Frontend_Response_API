export interface SendChatMessageRequest {
  session_id: string;
  previous_interaction_id: string | null;
  query: string;
}

export interface SendChatMessageResponse {
  session_id: string;
  previous_interaction_id: string;
  output: string;
}

export interface ConversationId {
  session_id: string;
  previous_interaction_id: string;
}

export interface ConversationTurn {
  user: string;
  system: string;
}

export interface Conversation {
  session_id: string;
  previous_interaction_id: string;
  interactions: ConversationTurn[];
  created_at: string;
}
