import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/store/auth-context'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { TerminalBlock, TypeWriter } from '@/components/fx'

export function AdminLogin() {
  const { loginAdmin } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await loginAdmin({ username, password })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'CONNECTION TO THE CORE FAILED.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative z-10 flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <ShieldCheck className="mx-auto size-8 text-warn" />
          <h1 className="mt-3 font-display text-2xl tracking-[0.2em] text-warn">CORE SUPERVISION</h1>
          <p className="mt-1 text-[11px] tracking-[0.2em] text-term/45 uppercase">
            <TypeWriter text="ADMIN CLEARANCE REQUIRED" />
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="border border-warn/40 bg-panel/90 p-6 shadow-[0_0_60px_-24px_var(--color-warn)]"
        >
          <TerminalBlock className="mb-6 border-warn/50">
            <p className="text-warn/80">&gt; RESTRICTED TERMINAL.</p>
            <p className="text-warn/50">&gt; ALL ACTIONS ARE WRITTEN TO THE LEDGER.</p>
          </TerminalBlock>

          <div className="mb-4">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="mb-6">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" variant="warn" size="lg" className="w-full" disabled={busy}>
            {busy ? 'AUTHENTICATING…' : 'ACCESS THE CORE'}
          </Button>

          <p className="mt-3 min-h-4 text-center text-[11px] text-alert" role="alert">
            {error}
          </p>
        </form>

        <div className="mt-4 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.16em] text-term/35 uppercase hover:text-term"
          >
            <ArrowLeft className="size-3" /> Back to operator terminal
          </Link>
        </div>
      </div>
    </div>
  )
}
