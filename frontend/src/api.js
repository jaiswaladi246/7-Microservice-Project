export const URLs = {
  auth: "/api/auth",
  catalog: "/api/catalog",
  inventory: "/api/inventory",
  orders: "/api/orders",
  payments: "/api/payments",
  notifications: "/api/notifications",
  analytics: "/api/analytics",
};

export async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (response.status === 204) return null;

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error ||
      data.detail ||
      `HTTP ${response.status}`
    );
  }

  return data;
}
