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
  X, 
  MessageSquare, 
  ShoppingBag, 
  Plus, 
  Minus, 
  Trash2, 
  Send, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Sparkles, 
  ChefHat, 
  Radio, 
  RefreshCw,
  ArrowRight
} from 'lucide-react';
import { ProductItem, UserProfile, OrderItem } from '../types';
import { 
  fetchAllActiveProductsAndStores, 
  fetchSystemSettings, 
  checkIsStoreClosed, 
  findStoreForProduct,
  DEFAULT_PLATFORM_PRODUCTS, 
  DEFAULT_PLATFORM_STORES 
} from '../lib/firebase';
import { 
  getStoredCart, 
  addProductToCart, 
  updateCartQuantity, 
  clearAllCart, 
  calculateCartSummary, 
  GeneralCartItem, 
  CART_UPDATED_EVENT 
} from '../lib/cartHelper';
import { RealtimeMeseroManager, RealtimeAssistantState } from '../lib/realtimeMeseroAgent';

interface LinnkProVoiceAssistantProps {
  onNavigateToStore?: (username: string) => void;
  onNavigateToTienda?: () => void;
  activeUsername?: string | null;
}

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
  // Modal & Tab State
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showFloatingTooltip, setShowFloatingTooltip] = useState(true);
  const [activeTab, setActiveTab] = useState<'call' | 'chat'>('call');
  const [callDuration, setCallDuration] = useState(0);

  // Realtime Voice Assistant state (WebRTC + OpenAI Realtime gpt-realtime-2.1)
  const [assistantState, setAssistantState] = useState<RealtimeAssistantState>('idle');
  const [transcript, setTranscript] = useState('');
  const [inputText, setInputText] = useState('');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);

  // Chat message stream
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: '¡Hola! Soy iAmesero, tu mesera virtual en LinnkPro. ¿Qué se te antoja ordenar hoy?',
      timestamp: new Date()
    }
  ]);

  // Catalog & Cart Context
  const [catalogProducts, setCatalogProducts] = useState<ProductItem[]>(DEFAULT_PLATFORM_PRODUCTS);
  const [catalogStores, setCatalogStores] = useState<Record<string, UserProfile>>(DEFAULT_PLATFORM_STORES);
  const [systemDeliveryFee, setSystemDeliveryFee] = useState<number>(4000);
  const [cart, setCart] = useState<GeneralCartItem[]>(getStoredCart());
  const [isOrdering, setIsOrdering] = useState(false);

  // Realtime Manager Reference
  const realtimeManagerRef = useRef<RealtimeMeseroManager | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isInVoiceCallRef = useRef<boolean>(false);

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
    if (assistantState !== 'idle' && assistantState !== 'error') {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [assistantState]);

  // 4. Scroll to bottom of chat
  useEffect(() => {
    if (isOpen && activeTab === 'chat') {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages, isOpen, activeTab]);

  // 5. Initialize or Get Realtime Manager
  const getOrCreateRealtimeManager = () => {
    if (!realtimeManagerRef.current) {
      realtimeManagerRef.current = new RealtimeMeseroManager({
        onStateChange: (state) => {
          setAssistantState(state);
        },
        onTranscriptDelta: (text, isFinal, sender) => {
          setTranscript(text);
          if (isFinal) {
            setMessages(prev => {
              const last = prev[prev.length - 1];
              // Avoid exact duplicate append if same message
              if (last && last.sender === sender && last.text === text) {
                return prev;
              }
              return [
                ...prev,
                {
                  id: `${sender}_${Date.now()}_${Math.random()}`,
                  sender,
                  text,
                  timestamp: new Date()
                }
              ];
            });
          }
        },
        onAudioLevel: (level) => {
          setAudioLevel(level);
        },
        onCartUpdated: (updatedCart) => {
          setCart(updatedCart);
        },
        onOrderCreated: (order) => {
          setMessages(prev => [
            ...prev,
            {
              id: `order_${Date.now()}`,
              sender: 'assistant',
              text: `¡Tu pedido #${order.orderNumber} ha sido confirmado con éxito!`,
              timestamp: new Date(),
              actionPayload: {
                type: 'ORDER_CREATE_CONFIRMED',
                data: order
              }
            }
          ]);
        },
        onError: (err) => {
          console.warn("Realtime WebRTC Notice:", err);
          const errMsg = typeof err === 'string' ? err : err?.message || 'Error en la sesión de voz Realtime';
          if (errMsg.toLowerCase().includes('permission') || errMsg.toLowerCase().includes('notallowed')) {
            setMicPermissionError('Permiso de micrófono denegado. Permite el acceso al micrófono en tu navegador para continuar.');
          } else {
            setMicPermissionError(errMsg);
          }
        }
      });
    }
    return realtimeManagerRef.current;
  };

  // 6. Start continuous WebRTC session with gpt-realtime-2.1 and VAD
  const startVoiceCall = async () => {
    setMicPermissionError(null);
    setTranscript('');
    isInVoiceCallRef.current = true;

    try {
      const manager = getOrCreateRealtimeManager();
      await manager.start();
    } catch (err: any) {
      console.warn("Failed to start WebRTC session:", err);
      if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission denied')) {
        setMicPermissionError('Permiso de micrófono denegado. Toca el candado en la barra del navegador para permitir el micrófono.');
      } else {
        setMicPermissionError('No fue posible conectar con el mesero de voz. Intenta nuevamente.');
      }
    }
  };

  // 7. End Voice Call Session
  const endVoiceCall = () => {
    isInVoiceCallRef.current = false;
    if (realtimeManagerRef.current) {
      realtimeManagerRef.current.stop();
    }
    setAssistantState('idle');
    setTranscript('');
    setAudioLevel(0);
  };

  // Toggle Assistant Open / Close on Floating Button Tap
  const handleToggleAssistant = () => {
    if (isOpen) {
      endVoiceCall();
      setIsOpen(false);
      setIsMinimized(false);
    } else {
      setIsOpen(true);
      setIsMinimized(false);
      setActiveTab('call');
      startVoiceCall();
    }
  };

  // Toggle local mic mute
  const handleToggleMicMute = () => {
    if (realtimeManagerRef.current) {
      const nextMuted = !isMicMuted;
      realtimeManagerRef.current.setMicMuted(nextMuted);
      setIsMicMuted(nextMuted);
    }
  };

  // Toggle speaker mute
  const handleToggleSpeakerMute = () => {
    if (realtimeManagerRef.current) {
      const nextMuted = !isVoiceMuted;
      realtimeManagerRef.current.setSpeakerMuted(nextMuted);
      setIsVoiceMuted(nextMuted);
    }
  };

  // Central Orb Tap Handler: Allows user to interrupt assistant or start if idle
  const handleCentralOrbClick = () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(30);
      }
    } catch (e) {}

    if (assistantState === 'idle' || assistantState === 'error') {
      startVoiceCall();
      return;
    }

    if (assistantState === 'speaking') {
      if (realtimeManagerRef.current) {
        realtimeManagerRef.current.interruptAssistant();
      }
    }
  };

  // Send typed message via Realtime session or chat
  const handleSendTextMessage = (text: string) => {
    if (!text || !text.trim()) return;
    const clean = text.trim();
    setInputText('');

    if (realtimeManagerRef.current && realtimeManagerRef.current.getIsConnected()) {
      realtimeManagerRef.current.sendTextMessage(clean);
    } else {
      // Direct offline / fallback message
      setMessages(prev => [
        ...prev,
        { id: `usr_${Date.now()}`, sender: 'user', text: clean, timestamp: new Date() },
        { id: `asst_${Date.now()}`, sender: 'assistant', text: 'Conectando con iAmesero...', timestamp: new Date() }
      ]);
      startVoiceCall().then(() => {
        if (realtimeManagerRef.current) {
          realtimeManagerRef.current.sendTextMessage(clean);
        }
      });
    }
  };

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (realtimeManagerRef.current) {
        realtimeManagerRef.current.stop();
      }
    };
  }, []);

  const lastAssistantMessage = [...messages].reverse().find(m => m.sender === 'assistant');

  return (
    <>
      {/* 1. FLOATING CALL & CHAT TRIGGER (BOTTOM-LEFT CORNER) */}
      <div 
        id="linnkpro-voice-fab-container"
        className="fixed bottom-20 left-4 sm:bottom-6 sm:left-6 z-40 flex items-center gap-3"
      >
        {/* Minimized floating pill */}
        {isOpen && isMinimized ? (
          <motion.button
            id="linnkpro-voice-minimized-pill"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={() => setIsMinimized(false)}
            className="flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-[#121722]/95 hover:bg-[#181F2E] border-2 border-[#EF4444] shadow-[0_0_25px_rgba(239,68,68,0.45)] text-white hover:scale-105 transition-all group backdrop-blur-md cursor-pointer"
            title="Abrir iAmesero"
          >
            <div className="w-7 h-7 rounded-full bg-[#EF4444] flex items-center justify-center text-white relative shadow-sm">
              <ChefHat className="w-4 h-4" />
              <span className="w-2 h-2 rounded-full bg-emerald-400 border border-[#121722] absolute -top-0.5 -right-0.5 animate-pulse"></span>
            </div>
            <span className="text-xs font-bold tracking-tight pr-1 flex items-center gap-1">
              <span className="text-[#EF4444]">iA</span>
              <span className="text-white">mesero</span>
            </span>
          </motion.button>
        ) : !isOpen ? (
          <div className="flex items-center gap-3">
            {/* Main Floating Trigger: 1-Tap Continuous Session */}
            <button
              id="linnkpro-voice-fab"
              onClick={handleToggleAssistant}
              className="relative w-14 h-14 rounded-full border-2 border-[#EF4444] bg-[#0E131F]/95 shadow-[0_0_25px_rgba(239,68,68,0.45)] hover:shadow-[0_0_35px_rgba(239,68,68,0.7)] flex items-center justify-center transition-all duration-300 transform active:scale-95 group hover:scale-105 flex-shrink-0 cursor-pointer"
              aria-label="Abrir mesero IA"
              title="Abrir mesero IA"
            >
              {/* Concentric subtle ping */}
              <span className="absolute -inset-1 rounded-full border border-red-500/40 animate-ping pointer-events-none opacity-40"></span>
              <span className="absolute -inset-2 rounded-full bg-red-600/10 blur-sm group-hover:bg-red-600/20 transition"></span>

              <div className="relative flex items-center justify-center">
                <ChefHat className="w-7 h-7 text-white group-hover:text-red-400 transition stroke-[2]" />
                <Sparkles className="w-3.5 h-3.5 text-amber-400 absolute -top-1.5 -right-1.5 animate-pulse" />
              </div>
            </button>

            {/* Friendly Speech Bubble Tooltip */}
            {showFloatingTooltip && (
              <motion.div
                initial={{ opacity: 0, x: -15, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative hidden sm:flex items-center bg-[#161D2B]/95 border border-red-500/40 text-white text-xs px-3.5 py-2 rounded-2xl shadow-xl backdrop-blur-md gap-2"
              >
                <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#161D2B] border-b border-l border-red-500/40 rotate-45"></div>
                <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 animate-pulse" />
                <span className="font-medium text-slate-200">¿Deseas ordenar por voz? Toca aquí</span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowFloatingTooltip(false);
                  }}
                  className="text-slate-400 hover:text-white p-0.5 ml-1 transition cursor-pointer"
                  title="Cerrar sugerencia"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            )}
          </div>
        ) : null}
      </div>

      {/* 2. FULL MODAL DIALOG (VOICE CALL & CHAT VIEWS) */}
      <AnimatePresence>
        {isOpen && !isMinimized && (
          <motion.div
            id="linnkpro-voice-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              id="linnkpro-voice-modal-container"
              initial={{ y: 50, scale: 0.95, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 50, scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full sm:max-w-md h-[92vh] sm:h-[620px] max-h-[720px] bg-[#121722] border sm:border-2 border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden relative"
            >
              {/* TOP HEADER BAR */}
              <div className="px-4 sm:px-5 py-3.5 bg-[#161D2B] border-b border-white/10 flex items-center justify-between z-10 w-full flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                  <div className="w-10 h-10 rounded-full border-2 border-[#EF4444] bg-[#0E131F] flex items-center justify-center text-white shadow-md shadow-red-500/20 flex-shrink-0">
                    <ChefHat className="w-5 h-5 text-white" />
                  </div>
                  
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-base font-extrabold tracking-tight leading-none">
                        <span className="text-[#EF4444]">iA</span>
                        <span className="text-white">mesero</span>
                      </h3>
                    </div>
                    {/* Status Pill */}
                    <div className="flex items-center gap-1.5 text-[11px] font-medium leading-none mt-1">
                      <span className={`w-2 h-2 rounded-full ${
                        assistantState === 'listening' 
                          ? 'bg-emerald-400 animate-pulse' 
                          : assistantState === 'user_speaking'
                          ? 'bg-blue-400 animate-ping'
                          : assistantState === 'speaking'
                          ? 'bg-amber-400 animate-pulse'
                          : assistantState === 'processing'
                          ? 'bg-red-400 animate-spin'
                          : 'bg-slate-500'
                      }`}></span>
                      <span className={`${
                        assistantState === 'listening' ? 'text-emerald-400' :
                        assistantState === 'user_speaking' ? 'text-blue-300' :
                        assistantState === 'speaking' ? 'text-amber-300' :
                        assistantState === 'processing' ? 'text-red-400' : 'text-slate-400'
                      }`}>
                        {assistantState === 'listening' ? 'Escuchando' :
                         assistantState === 'user_speaking' ? 'Escuchándote' :
                         assistantState === 'speaking' ? 'Hablando' :
                         assistantState === 'processing' ? 'Procesando' : 'En línea'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Action Controls */}
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                  {/* Mode Switcher */}
                  <div className="bg-[#0E131F] p-0.5 rounded-full border border-white/10 flex items-center">
                    <button
                      onClick={() => setActiveTab('call')}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer ${
                        activeTab === 'call' 
                          ? 'bg-[#EF4444] text-white shadow-sm' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Radio className="w-3 h-3" />
                      Voz
                    </button>
                    <button
                      onClick={() => setActiveTab('chat')}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer ${
                        activeTab === 'chat' 
                          ? 'bg-[#EF4444] text-white shadow-sm' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <MessageSquare className="w-3 h-3" />
                      Chat
                    </button>
                  </div>

                  {/* Minimize Button (—) */}
                  <button
                    id="linnkpro-voice-minimize-btn"
                    onClick={() => setIsMinimized(true)}
                    className="w-8 h-8 rounded-full bg-[#0E131F] hover:bg-slate-800 text-slate-300 hover:text-white border border-white/10 flex items-center justify-center transition active:scale-95 flex-shrink-0 cursor-pointer"
                    title="Minimizar"
                    aria-label="Minimizar"
                  >
                    <Minus className="w-4 h-4 text-slate-300" />
                  </button>

                  {/* Close Button (✕) */}
                  <button
                    id="linnkpro-voice-close-btn"
                    onClick={() => {
                      endVoiceCall();
                      setIsOpen(false);
                    }}
                    className="w-8 h-8 rounded-full bg-[#0E131F] hover:bg-red-500/20 text-slate-300 hover:text-white border border-white/10 flex items-center justify-center transition active:scale-95 flex-shrink-0 cursor-pointer"
                    title="Cerrar"
                    aria-label="Cerrar"
                  >
                    <X className="w-4 h-4 text-slate-300 hover:text-white" />
                  </button>
                </div>
              </div>

              {/* VIEW 1: IMMERSIVE REAL-TIME VOICE CALL STAGE */}
              {activeTab === 'call' && (
                <div className="flex-1 flex flex-col justify-between p-4 sm:p-6 overflow-y-auto relative bg-[#0B0F19]">
                  {/* Dynamic Radial Glow */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div 
                      className="w-80 h-80 rounded-full blur-[100px] transition-all duration-500 opacity-20 bg-[#EF4444]"
                      style={{
                        transform: `scale(${1 + audioLevel * 0.4})`
                      }}
                    ></div>
                  </div>

                  {/* 1. Header Title & Status */}
                  <div className="flex flex-col items-center justify-center z-10 pt-2 text-center">
                    <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                      {assistantState === 'user_speaking'
                        ? (transcript ? `"${transcript}"` : 'Te escucho atentamente...')
                        : assistantState === 'listening'
                        ? 'Escuchando... habla con libertad'
                        : assistantState === 'speaking'
                        ? 'iAmesero respondiendo...'
                        : assistantState === 'processing'
                        ? 'Consultando menú...'
                        : 'En llamada con iAmesero'}
                    </h2>

                    <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400">
                      <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        Micrófono activo
                      </span>
                      <span>•</span>
                      <span>Conversación continua</span>
                    </div>
                  </div>

                  {/* Permission error notice if any */}
                  {micPermissionError && (
                    <div className="z-20 my-2 mx-auto max-w-sm bg-rose-950/90 border border-rose-600 rounded-2xl p-3 text-center shadow-2xl backdrop-blur">
                      <p className="text-xs text-rose-200 font-medium leading-relaxed">
                        {micPermissionError}
                      </p>
                      <button
                        onClick={startVoiceCall}
                        className="mt-2 px-3 py-1 bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-bold rounded-lg transition cursor-pointer"
                      >
                        🔄 Reintentar conexión de voz
                      </button>
                    </div>
                  )}

                  {/* 2. Central iAmesero Orb matching exact button design with organic pulse */}
                  <div className="flex flex-col items-center justify-center my-auto py-6 z-10">
                    <div className="relative flex items-center justify-center">
                      {/* Outer concentric pulse ring */}
                      <div 
                        className={`w-52 h-52 sm:w-60 sm:h-60 rounded-full border border-red-900/30 bg-red-950/10 flex items-center justify-center absolute transition-all duration-300 ${
                          assistantState === 'user_speaking' || assistantState === 'speaking'
                            ? 'scale-110 opacity-90'
                            : 'scale-100 opacity-40'
                        }`}
                        style={{
                          transform: `scale(${1 + audioLevel * 0.3})`
                        }}
                      ></div>
                      
                      {/* Middle ring with soft red aura */}
                      <div 
                        className="w-40 h-40 sm:w-46 sm:h-46 rounded-full border border-red-800/40 bg-red-950/30 flex items-center justify-center absolute shadow-[0_0_50px_rgba(239,68,68,0.25)] transition-all duration-200"
                        style={{
                          transform: `scale(${1 + audioLevel * 0.2})`
                        }}
                      ></div>

                      {/* Central Circle Button matching exact design (Dark background + Red border + Chef Hat + Gold Sparkle) */}
                      <button
                        id="linnkpro-interactive-center-mic"
                        onClick={handleCentralOrbClick}
                        className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 sm:border-[3px] border-[#EF4444] bg-[#0E131F]/95 flex items-center justify-center shadow-[0_0_35px_rgba(239,68,68,0.5)] hover:shadow-[0_0_45px_rgba(239,68,68,0.7)] relative z-10 active:scale-95 hover:scale-105 transition-all duration-200 cursor-pointer focus:outline-none group"
                        title={assistantState === 'speaking' ? 'Toca para interrumpir' : 'iAmesero activo'}
                      >
                        <div className="relative flex items-center justify-center">
                          <ChefHat className="w-13 h-13 sm:w-15 sm:h-15 text-white stroke-[2.2] group-hover:scale-105 transition-transform" />
                          <Sparkles className="w-6 h-6 text-amber-400 absolute -top-2.5 -right-2.5 animate-pulse drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                        </div>
                      </button>
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
                            onClick={() => setActiveTab('chat')}
                            className="px-3 py-1.5 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-bold transition flex items-center gap-1 shadow-md cursor-pointer"
                          >
                            Ver Carrito <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {lastAssistantMessage.actionPayload.type === 'ORDER_CREATE_CONFIRMED' && (
                        <div className="bg-[#111827] border border-emerald-500/40 rounded-2xl p-3 shadow-lg flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold flex-shrink-0">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-white">Pedido Confirmado</h4>
                            <p className="text-[11px] text-slate-300">
                              El restaurante ya está preparando tu orden.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* VIEW 2: CHAT & CART TRANSCRIPT VIEW */}
              {activeTab === 'chat' && (
                <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm bg-[#121722] scrollbar-thin scrollbar-thumb-slate-800">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-start gap-2.5 max-w-[88%]">
                        {msg.sender === 'assistant' && (
                          <div className="w-7 h-7 rounded-full bg-[#EF4444] text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                            <ChefHat className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <div
                          className={`rounded-2xl px-4 py-2.5 shadow-md ${
                            msg.sender === 'user'
                              ? 'bg-[#EF4444] text-white rounded-tr-sm font-medium'
                              : 'bg-[#182030] text-slate-100 border border-white/10 rounded-tl-sm'
                          }`}
                        >
                          <p className="leading-relaxed whitespace-pre-wrap text-[13.5px]">{msg.text}</p>
                          <span className={`text-[10px] mt-1 block text-right ${msg.sender === 'user' ? 'text-red-100/80' : 'text-slate-400'}`}>
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      {/* Rich Action Attachments */}
                      {msg.actionPayload && (
                        <div className="w-full mt-2 space-y-2 pl-9">
                          {/* Cart Summary Card */}
                          {msg.actionPayload.type === 'CART_SUMMARY' && (
                            <div className="bg-[#161D2B] border border-white/10 rounded-2xl p-3.5 shadow-md">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-white flex items-center gap-1">
                                  <ShoppingBag className="w-3.5 h-3.5 text-[#EF4444]" />
                                  Carrito de Compras ({cart.reduce((s, i) => s + i.quantity, 0)} ítems)
                                </span>
                                {cart.length > 0 && (
                                  <button
                                    onClick={() => {
                                      clearAllCart();
                                      setCart([]);
                                    }}
                                    className="text-[11px] text-[#EF4444] hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" /> Vaciar
                                  </button>
                                )}
                              </div>

                              {cart.length === 0 ? (
                                <p className="text-xs text-slate-400 py-2 text-center">Tu carrito está vacío.</p>
                              ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                  {cart.map((item) => (
                                    <div
                                      key={item.id}
                                      className="flex items-center justify-between p-2 rounded-xl bg-[#0E131F] border border-white/10 text-xs"
                                    >
                                      <div className="flex-1 truncate pr-2">
                                        <span className="font-bold text-white truncate block">{item.product.name}</span>
                                        <span className="text-[11px] text-amber-400 font-semibold">${(item.product.price * item.quantity).toLocaleString('es-CO')} COP</span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          onClick={() => {
                                            const updated = updateCartQuantity(item.id, item.quantity - 1);
                                            setCart(updated);
                                          }}
                                          className="w-6 h-6 rounded-md bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white cursor-pointer"
                                        >
                                          <Minus className="w-3 h-3" />
                                        </button>
                                        <span className="w-5 text-center font-bold text-white">{item.quantity}</span>
                                        <button
                                          onClick={() => {
                                            const updated = updateCartQuantity(item.id, item.quantity + 1);
                                            setCart(updated);
                                          }}
                                          className="w-6 h-6 rounded-md bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white cursor-pointer"
                                        >
                                          <Plus className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}

                                  {(() => {
                                    const summary = calculateCartSummary(cart, systemDeliveryFee);
                                    return (
                                      <div className="pt-2 border-t border-white/10 text-xs space-y-1">
                                        <div className="flex justify-between text-slate-400">
                                          <span>Subtotal:</span>
                                          <span>${summary.subtotal.toLocaleString('es-CO')} COP</span>
                                        </div>
                                        <div className="flex justify-between text-slate-400">
                                          <span>Domicilio ({summary.storeCount} restaurante):</span>
                                          <span>${summary.deliveryFee.toLocaleString('es-CO')} COP</span>
                                        </div>
                                        <div className="flex justify-between text-white font-bold pt-1 border-t border-white/10">
                                          <span>Total:</span>
                                          <span className="text-amber-400 font-black text-sm">${summary.grandTotal.toLocaleString('es-CO')} COP</span>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Order Created Card */}
                          {msg.actionPayload.type === 'ORDER_CREATE_CONFIRMED' && (
                            <div className="bg-[#161D2B] border border-[#EF4444]/50 rounded-2xl p-4 text-center">
                              <div className="w-10 h-10 mx-auto rounded-full bg-[#EF4444]/20 text-[#EF4444] flex items-center justify-center mb-2">
                                <CheckCircle2 className="w-6 h-6" />
                              </div>
                              <h4 className="text-sm font-extrabold text-white">¡Pedido Creado con Éxito!</h4>
                              <p className="text-xs text-slate-400 mt-1">
                                El restaurante ha recibido tu pedido y comenzará a prepararlo de inmediato.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Processing Indicator */}
                  {assistantState === 'processing' && (
                    <div className="flex items-center gap-2 text-xs text-slate-400 bg-[#182030] border border-white/10 px-3.5 py-2 rounded-2xl w-fit">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#EF4444]" />
                      <span>iAmesero está pensando...</span>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* BOTTOM CONTROLS & INPUT BAR */}
              <div className="p-3 sm:p-4 bg-[#161D2B] border-t border-white/10 flex flex-col gap-3">
                {/* Pill Shaped Text Input */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative flex items-center bg-[#0E131F] border border-white/10 rounded-full px-4 py-2.5 shadow-inner focus-within:border-[#EF4444]/60 transition">
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendTextMessage(inputText);
                        }
                      }}
                      placeholder="Escribe un mensaje o habla libremente..."
                      className="w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none pr-10"
                    />

                    {inputText.trim() ? (
                      <button
                        onClick={() => handleSendTextMessage(inputText)}
                        className="absolute right-1.5 w-8 h-8 rounded-full bg-[#EF4444] hover:bg-[#DC2626] text-white flex items-center justify-center transition active:scale-95 shadow-md cursor-pointer"
                        title="Enviar mensaje"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    ) : (
                      <div className="absolute right-2 flex items-center">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          assistantState === 'listening' ? 'bg-emerald-400 animate-pulse' :
                          assistantState === 'user_speaking' ? 'bg-blue-400 animate-ping' :
                          assistantState === 'speaking' ? 'bg-amber-400' : 'bg-slate-600'
                        }`}></span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Primary Call Controls (Silenciar, Finalizar, Altavoz) */}
                {activeTab === 'call' && (
                  <div className="flex items-center justify-around pt-1 pb-1">
                    {/* Toggle User Microphone (Silenciar) */}
                    <button
                      id="linnkpro-voice-mic-toggle-btn"
                      onClick={handleToggleMicMute}
                      className="flex flex-col items-center gap-1.5 group transition cursor-pointer"
                    >
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center border transition transform active:scale-95 ${
                        isMicMuted 
                          ? 'bg-red-950/80 border-red-500 text-red-400 shadow-lg shadow-red-950/50' 
                          : 'bg-[#0E131F] border-white/10 text-[#EF4444] group-hover:border-red-500/40 group-hover:bg-[#182030]'
                      }`}>
                        {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5 text-[#EF4444] stroke-[2]" />}
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium group-hover:text-white transition">
                        {isMicMuted ? 'Activado' : 'Silenciar'}
                      </span>
                    </button>

                    {/* Main Call Action Button: Finalizar (Red button with X) or Iniciar */}
                    {assistantState !== 'idle' ? (
                      <button
                        id="linnkpro-voice-end-call-btn"
                        onClick={endVoiceCall}
                        className="flex flex-col items-center gap-1.5 group cursor-pointer"
                      >
                        <div className="w-16 h-16 rounded-full bg-[#EF4444] hover:bg-[#DC2626] text-white flex items-center justify-center shadow-xl shadow-red-600/30 group-hover:scale-105 transition transform active:scale-95">
                          <X className="w-7 h-7 text-white stroke-[2.5]" />
                        </div>
                        <span className="text-[11px] font-semibold text-white tracking-wide">Finalizar</span>
                      </button>
                    ) : (
                      <button
                        id="linnkpro-voice-start-call-btn"
                        onClick={startVoiceCall}
                        className="flex flex-col items-center gap-1.5 group cursor-pointer"
                      >
                        <div className="w-16 h-16 rounded-full bg-[#EF4444] hover:bg-[#DC2626] text-white flex items-center justify-center shadow-xl shadow-red-600/30 group-hover:scale-105 transition transform active:scale-95 animate-pulse">
                          <Mic className="w-7 h-7 text-white stroke-[2.5]" />
                        </div>
                        <span className="text-[11px] font-semibold text-white tracking-wide">Iniciar</span>
                      </button>
                    )}

                    {/* Toggle AI Speaker Voice Output (Altavoz) */}
                    <button
                      id="linnkpro-voice-speaker-toggle-btn"
                      onClick={handleToggleSpeakerMute}
                      className="flex flex-col items-center gap-1.5 group transition cursor-pointer"
                    >
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center border transition transform active:scale-95 ${
                        isVoiceMuted 
                          ? 'bg-amber-950/80 border-amber-500 text-amber-400' 
                          : 'bg-[#0E131F] border-white/10 text-[#EF4444] group-hover:border-red-500/40 group-hover:bg-[#182030]'
                      }`}>
                        {isVoiceMuted ? <VolumeX className="w-5 h-5 text-amber-400" /> : <Volume2 className="w-5 h-5 text-[#EF4444] stroke-[2]" />}
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium group-hover:text-white transition">Altavoz</span>
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
