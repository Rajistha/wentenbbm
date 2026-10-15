"use client";

const KEY = "wenten-device";

/** ID acak per perangkat (bukan data pribadi), dipakai untuk menghitung pengunjung tanpa melacak orangnya. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id || id.length < 16) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // mode privat tanpa penyimpanan: ID sementara untuk sesi ini saja
    return crypto.randomUUID();
  }
}
