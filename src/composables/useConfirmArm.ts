import { ref, onUnmounted } from 'vue'

const DEFAULT_TIMEOUT_MS = 3000

// Tap-to-arm confirmation for higher-risk action buttons (motion commands,
// destructive actions — see #38) that's easy to trigger by accident on
// mobile. Deliberately not a Confirm/Cancel button pair: splitting an
// already-compact mobile button in half produces two tap targets too small
// to reliably hit, which defeats the point. Instead the same button just
// re-labels/re-colors itself on first tap ("Confirm Park?") and reverts
// after `timeoutMs` if not tapped again — same size, same position, no new
// target to aim for.
export function useConfirmArm(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const armedKey = ref<string | null>(null)
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  function isArmed(key: string): boolean {
    return armedKey.value === key
  }

  function disarm(): void {
    clearTimeout(timeoutHandle)
    timeoutHandle = undefined
    armedKey.value = null
  }

  // Call from a button's click handler in place of running the real action
  // directly: the first call for a given key arms it and returns false (the
  // caller should stop there); a second call for the *same* key within the
  // timeout window disarms it and returns true (the caller should now run
  // the real action). Arming one key disarms any other — only one button at
  // a time stays armed.
  function confirm(key: string): boolean {
    if (armedKey.value === key) {
      disarm()
      return true
    }
    clearTimeout(timeoutHandle)
    armedKey.value = key
    timeoutHandle = setTimeout(disarm, timeoutMs)
    return false
  }

  onUnmounted(() => clearTimeout(timeoutHandle))

  return { isArmed, confirm, disarm }
}
