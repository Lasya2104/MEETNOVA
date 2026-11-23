
import { useState } from 'react'
import {
  useRoomContext,
  useParticipants
} from '@livekit/components-react'

type EngagementConsentProps = {
  onConsentChange: (accepted: boolean) => void
}

function EngagementConsent({
  onConsentChange
}: EngagementConsentProps) {
  const room = useRoomContext()
  const participants = useParticipants()

  const [consent, setConsent] = useState<
    'pending' | 'accepted' | 'declined'
  >('pending')

  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const submitConsent = async (accepted: boolean) => {
    const host = participants.find(
      participant =>
        participant.attributes?.meetnova_role === 'host'
    )

    if (!host) {
      setError('Meeting host is not available yet. Please try again.')
      return
    }

    try {
      setSending(true)
      setError('')

      const payload = {
        type: 'engagement-consent',
        accepted,
        participantIdentity: room.localParticipant.identity,
        participantName:
          room.localParticipant.name || 'Participant'
      }

      await room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(payload)),
        {
          reliable: true,
          topic: 'meetnova-engagement',
          destinationIdentities: [host.identity]
        }
      )

      setConsent(accepted ? 'accepted' : 'declined')

      // INFORM PARENT COMPONENT
      onConsentChange(accepted)

    } catch (error) {
      console.error('Consent submission failed:', error)
      setError('Unable to submit your response. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="engagement-consent">

      <h3>✦ MeetNova AI Engagement</h3>

      {consent === 'pending' && (
        <>
          <p>
            With your permission, your camera will be
            analyzed locally to estimate face visibility,
            head direction and eye gaze.
          </p>

          <p>
            Only your estimated score and status will be
            shared privately with the meeting host.
            Your raw camera video and facial landmarks
            are not sent as engagement data.
          </p>

          <p>
            These are approximate visual indicators,
            not a measure of your actual attention
            or understanding.
          </p>

          <p>
            Participation is optional. You can decline
            and still attend the meeting normally.
          </p>

          {error && <p>{error}</p>}

          <div className="engagement-consent-buttons">
            <button
              disabled={sending}
              onClick={() => submitConsent(true)}
            >
              {sending ? 'Please wait...' : 'Allow AI Estimation'}
            </button>

            <button
              disabled={sending}
              onClick={() => submitConsent(false)}
            >
              Decline
            </button>
          </div>
        </>
      )}

      {consent === 'accepted' && (
        <>
          <p>
            ✓ You have allowed AI engagement estimation.
          </p>

          <p>
            AI estimation runs locally on your device.
            Only your estimated score and status are
            shared with the host.
          </p>

          <div className="engagement-consent-buttons">
            <button
              disabled={sending}
              onClick={() => submitConsent(false)}
            >
              {sending ? 'Please wait...' : 'Withdraw Consent'}
            </button>
          </div>
        </>
      )}

      {consent === 'declined' && (
        <>
          <p>
            You declined AI engagement estimation.
            Your camera will not be analyzed for this feature.
          </p>

          <div className="engagement-consent-buttons">
            <button
              disabled={sending}
              onClick={() => submitConsent(true)}
            >
              {sending ? 'Please wait...' : 'Allow AI Estimation'}
            </button>
          </div>
        </>
      )}

      {error && consent !== 'pending' && (
        <p>{error}</p>
      )}

    </div>
  )
}

export default EngagementConsent
