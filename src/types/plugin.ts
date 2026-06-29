/** Plugin types — matches the new Plugin Discovery Protocol (ADR-008/009).
 *  GET /plugins returns PluginInfo[] (Plan 3 engine). */

export type ComponentKind = 'source' | 'processor' | 'sink';

/** One component of a plugin (runtime unit). */
export interface ComponentInfo {
  id: string;           // e.g. "source" (Plan 3 single-component convention)
  kind: ComponentKind;
  displayName: string;
  description?: string;
}

/** A self-describing plugin (package). */
export interface PluginInfo {
  id: string;           // e.g. "source-hello"
  version: string;
  displayName: string;
  description?: string;
  components: ComponentInfo[];
}
