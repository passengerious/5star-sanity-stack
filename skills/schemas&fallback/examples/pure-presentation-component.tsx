/**
 * Pure Presentation Component Example (ADR 0007 Standard)
 *
 * Anti-Pattern Prohibitions:
 * ❌ NEVER declare static fallback datasets (e.g., const CLINICAL_DIRECTIONS = [...]) inside .tsx files.
 * ❌ NEVER perform inline fallback chaining (e.g., item.title || fallbackData.title) in JSX.
 * ❌ In-component fallbacks cause stale upstream CMS records to silently shadow fresh code updates!
 *
 * Enforced Architecture:
 * ✅ Component is 100% pure presentation. It receives normalized props directly from the page/data layer.
 * ✅ Styling dictionaries (icons, colors, badges) contain visual tokens ONLY, never domain text copy.
 */

import React from 'react';
import Link from 'next/link';
import { Stethoscope, Sparkles, ArrowRight, type LucideIcon } from 'lucide-react';
import type { NormalizedServiceItem } from '@/types';

interface ServiceGridProps {
  /** Normalized items provided exclusively by getServices() or Server Component */
  services: NormalizedServiceItem[];
  title?: string;
  subtitle?: string;
}

/** Visual styling tokens ONLY — Zero domain text or fallback copies! */
const CATEGORY_VISUALS: Record<string, { icon: LucideIcon; badgeClass: string; cardClass: string }> = {
  consultation: {
    icon: Stethoscope,
    badgeClass: 'bg-emerald-100 text-emerald-800',
    cardClass: 'border-emerald-200/80 hover:border-emerald-500 bg-emerald-50/20',
  },
  diagnostic: {
    icon: Sparkles,
    badgeClass: 'bg-amber-100 text-amber-800',
    cardClass: 'border-amber-200/80 hover:border-amber-500 bg-amber-50/20',
  },
};

const DEFAULT_VISUAL = {
  icon: Stethoscope,
  badgeClass: 'bg-slate-100 text-slate-800',
  cardClass: 'border-slate-200 hover:border-slate-400 bg-white',
};

export const ServiceGrid: React.FC<ServiceGridProps> = ({
  services,
  title = 'Послуги медичного простору',
  subtitle = 'Усі прийоми та дослідження проводяться за міжнародними доказовими протоколами.',
}) => {
  return (
    <section className="py-12 space-y-8">
      <div className="max-w-3xl">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-heading-ink tracking-tight font-display">
          {title}
        </h2>
        <p className="text-sm sm:text-base text-text-muted mt-2">
          {subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {services.map((service) => {
          const visual = CATEGORY_VISUALS[service.category] || DEFAULT_VISUAL;
          const IconComponent = visual.icon;

          return (
            <Link
              key={service.slug}
              href={`/services/${service.slug}`}
              className={`p-6 rounded-3xl border transition-all duration-300 flex flex-col justify-between hover:shadow-lg hover:-translate-y-1 group ${visual.cardClass}`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${visual.badgeClass}`}>
                    {service.category}
                  </span>
                  <div className="p-2 rounded-xl bg-white/80 shadow-xs text-primary">
                    <IconComponent className="w-5 h-5" />
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-heading-ink group-hover:text-primary transition-colors">
                    {service.name}
                  </h3>
                  {/* Clean presentation of normalized cardDescription — no inline fallback chaining! */}
                  {service.cardDescription && (
                    <p className="text-xs sm:text-sm text-text-muted mt-2 line-clamp-3 leading-relaxed">
                      {service.cardDescription}
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-border-whisper flex items-center justify-between text-xs">
                <div>
                  <span className="font-extrabold text-base text-heading-ink">
                    {service.price} грн
                  </span>
                  {service.priceNote && (
                    <span className="text-text-subtle ml-1">({service.priceNote})</span>
                  )}
                </div>
                <span className="font-bold text-primary inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  Детальніше <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
};
