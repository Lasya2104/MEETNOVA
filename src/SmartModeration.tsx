
import { useState } from 'react'
import { useChat } from '@livekit/components-react'
import './SmartModeration.css'


function checkMessage(message: string) {
  const text = message
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const abusivePhrases = [
    'idiot',
    'stupid',
    'moron',
    'shut up',
    'hate you',
    'you are worst',
    'you re worst',
    'you are useless',
    'you are dumb',
    'you are stupid',
    'you are an idiot',
    'you are a loser',
    'get lost',
    'go away',
    'you suck',
    'fool',
    'loser',
    'dumb',
    'useless'
  ]

  const inappropriateWords = [
    'fuck',
    'shit',
    'bitch',
    'asshole'
  ]

  if (abusivePhrases.some(phrase => text.includes(phrase))) {
    return 'Potentially abusive or disrespectful language'
  }

  if (inappropriateWords.some(word =>
    text.split(' ').includes(word)
  )) {
    return 'Inappropriate language'
  }

  return ''
}


function SmartModeration() {
  const { chatMessages, send, isSending } = useChat()

  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  const flaggedMessages = chatMessages.filter(msg =>
    checkMessage(msg.message)
  )

  const sendMessage = async () => {
    if (!message.trim()) return

    const reason = checkMessage(message)

    if (reason) {
      setNotice(`⚠ Message blocked: ${reason}`)
      setMessage('')
      return
    }

    try {
      await send(message.trim())
      setMessage('')
      setNotice('✓ Message sent successfully')
    } catch {
      setNotice('Unable to send message. Please try again.')
    }
  }

  return (
    <div className="moderation-panel">
      <div className="moderation-header">
        <div>
          <span className="moderation-icon">🛡️</span>
          <h3>MEETNOVA Smart Chat</h3>
          <p>AI-assisted message moderation</p>
        </div>

        <span className="moderation-live">● ACTIVE</span>
      </div>

      <div className="moderation-status">
        <span>🛡️ Moderation enabled</span>
        <small>Messages are checked before sending</small>
      </div>

      <div className="moderation-messages">
        {chatMessages.length === 0 && (
          <p className="moderation-empty">
            No messages yet. Start the conversation!
          </p>
        )}

        {chatMessages.map((msg, index) => {
          const reason = checkMessage(msg.message)

          return (
            <div
              className={`moderation-message ${reason ? 'flagged-message' : ''}`}
              key={`${msg.timestamp}-${index}`}
            >
              <strong>
                {msg.from?.identity || 'Participant'}
              </strong>

              <p>
                {reason
                  ? '⚠ This message was flagged for review.'
                  : msg.message}
              </p>

              {reason && (
                <small>Flagged: {reason}</small>
              )}
            </div>
          )
        })}
      </div>

      {flaggedMessages.length > 0 && (
        <div className="moderation-warning">
          ⚠ {flaggedMessages.length} message(s) flagged for review.
        </div>
      )}

      {notice && (
        <p className="moderation-notice">{notice}</p>
      )}

      <div className="moderation-input">
        <input
          value={message}
          onChange={e => {
            setMessage(e.target.value)
            setNotice('')
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') sendMessage()
          }}
          placeholder="Type a message..."
        />

        <button
          onClick={sendMessage}
          disabled={isSending || !message.trim()}
        >
          Send
        </button>
      </div>

      <div className="moderation-footer">
        <span>✦ MEETNOVA Safety System</span>
        <span>{flaggedMessages.length} flagged</span>
      </div>
    </div>
  )
}

export default SmartModeration
