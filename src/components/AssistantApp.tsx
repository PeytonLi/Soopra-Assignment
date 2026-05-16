"use client";

import { FormEvent, KeyboardEvent, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  AlertTriangle,
  Clock,
  Flame,
  Leaf,
  MapPin,
  Minus,
  Plus,
  QrCode,
  Search,
  Send,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Utensils,
} from "lucide-react";

import { menuCategories, menuItems, restaurant } from "@/data/menu";
import {
  extractConstraintsFromText,
  formatAllergen,
  formatNutrition,
  getItemWarnings,
  getMenuItemById,
  recommendItems,
} from "@/lib/menu";
import { buildPickupSummary, getCartTotals, type PickupSummary } from "@/lib/orders";
import { ALLERGENS, type Allergen, type CartItem, type ChatMessage, type ChatResponse, type CustomerConstraints, type DietaryFlag, type MenuCategory, type MenuItem } from "@/types";

type OrderSaveState = {
  status: "idle" | "saving" | "saved" | "local" | "error";
  orderId?: string | null;
  message?: string;
};

type OrderSubmitResponse = {
  ok: boolean;
  configured: boolean;
  orderId: string | null;
  message: string;
};

const quickPrompts = [
  "What are your spicy vegetarian options?",
  "High-protein meal under 650 calories",
  "I have a dairy allergy. What should I avoid?",
  "Can I order two Harvest Bowls for pickup?",
  "What are your hours and location?",
];

const initialMessages: ChatMessage[] = [
  {
    role: "assistant",
    content:
      "Hi. I can help with Sweetgreen Berkeley menu questions, nutrition, allergy-aware suggestions, and a mock pickup order.",
  },
];

const defaultConstraints: CustomerConstraints = {
  allergens: [],
  avoidIngredients: [],
  dietaryPrefs: [],
  nutritionGoal: "balanced",
};

export function AssistantApp() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [suggestedIds, setSuggestedIds] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<CustomerConstraints>(defaultConstraints);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [category, setCategory] = useState<MenuCategory | "All">("All");
  const [search, setSearch] = useState("");
  const [avoidDraft, setAvoidDraft] = useState("");
  const [sessionId] = useState(() => {
    if (typeof window === "undefined") return "";
    const stored = window.localStorage.getItem("sg-session-id");
    const next = stored || crypto.randomUUID();
    window.localStorage.setItem("sg-session-id", next);
    return next;
  });
  const [customerName, setCustomerName] = useState("");
  const [pickupTime, setPickupTime] = useState("12:30");
  const [pickupSummary, setPickupSummary] = useState<PickupSummary | null>(null);
  const [orderSaveState, setOrderSaveState] = useState<OrderSaveState>({ status: "idle" });

  const recommendations = useMemo(() => recommendItems(constraints, input || search, 4), [constraints, input, search]);
  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return menuItems.filter((item) => {
      const categoryMatch = category === "All" || item.category === category;
      const searchMatch =
        !normalizedSearch ||
        [item.name, item.description, item.category, item.ingredients.join(" ")].join(" ").toLowerCase().includes(normalizedSearch);
      return categoryMatch && searchMatch;
    });
  }, [category, search]);
  const suggestedItems = suggestedIds.map(getMenuItemById).filter((item): item is MenuItem => Boolean(item));
  const totals = getCartTotals(cart);

  async function logEvent(eventType: string, payload: Record<string, unknown>) {
    if (!sessionId) return;
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, eventType, payload }),
    }).catch(() => undefined);
  }

  async function handleSubmit(event?: FormEvent, promptOverride?: string) {
    event?.preventDefault();
    const text = (promptOverride ?? input).trim();
    if (!text || pending) return;

    const nextConstraints = extractConstraintsFromText(text, constraints);
    setConstraints(nextConstraints);
    setInput("");
    setPending(true);
    setPickupSummary(null);
    setOrderSaveState({ status: "idle" });

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, cart, constraints: nextConstraints }),
      });
      const data = (await response.json()) as ChatResponse;
      setMessages([...nextMessages, { role: "assistant", content: data.message, presentation: data.presentation }]);
      setSuggestedIds(data.suggestedItemIds ?? []);
      if (data.cartActionSuggestions?.length) {
        for (const suggestion of data.cartActionSuggestions) {
          const item = getMenuItemById(suggestion.menuItemId);
          if (item) addItemToCart(item, suggestion.quantity, false);
        }
      }
      const categories = (data.suggestedItemIds ?? [])
        .map(getMenuItemById)
        .filter((item): item is MenuItem => Boolean(item))
        .map((item) => item.category);
      void logEvent("chat_message", {
        hasAllergyFilter: nextConstraints.allergens.length > 0 || nextConstraints.avoidIngredients.length > 0,
        nutritionGoal: nextConstraints.nutritionGoal,
        categories,
      });
    } catch {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: "I could not reach the assistant route. The menu and cart still work locally.",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  function addItemToCart(item: MenuItem, quantity = 1, announce = true) {
    const warnings = getItemWarnings(item, constraints);
    if (warnings.length) {
      if (announce) {
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: `${item.name} is blocked by your current filters: ${warnings.join(" ")} For severe allergies, ask the team about cross-contact before ordering.`,
          },
        ]);
      }
      return;
    }

    setCart((current) => {
      const existing = current.find((cartItem) => cartItem.menuItemId === item.id);
      if (existing) {
        return current.map((cartItem) =>
          cartItem.menuItemId === item.id ? { ...cartItem, quantity: cartItem.quantity + quantity } : cartItem,
        );
      }
      return [...current, { menuItemId: item.id, quantity, allergyWarnings: warnings }];
    });
    setPickupSummary(null);
    setOrderSaveState({ status: "idle" });
  }

  function updateQuantity(id: string, delta: number) {
    setCart((current) =>
      current
        .map((item) => (item.menuItemId === id ? { ...item, quantity: item.quantity + delta } : item))
        .filter((item) => item.quantity > 0),
    );
    setPickupSummary(null);
    setOrderSaveState({ status: "idle" });
  }

  function toggleAllergen(allergen: Allergen) {
    setConstraints((current) => ({
      ...current,
      allergens: current.allergens.includes(allergen)
        ? current.allergens.filter((item) => item !== allergen)
        : [...current.allergens, allergen],
    }));
  }

  function toggleDietaryPref(pref: DietaryFlag) {
    setConstraints((current) => ({
      ...current,
      dietaryPrefs: current.dietaryPrefs.includes(pref)
        ? current.dietaryPrefs.filter((item) => item !== pref)
        : [...current.dietaryPrefs, pref],
      nutritionGoal:
        pref === "highProtein" && !current.dietaryPrefs.includes(pref)
          ? "highProtein"
          : pref === "lowerCalorie" && !current.dietaryPrefs.includes(pref)
            ? "lowerCalorie"
            : current.nutritionGoal,
    }));
  }

  function addAvoidIngredient() {
    const value = avoidDraft.trim().toLowerCase();
    if (!value) return;
    setConstraints((current) => ({
      ...current,
      avoidIngredients: Array.from(new Set([...current.avoidIngredients, value])),
    }));
    setAvoidDraft("");
  }

  function handleAvoidKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addAvoidIngredient();
    }
  }

  async function createPickupSummary() {
    if (!customerName.trim() || !pickupTime || cart.length === 0) return;
    const summary = buildPickupSummary(customerName, pickupTime, cart);
    setPickupSummary(summary);
    setOrderSaveState({ status: "saving", message: "Saving pickup request..." });

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          customerName,
          pickupTime,
          cart,
          constraints,
        }),
      });
      const result = (await response.json()) as OrderSubmitResponse;
      const nextStatus: OrderSaveState["status"] = result.ok ? "saved" : result.configured ? "error" : "local";

      setOrderSaveState({
        status: nextStatus,
        orderId: result.orderId,
        message: result.message,
      });

      void logEvent("order_summary", {
        itemCount: summary.itemCount,
        totalCalories: summary.totalNutrition.calories,
        hasAllergyFilter: constraints.allergens.length > 0 || constraints.avoidIngredients.length > 0,
        categories: cart.map((cartItem) => getMenuItemById(cartItem.menuItemId)?.category).filter(Boolean),
        orderSaved: result.ok,
      });
    } catch {
      setOrderSaveState({
        status: "error",
        orderId: null,
        message: "Summary created locally, but the order API could not be reached.",
      });
    }
  }

  return (
    <main className="app-shell">
      <motion.section
        className="business-strip"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div>
          <span className="eyebrow">Sweetgreen Berkeley</span>
          <h1>AI pickup assistant</h1>
        </div>
        <div className="business-facts">
          <span>
            <MapPin size={16} />
            {restaurant.address}
          </span>
          <span>
            <Clock size={16} />
            {restaurant.hours.weekdays}
          </span>
          <Link href="/qr">
            <QrCode size={16} />
            QR
          </Link>
        </div>
      </motion.section>

      <section className="workspace-grid">
        <div className="chat-column">
          <div className="chat-panel">
            <div className="section-title">
              <Sparkles size={20} />
              <h2>Assistant</h2>
            </div>
            <div className="message-list" aria-live="polite">
              <AnimatePresence initial={false}>
                {messages.map((message, index) => (
                  <motion.article
                    layout
                    key={`${message.role}-${index}`}
                    className={`message ${message.role}`}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <AssistantMessage message={message} />
                  </motion.article>
                ))}
                {pending ? (
                  <motion.article
                    layout
                    key="pending"
                    className="message assistant pending-message"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                  >
                    <p>Checking the menu data...</p>
                  </motion.article>
                ) : null}
              </AnimatePresence>
            </div>

            {suggestedItems.length ? (
              <div className="suggestion-row" aria-label="Suggested menu items">
                {suggestedItems.slice(0, 4).map((item) => (
                  <motion.button
                    key={item.id}
                    className="suggestion-chip"
                    onClick={() => addItemToCart(item)}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Plus size={14} />
                    {item.name}
                  </motion.button>
                ))}
              </div>
            ) : null}

            <form className="chat-form" onSubmit={handleSubmit}>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about macros, allergens, hours, or pickup"
                aria-label="Ask the assistant"
              />
              <button type="submit" disabled={pending || !input.trim()} aria-label="Send message">
                <Send size={18} />
              </button>
            </form>

            <div className="quick-prompts">
              {quickPrompts.map((prompt) => (
                <motion.button
                  key={prompt}
                  onClick={() => void handleSubmit(undefined, prompt)}
                  disabled={pending}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {prompt}
                </motion.button>
              ))}
            </div>
          </div>

          <div className="constraints-panel">
            <div className="section-title">
              <ShieldAlert size={20} />
              <h2>Filters</h2>
            </div>
            <div className="filter-group">
              {ALLERGENS.map((allergen) => (
                <label key={allergen} className="check-pill">
                  <input type="checkbox" checked={constraints.allergens.includes(allergen)} onChange={() => toggleAllergen(allergen)} />
                  {formatAllergen(allergen)}
                </label>
              ))}
            </div>
            <div className="filter-row">
              <button
                className={constraints.dietaryPrefs.includes("vegetarian") ? "toggle-button active" : "toggle-button"}
                onClick={() => toggleDietaryPref("vegetarian")}
              >
                <Leaf size={16} />
                Vegetarian
              </button>
              <button
                className={constraints.dietaryPrefs.includes("vegan") ? "toggle-button active" : "toggle-button"}
                onClick={() => toggleDietaryPref("vegan")}
              >
                <Leaf size={16} />
                Vegan
              </button>
              <button
                className={constraints.dietaryPrefs.includes("spicy") ? "toggle-button active" : "toggle-button"}
                onClick={() => toggleDietaryPref("spicy")}
              >
                <Flame size={16} />
                Spicy
              </button>
              <button
                className={constraints.dietaryPrefs.includes("highProtein") ? "toggle-button active" : "toggle-button"}
                onClick={() => toggleDietaryPref("highProtein")}
              >
                High protein
              </button>
              <button
                className={constraints.dietaryPrefs.includes("lowerCalorie") ? "toggle-button active" : "toggle-button"}
                onClick={() => toggleDietaryPref("lowerCalorie")}
              >
                Lower calorie
              </button>
            </div>
            <div className="avoid-row">
              <input
                value={avoidDraft}
                onChange={(event) => setAvoidDraft(event.target.value)}
                onKeyDown={handleAvoidKeyDown}
                placeholder="Avoid ingredient"
                aria-label="Ingredient to avoid"
              />
              <button onClick={addAvoidIngredient} aria-label="Add ingredient filter">
                <Plus size={16} />
              </button>
            </div>
            {constraints.avoidIngredients.length ? (
              <div className="mini-chip-row">
                {constraints.avoidIngredients.map((ingredient) => (
                  <button
                    key={ingredient}
                    onClick={() =>
                      setConstraints((current) => ({
                        ...current,
                        avoidIngredients: current.avoidIngredients.filter((item) => item !== ingredient),
                      }))
                    }
                  >
                    {ingredient}
                    <Minus size={12} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <aside className="side-column">
          <section className="cart-panel">
            <div className="section-title">
              <ShoppingBag size={20} />
              <h2>Pickup cart</h2>
            </div>
            {cart.length ? (
              <LayoutGroup>
                <div className="cart-list">
                  <AnimatePresence initial={false}>
                    {cart.map((cartItem) => {
                      const item = getMenuItemById(cartItem.menuItemId);
                      if (!item) return null;
                      return (
                        <motion.div
                          layout
                          key={cartItem.menuItemId}
                          className="cart-line"
                          initial={{ opacity: 0, x: 18, scale: 0.98 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, x: 18, scale: 0.98 }}
                        >
                          <div>
                            <strong>{item.name}</strong>
                            <span>{formatNutrition(item)}</span>
                          </div>
                          <div className="stepper" aria-label={`Quantity for ${item.name}`}>
                            <motion.button
                              onClick={() => updateQuantity(item.id, -1)}
                              aria-label="Decrease quantity"
                              whileTap={{ scale: 0.9 }}
                            >
                              <Minus size={14} />
                            </motion.button>
                            <motion.span
                              key={`${item.id}-${cartItem.quantity}`}
                              initial={{ y: 8, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                            >
                              {cartItem.quantity}
                            </motion.span>
                            <motion.button
                              onClick={() => updateQuantity(item.id, 1)}
                              aria-label="Increase quantity"
                              whileTap={{ scale: 0.9 }}
                            >
                              <Plus size={14} />
                            </motion.button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </LayoutGroup>
            ) : (
              <p className="muted-text">No items yet.</p>
            )}

            <div className="totals-row">
              <span>{totals.itemCount} items</span>
              <strong>
                {totals.calories} cal · {totals.protein}g protein
              </strong>
            </div>

            <div className="pickup-form">
              <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Pickup name" aria-label="Pickup name" />
              <input value={pickupTime} onChange={(event) => setPickupTime(event.target.value)} type="time" aria-label="Pickup time" />
              <button
                onClick={() => void createPickupSummary()}
                disabled={!customerName.trim() || !pickupTime || cart.length === 0 || orderSaveState.status === "saving"}
              >
                {orderSaveState.status === "saving" ? "Saving..." : "Create summary"}
              </button>
            </div>

            {pickupSummary ? (
              <motion.div
                className="summary-box"
                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <h3>Pickup summary</h3>
                <p>
                  {pickupSummary.customerName} · {pickupSummary.pickupTime}
                </p>
                {orderSaveState.status !== "idle" ? (
                  <p className={`order-status ${orderSaveState.status}`}>
                    {orderSaveState.status === "saved" && orderSaveState.orderId
                      ? `Saved to Supabase · ${orderSaveState.orderId.slice(0, 8)}`
                      : orderSaveState.message}
                  </p>
                ) : null}
                <ul>
                  {pickupSummary.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <strong>
                  {pickupSummary.totalNutrition.calories} cal · {pickupSummary.totalNutrition.protein}g protein ·{" "}
                  {pickupSummary.totalNutrition.carbs}g carbs · {pickupSummary.totalNutrition.fat}g fat
                </strong>
                <p className="warning-line">
                  <AlertTriangle size={14} />
                  {orderSaveState.status === "saved"
                    ? "Demo pickup request saved. This is not sent to Sweetgreen and no payment was collected."
                    : "Demo pickup request created locally. This is not sent to Sweetgreen and no payment was collected."}
                </p>
              </motion.div>
            ) : null}
          </section>

          <section className="recommendation-panel">
            <div className="section-title">
              <Utensils size={20} />
              <h2>Best matches</h2>
            </div>
            <div className="mini-menu-list">
              {recommendations.map((item) => (
                <MenuMini key={item.id} item={item} onAdd={() => addItemToCart(item)} />
              ))}
            </div>
          </section>
        </aside>
      </section>

      <section className="menu-section">
        <div className="menu-toolbar">
          <div className="section-title">
            <Utensils size={20} />
            <h2>Menu</h2>
          </div>
          <div className="search-box">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search menu" aria-label="Search menu" />
          </div>
        </div>
        <div className="category-tabs" role="tablist" aria-label="Menu categories">
          {(["All", ...menuCategories] as Array<MenuCategory | "All">).map((item) => (
            <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>
              {item}
            </button>
          ))}
        </div>
        <div className="menu-grid">
          {filteredItems.map((item) => (
            <MenuCard key={item.id} item={item} constraints={constraints} onAdd={() => addItemToCart(item)} />
          ))}
        </div>
      </section>
    </main>
  );
}

function stripUnsupportedMarkdown(value: string) {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .trim();
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  const content = message.role === "assistant" ? stripUnsupportedMarkdown(message.content) : message.content;

  if (message.role !== "assistant" || message.presentation?.variant !== "recommendationCards") {
    return <p>{content}</p>;
  }

  return (
    <div className="assistant-response">
      {content ? <p>{content}</p> : null}
      <div className="assistant-card-group" aria-label={message.presentation.heading}>
        <h3>{message.presentation.heading}</h3>
        <div className="assistant-rec-list">
          {message.presentation.cards.map((card) => (
            <article className="assistant-rec-card" key={card.menuItemId}>
              <div>
                <h4>{card.name}</h4>
                <p>{card.reason}</p>
              </div>
              <div className="assistant-macro-row" aria-label={`Macros for ${card.name}`}>
                <span>
                  <strong>{card.calories}</strong>
                  cal
                </span>
                <span>
                  <strong>{card.protein}g</strong>
                  protein
                </span>
                <span>
                  <strong>{card.carbs}g</strong>
                  carbs
                </span>
                <span>
                  <strong>{card.fat}g</strong>
                  fat
                </span>
              </div>
            </article>
          ))}
        </div>
        {message.presentation.notes?.length ? (
          <ul className="assistant-note-list">
            {message.presentation.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function MenuMini({ item, onAdd }: { item: MenuItem; onAdd: () => void }) {
  return (
    <motion.button className="mini-menu-item" onClick={onAdd} whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
      <span>{item.name}</span>
      <strong>{item.nutrition.protein}g protein</strong>
    </motion.button>
  );
}

function MenuCard({ item, constraints, onAdd }: { item: MenuItem; constraints: CustomerConstraints; onAdd: () => void }) {
  const warnings = getItemWarnings(item, constraints);
  const blocked = warnings.length > 0;

  return (
    <motion.article
      className={blocked ? "menu-card blocked" : "menu-card"}
      whileHover={blocked ? undefined : { y: -5 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="menu-card-header">
        <span className="category-label">{item.category}</span>
        <div className="flag-row">
          {item.dietaryFlags.includes("vegetarian") || item.dietaryFlags.includes("vegan") ? <Leaf size={15} aria-label="Vegetarian or vegan" /> : null}
          {item.dietaryFlags.includes("spicy") ? <Flame size={15} aria-label="Spicy" /> : null}
        </div>
      </div>
      <h3>{item.name}</h3>
      <p>{item.description}</p>
      <div className="macro-grid">
        <span>
          <strong>{item.nutrition.calories}</strong>
          cal
        </span>
        <span>
          <strong>{item.nutrition.protein}g</strong>
          protein
        </span>
        <span>
          <strong>{item.nutrition.carbs}g</strong>
          carbs
        </span>
        <span>
          <strong>{item.nutrition.fat}g</strong>
          fat
        </span>
      </div>
      <div className="allergen-row">
        {item.allergens.length ? item.allergens.map((allergen) => <span key={allergen}>{formatAllergen(allergen)}</span>) : <span>no top-9 flagged</span>}
      </div>
      {blocked ? <p className="blocked-note">{warnings.join(" ")}</p> : null}
      <motion.button className="add-button" onClick={onAdd} disabled={blocked} whileTap={{ scale: 0.98 }}>
        <Plus size={16} />
        Add
      </motion.button>
    </motion.article>
  );
}
