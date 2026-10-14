import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { Minus, Plus, ShoppingBag, Utensils, Bike, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menu & Online Order — Denmark Restaurant" },
      { name: "description", content: "Browse 100+ Chinese, Arabian and Tamil non-veg dishes and order for dine in or delivery." },
      { property: "og:title", content: "Menu — Denmark Restaurant" },
      { property: "og:description", content: "Order Chinese & Arabian non-veg dishes online for dine in or delivery." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MenuPage,
});

type Item = { id: string; name: string; category: string; cuisine: string; price: number; description: string; is_available: boolean };

const detailsSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  phone: z.string().trim().regex(/^\+?[0-9 ]{10,15}$/, "Enter a valid phone number"),
  table: z.string().trim().min(1, "Enter your table number").max(20),
});

const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`;

function MenuPage() {
  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").order("id");
      if (error) throw error;
      return data;
    },
  });
  const menu = useQuery({
    queryKey: ["menu"],
    queryFn: async () => {
      const { data, error } = await supabase.from("menu_items").select("*").order("sort_order");
      if (error) throw error;
      return data as Item[];
    },
  });

  const [branch, setBranch] = useState(1);
  const [cuisine, setCuisine] = useState("All");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"details" | "type" | "done">("details");
  const [details, setDetails] = useState({ name: "", phone: "", table: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [orderNo, setOrderNo] = useState<number | null>(null);

  const items = (menu.data ?? []).filter((m) => m.is_available);
  const cuisines = ["All", ...Array.from(new Set(items.map((m) => m.cuisine)))];
  const grouped = useMemo(() => {
    const g: Record<string, Item[]> = {};
    items.filter((m) => cuisine === "All" || m.cuisine === cuisine).forEach((m) => (g[m.category] ??= []).push(m));
    return g;
  }, [items, cuisine]);

  const lines = items.filter((m) => cart[m.id]).map((m) => ({ ...m, qty: cart[m.id] }));
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  const change = (id: string, d: number) =>
    setCart((c) => {
      const q = Math.max(0, Math.min(50, (c[id] ?? 0) + d));
      const n = { ...c };
      if (q === 0) delete n[id];
      else n[id] = q;
      return n;
    });

  const startCheckout = () => {
    if (!count) return toast.error("Add at least one dish");
    setStep("details");
    setOpen(true);
  };

  const submitDetails = () => {
    const r = detailsSchema.safeParse(details);
    if (!r.success) {
      const e: Record<string, string> = {};
      r.error.issues.forEach((i) => (e[String(i.path[0])] = i.message));
      return setErrors(e);
    }
    setErrors({});
    setStep("type");
  };

  const place = async (type: "dine_in" | "delivery") => {
    setSubmitting(true);
    const { data, error } = await supabase.rpc("place_order", {
      _branch_id: branch,
      _name: details.name.trim(),
      _phone: details.phone.trim(),
      _table: details.table.trim(),
      _type: type,
      _items: lines.map((l) => ({ id: l.id, qty: l.qty })),
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    setOrderNo(data as number);
    setStep("done");
    setCart({});
  };

  const branchName = branches.data?.find((b) => b.id === branch)?.name;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <section className="border-b bg-secondary">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-primary">Our menu</p>
          <h1 className="mt-3 text-5xl font-bold md:text-6xl">Order from Denmark Restaurant</h1>
          <div className="mt-8 flex flex-wrap gap-3">
            {(branches.data ?? []).map((b) => (
              <button
                key={b.id}
                onClick={() => setBranch(b.id)}
                className={`rounded-xl border px-5 py-3 text-left transition ${branch === b.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary"}`}
              >
                <span className="block text-sm font-semibold">{b.name}</span>
                <span className="block text-xs opacity-75">{b.address}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-10 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="sticky top-[73px] z-20 -mx-2 mb-6 flex gap-2 overflow-x-auto bg-background/95 px-2 py-3 backdrop-blur">
            {cuisines.map((c) => (
              <button
                key={c}
                onClick={() => setCuisine(c)}
                className={`whitespace-nowrap rounded-full px-5 py-2 text-sm font-medium transition ${cuisine === c ? "bg-ink text-ink-foreground" : "bg-muted hover:bg-accent"}`}
              >
                {c}
              </button>
            ))}
          </div>
          {menu.isLoading && <p className="text-muted-foreground">Loading menu…</p>}
          {menu.error && <p className="text-destructive">Could not load the menu. Please refresh.</p>}
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat} className="mb-12">
              <h2 className="mb-5 text-3xl font-bold">{cat}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4 transition hover:shadow-soft">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.cuisine}</p>
                      <p className="mt-1 font-semibold text-primary">{inr(m.price)}</p>
                    </div>
                    {cart[m.id] ? (
                      <div className="flex items-center gap-2 rounded-full bg-primary p-1 text-primary-foreground">
                        <button aria-label="Remove one" onClick={() => change(m.id, -1)} className="rounded-full p-1.5 hover:bg-primary-foreground/15"><Minus className="h-4 w-4" /></button>
                        <span className="w-5 text-center text-sm font-bold">{cart[m.id]}</span>
                        <button aria-label="Add one" onClick={() => change(m.id, 1)} className="rounded-full p-1.5 hover:bg-primary-foreground/15"><Plus className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <button onClick={() => change(m.id, 1)} className="rounded-full border border-primary px-5 py-2 text-sm font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground">
                        Add
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border bg-card p-6 shadow-soft">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" />
              <h3 className="text-2xl font-bold">Your order</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{branchName}</p>
            <div className="mt-5 max-h-80 space-y-3 overflow-y-auto">
              {lines.length === 0 && <p className="text-sm text-muted-foreground">No dishes added yet.</p>}
              {lines.map((l) => (
                <div key={l.id} className="flex justify-between gap-3 text-sm">
                  <span>{l.qty} × {l.name}</span>
                  <span className="font-medium">{inr(l.price * l.qty)}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-between border-t pt-4 text-lg font-bold">
              <span>Total</span>
              <span>{inr(total)}</span>
            </div>
            <button onClick={startCheckout} className="mt-5 w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground shadow-soft transition hover:brightness-110 disabled:opacity-50" disabled={!count}>
              Continue to checkout
            </button>
          </div>
        </aside>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          {step === "details" && (
            <>
              <DialogHeader><DialogTitle className="font-display text-3xl">Your details</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {([["name", "Name", "text"], ["phone", "Phone number", "tel"], ["table", "Table number", "text"]] as const).map(([k, label, type]) => (
                  <div key={k} className="space-y-1.5">
                    <Label htmlFor={k}>{label}</Label>
                    <Input id={k} type={type} maxLength={k === "name" ? 80 : 20} value={details[k]} onChange={(e) => setDetails({ ...details, [k]: e.target.value })} />
                    {errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>}
                  </div>
                ))}
                <button onClick={submitDetails} className="w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground">Next</button>
              </div>
            </>
          )}
          {step === "type" && (
            <>
              <DialogHeader><DialogTitle className="font-display text-3xl">How would you like it?</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">Total {inr(total)} · {branchName}</p>
              <div className="grid grid-cols-2 gap-4">
                <button disabled={submitting} onClick={() => place("dine_in")} className="flex flex-col items-center gap-3 rounded-2xl border-2 p-6 font-bold transition hover:border-primary hover:bg-accent disabled:opacity-50">
                  <Utensils className="h-8 w-8 text-primary" /> DINE IN
                </button>
                <button disabled={submitting} onClick={() => place("delivery")} className="flex flex-col items-center gap-3 rounded-2xl border-2 p-6 font-bold transition hover:border-primary hover:bg-accent disabled:opacity-50">
                  <Bike className="h-8 w-8 text-primary" /> DELIVERY
                </button>
              </div>
              <button onClick={() => setStep("details")} className="text-sm text-muted-foreground underline">Back</button>
            </>
          )}
          {step === "done" && (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
              <h3 className="mt-4 text-3xl font-bold">Order placed!</h3>
              <p className="mt-2 text-muted-foreground">Order #{orderNo} has been sent to the restaurant.</p>
              <button onClick={() => setOpen(false)} className="mt-6 rounded-full bg-primary px-8 py-3 font-semibold text-primary-foreground">Done</button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <SiteFooter />
    </div>
  );
}
