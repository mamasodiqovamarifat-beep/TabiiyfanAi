export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  image?: {
    base64: string;
    mimeType: string;
    name?: string;
  };
  duration?: number; // Response generation speed in ms
  isError?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  systemInstruction?: string;
  model: string;
  personaId: string;
}

export interface Persona {
  id: string;
  name: string;
  description: string;
  icon: string; // Emoji representing the avatar
  systemInstruction: string;
  placeholder: string;
  examples: string[];
}

export interface AppStats {
  chatsCount: number;
  messagesCount: number;
  totalDurationMs: number;
}
