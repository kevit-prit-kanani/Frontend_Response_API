import { ChatRuntimeProvider } from "./chat/ChatRuntimeProvider";

import { Thread } from "@/components/assistant-ui/elements/thread.aui";

export default function App() {
  return (
    <ChatRuntimeProvider>
      <main className="h-dvh">
        <Thread />
      </main>
    </ChatRuntimeProvider>
  );
}
