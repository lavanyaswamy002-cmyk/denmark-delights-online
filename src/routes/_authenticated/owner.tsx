import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, LogOut, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/owner")({
  head: () => ({
    meta: [
      { title: "Owner Dashboard — Denmark Restaurant" },
      { name: "description", content: "Manage orders, menu and branches." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OwnerPage,
});

const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`;
const STATUSES = ["new", "preparing", "ready", "completed", "cancelled"] as const;

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.2, ctx.currentTime + t);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.18);
    });
  } catch {
    /* sound blocked */
  }
}

function OwnerPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const roles = useQuery({
    queryKey: ["my-roles", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role, branch_id").eq("user_id", user.id);
      if (error) throw error;
      return data;
    },
  });
  const isOwner = !!roles.data?.some((r) => r.role === "owner");
  const myBranches = isOwner ? [1, 2, 3] : (roles.data ?? []).filter((r) => r.role === "branch_manager").map((r) => r.branch_id!);

  const [tab, setTab] = useState<string>("");
  useEffect(() => {
    if (!tab && roles.data) setTab(myBranches[0] ? `b${myBranches[0]}` : "account");
  }, [roles.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission();
    const ch = supabase
      .channel("orders-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (p) => {
        const o = p.new as { order_number: number; customer_name: string; branch_id: number; total: number; order_type: string };
        beep();
        toast.success(`New order #${o.order_number} — Branch ${o.branch_id}`, {
          description: `${o.customer_name} · ${o.order_type === "dine_in" ? "Dine in" : "Delivery"} · ${inr(o.total)}`,
          duration: 10000,
        });
        if (typeof Notification !== "undefined" && Notification.permission === "granted")
          new Notification(`New order #${o.order_number}`, { body: `${o.customer_name} · Branch ${o.branch_id}` });
        qc.invalidateQueries({ queryKey: ["orders"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const tabs = [
    ...myBranches.map((b) => ({ id: `b${b}`, label: `Branch ${b}` })),
    ...(isOwner ? [{ id: "menu", label: "Menu" }, { id: "branches", label: "Branch details" }, { id: "staff", label: "Branch staff" }] : []),
    { id: "account", label: "Account" },
  ];

  return (
    <div className="min-h-screen bg-secondary">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.4em] text-primary">{isOwner ? "Owner" : "Branch staff"}</p>
            <h1 className="text-5xl font-bold">Dashboard</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><Bell className="h-4 w-4" /> Live order alerts are on while this page is open.</p>
          </div>
          <button onClick={signOut} className="flex items-center gap-2 rounded-full border bg-card px-5 py-2 text-sm font-medium"><LogOut className="h-4 w-4" /> Sign out</button>
        </div>

        {roles.data && !isOwner && myBranches.length === 0 && (
          <div className="mt-8 rounded-2xl border bg-card p-8">
            <p className="font-semibold">Your account has no access yet.</p>
            <p className="text-sm text-muted-foreground">Ask the owner to add {user.email} as branch staff.</p>
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`rounded-full px-5 py-2 text-sm font-medium transition ${tab === t.id ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab.startsWith("b") && tab !== "branches" && <Orders branch={Number(tab.slice(1))} isOwner={isOwner} />}
          {tab === "menu" && isOwner && <MenuEditor />}
          {tab === "branches" && isOwner && <BranchEditor />}
          {tab === "staff" && isOwner && <Staff />}
          {tab === "account" && <Account email={user.email ?? ""} />}
        </div>
      </div>
    </div>
  );
}

function Orders({ branch, isOwner }: { branch: number; isOwner: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["orders", branch],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*").eq("branch_id", branch).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });
  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["orders", branch] });
  };
  const del = async (id: string) => {
    if (!confirm("Delete this order?")) return;
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["orders", branch] });
  };

  if (q.isLoading) return <p className="text-muted-foreground">Loading orders…</p>;
  if (!q.data?.length) return <div className="rounded-2xl border bg-card p-10 text-center text-muted-foreground">No orders yet for Branch {branch}.</div>;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {q.data.map((o) => {
        const items = o.items as { name: string; qty: number; price: number }[];
        return (
          <div key={o.id} className={`rounded-2xl border bg-card p-5 ${o.status === "new" ? "border-primary shadow-soft" : ""}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-bold font-display">#{o.order_number}</p>
                <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("en-IN")}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${o.order_type === "dine_in" ? "bg-accent text-accent-foreground" : "bg-ink text-ink-foreground"}`}>
                {o.order_type === "dine_in" ? "DINE IN" : "DELIVERY"}
              </span>
            </div>
            <div className="mt-3 text-sm">
              <p className="font-semibold">{o.customer_name}</p>
              <p className="text-muted-foreground">{o.phone} · Table {o.table_number}</p>
            </div>
            <ul className="mt-3 space-y-1 border-t pt-3 text-sm">
              {items.map((i, k) => (
                <li key={k} className="flex justify-between"><span>{i.qty} × {i.name}</span><span>{inr(i.price * i.qty)}</span></li>
              ))}
            </ul>
            <p className="mt-3 flex justify-between border-t pt-3 font-bold"><span>Total</span><span>{inr(o.total)}</span></p>
            <div className="mt-4 flex items-center gap-2">
              <select value={o.status} onChange={(e) => setStatus(o.id, e.target.value)} className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm capitalize">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {isOwner && <button onClick={() => del(o.id)} aria-label="Delete order" className="rounded-lg border p-2 text-destructive"><Trash2 className="h-4 w-4" /></button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MenuEditor() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["menu"],
    queryFn: async () => {
      const { data, error } = await supabase.from("menu_items").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const [n, setN] = useState({ name: "", category: "", cuisine: "Chinese", price: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["menu"] });

  const add = async () => {
    const price = Number(n.price);
    if (!n.name.trim() || !n.category.trim() || !(price >= 0) || n.price === "") return toast.error("Fill name, category and price");
    const { error } = await supabase.from("menu_items").insert({ name: n.name.trim().slice(0, 100), category: n.category.trim().slice(0, 50), cuisine: n.cuisine, price, sort_order: (q.data?.length ?? 0) + 1 });
    if (error) return toast.error(error.message);
    setN({ ...n, name: "", price: "" });
    toast.success("Dish added");
    refresh();
  };
  const update = async (id: string, patch: { name?: string; price?: number; is_available?: boolean; category?: string }) => {
    const { error } = await supabase.from("menu_items").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this dish?")) return;
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-2xl border bg-card p-5 md:grid-cols-[2fr_1.5fr_1fr_1fr_auto]">
        <Input placeholder="Dish name" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
        <Input placeholder="Category (e.g. Grills)" value={n.category} onChange={(e) => setN({ ...n, category: e.target.value })} />
        <select value={n.cuisine} onChange={(e) => setN({ ...n, cuisine: e.target.value })} className="rounded-md border bg-background px-3 text-sm">
          <option>Chinese</option><option>Arabian</option><option>Tamil Special</option>
        </select>
        <Input placeholder="Price ₹" type="number" min={0} value={n.price} onChange={(e) => setN({ ...n, price: e.target.value })} />
        <button onClick={add} className="rounded-full bg-primary px-6 py-2 font-semibold text-primary-foreground">Add dish</button>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left"><tr><th className="p-3">Dish</th><th className="p-3">Category</th><th className="p-3">Price ₹</th><th className="p-3">Available</th><th className="p-3" /></tr></thead>
          <tbody>
            {q.data?.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="p-2"><Input defaultValue={m.name} onBlur={(e) => e.target.value.trim() && e.target.value !== m.name && update(m.id, { name: e.target.value.trim() })} /></td>
                <td className="p-2 text-muted-foreground">{m.category}</td>
                <td className="p-2 w-32"><Input type="number" min={0} defaultValue={m.price} onBlur={(e) => Number(e.target.value) !== Number(m.price) && Number(e.target.value) >= 0 && update(m.id, { price: Number(e.target.value) })} /></td>
                <td className="p-2"><Switch checked={m.is_available} onCheckedChange={(v) => update(m.id, { is_available: v })} /></td>
                <td className="p-2"><button onClick={() => remove(m.id)} aria-label="Delete dish" className="p-2 text-destructive"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BranchEditor() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").order("id");
      if (error) throw error;
      return data;
    },
  });
  const save = async (id: number, patch: { name?: string; address?: string; phone?: string }) => {
    const { error } = await supabase.from("branches").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["branches"] });
  };
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {q.data?.map((b) => (
        <div key={b.id} className="space-y-3 rounded-2xl border bg-card p-5">
          <p className="font-display text-2xl font-bold">Branch {b.id}</p>
          {(["name", "address", "phone"] as const).map((k) => (
            <div key={k} className="space-y-1">
              <Label className="capitalize">{k}</Label>
              <Input defaultValue={b[k]} maxLength={150} onBlur={(e) => e.target.value !== b[k] && save(b.id, { [k]: e.target.value.trim() })} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Staff() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["managers"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_branch_managers");
      if (error) throw error;
      return data;
    },
  });
  const [email, setEmail] = useState("");
  const [branch, setBranch] = useState(1);
  const add = async () => {
    const { error } = await supabase.rpc("assign_branch_manager", { _email: email, _branch: branch });
    if (error) return toast.error(error.message);
    setEmail("");
    toast.success("Access granted");
    qc.invalidateQueries({ queryKey: ["managers"] });
  };
  const remove = async (id: string) => {
    const { error } = await supabase.rpc("remove_branch_manager", { _role_id: id });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["managers"] });
  };
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-5">
        <p className="mb-3 text-sm text-muted-foreground">The staff member must first create an account on the sign-in page, then add their email here.</p>
        <div className="flex flex-wrap gap-3">
          <Input className="max-w-sm" type="email" placeholder="staff@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select value={branch} onChange={(e) => setBranch(Number(e.target.value))} className="rounded-md border bg-background px-3 text-sm">
            <option value={1}>Branch 1</option><option value={2}>Branch 2</option><option value={3}>Branch 3</option>
          </select>
          <button onClick={add} className="rounded-full bg-primary px-6 py-2 font-semibold text-primary-foreground">Give access</button>
        </div>
      </div>
      <div className="rounded-2xl border bg-card">
        {q.data?.length ? q.data.map((m) => (
          <div key={m.role_id} className="flex items-center justify-between border-b p-4 last:border-0">
            <span>{m.email}</span>
            <span className="flex items-center gap-4 text-sm text-muted-foreground">Branch {m.branch_id}
              <button onClick={() => remove(m.role_id)} aria-label="Remove access" className="text-destructive"><Trash2 className="h-4 w-4" /></button>
            </span>
          </div>
        )) : <p className="p-6 text-sm text-muted-foreground">No branch staff yet.</p>}
      </div>
    </div>
  );
}

function Account({ email }: { email: string }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [password, setPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error("Password is incorrect");
    setPassword("");
    setStep(2);
  };
  const change = async () => {
    if (!/^\S+@\S+\.\S+$/.test(newEmail)) return toast.error("Enter a valid email");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() }, { emailRedirectTo: `${window.location.origin}/owner` });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Confirmation links sent to both your current and new email. Click both to finish.");
    setStep(1);
    setNewEmail("");
  };

  return (
    <div className="max-w-md space-y-4 rounded-2xl border bg-card p-6">
      <h2 className="text-3xl font-bold">Change email</h2>
      <p className="text-sm text-muted-foreground">Current: {email}</p>
      {step === 1 ? (
        <>
          <p className="text-sm">Step 1 of 2 — confirm it's you.</p>
          <Input type="password" placeholder="Current password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button disabled={busy || !password} onClick={verify} className="w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50">Verify</button>
        </>
      ) : (
        <>
          <p className="text-sm">Step 2 of 2 — enter the new email. You'll confirm from both inboxes.</p>
          <Input type="email" placeholder="new@email.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <button disabled={busy} onClick={change} className="w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50">Send confirmation</button>
        </>
      )}
    </div>
  );
}
