import { BadgePercent, X } from "lucide-react";
import { useCart } from "@/contexts/CartContext";

/** Slim strip shown under the storefront header while a trade session is active. */
const TradeBanner = () => {
  const { tradeSession, signOutTrade } = useCart();
  if (!tradeSession) return null;
  return (
    <div className="bg-accent text-accent-foreground text-xs" role="status">
      <div className="container mx-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 px-4 py-1.5 sm:justify-between">
        <p className="flex items-center gap-1.5">
          <BadgePercent className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Trade pricing active for</span>
          <span className="font-bold">{tradeSession.companyName}</span>
          <span className="hidden text-accent-foreground/80 md:inline">· signed in as {tradeSession.contactName}</span>
        </p>
        <button
          type="button"
          onClick={signOutTrade}
          aria-label="Sign out of trade pricing"
          className="flex items-center gap-1 underline underline-offset-2 transition hover:text-accent-foreground/85"
        >
          Sign out<X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
};

export default TradeBanner;
