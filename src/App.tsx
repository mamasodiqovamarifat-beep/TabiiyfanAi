import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  Plus,
  Trash2,
  Sparkles,
  Send,
  Image,
  X,
  Menu,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  Clock,
  Code,
  Globe,
  Settings,
  HelpCircle,
  AlertCircle,
  Download,
  Terminal,
  Paperclip,
  CheckCircle2
} from "lucide-react";
import { Message, ChatSession, Persona } from "./types";
import { PERSONAS, AVAILABLE_MODELS } from "./data";
import { MarkdownRenderer } from "./components/MarkdownRenderer";

/**
 * Direct Client-Side Gemini stream caller for static deployments
 */
async function callGeminiDirectClientSide(
  messages: Message[],
  systemInstruction: string,
  modelName: string,
  userApiKey: string,
  onChunk: (text: string) => void
) {
  const contents = messages.map((m) => {
    const parts: any[] = [];
    if (m.content) {
      parts.push({ text: m.content });
    }
    if (m.image) {
      let base64Data = m.image.base64;
      if (base64Data.includes("base64,")) {
        base64Data = base64Data.split("base64,")[1];
      }
      parts.push({
        inlineData: {
          mimeType: m.image.mimeType || "image/jpeg",
          data: base64Data,
        },
      });
    }
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts: parts.length > 0 ? parts : [{ text: "" }],
    };
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${userApiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    let parsedErr;
    try {
      parsedErr = JSON.parse(errText);
    } catch (_) {}
    const msg = parsedErr?.error?.message || errText || response.statusText;
    throw new Error(msg);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder("utf-8");
  if (reader) {
    let isDone = false;
    while (!isDone) {
      const { value, done } = await reader.read();
      isDone = done;
      if (value) {
        const chunkStr = decoder.decode(value);
        const lines = chunkStr.split("\n");
        for (const line of lines) {
          const cleanLine = line.trim();
          if (cleanLine.startsWith("data: ")) {
            const jsonStr = cleanLine.substring(6).trim();
            try {
              const parsed = JSON.parse(jsonStr);
              const textWord = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (textWord) {
                onChunk(textWord);
              }
            } catch (_) {}
          }
        }
      }
    }
  }
}

export default function App() {
  // Chat History & Persistence
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem("nexus_ai_sessions");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Xatolik: Saved sessions parse etilmadi", e);
      }
    }
    // Default initial session
    const defaultSession: ChatSession = {
      id: "initial-session-id",
      title: "Yangi suhbat",
      messages: [],
      createdAt: Date.now(),
      model: "gemini-3.5-flash",
      personaId: "standard",
      systemInstruction: PERSONAS[0].systemInstruction,
    };
    return [defaultSession];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const saved = localStorage.getItem("nexus_ai_active_id");
    return saved || "initial-session-id";
  });

  // UI state
  const [inputText, setInputText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleEditInput, setTitleEditInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Custom uploaded image state
  const [selectedImage, setSelectedImage] = useState<{
    base64: string;
    mimeType: string;
    name: string;
  } | null>(null);

  // Advanced settings state
  const [showSettings, setShowSettings] = useState(false);
  const [systemInstructionOverride, setSystemInstructionOverride] = useState("");
  
  // Client-side API key for static deploys (e.g., Netlify)
  const [userApiKey, setUserApiKey] = useState(() => {
    return localStorage.getItem("nexus_user_gemini_key") || (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
  });

  // Save changes to localStorage whenever they mutate
  useEffect(() => {
    localStorage.setItem("nexus_user_gemini_key", userApiKey);
  }, [userApiKey]);
  
  // Stats
  const [totalQuestions, setTotalQuestions] = useState(() => {
    return Number(localStorage.getItem("nexus_ai_stat_questions") || "0");
  });
  const [avgResponseTime, setAvgResponseTime] = useState(() => {
    return Number(localStorage.getItem("nexus_ai_stat_avg_time") || "0");
  });

  // Drag and drop feedback
  const [isDragging, setIsDragging] = useState(false);

  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Bottom scrolling ref
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Find active session
  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0] || {
    id: "fallback",
    title: "Yangi suhbat",
    messages: [],
    model: "gemini-3.5-flash",
    personaId: "standard"
  };

  const activePersona = PERSONAS.find((p) => p.id === activeSession.personaId) || PERSONAS[0];

  // Save changes to localStorage whenever they mutate
  useEffect(() => {
    localStorage.setItem("nexus_ai_sessions", JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem("nexus_ai_active_id", activeSessionId);
  }, [activeSessionId]);

  // Scroll to bottom on updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession.messages, isGenerating]);

  // Adjust sidebar state for mobile screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    handleResize(); // run on mount
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Update override instruction input when active session changes
  useEffect(() => {
    if (activeSession) {
      setSystemInstructionOverride(activeSession.systemInstruction || activePersona.systemInstruction);
    }
  }, [activeSessionId, activeSession?.personaId]);

  const createNewSession = (personaId: string = "standard") => {
    const selected = PERSONAS.find((p) => p.id === personaId) || PERSONAS[0];
    const newSession: ChatSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      title: `${selected.name} suhbati`,
      messages: [],
      createdAt: Date.now(),
      model: "gemini-3.5-flash",
      personaId: personaId,
      systemInstruction: selected.systemInstruction,
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setSelectedImage(null);
    setInputText("");

    // On mobile screens, automatically collapse sidebar to focus on input
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Prevent deleting the very last session to keep UI stable
    if (sessions.length <= 1) {
      const defaultSession: ChatSession = {
        id: `session-${Date.now()}`,
        title: "Yangi suhbat",
        messages: [],
        createdAt: Date.now(),
        model: "gemini-3.5-flash",
        personaId: "standard",
        systemInstruction: PERSONAS[0].systemInstruction,
      };
      setSessions([defaultSession]);
      setActiveSessionId(defaultSession.id);
      return;
    }

    const index = sessions.findIndex((s) => s.id === id);
    const newSessions = sessions.filter((s) => s.id !== id);
    setSessions(newSessions);

    if (activeSessionId === id) {
      // Pick another session nearby
      const nextActiveIndex = index > 0 ? index - 1 : 0;
      setActiveSessionId(newSessions[nextActiveIndex].id);
    }
  };

  const startEditingTitle = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTitleId(id);
    setTitleEditInput(currentTitle);
  };

  const saveTitleEdit = (id: string) => {
    if (titleEditInput.trim()) {
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, title: titleEditInput.trim() } : s))
      );
    }
    setEditingTitleId(null);
  };

  const triggerImageUpload = () => {
    fileInputRef.current?.click();
  };

  // Convert uploaded image file path/file object to base64 format safely
  const handleImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Iltimos, faqat rasm fayllarini yuklang (PNG, JPG, JPEG, WEBP, etc.)");
      return;
    }

    // Maximum file size limit: 12MB
    if (file.size > 12 * 1024 * 1024) {
      alert("Rasm hajmi juda katta! Maksimal 12MB gacha yuklashingiz mumkin.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage({
        base64: reader.result as string,
        mimeType: file.type,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageFile(file);
    }
  };

  // Safe Drag & Drop Handling
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleImageFile(file);
    }
  };

  // Send request pipeline
  const handleSendMessage = async (textToSend?: string) => {
    const rawText = textToSend !== undefined ? textToSend : inputText;
    if (!rawText.trim() && !selectedImage) return;

    setIsGenerating(true);
    setInputText("");

    // Prepare content of user message
    const userMsgId = `user-msg-${Date.now()}`;
    const userMessage: Message = {
      id: userMsgId,
      role: "user",
      content: rawText,
      timestamp: Date.now(),
      image: selectedImage
        ? {
            base64: selectedImage.base64,
            mimeType: selectedImage.mimeType,
            name: selectedImage.name,
          }
        : undefined,
    };

    // Calculate dynamic auto-session title on the first message
    let updatedSessions = [...sessions];
    const currentSessionIndex = updatedSessions.findIndex((s) => s.id === activeSessionId);
    let currentSession = { ...updatedSessions[currentSessionIndex] };

    // Push message to memory
    const updatedMessages = [...currentSession.messages, userMessage];
    currentSession.messages = updatedMessages;

    // Automatic rename based on the first prompt context
    if (currentSession.messages.length === 1) {
      const maxTitleLen = 22;
      const cleanTitle = rawText.trim().replace(/[\n\r]/g, " ");
      currentSession.title =
        cleanTitle.length > maxTitleLen ? cleanTitle.substring(0, maxTitleLen) + "..." : cleanTitle;
    }

    // Save image & text reset
    setSelectedImage(null);

    // Append to virtual UI right away
    updatedSessions[currentSessionIndex] = currentSession;
    setSessions(updatedSessions);

    // Measure starting duration
    const startTimeStamp = Date.now();

    // Prepare temporary AI Message state
    const assistantMsgId = `assistant-msg-${Date.now()}`;
    const initialAssistantMessage: Message = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    currentSession.messages = [...updatedMessages, initialAssistantMessage];
    updatedSessions[currentSessionIndex] = currentSession;
    setSessions([...updatedSessions]);

    try {
      const sysInstruction = systemInstructionOverride || currentSession.systemInstruction || activePersona.systemInstruction;
      const currentModel = currentSession.model || "gemini-3.5-flash";
      let streamText = "";

      // Check if user has their own custom API key or if they are on Netlify/static site with no server
      const isNetlify = window.location.hostname.includes("netlify.app") || window.location.hostname.includes("github.io") || (window.location.hostname !== "localhost" && !window.location.hostname.endsWith(".run.app"));
      const useDirectClientSideCall = (userApiKey && userApiKey.trim().length > 10) || isNetlify;

      if (useDirectClientSideCall) {
        if (!userApiKey.trim()) {
          throw new Error("NETLIFY_REQUIRES_API_KEY");
        }
        
        await callGeminiDirectClientSide(
          updatedMessages,
          sysInstruction,
          currentModel,
          userApiKey.trim(),
          (chunk) => {
            streamText += chunk;
            setSessions((prevSessions) => {
              return prevSessions.map((s) => {
                if (s.id === activeSessionId) {
                  return {
                    ...s,
                    messages: s.messages.map((m) =>
                      m.id === assistantMsgId ? { ...m, content: streamText } : m
                    ),
                  };
                }
                return s;
              });
            });
          }
        );
      } else {
        // Carry out standard server-side request
        let response;
        try {
          response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: updatedMessages.map((m) => ({
                role: m.role,
                content: m.content,
                image: m.image,
              })),
              systemInstruction: sysInstruction,
              model: currentModel,
            }),
          });
        } catch (fetchErr) {
          if (isNetlify || (window.location.hostname !== "localhost" && !window.location.hostname.endsWith(".run.app"))) {
            throw new Error("SERVER_UNREACHABLE_ON_STATIC_DEPL");
          }
          throw fetchErr;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!response.ok || contentType.includes("text/html")) {
          if (contentType.includes("text/html") || response.status === 404) {
            throw new Error("SERVER_UNREACHABLE_ON_STATIC_DEPL");
          }
          throw new Error(`Xatolik yuz berdi: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        
        if (reader) {
          let isDone = false;
          while (!isDone) {
            const { value, done } = await reader.read();
            isDone = done;
            if (value) {
              const chunkStr = decoder.decode(value);
              const lines = chunkStr.split("\n");
              
              for (const line of lines) {
                const cleanLine = line.trim();
                if (cleanLine.startsWith("data: ")) {
                  const jsonStr = cleanLine.substring(6).trim();
                  if (jsonStr === "[DONE]") {
                    isDone = true;
                    break;
                  }
                  try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.text) {
                      streamText += parsed.text;
                      setSessions((prevSessions) => {
                        return prevSessions.map((s) => {
                          if (s.id === activeSessionId) {
                            return {
                              ...s,
                              messages: s.messages.map((m) =>
                                m.id === assistantMsgId ? { ...m, content: streamText } : m
                              ),
                            };
                          }
                          return s;
                        });
                      });
                    } else if (parsed.error) {
                      throw new Error(parsed.error);
                    }
                  } catch (err) {
                    // silent ignore
                  }
                }
              }
            }
          }
        }
      }

      // Finalize duration computation
      const deltaMs = Date.now() - startTimeStamp;

      setSessions((prevSessions) => {
        return prevSessions.map((s) => {
          if (s.id === activeSessionId) {
            return {
              ...s,
              messages: s.messages.map((m) =>
                m.id === assistantMsgId ? { ...m, content: streamText, duration: deltaMs } : m
              ),
            };
          }
          return s;
        });
      });

      // Update Local Statistics
      const newTotalQ = totalQuestions + 1;
      setTotalQuestions(newTotalQ);
      localStorage.setItem("nexus_ai_stat_questions", String(newTotalQ));

      const newAvgTime = avgResponseTime === 0 ? deltaMs : Math.round((avgResponseTime + deltaMs) / 2);
      setAvgResponseTime(newAvgTime);
      localStorage.setItem("nexus_ai_stat_avg_time", String(newAvgTime));

    } catch (err: any) {
      console.error(err);
      let errText = `Kechirasiz, javobni olishda uzilish ro'y berdi. Tarmoq ulanishini tekshiring.\n\nFoydali ma'lumot: ${err.message || ""}`;
      
      const errMsg = (err.message || "").toLowerCase();
      if (err.message === "NETLIFY_REQUIRES_API_KEY" || err.message === "SERVER_UNREACHABLE_ON_STATIC_DEPL") {
        errText = `⚠️ **NEXUSAI: NETLIFY / PORTATIV REJIMDA SOZLANISHI TALAB QILINADI** ⚠️\n\nUshbu platforma hozirda Netlify yoki statik veb-hostingda ishlamoqda. Statik xostlarda Express (orqa fon) serveri bo'lmaganligi sababli, NexusAI-ning ishlashi uchun o'zingizning shaxsiy yoki bepul **Gemini API kaliti (API Key)** talab qilinadi.\n\n### 💡 QANDAY SOZLANADI / TUZATILADI?\n\n1. **API Kalitini Oling (Mutlaqo Bepul):**\n   Google AI Studio orqali o'z shaxsiy kalitingizni bepul yarating: [Google AI Studio Key](https://aistudio.google.com/)\n\n2. **NexusAI-ga kalitni kiriting:**\n   Ekraningizning chap pastki burchagidagi **\"Tizim Sozlamalari\" (Settings)** tugmasini bosing va **\"Shaxsiy Gemini API Key kiritish\"** maydoniga kalitni joylashtirib, **\"O'zgarishlarni saqlash\"** ni bosing.\n\n3. **Muloqotni qayta boshlang!** Ilova ballar barcha ma'lumotlarni bevosita brauzeringizdan xavfsiz jo'natishni boshlaydi.`;
      } else if (
        errMsg.includes("quota") ||
        errMsg.includes("limit") ||
        errMsg.includes("exceeded") ||
        errMsg.includes("429") ||
        errMsg.includes("resource_exhausted")
      ) {
        errText = `⚠️ **NEXUSAI TIZIM CHEKLOVI / KVOTA TO'LGAN (QUOTA EXCEEDED)** ⚠️\n\nSiz foydalanayotgan model (**${currentSession.model || "gemini-3.5-flash"}**) bepul so'rovlar limitiga yetdi (GCP rate limit).\n\nTizimda cheksiz suhbatlashish uchun bir nechta barqaror Gemini modellari mavjud.\n\n### 💡 MULOQOTNI DAVOM ETTIRISH YECHIMLARI:\n\n1. **BOSHQA MODELGA O'TING (ZUDLIK BILAN):**\n   Tepada, o'ng tomondagi sarlavha panelida yoki **Tizim Sozlamalari (Settings)** ichidagi **\"LLM Modelini Tanlash\"** menyusidan muqobil modellardan birini (masalan: **Gemini 2.5 Flash**, **Gemini 2.0 Flash** yoki **Gemini 1.5 Flash**) tanlang. Ular alohida limitlarga ega va siz muloqotni davom ettira olasiz!\n\n2. **BIROZ KUTING:**\n   GCP tizimi limitlarni avtomat ravishda tez fursatda yangilaydi (shundan so'ng muloqot qayta jonlanadi).`;
      }
      
      setSessions((prevSessions) => {
        return prevSessions.map((s) => {
          if (s.id === activeSessionId) {
            return {
              ...s,
              messages: s.messages.map((m) =>
                m.id === assistantMsgId ? { ...m, content: errText, isError: true } : m
              ),
            };
          }
          return s;
        });
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Quick preset trigger
  const runPresetQuestion = (prompt: string) => {
    if (isGenerating) return;
    handleSendMessage(prompt);
  };

  // Change active session persona setting right away
  const changeActivePersona = (personaId: string) => {
    const selected = PERSONAS.find((p) => p.id === personaId) || PERSONAS[0];
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? {
              ...s,
              personaId: personaId,
              systemInstruction: selected.systemInstruction,
              title: s.messages.length === 0 ? `${selected.name} suhbati` : s.title,
            }
          : s
      )
    );
    // Sync local editor input
    setSystemInstructionOverride(selected.systemInstruction);
  };

  // Export Chat Logs to raw Markdown
  const exportSessionToMarkdown = () => {
    if (activeSession.messages.length === 0) {
      alert("Eksport qilish uchun chat xabarlari mavjud emas.");
      return;
    }

    let markdown = `# NexusAI — ${activeSession.title}\n`;
    markdown += `*Sana: ${new Date(activeSession.createdAt).toLocaleString()}*\n`;
    markdown += `*Persona: ${activePersona.name}*\n\n`;
    markdown += `--- \n\n`;

    activeSession.messages.forEach((m) => {
      const roleName = m.role === "user" ? "Men (Foydalanuvchi)" : "NexusAI";
      markdown += `### 👤 ${roleName}\n`;
      markdown += `${m.content}\n\n`;
      if (m.duration) {
        markdown += `*Javob olish tezligi: ${(m.duration / 1000).toFixed(2)} soniya*\n\n`;
      }
      markdown += `--- \n\n`;
    });

    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `NexusAI_${activeSession.title.replace(/\s+/g, "_")}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Reset total application sessions to fresh standard
  const clearAllAppHistory = () => {
    if (confirm("Haqiqatan ham barcha suhbatlar tarixini o'chirib yubormoqchimisiz?")) {
      const freshSession: ChatSession = {
        id: `session-${Date.now()}`,
        title: "Yangi suhbat",
        messages: [],
        createdAt: Date.now(),
        model: "gemini-3.5-flash",
        personaId: "standard",
        systemInstruction: PERSONAS[0].systemInstruction,
      };
      setSessions([freshSession]);
      setActiveSessionId(freshSession.id);
      setSelectedImage(null);
      setInputText("");
      setTotalQuestions(0);
      setAvgResponseTime(0);
      localStorage.removeItem("nexus_ai_sessions");
      localStorage.removeItem("nexus_ai_active_id");
      localStorage.removeItem("nexus_ai_stat_questions");
      localStorage.removeItem("nexus_ai_stat_avg_time");
      setShowSettings(false);
    }
  };

  return (
    <div
      className="flex h-screen w-screen overflow-hidden text-[#e2e8f0] font-sans cosmic-gradient selection:bg-purple-500/20"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* File Drop Overlay Indicators */}
      {isDragging && (
        <div className="absolute inset-0 bg-[#07080b]/90 border-4 border-dashed border-purple-500 z-50 flex flex-col items-center justify-center p-6 transition-all duration-300 pointer-events-none animate-pulse">
          <UploadIcon className="w-16 h-16 text-purple-400 mb-4" />
          <h2 className="text-2xl font-bold font-display text-white mb-2">Rasmni bu yerga tashlang!</h2>
          <p className="text-slate-400 text-sm">Rasm ko'rib chiqilib, NexusAI-ga jo'natiladi</p>
        </div>
      )}

      {/* LEFT SIDEBAR CONTROLLER */}
      <aside
        id="nexus-sidebar"
        className={`fixed inset-y-0 left-0 z-40 w-72 md:w-80 bg-[#0d0e12]/98 border-r border-white/5 flex flex-col transition-transform duration-300 transform ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:relative lg:translate-x-0`}
      >
        {/* Header Branding */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-pink-600 to-amber-500 p-0.5 shadow-lg shadow-purple-500/10 flex items-center justify-center">
              <div className="w-full h-full bg-[#0d0e12] rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
              </div>
            </div>
            <div>
              <h1 className="font-display font-bold text-lg text-white tracking-wide leading-none">NexusAI</h1>
              <span className="text-[10px] text-purple-400 font-mono">v3.5 INTELLIGENCE</span>
            </div>
          </div>

          <button
            id="close-sidebar-mobile-btn"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Controls */}
        <div className="p-3 space-y-2">
          <button
            id="new-chat-btn"
            onClick={() => createNewSession("standard")}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-98 text-white font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-purple-900/20"
          >
            <Plus className="w-4 h-4" />
            <span>Yangi muloqot</span>
          </button>

          {/* Core Persona selector inside sidebar for clarity */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-white/5 rounded-xl border border-white/5">
            {PERSONAS.map((p) => (
              <button
                key={p.id}
                title={p.name}
                onClick={() => {
                  // If current active session is completely empty, we can just switch this session's persona
                  if (activeSession.messages.length === 0) {
                    changeActivePersona(p.id);
                  } else {
                    // Else, spawn a brand new session with this direct persona layout
                    createNewSession(p.id);
                  }
                }}
                className={`py-2 rounded-lg text-lg flex items-center justify-center transition-all ${
                  activeSession.personaId === p.id && activeSession.messages.length === 0
                    ? "bg-purple-600/30 text-white border border-purple-500/30 font-bold"
                    : "hover:bg-white/5 text-slate-400 hover:text-slate-200"
                }`}
              >
                {p.icon}
              </button>
            ))}
          </div>
        </div>

        {/* Saved Sessions list containing titles */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
          <p className="text-[10px] font-mono tracking-wider uppercase text-slate-500 px-3 py-1 font-semibold">
            Muloqotlar tarixi
          </p>

          {sessions.map((s) => {
            const isSelected = s.id === activeSessionId;
            const isEditing = editingTitleId === s.id;
            const sessionPersona = PERSONAS.find((p) => p.id === s.personaId) || PERSONAS[0];

            return (
              <div
                key={s.id}
                id={`session-item-${s.id}`}
                onClick={() => {
                  if (!isEditing) {
                    setActiveSessionId(s.id);
                    setSelectedImage(null);
                    // collapse sidebar automatically on tiny phones
                    if (window.innerWidth < 1024) {
                      setSidebarOpen(false);
                    }
                  }
                }}
                className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                  isSelected
                    ? "bg-white/10 text-white font-medium border border-white/5"
                    : "hover:bg-white/5 text-slate-400 hover:text-slate-200"
                }`}
              >
                {/* Persona display avatar icon */}
                <span className="text-sm selection:bg-transparent">{sessionPersona.icon}</span>

                {/* Edit input block */}
                {isEditing ? (
                  <input
                    type="text"
                    value={titleEditInput}
                    onChange={(e) => setTitleEditInput(e.target.value)}
                    onBlur={() => saveTitleEdit(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveTitleEdit(s.id);
                      if (e.key === "Escape") setEditingTitleId(null);
                    }}
                    autoFocus
                    className="flex-1 bg-slate-900 border border-purple-500/40 rounded px-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                ) : (
                  <span className="flex-1 text-xs md:text-sm truncate pr-14 leading-tight">
                    {s.title}
                  </span>
                )}

                {/* Direct Title Action controls */}
                {!isEditing && (
                  <div className="absolute right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                    <button
                      title="Nomini o'zgartirish"
                      onClick={(e) => startEditingTitle(s.id, s.title, e)}
                      className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                    <button
                      title="Suhbatni o'chirish"
                      onClick={(e) => deleteSession(s.id, e)}
                      className="p-1 hover:bg-rose-500/20 rounded text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Left Side Static Info Block */}
        <div className="p-4 border-t border-white/5 bg-[#0a0a0e] space-y-3">
          {/* Diagnostic status block */}
          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 font-mono">
            <div className="bg-white/5 rounded-lg p-2 border border-white/5">
              <span className="block text-slate-500 text-[10px]">Suhbatlar</span>
              <span className="font-semibold text-white">{sessions.length} ta</span>
            </div>
            <div className="bg-white/5 rounded-lg p-2 border border-white/5">
              <span className="block text-slate-500 text-[10px]">O'rtacha</span>
              <span className="font-semibold text-purple-400">
                {avgResponseTime > 0 ? `${(avgResponseTime / 1000).toFixed(1)}s` : "0s"}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <Settings className="w-3.5 h-3.5 text-purple-500" />
              <span>Tizim sozlamalari</span>
            </button>

            <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Gemini faol
            </span>
          </div>
        </div>
      </aside>

      {/* MAIN CHAT WINDOW CONTAINER */}
      <main className="flex-1 flex flex-col relative h-full overflow-hidden bg-[#07080b]">
        
        {/* Dynamic header navigation banner */}
        <header className="h-16 border-b border-white/5 bg-[#0a0b0e] flex items-center justify-between px-4 z-30">
          <div className="flex items-center gap-3">
            <button
              id="sidebar-toggle-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors mr-1"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-base font-semibold text-white truncate max-w-[170px] md:max-w-[300px]">
                  {activeSession.title}
                </span>
                <span className="text-xs bg-purple-500/10 text-purple-400 border border-purple-500/25 px-1.5 py-0.5 rounded-md font-mono scale-90">
                  {activePersona.name}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 hidden md:inline">
                {activeSession.messages.length} ta yuborilgan xabarlar ro'yxati
              </span>
            </div>
          </div>

          {/* Action elements for Active Chat */}
          <div className="flex items-center gap-1 md:gap-3">
            {/* Model Select Dropdown */}
            <div className="flex items-center gap-1 bg-white/[0.03] border border-white/5 rounded-xl px-2 py-1 md:py-1.5 font-mono text-[11px]">
              <span className="text-slate-500 hidden sm:inline select-none">Model:</span>
              <select
                value={activeSession.model || "gemini-3.5-flash"}
                onChange={(e) => {
                  const selectedModel = e.target.value;
                  setSessions((prev) =>
                    prev.map((s) => (s.id === activeSessionId ? { ...s, model: selectedModel } : s))
                  );
                }}
                className="bg-transparent border-0 text-[#a855f7] focus:outline-none focus:ring-0 cursor-pointer font-semibold font-mono"
                title="Faol Gemini modelini o'zgartirish"
              >
                {AVAILABLE_MODELS.map((m) => (
                  <option key={m.id} value={m.id} className="bg-[#0e1017] text-white">
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {activeSession.messages.length > 0 && (
              <button
                title="Suhbatni Markdown sifatida yuklab olish"
                onClick={exportSessionToMarkdown}
                className="p-2 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-medium"
              >
                <Download className="w-4 h-4" />
                <span className="hidden md:inline">MD Yuklash</span>
              </button>
            )}

            <button
              title="Suhbatni tozalash"
              onClick={(e) => {
                if (confirm("Ushbu suhbat xabarlarini tozalashni xohlaysizmi?")) {
                  setSessions((prev) =>
                    prev.map((s) => (s.id === activeSessionId ? { ...s, messages: [] } : s))
                  );
                }
              }}
              className="p-2 hover:bg-red-500/10 hover:text-rose-400 rounded-xl text-slate-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Live Conversation Scroll Stage */}
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6">
          
          {activeSession.messages.length === 0 ? (
            /* BRAND NEW CHAT GREETING SCREEN WITH RICH PRESENTATION */
            <div className="max-w-2xl mx-auto py-8 md:py-16 text-center space-y-8">
              
              <div className="relative inline-block">
                <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 opacity-75 blur-md animate-pulse"></div>
                <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#0d0e12] flex items-center justify-center border border-white/10">
                  <span className="text-3xl md:text-4xl">{activePersona.icon}</span>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-2xl md:text-4xl font-display font-extrabold text-white tracking-tight">
                  Men <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">NexusAI</span> yordamchisiman
                </h2>
                <p className="text-slate-400 text-sm md:text-base max-w-lg mx-auto">
                  {activePersona.description} Quyidagi tayyor namunalardan birini tanlang yoki o'z savolingizni yozib yuboring.
                </p>
              </div>

              {/* Grid block of fast templates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-6 text-left">
                {activePersona.examples.map((exampleText, idx) => (
                  <button
                    key={idx}
                    onClick={() => runPresetQuestion(exampleText)}
                    className="p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 hover:border-purple-500/20 text-slate-300 hover:text-white transition-all text-xs md:text-sm text-left leading-normal flex gap-3 group active:scale-98"
                  >
                    <span className="text-purple-400 block mt-0.5 group-hover:translate-x-1 transition-transform">✦</span>
                    <span>{exampleText}</span>
                  </button>
                ))}
              </div>

              {/* Persona selector explicitly listed out */}
              <div className="pt-8 border-t border-white/5">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3 font-mono">Boshqa suhbat rejimini tanlang:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {PERSONAS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => changeActivePersona(p.id)}
                      className={`px-3 py-2 rounded-xl text-xs flex items-center gap-2 border transition-all ${
                        activeSession.personaId === p.id
                          ? "bg-purple-600/20 text-purple-300 border-purple-500/40"
                          : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/[0.05] hover:text-white"
                      }`}
                    >
                      <span>{p.icon}</span>
                      <span className="font-semibold">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          ) : (
            /* CONVERSATION STREAM OF CHAT THREADS */
            <div className="max-w-3xl mx-auto space-y-6">
              {activeSession.messages.map((message, idx) => {
                const isUser = message.role === "user";
                const isErr = message.isError;

                return (
                  <div
                    key={message.id || idx}
                    id={`message-bubble-${message.id}`}
                    className={`flex items-start gap-3 md:gap-4 transition-all animate-fade-in ${
                      isUser ? "justify-end" : "justify-start"
                    }`}
                  >
                    {/* Bot icon avatar */}
                    {!isUser && (
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-purple-900/40 border border-purple-500/30 flex items-center justify-center text-base shrink-0">
                        {activePersona.icon}
                      </div>
                    )}

                    {/* Chat Bubble card container */}
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 md:px-5 md:py-3.5 relative border shadow-lg ${
                        isUser
                          ? "bg-purple-600 text-white border-purple-500 rounded-tr-none self-end"
                          : isErr
                          ? "bg-rose-950/20 text-rose-200 border-rose-500/30 rounded-tl-none self-start"
                          : "bg-[#111218] text-slate-100 border-white/5 rounded-tl-none self-start"
                      }`}
                    >
                      {/* Attached media display */}
                      {message.image && (
                        <div className="mb-3 overflow-hidden rounded-lg max-w-sm border border-white/10 relative group">
                          <img
                            src={message.image.base64}
                            alt="Foydalanuvchi yuborgan rasm"
                            className="w-full max-h-60 object-contain bg-black/40"
                          />
                          <div className="absolute top-1 left-2 bg-black/75 rounded text-[10px] text-white px-1.5 py-0.5">
                            Rasm tahlili
                          </div>
                        </div>
                      )}

                      {/* Content block */}
                      {isUser ? (
                        <p className="whitespace-pre-wrap text-sm md:text-base leading-relaxed break-words font-sans">
                          {message.content}
                        </p>
                      ) : (
                        <MarkdownRenderer text={message.content} />
                      )}

                      {/* Footer stats: dynamic duration, copyable button etc */}
                      <div className="mt-2.5 pt-1.5 border-t border-white/[0.04] flex items-center justify-between gap-4 text-[10px] text-slate-500 font-mono">
                        <span>
                          {new Date(message.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>

                        {!isUser && message.duration && (
                          <span className="text-slate-400 font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3 text-purple-400" />
                            {(message.duration / 1000).toFixed(2)}s yuborildi
                          </span>
                        )}
                      </div>
                    </div>

                    {/* User profile avatar dummy */}
                    {isUser && (
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
                        <span className="text-xs uppercase font-bold text-indigo-300 font-mono">👤</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Streaming loading typing animation indicator */}
              {isGenerating &&
                activeSession.messages.length > 0 &&
                !activeSession.messages[activeSession.messages.length - 1]?.content && (
                  <div className="flex items-start gap-4 animate-pulse">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-purple-900/40 border border-purple-500/30 flex items-center justify-center text-sm">
                      {activePersona.icon}
                    </div>
                    <div className="bg-[#111218] border border-white/5 rounded-2xl rounded-tl-none p-4 max-w-sm">
                      <div className="flex space-x-1.5 items-center h-4">
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                      </div>
                    </div>
                  </div>
                )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* BOTTOM FLOATING INPUT STATION */}
        <footer className="p-4 md:p-6 border-t border-white/5 bg-[#0a0b0f] z-20">
          <div className="max-w-3xl mx-auto space-y-3">
            
            {/* Inline file preview bar info */}
            {selectedImage && (
              <div className="bg-purple-600/10 border border-purple-500/20 rounded-xl p-3 flex items-center justify-between gap-4 animate-fade-in">
                <div className="flex items-center gap-3">
                  <img
                    src={selectedImage.base64}
                    alt="Preview"
                    className="w-10 h-10 object-cover rounded-lg border border-purple-500/30"
                  />
                  <div>
                    <span className="text-xs text-white block max-w-xs md:max-w-md truncate font-medium">
                      {selectedImage.name}
                    </span>
                    <span className="text-[10px] text-purple-400 uppercase font-mono">
                      Ko'rishga tayyor (Mime: {selectedImage.mimeType})
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedImage(null)}
                  className="p-1 px-2 text-rose-400 hover:bg-rose-500/10 rounded-lg text-xs font-semibold flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  <span>O'chirish</span>
                </button>
              </div>
            )}

            {/* Main Input Form container */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-end gap-2 bg-[#121319] border border-white/10 rounded-2xl px-3 py-2 focus-within:border-purple-500/50 focus-within:ring-2 focus-within:ring-purple-500/10 transition-all shadow-xl"
            >
              
              {/* Media upload activator button */}
              <button
                type="button"
                onClick={triggerImageUpload}
                title="Rasm yuklash"
                className="p-2 md:p-3 text-slate-400 hover:text-purple-400 hover:bg-white/5 active:scale-95 rounded-xl transition-all h-11 w-11 flex items-center justify-center shrink-0"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onFileInputChange}
                className="hidden"
              />

              {/* Text input area */}
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                rows={1}
                placeholder={activePersona.placeholder}
                className="flex-1 bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none max-h-36 overflow-y-auto py-2.5 text-sm md:text-[15px] text-white resize-none h-11 placeholder:text-slate-500 leading-tight"
                disabled={isGenerating}
              />

              {/* Submit trigger button */}
              <button
                type="submit"
                disabled={isGenerating || (!inputText.trim() && !selectedImage)}
                className={`p-2.5 md:p-3 rounded-xl flex items-center justify-center shrink-0 h-10 w-10 md:h-11 md:w-11 transition-all ${
                  isGenerating || (!inputText.trim() && !selectedImage)
                    ? "bg-white/5 text-slate-600 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-500 active:scale-95 text-white shadow-md shadow-purple-500/20"
                }`}
              >
                {isGenerating ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5 text-white" />
                )}
              </button>
            </form>

            {/* Technical disclaimer tag */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 font-mono">
              <span className="hidden md:inline">Shift + Enter yangi qatorga o'tish uchun</span>
              <span>NexusAI xato qilishi mumkin. Muhim ma'lumotlarni tekshiring.</span>
            </div>

          </div>
        </footer>
      </main>

      {/* SYSTEM SETTINGS & SYSTEM INSTRUCTIONS OVERLAY DIALOG */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#0e1017] border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative animate-fade-in">
            
            {/* Header bar */}
            <div className="p-4 border-b border-white/5 bg-[#141722] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-purple-400" />
                <h3 className="font-display font-bold text-white text-md">Tizim Sozlamalari (NexusAI)</h3>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Info container */}
            <div className="p-5 space-y-4">
              
              {/* Statistic blocks */}
              <div>
                <p className="text-xs text-slate-400 font-mono uppercase tracking-wider mb-2">Qurilmangiz statistikasi</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-[#151821] rounded-xl border border-white/5">
                    <span className="text-[10px] text-slate-500 block uppercase">Jami so'rovlar</span>
                    <span className="text-lg font-bold text-white">{totalQuestions} ta</span>
                  </div>
                  <div className="p-3 bg-[#151821] rounded-xl border border-white/5">
                    <span className="text-[10px] text-slate-500 block uppercase">Tezkor o'rtacha</span>
                    <span className="text-lg font-bold text-purple-400">
                      {avgResponseTime > 0 ? `${(avgResponseTime / 1000).toFixed(2)}s` : "Noaniq"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Model Choice setting block */}
              <div className="space-y-2 bg-[#151821] p-3 rounded-xl border border-white/5">
                <label className="text-xs text-slate-400 font-mono uppercase tracking-wider block">
                  Standart LLM Modeli
                </label>
                <select
                  value={activeSession.model || "gemini-3.5-flash"}
                  onChange={(e) => {
                    const selectedModel = e.target.value;
                    setSessions((prev) =>
                      prev.map((s) => (s.id === activeSessionId ? { ...s, model: selectedModel } : s))
                    );
                  }}
                  className="w-full bg-[#12141f] border border-white/10 rounded-xl p-2.5 text-xs md:text-sm text-[#a855f7] font-semibold font-mono focus:outline-none focus:border-purple-500"
                >
                  {AVAILABLE_MODELS.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#0e1017] text-white">
                      {m.name} ({m.id})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500">
                  Ushbu chat sessiyasi uchun foydalaniladigan model. Agar bittasida bepul so'rov limiti tugasa (Quota Error), boshqasiga o'tkazib sinab ko'ring.
                </p>
              </div>

              {/* Custom API Key input block */}
              <div className="space-y-2 bg-[#151821] p-3 rounded-xl border border-white/5">
                <label className="text-xs text-slate-400 font-mono uppercase tracking-wider block flex items-center justify-between">
                  <span>Shaxsiy Gemini API Key (Netlify / Statik rejim uchun)</span>
                  {userApiKey ? (
                    <span className="text-[9px] text-emerald-400 uppercase font-bold">Faol (Saqlangan)</span>
                  ) : (
                    <span className="text-[9px] text-amber-500 uppercase font-bold">Kiritilmagan</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={userApiKey}
                    onChange={(e) => setUserApiKey(e.target.value)}
                    className="w-full bg-[#12141f] border border-white/10 rounded-xl p-2.5 text-xs text-purple-300 font-mono focus:outline-none focus:border-purple-500"
                    placeholder="AI Studio API kalitini kiriting (masalan: AIzaSy...)"
                  />
                  {userApiKey && (
                    <button
                      type="button"
                      onClick={() => setUserApiKey("")}
                      className="absolute right-2 px-2 py-1 top-1.5 rounded-lg bg-rose-950/40 text-rose-300 hover:bg-rose-950/80 text-[10px] font-mono"
                    >
                      Tozalash
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Sizning kalitingiz orqa serverga yuborilmaydi va faqat brauzeringiz (localStorage) ichida saqlanadi. Kalit olish: <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">aistudio.google.com</a>
                </p>
              </div>

              {/* Instructions edit area */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-400 font-mono uppercase tracking-wider">
                    Model Shaxsiyati (System Instruction)
                  </label>
                  <button
                    onClick={() => {
                      // Reset to standard static text instruction
                      setSystemInstructionOverride(activePersona.systemInstruction);
                    }}
                    className="text-[10px] text-purple-400 hover:underline"
                  >
                    Asliga qaytarish
                  </button>
                </div>
                
                <textarea
                  value={systemInstructionOverride}
                  onChange={(e) => setSystemInstructionOverride(e.target.value)}
                  rows={4}
                  className="w-full bg-[#12141f] border border-white/10 rounded-xl p-3 text-xs md:text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                  placeholder="AI qoidalarini shu yerga yozing..."
                />
                
                <p className="text-[10px] text-slate-500 leading-normal">
                  Ushbu ko'rsatma AI javobni qanday taqdim qilishi kerakligini belgilaydi. O'zgartirilsa, keyingi barcha yuboriladigan xabarlarda qo'llaniladi.
                </p>
              </div>

              {/* Clean History section */}
              <div className="pt-4 border-t border-white/5 space-y-2">
                <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">Tizim xavfsizligi & Xotira</p>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-300 block font-medium">Barcha ma'lumotlarni tozalash</span>
                    <span className="text-[10px] text-slate-500 block">Bu barcha muloqotlar va statistikani o'chiradi</span>
                  </div>
                  <button
                    onClick={clearAllAppHistory}
                    className="px-3 py-2 bg-rose-950/40 text-rose-300 hover:bg-rose-900/30 border border-rose-500/20 text-xs rounded-xl font-semibold transition-colors"
                  >
                    O'chirib yuborish
                  </button>
                </div>
              </div>

            </div>

            {/* Footer buttons */}
            <div className="px-5 py-3.5 bg-[#141722] border-t border-white/5 flex justify-end">
              <button
                onClick={() => {
                  // Save custom instruction system setup back to memory
                  setSessions((prev) =>
                    prev.map((s) => (s.id === activeSessionId ? { ...s, systemInstruction: systemInstructionOverride } : s))
                  );
                  setShowSettings(false);
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-purple-900/20 active:scale-98"
              >
                O'zgarishlarni saqlash
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

// Simple fallback vector SVG icon
function UploadIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
      />
    </svg>
  );
}
