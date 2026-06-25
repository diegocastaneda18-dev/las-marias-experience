import Link from "next/link";
import type { ReactNode } from "react";
import { brandAssets, brandName } from "../lib/brand";

export type ExperienceBrandVariant = "header" | "hero" | "footer" | "login" | "isotipo";

type ExperienceBrandProps = {
  variant?: ExperienceBrandVariant;
  href?: string;
  className?: string;
  showTagline?: boolean;
};

const variantConfig: Record<
  ExperienceBrandVariant,
  { className: string; width: number; height: number }
> = {
  header: {
    className: "h-9 w-auto max-w-[11rem] object-contain object-left sm:h-10 sm:max-w-[13rem]",
    width: 208,
    height: 40
  },
  hero: {
    className: "h-14 w-auto max-w-[16rem] object-contain sm:h-16 sm:max-w-[20rem]",
    width: 320,
    height: 64
  },
  footer: {
    className: "h-12 w-auto max-w-[14rem] object-contain sm:h-14 sm:max-w-[18rem]",
    width: 288,
    height: 56
  },
  login: {
    className: "h-14 w-auto max-w-[16rem] object-contain sm:h-16 sm:max-w-[18rem]",
    width: 288,
    height: 64
  },
  isotipo: {
    className: "h-9 w-9 object-contain sm:h-10 sm:w-10",
    width: 40,
    height: 40
  }
};

export function ExperienceBrand({
  variant = "header",
  href,
  className = "",
  showTagline = false
}: ExperienceBrandProps): ReactNode {
  const config = variantConfig[variant];

  const img = (
    <img
      src={brandAssets.logo}
      alt={brandName}
      className={config.className}
      width={config.width}
      height={config.height}
      decoding="async"
    />
  );

  const tagline =
    showTagline && variant !== "isotipo" ? (
      <p className="mt-3 max-w-xs text-center text-xs font-medium uppercase tracking-[0.22em] text-maria-ocean-light/90 sm:text-[11px]">
        Ecoturismo de lujo · Islas Marías · México
      </p>
    ) : null;

  const wrapperClass = [
    variant === "hero" || variant === "login"
      ? "flex flex-col items-center text-center"
      : variant === "isotipo"
        ? "inline-flex shrink-0"
        : "flex min-w-0 w-fit shrink-0 items-center",
    href
      ? "rounded-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-maria-ocean/40"
      : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {img}
      {tagline}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={wrapperClass}>
        {content}
      </Link>
    );
  }

  return <div className={wrapperClass}>{content}</div>;
}

export const LAS_MARIAS_LOGO_SRC = brandAssets.logo;

export function AppBrand(
  props: Omit<ExperienceBrandProps, "variant"> & { size?: "header" | "login"; showTitle?: boolean }
) {
  const { size = "header", showTitle, ...rest } = props;
  return (
    <ExperienceBrand
      variant={size === "login" ? "login" : "header"}
      showTagline={showTitle}
      {...rest}
    />
  );
}
