import type { DeviceProfile } from './types/engine'

// Phase 0 placeholder; impl-ui replaces it with the import / overview / move-by-move screens.
export default function App({ profile }: { profile: DeviceProfile | null }) {
  return <main data-simd={profile ? 'yes' : 'no'}>Analyse</main>
}
