export const formatCurrency = (val) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);

export const formatPct = (v, decimals = 2) => `${(v * 100).toFixed(decimals)}%`;

export function dscrColor(v, t) {
  if (v >= t.low) return "var(--pass)";
  return "var(--fail)";
}

export function dscrClass(v, t) {
  if (v >= t.low) return "green";
  return "red";
}

export function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}
