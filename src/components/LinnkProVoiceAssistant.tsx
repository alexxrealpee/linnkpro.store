/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  ShoppingBag,
  Store,
  X,
  Send,
  CheckCircle2,
  Clock,
  Truck,
  Plus,
  Minus,
  Trash2,
  MapPin,
  Phone,
  ArrowRight,
  RefreshCw,
  Bot,
  AlertCircle,
  MessageSquare,
  PhoneCall,
  PhoneOff,
  Radio,
  ChevronDown,
  AudioWaveform,
  AudioLines,
  Check,
  Loader2,
  ConciergeBell
} from 'lucide-react';
import { ProductItem, UserProfile, OrderItem } from '../types';
import { 
  fetchAllActiveProductsAndStores, 
  fetchSystemSettings, 
  saveOrder, 
  checkIsStoreClosed,
  findStoreForProduct,
  DEFAULT_PLATFORM_PRODUCTS, 
  DEFAULT_PLATFORM_STORES 
} from '../lib/firebase';
import { 
  getStoredCart, 
  addProductToCart, 
  updateCartQuantity, 
  removeProductFromCart, 
  clearAllCart, 
  calculateCartSummary, 
  GeneralCartItem, 
  CART_UPDATED_EVENT 
} from '../lib/cartHelper';
import { RealtimeMeseroManager } from '../lib/realtimeMeseroAgent';

interface LinnkProVoiceAssistantProps {
  onNavigateToStore?: (username: string) => void;
  onNavigateToTienda?: () => void;
  activeUsername?: string | null;
}

type AssistantVoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  actionPayload?: {
    type: 'PRODUCTS_SEARCHED' | 'CART_SUMMARY' | 'ORDER_CONFIRMATION_REQUESTED' | 'ORDER_CREATE_CONFIRMED' | 'ORDER_STATUS_RESULT' | 'RESTAURANT_MENU';
    data: any;
  };
}

export default function LinnkProVoiceAssistant({
  onNavigateToStore,
  onNavigateToTienda,
  activeUsername
}: LinnkProVoiceAssistantProps) {
  // Modal and real-time call states
  const [isOpen, setIsOpen] = useState(false);
  const [isInVoiceCall, setIsInVoiceCall] = useState(false);
  const [activeTab, setActiveTab] = useState<'call' | 'chat'>('call');
  const [callDuration, setCallDuration] = useState(0);

  // Assistant states
  const [assistantState, setAssistantState] = useState<AssistantVoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [inputText, setInputText] = useState('');
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [micAudioLevel, setMicAudioLevel] = useState(0);
  const [listeningMode, setListeningMode] = useState<'continuous' | 'push_to_talk'>('continuous');

  // Chat stream messages
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: `¡Hola! 👋 Soy IAMesero 🤖🍽️\n\nPuedes hablar conmigo por voz o texto para consultar restaurantes abiertos, elegir tus platos favoritos, armar tu carrito y confirmar tu pedido.\n\n🎙️ Solo dime qué se te antoja comer hoy y yo me encargo de todo.`,
      timestamp: new Date()
    }
  ]);

  // Catalog and system data cache with instant preloaded defaults
  const [catalogProducts, setCatalogProducts] = useState<ProductItem[]>(DEFAULT_PLATFORM_PRODUCTS);
  const [catalogStores, setCatalogStores] = useState<Record<string, UserProfile>>(DEFAULT_PLATFORM_STORES);
  const [systemDeliveryFee, setSystemDeliveryFee] = useState<number>(4000);
  const [cart, setCart] = useState<GeneralCartItem[]>(getStoredCart());
  const [isOrdering, setIsOrdering] = useState(false);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);

  // Audio & Speech recognition refs
  const recognitionRef = useRef<any>(null);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Real-time conversation loop & VAD refs
  const isInVoiceCallRef = useRef<boolean>(false);
  const isRecognitionRunningRef = useRef<boolean>(false);
  const assistantStateRef = useRef<AssistantVoiceState>('idle');
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestTranscriptRef = useRef<string>('');
  const isSpeakingRef = useRef<boolean>(false);
  const isMicMutedRef = useRef<boolean>(false);
  const listeningModeRef = useRef<'continuous' | 'push_to_talk'>('continuous');
  const lastRestartTimeRef = useRef<number>(0);
  const realtimeManagerRef = useRef<RealtimeMeseroManager | null>(null);

  // Helper to detect mobile device
  const isMobile = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Synchronize refs with state for asynchronous event handlers
  useEffect(() => {
    isInVoiceCallRef.current = isInVoiceCall;
  }, [isInVoiceCall]);

  useEffect(() => {
    listeningModeRef.current = listeningMode;
  }, [listeningMode]);

  useEffect(() => {
    assistantStateRef.current = assistantState;
  }, [assistantState]);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  // Automatically end voice call when user switches to chat mode
  useEffect(() => {
    if (activeTab === 'chat' && isInVoiceCallRef.current) {
      endVoiceCall();
    }
  }, [activeTab]);

  // 1. Sync Cart across events
  useEffect(() => {
    const handleCartUpdate = (e: any) => {
      if (e?.detail?.cart) {
        setCart(e.detail.cart);
      } else {
        setCart(getStoredCart());
      }
    };

    window.addEventListener(CART_UPDATED_EVENT, handleCartUpdate);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, handleCartUpdate);
    };
  }, []);

  // 2. Fetch Catalog Context & Delivery Fee
  const loadCatalogData = async () => {
    try {
      const [catalogData, settings] = await Promise.all([
        fetchAllActiveProductsAndStores(),
        fetchSystemSettings().catch(() => ({ defaultDeliveryFee: 4000 }))
      ]);

      if (catalogData && catalogData.products) {
        const profiles = catalogData.profiles || {};
        let onlyOpenProducts = catalogData.products.filter(p => {
          if (p.active === false) return false;
          const store = findStoreForProduct(p, profiles);
          if (store) {
            return !checkIsStoreClosed(store) && !store.suspended;
          }
          return true;
        });

        // Fallback: if all products were filtered out, keep all active products
        if (onlyOpenProducts.length === 0 && catalogData.products.length > 0) {
          onlyOpenProducts = catalogData.products.filter(p => p.active !== false);
        }

        setCatalogProducts(onlyOpenProducts);
        setCatalogStores(profiles);
      }
      if (settings && typeof settings.defaultDeliveryFee === 'number') {
        setSystemDeliveryFee(settings.defaultDeliveryFee);
      }
    } catch (e) {
      console.warn("Could not pre-fetch full catalog for voice assistant:", e);
    }
  };

  useEffect(() => {
    loadCatalogData();
  }, []);

  // 3. Call Duration Timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isInVoiceCall) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [isInVoiceCall]);

  // 4. Scroll to bottom of chat
  useEffect(() => {
    if (isOpen && activeTab === 'chat') {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages, isOpen, activeTab]);

  // 5. Initialize Web Audio Visualizer (Dynamic Pulse Simulation without blocking hardware mic)
  const initAudioAnalyser = () => {
    let t = 0;
    const updateLevel = () => {
      if (isInVoiceCallRef.current) {
        t += 0.08;
        if (assistantStateRef.current === 'listening') {
          // Dynamic organic pulse while listening
          const level = Math.sin(t * 2) * 0.25 + 0.35 + (latestTranscriptRef.current ? 0.3 : 0);
          setMicAudioLevel(Math.max(0.1, Math.min(1, level)));
        } else if (assistantStateRef.current === 'speaking') {
          // High energetic rhythmic pulse while speaking
          const level = Math.abs(Math.sin(t * 4)) * 0.6 + 0.4;
          setMicAudioLevel(Math.min(1, level));
        } else {
          setMicAudioLevel(0.05);
        }
        animFrameRef.current = requestAnimationFrame(updateLevel);
      }
    };
    animFrameRef.current = requestAnimationFrame(updateLevel);
  };

  const stopAudioAnalyser = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setMicAudioLevel(0);
  };

  // 6. Stop any active TTS audio playback (Supports Interruption / Barge-in)
  const stopAudioPlayback = () => {
    isSpeakingRef.current = false;
    if (currentAudioSourceRef.current) {
      try {
        currentAudioSourceRef.current.stop();
        currentAudioSourceRef.current.disconnect();
      } catch (e) {}
      currentAudioSourceRef.current = null;
    }
    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
  };

  // Safe SpeechRecognition start & stop helpers (prevents InvalidStateError & mobile mic flapping)
  const safeStartRecognition = () => {
    if (!recognitionRef.current || !isInVoiceCallRef.current || isRecognitionRunningRef.current || isSpeakingRef.current || assistantStateRef.current === 'processing' || isMicMutedRef.current) {
      return;
    }
    try {
      isRecognitionRunningRef.current = true;
      recognitionRef.current.start();
    } catch (err: any) {
      if (err?.name === 'InvalidStateError' || err?.message?.includes('already started')) {
        isRecognitionRunningRef.current = true;
      } else {
        isRecognitionRunningRef.current = false;
      }
    }
  };

  const safeStopRecognition = () => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.abort();
    } catch (e) {}
    isRecognitionRunningRef.current = false;
  };

  // 7. Initialize Speech Recognition with Hands-Free VAD optimized for mobile & desktop
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      // Continuous mode ensures Android Chrome and iOS Safari do not disconnect the microphone every 2 seconds
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = 'es-CO'; // Colombian Spanish

      recognition.onstart = () => {
        isRecognitionRunningRef.current = true;
        setMicPermissionError(null);
        if (isInVoiceCallRef.current && !isSpeakingRef.current && assistantStateRef.current !== 'processing') {
          setAssistantState('listening');
        }
      };

      recognition.onresult = (event: any) => {
        if (isMicMutedRef.current || isSpeakingRef.current || assistantStateRef.current === 'processing') return;

        let fullTranscript = '';
        let isFinal = false;
        for (let i = 0; i < event.results.length; ++i) {
          fullTranscript += event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            isFinal = true;
          }
        }

        const trimmed = fullTranscript.trim();
        if (trimmed) {
          setTranscript(trimmed);
          latestTranscriptRef.current = trimmed;

          // VAD SILENCE DETECTION: Reset timer every time new speech is detected
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }

          // Auto-send when user finishes speaking (smooth pause detection)
          const delay = isFinal ? 800 : 1300;
          silenceTimerRef.current = setTimeout(() => {
            if (isInVoiceCallRef.current && latestTranscriptRef.current && assistantStateRef.current === 'listening' && !isSpeakingRef.current) {
              const textToSend = latestTranscriptRef.current;
              latestTranscriptRef.current = '';
              setTranscript('');
              handleSendMessage(textToSend);
            }
          }, delay);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn("Speech recognition notice:", event.error);
        }
        isRecognitionRunningRef.current = false;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture') {
          setMicPermissionError('Permiso de micrófono denegado. Toca el candado en la barra de direcciones de tu navegador para autorizar el micrófono.');
          setIsInVoiceCall(false);
          isInVoiceCallRef.current = false;
          setAssistantState('idle');
          stopAudioAnalyser();
        }
      };

      recognition.onend = () => {
        isRecognitionRunningRef.current = false;
        // In continuous hands-free mode: gently re-open ONLY if not speaking, not processing, and throttled (preventing Android flashing)
        if (
          isInVoiceCallRef.current &&
          !isSpeakingRef.current &&
          assistantStateRef.current === 'listening' &&
          !isMicMutedRef.current &&
          listeningModeRef.current === 'continuous'
        ) {
          const now = Date.now();
          if (now - lastRestartTimeRef.current > 700) {
            lastRestartTimeRef.current = now;
            setTimeout(() => {
              if (
                isInVoiceCallRef.current &&
                !isSpeakingRef.current &&
                assistantStateRef.current === 'listening' &&
                !isMicMutedRef.current
              ) {
                safeStartRecognition();
              }
            }, 300);
          }
        } else if (!isInVoiceCallRef.current) {
          setAssistantState('idle');
        }
      };

      recognitionRef.current = recognition;
    } else {
      setMicPermissionError('Tu navegador no soporta reconocimiento por voz directo. Puedes usar el campo de chat.');
    }

    // Pre-cache voices when available
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }

    return () => {
      stopAudioPlayback();
      stopAudioAnalyser();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
      isRecognitionRunningRef.current = false;
    };
  }, []);

  // 8. Start & End Real-Time Voice Call Session
  const startVoiceCall = async () => {
    setIsOpen(true);
    setIsInVoiceCall(true);
    isInVoiceCallRef.current = true;
    setActiveTab('call');
    setTranscript('');
    latestTranscriptRef.current = '';
    setAssistantState('listening');
    setMicPermissionError(null);

    // Warm up AudioContext & SpeechSynthesis synchronously on user gesture (Crucial for mobile Chrome)
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtxClass();
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.resume();
      }
    } catch (e) {}

    stopAudioPlayback();
    initAudioAnalyser();

    // Try OpenAI Realtime WebRTC session
    try {
      if (!realtimeManagerRef.current) {
        realtimeManagerRef.current = new RealtimeMeseroManager({
          onStateChange: (state) => {
            setAssistantState(state);
            assistantStateRef.current = state;
          },
          onTranscriptDelta: (text, isFinal, sender) => {
            if (sender === 'user') {
              setTranscript(text);
              if (isFinal) {
                setMessages(prev => [
                  ...prev,
                  { id: 'usr_' + Date.now(), sender: 'user', text, timestamp: new Date() }
                ]);
              }
            } else {
              setTranscript(text);
              if (isFinal) {
                setMessages(prev => [
                  ...prev,
                  { id: 'asst_' + Date.now(), sender: 'assistant', text, timestamp: new Date() }
                ]);
              }
            }
          },
          onCartUpdated: (updatedCart) => {
            setCart(updatedCart);
          },
          onError: (err) => {
            console.warn("Realtime WebRTC connection notice, fallback voice active:", err);
          }
        });
      }

      await realtimeManagerRef.current.start();
    } catch (realtimeErr) {
      console.info("Falling back to standard streaming voice assistant engine:", realtimeErr);
      setTimeout(() => {
        safeStartRecognition();
      }, 150);
    }
  };

  const endVoiceCall = () => {
    setIsInVoiceCall(false);
    isInVoiceCallRef.current = false;
    setAssistantState('idle');
    setTranscript('');
    latestTranscriptRef.current = '';
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    if (realtimeManagerRef.current) {
      realtimeManagerRef.current.stop();
    }

    stopAudioPlayback();
    stopAudioAnalyser();
    safeStopRecognition();
  };

  // Interactive Central Mic Tap Handler (Interrupts AI or forces send/listen)
  const handleCentralMicClick = () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(35);
      }
    } catch (e) {}

    if (!isInVoiceCallRef.current) {
      startVoiceCall();
      return;
    }

    // 1. If AI is speaking -> User taps to interrupt immediately & start talking
    if (isSpeakingRef.current || assistantStateRef.current === 'speaking') {
      stopAudioPlayback();
      setAssistantState('listening');
      safeStartRecognition();
      return;
    }

    // 2. If speech is already recognized in transcript -> Tap sends instantly
    if (transcript.trim()) {
      const textToSend = transcript.trim();
      setTranscript('');
      latestTranscriptRef.current = '';
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      handleSendMessage(textToSend);
      return;
    }

    // 3. If in Push-to-Talk mode and idle/listening
    if (listeningMode === 'push_to_talk') {
      if (isRecognitionRunningRef.current) {
        safeStopRecognition();
      } else {
        safeStartRecognition();
      }
      return;
    }

    // 4. In Continuous mode: If listening in silence -> Re-arm recognition cleanly once
    safeStopRecognition();
    setTimeout(() => {
      safeStartRecognition();
    }, 150);
  };

  // 9. Play audio response with Web Audio (MP3/PCM) or Web Speech API
  const playVoiceResponse = async (text: string, audioBase64?: string) => {
    if (isVoiceMuted) {
      if (isInVoiceCallRef.current) {
        setAssistantState('listening');
        setTimeout(() => {
          if (isInVoiceCallRef.current && assistantStateRef.current === 'listening') {
            safeStartRecognition();
          }
        }, 250);
      } else {
        setAssistantState('idle');
      }
      return;
    }

    safeStopRecognition();
    stopAudioPlayback();
    isSpeakingRef.current = true;
    setAssistantState('speaking');

    // Callback when AI finishes speaking -> resume listening with grace period
    const onSpeechComplete = () => {
      isSpeakingRef.current = false;
      currentAudioSourceRef.current = null;
      if (isInVoiceCallRef.current) {
        setAssistantState('listening');
        setTranscript('');
        latestTranscriptRef.current = '';
        setTimeout(() => {
          if (isInVoiceCallRef.current && !isSpeakingRef.current && assistantStateRef.current === 'listening') {
            safeStartRecognition();
          }
        }, 350);
      } else {
        setAssistantState('idle');
      }
    };

    if (audioBase64) {
      try {
        const binaryString = atob(audioBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContextClass();
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        let audioBuffer: AudioBuffer | null = null;

        // 1. Try browser native decodeAudioData (decodes OpenAI MP3, WAV, AAC)
        try {
          const bufferCopy = bytes.buffer.slice(0);
          audioBuffer = await ctx.decodeAudioData(bufferCopy);
        } catch (decodeErr) {
          // 2. Fallback to Gemini 24kHz raw PCM decoding
          try {
            const int16Array = new Int16Array(bytes.buffer);
            const float32Array = new Float32Array(int16Array.length);
            for (let i = 0; i < int16Array.length; i++) {
              float32Array[i] = int16Array[i] / 32768;
            }
            audioBuffer = ctx.createBuffer(1, float32Array.length, 24000);
            audioBuffer.getChannelData(0).set(float32Array);
          } catch (pcmErr) {
            audioBuffer = null;
          }
        }

        if (audioBuffer) {
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          currentAudioSourceRef.current = source;

          source.onended = onSpeechComplete;
          source.start();
          return;
        }
      } catch (err) {
        console.warn("Audio playback error, falling back to Web Speech API:", err);
      }
    }

    // Fallback: Enhanced Web Speech API synthesis (Natural, Neural, Warm Colombian Spanish Voice)
    if ('speechSynthesis' in window) {
      // Natural human phonetic formatting for fluent conversational reading
      const cleanSpeech = text
        .replace(/[\u{1F600}-\u{1F6FF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .replace(/[*_#`~>]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\b1x\s+/gi, 'una porción de ')
        .replace(/\b2x\s+/gi, 'dos porciones de ')
        .replace(/\b3x\s+/gi, 'tres porciones de ')
        .replace(/\$\s*([0-9]{1,3})\.000\s*(?:COP|cop|pesos)?/gi, '$1 mil pesos')
        .replace(/\$\s*([0-9]{1,3})\.500\s*(?:COP|cop|pesos)?/gi, '$1 mil quinientos pesos')
        .replace(/\$\s*([0-9]+(?:[.,][0-9]+)*)\s*(?:COP|cop)?/gi, '$1 pesos')
        .replace(/([0-9]+(?:[.,][0-9]+)*)\s*(?:COP|cop)/gi, '$1 pesos')
        .replace(/\$/g, '')
        .replace(/\bd[oó]lares\b/gi, 'pesos')
        .replace(/\bd[oó]lar\b/gi, 'peso')
        .replace(/([0-9]+)\.000\s*pesos/gi, '$1 mil pesos')
        .replace(/([0-9]+)\.500\s*pesos/gi, '$1 mil quinientos pesos')
        .replace(/([0-9]+)\.([0-9]{3})\s*pesos/gi, '$1 mil $2 pesos')
        .replace(/¡/g, '')
        .replace(/!/g, '. ')
        .replace(/\s+/g, ' ')
        .trim();

      const utterance = new SpeechSynthesisUtterance(cleanSpeech);
      utterance.lang = 'es-CO';
      utterance.rate = 0.95; // Relaxed, friendly human pacing
      utterance.pitch = 1.0; // Natural warm pitch

      const voices = window.speechSynthesis.getVoices();
      const spanishVoices = voices.filter(v => v.lang.toLowerCase().includes('es') || v.lang.toLowerCase().startsWith('es'));

      // Preferred natural and neural voice identifiers across Windows, macOS, iOS, Android, and Chrome
      const naturalKeywords = ['natural', 'neural', 'online', 'enhanced', 'premium', 'high quality'];
      const preferredFemaleNames = [
        'salome', 'dalia', 'jimena', 'paloma', 'monica', 'mónica', 'paulina', 'helena', 'lucia', 'lucía',
        'laura', 'sofia', 'sofía', 'sabina', 'camila', 'valentina', 'victoria', 'google español',
        'es-co', 'es_co'
      ];
      const maleKeywords = [
        'male', 'hombre', 'jorge', 'diego', 'miguel', 'carlos', 'pablo', 'raul',
        'david', 'alvaro', 'enrique', 'juan', 'manuel', 'antonio'
      ];

      // 1. Top priority: Neural/Natural Spanish Colombian or Latin American female voice
      let bestVoice = spanishVoices.find(v => {
        const nameLower = v.name.toLowerCase();
        const isNatural = naturalKeywords.some(kw => nameLower.includes(kw));
        const isPref = preferredFemaleNames.some(kw => nameLower.includes(kw));
        const isMale = maleKeywords.some(kw => nameLower.includes(kw));
        return (isNatural && isPref) && !isMale;
      });

      // 2. Second priority: Any Neural/Natural voice that isn't male
      if (!bestVoice) {
        bestVoice = spanishVoices.find(v => {
          const nameLower = v.name.toLowerCase();
          const isNatural = naturalKeywords.some(kw => nameLower.includes(kw));
          const isMale = maleKeywords.some(kw => nameLower.includes(kw));
          return isNatural && !isMale;
        });
      }

      // 3. Third priority: Preferred female names in Spanish
      if (!bestVoice) {
        bestVoice = spanishVoices.find(v => {
          const nameLower = v.name.toLowerCase();
          const isPref = preferredFemaleNames.some(kw => nameLower.includes(kw));
          const isMale = maleKeywords.some(kw => nameLower.includes(kw));
          return isPref && !isMale;
        });
      }

      // 4. Fourth priority: Any Spanish voice that is not explicitly male
      if (!bestVoice) {
        bestVoice = spanishVoices.find(v => {
          const nameLower = v.name.toLowerCase();
          return !maleKeywords.some(kw => nameLower.includes(kw));
        });
      }

      // 5. Fallback to any available Spanish voice
      if (!bestVoice && spanishVoices.length > 0) {
        bestVoice = spanishVoices[0];
      }

      if (bestVoice) {
        utterance.voice = bestVoice;
      }

      utterance.onend = onSpeechComplete;
      utterance.onerror = onSpeechComplete;

      window.speechSynthesis.speak(utterance);
    } else {
      onSpeechComplete();
    }
  };

  // Fallback client-side matching engine when backend API or network connection is interrupted
  const computeClientLocalVoiceResponse = (
    userText: string,
    products: ProductItem[],
    stores: Record<string, UserProfile>,
    currentCart: GeneralCartItem[],
    deliveryFee: number
  ) => {
    const lower = userText.toLowerCase().trim();
    const executedActions: any[] = [];
    let responseText = '';

    let activeProducts = products.filter(p => {
      if (p.active === false) return false;
      const store = findStoreForProduct(p, stores);
      if (store) {
        return !checkIsStoreClosed(store) && !store.suspended;
      }
      return true;
    });
    if (activeProducts.length === 0 && products.length > 0) {
      activeProducts = products.filter(p => p.active !== false);
    }

    // 0. Query about open stores or restaurants
    if (
      (lower.includes('tienda') || lower.includes('tiendas') || lower.includes('restaurante') || lower.includes('restaurantes') || lower.includes('local') || lower.includes('locales') || lower.includes('negocio') || lower.includes('negocios')) &&
      (lower.includes('abiert') || lower.includes('hay') || lower.includes('cuales') || lower.includes('cuáles') || lower.includes('disponible') || lower.includes('ver') || lower.includes('mostrar') || lower.includes('lista'))
    ) {
      const storeList = Object.values(stores).filter(s => s && !s.suspended);
      const safeStores = storeList.length > 0 ? storeList : [];
      const storeNames = safeStores.slice(0, 5).map(s => s.displayName || s.username).join(', ');

      executedActions.push({
        type: 'OPEN_STORES_LISTED',
        stores: safeStores.slice(0, 10)
      });

      if (safeStores.length > 0) {
        responseText = `¡Sí, claro! Tenemos abiertos y disponibles los siguientes restaurantes y tiendas: ${storeNames}. ¿Qué se te antoja ordenar hoy?`;
      } else if (activeProducts.length > 0) {
        const topProds = activeProducts.slice(0, 3).map(p => `${p.name} por ${p.price.toLocaleString('es-CO')} pesos`).join(', ');
        responseText = `Tenemos deliciosos platos listos para ti como: ${topProds}. ¿Te gustaría que agregue alguno a tu pedido?`;
      } else {
        responseText = `Nuestros restaurantes afiliados están listos para atenderte. ¿Qué te gustaría ordenar hoy?`;
      }
    }
    // 1. Check cart request
    else if (lower.includes('carrito') || lower.includes('que tengo') || lower.includes('qué tengo') || lower.includes('mis platos') || lower.includes('ver orden')) {
      const totalAmount = currentCart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
      const itemCount = currentCart.reduce((sum, item) => sum + item.quantity, 0);
      executedActions.push({
        type: 'CART_SUMMARY',
        cart: currentCart,
        totalAmount,
        itemCount
      });

      if (currentCart.length === 0) {
        responseText = 'Tu carrito de compras está vacío actualmente. Puedes pedirme pollo asado, hamburguesas, pizzas o consultar nuestros menús.';
      } else {
        const itemsList = currentCart.map(i => `${i.quantity}x ${i.product.name}`).join(', ');
        responseText = `Tienes ${itemCount} plato(s) en tu carrito: ${itemsList}. Subtotal: ${totalAmount.toLocaleString('es-CO')} pesos. ¿Deseas confirmar tu pedido?`;
      }
    }
    // 2. Add to cart request
    else if (lower.includes('quiero') || lower.includes('agrega') || lower.includes('pedir') || lower.includes('ordenar') || lower.includes('añade') || lower.includes('dame')) {
      let qty = 1;
      const matchNum = lower.match(/\b(\d+)\b/);
      if (matchNum) {
        qty = parseInt(matchNum[1], 10);
      } else if (lower.includes('dos') || lower.includes('2')) {
        qty = 2;
      } else if (lower.includes('tres') || lower.includes('3')) {
        qty = 3;
      }

      const candidate = activeProducts.find(p => {
        const pName = (p.name || '').toLowerCase();
        const pWords = pName.split(/\s+/);
        return pWords.some(w => w.length > 3 && lower.includes(w)) || lower.includes(pName);
      });

      if (candidate) {
        executedActions.push({
          type: 'ADD_TO_CART',
          product: candidate,
          quantity: qty
        });
        responseText = `¡Listo! He agregado ${qty} ${candidate.name} a tu carrito por ${(candidate.price * qty).toLocaleString('es-CO')} pesos. ¿Deseas algo más o confirmamos tu pedido?`;
      } else {
        const searchMatches = activeProducts.filter(p => {
          const pName = (p.name || '').toLowerCase();
          const pCat = (p.category || '').toLowerCase();
          return lower.includes(pName) || (pCat && lower.includes(pCat)) || pName.split(/\s+/).some(w => w.length > 3 && lower.includes(w));
        });
        const topItems = (searchMatches.length > 0 ? searchMatches : activeProducts).slice(0, 3);
        responseText = `Tenemos opciones como: ${topItems.map(p => `${p.name} por ${p.price.toLocaleString('es-CO')} pesos`).join(', ')}. ¿Cuál deseas agregar?`;
      }
    }
    // 3. Search / Menu queries
    else if (
      lower.includes('pizza') || lower.includes('hamburguesa') || lower.includes('pollo') || 
      lower.includes('pechuga') || lower.includes('alita') || lower.includes('broaster') || 
      lower.includes('asado') || lower.includes('salchipapa') || lower.includes('perro') || 
      lower.includes('bebida') || lower.includes('menu') || lower.includes('menú') || 
      lower.includes('platos') || lower.includes('restaurantes') || lower.includes('comida') || lower.includes('comer')
    ) {
      const rawTokens = lower.split(/\s+/).map(t => t.replace(/[^a-záéíóúüñ0-9]/gi, '')).filter(t => t.length >= 3);
      const searchMatches = activeProducts.filter(p => {
        const pName = (p.name || '').toLowerCase();
        const pCat = (p.category || '').toLowerCase();
        const pDesc = (p.description || '').toLowerCase();

        if (lower.includes('pollo') || lower.includes('pollos')) {
          if (pName.includes('pollo') || pCat.includes('pollo') || pDesc.includes('pollo') || pName.includes('pechuga') || pName.includes('alitas') || pName.includes('broaster')) return true;
        }
        if (lower.includes('hamburguesa') || lower.includes('burger')) {
          if (pName.includes('hamburguesa') || pCat.includes('hamburguesa') || pName.includes('burger') || pDesc.includes('angus')) return true;
        }
        if (lower.includes('pizza')) {
          if (pName.includes('pizza') || pCat.includes('pizza')) return true;
        }
        return rawTokens.some(tok => {
          const singular = tok.endsWith('s') ? tok.slice(0, -1) : tok;
          return pName.includes(tok) || pName.includes(singular) || pCat.includes(tok) || pDesc.includes(tok);
        }) || lower.includes(pName);
      });

      const finalResults = searchMatches.length > 0 ? searchMatches : activeProducts;
      executedActions.push({
        type: 'PRODUCTS_SEARCHED',
        query: userText,
        results: finalResults.slice(0, 8),
        stores: Object.values(stores).slice(0, 4)
      });

      const topItems = finalResults.slice(0, 3).map(p => `${p.name} por ${p.price.toLocaleString('es-CO')} pesos en ${stores[p.userId]?.displayName || 'el restaurante'}`).join(', ');
      responseText = `Encontré estas opciones deliciosas: ${topItems}. ¿Te gustaría que agregue alguna a tu carrito?`;
    }
    // 4. Confirm order request
    else if (lower.includes('confirm') || lower.includes('hacer pedido') || lower.includes('enviar pedido') || lower.includes('finalizar')) {
      if (currentCart.length === 0) {
        responseText = 'Tu carrito está vacío. Agrega primero los platos que deseas ordenar.';
      } else {
        const subtotal = currentCart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
        const grandTotal = subtotal + deliveryFee;
        executedActions.push({
          type: 'ORDER_CONFIRMATION_REQUESTED',
          orderProposal: {
            itemsCount: currentCart.length,
            subtotal,
            deliveryFee,
            grandTotal,
            customerName: 'Cliente',
            customerPhone: '',
            customerAddress: 'Dirección de entrega',
            paymentMethod: 'delivery_cash'
          }
        });
        responseText = `El total de tu pedido es ${grandTotal.toLocaleString('es-CO')} pesos con domicilio incluido. Por favor confirma tus datos de entrega en pantalla para enviarlo.`;
      }
    }
    // 5. Default greeting & assistance
    else {
      const sample = activeProducts.slice(0, 3).map(p => `${p.name} (${p.price.toLocaleString('es-CO')} pesos)`).join(', ');
      responseText = `¡Hola! Soy tu asistente LinnkPro. Puedes pedir platos como ${sample}, o consultar restaurantes. ¿Qué te gustaría ordenar hoy?`;
    }

    return {
      text: responseText,
      actions: executedActions
    };
  };

  // 10. Handle Send Message to Gemini Voice Assistant
  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend || !textToSend.trim()) return;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    safeStopRecognition();
    stopAudioPlayback();
    setTranscript('');
    latestTranscriptRef.current = '';
    setInputText('');

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: textToSend.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setAssistantState('processing');

    try {
      // Ensure catalog data is loaded and up to date
      let currentStores = catalogStores;
      let currentProducts = catalogProducts;
      if (currentProducts.length === 0 || Object.keys(currentStores).length === 0) {
        try {
          const freshData = await fetchAllActiveProductsAndStores();
          if (freshData && freshData.products) {
            currentStores = freshData.profiles || {};
            currentProducts = freshData.products.filter(p => p.active !== false);
            setCatalogStores(currentStores);
            setCatalogProducts(currentProducts);
          }
        } catch (e) {}
      }

      // Build catalog context with real data (open stores and active products)
      const storeMap = new Map<string, any>();
      (Object.values(currentStores) as UserProfile[]).forEach(s => {
        if (s && s.uid && !s.suspended && !storeMap.has(s.uid)) {
          storeMap.set(s.uid, {
            uid: s.uid,
            username: s.username || '',
            displayName: s.displayName || s.username || 'Tienda',
            bio: s.bio || '',
            address: s.address || '',
            phone: s.phone || '',
            whatsapp: s.whatsapp || '',
            isClosed: false
          });
        }
      });

      // Also extract and ensure stores for all active products are included
      currentProducts.forEach(p => {
        if (p.active !== false) {
          const store = findStoreForProduct(p, currentStores);
          if (store && store.uid && !store.suspended && !storeMap.has(store.uid)) {
            storeMap.set(store.uid, {
              uid: store.uid,
              username: store.username || '',
              displayName: store.displayName || store.username || 'Tienda',
              bio: store.bio || '',
              address: store.address || '',
              phone: store.phone || '',
              whatsapp: store.whatsapp || '',
              isClosed: false
            });
          }
        }
      });

      const storesArray = Array.from(storeMap.values());

      let productsArray = currentProducts
        .filter(p => {
          if (p.active === false) return false;
          const store = findStoreForProduct(p, currentStores);
          if (store) {
            return !checkIsStoreClosed(store) && !store.suspended;
          }
          return true;
        })
        .map(p => {
          const store = findStoreForProduct(p, currentStores);
          return {
            id: p.id,
            userId: p.userId || store?.uid || '',
            name: p.name,
            description: p.description || '',
            price: p.price,
            stock: p.stock,
            category: p.category || 'General',
            imageURL: p.imageURL && p.imageURL.startsWith('data:') ? undefined : p.imageURL,
            storeName: store?.displayName || 'Tienda',
            storeUsername: store?.username || '',
            active: p.active
          };
        });

      if (productsArray.length === 0 && currentProducts.length > 0) {
        productsArray = currentProducts.filter(p => p.active !== false).map(p => {
          const store = findStoreForProduct(p, currentStores);
          return {
            id: p.id,
            userId: p.userId || store?.uid || '',
            name: p.name,
            description: p.description || '',
            price: p.price,
            stock: p.stock,
            category: p.category || 'General',
            imageURL: p.imageURL && p.imageURL.startsWith('data:') ? undefined : p.imageURL,
            storeName: store?.displayName || 'Tienda',
            storeUsername: store?.username || '',
            active: p.active
          };
        });
      }

      const currentCart = getStoredCart();
      const cartPayload = currentCart.map(c => ({
        id: c.id,
        productId: c.product.id,
        name: c.product.name,
        price: c.product.price,
        quantity: c.quantity,
        selectedVariant: c.selectedVariant,
        imageURL: c.product.imageURL && c.product.imageURL.startsWith('data:') ? undefined : c.product.imageURL,
        storeName: catalogStores[c.product.userId]?.displayName || 'Tienda',
        userId: c.product.userId
      }));

      // Map confirmed prior history strictly alternating and non-empty
      const historyPayload: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
      messages.slice(-8).forEach(m => {
        if (m.text && m.text.trim()) {
          const role = m.sender === 'user' ? 'user' : 'model';
          historyPayload.push({
            role,
            parts: [{ text: m.text.trim() }]
          });
        }
      });

      let result: any = null;

      try {
        // Call backend voice assistant endpoint (ChatGPT GPT-4o)
        const response = await fetch('/api/voice-assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: textToSend.trim(),
            history: historyPayload,
            catalogContext: {
              products: productsArray,
              stores: storesArray,
              deliveryFee: systemDeliveryFee,
              cart: cartPayload
            }
          })
        });

        if (response.ok) {
          result = await response.json();
        }
      } catch (fetchErr) {
        console.warn("Backend fetch failed, activating resilient local client engine:", fetchErr);
      }

      // If backend failed or was unreachable on custom domain, calculate locally
      if (!result || !result.text) {
        result = computeClientLocalVoiceResponse(
          textToSend.trim(),
          catalogProducts,
          catalogStores,
          currentCart,
          systemDeliveryFee
        );
      }

      const aiReplyText = result.text || 'Entendido. ¿Deseas hacer algo más?';
      const actions = result.actions || [];

      // Process and execute any direct client-side state actions (like adding to cart)
      let primaryActionPayload: any = null;

      for (const action of actions) {
        if (action.type === 'ADD_TO_CART' && action.product) {
          addProductToCart(action.product, action.quantity || 1, action.variant);
          setCart(getStoredCart());
          primaryActionPayload = {
            type: 'CART_SUMMARY',
            data: {
              addedProduct: action.product,
              quantity: action.quantity || 1,
              cart: getStoredCart()
            }
          };
        } else if (action.type === 'PRODUCTS_SEARCHED') {
          primaryActionPayload = {
            type: 'PRODUCTS_SEARCHED',
            data: {
              query: action.query,
              products: action.results,
              stores: action.stores
            }
          };
        } else if (action.type === 'CART_SUMMARY') {
          primaryActionPayload = {
            type: 'CART_SUMMARY',
            data: {
              cart: getStoredCart()
            }
          };
        } else if (action.type === 'ORDER_CONFIRMATION_REQUESTED') {
          primaryActionPayload = {
            type: 'ORDER_CONFIRMATION_REQUESTED',
            data: action.orderProposal
          };
        } else if (action.type === 'ORDER_CREATE_CONFIRMED') {
          // Execute order creation in Firestore
          await handleExecuteOrderCreation(action.orderData);
          primaryActionPayload = {
            type: 'ORDER_CREATE_CONFIRMED',
            data: action.orderData
          };
        } else if (action.type === 'NAVIGATE_TO_STORE' && action.storeUsername) {
          if (onNavigateToStore) {
            onNavigateToStore(action.storeUsername);
          }
        }
      }

      const assistantMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: 'assistant',
        text: aiReplyText,
        timestamp: new Date(),
        actionPayload: primaryActionPayload
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Request OpenAI High Definition TTS audio or fallback to Web Speech API
      if (!isVoiceMuted) {
        try {
          const ttsRes = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: result.speechText || aiReplyText })
          });
          if (ttsRes.ok) {
            const ttsData = await ttsRes.json();
            if (ttsData && ttsData.audio) {
              playVoiceResponse(aiReplyText, ttsData.audio);
            } else {
              playVoiceResponse(aiReplyText);
            }
          } else {
            playVoiceResponse(aiReplyText);
          }
        } catch (e) {
          playVoiceResponse(aiReplyText);
        }
      } else {
        if (isInVoiceCallRef.current) {
          setAssistantState('listening');
        } else {
          setAssistantState('idle');
        }
      }
    } catch (error) {
      console.error("Critical fallback in LinnkPro AI:", error);
      const fallback = computeClientLocalVoiceResponse(
        textToSend.trim(),
        catalogProducts,
        catalogStores,
        getStoredCart(),
        systemDeliveryFee
      );
      const assistantMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: 'assistant',
        text: fallback.text,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMsg]);
      playVoiceResponse(fallback.text);
    }
  };

  // Real Order Creation in Firebase
  const handleExecuteOrderCreation = async (orderData: any) => {
    setIsOrdering(true);
    try {
      const currentCart = getStoredCart();
      if (currentCart.length === 0) {
        throw new Error("El carrito está vacío.");
      }

      // Group items by merchant userId
      const itemsBySeller: Record<string, typeof currentCart> = {};
      currentCart.forEach(item => {
        const sId = item.product.userId || 'general';
        if (!itemsBySeller[sId]) itemsBySeller[sId] = [];
        itemsBySeller[sId].push(item);
      });

      const orderNumberBase = Math.floor(1000 + Math.random() * 9000);

      // Create an order in Firestore for each seller
      for (const [sellerId, sellerItems] of Object.entries(itemsBySeller)) {
        const storeProfile = catalogStores[sellerId];
        const storeSubtotal = sellerItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
        const storeTotal = storeSubtotal + systemDeliveryFee;

        const newOrder: OrderItem = {
          id: '',
          storeOwnerId: sellerId,
          storeName: storeProfile?.displayName || 'Restaurante LinnkPro',
          storeAddress: storeProfile?.address || '',
          storePhone: storeProfile?.phone || storeProfile?.whatsapp || '',
          orderNumber: orderNumberBase,
          customerName: orderData.customerName || 'Cliente LinnkPro',
          customerPhone: orderData.customerPhone || '',
          customerAddress: orderData.customerAddress || 'Dirección de entrega',
          paymentMethod: (orderData.paymentMethod as any) || 'delivery_cash',
          status: 'pending',
          items: sellerItems.map(item => ({
            productId: item.product.id,
            name: item.product.name,
            price: item.product.price,
            quantity: item.quantity,
            selectedVariant: item.selectedVariant
          })),
          totalAmount: storeTotal,
          deliveryFee: systemDeliveryFee,
          notes: orderData.notes ? `[LinnkPro AI Voice] ${orderData.notes}` : '[LinnkPro AI Voice]',
          createdAt: new Date().toISOString()
        };

        await saveOrder(newOrder);
      }

      // Clear cart
      clearAllCart();
      setCart([]);
    } catch (e) {
      console.error("Error creating real order from voice assistant:", e);
    } finally {
      setIsOrdering(false);
    }
  };

  // Format call duration into MM:SS
  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const lastAssistantMessage = [...messages].reverse().find(m => m.sender === 'assistant');

  return (
    <>
      {/* 1. FLOATING CALL BUTTON (Fixed in the bottom-left corner) */}
      <div 
        id="linnkpro-voice-fab-container"
        className="fixed bottom-20 left-4 sm:bottom-6 sm:left-6 z-40 flex items-center"
      >
        <button
          id="linnkpro-voice-fab"
          onClick={() => {
            if (!isOpen) {
              startVoiceCall();
            } else {
              setIsOpen(false);
            }
          }}
          className={`group relative flex items-center gap-2 px-3.5 py-2 rounded-full shadow-2xl transition-all duration-300 transform active:scale-95 border ${
            isInVoiceCall
              ? 'bg-[#EF4444] text-white border-red-400 ring-4 ring-red-500/30 animate-pulse'
              : 'bg-[#0B0F19]/95 hover:bg-[#131926] text-white border-red-500/40 hover:border-red-500 shadow-2xl shadow-red-950/60 hover:scale-105'
          }`}
          aria-label="Hablar con IAMesero"
        >
          {/* Animated Glow Ring */}
          <span className="absolute -inset-1 rounded-full bg-red-600 opacity-30 blur group-hover:opacity-60 transition duration-500"></span>

          <div className="relative flex items-center justify-center">
            {isInVoiceCall ? (
              <div className="relative flex items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <PhoneCall className="w-4 h-4 text-white animate-pulse" />
              </div>
            ) : (
              <div className="w-7 h-7 rounded-xl bg-[#EF4444] flex items-center justify-center shadow-md relative">
                <ConciergeBell className="w-3.5 h-3.5 text-white" />
              </div>
            )}
          </div>

          <span className="relative text-xs font-bold tracking-tight text-white pr-1 flex items-center gap-1.5">
            IAMesero
            <span className="px-1.5 py-0.2 bg-emerald-950/90 border border-emerald-500/50 text-emerald-400 text-[9px] font-semibold rounded-full">
              ChatGPT
            </span>
          </span>
        </button>
      </div>

      {/* 2. REAL-TIME VOICE CALL MODAL (Mobile-Optimized Experience) */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="linnkpro-voice-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-start sm:justify-start sm:pl-6 p-0 sm:p-4 bg-black/80 backdrop-blur-md"
          >
            {/* Modal Container */}
            <motion.div
              id="linnkpro-voice-modal-card"
              initial={{ y: 80, scale: 0.95, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 80, scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              className="w-full sm:w-[480px] h-[92vh] sm:h-[680px] max-h-[95vh] bg-[#090B12] border border-[#E63946]/40 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden text-gray-100 relative"
            >
              {/* Top Header Bar */}
              <div className="px-3.5 sm:px-5 py-2.5 sm:py-3.5 bg-[#0B0F19] border-b border-slate-800/80 flex items-center justify-between z-10 w-full flex-shrink-0">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-1 sm:mr-2">
                  <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-[#EF4444] flex items-center justify-center text-white shadow-md shadow-red-500/30 flex-shrink-0">
                    <ConciergeBell className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm sm:text-base font-bold text-white leading-none truncate">
                        IAMesero
                      </h3>
                      <span className="px-1.5 sm:px-2 py-0.5 bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-[9px] sm:text-[10px] font-semibold rounded-full flex-shrink-0">
                        ChatGPT
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">Mesero Virtual IA por Voz</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                  {/* View Mode Switcher (Voz vs Chat) */}
                  <div className="bg-[#131926]/90 p-0.5 sm:p-1 rounded-full border border-slate-800 flex items-center">
                    <button
                      onClick={() => {
                        setActiveTab('call');
                        if (!isInVoiceCallRef.current) {
                          startVoiceCall();
                        }
                      }}
                      className={`px-2.5 sm:px-3.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold transition flex items-center gap-1 sm:gap-1.5 ${
                        activeTab === 'call' 
                          ? 'bg-[#EF4444] text-white shadow-sm' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Radio className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      Voz
                    </button>
                    <button
                      onClick={() => {
                        endVoiceCall();
                        setActiveTab('chat');
                      }}
                      className={`px-2.5 sm:px-3.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold transition flex items-center gap-1 sm:gap-1.5 ${
                        activeTab === 'chat' 
                          ? 'bg-[#EF4444] text-white shadow-sm' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <MessageSquare className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      Chat
                    </button>
                  </div>

                  {/* Explicit X Close Button (Always visible and comfortably tappable on mobile) */}
                  <button
                    id="linnkpro-voice-close-btn"
                    onClick={() => {
                      endVoiceCall();
                      setIsOpen(false);
                    }}
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#182030] hover:bg-red-500/20 text-slate-300 hover:text-white border border-slate-700/80 flex items-center justify-center transition active:scale-95 flex-shrink-0"
                    title="Cerrar IAMesero"
                    aria-label="Cerrar"
                  >
                    <X className="w-4 h-4 sm:w-5 sm:h-5 text-slate-200 hover:text-white" />
                  </button>
                </div>
              </div>

              {/* VIEW 1: IMMERSIVE REAL-TIME VOICE CALL STAGE */}
              {activeTab === 'call' && (
                <div className="flex-1 flex flex-col justify-between p-4 sm:p-6 overflow-y-auto relative bg-[#0B0F19]">
                  {/* Background Subtle Radial Glow */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className={`w-80 h-80 rounded-full blur-[100px] transition-all duration-700 opacity-20 ${
                      assistantState === 'listening'
                        ? 'bg-[#EF4444] scale-110'
                        : assistantState === 'speaking'
                        ? 'bg-[#EF4444] scale-125'
                        : assistantState === 'processing'
                        ? 'bg-[#EF4444]/70 scale-100'
                        : 'bg-[#EF4444]/20'
                    }`}></div>
                  </div>

                  {/* 1. Header Title & Mode Subtitle */}
                  <div className="flex flex-col items-center justify-center z-10 pt-2 text-center">
                    <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                      {assistantState === 'listening' 
                        ? (transcript ? `"${transcript}"` : 'Escuchando... habla con libertad')
                        : assistantState === 'speaking' 
                        ? 'IAMesero te está respondiendo...'
                        : assistantState === 'processing'
                        ? 'Procesando tu solicitud...'
                        : 'En llamada con IAMesero'}
                    </h2>

                    <div className="flex items-center gap-2 mt-1.5 text-xs">
                      <button
                        onClick={() => {
                          setListeningMode(prev => prev === 'continuous' ? 'push_to_talk' : 'continuous');
                        }}
                        className="flex items-center gap-1 text-red-500 hover:text-red-400 font-medium transition cursor-pointer"
                      >
                        <Mic className="w-3.5 h-3.5 text-red-500" />
                        <span>Manos libres</span>
                      </button>
                      <span className="text-slate-600">•</span>
                      <button
                        onClick={() => {
                          setListeningMode(prev => prev === 'push_to_talk' ? 'continuous' : 'push_to_talk');
                        }}
                        className={`transition cursor-pointer ${listeningMode === 'push_to_talk' ? 'text-red-400 font-semibold' : 'text-slate-400 hover:text-white'}`}
                      >
                        Pulsa para hablar
                      </button>
                    </div>
                  </div>

                  {/* Mobile Mic Permission Notice if any */}
                  {micPermissionError && (
                    <div className="z-20 my-2 mx-auto max-w-sm bg-rose-950/90 border border-rose-600 rounded-2xl p-3 text-center shadow-2xl backdrop-blur">
                      <p className="text-xs text-rose-200 font-medium leading-relaxed">
                        {micPermissionError}
                      </p>
                      <button
                        onClick={startVoiceCall}
                        className="mt-2 px-3 py-1 bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-bold rounded-lg transition"
                      >
                        🔄 Reintentar conexión de voz
                      </button>
                    </div>
                  )}

                  {/* 2. Central Mic Orb with Soundwave Bars */}
                  <div className="flex flex-col items-center justify-center my-auto py-6 z-10">
                    <div className="relative flex items-center justify-center gap-6 sm:gap-10">
                      {/* Left Audio Waveform Bars */}
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 rounded-full transition-all duration-300 ${assistantState === 'listening' ? 'h-6 bg-red-600 animate-pulse' : assistantState === 'speaking' ? 'h-5 bg-red-500' : 'h-4 bg-[#681c22]'}`}></span>
                        <span className={`w-1.5 rounded-full transition-all duration-300 ${assistantState === 'listening' ? 'h-10 bg-red-600 animate-pulse' : assistantState === 'speaking' ? 'h-8 bg-red-500' : 'h-6 bg-[#681c22]'}`}></span>
                        <span className={`w-1.5 rounded-full transition-all duration-300 ${assistantState === 'listening' ? 'h-16 bg-red-600 animate-pulse' : assistantState === 'speaking' ? 'h-12 bg-red-500' : 'h-9 bg-[#681c22]'}`}></span>
                        <span className={`w-1.5 rounded-full transition-all duration-300 ${assistantState === 'listening' ? 'h-10 bg-red-600 animate-pulse' : assistantState === 'speaking' ? 'h-8 bg-red-500' : 'h-6 bg-[#681c22]'}`}></span>
                        <span className={`w-1.5 rounded-full transition-all duration-300 ${assistantState === 'listening' ? 'h-6 bg-red-600 animate-pulse' : assistantState === 'speaking' ? 'h-5 bg-red-500' : 'h-4 bg-[#681c22]'}`}></span>
                      </div>

                      {/* Concentric Orb with Central Red Mic Button */}
                      <div className="relative flex items-center justify-center">
                        {/* Outermost ring */}
                        <div className="w-48 h-48 sm:w-52 sm:h-52 rounded-full border border-red-950/60 bg-red-950/20 flex items-center justify-center absolute"></div>
                        
                        {/* Middle ring with subtle glow */}
                        <div className="w-38 h-38 sm:w-42 sm:h-42 rounded-full border border-red-800/40 bg-red-900/30 flex items-center justify-center absolute shadow-[0_0_40px_rgba(239,68,68,0.25)]"></div>

                        {/* Solid Red Central Circle Button */}
                        <button
                          id="linnkpro-interactive-center-mic"
                          onClick={handleCentralMicClick}
                          className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-gradient-to-b from-[#EF4444] to-[#DC2626] flex items-center justify-center shadow-2xl shadow-red-600/40 relative z-10 active:scale-95 hover:scale-105 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-4 focus:ring-red-500/30"
                          title={assistantState === 'speaking' ? 'Toca para interrumpir' : transcript ? 'Toca para enviar' : 'Micrófono activo'}
                        >
                          <Mic className="w-11 h-11 sm:w-12 sm:h-12 text-white stroke-[2.5]" />
                        </button>
                      </div>

                      {/* Right Audio Waveform Bars */}
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 rounded-full transition-all duration-300 ${assistantState === 'listening' ? 'h-6 bg-red-600 animate-pulse' : assistantState === 'speaking' ? 'h-5 bg-red-500' : 'h-4 bg-[#681c22]'}`}></span>
                        <span className={`w-1.5 rounded-full transition-all duration-300 ${assistantState === 'listening' ? 'h-10 bg-red-600 animate-pulse' : assistantState === 'speaking' ? 'h-8 bg-red-500' : 'h-6 bg-[#681c22]'}`}></span>
                        <span className={`w-1.5 rounded-full transition-all duration-300 ${assistantState === 'listening' ? 'h-16 bg-red-600 animate-pulse' : assistantState === 'speaking' ? 'h-12 bg-red-500' : 'h-9 bg-[#681c22]'}`}></span>
                        <span className={`w-1.5 rounded-full transition-all duration-300 ${assistantState === 'listening' ? 'h-10 bg-red-600 animate-pulse' : assistantState === 'speaking' ? 'h-8 bg-red-500' : 'h-6 bg-[#681c22]'}`}></span>
                        <span className={`w-1.5 rounded-full transition-all duration-300 ${assistantState === 'listening' ? 'h-6 bg-red-600 animate-pulse' : assistantState === 'speaking' ? 'h-5 bg-red-500' : 'h-4 bg-[#681c22]'}`}></span>
                      </div>
                    </div>
                  </div>

                  {/* 3. Action Cards Pop-up (Cart or Product quick cards during call) */}
                  {lastAssistantMessage?.actionPayload && (
                    <div className="z-10 mb-3">
                      {lastAssistantMessage.actionPayload.type === 'CART_SUMMARY' && (
                        <div className="bg-[#111827] border border-red-500/40 rounded-2xl p-3 shadow-lg flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-red-500/20 text-red-500 flex items-center justify-center font-bold">
                              <ShoppingBag className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-white">Carrito Actualizado</h4>
                              <p className="text-[11px] text-amber-400 font-bold">
                                {cart.reduce((s, i) => s + i.quantity, 0)} platos • ${cart.reduce((s, i) => s + (i.product.price * i.quantity), 0).toLocaleString('es-CO')} COP
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              endVoiceCall();
                              setActiveTab('chat');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-bold transition flex items-center gap-1 shadow-md"
                          >
                            Ver Carrito <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {lastAssistantMessage.actionPayload.type === 'ORDER_CONFIRMATION_REQUESTED' && (
                        <div className="bg-gradient-to-r from-[#1E1418] to-[#111827] border border-amber-500/50 rounded-2xl p-3 shadow-xl flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                              <AlertCircle className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-white">Confirmar Pedido</h4>
                              <p className="text-[11px] text-amber-400 font-bold">
                                Total: ${lastAssistantMessage.actionPayload.data.grandTotal?.toLocaleString('es-CO')} COP
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              await handleExecuteOrderCreation(lastAssistantMessage.actionPayload?.data);
                              handleSendMessage("Sí, confirmo mi pedido ahora.");
                            }}
                            className="px-3 py-1.5 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-bold transition shadow-md"
                          >
                            Confirmar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* VIEW 2: CHAT & CART TRANSCRIPT VIEW */}
              {activeTab === 'chat' && (
                <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm bg-[#090B12] scrollbar-thin scrollbar-thumb-gray-800">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-md ${
                          msg.sender === 'user'
                            ? 'bg-gradient-to-r from-[#E63946] to-[#D62839] text-white rounded-br-none font-medium'
                            : 'bg-[#111827] text-gray-100 border border-[#232B3A] rounded-bl-none'
                        }`}
                      >
                        <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                        <span className="text-[10px] text-[#A9B2C3]/80 mt-1 block text-right">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Rich Action Attachments */}
                      {msg.actionPayload && (
                        <div className="w-full mt-2 space-y-2">
                          {/* 1. Products Carousel Result */}
                          {msg.actionPayload.type === 'PRODUCTS_SEARCHED' && msg.actionPayload.data?.products?.length > 0 && (
                            <div className="bg-[#0D111D] border border-[#E63946]/30 rounded-2xl p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-extrabold text-[#E63946] flex items-center gap-1">
                                  <ShoppingBag className="w-3.5 h-3.5" />
                                  Platos encontrados ({msg.actionPayload.data.products.length})
                                </span>
                              </div>
                              <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
                                {msg.actionPayload.data.products.map((p: ProductItem) => {
                                  const store = catalogStores[p.userId];
                                  return (
                                    <div
                                      key={p.id}
                                      className="flex items-center gap-2.5 p-2 rounded-xl bg-[#111827] border border-[#232B3A] hover:border-[#E63946] transition"
                                    >
                                      {p.imageURL ? (
                                        <img
                                          src={p.imageURL}
                                          alt={p.name}
                                          referrerPolicy="no-referrer"
                                          className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                                        />
                                      ) : (
                                        <div className="w-12 h-12 rounded-lg bg-[#232B3A] flex items-center justify-center text-[#A9B2C3] flex-shrink-0">
                                          <ShoppingBag className="w-5 h-5" />
                                        </div>
                                      )}

                                      <div className="flex-1 min-w-0">
                                        <h4 className="text-xs font-bold text-white truncate">{p.name}</h4>
                                        <p className="text-[11px] text-[#A9B2C3] truncate">
                                          {store?.displayName || 'Restaurante'} • {p.category || 'Comida'}
                                        </p>
                                        <span className="text-xs font-extrabold text-[#F4B400]">
                                          ${p.price.toLocaleString('es-CO')} COP
                                        </span>
                                      </div>

                                      <button
                                        onClick={() => {
                                          addProductToCart(p, 1);
                                          setCart(getStoredCart());
                                          handleSendMessage(`Agregué 1 ${p.name} al carrito.`);
                                        }}
                                        className="px-2.5 py-1.5 rounded-lg bg-[#E63946] hover:bg-[#D62839] text-white text-xs font-bold flex items-center gap-1 transition shadow"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                        Agregar
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* 2. Cart Summary Card */}
                          {msg.actionPayload.type === 'CART_SUMMARY' && (
                            <div className="bg-[#0D111D] border border-[#E63946]/30 rounded-2xl p-3.5">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-white flex items-center gap-1">
                                  <ShoppingBag className="w-3.5 h-3.5 text-[#E63946]" />
                                  Carrito de Compras ({cart.reduce((s, i) => s + i.quantity, 0)} ítems)
                                </span>
                                {cart.length > 0 && (
                                  <button
                                    onClick={() => {
                                      clearAllCart();
                                      setCart([]);
                                    }}
                                    className="text-[11px] text-[#E63946] hover:underline flex items-center gap-0.5 font-bold"
                                  >
                                    <Trash2 className="w-3 h-3" /> Vaciar
                                  </button>
                                )}
                              </div>

                              {cart.length === 0 ? (
                                <p className="text-xs text-[#A9B2C3] py-2 text-center">Tu carrito está vacío.</p>
                              ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                  {cart.map((item) => (
                                    <div
                                      key={item.id}
                                      className="flex items-center justify-between p-2 rounded-xl bg-[#111827] border border-[#232B3A] text-xs"
                                    >
                                      <div className="flex-1 truncate pr-2">
                                        <span className="font-bold text-white truncate block">{item.product.name}</span>
                                        <span className="text-[11px] text-[#F4B400] font-semibold">${(item.product.price * item.quantity).toLocaleString('es-CO')} COP</span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          onClick={() => {
                                            updateCartQuantity(item.id, item.quantity - 1);
                                            setCart(getStoredCart());
                                          }}
                                          className="w-6 h-6 rounded-md bg-[#232B3A] hover:bg-[#1E293B] flex items-center justify-center text-white"
                                        >
                                          <Minus className="w-3 h-3" />
                                        </button>
                                        <span className="w-5 text-center font-bold text-white">{item.quantity}</span>
                                        <button
                                          onClick={() => {
                                            updateCartQuantity(item.id, item.quantity + 1);
                                            setCart(getStoredCart());
                                          }}
                                          className="w-6 h-6 rounded-md bg-[#232B3A] hover:bg-[#1E293B] flex items-center justify-center text-white"
                                        >
                                          <Plus className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}

                                  {(() => {
                                    const summary = calculateCartSummary(cart, systemDeliveryFee);
                                    return (
                                      <div className="pt-2 border-t border-[#232B3A] text-xs space-y-1">
                                        <div className="flex justify-between text-[#A9B2C3]">
                                          <span>Subtotal:</span>
                                          <span>${summary.subtotal.toLocaleString('es-CO')} COP</span>
                                        </div>
                                        <div className="flex justify-between text-[#A9B2C3]">
                                          <span>Domicilio ({summary.storeCount} restaurante):</span>
                                          <span>${summary.deliveryFee.toLocaleString('es-CO')} COP</span>
                                        </div>
                                        <div className="flex justify-between text-white font-bold pt-1 border-t border-[#232B3A]">
                                          <span>Total:</span>
                                          <span className="text-[#F4B400] font-black text-sm">${summary.grandTotal.toLocaleString('es-CO')} COP</span>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          )}

                          {/* 3. Order Confirmation Proposal Card */}
                          {msg.actionPayload.type === 'ORDER_CONFIRMATION_REQUESTED' && msg.actionPayload.data && (
                            <div className="bg-gradient-to-b from-[#16131D] to-[#0D111D] border border-[#F4B400]/50 rounded-2xl p-4 shadow-xl">
                              <div className="flex items-center gap-2 mb-2 text-[#F4B400] font-black text-xs uppercase tracking-wider">
                                <AlertCircle className="w-4 h-4" />
                                Confirmación de Pedido por Voz
                              </div>

                              <div className="space-y-1.5 text-xs text-gray-300 mb-3 bg-[#111827] border border-[#232B3A] p-3 rounded-xl">
                                <div className="flex justify-between">
                                  <span className="text-[#A9B2C3]">Nombre:</span>
                                  <span className="font-bold text-white">{msg.actionPayload.data.customerName || 'Cliente'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[#A9B2C3]">Teléfono:</span>
                                  <span className="font-bold text-white">{msg.actionPayload.data.customerPhone || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[#A9B2C3]">Dirección:</span>
                                  <span className="font-bold text-white text-right max-w-[60%] truncate">{msg.actionPayload.data.customerAddress || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[#A9B2C3]">Método de Pago:</span>
                                  <span className="font-bold text-[#F4B400] uppercase">{msg.actionPayload.data.paymentMethod === 'delivery_cash' ? 'Efectivo contra entrega' : 'Transferencia'}</span>
                                </div>
                                <div className="flex justify-between pt-1 border-t border-[#232B3A] text-sm font-black">
                                  <span className="text-white">Total a pagar:</span>
                                  <span className="text-[#F4B400]">${msg.actionPayload.data.grandTotal?.toLocaleString('es-CO')} COP</span>
                                </div>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  onClick={async () => {
                                    await handleExecuteOrderCreation(msg.actionPayload?.data);
                                    handleSendMessage("Sí, confirmo mi pedido ahora.");
                                  }}
                                  disabled={isOrdering}
                                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#E63946] to-[#D62839] hover:from-[#D62839] hover:to-[#C1121F] text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-lg shadow-red-950/50 transition uppercase tracking-wider"
                                >
                                  {isOrdering ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                  Confirmar Pedido Ahora
                                </button>
                              </div>
                            </div>
                          )}

                          {/* 4. Order Created Success Card */}
                          {msg.actionPayload.type === 'ORDER_CREATE_CONFIRMED' && (
                            <div className="bg-[#16131D] border border-[#E63946]/50 rounded-2xl p-4 text-center">
                              <div className="w-10 h-10 mx-auto rounded-full bg-[#E63946]/20 text-[#E63946] flex items-center justify-center mb-2">
                                <CheckCircle2 className="w-6 h-6" />
                              </div>
                              <h4 className="text-sm font-extrabold text-white">¡Pedido Creado con Éxito!</h4>
                              <p className="text-xs text-[#A9B2C3] mt-1">
                                El restaurante ha recibido tu pedido y comenzará a prepararlo de inmediato.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Processing / Typing Indicator */}
                  {assistantState === 'processing' && (
                    <div className="flex items-center gap-2 text-xs text-[#A9B2C3] bg-[#111827] border border-[#232B3A] px-3.5 py-2 rounded-2xl w-fit">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E63946]" />
                      <span>LinnkPro está pensando...</span>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* BOTTOM CONTROLS BAR */}
              <div className="p-4 sm:p-5 bg-[#0B0F19] border-t border-slate-800/80 flex flex-col gap-4">
                {/* Chat Quick Suggestion Chips (when in chat tab) */}
                {activeTab === 'chat' && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
                    {[
                      { label: '🍔 Hamburguesas', query: 'Muéstrame hamburguesas disponibles' },
                      { label: '🍕 Pizzas', query: '¿Qué pizzas tienen?' },
                      { label: '🍗 Pollo', query: '¿Tienen pollo asado o broaster?' },
                      { label: '🛒 Mi Carrito', query: '¿Qué tengo en el carrito?' },
                      { label: '🥤 Bebidas', query: 'Ver bebidas disponibles' }
                    ].map((chip, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(chip.query)}
                        className="px-3 py-1 rounded-full bg-[#161D2C] hover:bg-[#1E293B] text-gray-300 hover:text-white border border-slate-800 whitespace-nowrap transition"
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Pill Shaped Text Input matching screenshot */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative flex items-center bg-[#131926]/90 border border-slate-800/90 rounded-full px-4 py-2.5 sm:py-3 shadow-inner focus-within:border-red-500/60 transition">
                    <Mic className="w-4 h-4 text-red-500 mr-2.5 flex-shrink-0" />
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage(inputText);
                        }
                      }}
                      placeholder="Escribe tu mensaje..."
                      className="w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none pr-8"
                    />
                    {inputText.trim() ? (
                      <button
                        onClick={() => handleSendMessage(inputText)}
                        className="absolute right-2.5 p-1.5 rounded-full bg-[#EF4444] hover:bg-[#DC2626] text-white transition"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      activeTab === 'chat' && (
                        <button
                          onClick={() => {
                            if (isInVoiceCall) {
                              endVoiceCall();
                            } else {
                              startVoiceCall();
                            }
                          }}
                          className={`absolute right-2.5 p-1.5 rounded-full transition ${
                            isInVoiceCall ? 'bg-[#EF4444] text-white animate-pulse' : 'text-slate-400 hover:text-white'
                          }`}
                          title="Hablar por voz"
                        >
                          <Mic className="w-4 h-4" />
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Primary Call Controls (Silenciar, Finalizar, Altavoz) matching screenshot */}
                {activeTab === 'call' && (
                  <div className="flex items-center justify-around pt-1 pb-2">
                    {/* Toggle User Microphone (Silenciar) */}
                    <button
                      id="linnkpro-voice-mic-toggle-btn"
                      onClick={() => setIsMicMuted(prev => !prev)}
                      className="flex flex-col items-center gap-2 group transition"
                    >
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center border transition transform active:scale-95 ${
                        isMicMuted 
                          ? 'bg-red-950/80 border-red-500 text-red-400 shadow-lg shadow-red-950/50' 
                          : 'bg-[#131926] border-slate-800 text-red-500 group-hover:border-red-500/40 group-hover:bg-[#182030]'
                      }`}>
                        {isMicMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6 text-red-500 stroke-[2]" />}
                      </div>
                      <span className="text-xs text-slate-400 font-medium group-hover:text-white transition">Silenciar</span>
                    </button>

                    {/* Main Call Action Button (Finalizar con icono X rojo o Iniciar) */}
                    {isInVoiceCall ? (
                      <button
                        id="linnkpro-voice-end-call-btn"
                        onClick={endVoiceCall}
                        className="flex flex-col items-center gap-2 group"
                      >
                        <div className="w-20 h-20 rounded-full bg-[#EF4444] hover:bg-[#DC2626] text-white flex items-center justify-center shadow-2xl shadow-red-600/40 group-hover:scale-105 transition transform active:scale-95">
                          <X className="w-8 h-8 text-white stroke-[2.5]" />
                        </div>
                        <span className="text-xs font-semibold text-white tracking-wide">Finalizar</span>
                      </button>
                    ) : (
                      <button
                        id="linnkpro-voice-start-call-btn"
                        onClick={startVoiceCall}
                        className="flex flex-col items-center gap-2 group"
                      >
                        <div className="w-20 h-20 rounded-full bg-[#EF4444] hover:bg-[#DC2626] text-white flex items-center justify-center shadow-2xl shadow-red-600/40 group-hover:scale-105 transition transform active:scale-95 animate-pulse">
                          <Mic className="w-8 h-8 text-white stroke-[2.5]" />
                        </div>
                        <span className="text-xs font-semibold text-white tracking-wide">Hablar</span>
                      </button>
                    )}

                    {/* Toggle AI Speaker Voice Output (Altavoz) */}
                    <button
                      id="linnkpro-voice-speaker-toggle-btn"
                      onClick={() => setIsVoiceMuted(prev => !prev)}
                      className="flex flex-col items-center gap-2 group transition"
                    >
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center border transition transform active:scale-95 ${
                        isVoiceMuted 
                          ? 'bg-amber-950/80 border-amber-500 text-amber-400' 
                          : 'bg-[#131926] border-slate-800 text-red-500 group-hover:border-red-500/40 group-hover:bg-[#182030]'
                      }`}>
                        {isVoiceMuted ? <VolumeX className="w-6 h-6 text-amber-400" /> : <Volume2 className="w-6 h-6 text-red-500 stroke-[2]" />}
                      </div>
                      <span className="text-xs text-slate-400 font-medium group-hover:text-white transition">Altavoz</span>
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
