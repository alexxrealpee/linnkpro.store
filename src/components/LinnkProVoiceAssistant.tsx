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
  Check
} from 'lucide-react';
import { ProductItem, UserProfile, OrderItem } from '../types';
import { 
  fetchAllActiveProductsAndStores, 
  fetchSystemSettings, 
  saveOrder, 
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

  // Chat stream messages
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: '¡Hola! Soy tu asistente de voz en tiempo real de LinnkPro. Puedes pedirme platos, consultar menús de restaurantes, ver tu carrito o hacer tu pedido directamente hablando.',
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

  // Helper to detect mobile device
  const isMobile = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Synchronize refs with state for asynchronous event handlers
  useEffect(() => {
    isInVoiceCallRef.current = isInVoiceCall;
  }, [isInVoiceCall]);

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
        setCatalogProducts(catalogData.products);
        setCatalogStores(catalogData.profiles);
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

  // Safe SpeechRecognition start & stop helpers (prevents InvalidStateError)
  const safeStartRecognition = () => {
    if (!recognitionRef.current || !isInVoiceCallRef.current || isRecognitionRunningRef.current) {
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
      recognitionRef.current.stop();
    } catch (e) {}
    isRecognitionRunningRef.current = false;
  };

  // 7. Initialize Speech Recognition with Hands-Free Continuous VAD & Barge-in
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      // On mobile devices (Chrome on Android / iOS), single utterance mode with auto-restart is far more stable
      recognition.continuous = !isMobile;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = 'es-CO'; // Colombian Spanish

      recognition.onstart = () => {
        isRecognitionRunningRef.current = true;
        setMicPermissionError(null);
        if (isInVoiceCallRef.current && !isSpeakingRef.current) {
          setAssistantState('listening');
        }
      };

      recognition.onspeechstart = () => {
        // BARGE-IN INTERRUPTION: If AI is currently speaking and user speaks, stop AI immediately!
        if (isSpeakingRef.current || assistantStateRef.current === 'speaking') {
          stopAudioPlayback();
          setAssistantState('listening');
        }
      };

      recognition.onresult = (event: any) => {
        if (isMicMutedRef.current) return;

        // If user speaks while AI is speaking, interrupt AI audio
        if (isSpeakingRef.current || assistantStateRef.current === 'speaking') {
          stopAudioPlayback();
          setAssistantState('listening');
        }

        let fullTranscript = '';
        for (let i = 0; i < event.results.length; ++i) {
          fullTranscript += event.results[i][0].transcript;
        }

        const trimmed = fullTranscript.trim();
        if (trimmed) {
          setTranscript(trimmed);
          latestTranscriptRef.current = trimmed;

          // VAD SILENCE DETECTION: Reset timer every time new speech is detected
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }

          // Auto-send when user finishes speaking (1.2 seconds of silence)
          silenceTimerRef.current = setTimeout(() => {
            if (isInVoiceCallRef.current && latestTranscriptRef.current && assistantStateRef.current !== 'processing') {
              const textToSend = latestTranscriptRef.current;
              latestTranscriptRef.current = '';
              setTranscript('');
              handleSendMessage(textToSend);
            }
          }, 1250);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          console.warn("Speech recognition notice:", event.error);
        }
        isRecognitionRunningRef.current = false;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture') {
          setMicPermissionError('Permiso de micrófono denegado en tu navegador móvil. Toca el icono de configuración/candado en Chrome y autoriza el micrófono.');
          setIsInVoiceCall(false);
          isInVoiceCallRef.current = false;
          setAssistantState('idle');
          stopAudioAnalyser();
        }
      };

      recognition.onend = () => {
        isRecognitionRunningRef.current = false;
        // Automatically keep listening if the voice call is active
        if (isInVoiceCallRef.current && !isSpeakingRef.current) {
          setTimeout(() => {
            if (isInVoiceCallRef.current && !isSpeakingRef.current) {
              safeStartRecognition();
            }
          }, isMobile ? 80 : 150);
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
  }, [isMobile]);

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
    safeStartRecognition();
  };

  const endVoiceCall = () => {
    setIsInVoiceCall(false);
    isInVoiceCallRef.current = false;
    setAssistantState('idle');
    setTranscript('');
    latestTranscriptRef.current = '';
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    stopAudioPlayback();
    stopAudioAnalyser();
    safeStopRecognition();
  };

  // 9. Play audio response with PCM Web Audio or Web Speech API
  const playVoiceResponse = async (text: string, pcmBase64?: string) => {
    if (isVoiceMuted) {
      if (isInVoiceCallRef.current) {
        setAssistantState('listening');
      } else {
        setAssistantState('idle');
      }
      return;
    }

    stopAudioPlayback();
    isSpeakingRef.current = true;
    setAssistantState('speaking');

    // Callback when AI finishes speaking -> resume listening immediately in hands-free loop
    const onSpeechComplete = () => {
      isSpeakingRef.current = false;
      currentAudioSourceRef.current = null;
      if (isInVoiceCallRef.current) {
        setAssistantState('listening');
        setTranscript('');
        latestTranscriptRef.current = '';
        safeStartRecognition();
      } else {
        setAssistantState('idle');
      }
    };

    if (pcmBase64) {
      try {
        const binaryString = atob(pcmBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const int16Array = new Int16Array(bytes.buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768;
        }

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        const audioBuffer = ctx.createBuffer(1, float32Array.length, 24000);
        audioBuffer.getChannelData(0).set(float32Array);

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        currentAudioSourceRef.current = source;

        source.onended = onSpeechComplete;
        source.start();
        return;
      } catch (err) {
        console.warn("PCM audio playback error, falling back to Web Speech API:", err);
      }
    }

    // Fallback: Web Speech API synthesis (Female Voice strictly)
    if ('speechSynthesis' in window) {
      const cleanSpeech = text
        .replace(/\$\s*([0-9]+(?:[.,][0-9]+)*)\s*(?:COP|cop)?/gi, '$1 pesos')
        .replace(/([0-9]+(?:[.,][0-9]+)*)\s*(?:COP|cop)/gi, '$1 pesos')
        .replace(/\$/g, '')
        .replace(/\bd[oó]lares\b/gi, 'pesos')
        .replace(/\bd[oó]lar\b/gi, 'peso')
        .replace(/[*_#`~]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .trim();
      const utterance = new SpeechSynthesisUtterance(cleanSpeech);
      utterance.lang = 'es-CO';
      utterance.rate = 1.05;
      utterance.pitch = 1.08; // Natural pleasant female pitch

      const voices = window.speechSynthesis.getVoices();
      const spanishVoices = voices.filter(v => v.lang.includes('es-') || v.lang.startsWith('es'));

      // Female voice identifiers across Windows, macOS, iOS, Android and Chrome
      const femaleKeywords = [
        'female', 'mujer', 'monica', 'paulina', 'sabina', 'helena', 'lucia', 'laura',
        'salome', 'soledad', 'carmen', 'elena', 'victoria', 'alva', 'marta', 'zira',
        'maria', 'francisca', 'mia', 'sofia', 'camila', 'valentina', 'rosa', 'lupe',
        'penelope', 'conchita', 'google español'
      ];
      const maleKeywords = [
        'male', 'hombre', 'jorge', 'diego', 'miguel', 'carlos', 'pablo', 'raul',
        'david', 'alvaro', 'enrique', 'juan', 'manuel', 'pablo', 'antonio'
      ];

      // 1. First priority: Spanish voice matching female keywords and NOT matching male keywords
      let femaleVoice = spanishVoices.find(v => {
        const nameLower = v.name.toLowerCase();
        const isFemale = femaleKeywords.some(kw => nameLower.includes(kw));
        const isMale = maleKeywords.some(kw => nameLower.includes(kw));
        return isFemale && !isMale;
      });

      // 2. Second priority: Spanish voice that is at least not explicitly male
      if (!femaleVoice) {
        femaleVoice = spanishVoices.find(v => {
          const nameLower = v.name.toLowerCase();
          return !maleKeywords.some(kw => nameLower.includes(kw));
        });
      }

      // 3. Fallback to any Spanish voice
      if (!femaleVoice && spanishVoices.length > 0) {
        femaleVoice = spanishVoices[0];
      }

      if (femaleVoice) {
        utterance.voice = femaleVoice;
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

    const activeProducts = products.filter(p => p.active !== false);

    // 1. Check cart request
    if (lower.includes('carrito') || lower.includes('que tengo') || lower.includes('qué tengo') || lower.includes('mis platos') || lower.includes('ver orden')) {
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
      // Build catalog context with real data
      const storesArray = (Object.values(catalogStores) as UserProfile[]).map(s => ({
        uid: s.uid,
        username: s.username,
        displayName: s.displayName,
        bio: s.bio,
        address: s.address,
        phone: s.phone,
        whatsapp: s.whatsapp,
        isClosed: s.isClosed
      }));

      const productsArray = catalogProducts.map(p => {
        const store = catalogStores[p.userId];
        return {
          id: p.id,
          userId: p.userId,
          name: p.name,
          description: p.description,
          price: p.price,
          stock: p.stock,
          category: p.category,
          // Omit heavy data URLs to keep payload ultra light and fast
          imageURL: p.imageURL && p.imageURL.startsWith('data:') ? undefined : p.imageURL,
          storeName: store?.displayName || 'Tienda',
          storeUsername: store?.username || '',
          active: p.active
        };
      });

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

      // Map recent history
      const historyPayload = messages.slice(-6).map(m => ({
        role: (m.sender === 'user' ? 'user' : 'model') as 'user' | 'model',
        parts: [{ text: m.text }]
      }));

      let result: any = null;

      try {
        // Call backend voice assistant endpoint
        const response = await fetch('/api/gemini/voice-assistant', {
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

      // Request Gemini TTS audio or fallback to Web Speech API
      if (!isVoiceMuted) {
        try {
          const ttsRes = await fetch('/api/gemini/tts', {
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
          className={`group relative flex items-center gap-3 px-4 py-3 rounded-full shadow-2xl transition-all duration-300 transform active:scale-95 border ${
            isInVoiceCall
              ? 'bg-gradient-to-r from-[#E63946] via-[#D62839] to-[#F4B400] text-white border-[#E63946] ring-4 ring-[#E63946]/30 animate-pulse'
              : 'bg-[#090B12]/95 hover:bg-[#111827] text-white border-[#E63946]/40 hover:border-[#E63946] shadow-2xl shadow-red-950/60 hover:scale-105'
          }`}
          aria-label="Hablar con LinnkPro AI"
        >
          {/* Animated Glow Ring */}
          <span className="absolute -inset-1 rounded-full bg-gradient-to-r from-[#E63946] via-[#D62839] to-[#F4B400] opacity-35 blur group-hover:opacity-75 transition duration-500"></span>

          <div className="relative flex items-center justify-center">
            {isInVoiceCall ? (
              <div className="relative flex items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F4B400] opacity-75"></span>
                <PhoneCall className="w-5 h-5 text-white animate-pulse" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#E63946] to-[#F4B400] flex items-center justify-center shadow-md">
                <Mic className="w-5 h-5 text-white" />
              </div>
            )}
          </div>

          <div className="relative flex flex-col text-left pr-1">
            <span className="text-xs font-black tracking-wide uppercase leading-tight text-white flex items-center gap-1.5">
              linnkpro<span className="text-[#F4B400]">.ai voice</span>
              <span className={`inline-block w-2 h-2 rounded-full ${isInVoiceCall ? 'bg-[#F4B400] animate-ping' : 'bg-[#E63946]'}`}></span>
            </span>
            <span className="text-[11px] font-medium text-[#A9B2C3] leading-tight">
              {isInVoiceCall ? (
                <span className="text-[#F4B400] font-bold">🔴 En llamada ({formatDuration(callDuration)})</span>
              ) : (
                'Toca para hablar en vivo'
              )}
            </span>
          </div>
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
              <div className="px-4 py-3 bg-[#0D111D]/95 border-b border-[#232B3A] flex items-center justify-between z-10 backdrop-blur">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#E63946] flex items-center justify-center text-white shadow-md">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-white flex items-center gap-1.5 leading-none lowercase">
                      linnkpro<span className="text-[#F4B400]">.ai</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#E63946]/15 text-[#E63946] border border-[#E63946]/40 font-bold uppercase tracking-wider">
                        Real-Time
                      </span>
                    </h3>
                    <div className="flex items-center gap-1.5 text-[11px] text-[#A9B2C3] mt-1">
                      {isInVoiceCall ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-[#F4B400] animate-ping"></span>
                          <span className="text-[#F4B400] font-semibold">Llamada en curso: {formatDuration(callDuration)}</span>
                        </>
                      ) : (
                        <span>Llamada finalizada</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* View Mode Switcher (Call vs Chat) */}
                  <div className="bg-[#111827] p-0.5 rounded-xl border border-[#232B3A] flex items-center">
                    <button
                      onClick={() => {
                        setActiveTab('call');
                        if (!isInVoiceCallRef.current) {
                          startVoiceCall();
                        }
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                        activeTab === 'call' 
                          ? 'bg-[#E63946] text-white shadow-md' 
                          : 'text-[#A9B2C3] hover:text-white'
                      }`}
                    >
                      <Radio className="w-3 h-3" />
                      Voz
                    </button>
                    <button
                      onClick={() => {
                        endVoiceCall();
                        setActiveTab('chat');
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                        activeTab === 'chat' 
                          ? 'bg-[#E63946] text-white shadow-md' 
                          : 'text-[#A9B2C3] hover:text-white'
                      }`}
                    >
                      <MessageSquare className="w-3 h-3" />
                      Chat
                    </button>
                  </div>

                  <button
                    id="linnkpro-voice-close-btn"
                    onClick={() => {
                      setIsOpen(false);
                    }}
                    className="p-2 rounded-xl text-[#A9B2C3] hover:text-white hover:bg-[#111827] transition"
                    title="Minimizar ventana"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* VIEW 1: IMMERSIVE REAL-TIME VOICE CALL STAGE */}
              {activeTab === 'call' && (
                <div className="flex-1 flex flex-col justify-between p-4 overflow-y-auto relative bg-[#090B12]">
                  {/* Background Radial Glow matching LinnkPro Store */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className={`w-80 h-80 rounded-full blur-[90px] transition-all duration-700 opacity-25 ${
                      assistantState === 'listening'
                        ? 'bg-[#E63946] scale-110'
                        : assistantState === 'speaking'
                        ? 'bg-[#F4B400] scale-125'
                        : assistantState === 'processing'
                        ? 'bg-[#E63946]/70 scale-100'
                        : 'bg-[#E63946]/20'
                    }`}></div>
                  </div>

                  {/* 1. Status Indicator Pill */}
                  <div className="flex justify-center z-10 pt-1">
                    <div className={`px-4 py-1.5 rounded-full border text-xs font-bold flex items-center gap-2 shadow-lg backdrop-blur transition-all duration-300 ${
                      assistantState === 'listening'
                        ? 'bg-[#E63946]/20 border-[#E63946]/50 text-white'
                        : assistantState === 'speaking'
                        ? 'bg-[#F4B400]/20 border-[#F4B400]/50 text-[#F4B400] animate-pulse'
                        : assistantState === 'processing'
                        ? 'bg-[#111827] border-[#232B3A] text-white animate-pulse'
                        : 'bg-[#111827] border-[#232B3A] text-[#A9B2C3]'
                    }`}>
                      {assistantState === 'listening' && (
                        <>
                          <span className="w-2 h-2 rounded-full bg-[#E63946] animate-ping"></span>
                          <span>🎙️ Escuchando... habla con libertad</span>
                        </>
                      )}
                      {assistantState === 'speaking' && (
                        <>
                          <span className="w-2 h-2 rounded-full bg-[#F4B400] animate-bounce"></span>
                          <span>🔊 LinnkPro hablando (puedes interrumpirme)</span>
                        </>
                      )}
                      {assistantState === 'processing' && (
                        <>
                          <span className="w-2 h-2 rounded-full bg-[#E63946] animate-spin"></span>
                          <span>🧠 Procesando en tiempo real...</span>
                        </>
                      )}
                      {assistantState === 'idle' && (
                        <>
                          <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                          <span>⏸️ En espera</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Mobile Mic Permission / Device Notice */}
                  {micPermissionError && (
                    <div className="z-20 my-2 mx-auto max-w-sm bg-rose-950/90 border border-[#E63946] rounded-2xl p-3 text-center shadow-2xl backdrop-blur">
                      <p className="text-xs text-rose-200 font-medium leading-relaxed">
                        {micPermissionError}
                      </p>
                      <button
                        onClick={startVoiceCall}
                        className="mt-2 px-3 py-1 bg-[#E63946] hover:bg-[#D62839] text-white text-xs font-bold rounded-lg transition"
                      >
                        🔄 Reintentar conexión de voz
                      </button>
                    </div>
                  )}

                  {/* 2. Interactive Central AI Voice Orb */}
                  <div className="flex flex-col items-center justify-center my-auto py-4 z-10">
                    <div className="relative flex items-center justify-center">
                      {/* Pulse Ring 1 */}
                      <div 
                        className={`absolute rounded-full border transition-all duration-500 ${
                          assistantState === 'listening'
                            ? 'border-[#E63946]/50 animate-ping'
                            : assistantState === 'speaking'
                            ? 'border-[#F4B400]/50 animate-ping'
                            : 'border-transparent'
                        }`}
                        style={{
                          width: `${140 + micAudioLevel * 80}px`,
                          height: `${140 + micAudioLevel * 80}px`,
                        }}
                      />

                      {/* Pulse Ring 2 */}
                      <div 
                        className={`absolute rounded-full border transition-all duration-300 ${
                          assistantState === 'listening'
                            ? 'border-[#E63946]/30'
                            : assistantState === 'speaking'
                            ? 'border-[#F4B400]/30'
                            : 'border-transparent'
                        }`}
                        style={{
                          width: `${170 + micAudioLevel * 100}px`,
                          height: `${170 + micAudioLevel * 100}px`,
                        }}
                      />

                      {/* Main Orb */}
                      <div 
                        className={`w-32 h-32 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 transform ${
                          assistantState === 'listening'
                            ? 'bg-gradient-to-tr from-[#E63946] via-[#D62839] to-[#F4B400] shadow-[#E63946]/60 scale-105'
                            : assistantState === 'speaking'
                            ? 'bg-gradient-to-tr from-[#F4B400] via-[#E63946] to-[#D62839] shadow-[#F4B400]/60 scale-110 animate-pulse'
                            : assistantState === 'processing'
                            ? 'bg-gradient-to-tr from-[#1E293B] via-[#E63946] to-[#F4B400] shadow-[#E63946]/50 animate-spin'
                            : 'bg-gradient-to-tr from-[#111827] to-[#1F2937] shadow-black/80'
                        }`}
                      >
                        {assistantState === 'listening' ? (
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-6 bg-white rounded-full animate-bounce [animation-delay:0ms]"></span>
                            <span className="w-1.5 h-10 bg-white rounded-full animate-bounce [animation-delay:150ms]"></span>
                            <span className="w-1.5 h-5 bg-white rounded-full animate-bounce [animation-delay:300ms]"></span>
                            <span className="w-1.5 h-8 bg-white rounded-full animate-bounce [animation-delay:450ms]"></span>
                          </div>
                        ) : assistantState === 'speaking' ? (
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-4 bg-white rounded-full animate-pulse"></span>
                            <span className="w-1.5 h-8 bg-white rounded-full animate-pulse"></span>
                            <span className="w-1.5 h-10 bg-white rounded-full animate-pulse"></span>
                            <span className="w-1.5 h-6 bg-white rounded-full animate-pulse"></span>
                          </div>
                        ) : assistantState === 'processing' ? (
                          <Sparkles className="w-10 h-10 text-white animate-spin" />
                        ) : (
                          <Mic className="w-10 h-10 text-gray-300" />
                        )}
                      </div>
                    </div>

                    {/* Real-time Subtitles / Live Transcript */}
                    <div className="w-full max-w-sm mt-6 text-center min-h-[56px] flex items-center justify-center px-4">
                      {transcript ? (
                        <div className="bg-[#111827] border border-[#E63946]/50 rounded-2xl px-4 py-2 text-sm text-white shadow-lg animate-fadeIn">
                          <span className="text-[10px] text-[#E63946] font-extrabold block uppercase tracking-wider mb-0.5">Tú estás diciendo:</span>
                          "{transcript}"
                        </div>
                      ) : assistantState === 'speaking' && lastAssistantMessage ? (
                        <div className="bg-[#161F30] border border-[#F4B400]/40 rounded-2xl px-4 py-2 text-xs text-gray-100 max-h-24 overflow-y-auto shadow-lg">
                          <span className="text-[10px] text-[#F4B400] font-extrabold block uppercase tracking-wider mb-0.5">LinnkPro AI:</span>
                          {lastAssistantMessage.text}
                        </div>
                      ) : assistantState === 'processing' ? (
                        <p className="text-xs text-[#F4B400] animate-pulse font-bold">
                          Consultando menú y preparando respuesta...
                        </p>
                      ) : (
                        <p className="text-xs text-[#A9B2C3]">
                          {isInVoiceCall 
                            ? '🎙️ Te estoy escuchando. Habla cuando quieras.' 
                            : 'Presiona Iniciar Voz en Vivo para conversar.'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 3. Action Cards Pop-up (Cart or Product quick cards during call) */}
                  {lastAssistantMessage?.actionPayload && (
                    <div className="z-10 mb-2">
                      {lastAssistantMessage.actionPayload.type === 'CART_SUMMARY' && (
                        <div className="bg-[#111827] border border-[#E63946]/40 rounded-2xl p-3 shadow-lg flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-[#E63946]/20 text-[#E63946] flex items-center justify-center font-bold">
                              <ShoppingBag className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-white">Carrito Actualizado</h4>
                              <p className="text-[11px] text-[#F4B400] font-bold">
                                {cart.reduce((s, i) => s + i.quantity, 0)} platos • ${cart.reduce((s, i) => s + (i.product.price * i.quantity), 0).toLocaleString('es-CO')} COP
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              endVoiceCall();
                              setActiveTab('chat');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-[#E63946] hover:bg-[#D62839] text-white text-xs font-bold transition flex items-center gap-1 shadow-md"
                          >
                            Ver Carrito <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {lastAssistantMessage.actionPayload.type === 'ORDER_CONFIRMATION_REQUESTED' && (
                        <div className="bg-gradient-to-r from-[#1E1418] to-[#111827] border border-[#F4B400]/50 rounded-2xl p-3 shadow-xl flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-[#F4B400]/20 text-[#F4B400] flex items-center justify-center font-bold">
                              <AlertCircle className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-white">Confirmar Pedido</h4>
                              <p className="text-[11px] text-[#F4B400] font-bold">
                                Total: ${lastAssistantMessage.actionPayload.data.grandTotal?.toLocaleString('es-CO')} COP
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              await handleExecuteOrderCreation(lastAssistantMessage.actionPayload?.data);
                              handleSendMessage("Sí, confirmo mi pedido ahora.");
                            }}
                            className="px-3 py-1.5 rounded-xl bg-[#E63946] hover:bg-[#D62839] text-white text-xs font-bold transition shadow-md"
                          >
                            Confirmar
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 4. Quick Suggestion Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none z-10">
                    <button
                      onClick={() => handleSendMessage("Quiero pedir una hamburguesa")}
                      className="px-3 py-1.5 rounded-full bg-[#111827] hover:bg-[#E63946]/20 hover:border-[#E63946] text-[#A9B2C3] hover:text-white text-xs font-bold border border-[#232B3A] whitespace-nowrap transition"
                    >
                      🍔 Pedir hamburguesa
                    </button>
                    <button
                      onClick={() => handleSendMessage("Qué pizzas tienen disponibles?")}
                      className="px-3 py-1.5 rounded-full bg-[#111827] hover:bg-[#E63946]/20 hover:border-[#E63946] text-[#A9B2C3] hover:text-white text-xs font-bold border border-[#232B3A] whitespace-nowrap transition"
                    >
                      🍕 Ver pizzas
                    </button>
                    <button
                      onClick={() => handleSendMessage("Qué hay en mi carrito?")}
                      className="px-3 py-1.5 rounded-full bg-[#111827] hover:bg-[#E63946]/20 hover:border-[#E63946] text-[#A9B2C3] hover:text-white text-xs font-bold border border-[#232B3A] whitespace-nowrap transition"
                    >
                      🛒 Mi carrito
                    </button>
                    <button
                      onClick={() => handleSendMessage("Confirmar mi pedido para entrega")}
                      className="px-3 py-1.5 rounded-full bg-[#111827] hover:bg-[#E63946]/20 hover:border-[#E63946] text-[#A9B2C3] hover:text-white text-xs font-bold border border-[#232B3A] whitespace-nowrap transition"
                    >
                      🛵 Confirmar pedido
                    </button>
                  </div>
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

                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* BOTTOM CALL CONTROLS BAR (Phone Call Experience) */}
              <div className="p-3.5 sm:p-4 bg-[#0D111D] border-t border-[#232B3A] flex flex-col gap-2.5">
                {/* Fallback Text Input (if user wants to type or edit text) */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative flex items-center">
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
                      placeholder={
                        isInVoiceCall
                          ? "🎙️ Micrófono en vivo activo... (o escribe aquí)"
                          : "Escribe un mensaje o habla por voz..."
                      }
                      className="w-full bg-[#111827] border border-[#232B3A] focus:border-[#E63946] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 outline-none transition pr-10"
                    />
                    {inputText.trim() && (
                      <button
                        onClick={() => handleSendMessage(inputText)}
                        className="absolute right-2 p-1.5 rounded-lg bg-[#E63946] hover:bg-[#D62839] text-white transition"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Primary Call Controls (Mute Mic, Speaker Mute, End Call / Start Call) */}
                <div className="flex items-center justify-around pt-1">
                  {/* Toggle User Microphone */}
                  <button
                    id="linnkpro-voice-mic-toggle-btn"
                    onClick={() => setIsMicMuted(prev => !prev)}
                    className={`flex flex-col items-center gap-1 transition ${
                      isMicMuted ? 'text-[#E63946]' : 'text-[#A9B2C3] hover:text-white'
                    }`}
                  >
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border transition ${
                      isMicMuted 
                        ? 'bg-rose-950/70 border-[#E63946]/60 text-[#E63946]' 
                        : 'bg-[#111827] border-[#232B3A] text-white'
                    }`}>
                      {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </div>
                    <span className="text-[10px] font-bold">{isMicMuted ? 'Micrófono Mudo' : 'Silenciar'}</span>
                  </button>

                  {/* Main Call Action Button (Phone Call Start / Hang up) */}
                  {isInVoiceCall ? (
                    <button
                      id="linnkpro-voice-end-call-btn"
                      onClick={endVoiceCall}
                      className="flex flex-col items-center gap-1 group"
                    >
                      <div className="w-14 h-14 rounded-3xl bg-gradient-to-r from-red-700 to-[#E63946] text-white flex items-center justify-center shadow-xl shadow-red-950/60 group-hover:scale-105 transition transform active:scale-95 ring-4 ring-red-500/20">
                        <PhoneOff className="w-6 h-6 text-white" />
                      </div>
                      <span className="text-[11px] font-black text-[#E63946] uppercase tracking-wider">Finalizar</span>
                    </button>
                  ) : (
                    <button
                      id="linnkpro-voice-start-call-btn"
                      onClick={startVoiceCall}
                      className="flex flex-col items-center gap-1 group"
                    >
                      <div className="w-14 h-14 rounded-3xl bg-gradient-to-r from-[#E63946] via-[#D62839] to-[#F4B400] text-white flex items-center justify-center shadow-xl shadow-red-950/60 group-hover:scale-105 transition transform active:scale-95 ring-4 ring-[#E63946]/30 animate-pulse">
                        <PhoneCall className="w-6 h-6 text-white" />
                      </div>
                      <span className="text-[11px] font-black text-white uppercase tracking-wider">Hablar en Vivo</span>
                    </button>
                  )}

                  {/* Toggle AI Speaker Voice Output */}
                  <button
                    id="linnkpro-voice-speaker-toggle-btn"
                    onClick={() => setIsVoiceMuted(prev => !prev)}
                    className={`flex flex-col items-center gap-1 transition ${
                      isVoiceMuted ? 'text-[#F4B400]' : 'text-[#A9B2C3] hover:text-white'
                    }`}
                  >
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border transition ${
                      isVoiceMuted 
                        ? 'bg-amber-950/70 border-[#F4B400]/60 text-[#F4B400]' 
                        : 'bg-[#111827] border-[#232B3A] text-white'
                    }`}>
                      {isVoiceMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                    </div>
                    <span className="text-[10px] font-bold">{isVoiceMuted ? 'Altavoz Mudo' : 'Altavoz'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
