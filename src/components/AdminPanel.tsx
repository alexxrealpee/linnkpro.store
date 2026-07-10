/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  fetchAdminStats, 
  fetchAllSubscriptionPayments,
  db 
} from '../lib/firebase';
import { SubscriptionPayment } from '../types';
import { 
  Users, 
  Settings, 
  ShieldAlert, 
  Layers, 
  TrendingUp, 
  Lock, 
  Unlock, 
  Search, 
  ArrowLeft,
  DollarSign,
  AlertTriangle,
  RefreshCw,
  Check,
  X,
  Image as ImageIcon,
  CreditCard,
  Calendar,
  History,
  ShoppingBag,
  Sparkles
} from 'lucide-react';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc,
  updateDoc 
} from 'firebase/firestore';

interface AdminPanelProps {
  onBack: () => void;
}

interface AdminUser {
  uid: string;
  email: string;
  username: string;
  role: 'user' | 'admin';
  plan?: 'free' | 'pro' | 'business';
  subscriptionPlan?: 'basico' | 'medio' | 'pro';
  subscriptionStatus?: string;
  storeName?: string;
  subscriptionPaidUntil?: string;
  createdAt?: string;
  suspended?: boolean;
  isClosed?: boolean;
}

export default function AdminPanel({ onBack }: AdminPanelProps) {
  const [stats, setStats] = useState({
    totalUsers: 142,
    totalProfiles: 142,
    subscribersPro: 31,
    subscribersBusiness: 11,
    monthlyRevenue: 639.46
  });
  
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [notif, setNotif] = useState('');
  const [activeAdminTab, setActiveAdminTab] = useState<'users' | 'payments' | 'subscriptions'>('subscriptions');
  const [allPayments, setAllPayments] = useState<SubscriptionPayment[]>([]);
  const [viewingProofImg, setViewingProofImg] = useState<string | null>(null);

  // Filter specific store for historical payments ledger
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('all');

  const loadAdminData = async () => {
    setLoading(true);
    try {
      // 1. Load Stats
      const systemStats = await fetchAdminStats();
      setStats(systemStats);

      // 2. Load and merge registered users from database of profiles
      const uS = await getDocs(collection(db, 'profiles'));
      const list: AdminUser[] = [];
      uS.forEach((document) => {
        const d = document.data();
        list.push({ 
          uid: document.id, 
          email: d.email || '', 
          username: d.username || d.displayName || '', 
          role: d.role || 'user', 
          plan: d.plan || 'free', 
          subscriptionPlan: d.subscriptionPlan || 'basico',
          subscriptionStatus: d.subscriptionStatus || 'active',
          storeName: d.displayName || d.storeName || '',
          subscriptionPaidUntil: d.subscriptionPaidUntil || '',
          createdAt: d.createdAt || '',
          suspended: d.suspended || false,
          isClosed: d.isClosed || false
        } as AdminUser);
      });

      if (list.length === 0) {
        // Fallback realistic user list for development/demo ease
        const testList: AdminUser[] = [
          { uid: 'u1', email: 'alexxrealpee@gmail.com', username: 'alexxrealpee', role: 'admin', plan: 'pro', subscriptionPlan: 'pro', storeName: 'Linnk Staff Store', subscriptionStatus: 'active', suspended: false, subscriptionPaidUntil: new Date(Date.now() + 30 * 24 * 3600000).toISOString(), isClosed: false },
          { uid: 'u2', email: 'sofia.disenos@gmail.com', username: 'sofia_creative', role: 'user', plan: 'pro', subscriptionPlan: 'medio', storeName: 'Sofía Diseños Creativos', subscriptionStatus: 'active', suspended: false, subscriptionPaidUntil: new Date(Date.now() + 15 * 24 * 3600000).toISOString(), isClosed: false },
          { uid: 'u3', email: 'fitness.trainer@outlook.com', username: 'coach_fit', role: 'user', plan: 'free', subscriptionPlan: 'basico', storeName: 'Coach Fit Athletics', subscriptionStatus: 'active', suspended: false, subscriptionPaidUntil: new Date(Date.now() + 2 * 24 * 3600000).toISOString(), isClosed: true },
          { uid: 'u4', email: 'camila.viajes@gmail.com', username: 'camiactive', role: 'user', plan: 'pro', subscriptionPlan: 'medio', storeName: 'Cami Active Store', subscriptionStatus: 'expired', suspended: true, subscriptionPaidUntil: new Date(Date.now() - 5 * 24 * 3600000).toISOString(), isClosed: true },
          { uid: 'u5', email: 'restaurante.tacos@gmail.com', username: 'tacos_el_guero', role: 'user', plan: 'pro', subscriptionPlan: 'pro', storeName: 'Tacos El Güero', subscriptionStatus: 'active', suspended: false, subscriptionPaidUntil: new Date(Date.now() + 25 * 24 * 3600000).toISOString(), isClosed: false },
          { uid: 'u6', email: 'diego_code@yahoo.com', username: 'diego_developer', role: 'user', plan: 'free', subscriptionPlan: 'basico', storeName: 'Diego Gadgets & Tech', subscriptionStatus: 'pending_payment', suspended: false, subscriptionPaidUntil: '', isClosed: false },
        ];
        setUsers(testList);
      } else {
        setUsers(list);
      }

      // 3. Load subscription payments
      const fetchedPayments = await fetchAllSubscriptionPayments();
      setAllPayments(fetchedPayments);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const handleToggleSuspension = async (user: AdminUser) => {
    const nextStatus = !user.suspended;
    try {
      // Write to Firebase
      await updateDoc(doc(db, 'users', user.uid), { suspended: nextStatus });
      await updateDoc(doc(db, 'profiles', user.uid), { suspended: nextStatus });
    } catch(e) {}

    // Update Local State
    setUsers(users.map(u => u.uid === user.uid ? { ...u, suspended: nextStatus } : u));
    setNotif(`Usuario @${user.username} ha sido ${nextStatus ? 'SUSPENDIDO' : 'ACTIVADO'} correctamente.`);
    setTimeout(() => setNotif(''), 4000);
  };

  const handlePlanUpgrade = async (user: AdminUser, newPlan: 'basico' | 'medio' | 'pro') => {
    try {
      await updateDoc(doc(db, 'profiles', user.uid), { 
        subscriptionPlan: newPlan,
        subscriptionStatus: 'active'
      });
      // Backwards compatibility writes
      await updateDoc(doc(db, 'users', user.uid), { 
        subscriptionPlan: newPlan,
        subscriptionStatus: 'active',
        plan: newPlan === 'basico' ? 'free' : newPlan === 'medio' ? 'pro' : 'business'
      });
    } catch(e) {}

    setUsers(users.map(u => u.uid === user.uid ? { ...u, subscriptionPlan: newPlan } : u));
    const planLabels = {
      basico: 'Plan Básico (30 productos)',
      medio: 'Plan Medio (60 productos)',
      pro: 'Plan Avanzado (100 productos)'
    };
    setNotif(`La suscripción de @${user.username} ha sido actualizada a: ${planLabels[newPlan].toUpperCase()}.`);
    setTimeout(() => setNotif(''), 4500);
  };

  const handleUpdateSubscriptionStatus = async (userId: string, newStatus: string) => {
    try {
      const userRef = doc(db, 'profiles', userId);
      await updateDoc(userRef, {
        subscriptionStatus: newStatus
      });

      setUsers(prev => prev.map(u => u.uid === userId ? {
        ...u,
        subscriptionStatus: newStatus
      } : u));

      setNotif(`Estado de suscripción actualizado a: ${newStatus.toUpperCase()}`);
      setTimeout(() => setNotif(''), 4000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleExtendSubscription = async (user: AdminUser) => {
    try {
      const currentPaidUntil = user.subscriptionPaidUntil ? new Date(user.subscriptionPaidUntil) : new Date();
      const newDate = new Date(Math.max(currentPaidUntil.getTime(), Date.now()) + 30 * 24 * 3600000);
      
      const userRef = doc(db, 'profiles', user.uid);
      await updateDoc(userRef, {
        subscriptionStatus: 'active',
        subscriptionPaidUntil: newDate.toISOString()
      });

      setUsers(prev => prev.map(u => u.uid === user.uid ? {
        ...u,
        subscriptionStatus: 'active',
        subscriptionPaidUntil: newDate.toISOString()
      } : u));

      setNotif(`Suscripción de ${user.username || 'tienda'} extendida hasta ${newDate.toLocaleDateString()}`);
      setTimeout(() => setNotif(''), 4000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleStoreClosedStatus = async (user: AdminUser) => {
    const nextClosedState = !user.isClosed;
    try {
      await updateDoc(doc(db, 'profiles', user.uid), { isClosed: nextClosedState });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, isClosed: nextClosedState } : u));
      setNotif(`La tienda de @${user.username} ahora se encuentra: ${nextClosedState ? '🔴 CERRADA' : '🟢 ABIERTA'}`);
      setTimeout(() => setNotif(''), 4000);
    } catch (err) {
      console.error(err);
      alert("Error al actualizar el estado de la tienda.");
    }
  };

  const handleApprovePayment = async (payment: SubscriptionPayment) => {
    try {
      const paymentRef = doc(db, 'subscription_payments', payment.id);
      await updateDoc(paymentRef, { 
        status: 'approved',
        updatedAt: new Date().toISOString()
      });

      const newPaidUntil = new Date(Date.now() + 30 * 24 * 3600000).toISOString();

      const profileRef = doc(db, 'profiles', payment.userId);
      await updateDoc(profileRef, {
        subscriptionStatus: 'active',
        subscriptionPlan: payment.plan,
        subscriptionPaidUntil: newPaidUntil
      });

      const userRef = doc(db, 'users', payment.userId);
      try {
        await updateDoc(userRef, {
          subscriptionStatus: 'active',
          subscriptionPlan: payment.plan,
          subscriptionPaidUntil: newPaidUntil
        });
      } catch (err) {}

      // Update local payments and users states
      setAllPayments(prev => prev.map(p => p.id === payment.id ? { ...p, status: 'approved' } : p));
      setUsers(prev => prev.map(u => u.uid === payment.userId ? {
        ...u,
        subscriptionStatus: 'active',
        subscriptionPlan: payment.plan || u.subscriptionPlan,
        subscriptionPaidUntil: newPaidUntil
      } : u));

      setNotif(`¡Pago de @${payment.username} por $${payment.amount.toLocaleString()} COP APROBADO correctamente!`);
      setTimeout(() => setNotif(''), 5000);
    } catch (e) {
      console.error(e);
      alert("Error al aprobar pago.");
    }
  };

  const handleRejectPayment = async (payment: SubscriptionPayment) => {
    try {
      const paymentRef = doc(db, 'subscription_payments', payment.id);
      await updateDoc(paymentRef, { 
        status: 'rejected',
        updatedAt: new Date().toISOString()
      });

      const profileRef = doc(db, 'profiles', payment.userId);
      await updateDoc(profileRef, {
        subscriptionStatus: 'pending_payment'
      });

      setAllPayments(prev => prev.map(p => p.id === payment.id ? { ...p, status: 'rejected' } : p));
      setNotif(`Pago de @${payment.username} marcado como RECHAZADO.`);
      setTimeout(() => setNotif(''), 5000);
    } catch (e) {
      console.error(e);
      alert("Error al rechazar pago.");
    }
  };

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(search.toLowerCase()) || 
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#070b14] text-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 hover:text-emerald-450 transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-2">
                Panel de Administración <span className="bg-red-500/10 text-red-400 text-xs font-semibold uppercase px-2 py-0.5 rounded border border-red-500/20">Staff ONLY</span>
              </h1>
              <p className="text-sm text-gray-400">Supervisa las cuentas de Linnk.Pro, planes de suscripción y finanzas</p>
            </div>
          </div>

          <button 
            onClick={loadAdminData}
            title="Recargar"
            className="self-start md:self-auto flex items-center gap-2 px-4 py-2.5 bg-gray-950 hover:bg-gray-900 border border-gray-800 rounded-xl text-xs font-bold font-mono transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Sincronizar Firebase
          </button>
        </div>

        {notif && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs p-4 rounded-xl mb-6 flex items-center gap-2 font-semibold">
            <TrendingUp className="w-4 h-4 shrink-0" />
            <span>{notif}</span>
          </div>
        )}

        {/* Global Dashboard Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
          <div className="bg-gray-900/40 border border-gray-800/80 p-5 rounded-2xl">
            <div className="flex justify-between items-center text-gray-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Usuarios Totales</span>
              <Users className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-black text-white">{stats.totalUsers}</p>
            <span className="text-[10px] text-gray-500 font-bold font-mono">+12% esta semana</span>
          </div>

          <div className="bg-gray-900/40 border border-gray-800/80 p-5 rounded-2xl">
            <div className="flex justify-between items-center text-gray-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Perfiles Activos</span>
              <Layers className="w-4 h-4 text-indigo-400" />
            </div>
            <p className="text-2xl font-black text-white">{stats.totalProfiles}</p>
            <span className="text-[10px] text-gray-500 font-bold font-mono">100% en vivo</span>
          </div>

          <div className="bg-gray-900/40 border border-gray-800/80 p-5 rounded-2xl">
            <div className="flex justify-between items-center text-gray-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Suscritos de Pago</span>
              <ShieldAlert className="w-4 h-4 text-yellow-500" />
            </div>
            <p className="text-2xl font-black text-white">{stats.subscribersPro + stats.subscribersBusiness}</p>
            <span className="text-[10px] text-emerald-400 font-bold font-mono">{Math.round(((stats.subscribersPro + stats.subscribersBusiness) / stats.totalUsers) * 100)}% conversión</span>
          </div>

          <div className="bg-gray-900/40 border border-gray-800/80 p-5 rounded-2xl">
            <div className="flex justify-between items-center text-gray-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Ingreso Mensual COP</span>
              <DollarSign className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-black text-white">${stats.monthlyRevenue.toLocaleString()} COP</p>
            <span className="text-[10px] text-gray-550 font-bold font-mono">Facturación Estimada</span>
          </div>
        </div>

        {/* Tab triggers for Admin Panel */}
        <div className="flex bg-gray-950/80 p-1 rounded-2xl border border-gray-900 mb-6 max-w-2xl overflow-x-auto gap-1">
          <button
            onClick={() => setActiveAdminTab('subscriptions')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 whitespace-nowrap ${
              activeAdminTab === 'subscriptions' 
                ? 'bg-indigo-500 text-white shadow-md' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            Suscripciones Activas & Registro
          </button>
          
          <button
            onClick={() => setActiveAdminTab('payments')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 whitespace-nowrap ${
              activeAdminTab === 'payments' 
                ? 'bg-indigo-500 text-white shadow-md' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Validar Transferencias
            {allPayments.filter(p => p.status === 'review').length > 0 && (
              <span className="bg-red-500 text-white font-mono text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                {allPayments.filter(p => p.status === 'review').length}
              </span>
            )}
          </button>
          
          <button
            onClick={() => setActiveAdminTab('users')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 whitespace-nowrap ${
              activeAdminTab === 'users' 
                ? 'bg-indigo-500 text-white shadow-md' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            Cuentas de Usuarios ({users.length})
          </button>
        </div>

        {activeAdminTab === 'subscriptions' ? (
          <div className="space-y-6 animate-fade-in">
            {/* Summary statistics or info */}
            <div className="bg-gray-900/30 border border-gray-800 rounded-3xl p-6 backdrop-blur-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-900 pb-4">
                <div>
                  <h3 className="font-extrabold text-white text-base">Registro de Suscripciones & Control de Pagos</h3>
                  <p className="text-[11px] text-gray-500 font-medium">Revisa las fechas, montos pagados, y administra de manera detallada las suscripciones activas de cada tienda en línea.</p>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-semibold font-mono">Filtrar Historial:</span>
                  <select 
                    value={selectedStoreFilter}
                    onChange={(e) => setSelectedStoreFilter(e.target.value)}
                    className="bg-gray-950 border border-gray-800 text-white rounded-xl py-1.5 px-3 text-xs outline-none"
                  >
                    <option value="all">Todas las Tiendas</option>
                    {users.filter(u => u.storeName || u.username).map(u => (
                      <option key={u.uid} value={u.username}>{(u.storeName || u.username)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* SECTION A: ACTIVE SUBSCRIPTIONS MONITOR */}
              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase text-amber-400 tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" /> Estado de Suscripciones Activas
                </h4>
                
                {/* Mobile view: beautiful cards for cell phones */}
                <div className="block md:hidden space-y-4">
                  {users.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 font-semibold">Cargando tiendas...</div>
                  ) : (
                    users.map((user) => {
                      const isExpired = user.subscriptionPaidUntil && new Date(user.subscriptionPaidUntil) < new Date();
                      const status = user.subscriptionStatus || (isExpired ? 'expired' : 'active');
                      const planPrice = user.subscriptionPlan === 'pro' ? 99000 : user.subscriptionPlan === 'medio' ? 79000 : 49000;

                      return (
                        <div key={user.uid} className="bg-gray-950 border border-gray-900 p-4 rounded-2xl space-y-3.5 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-extrabold text-white text-[13px]">{user.storeName || user.username || 'Tienda sin Nombre'}</div>
                              <div className="text-[10px] text-gray-500 font-mono">@{user.username}</div>
                              <div className="text-[10px] text-gray-500 font-mono">{user.email}</div>
                            </div>
                            <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-black uppercase rounded-lg">
                              {user.subscriptionPlan || 'Básico'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-gray-900/50">
                            <div>
                              <span className="text-[10px] font-bold text-gray-550 uppercase block mb-0.5">Costo Mensual:</span>
                              <strong className="text-white">${planPrice.toLocaleString()} COP</strong>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold text-gray-550 uppercase block mb-0.5">Expiración:</span>
                              <span className={`font-mono ${isExpired ? 'text-red-400 font-black' : 'text-emerald-400 font-semibold'}`}>
                                {user.subscriptionPaidUntil ? new Date(user.subscriptionPaidUntil).toLocaleDateString() : 'No registrada'}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-2">
                            <div>
                              <span className="text-[10px] font-bold text-gray-550 uppercase block mb-1">Apertura Tienda:</span>
                              <button
                                type="button"
                                onClick={() => handleToggleStoreClosedStatus(user)}
                                className={`w-full py-2 rounded-xl text-[10.5px] font-black uppercase transition duration-150 border cursor-pointer ${
                                  user.isClosed
                                    ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                }`}
                              >
                                {user.isClosed ? '🔴 Cerrada' : '🟢 Abierta'}
                              </button>
                            </div>

                            <div>
                              <span className="text-[10px] font-bold text-gray-550 uppercase block mb-1">Suscripción:</span>
                              <select
                                value={status}
                                onChange={(e) => handleUpdateSubscriptionStatus(user.uid, e.target.value)}
                                className={`w-full rounded-xl py-2 px-2 text-[10.5px] uppercase font-black border cursor-pointer outline-none text-center ${
                                  status === 'active' 
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                    : status === 'expired' 
                                    ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                }`}
                              >
                                <option value="active" className="bg-gray-950 text-white">🟢 ACTIVA</option>
                                <option value="expired" className="bg-gray-950 text-white">🔴 EXPIRADA</option>
                                <option value="pending_payment" className="bg-gray-950 text-white">🟡 PENDIENTE</option>
                              </select>
                            </div>
                          </div>

                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => handleExtendSubscription(user)}
                              className="w-full py-2.5 bg-indigo-500/15 hover:bg-indigo-500 text-indigo-400 hover:text-white font-black text-[10px] tracking-wider uppercase rounded-xl border border-indigo-500/25 transition cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Calendar className="w-4 h-4" /> +30 Días Prórroga
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Desktop table view */}
                <div className="hidden md:block overflow-x-auto w-full">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-800 text-[10px] text-gray-450 uppercase font-black tracking-widest bg-gray-900/15">
                        <th className="py-3 px-4">Tienda / Vendedor</th>
                        <th className="py-3 px-4">Plan</th>
                        <th className="py-3 px-4">Costo Mensual</th>
                        <th className="py-3 px-4">Fecha Expiración</th>
                        <th className="py-3 px-4 text-center">Apertura Tienda</th>
                        <th className="py-3 px-4 text-center">Estado de Suscripción</th>
                        <th className="py-3 px-4 text-right">Acciones de Control</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-850 text-xs">
                      {users.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-gray-500 font-semibold">Cargando tiendas...</td>
                        </tr>
                      ) : (
                        users.map((user) => {
                          const isExpired = user.subscriptionPaidUntil && new Date(user.subscriptionPaidUntil) < new Date();
                          const status = user.subscriptionStatus || (isExpired ? 'expired' : 'active');
                          const planPrice = user.subscriptionPlan === 'pro' ? 99000 : user.subscriptionPlan === 'medio' ? 79000 : 49000;
                          
                          return (
                            <tr key={user.uid} className="hover:bg-gray-900/10 transition duration-150">
                              <td className="py-3.5 px-4">
                                <div className="font-extrabold text-white text-xs">{user.storeName || user.username || 'Tienda sin Nombre'}</div>
                                <div className="text-[10px] text-gray-500 font-mono">@{user.username} • {user.email}</div>
                              </td>
                              <td className="py-3.5 px-4 uppercase font-black font-mono text-indigo-400 text-[10px]">
                                {user.subscriptionPlan || 'Básico'}
                              </td>
                              <td className="py-3.5 px-4 font-bold font-mono text-white">
                                ${planPrice.toLocaleString()} COP
                              </td>
                              <td className="py-3.5 px-4 font-mono text-gray-300">
                                {user.subscriptionPaidUntil ? (
                                  <span className={isExpired ? 'text-red-400 font-black' : 'text-emerald-400 font-semibold'}>
                                    {new Date(user.subscriptionPaidUntil).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}
                                  </span>
                                ) : (
                                  <span className="text-gray-600">No registrada</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleToggleStoreClosedStatus(user)}
                                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition duration-150 border cursor-pointer ${
                                    user.isClosed
                                      ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                  }`}
                                >
                                  {user.isClosed ? '🔴 Cerrada' : '🟢 Abierta'}
                                </button>
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <select
                                  value={status}
                                  onChange={(e) => handleUpdateSubscriptionStatus(user.uid, e.target.value)}
                                  className={`rounded-lg py-1 px-2 text-[10px] uppercase font-black border cursor-pointer outline-none ${
                                    status === 'active' 
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                      : status === 'expired' 
                                      ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                  }`}
                                >
                                  <option value="active" className="bg-gray-950 text-white">🟢 ACTIVA</option>
                                  <option value="expired" className="bg-gray-950 text-white">🔴 EXPIRADA</option>
                                  <option value="pending_payment" className="bg-gray-950 text-white">🟡 PENDIENTE</option>
                                </select>
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <button
                                  onClick={() => handleExtendSubscription(user)}
                                  className="px-2.5 py-1.5 bg-indigo-500/10 hover:bg-indigo-500 hover:text-white text-indigo-400 font-black text-[10px] tracking-wider uppercase rounded-lg border border-indigo-500/25 transition cursor-pointer flex items-center gap-1 ml-auto"
                                >
                                  <Calendar className="w-3.5 h-3.5" /> +30 Días Prórroga
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SECTION B: DETAILED MONTHLY PAYMENT HISTORICAL LEDGER */}
              <div className="border-t border-gray-900 pt-6 space-y-4">
                <h4 className="text-xs font-black uppercase text-indigo-400 tracking-wider flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-400" /> Historial General de Pagos Mensuales
                </h4>
                
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-800 text-[10px] text-gray-450 uppercase font-black tracking-widest bg-gray-900/15">
                        <th className="py-3 px-4">Fecha de Pago</th>
                        <th className="py-3 px-4">Tienda / Vendedor</th>
                        <th className="py-3 px-4">Plan Adquirido</th>
                        <th className="py-3 px-4 font-mono">Monto COP</th>
                        <th className="py-3 px-4">Período de Cobertura</th>
                        <th className="py-3 px-4 text-center">Estado Pago</th>
                        <th className="py-3 px-4 text-right">Comprobante</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-850 text-xs">
                      {allPayments.filter(p => selectedStoreFilter === 'all' || p.username === selectedStoreFilter).length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-gray-500 font-semibold">
                            No hay pagos registrados para el filtro seleccionado.
                          </td>
                        </tr>
                      ) : (
                        allPayments
                          .filter(p => selectedStoreFilter === 'all' || p.username === selectedStoreFilter)
                          .map((p) => {
                            const dateObj = p.createdAt ? new Date(p.createdAt) : new Date();
                            return (
                              <tr key={p.id} className="hover:bg-gray-900/10 transition duration-150">
                                <td className="py-3.5 px-4 font-mono text-gray-300">
                                  {dateObj.toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="py-3.5 px-4">
                                  <div className="font-bold text-white">{p.storeName || p.username}</div>
                                  <div className="text-[10px] text-gray-500">@{p.username}</div>
                                </td>
                                <td className="py-3.5 px-4 uppercase font-bold font-mono text-gray-400">
                                  {p.plan || 'Plan Premium'}
                                </td>
                                <td className="py-3.5 px-4 font-extrabold font-mono text-emerald-400">
                                  ${p.amount.toLocaleString()} COP
                                </td>
                                <td className="py-3.5 px-4 text-gray-400">
                                  {p.periodLabel || 'Suscripción Mensual'}
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase border ${
                                    p.status === 'approved' 
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                      : p.status === 'review' 
                                      ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 animate-pulse' 
                                      : 'bg-red-500/10 text-red-400 border-red-500/20'
                                  }`}>
                                    {p.status === 'approved' ? 'Aprobado' : p.status === 'review' ? 'En Revisión' : 'Rechazado'}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  {p.proofImage ? (
                                    <button
                                      onClick={() => setViewingProofImg(p.proofImage)}
                                      className="text-[10px] font-black uppercase text-indigo-400 hover:text-indigo-300 cursor-pointer hover:underline inline-flex items-center gap-1"
                                    >
                                      <ImageIcon className="w-3.5 h-3.5" /> Ver Captura
                                    </button>
                                  ) : (
                                    <span className="text-gray-600 text-[10px]">Sin Imagen</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        ) : activeAdminTab === 'payments' ? (
          <div className="bg-gray-900/30 border border-gray-800 rounded-3xl p-6 backdrop-blur-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-900 pb-4">
              <div>
                <h3 className="font-extrabold text-white text-base">Validación de Transferencias Bancarias</h3>
                <p className="text-[11px] text-gray-500 font-medium font-sans">Revisa las capturas de transferencias reportadas por los vendedores, confirma su validez en tu cuenta real de Bancolombia y aprueba para activar su plan correspondiente.</p>
              </div>
            </div>

            {allPayments.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-xs font-semibold">
                No se han cargado comprobantes de transferencias bancarias en la plataforma aún.
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800 text-[10px] text-gray-450 uppercase font-black tracking-widest bg-gray-900/15">
                      <th className="py-4 px-4">Vendedor / Tienda</th>
                      <th className="py-2.5 px-4">Detalle Plan</th>
                      <th className="py-2.5 px-4">Monto Reportado</th>
                      <th className="py-2.5 px-4 text-center">Fianza Capture</th>
                      <th className="py-2.5 px-4">Fecha</th>
                      <th className="py-2.5 px-4 text-right">Acciones de Verificación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-850 text-sm">
                    {allPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-900/10 transition">
                        <td className="py-4 px-4">
                          <div className="font-bold text-white">@{p.username}</div>
                          <div className="text-[10px] text-gray-500 font-semibold">{p.storeName}</div>
                          <div className="text-[9px] text-gray-550 font-mono">{p.userEmail}</div>
                        </td>
                        <td className="py-4 px-4 font-semibold">
                          <span className="text-xs uppercase font-black text-indigo-400 block">{p.plan}</span>
                          <span className="text-[10px] text-gray-400 italic">Suscripción Mensual</span>
                        </td>
                        <td className="py-4 px-4 font-mono font-bold text-white">
                          ${p.amount.toLocaleString()} COP
                        </td>
                        <td className="py-4 px-4 text-center">
                          {p.proofImage ? (
                            <button
                              type="button"
                              onClick={() => setViewingProofImg(p.proofImage)}
                              className="px-2.5 py-1.5 bg-gray-950 hover:bg-gray-900 border border-gray-800 rounded-lg text-[10.5px] font-black text-gray-450 hover:text-white transition flex items-center gap-1.5 mx-auto"
                            >
                              <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                              Ver capture
                            </button>
                          ) : (
                            <span className="text-gray-600 text-xs italic">Sin imagen</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-gray-500 text-[10.5px] font-medium font-mono">
                          {new Date(p.createdAt).toLocaleString()}
                        </td>
                        <td className="py-4 px-4 text-right">
                          {p.status === 'review' ? (
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={() => handleApprovePayment(p)}
                                className="px-3 h-8 bg-emerald-555 hover:bg-emerald-400 text-black font-extrabold text-xs rounded-xl flex items-center gap-1 transition shadow-md bg-emerald-450"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                Aprobar Pago
                              </button>
                              <button
                                onClick={() => handleRejectPayment(p)}
                                className="px-3 h-8 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold rounded-xl flex items-center gap-1 transition"
                              >
                                <X className="w-3.5 h-3.5 stroke-[2.5]" />
                                Rechazar
                              </button>
                            </div>
                          ) : (
                            <span className={`px-2.5 py-1 text-[9px] font-black uppercase rounded ${
                              p.status === 'approved' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}>
                              {p.status === 'approved' ? 'APROBADO' : 'RECHAZADO'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-900/30 border border-gray-800 rounded-3xl p-6 backdrop-blur-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="font-extrabold text-white text-base">Cuentas de Usuarios Registrados</h3>
                <p className="text-[11px] text-gray-500 font-semibold">Consulte la base de datos de usuarios para suspender cuentas o actualizar planes.</p>
              </div>
              
              {/* Search filter input */}
              <div className="relative w-full md:max-w-xs">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-550">
                  <Search className="w-4 h-4" />
                </span>
                <input 
                  type="text" 
                  placeholder="Filtrar por @usuario o email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 py-2.5 pl-10 pr-4 rounded-xl text-xs font-semibold outline-none transition"
                />
              </div>
            </div>

            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-800 text-[10px] text-gray-450 uppercase font-black tracking-widest bg-gray-900/15">
                    <th className="py-4 px-4">Usuario</th>
                    <th className="py-4 px-4">Correo</th>
                    <th className="py-4 px-4">Plan Actual</th>
                    <th className="py-4 px-4 text-center">Estado</th>
                    <th className="py-4 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-850 text-sm">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-gray-500">
                        No se encontraron usuarios coincidentes.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.uid} className="hover:bg-gray-900/20 transition-colors">
                        <td className="py-4 px-4 font-bold text-emerald-300">
                          @{user.username}
                          {user.role === 'admin' && (
                            <span className="ml-2 bg-indigo-500/10 text-indigo-400 text-[9px] font-black uppercase px-1.5 py-0.5 rounded border border-indigo-500/15">Admin</span>
                          )}
                        </td>
                        <td className="py-4 px-4 font-semibold text-gray-300">{user.email}</td>
                        <td className="py-4 px-4">
                          <select 
                            value={user.subscriptionPlan || 'basico'}
                            onChange={(e) => handlePlanUpgrade(user, e.target.value as any)}
                            className="bg-gray-950 border border-gray-850 rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:border-emerald-500 cursor-pointer text-gray-300 animate-none"
                          >
                            <option value="basico">Básico ($39.000) / 30 prod.</option>
                            <option value="medio">Medio ($49.000) / 60 prod.</option>
                            <option value="pro">Avanzado ($69.000) / 100 prod.</option>
                          </select>
                        </td>
                        <td className="py-4 px-4 text-center">
                          {user.suspended ? (
                            <span className="bg-red-500/10 text-red-500 inline-flex items-center gap-1 text-[10px] uppercase font-black px-2 py-0.5 rounded border border-red-500/15">
                              <AlertTriangle className="w-3 h-3" /> Suspendido
                            </span>
                          ) : (
                            <span className="bg-emerald-500/10 text-emerald-400 inline-flex items-center gap-1 text-[10px] uppercase font-black px-2 py-0.5 rounded border border-emerald-500/15">
                              Activo
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button 
                            onClick={() => handleToggleSuspension(user)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ml-auto cursor-pointer ${
                              user.suspended 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20' 
                              : 'bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20'
                            }`}
                          >
                            {user.suspended ? (
                              <>
                                <Unlock className="w-3 h-3" /> Reactivar
                              </>
                            ) : (
                              <>
                                <Lock className="w-3 h-3" /> Suspender
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* High resolution Proof Image Modal Overlay */}
        {viewingProofImg && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in text-center">
            <div className="relative max-w-2xl w-full bg-gray-950 border border-gray-850 p-4 rounded-3xl flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b border-gray-900 pb-2">
                <span className="text-xs font-black uppercase text-indigo-400 tracking-wider">Comprobante de Transferencia Reportado</span>
                <button
                  type="button"
                  onClick={() => setViewingProofImg(null)}
                  className="p-1 px-2.5 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg text-xs font-bold transition font-mono"
                >
                  ESC • Cerrar
                </button>
              </div>
              <div className="max-h-[75vh] min-h-[40vh] overflow-auto flex items-center justify-center bg-[#070b14] rounded-xl border border-gray-900">
                <img 
                  src={viewingProofImg} 
                  alt="Proof Document"
                  referrerPolicy="no-referrer"
                  className="max-h-[70vh] object-contain mx-auto" 
                />
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
