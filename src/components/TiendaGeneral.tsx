/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Store, 
  ShoppingBag, 
  Search, 
  Sparkles, 
  ArrowLeft, 
  ExternalLink, 
  MessageCircle, 
  Filter, 
  Tag, 
  ArrowUpDown, 
  SlidersHorizontal,
  X,
  MapPin,
  HelpCircle,
  Clock
} from 'lucide-react';
import { ProductItem, UserProfile } from '../types';
import { fetchAllActiveProductsAndStores } from '../lib/firebase';

interface TiendaGeneralProps {
  onNavigateHome: () => void;
  onNavigateToStore: (username: string) => void;
}

export default function TiendaGeneral({ onNavigateHome, onNavigateToStore }: TiendaGeneralProps) {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  
  // Filtering & search states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStore, setSelectedStore] = useState('all');
  const [sortBy, setSortBy] = useState<'latest' | 'price_asc' | 'price_desc'>('latest');
  
  // Quick View Modal state
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const res = await fetchAllActiveProductsAndStores();
      setProducts(res.products);
      setProfiles(res.profiles);
      setLoading(false);
    }
    loadData();
  }, []);

  // Get list of unique categories from all loaded products (memoized)
  const categories = useMemo(() => {
    return ['all', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))];
  }, [products]);

  // Get list of unique store profiles with active products (memoized)
  const uniqueStores = useMemo(() => {
    return (Object.values(profiles) as UserProfile[]).filter(profile => 
      products.some(p => p.userId === profile.uid)
    );
  }, [profiles, products]);

  // Filter & sort logic (memoized to maximize rendering speed and responsiveness)
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const profile = profiles[product.userId];
      if (!profile) return false;

      const matchesSearch = 
        (product.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (profile.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (profile.username || '').toLowerCase().includes(searchTerm.toLowerCase());
        
      const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
      
      const matchesStore = selectedStore === 'all' || product.userId === selectedStore;

      return matchesSearch && matchesCategory && matchesStore;
    }).sort((a, b) => {
      if (sortBy === 'price_asc') {
        return a.price - b.price;
      } else if (sortBy === 'price_desc') {
        return b.price - a.price;
      } else {
        // Latest (default)
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      }
    });
  }, [products, profiles, searchTerm, selectedCategory, selectedStore, sortBy]);

  // Handle WhatsApp Order Generation
  const handleWhatsAppOrder = (product: ProductItem) => {
    const profile = profiles[product.userId];
    if (!profile) return;

    const targetPhone = profile.whatsapp || profile.phone || '';
    let cleanPhone = targetPhone.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      alert("Este vendedor no tiene registrado un número de WhatsApp de contacto.");
      return;
    }

    // Auto-fix: if it's a 10 digit Colombian celular (starts with 3), automatically prepend country code '57'
    if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) {
      cleanPhone = '57' + cleanPhone;
    }

    const priceFormatted = `${profile.currency || '$'}${product.price.toLocaleString()}`;
    const text = `¡Hola! Vengo de la Vitrina de LinnkPro.shop (${window.location.origin}/tienda).\n\nMe interesa el producto:\n🛍️ *${product.name}*\n💰 Precio: *${priceFormatted}*\n\n¿Tienes disponibilidad de este artículo? ¡Gracias!`;
    const encodedText = encodeURIComponent(text);
    
    window.open(`https://wa.me/${cleanPhone}?text=${encodedText}`, '_blank');
  };

  return (
    <div className="bg-[#070b14] min-h-screen font-sans text-gray-100 flex flex-col selection:bg-emerald-400 selection:text-black">
      
      {/* 1. Navbar */}
      <header className="border-b border-gray-900/60 backdrop-blur-md sticky top-0 z-40 bg-[#070b14]/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-4 flex items-center justify-between">
          <button 
            onClick={onNavigateHome}
            className="flex items-center gap-2 px-3 py-2 bg-gray-900/40 hover:bg-gray-900/80 border border-gray-800 rounded-xl transition text-xs font-bold text-gray-400 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Volver al Inicio</span>
            <span className="sm:hidden">Inicio</span>
          </button>

          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-tr from-emerald-500 to-indigo-500 p-1.5 rounded-lg shadow-inner">
              <Store className="w-5 h-5 text-black stroke-[2.5]" />
            </div>
            <span className="font-black text-sm sm:text-lg tracking-tight bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              Vitrina<span className="text-emerald-400">.LinnkPro</span>
            </span>
          </div>

          <button 
            onClick={onNavigateHome}
            className="bg-emerald-400/10 hover:bg-emerald-400 hover:text-black text-emerald-400 font-extrabold text-[10px] sm:text-xs px-3 py-2 rounded-xl border border-emerald-400/20 transition duration-150 uppercase tracking-wider"
          >
            Crear Mi Tienda
          </button>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="relative overflow-hidden py-14 px-4 sm:px-6 md:px-8 border-b border-gray-950 bg-gradient-to-b from-gray-950/20 to-transparent">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-emerald-500/5 blur-[120px] rounded-full -z-10" />
        <div className="absolute top-1/3 left-1/4 w-[250px] h-[250px] bg-indigo-500/5 blur-[90px] rounded-full -z-10" />

        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-300 text-[10px] font-extrabold uppercase tracking-widest">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" /> Catálogo Colectivo
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-none">
            Explora la vitrina de <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-indigo-400 to-pink-400">nuestra comunidad</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 max-w-xl mx-auto leading-relaxed">
            Compra de forma directa a emprendedores locales. Elige el artículo, visualiza detalles de la tienda oficial, y contacta al comerciante por WhatsApp al instante para acordar el pago y envío.
          </p>
        </div>
      </section>

      {/* 3. Filtering & Dashboard Container */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 md:px-8 py-10 space-y-8">
        
        {/* Filter bar card */}
        <div className="bg-gray-900/30 border border-gray-850 p-5 rounded-3xl backdrop-blur-sm space-y-5">
          <div className="flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center">
            
            {/* Search Input */}
            <div className="relative flex-grow max-w-xl">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar productos, tiendas o categorías..."
                className="w-full bg-gray-950/80 border border-gray-800 rounded-2xl py-3 pl-11 pr-4 text-xs font-semibold text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/25 transition"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')} 
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-800 rounded-lg text-gray-400 transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Selects Panel */}
            <div className="flex flex-wrap sm:flex-nowrap gap-3 items-center">
              
              {/* Store filter */}
              <div className="flex items-center gap-1.5 bg-gray-950 border border-gray-800 rounded-2xl py-1.5 px-3 w-full sm:w-auto">
                <Store className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                <select
                  value={selectedStore}
                  onChange={(e) => setSelectedStore(e.target.value)}
                  className="bg-transparent text-xs text-gray-300 font-bold outline-none cursor-pointer w-full"
                >
                  <option value="all" className="bg-gray-950 text-white">Todas las Tiendas</option>
                  {uniqueStores.map(store => (
                    <option key={store.uid} value={store.uid} className="bg-gray-950 text-white">
                      {store.displayName || `@${store.username}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sorting selector */}
              <div className="flex items-center gap-1.5 bg-gray-950 border border-gray-800 rounded-2xl py-1.5 px-3 w-full sm:w-auto">
                <ArrowUpDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-xs text-gray-300 font-bold outline-none cursor-pointer w-full"
                >
                  <option value="latest" className="bg-gray-950 text-white">Más Recientes</option>
                  <option value="price_asc" className="bg-gray-950 text-white">Precio: Menor a Mayor</option>
                  <option value="price_desc" className="bg-gray-950 text-white">Precio: Mayor a Menor</option>
                </select>
              </div>
            </div>

          </div>

          {/* Quick Categories pills */}
          <div className="border-t border-gray-850/50 pt-4 flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider flex items-center gap-1.5 mr-1.5">
              <Filter className="w-3.5 h-3.5 text-gray-500" /> Categorías:
            </span>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition duration-150 uppercase tracking-wide cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-emerald-400 text-black shadow-md shadow-emerald-400/10'
                    : 'bg-gray-950 border border-gray-850 hover:border-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                {cat === 'all' ? 'Ver Todo' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Products Display / Loading */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-10 h-10 border-4 border-emerald-400 border-t-transparent animate-spin rounded-full" />
            <p className="text-xs text-gray-400 font-bold tracking-wider animate-pulse uppercase">Cargando productos del mercado...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="bg-gray-900/15 border border-gray-900 rounded-3xl py-16 px-4 text-center max-w-md mx-auto space-y-4">
            <ShoppingBag className="w-12 h-12 text-gray-600 mx-auto" />
            <div className="space-y-1">
              <h3 className="font-extrabold text-white text-base">Sin resultados</h3>
              <p className="text-xs text-gray-400">No encontramos productos que coincidan con tus filtros. Intenta cambiando el término de búsqueda.</p>
            </div>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('all');
                setSelectedStore('all');
              }}
              className="px-4 py-2 bg-gray-950 hover:bg-gray-900 border border-gray-800 rounded-xl text-xs font-bold text-gray-300 hover:text-white transition cursor-pointer"
            >
              Restablecer Filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
            {filteredProducts.map((product) => {
              const profile = profiles[product.userId];
              const currency = profile?.currency || '$';
              const isOnSale = product.compareAtPrice && product.compareAtPrice > product.price;
              const discountPercentage = isOnSale 
                ? Math.round(((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100) 
                : 0;

              return (
                <motion.div
                  key={product.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.25 }}
                  className="bg-gray-950 border border-gray-900 hover:border-gray-800 rounded-2xl overflow-hidden flex flex-col group transition duration-300 relative"
                >
                  {/* Store source badge on top right */}
                  <div className="absolute top-3 left-3 z-10">
                    <button
                      onClick={() => onNavigateToStore(profile.username)}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-black/75 hover:bg-black border border-white/5 rounded-full transition text-[10px] font-black tracking-wide text-white cursor-pointer backdrop-blur-md"
                    >
                      <Store className="w-3 h-3 text-emerald-400" />
                      <span>{profile?.displayName || 'Tienda'}</span>
                    </button>
                  </div>

                  {/* Product photo image preview wrapper */}
                  <div className="relative aspect-square w-full bg-gray-900 overflow-hidden shrink-0">
                    {isOnSale && (
                      <span className="absolute top-3 right-3 z-10 bg-rose-500 text-white font-black text-[9px] uppercase px-2 py-0.5 rounded shadow tracking-wider">
                        -{discountPercentage}% OFF
                      </span>
                    )}

                    {product.imageURL ? (
                      <img 
                        src={product.imageURL} 
                        alt={product.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-700 gap-1.5">
                        <ShoppingBag className="w-8 h-8 opacity-45" />
                        <span className="text-[10px] font-mono opacity-40">Sin Imagen</span>
                      </div>
                    )}

                    {/* Quick overlay actions on hover */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
                      <button 
                        onClick={() => setSelectedProduct(product)}
                        className="p-2.5 bg-white hover:bg-emerald-450 text-black hover:text-black font-bold rounded-xl transition shadow hover:scale-110 active:scale-95 cursor-pointer text-xs uppercase tracking-wider flex items-center gap-1"
                      >
                        Ver Detalles
                      </button>
                    </div>
                  </div>

                  {/* Card Information */}
                  <div className="p-3 sm:p-4.5 flex flex-col flex-grow justify-between space-y-3 sm:space-y-4">
                    <div className="space-y-1.5">
                      {product.category && (
                        <span className="text-[9px] font-black uppercase text-indigo-400 tracking-widest block font-mono">
                          {product.category}
                        </span>
                      )}
                      <h3 className="font-extrabold text-sm text-white group-hover:text-emerald-400 transition truncate leading-snug">
                        {product.name}
                      </h3>
                      <p className="text-[11px] text-gray-500 font-medium line-clamp-2">
                        {product.description || 'Sin descripción disponible.'}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-gray-900 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-white font-mono">
                          {currency}{product.price.toLocaleString()}
                        </span>
                        {isOnSale && (
                          <span className="text-[9px] text-gray-600 line-through font-mono">
                            {currency}{product.compareAtPrice?.toLocaleString()}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => handleWhatsAppOrder(product)}
                        className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-black font-black text-[10px] uppercase tracking-wider rounded-lg border border-emerald-500/15 transition cursor-pointer flex items-center gap-1"
                        title="Pedir directamente al WhatsApp del vendedor"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> Pedir
                      </button>
                    </div>
                  </div>

                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      {/* 5. Quick View Product Modal popup */}
      <AnimatePresence>
        {selectedProduct && (() => {
          const profile = profiles[selectedProduct.userId];
          const currency = profile?.currency || '$';
          const isOnSale = selectedProduct.compareAtPrice && selectedProduct.compareAtPrice > selectedProduct.price;
          const discountPercentage = isOnSale 
            ? Math.round(((selectedProduct.compareAtPrice! - selectedProduct.price) / selectedProduct.compareAtPrice!) * 100) 
            : 0;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedProduct(null)}
                className="absolute inset-0 bg-black/85 backdrop-blur-sm"
              />

              {/* Modal Container */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="bg-[#0b0f19] border border-gray-850 rounded-3xl w-full max-w-3xl relative overflow-hidden shadow-2xl flex flex-col md:flex-row z-10 max-h-[90vh] md:max-h-none overflow-y-auto md:overflow-visible"
              >
                {/* Close Button */}
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="absolute top-4 right-4 z-20 p-2 bg-black/60 hover:bg-gray-900 border border-white/5 rounded-xl text-gray-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-4.5 h-4.5" />
                </button>

                {/* Left: Product Media */}
                <div className="w-full md:w-1/2 aspect-square bg-gray-950 flex items-center justify-center overflow-hidden border-b md:border-b-0 md:border-r border-gray-900 relative min-h-[250px]">
                  {isOnSale && (
                    <span className="absolute top-4 left-4 z-10 bg-rose-500 text-white font-black text-[10px] uppercase px-2.5 py-1 rounded shadow tracking-wider">
                      -{discountPercentage}% OFF
                    </span>
                  )}
                  {selectedProduct.imageURL ? (
                    <img 
                      src={selectedProduct.imageURL} 
                      alt={selectedProduct.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-gray-700 flex flex-col items-center gap-2">
                      <ShoppingBag className="w-12 h-12 opacity-45" />
                      <span className="text-xs font-mono opacity-40">Sin Imagen</span>
                    </div>
                  )}
                </div>

                {/* Right: Product details */}
                <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col justify-between space-y-6">
                  <div className="space-y-4">
                    
                    {/* Category */}
                    {selectedProduct.category && (
                      <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest font-mono bg-indigo-500/10 border border-indigo-500/15 py-1 px-2 rounded-lg inline-block">
                        {selectedProduct.category}
                      </span>
                    )}

                    {/* Title */}
                    <h2 className="text-xl md:text-2xl font-black text-white leading-tight">
                      {selectedProduct.name}
                    </h2>

                    {/* Prices */}
                    <div className="flex items-baseline gap-3">
                      <span className="text-xl font-black text-emerald-400 font-mono">
                        {currency}{selectedProduct.price.toLocaleString()}
                      </span>
                      {isOnSale && (
                        <span className="text-sm text-gray-600 line-through font-mono">
                          {currency}{selectedProduct.compareAtPrice?.toLocaleString()}
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase text-gray-500 block">Descripción</span>
                      <p className="text-xs text-gray-400 leading-relaxed max-h-[140px] overflow-y-auto pr-2 font-medium">
                        {selectedProduct.description || 'Este producto no cuenta con descripción detallada en este momento.'}
                      </p>
                    </div>

                    {/* Product Variant Tag Info */}
                    {selectedProduct.variantsText && (
                      <div className="space-y-1.5 pt-2 border-t border-gray-900">
                        <span className="text-[10px] font-black uppercase text-gray-500 block">Variantes / Opciones</span>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedProduct.variantsText.split(',').map((opt, i) => (
                            <span key={i} className="text-[10px] font-bold px-2 py-1 bg-gray-950 border border-gray-800 text-gray-300 rounded-lg">
                              {opt.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Store Badge presentation & Buy Buttons */}
                  <div className="pt-5 border-t border-gray-900 space-y-4">
                    {profile && (
                      <div className="bg-gray-950 border border-gray-900/60 p-3 rounded-2xl flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full border border-emerald-400 shadow bg-gray-900 flex items-center justify-center overflow-hidden font-black text-xs text-emerald-400 shrink-0">
                            {profile.photoURL ? (
                              <img src={profile.photoURL} alt={profile.displayName} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                            ) : (
                              profile.displayName?.substring(0,2).toUpperCase() || 'SH'
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-[9px] font-black uppercase text-gray-500 block">VENDEDOR PRO</span>
                            <h4 className="text-xs font-black text-white truncate">{profile.displayName || 'Tienda'}</h4>
                            <span className="text-[9px] font-bold text-gray-500 block truncate">@{profile.username}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setSelectedProduct(null);
                            onNavigateToStore(profile.username);
                          }}
                          className="px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-300 hover:text-white font-extrabold text-[10px] uppercase tracking-wide rounded-xl border border-indigo-500/20 transition cursor-pointer flex items-center gap-1 shrink-0"
                        >
                          Ir a la Tienda <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleWhatsAppOrder(selectedProduct)}
                        className="flex-1 py-3 bg-emerald-400 hover:bg-emerald-300 text-black font-black text-xs rounded-xl transition uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4 fill-black text-black" />
                        Pedir Por WhatsApp
                      </button>
                      <button
                        onClick={() => setSelectedProduct(null)}
                        className="px-4 py-3 bg-gray-950 hover:bg-gray-900 border border-gray-850 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer"
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>

                </div>

              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* 6. Footer */}
      <footer className="border-t border-gray-950 py-10 px-4 sm:px-6 md:px-8 bg-black/60 text-gray-600 text-center text-xs mt-12">
        <p className="font-semibold text-gray-500 mb-1">© 2026 LinnkPro.shop. Todos los derechos reservados.</p>
        <p className="text-gray-700 max-w-sm mx-auto">Vitrina comunitaria de tiendas en línea de LinnkPro.shop.</p>
      </footer>

    </div>
  );
}
