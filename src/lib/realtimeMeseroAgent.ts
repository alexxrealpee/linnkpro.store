/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { saveOrder } from './firebase';
import { 
  getClientAvailableCatalog, 
  validateStoreAndProductBeforeCart, 
  validateCartBeforeOrder 
} from './catalogManager';
import { 
  getStoredCart, 
  addProductToCart, 
  updateCartQuantity, 
  removeProductFromCart, 
  clearAllCart, 
  calculateCartSummary,
  GeneralCartItem
} from './cartHelper';
import { OrderItem } from '../types';

export type RealtimeAssistantState = 'idle' | 'listening' | 'user_speaking' | 'processing' | 'speaking' | 'error';

export interface RealtimeMeseroCallbacks {
  onStateChange: (state: RealtimeAssistantState) => void;
  onTranscriptDelta: (text: string, isFinal: boolean, sender: 'user' | 'assistant') => void;
  onAudioLevel?: (level: number) => void;
  onCartUpdated?: (cart: GeneralCartItem[]) => void;
  onOrderCreated?: (order: OrderItem) => void;
  onError?: (err: Error | string) => void;
}

export class RealtimeMeseroManager {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;
  private callbacks: RealtimeMeseroCallbacks;
  private isConnected: boolean = false;
  private currentAssistantTranscript: string = '';
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private isMicMuted: boolean = false;
  private isSpeakerMuted: boolean = false;

  constructor(callbacks: RealtimeMeseroCallbacks) {
    this.callbacks = callbacks;
  }

  // Tool execution dispatcher matching all 12 platform capabilities
  public async executeToolCall(name: string, args: any): Promise<any> {
    try {
      if (name === 'buscarRestaurantes') {
        const query = (args?.query || '').toLowerCase().trim();
        const catalog = getClientAvailableCatalog();
        const openStores = catalog.stores || [];

        let filtered = openStores;
        if (query) {
          filtered = openStores.filter(s => 
            (s.displayName && s.displayName.toLowerCase().includes(query)) ||
            (s.username && s.username.toLowerCase().includes(query)) ||
            (s.bio && s.bio.toLowerCase().includes(query)) ||
            catalog.products.some(p => (p.userId === s.uid || p.storeUsername === s.username) && (p.name.toLowerCase().includes(query) || (p.category && p.category.toLowerCase().includes(query))))
          );
        }

        if (filtered.length === 0) {
          if (openStores.length === 0) {
            return { resultado: "En este momento no hay restaurantes abiertos.", restaurantesDisponibles: [] };
          }
          return {
            resultado: "No encontré ese restaurante entre los abiertos actualmente.",
            restaurantesDisponibles: openStores.slice(0, 6).map(s => s.displayName || s.username)
          };
        }

        return {
          total: filtered.length,
          restaurantes: filtered.map(s => ({
            nombre: s.displayName || s.username,
            usuario: s.username,
            descripcion: s.bio || 'Restaurante afiliado a LinnkPro',
            estado: 'Abierto y listo para recibir pedidos'
          }))
        };
      }

      if (name === 'buscarProductos') {
        const query = (args?.query || '').toLowerCase().trim();
        const categoria = (args?.categoria || '').toLowerCase().trim();
        const catalog = getClientAvailableCatalog();
        const availableProducts = catalog.products || [];

        let matches = availableProducts.filter(p => 
          p.active !== false && 
          (p.name.toLowerCase().includes(query) || 
           (p.description && p.description.toLowerCase().includes(query)) || 
           (p.category && p.category.toLowerCase().includes(query)))
        );

        if (categoria) {
          matches = matches.filter(p => p.category && p.category.toLowerCase().includes(categoria));
        }

        if (matches.length === 0) {
          return {
            encontrados: 0,
            mensaje: `No encontré ningún plato disponible llamado "${args?.query || ''}" en las tiendas abiertas actualmente.`
          };
        }

        return {
          encontrados: matches.length,
          platos: matches.slice(0, 6).map(p => ({
            id: p.id,
            nombre: p.name,
            precio: `$${p.price.toLocaleString('es-CO')} pesos`,
            precioNumero: p.price,
            descripcion: p.description || '',
            categoria: p.category || 'General',
            restaurante: p.storeName || 'Restaurante Asociado',
            disponible: true
          }))
        };
      }

      if (name === 'buscarProducto') {
        const target = (args?.nombreOId || '').toLowerCase().trim();
        const catalog = getClientAvailableCatalog();
        const found = catalog.products.find(p => p.id === args?.nombreOId || p.name.toLowerCase().includes(target));

        if (!found) {
          return { 
            encontrado: false, 
            mensaje: `El plato "${args?.nombreOId}" no se encuentra disponible actualmente en ninguna tienda abierta.` 
          };
        }

        return {
          encontrado: true,
          id: found.id,
          nombre: found.name,
          precio: `$${found.price.toLocaleString('es-CO')} pesos`,
          precioNumero: found.price,
          descripcion: found.description || 'Plato preparado al momento con los mejores ingredientes.',
          categoria: found.category || 'General',
          restaurante: found.storeName || 'Restaurante Asociado',
          disponible: true
        };
      }

      if (name === 'obtenerMenu') {
        const rQuery = (args?.restaurante || '').toLowerCase().trim();
        const catalog = getClientAvailableCatalog();
        
        const targetStore = catalog.stores.find(s => 
          (s.displayName && s.displayName.toLowerCase().includes(rQuery)) ||
          (s.username && s.username.toLowerCase().includes(rQuery))
        );

        if (!targetStore) {
          return {
            encontrado: false,
            mensaje: `El restaurante "${args?.restaurante}" no se encuentra disponible o está cerrado.`
          };
        }

        const storeProducts = catalog.products.filter(p => 
          p.userId === targetStore.uid || 
          (p.storeUsername && p.storeUsername.toLowerCase() === targetStore.username?.toLowerCase())
        );

        return {
          restaurante: targetStore.displayName || targetStore.username,
          totalPlatos: storeProducts.length,
          menu: storeProducts.map(p => ({
            id: p.id,
            nombre: p.name,
            precio: `$${p.price.toLocaleString('es-CO')} pesos`,
            descripcion: p.description || '',
            categoria: p.category || 'General'
          }))
        };
      }

      if (name === 'obtenerCategorias') {
        const catalog = getClientAvailableCatalog();
        const catSet = new Set<string>();
        catalog.products.forEach(p => {
          if (p.category && p.category.trim()) catSet.add(p.category.trim());
        });
        const list = Array.from(catSet);
        return {
          categorias: list.length > 0 ? list : ['Comida Rápida', 'Hamburguesas', 'Pizzas', 'Bebidas', 'Postres']
        };
      }

      if (name === 'agregarAlCarrito') {
        const count = typeof args?.cantidad === 'number' && args.cantidad > 0 ? args.cantidad : 1;
        const catalog = getClientAvailableCatalog();
        const target = (args?.nombreProducto || '').toLowerCase().trim();
        
        let productToAdd = catalog.products.find(p => p.name.toLowerCase() === target);
        if (!productToAdd) {
          productToAdd = catalog.products.find(p => p.name.toLowerCase().includes(target));
        }

        if (!productToAdd) {
          return {
            exito: false,
            mensaje: `No fue posible agregar "${args?.nombreProducto}" porque no se encuentra en el catálogo de tiendas abiertas actualmente.`
          };
        }

        // Live validation against Firestore
        const validation = await validateStoreAndProductBeforeCart(productToAdd.id, productToAdd.userId);
        if (!validation.valid) {
          return {
            exito: false,
            mensaje: validation.reason || `Lo sentimos, la tienda de este plato se encuentra cerrada.`
          };
        }

        const updatedCart = addProductToCart(productToAdd, count, args?.variante);
        if (this.callbacks.onCartUpdated) {
          this.callbacks.onCartUpdated(updatedCart);
        }

        const summary = calculateCartSummary(updatedCart);
        return {
          exito: true,
          agregado: {
            nombre: productToAdd.name,
            cantidad: count,
            precioUnitario: `$${productToAdd.price.toLocaleString('es-CO')} pesos`,
            totalItem: `$${(productToAdd.price * count).toLocaleString('es-CO')} pesos`
          },
          resumenCarrito: {
            totalProductos: summary.totalItems,
            subtotal: `$${summary.subtotal.toLocaleString('es-CO')} pesos`,
            domicilio: `$${summary.deliveryFee.toLocaleString('es-CO')} pesos`,
            totalPagar: `$${summary.grandTotal.toLocaleString('es-CO')} pesos`
          },
          mensaje: `He agregado ${count} ${productToAdd.name} a tu carrito con éxito.`
        };
      }

      if (name === 'actualizarCantidadCarrito') {
        const currentCart = getStoredCart();
        const target = (args?.nombreProducto || '').toLowerCase().trim();
        const item = currentCart.find(i => 
          i.product.name.toLowerCase().includes(target) || 
          i.id.toLowerCase().includes(target)
        );

        if (!item) {
          return {
            exito: false,
            mensaje: `El producto "${args?.nombreProducto}" no se encuentra actualmente en tu carrito.`
          };
        }

        const count = typeof args?.nuevaCantidad === 'number' ? args.nuevaCantidad : 1;
        if (count > 0) {
          const validation = await validateStoreAndProductBeforeCart(item.product.id, item.product.userId);
          if (!validation.valid) {
            return {
              exito: false,
              mensaje: validation.reason || `No es posible modificar este producto porque la tienda se encuentra cerrada.`
            };
          }
        }

        const updatedCart = updateCartQuantity(item.id, Math.max(0, count));
        if (this.callbacks.onCartUpdated) {
          this.callbacks.onCartUpdated(updatedCart);
        }

        const summary = calculateCartSummary(updatedCart);
        return {
          exito: true,
          mensaje: count <= 0 
            ? `Se eliminó ${item.product.name} de tu carrito.` 
            : `Se actualizó la cantidad de ${item.product.name} a ${count}.`,
          resumenCarrito: {
            totalProductos: summary.totalItems,
            totalPagar: `$${summary.grandTotal.toLocaleString('es-CO')} pesos`
          }
        };
      }

      if (name === 'eliminarDelCarrito') {
        const currentCart = getStoredCart();
        const target = (args?.nombreProducto || '').toLowerCase().trim();
        const item = currentCart.find(i => 
          i.product.name.toLowerCase().includes(target) || 
          i.id.toLowerCase().includes(target)
        );

        if (!item) {
          return {
            exito: false,
            mensaje: `El producto "${args?.nombreProducto}" no estaba en tu carrito.`
          };
        }

        const updatedCart = removeProductFromCart(item.id);
        if (this.callbacks.onCartUpdated) {
          this.callbacks.onCartUpdated(updatedCart);
        }

        const summary = calculateCartSummary(updatedCart);
        return {
          exito: true,
          mensaje: `Eliminé ${item.product.name} de tu carrito.`,
          totalRestante: summary.totalItems,
          totalPagar: `$${summary.grandTotal.toLocaleString('es-CO')} pesos`
        };
      }

      if (name === 'obtenerCarrito') {
        const cart = getStoredCart();
        if (cart.length === 0) {
          return {
            vacio: true,
            mensaje: "Tu carrito está actualmente vacío. ¿Qué se te antoja pedir hoy?"
          };
        }

        const summary = calculateCartSummary(cart);
        return {
          vacio: false,
          items: cart.map(i => ({
            nombre: i.product.name,
            cantidad: i.quantity,
            precioUnitario: `$${i.product.price.toLocaleString('es-CO')} pesos`,
            totalItem: `$${(i.product.price * i.quantity).toLocaleString('es-CO')} pesos`
          })),
          totalArticulos: summary.totalItems,
          subtotal: `$${summary.subtotal.toLocaleString('es-CO')} pesos`,
          domicilio: `$${summary.deliveryFee.toLocaleString('es-CO')} pesos`,
          totalPagar: `$${summary.grandTotal.toLocaleString('es-CO')} pesos`
        };
      }

      if (name === 'vaciarCarrito') {
        const updatedCart = clearAllCart();
        if (this.callbacks.onCartUpdated) {
          this.callbacks.onCartUpdated(updatedCart);
        }
        return {
          exito: true,
          mensaje: "He vaciado completamente tu carrito de compras."
        };
      }

      if (name === 'crearPedido') {
        const cart = getStoredCart();
        if (cart.length === 0) {
          return {
            exito: false,
            mensaje: "No se puede crear el pedido porque tu carrito está vacío. Agrega platos primero."
          };
        }

        const validation = await validateCartBeforeOrder(cart);
        if (!validation.valid) {
          return {
            exito: false,
            mensaje: validation.reason || "No se pudo completar el pedido debido a que una de las tiendas está cerrada."
          };
        }

        const summary = calculateCartSummary(cart);
        const firstItem = cart[0];
        const storeOwnerId = firstItem.product.userId || 'store_general';

        const newOrder: OrderItem = {
          id: 'ord_' + Date.now(),
          orderNumber: Math.floor(1000 + Math.random() * 9000),
          storeOwnerId,
          customerName: args?.nombreCliente || 'Cliente',
          customerPhone: args?.telefono || '',
          customerAddress: args?.direccion || '',
          notes: args?.notas || '',
          items: cart.map(i => ({
            productId: i.product.id,
            name: i.product.name,
            price: i.product.price,
            quantity: i.quantity,
            selectedVariant: i.selectedVariant,
            imageURL: i.product.imageURL
          })),
          deliveryFee: summary.deliveryFee,
          totalAmount: summary.grandTotal,
          paymentMethod: (args?.metodoPago || 'delivery_cash') as any,
          status: 'pending',
          deliveryStep: 'accepted',
          createdAt: new Date().toISOString()
        };

        const saved = await saveOrder(newOrder);
        clearAllCart();
        if (this.callbacks.onCartUpdated) {
          this.callbacks.onCartUpdated([]);
        }
        if (this.callbacks.onOrderCreated) {
          this.callbacks.onOrderCreated(saved);
        }

        return {
          exito: true,
          numeroPedido: saved.orderNumber,
          id: saved.id,
          totalPagar: `$${saved.totalAmount.toLocaleString('es-CO')} pesos`,
          mensaje: `¡Excelente, ${args?.nombreCliente}! Tu pedido #${saved.orderNumber} ha sido creado y confirmado con éxito por un total de $${saved.totalAmount.toLocaleString('es-CO')} pesos.`
        };
      }

      if (name === 'consultarPedido') {
        const storedOrders = JSON.parse(localStorage.getItem('linnk_orders_all') || '[]');
        if (storedOrders.length === 0) {
          return { mensaje: "No encontré pedidos recientes registrados en tu sesión." };
        }

        let matched = storedOrders[storedOrders.length - 1];
        if (args?.pedidoId && args.pedidoId.trim()) {
          const p = args.pedidoId.trim().toLowerCase();
          const found = storedOrders.find((o: any) => 
            (o.id && o.id.toLowerCase().includes(p)) || 
            (o.orderNumber && o.orderNumber.toString().includes(p))
          );
          if (found) matched = found;
        }

        const statusMap: Record<string, string> = {
          'pending': 'Pendiente de confirmación',
          'processing': 'En preparación',
          'shipped': 'En camino con el domiciliario',
          'delivered': 'Entregado',
          'cancelled': 'Cancelado'
        };

        return {
          numeroPedido: matched.orderNumber,
          restaurante: matched.storeName,
          estado: statusMap[matched.status] || matched.status,
          total: `$${matched.totalAmount.toLocaleString('es-CO')} pesos`,
          direccion: matched.customerAddress
        };
      }

      return { error: `Herramienta "${name}" no reconocida.` };
    } catch (err: any) {
      console.warn(`Error executing realtime tool ${name}:`, err);
      return { error: err?.message || "Error al ejecutar la acción solicitada." };
    }
  }

  // Start continuous hands-free WebRTC session
  public async start(): Promise<void> {
    if (this.isConnected) return;

    this.callbacks.onStateChange('processing');

    try {
      // 1. Request microphone permission once and keep track continuously open
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      this.localStream = mediaStream;

      // 2. Fetch ephemeral OpenAI Realtime Session token from our backend
      const sessionResponse = await fetch('/api/realtime/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!sessionResponse.ok) {
        const errData = await sessionResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${sessionResponse.status} al crear sesión Realtime.`);
      }

      const sessionData = await sessionResponse.json();
      const ephemeralKey = sessionData.client_secret?.value;
      const modelName = sessionData.model || 'gpt-realtime-2.1';

      if (!ephemeralKey) {
        throw new Error("No se recibió token efímero de OpenAI Realtime.");
      }

      // 3. Set up Audio element for OpenAI Realtime audio output
      if (!this.remoteAudioElement) {
        this.remoteAudioElement = new Audio();
        this.remoteAudioElement.autoplay = true;
      }

      // 4. Initialize WebRTC PeerConnection
      const pc = new RTCPeerConnection();
      this.peerConnection = pc;

      // Attach incoming remote audio track
      pc.ontrack = (event) => {
        if (this.remoteAudioElement && event.streams[0]) {
          this.remoteAudioElement.srcObject = event.streams[0];
          this.remoteAudioElement.play().catch(() => {});
        }
      };

      // Add continuous local microphone track
      mediaStream.getTracks().forEach((track) => {
        pc.addTrack(track, mediaStream);
      });

      // 5. Create Data Channel for Realtime events & tool calling
      const dc = pc.createDataChannel('oai-events');
      this.dataChannel = dc;

      // 6. Handle Realtime DataChannel Events
      dc.onopen = () => {
        this.isConnected = true;
        this.callbacks.onStateChange('listening');
        this.startAudioAnalyser(mediaStream);

        // Send initial gentle prompt to greet the customer in Spanish
        try {
          dc.send(JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["audio", "text"],
              instructions: "Saluda cálidamente al usuario con tu voz marin en español colombiano natural, breve y amigable: preséntate como iAmesero y pregúntale qué se le antoja pedir hoy."
            }
          }));
        } catch (e) {}
      };

      dc.onmessage = async (e) => {
        try {
          const event = JSON.parse(e.data);
          await this.handleRealtimeServerEvent(event);
        } catch (parseErr) {
          console.warn("Error parsing Realtime event:", parseErr);
        }
      };

      dc.onerror = (err) => {
        console.warn("Realtime DataChannel error:", err);
      };

      dc.onclose = () => {
        if (this.isConnected) {
          this.stop();
        }
      };

      // 7. WebRTC Offer & Answer exchange with OpenAI Realtime
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const baseUrl = 'https://api.openai.com/v1/realtime';
      const sdpResponse = await fetch(`${baseUrl}?model=${encodeURIComponent(modelName)}`, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          'Authorization': `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp'
        }
      });

      if (!sdpResponse.ok) {
        const sdpErrText = await sdpResponse.text();
        throw new Error(`Error en negociación SDP con OpenAI: ${sdpResponse.status} ${sdpErrText}`);
      }

      const answerSdp = await sdpResponse.text();
      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: answerSdp
      };

      await pc.setRemoteDescription(answer);
    } catch (error: any) {
      this.stop();
      if (this.callbacks.onError) {
        this.callbacks.onError(error?.message || "No fue posible iniciar la sesión de voz WebRTC.");
      }
      this.callbacks.onStateChange('error');
      throw error;
    }
  }

  // Handle all incoming events from OpenAI Realtime
  private async handleRealtimeServerEvent(event: any) {
    const type = event?.type;

    switch (type) {
      // 1. BARGE-IN & SPEECH DETECTION (User began speaking)
      case 'input_audio_buffer.speech_started': {
        this.callbacks.onStateChange('user_speaking');
        // BARGE-IN: If OpenAI was currently speaking or generating a response, cancel it immediately!
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
          try {
            this.dataChannel.send(JSON.stringify({ type: "response.cancel" }));
          } catch (e) {}
        }
        break;
      }

      // 2. User stopped speaking (VAD silence threshold reached)
      case 'input_audio_buffer.speech_stopped': {
        this.callbacks.onStateChange('processing');
        break;
      }

      // 3. User Audio Transcription completed (Whisper-1)
      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = (event?.transcript || '').trim();
        if (transcript) {
          this.callbacks.onTranscriptDelta(transcript, true, 'user');
        }
        break;
      }

      // 4. Assistant Audio streaming chunk
      case 'response.audio_transcript.delta': {
        const delta = event?.delta || '';
        this.currentAssistantTranscript += delta;
        this.callbacks.onTranscriptDelta(this.currentAssistantTranscript, false, 'assistant');
        this.callbacks.onStateChange('speaking');
        break;
      }

      // 5. Assistant Audio streaming done
      case 'response.audio_transcript.done': {
        this.callbacks.onTranscriptDelta(this.currentAssistantTranscript, true, 'assistant');
        this.currentAssistantTranscript = '';
        break;
      }

      // 6. Response generation finished
      case 'response.done': {
        this.callbacks.onStateChange('listening');
        break;
      }

      // 7. Realtime Tool Calls / Function Calls
      case 'response.function_call_arguments.done': {
        this.callbacks.onStateChange('processing');
        const callId = event.call_id;
        const name = event.name;
        let args = {};
        try {
          args = JSON.parse(event.arguments || '{}');
        } catch {
          args = {};
        }

        const toolResult = await this.executeToolCall(name, args);

        // Send function call output back to OpenAI Realtime
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
          this.dataChannel.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: callId,
              output: JSON.stringify(toolResult)
            }
          }));

          // Instruct OpenAI to speak the result
          this.dataChannel.send(JSON.stringify({
            type: "response.create"
          }));
        }
        break;
      }

      case 'error': {
        console.warn("Realtime OpenAI Error Event:", event?.error);
        if (event?.error?.code !== 'response_cancel_failed') {
          if (this.callbacks.onError) {
            this.callbacks.onError(event?.error?.message || "Error en la conexión con OpenAI Realtime");
          }
        }
        break;
      }

      default:
        break;
    }
  }

  // Continuous Audio Analyser for reactive organic UI pulsing
  private startAudioAnalyser(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkAudio = () => {
        if (!this.isConnected || !this.analyser) return;

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(1, avg / 60);

        if (this.callbacks.onAudioLevel) {
          this.callbacks.onAudioLevel(normalized);
        }

        this.animFrameId = requestAnimationFrame(checkAudio);
      };

      this.animFrameId = requestAnimationFrame(checkAudio);
    } catch (e) {
      console.warn("Could not initialize local audio analyser:", e);
    }
  }

  // Stop analyser
  private stopAudioAnalyser() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }
    this.analyser = null;
    if (this.callbacks.onAudioLevel) {
      this.callbacks.onAudioLevel(0);
    }
  }

  // Mute / Unmute local microphone
  public setMicMuted(muted: boolean): boolean {
    this.isMicMuted = muted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });
    }
    return this.isMicMuted;
  }

  // Mute / Unmute assistant speaker
  public setSpeakerMuted(muted: boolean): boolean {
    this.isSpeakerMuted = muted;
    if (this.remoteAudioElement) {
      this.remoteAudioElement.muted = muted;
    }
    return this.isSpeakerMuted;
  }

  // Interupt assistant manually if tapped
  public interruptAssistant() {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(JSON.stringify({ type: "response.cancel" }));
      } catch (e) {}
    }
    this.callbacks.onStateChange('listening');
  }

  // Send a direct text message into the Realtime session
  public sendTextMessage(text: string) {
    if (!text || !text.trim()) return;
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: text.trim()
            }
          ]
        }
      }));

      this.dataChannel.send(JSON.stringify({
        type: "response.create"
      }));

      this.callbacks.onTranscriptDelta(text.trim(), true, 'user');
      this.callbacks.onStateChange('processing');
    }
  }

  // Cleanly teardown session
  public stop(): void {
    try {
      this.stopAudioAnalyser();

      if (this.dataChannel) {
        try {
          this.dataChannel.close();
        } catch (e) {}
        this.dataChannel = null;
      }

      if (this.peerConnection) {
        try {
          this.peerConnection.close();
        } catch (e) {}
        this.peerConnection = null;
      }

      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null;
      }

      if (this.remoteAudioElement) {
        this.remoteAudioElement.pause();
        this.remoteAudioElement.srcObject = null;
      }
    } catch (e) {}

    this.isConnected = false;
    this.callbacks.onStateChange('idle');
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }
}
