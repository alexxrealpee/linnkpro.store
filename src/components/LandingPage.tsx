/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Store, 
  ShoppingBag, 
  Sparkles, 
  ArrowRight, 
  Check, 
  Smartphone, 
  ChevronRight, 
  Package, 
  CreditCard, 
  TrendingUp, 
  Users, 
  MessageCircle, 
  Coins 
} from 'lucide-react';

interface LandingPageProps {
  onNavigate: (view: 'landing' | 'login' | 'signup' | 'dashboard' | 'admin' | 'tienda', usernameToClaim?: string) => void;
}

export default function LandingPage({ onNavigate }: LandingPageProps) {
  const [storeSlug, setStoreSlug] = useState('');
  const [checking, setChecking] = useState(false);

  const handleClaim = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeSlug.trim()) return;
    
    setChecking(true);
    setTimeout(() => {
      setChecking(false);
      const cleanName = storeSlug.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      onNavigate('signup', cleanName);
    }, 600);
  };

  const features = [
    {
      icon: <Package className="w-6 h-6 text-emerald-400" />,
      title: "Gestión de Productos Completa",
      desc: "Sube imágenes, establece descripciones, precios con descuento, variantes de tamaño/color y controla tu inventario de forma simplificada."
    },
    {
      icon: <MessageCircle className="w-6 h-6 text-indigo-400" />,
      title: "Pedidos directos a WhatsApp",
      desc: "Tus clientes agregan productos a un carrito interactivo y completan su compra enviándote un pedido detallado directamente a tu WhatsApp."
    },
    {
      icon: <Smartphone className="w-6 h-6 text-pink-400" />,
      title: "Diseño 100% Personalizable",
      desc: "Adapta la tipografía, los colores, el estilo de botones y de las tarjetas de los productos sin escribir una sola línea de código."
    }
  ];

  return (
    <div className="bg-[#070b14] text-gray-100 min-h-screen selection:bg-emerald-400 selection:text-black font-sans">
      
      {/* Navigation Header */}
      <header className="border-b border-gray-900/60 backdrop-blur-md sticky top-0 z-50 bg-[#070b14]/90">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-3.5 md:py-4 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
          <div className="flex items-center gap-1.5 md:gap-2.5">
            <div className="bg-gradient-to-tr from-emerald-500 to-indigo-500 p-1 md:p-2 rounded-xl">
              <Store className="w-4.5 h-4.5 md:w-6 h-6 text-black stroke-[2.5]" />
            </div>
            <span className="font-extrabold text-sm sm:text-lg md:text-xl tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              LinnkPro<span className="text-emerald-400">.shop</span>
            </span>
          </div>
          
          <div className="flex items-center justify-center sm:justify-end gap-2.5 sm:gap-4 w-full sm:w-auto">
            <button 
              onClick={() => onNavigate('tienda')}
              className="px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Ver Vitrina</span>
            </button>
            <button 
              onClick={() => onNavigate('login')}
              className="px-2 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-medium hover:text-white transition-colors text-gray-400 whitespace-nowrap"
            >
              <span className="hidden sm:inline">Acceso Vendedor</span>
              <span className="sm:hidden">Ingresar</span>
            </button>
            <button 
              onClick={() => onNavigate('signup')}
              className="bg-emerald-400 text-black hover:bg-emerald-300 transition-all font-bold rounded-xl text-xs md:text-sm px-3 py-1.5 md:px-4.5 md:py-2 hover:shadow-lg hover:shadow-emerald-500/10 active:scale-[0.98] whitespace-nowrap"
            >
              <span>Crear Tienda</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-20 px-6">
        {/* Glow Spheres */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] items-center h-[550px] bg-emerald-500/5 blur-[140px] rounded-full -z-10" />
        <div className="absolute top-1/4 left-1/3 w-[350px] h-[350px] bg-indigo-500/5 blur-[110px] rounded-full -z-10" />

        <div className="max-w-5xl mx-auto text-center">
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 text-xs font-semibold mb-6 uppercase tracking-wider"
          >
            <Sparkles className="w-3.5 h-3.5" /> Tu Tienda Virtual en 60 Segundos
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-white mb-6 leading-[1.1]"
          >
            La forma más rápida de <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-indigo-400">vender tus productos</span> online
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="text-base md:text-lg text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed"
          >
            Crea una tienda virtual moderna con LinnkPro.shop. Sube tus productos, gestiona tus pedidos en tiempo real, personaliza el aspecto de tu negocio y recibe las compras listas en tu WhatsApp o en tu panel.
          </motion.p>

          {/* Subdomain Input claim bar */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="max-w-xl mx-auto mb-16"
          >
            <form onSubmit={handleClaim} className="flex flex-col sm:flex-row gap-2.5 bg-gray-900/80 border border-gray-800 p-2 rounded-2xl shadow-xl backdrop-blur-sm">
              <div className="flex items-center flex-grow px-4 py-2 bg-transparent text-gray-400">
                <span className="text-gray-500 mr-0.5 select-none font-semibold">linnkpro.shop/</span>
                <input 
                  type="text" 
                  value={storeSlug}
                  onChange={(e) => setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                  placeholder="nombre-de-tu-tienda" 
                  className="bg-transparent focus:outline-none text-white text-base w-full font-semibold placeholder:text-gray-600 focus:ring-0"
                  required
                />
              </div>
              <button 
                type="submit"
                disabled={checking}
                className="bg-emerald-400 hover:bg-emerald-300 text-black font-bold px-6 py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10 active:scale-[0.98] transition-all shrink-0"
              >
                {checking ? 'Creando...' : 'Crear Tienda'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
            <p className="text-xs text-start text-gray-500 mt-3 px-4 flex flex-wrap items-center gap-1.5 justify-center sm:justify-start">
              <span>🚀 Lanzamiento Instantáneo</span>
              <span className="text-gray-700">•</span>
              <button 
                type="button" 
                onClick={() => onNavigate('tienda')}
                className="text-indigo-400 hover:text-indigo-300 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <span>Explorar vitrina de todas las tiendas</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </p>
          </motion.div>
        </div>
      </section>

      {/* Simulated Store Interactive mockup */}
      <section className="pb-24 px-6 flex justify-center">
        <div className="relative max-w-5xl w-full bg-gradient-to-b from-gray-900/90 to-gray-950/40 border border-gray-850 rounded-[32px] p-6 shadow-2xl overflow-hidden">
          
          {/* Header element of mockup */}
          <div className="flex items-center justify-between border-b border-gray-850 pb-4 mb-6">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-full bg-red-500/20 block" />
              <span className="w-3.5 h-3.5 rounded-full bg-yellow-500/20 block" />
              <span className="w-3.5 h-3.5 rounded-full bg-emerald-500/20 block" />
              <span className="text-xs text-gray-600 font-mono ml-3">linnkpro.shop/panel-vendedor</span>
            </div>
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-3 py-1 text-[10px] font-black tracking-wider uppercase">
              CONSTRUCTOR LIVE
            </span>
          </div>

          <div className="grid lg:grid-cols-12 gap-8">
            
            {/* Admin Controls Panel */}
            <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
              <div>
                <h3 className="text-2xl md:text-3xl font-extrabold text-white mb-2 leading-tight">
                  Diseñado para emprendedores y marcas
                </h3>
                <p className="text-gray-400 text-sm md:text-base leading-relaxed">
                  Con el creador de LinnkPro.shop, tienes el control absoluto de tu negocio digital. Olvídate de configuraciones confusas o integraciones complejas. Crea tu catálogo, súbelo a la nube, controla tus pedidos en un panel inteligente y comunícate fluidamente con tus clientes.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="flex gap-3 items-start p-3 bg-gray-900/40 rounded-xl border border-gray-850">
                  <div className="bg-emerald-400/10 p-2 rounded-lg text-emerald-400 shrink-0">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">Analíticas de Venta</h4>
                    <p className="text-xs text-gray-500 font-medium">Visualiza ingresos, visitas y conversión de carrito de compras.</p>
                  </div>
                </div>

                <div className="flex gap-3 items-start p-3 bg-gray-900/40 rounded-xl border border-gray-850">
                  <div className="bg-indigo-400/10 p-2 rounded-lg text-indigo-400 shrink-0">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">Múltiples Pagos</h4>
                    <p className="text-xs text-gray-500 font-medium">Soporta pedidos directos, transferencias y pagos contra entrega.</p>
                  </div>
                </div>

                <div className="flex gap-3 items-start p-3 bg-gray-900/40 rounded-xl border border-gray-850">
                  <div className="bg-pink-400/10 p-2 rounded-lg text-pink-400 shrink-0">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">Variantes Dinámicas</h4>
                    <p className="text-xs text-gray-500 font-medium">Asigna tallas, colores o configuraciones específicas a tus productos.</p>
                  </div>
                </div>

                <div className="flex gap-3 items-start p-3 bg-gray-900/40 rounded-xl border border-gray-850">
                  <div className="bg-emerald-400/10 p-2 rounded-lg text-emerald-400 shrink-0">
                    <Coins className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">100% de Comisión Cero</h4>
                    <p className="text-xs text-gray-500 font-medium">Tus ganancias van directamente a tu cuenta. Sin tarifas ocultas.</p>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  onClick={() => onNavigate('signup')}
                  className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-2xl px-6 py-4 flex items-center justify-center gap-2 text-sm transition-all"
                >
                  Regístrate Ahora
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Public Storefront Preview Simulator */}
            <div className="lg:col-span-5 flex justify-center bg-gray-950/50 rounded-2xl p-6 border border-gray-850">
              <div className="w-full max-w-[280px] border-[8px] border-gray-850 rounded-[38px] bg-[#0c101d] overflow-hidden aspect-[9/18] shadow-2xl flex flex-col py-5 px-3.5 relative">
                {/* Simulated Speaker notch */}
                <div className="w-16 h-3.5 bg-gray-850 rounded-full mb-3 shrink-0 mx-auto" />
                
                {/* Simulated Merchant Header */}
                <div className="text-center mb-4">
                  <div className="w-12 h-12 bg-gradient-to-tr from-emerald-400 to-indigo-500 rounded-full flex items-center justify-center font-black text-black text-xs mx-auto mb-1.5 shadow-md">
                    BO
                  </div>
                  <h4 className="text-xs font-extrabold text-white">Boutique Glamour</h4>
                  <span className="text-[10px] text-gray-500 font-medium">linnkpro.shop/glamour</span>
                </div>

                {/* Simulated product list in iframe / mobile */}
                <div className="flex-grow space-y-3 overflow-y-auto pr-0.5 scrollbar-none flex flex-col justify-start">
                  
                  {/* Category Selection pills */}
                  <div className="flex gap-1.5 overflow-x-auto shrink-0 scrollbar-none pb-1">
                    <span className="px-2 py-0.5 bg-emerald-400 text-black text-[9px] font-black rounded-full uppercase shrink-0">Todos</span>
                    <span className="px-2 py-0.5 bg-gray-900 text-gray-400 text-[9px] font-black rounded-full uppercase shrink-0">Moda</span>
                    <span className="px-2 py-0.5 bg-gray-900 text-gray-400 text-[9px] font-black rounded-full uppercase shrink-0">Accesorios</span>
                  </div>

                  {/* Single Premium Simulated Product Card */}
                  <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-2.5 flex flex-col items-stretch relative shrink-0">
                    <div className="absolute top-2 right-2 bg-pink-500 text-white font-bold text-[8px] px-1.5 py-0.5 rounded-md uppercase">
                      Oferta
                    </div>
                    {/* Fake product placeholder */}
                    <div className="w-full aspect-[4/3] bg-gray-850 rounded-lg flex items-center justify-center text-gray-700 font-bold mb-2 pr-0">
                      👗 Vestido Elegante
                    </div>
                    <h5 className="text-[10px] font-bold text-white truncate">Vestido Premium Coctel</h5>
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-extrabold text-emerald-400">$45.000</span>
                        <span className="text-[9px] text-gray-500 line-through">$60.000</span>
                      </div>
                      <span className="text-[8px] border border-gray-800 bg-gray-950 px-1 py-0.5 rounded text-gray-400">Stock: 12</span>
                    </div>

                    <button 
                      type="button"
                      className="mt-2.5 w-full py-2 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold rounded-lg text-[9px] flex items-center justify-center gap-1 cursor-default pointer-events-none"
                    >
                      Añadir al carrito
                    </button>
                  </div>

                  {/* Product #2 static placeholder */}
                  <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-2.5 flex flex-col shrink-0">
                    <div className="w-full aspect-[4/3] bg-gray-850 rounded-lg flex items-center justify-center text-gray-700 font-bold mb-2">
                      👜 Cartera Cuero
                    </div>
                    <h5 className="text-[10px] font-bold text-white truncate">Bolso Escarlata Clásico</h5>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] font-extrabold text-emerald-400">$69.000</span>
                    </div>
                  </div>
                </div>

                <div className="text-[8px] text-gray-600 text-center font-mono mt-3 shrink-0">
                  SaaS de Tienda en LinnkPro.shop
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* Features Detail Grid */}
      <section className="py-20 bg-gray-950/40 border-y border-gray-900/60 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">Todo lo necesario para comercializar de inmediato</h2>
            <p className="text-gray-400 mb-2 text-sm md:text-base">Hemos automatizado las tareas complejas de comercio electrónico para que te enfoques en tus ventas.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <div key={idx} className="bg-gray-900/40 border border-gray-850 p-6 md:p-8 rounded-2xl hover:border-gray-800 transition">
                <div className="bg-gray-950 p-3 rounded-xl w-fit mb-5 border border-gray-850">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Steps Row */}
      <section className="py-20 px-6 max-w-7xl mx-auto text-center">
        <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-3">¿Cómo crear tu tienda?</h2>
        <p className="text-gray-400 mb-12 text-sm">Empieza hoy mismo tu emprendimiento digital en tres sencillos pasos.</p>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="p-6 bg-gray-900/20 rounded-2xl border border-gray-900 flex flex-col items-center">
            <span className="w-10 h-10 rounded-full bg-emerald-400/10 text-emerald-400 font-black text-sm flex items-center justify-center mb-4">1</span>
            <h4 className="font-bold text-white text-base mb-1.5">Regístrate en Segundos</h4>
            <p className="text-gray-500 text-xs leading-relaxed max-w-xs">Elige tu nombre de usuario que será tu subdominio de tienda pública sin costo.</p>
          </div>

          <div className="p-6 bg-gray-900/20 rounded-2xl border border-gray-900 flex flex-col items-center">
            <span className="w-10 h-10 rounded-full bg-indigo-400/10 text-indigo-400 font-black text-sm flex items-center justify-center mb-4">2</span>
            <h4 className="font-bold text-white text-base mb-1.5">Completa tu Catálogo</h4>
            <p className="text-gray-500 text-xs leading-relaxed max-w-xs">Añade imágenes de tus productos, precios con descuento, stock y variantes disponibles.</p>
          </div>

          <div className="p-6 bg-gray-900/20 rounded-2xl border border-gray-900 flex flex-col items-center">
            <span className="w-10 h-10 rounded-full bg-pink-400/10 text-pink-400 font-black text-sm flex items-center justify-center mb-4">3</span>
            <h4 className="font-bold text-white text-base mb-1.5">Recibe Pedidos Directos</h4>
            <p className="text-gray-500 text-xs leading-relaxed max-w-xs">Comparte tu enlace, tus clientes ingresarán al carrito y coordinarás ventas por WhatsApp o directo.</p>
          </div>
        </div>
      </section>

      {/* Interactive FAQ / Call to Action */}
      <section className="bg-gradient-to-t from-gray-950 to-gray-900/60 pb-20 pt-16 border-t border-gray-900 px-6 text-center">
        <div className="max-w-4xl mx-auto bg-gradient-to-tr from-[#1k253b]/20 to-transparent border border-gray-850 rounded-3xl p-8 md:p-12">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4 leading-tight">
            ¿Listo para digitalizar tu negocio hoy?
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto mb-8 text-sm md:text-base leading-relaxed">
            Únete a cientos de marcas, tiendas boutique y emprendedores que ya incrementan sus ingresos administrando inteligentemente sus productos y pedidos.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <button 
              onClick={() => onNavigate('signup')}
              className="w-full sm:w-auto px-6 py-4 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold text-sm rounded-xl transition shadow-lg shadow-emerald-500/10 active:scale-[0.98]"
            >
              Comenzar Mi Tienda
            </button>
            <button 
              onClick={() => onNavigate('login')}
              className="w-full sm:w-auto px-6 py-4 bg-gray-950 hover:bg-gray-900 border border-gray-850 text-gray-400 hover:text-white font-bold text-sm rounded-xl transition"
            >
              Acceder a mi panel
            </button>
          </div>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="border-t border-gray-950 py-10 px-6 bg-black/60 text-gray-600 text-center text-xs">
        <p className="font-semibold text-gray-500 mb-1">© 2026 LinnkPro.shop. Todos los derechos reservados.</p>
        <p className="text-gray-700 max-w-sm mx-auto mb-4">Plataforma SaaS para creadores de comercio electrónico rápido.</p>
        <a 
          href="https://wa.me/573219730865?text=Hola!%20Necesito%20ayuda%20o%20soporte%20con%20LinnkPro.shop"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-extrabold text-xs transition bg-emerald-500/5 hover:bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20 active:scale-[0.98]"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          Atención al Cliente: 3219730865
        </a>
      </footer>

      {/* Floating WhatsApp Customer Support Button */}
      <motion.a
        href="https://wa.me/573219730865?text=Hola!%20Necesito%20ayuda%20o%20soporte%20con%20LinnkPro.shop"
        target="_blank"
        rel="noopener noreferrer"
        initial={{ opacity: 0, scale: 0.8, y: 50 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.5 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4.5 py-3.5 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold text-xs sm:text-sm rounded-full shadow-2xl shadow-emerald-500/20 transition-all border border-emerald-300/20 active:scale-[0.98] cursor-pointer"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-black"></span>
        </span>
        <MessageCircle className="w-4 h-4 text-black stroke-[2.5]" />
        <span>Atención al Cliente</span>
      </motion.a>

    </div>
  );
}
