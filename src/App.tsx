/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, fetchProfileByUid, captureUrlReferralCode, getActiveReferralCode } from './lib/firebase';
import { UserProfile } from './types';

// Importing Custom Component views
import LandingPage from './components/LandingPage';
import AuthPage from './components/AuthPage';
import Dashboard from './components/Dashboard';
import PublicProfile from './components/PublicProfile';
import AdminPanel from './components/AdminPanel';
import TiendaGeneral from './components/TiendaGeneral';
import DriverRegister from './components/DriverRegister';
import DriverPortal from './components/DriverPortal';
import CarruselProduc from './components/CarruselProduc';
import PwaLoadingScreen from './components/PwaLoadingScreen';
import PwaInstallModal from './components/PwaInstallModal';
import { DriverProfile } from './types';

export default function App() {
  // Routing states
  const [view, setView] = useState<'landing' | 'login' | 'signup' | 'dashboard' | 'profile' | 'admin' | 'tienda' | 'driver-register' | 'driver-portal' | 'carruselproduc'>('tienda');
  const [targetUsername, setTargetUsername] = useState<string | null>(null);
  const [activeDriverSession, setActiveDriverSession] = useState<DriverProfile | null>(null);
  
  // Auth state
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [initLoading, setInitLoading] = useState(true);

  // Buffer state to pass claimed username from landing to sign up
  const [claimedUsername, setClaimedUsername] = useState('');

  // 1. Unified function to detect target public profile username from URL
  const getUsernameFromUrl = (): string | null => {
    const searchParams = new URLSearchParams(window.location.search);
    const queryUser = searchParams.get('u');
    
    // Clean and decode pathname (e.g. /juan -> juan)
    let pathUser = '';
    try {
      pathUser = decodeURIComponent(window.location.pathname.substring(1).trim());
    } catch (e) {
      pathUser = window.location.pathname.substring(1).trim();
    }
    
    if (pathUser.endsWith('/')) {
      pathUser = pathUser.substring(0, pathUser.length - 1);
    }
    // Also remove index.html or other boilerplate stuff if present
    if (pathUser === 'index.html') {
      pathUser = '';
    }

    // Clean hash values
    let hashUser = '';
    try {
      hashUser = decodeURIComponent(window.location.hash.substring(1).trim());
    } catch (e) {
      hashUser = window.location.hash.substring(1).trim();
    }
    
    if (hashUser.startsWith('/')) {
      hashUser = hashUser.substring(1);
    }

    const systemRoutes = ['login', 'signup', 'dashboard', 'admin', 'landing', 'vender', 'crear-tienda', 'tienda', 'tiendas', 'catalogo', 'domiciliario', 'driver-register', 'driver-portal', 'domiciliarios', 'carruselproduc', 'carrusel-productos'];
    const cleanedPath = pathUser && !systemRoutes.includes(pathUser.toLowerCase()) ? pathUser : null;
    return queryUser || cleanedPath || (hashUser ? hashUser : null);
  };

  // 2. React to URL Changes dynamically
  useEffect(() => {
    const handleUrlRouteCheck = () => {
      let pathUser = window.location.pathname.substring(1).trim().toLowerCase();
      if (pathUser.endsWith('/')) {
        pathUser = pathUser.substring(0, pathUser.length - 1);
      }
      let hashUser = window.location.hash.substring(1).trim().toLowerCase();
      if (hashUser.startsWith('/')) {
        hashUser = hashUser.substring(1);
      }

      if (['landing', 'vender', 'crear-tienda'].includes(pathUser) || ['landing', 'vender', 'crear-tienda', '/landing', '/vender', '/crear-tienda'].includes(hashUser)) {
        setView('landing');
        setTargetUsername(null);
      } else if (['tienda', 'tiendas', 'catalogo', ''].includes(pathUser) || ['tienda', 'tiendas', 'catalogo', '/tienda', '/tiendas', '/catalogo'].includes(hashUser)) {
        // /tienda or / or /tiendas displays TiendaGeneral (general directory/catalog)
        setView('tienda');
        setTargetUsername(null);
      } else if (['carruselproduc', 'carrusel-productos'].includes(pathUser) || ['carruselproduc', 'carrusel-productos', '/carruselproduc', '/carrusel-productos'].includes(hashUser)) {
        setView('carruselproduc');
        setTargetUsername(null);
      } else if (['domiciliario', 'domiciliarios', 'driver-portal'].includes(pathUser) || ['domiciliario', 'domiciliarios', 'driver-portal', '/domiciliario', '/domiciliarios', '/driver-portal'].includes(hashUser)) {
        setView('driver-portal');
        setTargetUsername(null);
      } else if (['driver-register'].includes(pathUser) || ['driver-register', '/driver-register'].includes(hashUser)) {
        setView('driver-register');
        setTargetUsername(null);
      } else {
        const usernameToLoad = getUsernameFromUrl();
        if (usernameToLoad) {
          setTargetUsername(usernameToLoad);
          setView('profile');
        } else {
          setTargetUsername(null);
          // Default fallback displays TiendaGeneral
          setView('tienda');
        }
      }
    };

    // Run on mount
    handleUrlRouteCheck();

    // Capture referral from URL if present (?ref=..., ?referral=..., ?c=...)
    captureUrlReferralCode();

    // Listen to back/forward and hash changes
    window.addEventListener('popstate', handleUrlRouteCheck);
    window.addEventListener('hashchange', handleUrlRouteCheck);
    
    return () => {
      window.removeEventListener('popstate', handleUrlRouteCheck);
      window.removeEventListener('hashchange', handleUrlRouteCheck);
    };
  }, []);

  // 3. Keep Auth listener continuously running so session is never lost or orphaned
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const profile = await fetchProfileByUid(user.uid);
        if (profile) {
          setUserProfile(profile);
          
          // Only force redirect to dashboard if user is not looking at a public profile or auth routing explicitly
          const activeUserProfileUrl = getUsernameFromUrl();
          const pathUser = window.location.pathname.substring(1).trim().toLowerCase();
          const hashVal = window.location.hash.toLowerCase();
          const isPublicRoute = ['tienda', 'tiendas', 'catalogo', 'landing', 'vender', 'crear-tienda', 'domiciliario', 'domiciliarios', 'driver-register', 'driver-portal', 'carruselproduc'].includes(pathUser) ||
            ['#tienda', '#/tienda', '#tiendas', '#/tiendas', '#catalogo', '#/catalogo', '#landing', '#/landing', '#domiciliario', '#/domiciliario', '#driver-portal', '#/driver-portal', '#carruselproduc', '#/carruselproduc'].includes(hashVal);

          if (!activeUserProfileUrl && !isPublicRoute) {
            setView(profile.suspended ? 'landing' : 'dashboard');
          }
        } else {
          // Setup a temporary user profile
          const tempProfile: UserProfile = {
            uid: user.uid,
            email: user.email || '',
            username: user.email?.split('@')[0] || `store_${Date.now().toString().substring(5)}`,
            displayName: user?.displayName || 'Mi Tienda Online',
            bio: '¡Bienvenido a nuestra tienda! Aquí encontrarás los mejores productos con envíos rápidos y seguros.',
            role: 'user',
            plan: 'free',
            currency: '$',
            createdAt: new Date().toISOString()
          };
          setUserProfile(tempProfile);
          
          const activeUserProfileUrl = getUsernameFromUrl();
          const pathUser = window.location.pathname.substring(1).trim().toLowerCase();
          const hashVal = window.location.hash.toLowerCase();
          const isPublicRoute = ['tienda', 'tiendas', 'catalogo', 'landing', 'vender', 'crear-tienda', 'domiciliario', 'domiciliarios', 'driver-register', 'driver-portal', 'carruselproduc'].includes(pathUser) ||
            ['#tienda', '#/tienda', '#tiendas', '#/tiendas', '#catalogo', '#/catalogo', '#landing', '#/landing', '#domiciliario', '#/domiciliario', '#driver-portal', '#/driver-portal', '#carruselproduc', '#/carruselproduc'].includes(hashVal);

          if (!activeUserProfileUrl && !isPublicRoute) {
            setView('dashboard');
          }
        }
      } else {
        setUserProfile(null);
        // Only return back to landing page if user is currently inside protected vistas
        setView(prev => {
          if (prev === 'dashboard' || prev === 'admin') {
            return 'landing';
          }
          return prev;
        });
      }
      setInitLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUserProfile(null);
      setView('landing');
    } catch (e) {
      console.error(e);
    }
  };

  const handleNavigateHome = (claimUsername?: string) => {
    // Return to root workspace and strip query parameters safely
    window.history.pushState({}, document.title, window.location.origin);
    setTargetUsername(null);
    if (claimUsername && typeof claimUsername === 'string') {
      setClaimedUsername(claimUsername);
      setView('signup');
    } else {
      setView('landing');
    }
  };

  const handleAuthSuccess = (profile: UserProfile) => {
    setUserProfile(profile);
    setView('dashboard');
  };

  if (initLoading) {
    return <PwaLoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-gray-100">
      {view === 'landing' && (
        <LandingPage 
          onNavigate={(targetView, customUser) => {
            if (targetView === 'tienda') {
              window.history.pushState({}, '', '/tienda');
              setView('tienda');
            } else if (targetView === 'landing') {
              window.history.pushState({}, '', '/landing');
              setView('landing');
            } else {
              if (customUser) {
                setClaimedUsername(customUser);
              }
              setView(targetView);
            }
          }} 
        />
      )}

      {(view === 'login' || view === 'signup') && (
        <AuthPage 
          initialView={view} 
          usernameClaimed={claimedUsername}
          onNavigate={(targetView) => setView(targetView)} 
          onSuccess={handleAuthSuccess}
        />
      )}

      {view === 'dashboard' && userProfile && (
        <Dashboard 
          userProfile={userProfile} 
          onLogout={handleLogout}
          onNavigateAdmin={() => setView('admin')}
        />
      )}

      {view === 'profile' && targetUsername && (
        <PublicProfile 
          username={targetUsername} 
          onNavigateHome={handleNavigateHome}
        />
      )}

      {view === 'tienda' && (
        <TiendaGeneral 
          onNavigateHome={handleNavigateHome}
          onNavigateToStore={(username) => {
            window.history.pushState({}, '', '/' + username);
            setTargetUsername(username);
            setView('profile');
          }}
        />
      )}

      {view === 'admin' && (
        <AdminPanel 
          onBack={() => setView('dashboard')}
        />
      )}

      {view === 'driver-register' && (
        <DriverRegister 
          onNavigateHome={handleNavigateHome}
          onNavigateLogin={() => setView('driver-portal')}
          onSuccessRegistered={(driver) => {
            setActiveDriverSession(driver);
            setView('driver-portal');
          }}
        />
      )}

      {view === 'driver-portal' && (
        <DriverPortal 
          onNavigateHome={handleNavigateHome}
          onNavigateRegister={() => setView('driver-register')}
          initialDriver={activeDriverSession}
        />
      )}

      {view === 'carruselproduc' && (
        <CarruselProduc
          onNavigateHome={handleNavigateHome}
          onNavigateToStore={(username) => {
            window.history.pushState({}, '', '/' + username);
            setTargetUsername(username);
            setView('profile');
          }}
          onNavigateToTienda={() => {
            window.history.pushState({}, '', '/');
            setView('tienda');
          }}
        />
      )}

      {/* Progressive Web App (PWA) Installation Bottom Sheet Modal */}
      <PwaInstallModal />
    </div>
  );
}
