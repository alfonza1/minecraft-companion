import { useCallback, useEffect, useRef, useState } from "react";
import type { CompanionState } from "../../../packages/shared-types";

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/api${path}`,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
export function useCompanion() {
  const [state, setState] = useState<CompanionState | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout>;
    let disposed = false;
    const connect = async () => {
      try {
        const initial = await api<CompanionState>("/state");
        if (disposed) return;
        setState(initial);
        setError("");
        socket = new WebSocket(
          `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/events`,
        );
        socket.onopen = () => {
          setConnected(true);
          setError("");
        };
        socket.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === "state") setState(data.state);
          } catch {
            setError("An unreadable live update was received.");
          }
        };
        socket.onclose = () => {
          if (disposed) return;
          setConnected(false);
          retry = setTimeout(connect, 3000);
        };
        socket.onerror = () => socket?.close();
      } catch (e) {
        if (disposed) return;
        setError((e as Error).message);
        setConnected(false);
        retry = setTimeout(connect, 3000);
      }
    };
    void connect();
    return () => {
      disposed = true;
      mounted.current = false;
      clearTimeout(retry);
      socket?.close();
    };
  }, []);
  const mutate = useCallback(async (path: string, body: unknown = {}) => {
    setBusy(true);
    setError("");
    try {
      const result = await api(path, body);
      if (mounted.current) setState(await api<CompanionState>("/state"));
      return result;
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
      throw e;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);
  return {
    state,
    error,
    connected,
    busy,
    mutate,
    clearError: () => setError(""),
  };
}
