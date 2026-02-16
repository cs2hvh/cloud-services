import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getRatesForDatabase,
  getRatesForKubernetesExisting,
  getRatesForObjectStorage,
  getRatesForSpectrum,
  getRatesForPlatformApp,
  getAllPlatformAppRates,
} from '@/config/pricing';

vi.mock('@/lib/supabase/queries/products');

describe('config/pricing', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  async function mockProducts() {
    const { Products } = await import('@/lib/supabase/queries/products');
    return Products;
  }

  // ============================================
  // getRatesForDatabase
  // ============================================
  describe('getRatesForDatabase', () => {
    it('should return rates for a valid plan', async () => {
      const Products = await mockProducts();
      vi.mocked(Products.get_by_id).mockResolvedValue({
        price: 72, // $72/month
        fixed_price: 5,
      } as any);

      const rates = await getRatesForDatabase('plan-1');
      expect(rates.initialCost).toBe(5);
      expect(rates.hourlyRate).toBe(Number((72 / 720).toFixed(6)));
      expect(Products.get_by_id).toHaveBeenCalledWith('plan-1');
    });

    it('should return zero rates when product is null', async () => {
      const Products = await mockProducts();
      vi.mocked(Products.get_by_id).mockResolvedValue(null as any);

      const rates = await getRatesForDatabase('nonexistent');
      expect(rates.initialCost).toBe(0);
      expect(rates.hourlyRate).toBe(0);
    });

    it('should handle product with null price', async () => {
      const Products = await mockProducts();
      vi.mocked(Products.get_by_id).mockResolvedValue({
        price: null,
        fixed_price: null,
      } as any);

      const rates = await getRatesForDatabase('plan-null');
      expect(rates.initialCost).toBe(0);
      expect(rates.hourlyRate).toBe(0);
    });
  });

  // ============================================
  // getRatesForKubernetesExisting
  // ============================================
  describe('getRatesForKubernetesExisting', () => {
    it('should return rates for a valid Kubernetes plan', async () => {
      const Products = await mockProducts();
      vi.mocked(Products.get_by_id).mockResolvedValue({
        price: 144,
        fixed_price: 10,
      } as any);

      const rates = await getRatesForKubernetesExisting('k8s-plan');
      expect(rates.initialCost).toBe(10);
      expect(rates.hourlyRate).toBe(Number((144 / 720).toFixed(6)));
    });
  });

  // ============================================
  // getRatesForObjectStorage
  // ============================================
  describe('getRatesForObjectStorage', () => {
    it('should return rates from first object-storage product', async () => {
      const Products = await mockProducts();
      vi.mocked(Products.get_by_type).mockResolvedValue([
        { price: 36, fixed_price: 0 },
      ] as any);

      const rates = await getRatesForObjectStorage();
      expect(rates.hourlyRate).toBe(Number((36 / 720).toFixed(6)));
      expect(Products.get_by_type).toHaveBeenCalledWith('object-storage');
    });

    it('should return zero when no products exist', async () => {
      const Products = await mockProducts();
      vi.mocked(Products.get_by_type).mockResolvedValue([] as any);

      const rates = await getRatesForObjectStorage();
      expect(rates.initialCost).toBe(0);
      expect(rates.hourlyRate).toBe(0);
    });
  });

  // ============================================
  // getRatesForSpectrum
  // ============================================
  describe('getRatesForSpectrum', () => {
    it('should return rates from first network-ddos product', async () => {
      const Products = await mockProducts();
      vi.mocked(Products.get_by_type).mockResolvedValue([
        { price: 50, fixed_price: 2 },
      ] as any);

      const rates = await getRatesForSpectrum();
      expect(rates.initialCost).toBe(2);
      expect(rates.hourlyRate).toBe(Number((50 / 720).toFixed(6)));
      expect(Products.get_by_type).toHaveBeenCalledWith('network-ddos');
    });
  });

  // ============================================
  // getRatesForPlatformApp
  // ============================================
  describe('getRatesForPlatformApp', () => {
    it('should return rates for small size', async () => {
      const Products = await mockProducts();
      vi.mocked(Products.get_by_type_and_subtype).mockResolvedValue([
        { price: 12, fixed_price: 0 },
      ] as any);

      const rates = await getRatesForPlatformApp('small');
      expect(rates.hourlyRate).toBe(Number((12 / 720).toFixed(6)));
      expect(Products.get_by_type_and_subtype).toHaveBeenCalledWith('platform-apps', 'small');
    });

    it('should return rates for large size', async () => {
      const Products = await mockProducts();
      vi.mocked(Products.get_by_type_and_subtype).mockResolvedValue([
        { price: 96, fixed_price: 5 },
      ] as any);

      const rates = await getRatesForPlatformApp('large');
      expect(rates.initialCost).toBe(5);
      expect(rates.hourlyRate).toBe(Number((96 / 720).toFixed(6)));
    });

    it('should handle missing product for size', async () => {
      const Products = await mockProducts();
      vi.mocked(Products.get_by_type_and_subtype).mockResolvedValue([] as any);

      const rates = await getRatesForPlatformApp('medium');
      expect(rates.initialCost).toBe(0);
      expect(rates.hourlyRate).toBe(0);
    });
  });

  // ============================================
  // getAllPlatformAppRates
  // ============================================
  describe('getAllPlatformAppRates', () => {
    it('should return rates for all sizes', async () => {
      const Products = await mockProducts();
      vi.mocked(Products.get_by_type).mockResolvedValue([
        { sub: 'small', price: 12, fixed_price: 0 },
        { sub: 'medium', price: 48, fixed_price: 0 },
        { sub: 'large', price: 96, fixed_price: 5 },
      ] as any);

      const rates = await getAllPlatformAppRates();

      expect(rates.small).toBeDefined();
      expect(rates.medium).toBeDefined();
      expect(rates.large).toBeDefined();
      expect(rates.small.price).toBe(12);
      expect(rates.large.initialCost).toBe(5);
      expect(rates.medium.hourlyRate).toBe(Number((48 / 720).toFixed(6)));
    });

    it('should handle empty products array', async () => {
      const Products = await mockProducts();
      vi.mocked(Products.get_by_type).mockResolvedValue([] as any);

      const rates = await getAllPlatformAppRates();

      expect(rates.small.initialCost).toBe(0);
      expect(rates.small.hourlyRate).toBe(0);
      expect(rates.small.price).toBe(0);
    });
  });
});
