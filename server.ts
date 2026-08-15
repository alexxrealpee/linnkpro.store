/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, Modality } from '@google/genai';
import dotenv from 'dotenv';
import { processVoiceAssistantMessage, processFallbackVoiceAssistantMessage } from './server/voiceAssistant';

// Load environmental variables
dotenv.config();

let aiClient: GoogleGenAI | null = null;

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not defined.");
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parsing middleware with expanded limit for catalog, audio and voice requests
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API Route: AI Link Extractor
  app.post('/api/gemini/parse-links', async (req, res) => {
    try {
      const { message } = req.body;
      if (!message || typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: "El mensaje no puede estar vacío." });
        return;
      }

      const ai = getGeminiClient();

      const candidateModels = ['gemini-3.7-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
      let response: any = null;
      for (const modelName of candidateModels) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: `Analiza el siguiente texto de usuario y extrae todos los enlaces (links/URLs).
Para cada enlace, determina un título profesional adecuado en español (por ejemplo, "Instagram" o "Mi Sitio Web"), la URL formateada correctamente (comenzando con https:// o http://), y un emoji relevante único de un solo carácter para usar de icono.

Texto del usuario:
"${message}"`,
            config: {
              systemInstruction: "Eres un asistente experto de Linnk.Pro, una plataforma SaaS de bio-links para creadores y empresas. Tu tarea es extraer de forma precisa y estructurada todos los enlaces provistos por el usuario.",
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  links: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: {
                          type: Type.STRING,
                          description: "Título corto y atractivo en español para el enlace."
                        },
                        url: {
                          type: Type.STRING,
                          description: "La dirección URL completa y corregida, asegurando que empiece con http:// o https://."
                        },
                        icon: {
                          type: Type.STRING,
                          description: "Un único carácter de emoji relevante para la red social o propósito del enlace (ej: 📸 para Instagram, 🛍️ para tienda, 🌐 para sitio web, 💼 para portafolio)."
                        }
                      },
                      required: ["title", "url", "icon"]
                    }
                  }
                },
                required: ["links"]
              }
            }
          });
          if (response) break;
        } catch (mErr) {
          console.warn(`Model ${modelName} error in parse-links, trying next...`);
        }
      }

      const responseText = response.text;
      if (!responseText) {
        throw new Error("No se pudo obtener una respuesta válida del asistente IA.");
      }

      const parsedData = JSON.parse(responseText.trim());
      res.json(parsedData);
    } catch (error: any) {
      console.error("Error in AI link parsing REST endpoint:", error);
      res.status(500).json({ 
        error: error.message || "Lo sentimos, hubo un error al procesar tu solicitud con la IA.",
        details: error.toString()
      });
    }
  });

  // API Route: AI Full Profile and Design generator
  app.post('/api/gemini/generate-profile-from-prompt', async (req, res) => {
    try {
      const { message } = req.body;
      if (!message || typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: "Por favor proveea una descripción o listado de enlaces." });
        return;
      }

      const ai = getGeminiClient();

      const candidateModels = ['gemini-3.7-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
      let response: any = null;
      for (const modelName of candidateModels) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: `Analiza el siguiente texto de usuario donde describe los enlaces que quiere crear o solicita que la IA genere un diseño para él.
Extrae todos los enlaces (corrigiendo URLs), define un Nombre de usuario (displayName), una biografía corta creativa (bio), y crea una propuesta de diseño visual (CustomTheme) totalmente única y profesional adaptada a su personalidad o al sector de sus enlaces (ej. Corporativo, Creativo, Gamer/Retro, Rosado Intenso, Minimalista, etc.).

Texto del usuario:
"${message}"`,
            config: {
              systemInstruction: `Eres "Linnk Copilot", el diseñador de interfaces estrella para Linnk.Pro (nuestra plataforma SaaS de bio-links).
Genera un esquema de diseño personalizado (CustomTheme) y de alta calidad técnica para la bio de este usuario. El diseño debe verse premium, balanceado y tener excelente contraste de accesibilidad (por ejemplo, textos claros en fondos oscuros, o textos muy oscuros en fondos claros).

Formatos válidos para:
- fontFamily: uno de ["font-sans", "font-mono", "font-serif", "font-display"]
- buttonStyle: uno de ["rounded", "pill", "square", "shadow", "bordered"]
- bgType: uno de ["flat", "gradient"]
- bgColor: si es flat, un color hex (ej: "#0b0f19"). Si es gradient, debes generar un gradiente CSS lineal con excelente balance cromático, por ejemplo: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #311042 100%)" o "linear-gradient(135deg, #10b981 0%, #064e3b 100%)". Debe combinar bien con el textColor generado.`,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  displayName: {
                    type: Type.STRING,
                    description: "Nombre público del usuario derivado de su texto o enlaces."
                  },
                  bio: {
                    type: Type.STRING,
                    description: "Una biografía de perfil profesional o amigable redactada en español, motivadora y resumida (máximo 140 caracteres)."
                  },
                  links: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: {
                          type: Type.STRING,
                          description: "Título corto y limpio para el enlace (ej: 'Canal de YouTube', 'Instagram Personal', 'Mi Tienda Online', 'Portafolio Profesional')."
                        },
                        url: {
                          type: Type.STRING,
                          description: "La dirección URL completa y corregida, asegurando que empiece con http:// o https://."
                        },
                        icon: {
                          type: Type.STRING,
                          description: "Un único emoji relevante para la red social o propósito del enlace."
                        }
                      },
                      required: ["title", "url", "icon"]
                    }
                  },
                  theme: {
                    type: Type.OBJECT,
                    properties: {
                      bgType: { type: Type.STRING },
                      bgColor: { type: Type.STRING, description: "Un string de color plano o un gradiente CSS premium (ej. linear-gradient(135deg, ...))." },
                      textColor: { type: Type.STRING, description: "Color de texto principal que tenga excelente contraste sobre el bgColor." },
                      cardBg: { type: Type.STRING, description: "Fondo de las tarjetas de enlace, como 'rgba(255,255,255,0.08)' para oscuros u '#ffffff' para claros." },
                      cardBorder: { type: Type.STRING, description: "Borde de la tarjeta, como 'rgba(255,255,255,0.12)' o 'rgba(0,0,0,0.08)'." },
                      cardTextColor: { type: Type.STRING, description: "Color de texto dentro de la tarjeta de enlace, que destaque perfectamente." },
                      fontFamily: { type: Type.STRING },
                      buttonStyle: { type: Type.STRING }
                    },
                    required: ["bgType", "bgColor", "textColor", "cardBg", "cardBorder", "cardTextColor", "fontFamily", "buttonStyle"]
                  }
                },
                required: ["displayName", "bio", "links", "theme"]
              }
            }
          });
          if (response) break;
        } catch (mErr) {
          console.warn(`Model ${modelName} error in generate-profile, trying next...`);
        }
      }

      const responseText = response.text;
      if (!responseText) {
        throw new Error("No se pudo obtener una respuesta válida del diseño IA.");
      }

      const parsedData = JSON.parse(responseText.trim());
      res.json(parsedData);
    } catch (error: any) {
      console.error("Error in AI full design REST endpoint:", error);
      res.status(500).json({ 
        error: error.message || "Lo sentimos, hubo un error al procesar tu solicitud con el diseñador IA.",
        details: error.toString()
      });
    }
  });

  // API Route: LinnkPro AI Voice Assistant
  app.post('/api/gemini/voice-assistant', async (req, res) => {
    const { message, history, catalogContext } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: "El mensaje de voz o texto no puede estar vacío." });
      return;
    }

    const safeContext = catalogContext || { products: [], stores: [], deliveryFee: 4000, cart: [] };

    try {
      let ai: GoogleGenAI | null = null;
      try {
        ai = getGeminiClient();
      } catch (e) {
        console.warn("Gemini client initialization skipped or missing API key, using smart local assistant fallback.");
      }

      if (ai) {
        const result = await processVoiceAssistantMessage(
          ai,
          message.trim(),
          history || [],
          safeContext
        );
        res.json(result);
      } else {
        const fallbackResult = processFallbackVoiceAssistantMessage(
          message.trim(),
          history || [],
          safeContext
        );
        res.json(fallbackResult);
      }
    } catch (error: any) {
      console.error("Error in LinnkPro AI Voice Assistant endpoint, serving fallback response:", error);
      const fallbackResult = processFallbackVoiceAssistantMessage(
        message.trim(),
        history || [],
        safeContext
      );
      res.json(fallbackResult);
    }
  });

  // API Route: LinnkPro AI Voice Text-to-Speech (TTS)
  app.post('/api/gemini/tts', async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: "El texto para sintetizar es obligatorio." });
        return;
      }

      const ai = getGeminiClient();
      // Format prices to pesos so TTS never speaks 'dólares'
      const cleanText = text
        .replace(/\$\s*([0-9]+(?:[.,][0-9]+)*)\s*(?:COP|cop)?/gi, '$1 pesos')
        .replace(/([0-9]+(?:[.,][0-9]+)*)\s*(?:COP|cop)/gi, '$1 pesos')
        .replace(/\$/g, '')
        .replace(/\bd[oó]lares\b/gi, 'pesos')
        .replace(/\bd[oó]lar\b/gi, 'peso')
        .replace(/[*_#`~]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .trim()
        .substring(0, 500);

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-tts-preview',
        contents: [{ parts: [{ text: cleanText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Aoede' }
            }
          }
        }
      });

      const audioPart = response.candidates?.[0]?.content?.parts?.[0];
      if (audioPart && audioPart.inlineData && audioPart.inlineData.data) {
        res.json({
          audio: audioPart.inlineData.data,
          mimeType: audioPart.inlineData.mimeType || 'audio/pcm;rate=24000'
        });
      } else {
        res.status(200).json({ fallback: true });
      }
    } catch (error: any) {
      // Seamlessly fallback to browser Web Speech API without noisy error logs
      res.status(200).json({ fallback: true, message: "Browser TTS fallback active" });
    }
  });

  // Serve static files / Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Linnk.Pro Express full-stack server running on http://localhost:${PORT}`);
  });
}

startServer();
