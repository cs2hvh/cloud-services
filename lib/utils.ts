import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import crypto from "crypto"
import { v4 as uuidv4 } from 'uuid';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateSixDigitOtp(): string {
  // Generate a random integer in [0, 999999]
  // Then pad it to 6 digits if it’s shorter.
  const randInt = crypto.randomInt(0, 1_000_000) // up to 999999
  return randInt.toString().padStart(6, '0')     // always 6 digits
}

export function formatPrice(
  price: number | string,
  options: {
    currency?: 'USD' | 'EUR' | 'GBP' | 'BDT'
    notation?: Intl.NumberFormatOptions['notation']
  } = {}
) {
  const { currency = 'USD', notation = 'compact' } = options

  const numericPrice =
    typeof price === 'string' ? parseFloat(price) : price

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation,
    maximumFractionDigits: 2,
  }).format(numericPrice)
}

export const formatDate = (dateString: string) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const getDaysRemaining = (endDate: Date) => {
  if (!endDate) return 'N/A';
  const end = new Date(endDate).getTime();
  const now = new Date().getTime();
  const daysRemaining = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return daysRemaining > 0 ? `${daysRemaining} days` : 'Expired';
};

export function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const secondsDiff = (now.getTime() - date.getTime()) / 1000;
  if (secondsDiff < 5) return "just now";
  if (secondsDiff < 60) return `${Math.floor(secondsDiff)} seconds ago`;
  if (secondsDiff < 3600) return `${Math.floor(secondsDiff / 60)} minutes ago`;
  if (secondsDiff < 86400) return `${Math.floor(secondsDiff / 3600)} hours ago`;
  return `${Math.floor(secondsDiff / 86400)} days ago`;
}

export function getRandomPort(existingPorts: number[]): number {
  let port;
  do {
    port = Math.floor(Math.random() * (4000 - 3000 + 1)) + 3000; // Generates a port between 3000 and 4000
  } while (existingPorts.includes(port)); // Keep generating until a unique port is found
  return port;
}

export const generateRandomUuid = (): string => {
  return uuidv4();
};
