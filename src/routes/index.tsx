import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Flame, MapPin, UtensilsCrossed } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import heroBiryani from "@/assets/hero-biryani.jpg";
import heroChinese from "@/assets/hero-chinese.jpg";
import heroArabian from "@/assets/hero-arabian.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Denmark Restaurant — Chinese & Arabian Non-Veg, Tamil Nadu" },
      { name: "description", content: "Authentic non-vegetarian Chinese and Arabian cuisine across 3 branches in Tamil Nadu. Order online for dine-in or delivery." },
      { property: "og:title", content: "Denmark Restaurant" },
      { property: "og:description", content: "Authentic non-veg Chinese & Arabian cuisine in Tamil Nadu. Order online." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const slides = [
  { img: heroBiryani, kicker: "Welcome to", title: "DENMARK RESTAURANT", text: "Authentic non-vegetarian flavours, slow-cooked with Tamil Nadu soul." },
  { img: heroChinese, kicker: "From the wok", title: "Fiery Indo-Chinese", text: "Dragon prawns, chilli chicken and schezwan noodles tossed over roaring flames." },
  { img: heroArabian, kicker: "From the Arabian coast", title: "Mandi, Al Faham & Shawarma", text: "Charcoal grills and fragrant rice platters, served the traditional way." },
];

function Index() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [i]);
  const go = (d: number) => setI((v) => (v + d + slides.length) % slides.length);

  return (
    <div className="min-h-screen">
      <section className="relative h-[100svh] min-h-[600px] overflow-hidden bg-ink">
        <SiteHeader transparent />
        {slides.map((s, idx) => (
          <div
            key={idx}
            className={`absolute inset-0 transition-opacity duration-1000 ${idx === i ? "opacity-100" : "opacity-0"}`}
            aria-hidden={idx !== i}
          >
            <img
              src={s.img}
              alt={s.title}
              width={1600}
              height={1008}
              className={`h-full w-full object-cover ${idx === i ? "animate-kenburns" : ""}`}
            />
            <div className="absolute inset-0 bg-hero-overlay" />
          </div>
        ))}
        <div className="relative z-10 mx-auto flex h-full max-w-7xl items-center px-6">
          <div key={i} className="max-w-2xl text-ink-foreground">
            <p className="animate-rise text-sm font-semibold uppercase tracking-[0.4em] text-gold">{slides[i].kicker}</p>
            <h1
              className="animate-rise mt-4 text-5xl font-bold leading-[1.05] md:text-7xl"
              style={{ animationDelay: "120ms" }}
            >
              {slides[i].title}
            </h1>
            <p className="animate-rise mt-6 max-w-lg text-lg opacity-85" style={{ animationDelay: "240ms" }}>
              {slides[i].text}
            </p>
            <div className="animate-rise mt-10 flex gap-4" style={{ animationDelay: "360ms" }}>
              <Link to="/menu" className="rounded-full bg-primary px-8 py-4 font-semibold text-primary-foreground shadow-soft transition hover:brightness-110">
                View menu & order
              </Link>
            </div>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-10 z-10 mx-auto flex max-w-7xl items-center justify-between px-6 text-ink-foreground">
          <div className="flex gap-2">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setI(idx)}
                aria-label={`Slide ${idx + 1}`}
                className={`h-1.5 rounded-full transition-all ${idx === i ? "w-12 bg-gold" : "w-6 bg-ink-foreground/40"}`}
              />
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => go(-1)} aria-label="Previous" className="rounded-full border border-ink-foreground/40 p-3 hover:bg-ink-foreground/10"><ChevronLeft className="h-5 w-5" /></button>
            <button onClick={() => go(1)} aria-label="Next" className="rounded-full border border-ink-foreground/40 p-3 hover:bg-ink-foreground/10"><ChevronRight className="h-5 w-5" /></button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-24 md:grid-cols-3">
        {[
          { icon: Flame, t: "Chinese", d: "Wok-fired starters, noodles and gravies with bold Indo-Chinese spice." },
          { icon: UtensilsCrossed, t: "Arabian", d: "Mandi, kabsa, al faham and shawarma straight off the charcoal." },
          { icon: MapPin, t: "Tamil Nadu", d: "Dum biryani and Chettinad specials made the way home tastes." },
        ].map(({ icon: Icon, t, d }) => (
          <div key={t} className="rounded-2xl border bg-card p-8 shadow-soft">
            <Icon className="h-8 w-8 text-primary" />
            <h3 className="mt-6 text-3xl font-bold">{t}</h3>
            <p className="mt-3 text-muted-foreground">{d}</p>
          </div>
        ))}
      </section>

      <section className="bg-secondary py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 md:grid-cols-2">
          <img src={heroArabian} alt="Arabian mandi platter" loading="lazy" width={1600} height={1008} className="rounded-2xl shadow-soft" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.4em] text-primary">Order in minutes</p>
            <h2 className="mt-4 text-5xl font-bold">Over 100 dishes. Three branches. One kitchen standard.</h2>
            <p className="mt-6 text-muted-foreground">
              Pick your branch, add your favourites, tell us your table — and choose dine in or delivery. Your order lands
              straight on the kitchen screen.
            </p>
            <Link to="/menu" className="mt-8 inline-block rounded-full bg-primary px-8 py-4 font-semibold text-primary-foreground shadow-soft">
              Start your order
            </Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
