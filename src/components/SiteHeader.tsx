import { Link } from "@tanstack/react-router";

export function SiteHeader({ transparent = false }: { transparent?: boolean }) {
  return (
    <header
      className={
        transparent
          ? "absolute inset-x-0 top-0 z-30 text-ink-foreground"
          : "sticky top-0 z-30 border-b bg-background/90 text-foreground backdrop-blur"
      }
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex flex-col leading-none">
          <span className="font-display text-2xl font-bold tracking-[0.18em]">DENMARK</span>
          <span className="text-[10px] tracking-[0.5em] opacity-80">RESTAURANT</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium">
          <Link to="/" className="hidden opacity-80 hover:opacity-100 sm:inline">Home</Link>
          <Link to="/menu" className="opacity-80 hover:opacity-100">Menu</Link>
          <Link to="/owner" className="opacity-80 hover:opacity-100">Owner</Link>
          <Link
            to="/menu"
            className="rounded-full bg-primary px-5 py-2 text-primary-foreground shadow-soft transition hover:brightness-110"
          >
            Order now
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t bg-ink text-ink-foreground">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 md:grid-cols-3">
        <div>
          <p className="font-display text-2xl font-bold tracking-[0.18em]">DENMARK</p>
          <p className="text-xs tracking-[0.5em] opacity-70">RESTAURANT</p>
          <p className="mt-4 max-w-xs text-sm opacity-70">
            Authentic non-vegetarian Chinese & Arabian kitchen, crafted for Tamil Nadu.
          </p>
        </div>
        <div className="text-sm opacity-80">
          <p className="mb-2 font-semibold uppercase tracking-widest text-gold">Hours</p>
          <p>Every day · 11:30 AM – 11:30 PM</p>
        </div>
        <div className="text-sm opacity-80">
          <p className="mb-2 font-semibold uppercase tracking-widest text-gold">Branches</p>
          <p>Chennai · Madurai · Coimbatore</p>
        </div>
      </div>
      <p className="border-t border-ink-foreground/10 py-4 text-center text-xs opacity-60">
        © {new Date().getFullYear()} Denmark Restaurant
      </p>
    </footer>
  );
}
