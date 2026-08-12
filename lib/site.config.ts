// Site-wide copy and settings for smolboard's own marketing surfaces.
//
// Colors live here (applied as CSS variables on <html> in app/layout.tsx), so
// you don't touch globals.css to re-theme the marketing pages.
//
// The landing page owns its own copy in app/(marketing)/page.tsx, so this file
// is deliberately small: brand identity, theme colors, SEO strings, and the two
// legal pages the signup form links to.

/* ----------------------------- types ----------------------------- */

export type ContentSection = { title: string; body: string };

export interface SitePage {
  slug: string;
  navLabel: string;
  eyebrow: string;
  title: string;
  summary: string;
  sections: ContentSection[];
}

export interface SiteConfig {
  brand: {
    name: string;
    letter: string;
    domain: string;
    email: string;
    footerBlurb: string;
    copyrightName: string;
    socials: { label: string; href: string; path: string }[];
  };
  colors: { brand: string; brandSoft: string; paper: string };
  seo: { title: string; description: string };
  company: SitePage[];
}

/* ------------------------------ data ----------------------------- */

export const siteConfig: SiteConfig = {
  brand: {
    name: "smolboard",
    letter: "s",
    domain: "www.smolboard.app",
    email: "hello@smolboard.dev",
    footerBlurb:
      "Open-source speaker & CFP management: forms, reviews, agenda, speaker portal, and an event copilot in one process.",
    copyrightName: "smolboard",
    socials: [
      {
        label: "X",
        href: "https://x.com/swyx",
        path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
      },
      {
        label: "GitHub",
        href: "https://github.com/CampbellVentures/smolboard",
        path: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
      },
    ],
  },

  colors: { brand: "#1a1a1a", brandSoft: "#f4f4f5", paper: "#fafafa" },

  seo: {
    title: "smolboard: open-source speaker & CFP management",
    description:
      "Run your call for speakers, reviews, agenda, and speaker onboarding from one open-source app. Conditional CFP forms, real calendar invites, a drag-and-drop agenda with conflict detection, and an event copilot with MCP.",
  },

  // Only the two pages the product actually links to (the signup form points
  // here). smolboard is open source and self-hostable, so these describe the
  // hosted instance at smolboard.app; a self-hosted copy sets its own terms.
  company: [
    {
      slug: "terms",
      navLabel: "Terms",
      eyebrow: "Legal",
      title: "Terms of use.",
      summary: "The rules for using the hosted smolboard at smolboard.app.",
      sections: [
        {
          title: "What this covers",
          body: "These terms cover smolboard.app, the instance we host. The software itself is open source under the MIT license, and if you run your own copy, none of this applies to it.",
        },
        {
          title: "Using it",
          body: "Run your events, invite your speakers, and publish your schedule. Do not use it to break the law, to send mail people did not ask for, or to interfere with anyone else's events.",
        },
        {
          title: "Your data is yours",
          body: "Your events, submissions, and speaker records belong to you. We store and process them only to run the product for you. Export or delete them whenever you want.",
        },
        {
          title: "No warranty",
          body: "The hosted instance is provided as is, without warranty. It is free, and we cannot promise it will never lose data or go down. For anything you cannot afford to lose, keep your own export or run your own instance.",
        },
        {
          title: "Ending it",
          body: "You can delete your workspace at any time. We may suspend an account that breaks these terms, and we will tell you why.",
        },
      ],
    },
    {
      slug: "privacy",
      navLabel: "Privacy",
      eyebrow: "Legal",
      title: "Privacy.",
      summary: "What smolboard.app stores, and what it does not.",
      sections: [
        {
          title: "What we store",
          body: "The account you create (email and name), the event data you enter, and files your speakers upload. Speakers who submit a talk get an account holding their submission, profile, and uploads.",
        },
        {
          title: "Analytics",
          body: "We measure our own marketing, sign-in, and dashboard pages with Revtrail, which is cookieless and stores no visitor identifier in your browser. Public event pages and embedded widgets carry no analytics at all, so your attendees are not tracked by us.",
        },
        {
          title: "Email",
          body: "We send the mail the product needs to work: sign-in codes, submission confirmations, decisions, and reminders you configure. We do not sell or rent addresses, and we do not market to your speakers.",
        },
        {
          title: "Your control",
          body: "Export or delete your data at any time from Settings. Deleting a workspace removes its events, submissions, and uploads.",
        },
        {
          title: "Self-hosting",
          body: "Run your own instance and none of your data reaches us. That is the whole point of the project being open source.",
        },
      ],
    },
  ],
};

/* ------------------------- helpers ------------------------------- */

export const COMPANY = siteConfig.company;

export function bySlug<T extends { slug: string }>(
  list: T[],
  slug: string,
): T | undefined {
  return list.find((x) => x.slug === slug);
}
