// Copyright line shown at the bottom of every unauthenticated auth screen.
export default function AuthFooter() {
  return (
    <p className="mt-4 text-center text-xs text-white/70">
      © {new Date().getFullYear()} vic-ec. All rights reserved.
    </p>
  )
}
