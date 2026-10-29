"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { parseSpoken, sameEntry, joinHeard } from "../lib/parse";

const CATEGORIES = {
  expense: ["Food & Groceries", "Eating Out", "Rent", "Utilities", "Car", "Gas", "Taxi", "Motorbike", "Kids", "Aniel", "Medical", "Clothing", "Cleaning/Nanny", "Education", "Leisure & Travel", "Personal Care", "Special Events", "Gym", "Business/SS", "Credit Card Payment", "Other"],
  income: ["Teshna", "Coaching / Consulting", "Marketing Agency Work", "Sound Journey", "Vibraçao", "Other Income"]
};

// Paying the card covers purchases already logged one by one, so it isn't counted as spending again.
const CARD_PAYMENT = "Credit Card Payment";
const isSpending = (t: any) => t.type === "expense" && t.category !== CARD_PAYMENT;

const PAID_WITH = [{ id: "cash", label: "Cash", short: "Cash" }, { id: "card", label: "Credit card", short: "Card" }, { id: "debit", label: "Debit / transfer", short: "Debit" }];
const paidLabel = (id: string) => PAID_WITH.find(p => p.id === id)?.label || "";
const paidShort = (id: string) => PAID_WITH.find(p => p.id === id)?.short || "";
// Each phone remembers the last way its person paid, so the choice is usually already right.
const lastPaidWith = () => { try { return localStorage.getItem("familia-paid-with") || "cash"; } catch (e) { return "cash"; } };
const rememberPaidWith = (p: string) => { try { if (p) localStorage.setItem("familia-paid-with", p); } catch (e) {} };

const USERS = { gabriel: "Gabriel", steph: "Steph" };

const GOAL_TYPES = ["Family Goal", "Personal Goal"];

const COLORS = {
  gabriel: "#1a6b4a", steph: "#8b4a8b", income: "#1a6b4a", expense: "#c0392b",
  bg: "#faf8f4", card: "#ffffff", accent: "#d4a853", text: "#1a1a1a", muted: "#6b6b6b", border: "#e8e4dc"
};

const fmt = (n: any) => "$" + Math.abs(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtSigned = (n: any) => (n >= 0 ? "+" : "-") + fmt(n);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const monthKey = (d: any) => d.slice(0, 7);
const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function getLast6Months() {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const year = now.getFullYear();
    const month = now.getMonth() - i;
    const d = new Date(year, month, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

function getMonths(transactions: any[]) {
  const fromTx = transactions.map((t: any) => monthKey(t.date));
  const last6 = getLast6Months();
  const all = [...new Set([...last6, ...fromTx])].sort().reverse();
  return all;
}

function exportToCSV(transactions: any[], selectedMonth: string) {
  const filtered = transactions.filter((t: any) => monthKey(t.date) === selectedMonth);
  const headers = ["Date", "Type", "Category", "Description", "Amount", "Paid With", "Added By"];
  const rows = filtered.map((t: any) => [
    t.date, t.type, t.category, (t.description || "").replace(/,/g, ";"), t.amount, paidLabel(t.paid_with),
    t.createdBy === "gabriel" ? "Gabriel" : "Steph"
  ]);
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `familia-${selectedMonth}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [session, setSession] = useState<any>(undefined);
  const [user, setUserState] = useState<any>(null);
  const [showVoice, setShowVoice] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [transactions, setTransactions] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [editingTx, setEditingTx] = useState<any>(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [viewMode, setViewMode] = useState("family");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: txData }, { data: goalData }] = await Promise.all([
        supabase.from("transactions").select("*").order("created_at", { ascending: false }),
        supabase.from("goals").select("*").order("created_at", { ascending: true })
      ]);
      if (txData) setTransactions(txData.map((t: any) => ({ ...t, createdBy: t.created_by, createdAt: t.created_at })));
      if (goalData) setGoals(goalData.map((g: any) => ({ ...g, createdBy: g.created_by, createdAt: g.created_at })));
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    try { const saved = localStorage.getItem("familia-user"); if (saved) setUserState(saved); } catch (e) {}
    return () => sub.subscription.unsubscribe();
  }, []);

  const setUser = (u: any) => {
    setUserState(u);
    try { if (u) localStorage.setItem("familia-user", u); else localStorage.removeItem("familia-user"); } catch (e) {}
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  useEffect(() => { if (user && session) loadData(); }, [user, session, loadData]);

  const addTransactions = async (list: any[]) => {
    setSaving(true);
    const now = new Date().toISOString();
    const rows = list.map((t: any) => ({ id: generateId(), type: t.type, amount: Number(t.amount), category: t.category, description: t.description, date: t.date, paid_with: t.type === "expense" ? t.paid_with || null : null, created_by: t.who || user, created_at: now }));
    const { error } = await supabase.from("transactions").insert(rows);
    setSaving(false);
    if (error) return false;
    setTransactions(prev => [...rows.map(r => ({ ...r, createdBy: r.created_by, createdAt: r.created_at })), ...prev]);
    setShowVoice(false);
    return true;
  };

  // Extra taps while a save is still on its way used to save the same entry again.
  const adding = useRef(false);
  const addTransaction = async (t: any) => {
    if (adding.current) return;
    const twin = transactions.find((x: any) => sameEntry(x, t));
    if (twin && !window.confirm(`This is already saved: ${fmt(t.amount)} ${twin.description || twin.category} on ${t.date}. Save it again?`)) return;
    adding.current = true;
    setSaving(true);
    const newTx = { id: generateId(), type: t.type, amount: t.amount, category: t.category, description: t.description, date: t.date, paid_with: t.type === "expense" ? t.paid_with || null : null, created_by: user, created_at: new Date().toISOString() };
    const { error } = await supabase.from("transactions").insert(newTx);
    adding.current = false;
    setSaving(false);
    if (error) { window.alert("Couldn't save. Check your connection and try again."); return; }
    setTransactions(prev => [{ ...newTx, createdBy: user }, ...prev]);
    setShowAdd(false);
  };

  const updateTransaction = async (id: string, updates: any) => {
    setSaving(true);
    await supabase.from("transactions").update(updates).eq("id", id);
    setTransactions(prev => prev.map((t: any) => t.id === id ? { ...t, ...updates } : t));
    setSaving(false);
    setEditingTx(null);
  };

  const deleteTransaction = async (id: string) => {
    await supabase.from("transactions").delete().eq("id", id);
    setTransactions(prev => prev.filter((t: any) => t.id !== id));
  };

  const addGoal = async (g: any) => {
    const newGoal = { id: generateId(), name: g.name, target: g.target, saved: 0, type: g.type, deadline: g.deadline, created_by: user, created_at: new Date().toISOString() };
    await supabase.from("goals").insert(newGoal);
    setGoals(prev => [...prev, { ...newGoal, createdBy: user }]);
    setShowAddGoal(false);
  };

  const updateGoalSaved = async (id: string, amount: any) => {
    const goal = goals.find((g: any) => g.id === id);
    if (!goal) return;
    const newSaved = Math.max(0, (goal.saved || 0) + Number(amount));
    await supabase.from("goals").update({ saved: newSaved }).eq("id", id);
    setGoals(prev => prev.map((g: any) => g.id === id ? { ...g, saved: newSaved } : g));
  };

  const deleteGoal = async (id: string) => {
    await supabase.from("goals").delete().eq("id", id);
    setGoals(prev => prev.filter((g: any) => g.id !== id));
  };

  const filteredTx = transactions.filter((t: any) => {
    if (monthKey(t.date) !== selectedMonth) return false;
    if (viewMode === "family") return true;
    if (viewMode === "mine") return t.createdBy === user;
    if (viewMode === "other") return t.createdBy !== user;
    return true;
  });

  const income = filteredTx.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const expenses = filteredTx.filter(isSpending).reduce((s: number, t: any) => s + Number(t.amount), 0);
  const cardPaid = filteredTx.filter((t: any) => t.type === "expense" && t.category === CARD_PAYMENT).reduce((s: number, t: any) => s + Number(t.amount), 0);
  const net = income - expenses;

  const byCategory = filteredTx.filter(isSpending).reduce((acc: any, t: any) => {
    acc[t.category] = (acc[t.category] || 0) + Number(t.amount);
    return acc;
  }, {});

  const allMonthTx = transactions.filter((t: any) => monthKey(t.date) === selectedMonth);
  const gabrielIncome = allMonthTx.filter((t: any) => t.type === "income" && t.createdBy === "gabriel").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const stephIncome = allMonthTx.filter((t: any) => t.type === "income" && t.createdBy === "steph").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const gabrielExpenses = allMonthTx.filter((t: any) => isSpending(t) && t.createdBy === "gabriel").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const stephExpenses = allMonthTx.filter((t: any) => isSpending(t) && t.createdBy === "steph").reduce((s: number, t: any) => s + Number(t.amount), 0);

  const months = getMonths(transactions);
  const otherName = user === "gabriel" ? "Steph" : "Gabriel";

  if (session === undefined) return <div style={{ background: COLORS.bg, minHeight: "100vh" }} />;
  if (!session) return <SignInScreen />;
  if (!user) return <LoginScreen onLogin={setUser} onSignOut={signOut} />;

  return (
    <div style={{ fontFamily: "'Georgia', serif", background: COLORS.bg, minHeight: "100vh", maxWidth: 430, margin: "0 auto", position: "relative" }}>
      <Header user={user} onLogout={() => setUser(null)} saving={saving} onRefresh={loadData} />
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: COLORS.muted, fontStyle: "italic" }}>Loading family data...</div>
      ) : (
        <div style={{ padding: "0 0 100px" }}>
          {tab === "dashboard" && (
            <Dashboard income={income} expenses={expenses} net={net} cardPaid={cardPaid}
              gabrielIncome={gabrielIncome} stephIncome={stephIncome}
              gabrielExpenses={gabrielExpenses} stephExpenses={stephExpenses}
              byCategory={byCategory} filteredTx={filteredTx}
              selectedMonth={selectedMonth} months={months}
              onMonthChange={setSelectedMonth} viewMode={viewMode} onViewModeChange={setViewMode}
              user={user} otherName={otherName}
              onExport={() => exportToCSV(transactions, selectedMonth)} />
          )}
          {tab === "transactions" && (
            <Transactions filteredTx={filteredTx} onDelete={deleteTransaction} onEdit={setEditingTx} user={user}
              selectedMonth={selectedMonth} months={months} onMonthChange={setSelectedMonth}
              viewMode={viewMode} onViewModeChange={setViewMode} otherName={otherName}
              onExport={() => exportToCSV(transactions, selectedMonth)} />
          )}
          {tab === "goals" && (
            <Goals goals={goals} onAddGoal={() => setShowAddGoal(true)} onUpdateSaved={updateGoalSaved} onDelete={deleteGoal} user={user} />
          )}
        </div>
      )}
      <BottomNav tab={tab} onTab={setTab} onAdd={() => setShowAdd(true)} />
      {showVoice && <VoiceSheet user={user} history={transactions} onSave={addTransactions} onClose={() => setShowVoice(false)}
        onTypeInstead={() => { setShowVoice(false); setShowAdd(true); }} />}
      {showAdd && <AddTransactionModal onAdd={addTransaction} onClose={() => setShowAdd(false)} user={user} saving={saving}
        onSayIt={() => { setShowAdd(false); setShowVoice(true); }} />}
      {showAddGoal && <AddGoalModal onAdd={addGoal} onClose={() => setShowAddGoal(false)} user={user} />}
      {editingTx && <EditTransactionModal tx={editingTx} onSave={updateTransaction} onClose={() => setEditingTx(null)} />}
    </div>
  );
}

function SignInScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const creating = mode === "create";
  const submit = async () => {
    if (!email.includes("@") || !password) return;
    if (creating && password.length < 8) { setError("Use at least 8 characters."); return; }
    setBusy(true); setError("");
    const creds = { email: email.trim(), password };
    const { data, error } = creating ? await supabase.auth.signUp(creds) : await supabase.auth.signInWithPassword(creds);
    setBusy(false);
    if (error) setError(creating ? error.message : "That email and password don't match.");
    else if (!data.session) setError("Your account is waiting for email confirmation, which is switched off for Familia. Ask Gabriel.");
  };
  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ marginBottom: 12, fontSize: 40 }}>🌿</div>
      <h1 style={{ fontFamily: "'Georgia', serif", fontSize: 26, fontWeight: 400, color: COLORS.text, margin: "0 0 6px" }}>Familia</h1>
      <p style={{ color: COLORS.muted, fontSize: 14, margin: "0 0 28px", textAlign: "center", lineHeight: 1.6 }}>{creating ? "Create your password" : "Sign in"}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 280 }}>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" style={inputStyle} />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder={creating ? "New password (8+ characters)" : "Password"} autoComplete={creating ? "new-password" : "current-password"} style={inputStyle} />
        <button onClick={submit} disabled={busy} style={{ background: COLORS.gabriel, color: "#fff", border: "none", borderRadius: 12, padding: "14px 24px", fontSize: 15, fontFamily: "'Georgia', serif", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "One moment..." : creating ? "Create and sign in" : "Sign in"}
        </button>
        {error && <div style={{ fontSize: 12, color: COLORS.expense, textAlign: "center", lineHeight: 1.5 }}>{error}</div>}
        <button onClick={() => { setMode(creating ? "signin" : "create"); setError(""); }} style={{ background: "none", border: "none", color: COLORS.muted, fontSize: 12, cursor: "pointer", fontFamily: "'Georgia', serif", marginTop: 6 }}>
          {creating ? "I already have a password" : "First time here? Create your password"}
        </button>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin, onSignOut }: any) {
  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ marginBottom: 12, fontSize: 40 }}>🌿</div>
      <h1 style={{ fontFamily: "'Georgia', serif", fontSize: 26, fontWeight: 400, color: COLORS.text, margin: "0 0 6px" }}>Familia</h1>
      <p style={{ color: COLORS.muted, fontSize: 14, margin: "0 0 40px", textAlign: "center", lineHeight: 1.6 }}>Your shared family finance tracker</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", maxWidth: 280 }}>
        {Object.entries(USERS).map(([key, name]) => (
          <button key={key} onClick={() => onLogin(key)} style={{
            background: key === "gabriel" ? COLORS.gabriel : COLORS.steph,
            color: "#fff", border: "none", borderRadius: 12, padding: "16px 24px",
            fontSize: 16, fontFamily: "'Georgia', serif", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 12
          }}>
            <span style={{ fontSize: 22 }}>{key === "gabriel" ? "🌱" : "🌸"}</span>
            <span>I'm {name}</span>
          </button>
        ))}
        <button onClick={onSignOut} style={{ background: "none", border: "none", color: COLORS.muted, fontSize: 12, cursor: "pointer", fontFamily: "'Georgia', serif", marginTop: 10 }}>Sign out</button>
      </div>
    </div>
  );
}

function Header({ user, onLogout, saving, onRefresh }: any) {
  return (
    <div style={{ background: COLORS.card, borderBottom: `1px solid ${COLORS.border}`, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 18 }}>{user === "gabriel" ? "🌱" : "🌸"}</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.text }}>{USERS[user]}</span>
        {saving && <span style={{ fontSize: 11, color: COLORS.muted, fontStyle: "italic" }}>saving...</span>}
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={onRefresh} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, fontSize: 18, padding: 0 }}>↻</button>
        <button onClick={onLogout} style={{ background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "4px 10px", fontSize: 12, color: COLORS.muted, cursor: "pointer", fontFamily: "'Georgia', serif" }}>Switch</button>
      </div>
    </div>
  );
}

function MonthPicker({ months, selected, onChange }: any) {
  return (
    <select value={selected} onChange={e => onChange(e.target.value)} style={{
      border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 10px",
      fontSize: 13, background: COLORS.card, color: COLORS.text, cursor: "pointer", fontFamily: "'Georgia', serif"
    }}>
      {months.map((m: string) => <option key={m} value={m}>{new Date(m + "-02").toLocaleDateString("en-US", { month: "long", year: "numeric" })}</option>)}
    </select>
  );
}

function ViewToggle({ viewMode, onChange, user, otherName }: any) {
  const myName = user === "gabriel" ? "Gabriel" : "Steph";
  const options = [
    { id: "family", label: "Family" },
    { id: "mine", label: myName },
    { id: "other", label: otherName },
  ];
  return (
    <div style={{ display: "flex", background: COLORS.border, borderRadius: 8, padding: 2, gap: 2 }}>
      {options.map(v => (
        <button key={v.id} onClick={() => onChange(v.id)} style={{
          background: viewMode === v.id ? COLORS.card : "transparent",
          border: "none", borderRadius: 6, padding: "5px 8px",
          fontSize: 11, cursor: "pointer", color: viewMode === v.id ? COLORS.text : COLORS.muted,
          fontFamily: "'Georgia', serif", transition: "all 0.15s", whiteSpace: "nowrap"
        }}>{v.label}</button>
      ))}
    </div>
  );
}

function CategoryRow({ cat, amt, maxCat, txList }: any) {
  const [open, setOpen] = useState(false);
  const catTx = txList.filter((t: any) => t.category === cat && t.type === "expense");
  return (
    <div style={{ marginBottom: 10 }}>
      <div onClick={() => setOpen(o => !o)} style={{ cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: COLORS.text }}>{cat} {open ? "▲" : "▼"}</span>
          <span style={{ fontSize: 12, color: COLORS.muted }}>{fmt(amt)}</span>
        </div>
        <div style={{ height: 4, background: COLORS.border, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(amt / maxCat) * 100}%`, background: COLORS.accent, borderRadius: 2 }} />
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 8, borderLeft: `3px solid ${COLORS.accent}`, paddingLeft: 10 }}>
          {catTx.length === 0 ? (
            <div style={{ fontSize: 11, color: COLORS.muted, fontStyle: "italic" }}>No entries</div>
          ) : catTx.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((t: any) => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${COLORS.border}` }}>
              <div>
                <div style={{ fontSize: 12, color: COLORS.text }}>{t.description || t.category}</div>
                <div style={{ fontSize: 10, color: COLORS.muted }}>{t.date} · {t.createdBy === "gabriel" ? "🌱" : "🌸"}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.expense }}>-{fmt(t.amount)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Dashboard({ income, expenses, net, cardPaid, gabrielIncome, stephIncome, gabrielExpenses, stephExpenses, byCategory, filteredTx, selectedMonth, months, onMonthChange, viewMode, onViewModeChange, user, otherName, onExport }: any) {
  const topCats = Object.entries(byCategory).sort((a: any, b: any) => b[1] - a[1]).slice(0, 8);
  const maxCat = (topCats[0] as any)?.[1] || 1;
  const budgetGuide = [
    { label: "Needs (50%)", target: income * 0.5, color: "#4a9b7f" },
    { label: "Wants (15%)", target: income * 0.15, color: COLORS.accent },
    { label: "Savings (20%)", target: income * 0.2, color: COLORS.gabriel },
    { label: "Investment (15%)", target: income * 0.15, color: COLORS.steph },
  ];
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <MonthPicker months={months} selected={selectedMonth} onChange={onMonthChange} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <ViewToggle viewMode={viewMode} onChange={onViewModeChange} user={user} otherName={otherName} />
          <button onClick={onExport} style={{ background: COLORS.text, color: "#fff", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 11, cursor: "pointer", fontFamily: "'Georgia', serif" }}>↓ CSV</button>
        </div>
      </div>
      <div style={{ background: COLORS.text, borderRadius: 16, padding: 24, marginBottom: 20, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -20, right: -20, width: 120, height: 120, borderRadius: "50%", background: "rgba(212,168,83,0.12)" }} />
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4, letterSpacing: 1, textTransform: "uppercase" }}>Net Position</div>
        <div style={{ fontSize: 38, fontWeight: 400, color: net >= 0 ? "#7dd4a8" : "#e87d7d", marginBottom: 16 }}>{fmtSigned(net)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>Income</div>
            <div style={{ fontSize: 20, color: "#7dd4a8" }}>{fmt(income)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>Expenses</div>
            <div style={{ fontSize: 20, color: "#e87d7d" }}>{fmt(expenses)}</div>
          </div>
        </div>
        {cardPaid > 0 && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 14, lineHeight: 1.5 }}>
            Paid to the credit card: {fmt(cardPaid)}. Not added to expenses, because the purchases are already&nbsp;there.
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {[
          { name: "Gabriel 🌱", inc: gabrielIncome, exp: gabrielExpenses, color: COLORS.gabriel },
          { name: "Steph 🌸", inc: stephIncome, exp: stephExpenses, color: COLORS.steph }
        ].map(p => (
          <div key={p.name} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 12, color: p.color, fontWeight: 500, marginBottom: 10 }}>{p.name}</div>
            <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 2 }}>Income</div>
            <div style={{ fontSize: 16, color: COLORS.income, marginBottom: 8 }}>{fmt(p.inc)}</div>
            <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 2 }}>Expenses</div>
            <div style={{ fontSize: 16, color: COLORS.expense }}>{fmt(p.exp)}</div>
          </div>
        ))}
      </div>
      {topCats.length > 0 && (
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.text, marginBottom: 4 }}>Top spending categories</div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 14 }}>Tap a category to see its entries</div>
          {topCats.map(([cat, amt]: any) => (
            <CategoryRow key={cat} cat={cat} amt={amt} maxCat={maxCat} txList={filteredTx} />
          ))}
        </div>
      )}
      {income > 0 && (
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.text, marginBottom: 4 }}>Healthy money allocation guide</div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 14 }}>Based on your {fmt(income)} income this month</div>
          {budgetGuide.map(b => (
            <div key={b.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: b.color }} />
                <span style={{ fontSize: 12, color: COLORS.text }}>{b.label}</span>
              </div>
              <span style={{ fontSize: 12, color: COLORS.muted, fontWeight: 500 }}>{fmt(b.target)}/mo</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const shortMoney = (n: number) => n >= 1000 ? "$" + (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : "$" + (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10);

// The month as a calendar: each day shows what was spent, and a deeper shade marks the month's bigger days.
function DayCalendar({ month, txList, selected, onSelect }: any) {
  const [y, m] = month.split("-").map(Number);
  const daysIn = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const spent: Record<string, number> = {}, earned: Record<string, boolean> = {};
  for (const t of txList) {
    if (isSpending(t)) spent[t.date] = (spent[t.date] || 0) + Number(t.amount);
    else if (t.type === "income") earned[t.date] = true;
  }
  const amounts = Object.values(spent).sort((a, b) => a - b);
  const shade = (v: number) => {
    if (!v) return COLORS.card;
    const rank = amounts.filter(x => x <= v).length / amounts.length;
    return `rgba(192,57,43,${rank > 0.75 ? 0.3 : rank > 0.5 ? 0.2 : rank > 0.25 ? 0.12 : 0.06})`;
  };
  const now = today();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 3 }}>
      {WEEK.map(d => <div key={d} style={{ fontSize: 10, color: COLORS.muted, textAlign: "center", paddingBottom: 4 }}>{d}</div>)}
      {cells.map((d, i) => d === null ? <div key={"x" + i} /> : (
        <button key={d} onClick={() => onSelect(selected === d ? null : d)} aria-label={`${d}${spent[d] ? ", spent " + fmt(spent[d]) : ""}`} aria-pressed={selected === d} style={{
          background: shade(spent[d]), border: `1px solid ${COLORS.border}`, boxShadow: selected === d ? `inset 0 0 0 2px ${COLORS.text}` : "none",
          borderRadius: 8, minHeight: 52, padding: "4px 0", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontFamily: "'Georgia', serif"
        }}>
          <span style={{ fontSize: 12, width: 22, height: 22, lineHeight: "22px", borderRadius: "50%", background: d === now ? COLORS.text : "transparent", color: d === now ? "#fff" : d > now ? COLORS.muted : COLORS.text }}>{Number(d.slice(8))}</span>
          <span style={{ fontSize: 10, color: COLORS.text, whiteSpace: "nowrap", minHeight: 12 }}>{spent[d] ? shortMoney(spent[d]) : ""}</span>
          {earned[d] && <span style={{ width: 5, height: 5, borderRadius: "50%", background: COLORS.income }} />}
        </button>
      ))}
    </div>
  );
}

function EntryCard({ t, user, onEdit, onDelete }: any) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 10, background: t.type === "income" ? "#e8f5ee" : "#fdecea", color: t.type === "income" ? COLORS.income : COLORS.expense, borderRadius: 4, padding: "2px 6px", fontWeight: 500 }}>{t.type}</span>
            <span style={{ fontSize: 10, color: t.createdBy === "gabriel" ? COLORS.gabriel : COLORS.steph }}>{t.createdBy === "gabriel" ? "🌱 Gabriel" : "🌸 Steph"}</span>
          </div>
          <div style={{ fontSize: 14, color: COLORS.text, marginBottom: 2 }}>{t.description || t.category}</div>
          <div style={{ fontSize: 11, color: COLORS.muted }}>
            {t.category}{t.paid_with && <span style={{ whiteSpace: "nowrap" }}>{"\u00a0· " + paidShort(t.paid_with)}</span>}
          </div>
          {t.category === CARD_PAYMENT && <div style={{ fontSize: 11, color: COLORS.muted, fontStyle: "italic", marginTop: 2 }}>Not counted as spending</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: t.type === "income" ? COLORS.income : COLORS.expense }}>
            {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
          </div>
          <button onClick={() => onEdit(t)} style={{ background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 6, cursor: "pointer", color: COLORS.muted, fontSize: 12, padding: "2px 6px" }}>✎</button>
          {t.createdBy === user && (
            <button onClick={() => onDelete(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Transactions({ filteredTx, onDelete, onEdit, user, selectedMonth, months, onMonthChange, viewMode, onViewModeChange, otherName, onExport }: any) {
  // Today is open when the month is this month; tapping it again (or "See all") shows the whole month.
  const [day, setDay] = useState<string | null>(selectedMonth === currentMonth() ? today() : null);
  useEffect(() => { setDay(selectedMonth === currentMonth() ? today() : null); }, [selectedMonth]);
  const shown = day ? filteredTx.filter((t: any) => t.date === day) : filteredTx;
  const sorted = [...shown].sort((a: any, b: any) => b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const sum = (list: any[]) => list.filter(isSpending).reduce((s: number, t: any) => s + Number(t.amount), 0);
  const monthSpent = sum(filteredTx), daySpent = sum(shown);
  const monthName = new Date(selectedMonth + "-02").toLocaleDateString("en-US", { month: "long" });
  const daysSoFar = selectedMonth === currentMonth() ? Number(today().slice(8)) : new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5)), 0).getDate();
  const title = !day ? `All of ${monthName}` : (day === today() ? "Today, " : "") + new Date(day + "T12:00:00").toLocaleDateString("en-US", day === today() ? { month: "long", day: "numeric" } : { weekday: "long", month: "long", day: "numeric" });
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <MonthPicker months={months} selected={selectedMonth} onChange={onMonthChange} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <ViewToggle viewMode={viewMode} onChange={onViewModeChange} user={user} otherName={otherName} />
          <button onClick={onExport} style={{ background: COLORS.text, color: "#fff", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 11, cursor: "pointer", fontFamily: "'Georgia', serif" }}>↓ CSV</button>
        </div>
      </div>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "12px 10px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, padding: "0 4px 10px", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.text }}>Spent in {monthName}: {fmt(monthSpent)}</span>
          {monthSpent > 0 && <span style={{ fontSize: 11, color: COLORS.muted }}>about {fmt(monthSpent / daysSoFar)} a&nbsp;day</span>}
        </div>
        <DayCalendar month={selectedMonth} txList={filteredTx} selected={day} onSelect={setDay} />
        <div style={{ fontSize: 11, color: COLORS.muted, padding: "10px 4px 0", lineHeight: 1.5 }}>
          Tap a day to see its entries. Darker days spent more; a green dot means&nbsp;income.
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: COLORS.text }}>{title}</span>
        {daySpent > 0 && <span style={{ fontSize: 13, color: COLORS.expense, whiteSpace: "nowrap" }}>Spent {fmt(daySpent)}</span>}
      </div>
      {sorted.length === 0 ? (
        <div style={{ textAlign: "center", padding: day ? 30 : 60, color: COLORS.muted, fontStyle: "italic" }}>{day ? "Nothing logged on this day" : "No transactions yet this month"}</div>
      ) : sorted.map((t: any, i: number) => {
        const daySum = !day && t.date !== sorted[i - 1]?.date ? sum(sorted.filter((x: any) => x.date === t.date)) : 0;
        return <div key={t.id}>
          {/* The whole month is grouped under one small heading per day. */}
          {!day && t.date !== sorted[i - 1]?.date && (
            <button onClick={() => setDay(t.date)} style={{ display: "flex", justifyContent: "space-between", width: "100%", background: "none", border: "none", padding: "6px 2px 8px", cursor: "pointer", fontFamily: "'Georgia', serif", fontSize: 12, color: COLORS.muted }}>
              <span>{new Date(t.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
              <span>{daySum ? fmt(daySum) : ""}</span>
            </button>
          )}
          <EntryCard t={t} user={user} onEdit={onEdit} onDelete={onDelete} />
        </div>;
      })}
      {day && filteredTx.length > 0 && (
        <button onClick={() => setDay(null)} style={{ width: "100%", background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 10, color: COLORS.text, fontSize: 13, padding: 12, cursor: "pointer", fontFamily: "'Georgia', serif", marginTop: 4 }}>See all of {monthName}</button>
      )}
    </div>
  );
}

// A card can't pay the card, so choosing Credit Card Payment moves "Credit card" to "Debit / transfer".
function withPaidWith(f: any, k: string, v: any) {
  const next = { ...f, [k]: v, ...(k === "type" ? { category: CATEGORIES[v as keyof typeof CATEGORIES][0] } : {}) };
  if (next.category === CARD_PAYMENT && next.paid_with === "card") next.paid_with = "debit";
  return next;
}

function PaidWithPicker({ value, onChange, small }: any) {
  return (
    <div style={{ display: "flex", background: COLORS.border, borderRadius: 8, padding: 2, gap: 2 }}>
      {PAID_WITH.map(p => (
        <button key={p.id} type="button" onClick={() => onChange(p.id)} style={{
          flex: "1 1 auto", background: value === p.id ? COLORS.card : "transparent", border: "none", borderRadius: 6, padding: small ? "5px 6px" : "7px 8px", fontSize: 12,
          cursor: "pointer", color: value === p.id ? COLORS.text : COLORS.muted, fontFamily: "'Georgia', serif", fontWeight: value === p.id ? 500 : 400, whiteSpace: "nowrap"
        }}>{p.label}</button>
      ))}
    </div>
  );
}

function EditTransactionModal({ tx, onSave, onClose }: any) {
  const [form, setForm] = useState({ type: tx.type, amount: tx.amount, category: tx.category, description: tx.description || "", date: tx.date, paid_with: tx.paid_with || "" });
  const cats = CATEGORIES[form.type as keyof typeof CATEGORIES];
  const set = (k: string, v: any) => setForm((f: any) => withPaidWith(f, k, v));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: COLORS.card, borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 430, margin: "0 auto", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: COLORS.text }}>Edit transaction</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: COLORS.muted }}>×</button>
        </div>
        <div style={{ display: "flex", background: COLORS.border, borderRadius: 10, padding: 3, marginBottom: 20 }}>
          {["expense", "income"].map(t => (
            <button key={t} onClick={() => set("type", t)} style={{
              flex: 1, background: form.type === t ? COLORS.card : "transparent", border: "none", borderRadius: 8, padding: "8px", fontSize: 14,
              cursor: "pointer", color: form.type === t ? (t === "income" ? COLORS.income : COLORS.expense) : COLORS.muted,
              fontFamily: "'Georgia', serif", fontWeight: form.type === t ? 500 : 400
            }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
        {[
          { label: "Amount (USD)", el: <input type="number" step="0.01" value={form.amount} onChange={e => set("amount", e.target.value)} style={inputStyle} /> },
          { label: "Category", el: <select value={form.category} onChange={e => set("category", e.target.value)} style={inputStyle}>{cats.map((c: string) => <option key={c}>{c}</option>)}</select> },
          ...(form.type === "expense" ? [{ label: form.paid_with ? "Paid with" : "Paid with (not set yet)", el: <PaidWithPicker value={form.paid_with} onChange={(v: string) => set("paid_with", v)} /> }] : []),
          { label: "Date", el: <input type="date" value={form.date} onChange={e => set("date", e.target.value)} style={inputStyle} /> },
          { label: "Description (optional)", el: <input type="text" value={form.description} onChange={e => set("description", e.target.value)} placeholder="e.g. Saturday market" style={inputStyle} /> },
        ].map(({ label, el }) => (
          <div key={label} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 6 }}>{label}</div>
            {el}
          </div>
        ))}
        <button onClick={() => { if (form.amount) onSave(tx.id, { ...form, paid_with: form.type === "expense" ? form.paid_with || null : null }); }} style={{ width: "100%", background: COLORS.gabriel, color: "#fff", border: "none", borderRadius: 12, padding: 16, fontSize: 15, cursor: "pointer", fontFamily: "'Georgia', serif", marginTop: 8 }}>Save changes</button>
      </div>
    </div>
  );
}

function Goals({ goals, onAddGoal, onUpdateSaved, onDelete, user }: any) {
  const [contributing, setContributing] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const familyGoals = goals.filter((g: any) => g.type === "Family Goal");
  const personalGoals = goals.filter((g: any) => g.type === "Personal Goal" && g.createdBy === user);

  const GoalCard = ({ g }: any) => {
    const pct = Math.min(100, ((g.saved || 0) / g.target) * 100);
    return (
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text, marginBottom: 2 }}>{g.name}</div>
            <div style={{ fontSize: 11, color: COLORS.muted }}>{g.type}{g.type === "Personal Goal" ? ` · ${g.createdBy === "gabriel" ? "🌱" : "🌸"}` : ""}</div>
          </div>
          <button onClick={() => onDelete(g.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, fontSize: 16 }}>×</button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
          <span style={{ color: COLORS.income, fontWeight: 500 }}>{fmt(g.saved || 0)} saved</span>
          <span style={{ color: COLORS.muted }}>target: {fmt(g.target)}</span>
        </div>
        <div style={{ height: 6, background: COLORS.border, borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: pct >= 100 ? COLORS.income : COLORS.accent, borderRadius: 3, transition: "width 0.4s" }} />
        </div>
        <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 10 }}>{pct.toFixed(0)}% complete{g.deadline ? ` · Target: ${g.deadline}` : ""}</div>
        {contributing === g.id ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" style={{ flex: 1, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 14, fontFamily: "'Georgia', serif" }} />
            <button onClick={() => { onUpdateSaved(g.id, amount); setContributing(null); setAmount(""); }} style={{ background: COLORS.gabriel, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "'Georgia', serif" }}>Add</button>
            <button onClick={() => setContributing(null)} style={{ background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, cursor: "pointer", fontFamily: "'Georgia', serif" }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setContributing(g.id)} style={{ width: "100%", background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px", fontSize: 13, color: COLORS.muted, cursor: "pointer", fontFamily: "'Georgia', serif" }}>+ Add contribution</button>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 18, color: COLORS.text }}>Goals</div>
        <button onClick={onAddGoal} style={{ background: COLORS.text, color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "'Georgia', serif" }}>+ New goal</button>
      </div>
      {familyGoals.length > 0 && (<>
        <div style={{ fontSize: 12, color: COLORS.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Family goals</div>
        {familyGoals.map((g: any) => <GoalCard key={g.id} g={g} />)}
      </>)}
      {personalGoals.length > 0 && (<>
        <div style={{ fontSize: 12, color: COLORS.muted, letterSpacing: 1, textTransform: "uppercase", margin: "20px 0 12px" }}>My personal goals</div>
        {personalGoals.map((g: any) => <GoalCard key={g.id} g={g} />)}
      </>)}
      {goals.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: COLORS.muted }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
          <div style={{ fontStyle: "italic" }}>No goals yet. Add your first one!</div>
        </div>
      )}
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16, marginTop: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.text, marginBottom: 12 }}>Proven savings strategies</div>
        {[
          { emoji: "🏦", title: "Emergency fund first", desc: "6 months of expenses in a separate account." },
          { emoji: "✈️", title: "Vacation fund", desc: "5% of net income monthly into a dedicated travel account." },
          { emoji: "🏠", title: "Home fund", desc: "10–20% of net income toward your down payment or build fund." },
          { emoji: "📈", title: "Investment rule", desc: "Minimum 10% of net income invested." },
          { emoji: "💰", title: "Pay yourself first", desc: "Automate transfers on payday before spending anything." }
        ].map(s => (
          <div key={s.title} style={{ display: "flex", gap: 12, marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${COLORS.border}` }}>
            <span style={{ fontSize: 20 }}>{s.emoji}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.text, marginBottom: 2 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.5 }}>{s.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MicIcon({ size = 20 }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

const VOICE_LANGS = [{ id: "en-US", label: "English" }, { id: "es-EC", label: "Español" }];

function VoiceSheet({ user, history, onSave, onClose, onTypeInstead }: any) {
  const [lang, setLang] = useState("en-US");
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSavingState] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [entries, setEntries] = useState<any[] | null>(null);
  const [micOff, setMicOff] = useState(false);
  const recRef = useRef<any>(null);
  const textRef = useRef("");
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const understandAfterStop = useRef(false);

  const updateText = (t: string) => { textRef.current = t; setText(t); };

  // The app's own mic often fails on phones (iPhone home-screen apps, dictation switched off), so it only
  // starts on a tap, and once it has failed the mic button opens the keyboard, whose own mic always works.
  useEffect(() => {
    let l = (navigator.language || "").toLowerCase().startsWith("es") ? "es-EC" : "en-US";
    try { l = localStorage.getItem("familia-voice-lang") || l; setMicOff(localStorage.getItem("familia-mic") === "off"); } catch (e) {}
    setLang(l);
    setSupported(!!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
    return () => { try { recRef.current?.abort(); } catch (e) {} };
  }, []);

  const openKeyboard = () => {
    boxRef.current?.focus();
    setError("");
  };

  const micTap = () => {
    if (listening) { recRef.current?.stop(); return; }
    if (!supported || micOff) { openKeyboard(); return; }
    start();
  };

  const start = (l = lang) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR || recRef.current) return;
    const rec = new SR();
    const iphone = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    rec.lang = l; rec.continuous = !iphone; rec.interimResults = true;
    const base = textRef.current.trim() ? textRef.current.trim() + " " : "";
    rec.onresult = (e: any) => {
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) parts.push(e.results[i][0].transcript);
      updateText(base + joinHeard(parts));
    };
    rec.onerror = (e: any) => {
      const es = l.startsWith("es");
      if (e.error === "aborted") return;
      if (e.error === "no-speech") { setError(es ? "No escuché nada. Toca el micrófono otra vez, o usa el 🎤 de tu teclado." : "I didn't hear anything. Tap the mic again, or use the 🎤 on your keyboard."); return; }
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
        setMicOff(true);
        try { localStorage.setItem("familia-mic", "off"); } catch (err) {}
      }
      setError((es ? "Tu teléfono no deja que la app use el micrófono" : "Your phone isn't letting the app use its microphone") + ` (${e.error}). ` +
        (es ? "Toca el cuadro y luego el 🎤 de tu teclado para hablar." : "Tap the box, then the 🎤 on your keyboard to talk."));
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      if (understandAfterStop.current) { understandAfterStop.current = false; understand(); }
    };
    recRef.current = rec;
    setError("");
    setListening(true);
    try { rec.start(); } catch (e) { recRef.current = null; setListening(false); }
  };

  const stopListening = () => {
    const rec = recRef.current;
    if (!rec) return;
    rec.onend = null;
    try { rec.abort(); } catch (e) {}
    recRef.current = null;
    setListening(false);
  };

  const switchLang = (l: string) => {
    setLang(l);
    try { localStorage.setItem("familia-voice-lang", l); } catch (e) {}
    if (recRef.current) { stopListening(); start(l); }
  };

  const understand = () => {
    const said = textRef.current.trim();
    if (!said) { setError("I didn't catch anything yet."); return; }
    setError("");
    const es = lang.startsWith("es");
    const { entries: list, skipped, repeats } = parseSpoken(said, { speaker: user, today: today(), history, categories: CATEGORIES });
    setEntries(list.map(x => ({ ...x, amount: String(x.amount), paid_with: x.type !== "expense" ? null : x.paid || (x.category === CARD_PAYMENT ? "debit" : lastPaidWith()) })));
    if (!list.length) { setNote(es ? "No encontré un monto. Di un número, por ejemplo \"12 en el mercado\"." : "I didn't find an amount. Say a number, like \"12 at the market\"."); return; }
    const notes = [];
    if (skipped.length) notes.push((es ? "Sin monto, lo dejé fuera: " : "No amount, so I left out: ") + skipped.join("; "));
    if (repeats) notes.push(es ? `Lo dijiste ${repeats + 1} veces; lo guardo una vez.` : `You said the same thing ${repeats + 1} times, so I kept it once.`);
    setNote(notes.join(" "));
  };

  const done = () => {
    if (recRef.current) { understandAfterStop.current = true; recRef.current.stop(); }
    else understand();
  };

  const setEntry = (i: number, k: string, v: any) => setEntries((prev: any) => prev.map((x: any, j: number) => j !== i ? x : {
    ...withPaidWith(x, k, v), ...(k === "type" && v === "expense" && !x.paid_with ? { paid_with: lastPaidWith() } : {})
  }));
  const removeEntry = (i: number) => setEntries((prev: any) => prev.filter((_: any, j: number) => j !== i));
  const startOver = () => { setEntries(null); setNote(""); setError(""); updateText(""); };
  // A card that matches an entry already in the app is left out unless they tap "Save it anyway".
  const alreadySaved = (x: any) => !x.keep && history.some((h: any) => sameEntry(h, x));
  const ready = (entries || []).filter((x: any) => Number(x.amount) > 0 && !alreadySaved(x));

  const save = async () => {
    if (!ready.length) return;
    const lastPaid = ready.filter((x: any) => x.type === "expense" && x.category !== CARD_PAYMENT).pop();
    if (lastPaid) rememberPaidWith(lastPaid.paid_with);
    setSavingState(true);
    const ok = await onSave(ready);
    setSavingState(false);
    if (!ok) setError("Couldn't save. Check your connection and try again.");
  };

  const small: any = { ...inputStyle, padding: "8px 10px", fontSize: 14 };
  const pill = (active: boolean, color = COLORS.text): any => ({
    flex: 1, background: active ? COLORS.card : "transparent", border: "none", borderRadius: 6, padding: "5px 8px", fontSize: 12,
    cursor: "pointer", color: active ? color : COLORS.muted, fontFamily: "'Georgia', serif", fontWeight: active ? 500 : 400
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
      <style>{`@keyframes familia-pulse { 0% { box-shadow: 0 0 0 0 rgba(192,57,43,0.45); } 100% { box-shadow: 0 0 0 18px rgba(192,57,43,0); } }`}</style>
      <div style={{ background: COLORS.card, borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 430, margin: "0 auto", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: COLORS.text }}>{entries ? "Check and save" : "Type or say it"}</div>
          <button onClick={() => { stopListening(); onClose(); }} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: COLORS.muted }}>×</button>
        </div>

        {!entries && (
          <>
            <div style={{ position: "relative", marginBottom: 8 }}>
              <textarea ref={boxRef} value={text} onChange={e => updateText(e.target.value)} rows={4}
                placeholder="e.g. 12 at the market and 5 for coffee"
                style={{ ...inputStyle, resize: "none", lineHeight: 1.5, paddingRight: 52, fontSize: 16 }} />
              <button onClick={micTap} aria-label={listening ? "Stop listening" : "Dictate"} style={{
                position: "absolute", right: 8, bottom: 10, width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer",
                color: "#fff", background: listening ? COLORS.expense : COLORS.text, display: "flex", alignItems: "center", justifyContent: "center",
                animation: listening ? "familia-pulse 1.2s ease-out infinite" : "none"
              }}><MicIcon size={17} /></button>
            </div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 14, lineHeight: 1.5 }}>
              {listening ? "Listening. Tap the red mic when you're done." : "To talk instead of typing: tap the box, then the 🎤 on your keyboard."}
            </div>
            {error && <div style={{ fontSize: 13, color: COLORS.expense, marginBottom: 14, lineHeight: 1.5 }}>{error}</div>}
            {supported && !micOff && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 12, color: COLORS.muted }}>Mic language</span>
                <div style={{ display: "flex", background: COLORS.border, borderRadius: 8, padding: 2, gap: 2, flex: 1 }}>
                  {VOICE_LANGS.map(l => <button key={l.id} onClick={() => switchLang(l.id)} style={pill(lang === l.id)}>{l.label}</button>)}
                </div>
              </div>
            )}
            <button onClick={done} disabled={!text.trim() && !listening} style={{
              width: "100%", background: COLORS.text, color: "#fff", border: "none", borderRadius: 12, padding: 16, fontSize: 15, cursor: "pointer",
              fontFamily: "'Georgia', serif", opacity: !text.trim() && !listening ? 0.5 : 1
            }}>Done</button>
            <button onClick={() => { stopListening(); onTypeInstead(); }} style={{ width: "100%", background: "none", border: "none", color: COLORS.muted, fontSize: 13, padding: 12, cursor: "pointer", fontFamily: "'Georgia', serif" }}>Fill in a form instead</button>
          </>
        )}

        {entries && (
          <>
            {note && <div style={{ fontSize: 13, color: COLORS.muted, fontStyle: "italic", background: COLORS.bg, borderRadius: 8, padding: "10px 12px", marginBottom: 12, lineHeight: 1.5 }}>{note}</div>}
            {entries.map((x: any, i: number) => (
              <div key={i} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", background: COLORS.border, borderRadius: 8, padding: 2, gap: 2, flex: 1 }}>
                    {["expense", "income"].map(t => <button key={t} onClick={() => setEntry(i, "type", t)} style={pill(x.type === t, t === "income" ? COLORS.income : COLORS.expense)}>{t === "income" ? "Income" : "Expense"}</button>)}
                  </div>
                  <button onClick={() => removeEntry(i)} aria-label="Remove" style={{ background: "none", border: "none", fontSize: 20, color: COLORS.muted, cursor: "pointer", padding: "0 4px" }}>×</button>
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input type="number" step="0.01" inputMode="decimal" value={x.amount} onChange={e => setEntry(i, "amount", e.target.value)} style={{ ...small, flex: 1, minWidth: 0 }} />
                  <select value={x.category} onChange={e => setEntry(i, "category", e.target.value)} style={{ ...small, flex: 2, minWidth: 0 }}>
                    {CATEGORIES[x.type as keyof typeof CATEGORIES].map((c: string) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <input type="text" value={x.description} onChange={e => setEntry(i, "description", e.target.value)} placeholder="Description" style={{ ...small, marginBottom: 8 }} />
                {x.type === "expense" && <div style={{ marginBottom: 8 }}><PaidWithPicker small value={x.paid_with} onChange={(v: string) => setEntry(i, "paid_with", v)} /></div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="date" value={x.date} onChange={e => setEntry(i, "date", e.target.value)} style={{ ...small, flex: 1, minWidth: 0 }} />
                  <div style={{ display: "flex", background: COLORS.border, borderRadius: 8, padding: 2, gap: 2, flex: 1 }}>
                    {Object.entries(USERS).map(([k, name]) => <button key={k} onClick={() => setEntry(i, "who", k)} style={pill(x.who === k, k === "gabriel" ? COLORS.gabriel : COLORS.steph)}>{name}</button>)}
                  </div>
                </div>
                {alreadySaved(x) && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8, background: "#fdf3e1", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#8a5a00", lineHeight: 1.4 }}>
                    <span>{lang.startsWith("es") ? "Ya está guardado. No lo guardo otra\u00a0vez." : "Already saved, so I won't save it\u00a0again."}</span>
                    <button onClick={() => setEntry(i, "keep", true)} style={{ background: "none", border: "1px solid #e0c48f", borderRadius: 6, padding: "4px 8px", fontSize: 12, color: "#8a5a00", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "'Georgia', serif" }}>{lang.startsWith("es") ? "Guardar igual" : "Save it anyway"}</button>
                  </div>
                )}
              </div>
            ))}
            <button onClick={save} disabled={saving || !ready.length} style={{
              width: "100%", background: COLORS.text, color: "#fff", border: "none", borderRadius: 12, padding: 16, fontSize: 15, cursor: "pointer",
              fontFamily: "'Georgia', serif", marginTop: 6, opacity: saving || !ready.length ? 0.5 : 1
            }}>{saving ? "Saving..." : !ready.length ? "Nothing new to save" : ready.length === 1 ? "Save 1 entry" : `Save ${ready.length} entries`}</button>
            <button onClick={startOver} style={{ width: "100%", background: "none", border: "none", color: COLORS.muted, fontSize: 13, padding: 12, cursor: "pointer", fontFamily: "'Georgia', serif" }}>Start over</button>
          </>
        )}
        {error && entries && <div style={{ fontSize: 13, color: COLORS.expense, textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>{error}</div>}
      </div>
    </div>
  );
}

function AddTransactionModal({ onAdd, onClose, user, saving, onSayIt }: any) {
  const [form, setForm] = useState({ type: "expense", date: today(), amount: "", category: CATEGORIES.expense[0], description: "", paid_with: lastPaidWith() });
  const cats = CATEGORIES[form.type as keyof typeof CATEGORIES];
  const set = (k: string, v: any) => setForm((f: any) => withPaidWith(f, k, v));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: COLORS.card, borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 430, margin: "0 auto", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: COLORS.text }}>Add transaction</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={onSayIt} aria-label="Say it instead" style={{ display: "flex", alignItems: "center", gap: 5, background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 999, padding: "6px 11px", fontSize: 12, cursor: "pointer", color: COLORS.text, fontFamily: "'Georgia', serif" }}><MicIcon size={14} />Say it</button>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: COLORS.muted }}>×</button>
          </div>
        </div>
        <div style={{ display: "flex", background: COLORS.border, borderRadius: 10, padding: 3, marginBottom: 20 }}>
          {["expense", "income"].map(t => (
            <button key={t} onClick={() => set("type", t)} style={{
              flex: 1, background: form.type === t ? COLORS.card : "transparent", border: "none", borderRadius: 8, padding: "8px", fontSize: 14,
              cursor: "pointer", color: form.type === t ? (t === "income" ? COLORS.income : COLORS.expense) : COLORS.muted,
              fontFamily: "'Georgia', serif", fontWeight: form.type === t ? 500 : 400
            }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
        {[
          { label: "Amount (USD)", el: <input type="number" step="0.01" value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" style={inputStyle} /> },
          { label: "Category", el: <select value={form.category} onChange={e => set("category", e.target.value)} style={inputStyle}>{cats.map((c: string) => <option key={c}>{c}</option>)}</select> },
          ...(form.type === "expense" ? [{ label: "Paid with", el: <PaidWithPicker value={form.paid_with} onChange={(v: string) => set("paid_with", v)} /> }] : []),
          { label: "Date", el: <input type="date" value={form.date} onChange={e => set("date", e.target.value)} style={inputStyle} /> },
          { label: "Description (optional)", el: <input type="text" value={form.description} onChange={e => set("description", e.target.value)} placeholder="e.g. Saturday market" style={inputStyle} /> },
        ].map(({ label, el }) => (
          <div key={label} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 6 }}>{label}</div>
            {el}
          </div>
        ))}
        <button onClick={() => { if (!form.amount) return; if (form.type === "expense" && form.category !== CARD_PAYMENT) rememberPaidWith(form.paid_with); onAdd(form); }} disabled={saving} style={{ width: "100%", background: COLORS.text, color: "#fff", border: "none", borderRadius: 12, padding: 16, fontSize: 15, cursor: "pointer", fontFamily: "'Georgia', serif", marginTop: 8, opacity: saving ? 0.5 : 1 }}>{saving ? "Saving..." : "Add transaction"}</button>
      </div>
    </div>
  );
}

function AddGoalModal({ onAdd, onClose, user }: any) {
  const [form, setForm] = useState({ name: "", target: "", type: "Family Goal", deadline: "" });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: COLORS.card, borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 430, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>New goal</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: COLORS.muted }}>×</button>
        </div>
        {[
          { label: "Goal name", el: <input type="text" value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Europe trip, Build our home" style={inputStyle} /> },
          { label: "Target amount (USD)", el: <input type="number" value={form.target} onChange={e => set("target", e.target.value)} placeholder="10000" style={inputStyle} /> },
          { label: "Type", el: <select value={form.type} onChange={e => set("type", e.target.value)} style={inputStyle}>{GOAL_TYPES.map(t => <option key={t}>{t}</option>)}</select> },
          { label: "Target date (optional)", el: <input type="date" value={form.deadline} onChange={e => set("deadline", e.target.value)} style={inputStyle} /> },
        ].map(({ label, el }) => (
          <div key={label} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 6 }}>{label}</div>
            {el}
          </div>
        ))}
        <button onClick={() => { if (form.name && form.target) onAdd(form); }} style={{ width: "100%", background: COLORS.text, color: "#fff", border: "none", borderRadius: 12, padding: 16, fontSize: 15, cursor: "pointer", fontFamily: "'Georgia', serif", marginTop: 8 }}>Create goal</button>
      </div>
    </div>
  );
}

function BottomNav({ tab, onTab, onAdd }: any) {
  const tabs = [
    { id: "dashboard", label: "Overview", icon: "◉" },
    { id: "transactions", label: "Entries", icon: "≡" },
    { id: "goals", label: "Goals", icon: "◎" },
  ];
  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: COLORS.card, borderTop: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", padding: "8px 0 20px", zIndex: 10 }}>
      {tabs.map((t, i) => (
        <div key={t.id} style={{ display: "contents" }}>
          <button onClick={() => onTab(t.id)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "6px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 18, color: tab === t.id ? COLORS.text : COLORS.muted }}>{t.icon}</span>
            <span style={{ fontSize: 10, color: tab === t.id ? COLORS.text : COLORS.muted, fontFamily: "'Georgia', serif" }}>{t.label}</span>
          </button>
          {i === 1 && (
            <button onClick={onAdd} aria-label="Add entry" style={{ width: 52, height: 52, borderRadius: "50%", background: COLORS.text, border: "none", cursor: "pointer", color: "#fff", fontSize: 28, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", flexShrink: 0, marginTop: -10 }}>+</button>
          )}
        </div>
      ))}
    </div>
  );
}

const inputStyle: any = {
  width: "100%", border: `1px solid #e8e4dc`, borderRadius: 8,
  padding: "10px 12px", fontSize: 14, fontFamily: "'Georgia', serif",
  boxSizing: "border-box", background: "#faf8f4", color: "#1a1a1a"
};