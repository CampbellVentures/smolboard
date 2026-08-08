import React from "react";
import { Link, type Metadata, type PageProps } from "@pylonsync/react";
import {
  WRAP,
  Badge,
  Divider,
  Eyebrow,
  SectionHead,
  FeatureGrid,
  PrimaryButton,
  GhostLink,
  Shot,
  Portrait,
  Terminal,
} from "@/components/marketing";
import { siteConfig, productBySlug, type Product } from "@/lib/site.config";

// SEO metadata. Exported `metadata` is rendered into <head> on the server, so
// this marketing page is fully indexable — view source and the copy is in the
// HTML. All copy lives in lib/site.config.ts; edit it there.
export const metadata: Metadata = {
  title: siteConfig.seo.title,
  description: siteConfig.seo.description,
};

// The products the homepage features inline. Each links to its own
// /products/[slug] page for the full story. (Defined once in lib/site.config.ts.)
const projects = productBySlug("projects")!;
const tasks = productBySlug("tasks")!;
const docs = productBySlug("docs")!;
const automations = productBySlug("automations")!;

// `app/page.tsx` → `/`. A server-rendered marketing landing page. It reads
// `auth` (resolved from the session cookie during the render) so the call to
// action is right on the first byte — "Get started" for visitors, "Open
// dashboard" once you're signed in. No client fetch, no flash. Every string is
// sourced from `siteConfig` so the whole page rebrands from one file.
export default function LandingPage({ auth }: PageProps) {
  const signedIn = Boolean(auth.user_id);
  const primaryHref = signedIn ? "/dashboard" : "/signup";
  const primaryLabel = signedIn ? "Open dashboard" : "Get started";

  const {
    hero,
    logoCloud,
    outcomes,
    featuredTestimonial,
    entryPoints,
    engagement,
    customers,
    gettingStarted,
    pricing,
    team,
    finalCta,
    faq,
    brand,
  } = siteConfig;

  return (
    <div className="bg-white text-zinc-900">
      {/* ============================ HERO ============================ */}
      <section className={`${WRAP} pt-20 pb-16 sm:pt-28`}>
        <Badge>{hero.badge}</Badge>
        <h1 className="mt-6 max-w-2xl text-balance text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[3.5rem]">
          {hero.headline}
        </h1>
        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-zinc-500">
          {hero.subcopy}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <PrimaryButton href={primaryHref}>{primaryLabel}</PrimaryButton>
          <GhostLink href="/#product">Take the tour →</GhostLink>
        </div>

        <div className="mt-16">
          <Shot url={`${brand.domain}/dashboard`} label={hero.mockupLabel} />
        </div>
      </section>

       
    </div>
  );
}

// A homepage feature section for one product: eyebrow + headline + grid +
// "Explore →" link to its /products/[slug] page + a product mockup.
function ProductSection({
  product,
  primaryHref,
  id,
}: {
  product: Product;
  primaryHref: string;
  id?: string;
}) {
  return (
    <section id={id} className={`${WRAP} py-20`}>
      <SectionHead
        eyebrow={product.eyebrow}
        arrow
        title={product.headline}
        body={product.summary}
      />
      <FeatureGrid className="mt-14" items={product.features.slice(0, 6)} />
      <div className="mt-8">
        <GhostLink href={`/products/${product.slug}`}>
          Explore {product.title} →
        </GhostLink>
      </div>
      <div className="mt-12">
        <Shot url={product.mockupUrl} label={product.mockupLabel} />
      </div>
    </section>
  );
}

// Initials for the testimonial avatars, so the cards look finished without a
// real photo. Drop in an <img> when you have one.
function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
