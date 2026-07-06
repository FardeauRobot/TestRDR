import { useCrew, useStore } from '../store/context'
import { incomingCheck } from '../lib/status'
import { Avatar } from './Avatar'

/** Full-screen prompt shown to the *recipient* of a "You good?" check-in.
 *  Deliberately the top-most layer and impossible to miss — two big choices,
 *  no dismiss. "I need help" raises SOS. */
export function CheckPrompt() {
  const { checkRequests, meId, members } = useCrew()
  const store = useStore()

  const req = incomingCheck(checkRequests, meId)
  if (!req) return null
  const asker = members.find((m) => m.id === req.fromId)

  return (
    <div className="check-backdrop" role="dialog" aria-modal="true">
      <div className="check-card">
        {asker && <Avatar member={asker} size="lg" />}
        <div className="check-from">{asker?.name ?? 'A crewmate'} is checking in on you</div>
        <div className="check-q">You good?</div>
        <div className="btn-row" style={{ marginTop: 18, width: '100%' }}>
          <button className="btn" onClick={() => void store.resolveCheck(req.id, 'ok')}>
            ✅ I'm OK
          </button>
          <button className="btn danger" onClick={() => void store.resolveCheck(req.id, 'help')}>
            🆘 I need help
          </button>
        </div>
      </div>
    </div>
  )
}
