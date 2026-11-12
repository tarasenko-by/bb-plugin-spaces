// Shared client state for Spaces. Commands registered in definePluginApp run
// outside React and have no RPC hook, so the mounted header publishes its RPC
// client and latest state here.
import { useSyncExternalStore } from "react";
import type { PluginRpcClient } from "@get-bb/plugin-sdk/app";
import type { rpcContract, SpacesState } from "../server";

export type SpacesRpc = PluginRpcClient<typeof rpcContract>;

let rpc: SpacesRpc | null = null;
let state: SpacesState | null = null;
let editorOpen = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setRpc(client: SpacesRpc | null) {
  rpc = client;
}
export function getRpc(): SpacesRpc | null {
  return rpc;
}

export function setSpacesState(next: SpacesState) {
  state = next;
  emit();
}
export function getSpacesState(): SpacesState | null {
  return state;
}

export function setEditorOpen(open: boolean) {
  editorOpen = open;
  emit();
}

export function useSpacesState(): SpacesState | null {
  return useSyncExternalStore(subscribe, () => state);
}
export function useEditorOpen(): boolean {
  return useSyncExternalStore(subscribe, () => editorOpen);
}

/** Switch through the published RPC client; resolves false when not mounted. */
export async function switchSpace(spaceId: string): Promise<boolean> {
  if (rpc === null) return false;
  setSpacesState(await rpc.call("space_switch", { spaceId }));
  return true;
}

export async function showAllProjects(): Promise<boolean> {
  if (rpc === null) return false;
  setSpacesState(await rpc.call("spaces_off"));
  return true;
}

export async function switchSpaceByIndex(index: number): Promise<boolean> {
  const space = state?.spaces[index];
  if (!space) return false;
  return switchSpace(space.id);
}

export async function switchRelative(delta: number): Promise<boolean> {
  if (!state || state.spaces.length === 0) return false;
  const current = state.spaces.findIndex((s) => s.id === state!.activeSpaceId);
  if (current < 0 && delta < 0) return switchSpaceByIndex(state.spaces.length - 1);
  const count = state.spaces.length;
  const next = (((current < 0 ? 0 : current) + delta) % count + count) % count;
  return switchSpaceByIndex(next);
}
