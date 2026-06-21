import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set limits higher to support image uploads
  app.use(express.json({ limit: "15mb" }));

  // Initialize Gemini Client
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Chat completions endpoint streaming answers via Server-Sent Events (SSE)
  app.post("/api/chat", async (req, res) => {
    try {
      const { messages, systemInstruction, model } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Xabarlar ro'yxati talab qilinadi." });
      }

      // Convert from application-agnostic schema to Gemini API schema
      const contents = messages.map((m: any) => {
        const parts: any[] = [];

        // Add user content text
        if (m.content) {
          parts.push({ text: m.content });
        }

        // Add inline image if provided
        if (m.image) {
          const mimeType = m.image.mimeType || "image/jpeg";
          // strip down data url preface if it's there
          let base64Data = m.image.base64;
          if (base64Data.includes("base64,")) {
            base64Data = base64Data.split("base64,")[1];
          }
          parts.push({
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          });
        }

        return {
          role: m.role === "assistant" ? "model" : "user",
          parts: parts.length > 0 ? parts : [{ text: "" }],
        };
      });

      // Use gemini-3.5-flash for general answers by default
      const modelName = model || "gemini-3.5-flash";

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let stream;
      let activeModelUsed = modelName;
      let fallbackTriggered = false;

      try {
        stream = await ai.models.generateContentStream({
          model: modelName,
          contents: contents,
          config: systemInstruction ? { systemInstruction } : undefined,
        });
      } catch (firstError: any) {
        const errorMsg = (firstError.message || "").toLowerCase();
        const isQuotaError = errorMsg.includes("quota") || errorMsg.includes("limit") || errorMsg.includes("429") || errorMsg.includes("exhausted");
        
        if (isQuotaError) {
          // Define a fallback list of robust alternative models
          const fallbackModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
          console.warn(`Primary model ${modelName} hit quota limit. Attempting auto-fallback list:`, fallbackModels);
          
          for (const fallbackModel of fallbackModels) {
            if (fallbackModel !== modelName) {
              try {
                stream = await ai.models.generateContentStream({
                  model: fallbackModel,
                  contents: contents,
                  config: systemInstruction ? { systemInstruction } : undefined,
                });
                activeModelUsed = fallbackModel;
                fallbackTriggered = true;
                break;
              } catch (fallbackError) {
                console.error(`Fallback failed for ${fallbackModel}, trying next...`);
              }
            }
          }
        }

        // If even fallback didn't match or assign, rethrow original error
        if (!stream) {
          throw firstError;
        }
      }

      // If we performed a fallback, stream a gentle visual notice to the user first
      if (fallbackTriggered) {
        res.write(`data: ${JSON.stringify({ text: `*⚠️ **Eslatma:** "${modelName}" modelida bepul so'rov limiti tugadi. NexusAI sizga yordam berishni to'xtatmaslik uchun avtomat ravishda tezkor muqobil **"${activeModelUsed}"** modeliga o'tkazildi.*\n\n` })}\n\n`);
      }

      for await (const chunk of stream) {
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error: any) {
      console.error("Gemini server error:", error);
      res.write(`data: ${JSON.stringify({ error: error.message || "Xatolik yuz berdi" })}\n\n`);
      res.end();
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", time: new Date() });
  });

  // Serve static assets in production, use Vite otherwise
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`NexusAI server is running on port ${PORT}`);
  });
}

startServer();
