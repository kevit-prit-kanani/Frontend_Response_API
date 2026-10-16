
import type { ReactNode } from "react";

import {
    AssistantRuntimeProvider,
    useLocalRuntime,
    type ChatModelAdapter,
} from "@assistant-ui/react";

const modelAdapter: ChatModelAdapter = {
    async run({ messages, abortSignal }) {
        const response = await fetch(
            `${import.meta.env.VITE_API_URL}/chat`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                // Your backend must accept this message format.
                body: JSON.stringify({ messages }),
                signal: abortSignal,
            },
        );

        if (!response.ok) {
            throw new Error(
                `Chat request failed: ${response.status}`,
            );
        }

        const data = (await response.json()) as {
            text: string;
        };

        return {
            content: [
                {
                    type: "text",
                    text: data.text,
                },
            ],
        };
    },
};

export function ChatRuntimeProvider({
    children,
}: Readonly<{
    children: ReactNode;
}>) {
    const runtime = useLocalRuntime(modelAdapter);

    return (
        <AssistantRuntimeProvider runtime={runtime}>
            {children}
        </AssistantRuntimeProvider>
    );
}
