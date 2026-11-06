/**
 * IndexedDB-backed media store for the demo adapter.
 *
 * localStorage caps out around ~5 MB — a handful of catalogue photos and the
 * demo library is full. Media assets (metadata + data URLs) live here instead;
 * the demo DB in localStorage keeps the rest of the admin state.
 *
 * All methods degrade to no-ops/empty results outside browsers (SSR/prerender).
 */
import type { AdminMediaAsset } from "@/api/types";

const DB_NAME = "woodex.media.v1";
const STORE = "assets";

const hasIdb = () => typeof indexedDB !== "undefined";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

async function withStore<TResult>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<TResult>[],
): Promise<TResult[]> {
  const db = await openDb();
  try {
    return await new Promise<TResult[]>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const requests = run(t.objectStore(STORE));
      if (requests.length === 0) return resolve([]);
      const results = new Array<TResult>(requests.length);
      let pending = requests.length;
      const done = () => {
        if (--pending === 0) resolve(results);
      };
      requests.forEach((r, i) => {
        r.onsuccess = () => { results[i] = r.result as TResult; done(); };
        r.onerror = () => reject(r.error ?? new Error("media store request failed"));
      });
      t.onerror = () => reject(t.error ?? new Error("media store transaction failed"));
    });
  } finally {
    db.close();
  }
}

export async function idbGetAll(): Promise<AdminMediaAsset[]> {
  if (!hasIdb()) return [];
  const db = await openDb();
  try {
    const rows = await new Promise<AdminMediaAsset[]>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as AdminMediaAsset[]) ?? []);
      req.onerror = () => reject(req.error ?? new Error("media store read failed"));
    });
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export async function idbPutMany(assets: AdminMediaAsset[]): Promise<void> {
  if (!hasIdb() || assets.length === 0) return;
  await withStore("readwrite", (s) => assets.map((a) => s.put(a) as IDBRequest<IDBValidKey>));
}

export async function idbDeleteMany(ids: string[]): Promise<number> {
  if (!hasIdb() || ids.length === 0) return 0;
  const results = await withStore("readwrite", (s) => ids.map((id) => s.delete(id) as IDBRequest<IDBValidKey>));
  return results.length;
}
