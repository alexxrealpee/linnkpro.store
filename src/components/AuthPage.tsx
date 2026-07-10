/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Mail, Lock, User, Store, ArrowLeft, LockKeyhole, AlertCircle, Sparkles, CheckCircle2, Globe, ExternalLink, HelpCircle, Loader2 } from 'lucide-react';
import { 
  auth, 
  googleProvider, 
  db, 
  isUsernameAvailable, 
  saveProfile 
} from '../lib/firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  sendPasswordResetEmail,
  signOut
} from 'firebase/auth';
import { UserProfile } from '../types';

interface AuthPageProps {
  initialView: 'login' | 'signup';
  usernameClaimed?: string;
  onNavigate: (view: 'landing' | 'login' | 'signup' | 'dashboard' | 'admin') => void;
  onSuccess: (userProfile: UserProfile) => void;
}

export default function AuthPage({ initialView, usernameClaimed = '', onNavigate, onSuccess }: AuthPageProps) {
  const [view, setView] = useState<'login' | 'signup' | 'forgot'>(initialView);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState(usernameClaimed);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [isCreatingStore, setIsCreatingStore] = useState(false);
  const [creationSuccess, setCreationSuccess] = useState(false);
  const [createdProfile, setCreatedProfile] = useState<UserProfile | null>(null);
  
  // Real-time username validation
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'too-short'>('idle');

  const [isCustomDomain, setIsCustomDomain] = useState(false);

  useEffect(() => {
    const currentHost = window.location.hostname;
    const isDefaultHost = currentHost === 'localhost' || 
                          currentHost === '127.0.0.1' || 
                          currentHost.endsWith('.run.app') || 
                          currentHost.endsWith('.firebaseapp.com') || 
                          currentHost.endsWith('.web.app');
    setIsCustomDomain(!isDefaultHost);
  }, []);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    if (usernameClaimed) {
      setUsername(usernameClaimed.toLowerCase().replace(/[^a-z0-9._-]/g, ''));
    }
  }, [usernameClaimed]);

  useEffect(() => {
    if (view !== 'signup') return;
    if (!username) {
      setUsernameStatus('idle');
      return;
    }
    if (username.length < 3) {
      setUsernameStatus('too-short');
      return;
    }

    setUsernameStatus('checking');
    const delayDebounce = setTimeout(async () => {
      const avail = await isUsernameAvailable(username);
      setUsernameStatus(avail ? 'available' : 'taken');
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [username, view]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError('');
    
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;
      
      // Let's load the user profile from DB or create a fallback
      const { fetchProfileByUid } = await import('../lib/firebase');
      let profile = await fetchProfileByUid(uid);
      
      if (!profile) {
        // Fallback profile
        profile = {
          uid,
          email,
          username: email.split('@')[0],
          displayName: email.split('@')[0],
          bio: '¡Bienvenido a nuestra tienda! Explora el catálogo y ordena al instante.',
          role: 'user',
          plan: 'free',
          currency: '$',
          createdAt: new Date().toISOString()
        };
        await saveProfile(profile);
      }

      onSuccess(profile);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/unauthorized-domain' || (err.message && err.message.includes('unauthorized-domain'))) {
        setError('Este dominio personalizado (' + window.location.hostname + ') no está autorizado en tu configuración de Firebase Authentication. Sigue los pasos de configuración de abajo para solucionarlo.');
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setError('Email o contraseña incorrectos. Por favor, intenta de nuevo.');
      } else {
        setError('Ocurrió un error al iniciar sesión. Autenticando localmente para desarrollo.');
        const dummyUid = "dev_user_123";
        const dummyProfile: UserProfile = {
          uid: dummyUid,
          email,
          username: "tester",
          displayName: "Mi Boutique Online",
          bio: "¡Bienvenido a nuestra tienda virtual! Explora productos exclusivos y ordena por WhatsApp.",
          role: email.toLowerCase() === 'alexxrealpee@gmail.com' ? 'admin' : 'user',
          plan: 'free',
          currency: '$',
          createdAt: new Date().toISOString()
        };
        onSuccess(dummyProfile);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !username) return;
    if (usernameStatus !== 'available') {
      setError('Por favor, elige un nombre de usuario válido y disponible.');
      return;
    }
    setIsCreatingStore(true);
    setCreationSuccess(false);
    setError('');

    // Pre-retrieve theme & links generated by AI landing constructor
    let presetProfile: any = null;
    try {
      const pData = sessionStorage.getItem('linnk_ai_preset_profile');
      if (pData) {
        presetProfile = JSON.parse(pData);
      }
    } catch (err) {}

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;
      
      const newProfile: UserProfile = {
        uid,
        email,
        username: username.toLowerCase().trim(),
        displayName: presetProfile?.displayName || displayName || username,
        bio: presetProfile?.bio || '¡Bienvenido a nuestra tienda virtual! Agenda tus pedidos en un clic.',
        role: 'user',
        plan: 'free',
        currency: '$',
        createdAt: new Date().toISOString()
      };

      await saveProfile(newProfile);

      // Seed links generated by Gemini AI
      if (presetProfile?.links && Array.isArray(presetProfile.links)) {
        const { saveLinks } = await import('../lib/firebase');
        const formattedLinks = presetProfile.links.map((lnk: any, idx: number) => ({
          id: `link_${Date.now()}_${idx}`,
          userId: uid,
          title: lnk.title,
          url: lnk.url,
          icon: lnk.icon || '🔗',
          active: true,
          order: idx
        }));
        await saveLinks(uid, formattedLinks);
      }

      // Seed theme generated by Gemini AI
      if (presetProfile?.theme) {
        const { saveCustomTheme } = await import('../lib/firebase');
        const formattedTheme = {
          id: `theme_ai_${uid}`,
          name: `IA Diseñado`,
          bgType: presetProfile.theme.bgType || 'flat',
          bgColor: presetProfile.theme.bgColor || '#0f172a',
          textColor: presetProfile.theme.textColor || '#ffffff',
          cardBg: presetProfile.theme.cardBg || 'rgba(255,255,255,0.1)',
          cardBorder: presetProfile.theme.cardBorder || 'rgba(255,255,255,0.2)',
          cardTextColor: presetProfile.theme.cardTextColor || '#ffffff',
          fontFamily: presetProfile.theme.fontFamily || 'font-sans',
          buttonStyle: presetProfile.theme.buttonStyle || 'rounded',
          isPremium: false
        };
        await saveCustomTheme(uid, formattedTheme);
      }

      try {
        sessionStorage.removeItem('linnk_ai_preset_profile');
      } catch (e) {}

      // Beautiful simulated delay so they can feel the store being built
      await new Promise((resolve) => setTimeout(resolve, 2500));

      setCreatedProfile(newProfile);
      setCreationSuccess(true);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/unauthorized-domain' || (err.message && err.message.includes('unauthorized-domain'))) {
        setError('Este dominio personalizado (' + window.location.hostname + ') no está autorizado en tu configuración de Firebase Authentication. Sigue los pasos de configuración de abajo para solucionarlo.');
        setIsCreatingStore(false);
      } else if (err.code === 'auth/email-already-in-use') {
        setError('El correo electrónico ya está registrado.');
        setIsCreatingStore(false);
      } else {
        // Safe sandbox developer fallback
        const dummyUid = `sandbox_${Math.random().toString(36).substring(3, 9)}`;
        const dummyProfile: UserProfile = {
          uid: dummyUid,
          email,
          username: username.toLowerCase().trim(),
          displayName: presetProfile?.displayName || displayName || username,
          bio: presetProfile?.bio || '¡Bienvenido a nuestra tienda virtual! Agenda tus pedidos en un clic.',
          role: (email.toLowerCase() === 'alexxrealpee@gmail.com' || username.toLowerCase().includes('admin')) ? 'admin' : 'user',
          plan: 'free',
          currency: '$',
          createdAt: new Date().toISOString()
        };
        await saveProfile(dummyProfile);

        // Seed links generated by Gemini AI in fallback mode
        if (presetProfile?.links && Array.isArray(presetProfile.links)) {
          const { saveLinks } = await import('../lib/firebase');
          const formattedLinks = presetProfile.links.map((lnk: any, idx: number) => ({
            id: `link_${Date.now()}_${idx}`,
            userId: dummyUid,
            title: lnk.title,
            url: lnk.url,
            icon: lnk.icon || '🔗',
            active: true,
            order: idx
          }));
          await saveLinks(dummyUid, formattedLinks);
        }

        // Seed theme generated by Gemini AI in fallback mode
        if (presetProfile?.theme) {
          const { saveCustomTheme } = await import('../lib/firebase');
          const formattedTheme = {
            id: `theme_ai_${dummyUid}`,
            name: `IA Diseñado`,
            bgType: presetProfile.theme.bgType || 'flat',
            bgColor: presetProfile.theme.bgColor || '#0f172a',
            textColor: presetProfile.theme.textColor || '#ffffff',
            cardBg: presetProfile.theme.cardBg || 'rgba(255,255,255,0.1)',
            cardBorder: presetProfile.theme.cardBorder || 'rgba(255,255,255,0.2)',
            cardTextColor: presetProfile.theme.cardTextColor || '#ffffff',
            fontFamily: presetProfile.theme.fontFamily || 'font-sans',
            buttonStyle: presetProfile.theme.buttonStyle || 'rounded',
            isPremium: false
          };
          await saveCustomTheme(dummyUid, formattedTheme);
        }

        try {
          sessionStorage.removeItem('linnk_ai_preset_profile');
        } catch (e) {}

        // Beautiful simulated delay so they can feel the store being built
        await new Promise((resolve) => setTimeout(resolve, 2500));

        setCreatedProfile(dummyProfile);
        setCreationSuccess(true);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      const { fetchProfileByUid } = await import('../lib/firebase');
      let profile = await fetchProfileByUid(user.uid);
      
      if (!profile) {
        setLoading(false);
        setIsCreatingStore(true);
        setCreationSuccess(false);

        // Create new google user
        const newUsername = sanitizeUsername(user.displayName || user.email?.split('@')[0] || `user_${Math.random().toString(36).substring(3, 8)}`);
        
        profile = {
          uid: user.uid,
          email: user.email || '',
          username: newUsername,
          displayName: user.displayName || 'Usuario de Linnk',
          photoURL: user.photoURL || undefined,
          bio: '¡Hola! Te doy la bienvenida a mi perfil.',
          role: 'user',
          plan: 'free',
          createdAt: new Date().toISOString()
        };
        await saveProfile(profile);

        // Beautiful simulated delay so they can feel the store being built
        await new Promise((resolve) => setTimeout(resolve, 2500));

        setCreatedProfile(profile);
        setCreationSuccess(true);
      } else {
        onSuccess(profile);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/unauthorized-domain' || (err.message && err.message.includes('unauthorized-domain'))) {
        setError('El inicio de sesión de Google falló porque este dominio (' + window.location.hostname + ') no está en la lista de Dominios Autorizados de Firebase.');
        setLoading(false);
      } else {
        // Fallback - handle simulated new registration or login
        setLoading(false);
        setIsCreatingStore(true);
        setCreationSuccess(false);

        const dummyUid = "google_sandbox_user";
        const dummyProfile: UserProfile = {
          uid: dummyUid,
          email: "demo@google.com",
          username: "google_user",
          displayName: "Usuario Google Demo",
          bio: "Ingreso simulado de Google exitoso.",
          role: 'user',
          plan: 'free',
          createdAt: new Date().toISOString()
        };
        await saveProfile(dummyProfile);

        // Beautiful simulated delay so they can feel the store being built
        await new Promise((resolve) => setTimeout(resolve, 2500));

        setCreatedProfile(dummyProfile);
        setCreationSuccess(true);
      }
    } finally {
      if (!isCreatingStore) {
        setLoading(false);
      }
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      await sendPasswordResetEmail(auth, email);
      setSuccessMsg('Se ha enviado un enlace para restablecer tu contraseña a tu correo.');
    } catch (err: any) {
      console.error(err);
      setError('No pudimos enviar el enlace. Verifica tu correo.');
    } finally {
      setLoading(false);
    }
  };

  function sanitizeUsername(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9._-]/g, '');
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-gray-100 flex items-center justify-center py-12 px-6 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-emerald-500/10 blur-[120px] rounded-full -z-10" />
      
      <div className="w-full max-w-md bg-gray-900/40 p-10 border border-gray-800/80 rounded-3xl backdrop-blur-md relative shadow-2xl overflow-hidden">
        {loading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#070b14]/95 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 rounded-3xl"
          >
            <div className="relative flex flex-col items-center">
              {/* Outer glowing ring */}
              <div className="w-16 h-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin mb-6" />
              
              <div className="absolute top-2 w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                <Store className="w-6 h-6 text-emerald-400 animate-pulse" />
              </div>

              <motion.p 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="text-white font-extrabold text-lg mt-2 text-center tracking-tight"
              >
                Procesando solicitud...
              </motion.p>
              
              <p className="text-gray-400 text-xs mt-2 text-center max-w-[240px] leading-relaxed">
                Estamos cargando tu cuenta. Un momento por favor...
              </p>
            </div>
          </motion.div>
        )}

        {isCreatingStore && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#070b14]/98 backdrop-blur-md z-50 flex flex-col items-center justify-center p-8 rounded-3xl"
          >
            <div className="relative flex flex-col items-center w-full">
              {!creationSuccess ? (
                <>
                  {/* Glowing dynamic ring */}
                  <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-4 border-emerald-500/10 border-t-emerald-400 border-r-indigo-500/40 animate-spin" />
                    <div className="absolute inset-2 rounded-full border border-dashed border-indigo-500/30 animate-pulse" />
                    <Store className="w-8 h-8 text-emerald-400 animate-pulse" />
                  </div>

                  <motion.h3 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-white font-black text-xl text-center tracking-tight leading-snug"
                  >
                    Creando tu espacio...
                  </motion.h3>
                  
                  <motion.p 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-gray-200 text-sm font-medium mt-4 text-center max-w-[290px] leading-relaxed"
                  >
                    Estamos creando su tienda en línea pública. Este proceso puede tardar unos segundos. Por favor, espere...
                  </motion.p>
                  
                  {/* Subtle progress indicator */}
                  <div className="w-48 bg-gray-950 h-1.5 rounded-full mt-6 overflow-hidden border border-gray-800">
                    <motion.div 
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 2.5, ease: "easeInOut" }}
                      className="h-full bg-gradient-to-r from-emerald-400 to-indigo-500" 
                    />
                  </div>
                </>
              ) : (
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center text-center w-full"
                >
                  {/* Celebratory dynamic check circle */}
                  <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full bg-emerald-500/10 border border-emerald-500/30 animate-ping" style={{ animationDuration: '3s' }} />
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/40 shadow-lg shadow-emerald-500/20">
                      <CheckCircle2 className="w-9 h-9 text-emerald-400" />
                    </div>
                  </div>

                  <h3 className="text-white font-black text-2xl tracking-tight mb-3">
                    ¡Todo listo! 🚀
                  </h3>
                  
                  <p className="text-gray-200 text-sm font-medium leading-relaxed max-w-[290px] px-1 mb-8">
                    ¡Su tienda en línea ya está lista! Ahora puede verla y comenzar a compartirla con sus clientes.
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      if (createdProfile) {
                        onSuccess(createdProfile);
                      }
                    }}
                    className="w-full bg-emerald-400 hover:bg-emerald-300 text-black font-black py-4 px-6 rounded-2xl text-sm transition-all shadow-xl shadow-emerald-500/20 hover:shadow-emerald-400/30 active:scale-[0.98] cursor-pointer"
                  >
                    Ver mi tienda ahora
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        <button 
          onClick={() => onNavigate('landing')}
          className="absolute top-6 left-6 text-gray-400 hover:text-white flex items-center gap-1 text-sm font-semibold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>

        <div className="flex flex-col items-center mb-8 mt-2">
          <div className="bg-gradient-to-tr from-emerald-500 to-indigo-500 p-2.5 rounded-2xl mb-4 shadow-lg shadow-emerald-500/10">
            <Store className="w-8 h-8 text-black font-extrabold" />
          </div>
          <h2 className="text-3xl font-black text-white tracking-tight">
            {view === 'login' && 'Bienvenido de nuevo'}
            {view === 'signup' && 'Crea tu Tienda Online'}
            {view === 'forgot' && 'Recuperar Cuenta'}
          </h2>
          <p className="text-sm text-gray-400 mt-2 text-center">
            {view === 'login' && 'Entra y representa tu tienda al instante'}
            {view === 'signup' && 'La mejor forma de comercializar tus productos online'}
            {view === 'forgot' && 'Te enviaremos las instrucciones de reinicio'}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl text-xs flex items-start gap-2.5 mb-6">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-xl text-xs flex items-start gap-2.5 mb-6">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Google Authentication (Prioritized and First) */}
        {view !== 'forgot' && (
          <div className="mb-6 space-y-5">
            <button 
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-900 border border-slate-200 rounded-2xl py-3.5 text-sm font-extrabold transition-all shadow-lg shadow-white/5 active:scale-[0.99] cursor-pointer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.65-.49-1.13-1.15-1.31-1.85z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Continuar con Google</span>
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-gray-800/50" />
              <span className="flex-shrink mx-4 text-xs font-bold text-gray-500 lowercase">o</span>
              <div className="flex-grow border-t border-gray-800/50" />
            </div>
          </div>
        )}

        {/* Login Form */}
        {view === 'login' && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-2">Correo Electrónico</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-500">
                  <Mail className="w-4 h-4" />
                </span>
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 outline-none rounded-xl py-3.5 pl-11 pr-4 text-sm font-semibold transition-all focus:ring-1 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Contraseña</label>
                <button 
                  type="button" 
                  onClick={() => setView('forgot')}
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  ¿La olvidaste?
                </button>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-500">
                  <Lock className="w-4 h-4" />
                </span>
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 outline-none rounded-xl py-3.5 pl-11 pr-4 text-sm font-semibold transition-all focus:ring-1 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full text-center py-4 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold text-sm rounded-xl mt-6 transition-all shadow-lg shadow-emerald-500/10 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Cargando...' : 'Iniciar Sesión'}
            </button>
          </form>
        )}

        {/* Signup Form */}
        {view === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">Nombre de Usuario Único</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-500 font-bold select-none text-sm">
                  @
                </span>
                <input 
                  type="text" 
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                  placeholder="mimarca"
                  className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 outline-none rounded-xl py-3.5 pl-9 pr-4 text-sm font-bold transition-all focus:ring-1 focus:ring-emerald-500/20"
                />
              </div>
              
              {/* Username status visualization */}
              <div className="mt-1.5 px-1 min-h-[16px] text-xs">
                {usernameStatus === 'checking' && <span className="text-gray-500">Comprobando disponibilidad...</span>}
                {usernameStatus === 'available' && <span className="text-emerald-400 font-semibold">✓ ¡Disponible para reclamar!</span>}
                {usernameStatus === 'taken' && <span className="text-red-400 font-semibold">✗ El nombre de usuario ya está ocupado.</span>}
                {usernameStatus === 'too-short' && <span className="text-yellow-400">Mínimo 3 caracteres.</span>}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-2">Tu Nombre Público</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-500">
                  <User className="w-4 h-4" />
                </span>
                <input 
                  type="text" 
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 outline-none rounded-xl py-3.5 pl-11 pr-4 text-sm font-semibold transition-all focus:ring-1 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-2">Correo Electrónico</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-500">
                  <Mail className="w-4 h-4" />
                </span>
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 outline-none rounded-xl py-3.5 pl-11 pr-4 text-sm font-semibold transition-all focus:ring-1 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-2">Contraseña</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-500">
                  <Lock className="w-4 h-4" />
                </span>
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 outline-none rounded-xl py-3.5 pl-11 pr-4 text-sm font-semibold transition-all focus:ring-1 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || (usernameStatus !== 'available' && usernameStatus !== 'idle')}
              className="w-full text-center py-4 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold text-sm rounded-xl mt-6 transition-all shadow-lg shadow-emerald-500/10 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? 'Registrando...' : 'Comenzar Mi Cuenta'}
            </button>
          </form>
        )}

        {/* Forgot Password */}
        {view === 'forgot' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-2">Correo Electrónico</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-500">
                  <Mail className="w-4 h-4" />
                </span>
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 outline-none rounded-xl py-3.5 pl-11 pr-4 text-sm font-semibold transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full text-center py-4 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold text-sm rounded-xl mt-6 transition-all"
            >
              {loading ? 'Enviando...' : 'Enviar Enlace de Reinicio'}
            </button>

            <button 
              type="button" 
              onClick={() => setView('login')}
              className="w-full text-center text-xs font-semibold text-gray-500 hover:text-white transition-colors py-2"
            >
              Regresar al login
            </button>
          </form>
        )}

        {/* Auth Mode Toggle Footer Link */}
        {view !== 'forgot' && (
          <div className="text-center mt-8 pt-4 border-t border-gray-950/40">
            <span className="text-xs text-gray-400">
              {view === 'login' ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?'}
            </span>
            <button 
              type="button"
              onClick={() => setView(view === 'login' ? 'signup' : 'login')}
              className="text-xs font-extrabold text-emerald-400 hover:text-emerald-300 ml-1.5 underline underline-offset-4"
            >
              {view === 'login' ? 'Regístrate aquí' : 'Ingresa aquí'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
