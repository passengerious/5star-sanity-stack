/**
 * Canonical Data Access Layer Resolver (Single Normalization Boundary)
 * Architecture Standard: ADR 0007 / 5-Star Sanity Stack
 *
 * Responsibilities:
 * 1. Fetch live content from Sanity Content Lake with on-demand ISR tags.
 * 2. Enforce Empty-Collection & Error Circuit Breaker (never crash the page).
 * 3. Perform 100% of field-level merging & fallback normalization.
 * 4. Staged Migration Union: Keep unmigrated code records active alongside live CMS items.
 * 5. Deliver fully normalized, render-ready props to pure presentation UI components.
 */

import { client } from './client'; // Sanity client instance
import { FALLBACK_SERVICES, FALLBACK_SERVICE_MAP } from '@/data/services';
import type { ServiceItem, NormalizedServiceItem } from '@/types';

/**
 * Normalizes a raw Sanity or fallback entity into a strictly typed,
 * render-ready domain contract for presentation components.
 */
function normalizeService(
  raw: any,
  fallback?: ServiceItem
): NormalizedServiceItem {
  return {
    id: raw.slug?.current || raw.id || fallback?.id || '',
    slug: raw.slug?.current || raw.slug || fallback?.slug || '',
    name: raw.name || fallback?.name || 'Service Package',
    category: raw.category || fallback?.category || 'general',
    price: typeof raw.price === 'number' ? raw.price : fallback?.price || 0,
    priceNote: raw.priceNote || fallback?.priceNote || undefined,
    duration: raw.duration || fallback?.duration || '30 min',
    
    // Field Semantic Separation (ADR 0007):
    // Never overload a single field for distinct visual surfaces!
    cardDescription: raw.cardDescription || fallback?.cardDescription || raw.description || '',
    heroSubtitle: raw.heroSubtitle || fallback?.heroSubtitle || '',
    
    // Relations & Specialist assignments normalized to simple short strings/arrays
    assignedSpecialistName: raw.assignedSpecialist?.name || fallback?.assignedSpecialistName || '',
    assignedSpecialistSlugs: Array.isArray(raw.assignedSpecialists)
      ? raw.assignedSpecialists.map((d: any) => d.slug?.current || d.slug || d)
      : fallback?.assignedSpecialistSlugs || [],

    isActive: raw.isActive !== false,
    order: typeof raw.order === 'number' ? raw.order : fallback?.order ?? 99,
  };
}

/**
 * Primary Getter: getServices()
 * Demonstrates the canonical Dual-Tier normalization pattern.
 */
export async function getServices(): Promise<NormalizedServiceItem[]> {
  try {
    const sanityServices = await client.fetch<any[]>(
      `*[_type == "service" && isActive != false] | order(coalesce(order, 999) asc, _createdAt asc) {
        _id,
        name,
        "slug": slug.current,
        category,
        price,
        priceNote,
        duration,
        cardDescription,
        heroSubtitle,
        isActive,
        order,
        assignedSpecialist->{
          name,
          "slug": slug.current
        },
        assignedSpecialists[]->{
          name,
          "slug": slug.current
        }
      }`,
      {},
      {
        next: {
          revalidate: process.env.NODE_ENV === 'development' ? 0 : 60,
          tags: ['service'],
        },
      }
    );

    // Defense 1: If Sanity returns an array with published items
    if (Array.isArray(sanityServices) && sanityServices.length > 0) {
      const sanitySlugs = new Set(sanityServices.map((s) => s.slug));

      // 1. Normalize live CMS documents
      const normalizedLive = sanityServices.map((liveDoc) => {
        const fallback = FALLBACK_SERVICE_MAP[liveDoc.slug];
        return normalizeService(liveDoc, fallback);
      });

      // 2. Staged Migration Union (Optional):
      // Retain canonical services defined in code that are not yet migrated to Sanity Cloud
      const unmigratedStatic = FALLBACK_SERVICES
        .filter((fb) => !sanitySlugs.has(fb.slug) && fb.isActive !== false)
        .map((fb) => normalizeService(fb));

      return [...normalizedLive, ...unmigratedStatic].sort((a, b) => a.order - b.order);
    }

    // Defense 2: Empty collection returned by CMS -> Gracefully fallback to static dataset
    console.warn('[Data Layer] Sanity returned 0 services. Falling back to static data.');
    return FALLBACK_SERVICES.map((fb) => normalizeService(fb));
  } catch (error) {
    // Defense 3: Network / Timeout / Offline circuit breaker
    console.error('[Data Layer] Error fetching services from Sanity. Circuit breaker engaged:', error);
    return FALLBACK_SERVICES.map((fb) => normalizeService(fb));
  }
}
