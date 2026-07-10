/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'user' | 'admin';
export type UserPlan = 'free' | 'pro' | 'business';

export interface UserProfile {
  uid: string;
  email: string;
  username: string; // Store Handle/Slug (e.g., "mi-tienda")
  displayName: string; // Store Name (e.g., "Boutique de Moda")
  bio: string; // Store Slogan/Description
  photoURL?: string; // Store Logo
  coverURL?: string; // Store Cover Banner
  role: UserRole;
  plan: UserPlan;
  createdAt: string;
  phone?: string;
  whatsapp?: string; // Store WhatsApp Number for orders
  location?: string;
  currency?: string; // Currency symbol/code (e.g., "$", "COP", "EUR", "MXN", "USD")
  suspended?: boolean;
  googleAnalyticsId?: string;
  whatsappMessageTemplate?: string; // Custom WhatsApp order message template
  // Subscription plans & status fields (COP pricing plans)
  subscriptionPlan?: 'basico' | 'medio' | 'pro';
  subscriptionStatus?: 'trial' | 'active' | 'pending_payment' | 'under_review';
  subscriptionStartDate?: string;
  subscriptionTrialExpires?: string;
  subscriptionPaidUntil?: string;
  layout?: 'default' | 'shoes' | 'tech' | 'food';
  coverTitle?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  youtube?: string;
  twitter?: string;
  linkedin?: string;
  isClosed?: boolean;
}

export interface SubscriptionPayment {
  id: string;
  userId: string;
  userEmail: string;
  username: string;
  storeName: string;
  plan: 'basico' | 'medio' | 'pro';
  amount: number;
  status: 'pending' | 'review' | 'approved' | 'rejected';
  proofImage?: string; // Base64 data URL string representing uploaded transfer receipt photo
  notes?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  periodLabel?: string; // e.g. "Mes de Junio 2026"
}

export interface ProductItem {
  id: string;
  userId: string; // Store Owner UID
  name: string;
  description: string;
  price: number;
  compareAtPrice?: number; // Original price for sales/discounts
  imageURL?: string; // Product photo URL
  category?: string; // e.g. "Ropa", "Calzado", "Accesorios"
  stock: number; // Inventory count
  variantsText?: string; // Comma separated variants like "S, M, L" or "Azul, Rojo"
  active: boolean;
  createdAt?: string;
}

export interface OrderItem {
  id: string;
  storeOwnerId: string;
  orderNumber: number; // Numeric sequential order number
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerAddress: string;
  paymentMethod: 'whatsapp' | 'transfer' | 'delivery_cash' | 'cod';
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  items: CartItem[];
  totalAmount: number;
  notes?: string;
  createdAt: string;
  proofImage?: string; // Base64 data URL representing uploaded payment receipt or purchase transaction photo
}

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  selectedVariant?: string;
  imageURL?: string;
}

export interface CustomTheme {
  id: string; // 'minimal' | 'midnight' | 'emerald' | 'pastel' | 'custom'
  name: string;
  bgType: 'flat' | 'gradient' | 'image';
  bgColor: string; // e.g., "#0f172a" or a gradient CSS
  textColor: string;
  cardBg: string; // Product card background
  cardBorder: string;
  cardTextColor: string;
  fontFamily: 'font-sans' | 'font-serif' | 'font-mono' | 'font-display';
  buttonStyle: 'rounded' | 'square' | 'pill' | 'shadow' | 'bordered';
  accentColor?: string; // Accent highlights for buttons/price tags
  isPremium?: boolean;
}

export interface StoreCategory {
  id: string;
  name: string;
}

export interface LinkItem {
  id: string;
  userId: string;
  title: string;
  url: string;
  icon?: string;
  active: boolean;
  order: number;
}

export interface SocialLinks {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  youtube?: string;
  twitter?: string;
  whatsapp?: string;
  [key: string]: string | undefined;
}

export interface LeadItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

export interface PageViewAnalytic {
  id?: string;
  userId: string;
  timestamp: string;
  referrer?: string;
  country?: string;
  city?: string;
  browser?: string;
  device?: string;
}

export interface ClickAnalytic {
  id?: string;
  userId: string;
  linkId: string;
  linkTitle: string;
  timestamp: string;
}
