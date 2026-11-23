
import './HostEngagementDashboard.css'

type ParticipantEngagement = {
  id: string
  name: string
  score: number | null
  status: string
  detail: string
}

type HostEngagementDashboardProps = {
  participants?: ParticipantEngagement[]
}

function HostEngagementDashboard({
  participants = []
}: HostEngagementDashboardProps) {

  const assessedParticipants = participants.filter(
    participant => participant.score !== null
  )

  const notAssessedCount =
    participants.length - assessedParticipants.length

  const averageScore =
    assessedParticipants.length > 0
      ? Math.round(
          assessedParticipants.reduce(
            (total, participant) =>
              total + (participant.score ?? 0),
            0
          ) / assessedParticipants.length
        )
      : null

  return (
    <div className="host-engagement-dashboard">

      {/* DASHBOARD HEADING */}
      <div className="host-dashboard-heading">
        <div>
          <h3>✦ AI Engagement Dashboard</h3>
          <p>Meeting engagement overview</p>
        </div>

        <span className="host-only-badge">
          HOST ONLY
        </span>
      </div>

      {/* SUMMARY CARDS */}
      <div className="engagement-summary">

        <div className="engagement-stat">
          <strong>{participants.length}</strong>
          <span>Total participants</span>
        </div>

        <div className="engagement-stat">
          <strong>{assessedParticipants.length}</strong>
          <span>Assessed</span>
        </div>

        <div className="engagement-stat">
          <strong>{notAssessedCount}</strong>
          <span>Not assessed</span>
        </div>

      </div>

      {/* AVERAGE SCORE */}
      <div className="engagement-average">
        <span>Meeting average visual alignment</span>

        <strong>
          {averageScore !== null
            ? `${averageScore}/100`
            : 'Not available'}
        </strong>
      </div>

      {/* PARTICIPANT LIST */}
      <h4>Participant engagement</h4>

      {participants.length === 0 ? (

        <p className="engagement-empty">
          Waiting for participant engagement data...
        </p>

      ) : (

        <div className="engagement-participant-list">

          {participants.map(participant => (

            <div
              className="engagement-participant"
              key={participant.id}
            >

              <div className="engagement-participant-info">

                <strong>{participant.name}</strong>

                <p>{participant.detail}</p>

                {participant.score !== null && (
                  <div className="engagement-score-bar">
                    <div
                      className="engagement-score-fill"
                      style={{
                        width: `${participant.score}%`
                      }}
                    />
                  </div>
                )}

              </div>

              <div className="engagement-participant-result">

                {participant.score !== null ? (
                  <strong className="engagement-score">
                    {participant.score}/100
                  </strong>
                ) : (
                  <strong className="engagement-not-assessed">
                    —
                  </strong>
                )}

                <span className="engagement-status">
                  {participant.status}
                </span>

              </div>

            </div>

          ))}

        </div>

      )}

      {/* PRIVACY AND ACCURACY DISCLAIMER */}
      <p className="engagement-disclaimer">
        Visual alignment scores are approximate indicators
        based on face visibility, head direction and eye gaze.
        They do not prove attention, understanding or learning.
        Participants who decline or cannot be assessed are
        shown as Not assessed.
      </p>

    </div>
  )
}

export default HostEngagementDashboard
