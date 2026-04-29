"use client";
import { useState, useEffect, useCallback } from "react";

const USERS = { gabriel: "Gabriel", steph: "Steph" };

const CATEGORIES = {
  expense: ["Food & Groceries", "Eating Out", "Rent", "Utilities", "Car & Transport", "Kids", "Medical", "Clothing", "Cleaning", "Education", "Leisure & Travel", "Personal Care", "Family Events", "Business", "Other"],
  income: ["Dr. Tena / Coaching", "Sound Journey", "ECG Creations", "Vibraçao", "Freelance", "Other Income"]
};

const GOAL_TYPES = ["Family Goal", "Personal Goal"];

const COLORS = {
  gabriel: "#1a6b4a",
  steph: "#8b4a8b",
  income: "#1a6b4a",
  expense: "#c0392b",
  bg: "#faf8f4",
  card: "#ffffff",
  accent: "#d4a853",
  text: "#1a1a1a",
  muted: "#6b6b6b",
  border: "#e8e4dc"
};

const fmt = (n: any) => "$" + Math.abs(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtSigned = (n: any) => (n >= 0 ? "+" : "-") + fmt(n);
const today = () => new Date().toISOString().split("T")[0];
const monthKey = (d: any) => d.slice(0, 7);
const currentMonth = () => monthKey(today());

function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [transactions, setTransactions] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [viewMode, setViewMode] = useState("family");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [txRes, goalRes] = await Promise.all([
        window.storage.get("transactions", true).catch(() => null),
        window.storage.get("goals", true).catch(() => null)
      ]);
      if (txRes?.value) setTransactions(JSON.parse(txRes.value));
      if (goalRes?.value) setGoals(JSON.parse(goalRes.value));
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => { if (user) loadData(); }, [user, loadData]);

  const saveTransactions = async (tx) => {
    setSaving(true);
    try { await window.storage.set("transactions", JSON.stringify(tx), true); } catch (e) {}
    setSaving(false);
  };

  const saveGoals = async (g) => {
    try { await window.storage.set("goals", JSON.stringify(g), true); } catch (e) {}
  };

  const addTransaction = async (t) => {
    const updated = [{ ...t, id: generateId(), createdBy: user, createdAt: new Date().toISOString() }, ...transactions];
    setTransactions(updated);
    await saveTransactions(updated);
    setShowAdd(false);
  };

  const deleteTransaction = async (id) => {
    const updated = transactions.filter(t => t.id !== id);
    setTransactions(updated);
    await saveTransactions(updated);
  };

  const addGoal = async (g) => {
    const updated = [...goals, { ...g, id: generateId(), createdBy: user, saved: 0, createdAt: new Date().toISOString() }];
    setGoals(updated);
    await saveGoals(updated);
    setShowAddGoal(false);
  };

  const updateGoalSaved = async (id, amount) => {
    const updated = goals.map(g => g.id === id ? { ...g, saved: Math.max(0, (g.saved || 0) + Number(amount)) } : g);
    setGoals(updated);
    await saveGoals(updated);
  };

  const deleteGoal = async (id) => {
    const updated = goals.filter(g => g.id !== id);
    setGoals(updated);
    await saveGoals(updated);
  };

  const filteredTx = transactions.filter(t => {
    const inMonth = monthKey(t.date) === selectedMonth;
    if (!inMonth) return false;
    if (viewMode === "family") return true;
    return t.createdBy === user;
  });

  const income = filteredTx.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expenses = filteredTx.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const net = income - expenses;

  const byCategory = filteredTx.filter(t => t.type === "expense").reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + Number(t.amount);
    return acc;
  }, {});

  const gabrielIncome = filteredTx.filter(t => t.type === "income" && t.createdBy === "gabriel").reduce((s, t) => s + Number(t.amount), 0);
  const stephIncome = filteredTx.filter(t => t.type === "income" && t.createdBy === "steph").reduce((s, t) => s + Number(t.amount), 0);
  const gabrielExpenses = filteredTx.filter(t => t.type === "expense" && t.createdBy === "gabriel").reduce((s, t) => s + Number(t.amount), 0);
  const stephExpenses = filteredTx.filter(t => t.type === "expense" && t.createdBy === "steph").reduce((s, t) => s + Number(t.amount), 0);

  const months = [...new Set(transactions.map(t => monthKey(t.date)))].sort().reverse();
  if (!months.includes(currentMonth())) months.unshift(currentMonth());

  if (!user) return <LoginScreen onLogin={setUser} />;

  return (
    <div style={{ fontFamily: "'Georgia', serif", background: COLORS.bg, minHeight: "100vh", maxWidth: 430, margin: "0 auto", position: "relative" }}>
      <Header user={user} onLogout={() => setUser(null)} saving={saving} onRefresh={loadData} />

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: COLORS.muted, fontStyle: "italic" }}>Loading family data...</div>
      ) : (
        <div style={{ padding: "0 0 100px" }}>
          {tab === "dashboard" && (
            <Dashboard
              income={income} expenses={expenses} net={net}
              gabrielIncome={gabrielIncome} stephIncome={stephIncome}
              gabrielExpenses={gabrielExpenses} stephExpenses={stephExpenses}
              byCategory={byCategory} filteredTx={filteredTx}
              selectedMonth={selectedMonth} months={months}
              onMonthChange={setSelectedMonth}
              viewMode={viewMode} onViewModeChange={setViewMode}
              user={user}
            />
          )}
          {tab === "transactions" && (
            <Transactions filteredTx={filteredTx} onDelete={deleteTransaction} user={user}
              selectedMonth={selectedMonth} months={months} onMonthChange={setSelectedMonth}
              viewMode={viewMode} onViewModeChange={setViewMode} />
          )}
          {tab === "goals" && (
            <Goals goals={goals} onAddGoal={() => setShowAddGoal(true)} onUpdateSaved={updateGoalSaved} onDelete={deleteGoal} user={user} />
          )}
        </div>
      )}

      <BottomNav tab={tab} onTab={setTab} onAdd={() => setShowAdd(true)} />

      {showAdd && <AddTransactionModal onAdd={addTransaction} onClose={() => setShowAdd(false)} user={user} />}
      {showAddGoal && <AddGoalModal onAdd={addGoal} onClose={() => setShowAddGoal(false)} user={user} />}
    </div>
  );
}

function LoginScreen({ onLogin }) {
  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ marginBottom: 12, fontSize: 40 }}>🌿</div>
      <h1 style={{ fontFamily: "'Georgia', serif", fontSize: 26, fontWeight: 400, color: COLORS.text, margin: "0 0 6px", letterSpacing: -0.5 }}>Familia</h1>
      <p style={{ color: COLORS.muted, fontSize: 14, margin: "0 0 40px", textAlign: "center", lineHeight: 1.6 }}>Your shared family finance tracker</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", maxWidth: 280 }}>
        {Object.entries(USERS).map(([key, name]) => (
          <button key={key} onClick={() => onLogin(key)} style={{
            background: key === "gabriel" ? COLORS.gabriel : COLORS.steph,
            color: "#fff", border: "none", borderRadius: 12, padding: "16px 24px",
            fontSize: 16, fontFamily: "'Georgia', serif", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 12, letterSpacing: 0.3
          }}>
            <span style={{ fontSize: 22 }}>{key === "gabriel" ? "🌱" : "🌸"}</span>
            <span>I'm {name}</span>
          </button>
        ))}
      </div>
      <p style={{ color: COLORS.muted, fontSize: 12, marginTop: 32, textAlign: "center", lineHeight: 1.7 }}>
        Data is shared in real time.<br />Both of you see the same picture.
      </p>
    </div>
  );
}

function Header({ user, onLogout, saving, onRefresh }) {
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

function MonthPicker({ months, selected, onChange }) {
  return (
    <select value={selected} onChange={e => onChange(e.target.value)} style={{
      border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 10px",
      fontSize: 13, background: COLORS.card, color: COLORS.text, cursor: "pointer",
      fontFamily: "'Georgia', serif"
    }}>
      {months.map(m => <option key={m} value={m}>{new Date(m + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })}</option>)}
    </select>
  );
}

function ViewToggle({ viewMode, onChange }) {
  return (
    <div style={{ display: "flex", background: COLORS.border, borderRadius: 8, padding: 2, gap: 2 }}>
      {["family", "mine"].map(v => (
        <button key={v} onClick={() => onChange(v)} style={{
          background: viewMode === v ? COLORS.card : "transparent",
          border: "none", borderRadius: 6, padding: "5px 12px",
          fontSize: 12, cursor: "pointer", color: viewMode === v ? COLORS.text : COLORS.muted,
          fontFamily: "'Georgia', serif", transition: "all 0.15s"
        }}>{v === "family" ? "Family" : "Mine"}</button>
      ))}
    </div>
  );
}

function Dashboard({ income, expenses, net, gabrielIncome, stephIncome, gabrielExpenses, stephExpenses, byCategory, filteredTx, selectedMonth, months, onMonthChange, viewMode, onViewModeChange, user }) {
  const topCats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCat = topCats[0]?.[1] || 1;

  const budgetGuide = [
    { label: "Needs (50%)", target: income * 0.5, color: "#4a9b7f" },
    { label: "Wants (15%)", target: income * 0.15, color: COLORS.accent },
    { label: "Savings (20%)", target: income * 0.2, color: COLORS.gabriel },
    { label: "Investment (15%)", target: income * 0.15, color: COLORS.steph },
  ];

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <MonthPicker months={months} selected={selectedMonth} onChange={onMonthChange} />
        <ViewToggle viewMode={viewMode} onChange={onViewModeChange} />
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
          <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.text, marginBottom: 14 }}>Top spending categories</div>
          {topCats.map(([cat, amt]) => (
            <div key={cat} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: COLORS.text }}>{cat}</span>
                <span style={{ fontSize: 12, color: COLORS.muted }}>{fmt(amt)}</span>
              </div>
              <div style={{ height: 4, background: COLORS.border, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(amt / maxCat) * 100}%`, background: COLORS.accent, borderRadius: 2, transition: "width 0.4s" }} />
              </div>
            </div>
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

function Transactions({ filteredTx, onDelete, user, selectedMonth, months, onMonthChange, viewMode, onViewModeChange }) {
  const sorted = [...filteredTx].sort((a, b) => new Date(b.date) - new Date(a.date));
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <MonthPicker months={months} selected={selectedMonth} onChange={onMonthChange} />
        <ViewToggle viewMode={viewMode} onChange={onViewModeChange} />
      </div>
      {sorted.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: COLORS.muted, fontStyle: "italic" }}>No transactions yet this month</div>
      ) : (
        sorted.map(t => (
          <div key={t.id} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, background: t.type === "income" ? "#e8f5ee" : "#fdecea", color: t.type === "income" ? COLORS.income : COLORS.expense, borderRadius: 4, padding: "2px 6px", fontWeight: 500 }}>{t.type}</span>
                  <span style={{ fontSize: 10, color: t.createdBy === "gabriel" ? COLORS.gabriel : COLORS.steph }}>{t.createdBy === "gabriel" ? "🌱" : "🌸"}</span>
                </div>
                <div style={{ fontSize: 14, color: COLORS.text, marginBottom: 2 }}>{t.description || t.category}</div>
                <div style={{ fontSize: 11, color: COLORS.muted }}>{t.category} · {t.date}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 500, color: t.type === "income" ? COLORS.income : COLORS.expense }}>
                  {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                </div>
                {t.createdBy === user && (
                  <button onClick={() => onDelete(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Goals({ goals, onAddGoal, onUpdateSaved, onDelete, user }) {
  const [contributing, setContributing] = useState(null);
  const [amount, setAmount] = useState("");

  const familyGoals = goals.filter(g => g.type === "Family Goal");
  const personalGoals = goals.filter(g => g.type === "Personal Goal" && g.createdBy === user);

  const GoalCard = ({ g }) => {
    const pct = Math.min(100, ((g.saved || 0) / g.target) * 100);
    return (
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text, marginBottom: 2 }}>{g.name}</div>
            <div style={{ fontSize: 11, color: COLORS.muted }}>{g.type} {g.type === "Personal Goal" ? `· ${g.createdBy === "gabriel" ? "🌱" : "🌸"}` : ""}</div>
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
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" style={{ flex: 1, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 14, fontFamily: "'Georgia', serif" }} />
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

      {familyGoals.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: COLORS.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Family goals</div>
          {familyGoals.map(g => <GoalCard key={g.id} g={g} />)}
        </>
      )}

      {personalGoals.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: COLORS.muted, letterSpacing: 1, textTransform: "uppercase", margin: "20px 0 12px" }}>My personal goals</div>
          {personalGoals.map(g => <GoalCard key={g.id} g={g} />)}
        </>
      )}

      {goals.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: COLORS.muted }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
          <div style={{ fontStyle: "italic" }}>No goals yet. Add your first one — a trip to Europe, building a home...</div>
        </div>
      )}

      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16, marginTop: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.text, marginBottom: 12 }}>Proven savings strategies</div>
        {[
          { emoji: "🏦", title: "Emergency fund first", desc: "6 months of expenses in a separate account. Never touch it except for emergencies." },
          { emoji: "✈️", title: "Vacation fund", desc: "5% of net income monthly into a dedicated travel account." },
          { emoji: "🏠", title: "Home fund", desc: "10–20% of net income toward your down payment or build fund." },
          { emoji: "📈", title: "Investment rule", desc: "Minimum 10% of net income invested — index funds, real estate, or business." },
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

function AddTransactionModal({ onAdd, onClose, user }) {
  const [form, setForm] = useState({ type: "expense", date: today(), amount: "", category: CATEGORIES.expense[0], description: "" });
  const cats = CATEGORIES[form.type];

  const set = (k, v) => setForm(f => ({ ...f, [k]: v, ...(k === "type" ? { category: CATEGORIES[v][0] } : {}) }));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: COLORS.card, borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 430, margin: "0 auto", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: COLORS.text }}>Add transaction</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: COLORS.muted }}>×</button>
        </div>

        <div style={{ display: "flex", background: COLORS.border, borderRadius: 10, padding: 3, marginBottom: 20 }}>
          {["expense", "income"].map(t => (
            <button key={t} onClick={() => set("type", t)} style={{
              flex: 1, background: form.type === t ? COLORS.card : "transparent",
              border: "none", borderRadius: 8, padding: "8px", fontSize: 14,
              cursor: "pointer", color: form.type === t ? (t === "income" ? COLORS.income : COLORS.expense) : COLORS.muted,
              fontFamily: "'Georgia', serif", fontWeight: form.type === t ? 500 : 400
            }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
          ))}
        </div>

        {[
          { label: "Amount (USD)", el: <input type="number" value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" style={inputStyle} /> },
          { label: "Category", el: <select value={form.category} onChange={e => set("category", e.target.value)} style={inputStyle}>{cats.map(c => <option key={c}>{c}</option>)}</select> },
          { label: "Date", el: <input type="date" value={form.date} onChange={e => set("date", e.target.value)} style={inputStyle} /> },
          { label: "Description (optional)", el: <input type="text" value={form.description} onChange={e => set("description", e.target.value)} placeholder="e.g. Saturday market" style={inputStyle} /> },
        ].map(({ label, el }) => (
          <div key={label} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 6 }}>{label}</div>
            {el}
          </div>
        ))}

        <button onClick={() => { if (form.amount) onAdd(form); }} style={{
          width: "100%", background: COLORS.text, color: "#fff", border: "none",
          borderRadius: 12, padding: 16, fontSize: 15, cursor: "pointer",
          fontFamily: "'Georgia', serif", marginTop: 8
        }}>Add transaction</button>
      </div>
    </div>
  );
}

function AddGoalModal({ onAdd, onClose, user }) {
  const [form, setForm] = useState({ name: "", target: "", type: "Family Goal", deadline: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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

        <button onClick={() => { if (form.name && form.target) onAdd(form); }} style={{
          width: "100%", background: COLORS.text, color: "#fff", border: "none",
          borderRadius: 12, padding: 16, fontSize: 15, cursor: "pointer",
          fontFamily: "'Georgia', serif", marginTop: 8
        }}>Create goal</button>
      </div>
    </div>
  );
}

function BottomNav({ tab, onTab, onAdd }) {
  const tabs = [
    { id: "dashboard", label: "Overview", icon: "◉" },
    { id: "transactions", label: "Entries", icon: "≡" },
    { id: "goals", label: "Goals", icon: "◎" },
  ];
  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: COLORS.card, borderTop: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", padding: "8px 0 20px", zIndex: 10 }}>
      {tabs.map((t, i) => (
        <>
          <button key={t.id} onClick={() => onTab(t.id)} style={{
            flex: 1, background: "none", border: "none", cursor: "pointer", padding: "6px 0",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3
          }}>
            <span style={{ fontSize: 18, color: tab === t.id ? COLORS.text : COLORS.muted }}>{t.icon}</span>
            <span style={{ fontSize: 10, color: tab === t.id ? COLORS.text : COLORS.muted, fontFamily: "'Georgia', serif" }}>{t.label}</span>
          </button>
          {i === 1 && (
            <button onClick={onAdd} style={{
              width: 52, height: 52, borderRadius: "50%", background: COLORS.text,
              border: "none", cursor: "pointer", color: "#fff", fontSize: 24,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 16px rgba(0,0,0,0.2)", flexShrink: 0, marginTop: -10
            }}>+</button>
          )}
        </>
      ))}
    </div>
  );
}

const inputStyle = {
  width: "100%", border: `1px solid #e8e4dc`, borderRadius: 8,
  padding: "10px 12px", fontSize: 14, fontFamily: "'Georgia', serif",
  boxSizing: "border-box", background: "#faf8f4", color: "#1a1a1a"
};