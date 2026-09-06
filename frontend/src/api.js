export const URLs = {
  auth: "http://localhost:8081",
  catalog: "http://localhost:8082",
  inventory: "http://localhost:8083",
  orders: "http://localhost:8084",
  payments: "http://localhost:8085",
  notifications: "http://localhost:8086",
  analytics: "http://localhost:8087"
};

export async function request(url, options={}) {
  const res = await fetch(url, {
    ...options,
    headers: {"Content-Type":"application/json", ...(options.headers||{})}
  });
  if (res.status===204) return null;
  const body = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(body.error || body.detail || `HTTP ${res.status}`);
  return body;
}
