/**
 * RN entry placeholder — Phase 5 will replace this with the real app shell.
 * Phase 1 must compile WITHOUT importing react/react-native so the package
 * builds in this monorepo. The stub exposes the same surface so consumer code
 * in Phase 5 can `import { App } from '@farm-game/client-app/App'` unchanged.
 */

export interface AppProps {
  apiBaseUrl: string;
  platform: 'ios' | 'android';
}

/**
 * Phase 5 hook:
 *  * In Phase 5 we'll add `react` and `react-native` as direct dependencies and
 *   rewrite this module as the RN root component. For now it returns the
 *   metadata so callers know what they'd receive.
 */
export function describeApp(props: AppProps): { name: string; props: AppProps } {
  return { name: 'farm-game-client-app', props };
}