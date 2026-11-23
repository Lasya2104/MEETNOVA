
import { useEffect, useRef, useState } from 'react'

import {
  ControlBar,
  GridLayout,
  ParticipantTile,
  useChat,
  useTracks,
  useRoomContext
} from '@livekit/components-react'

import { Track, RoomEvent } from 'livekit-client'

import FocusDetection from './FocusDetection'
import HostEngagementDashboard from './HostEngagementDashboard'
import EngagementConsent from './EngagementConsent'

import './ModeratedConference.css'

type PanelType =
  | 'chat'
  | 'assistant'
  | 'focus'
  | 'engagement'
  | null


type EngagementParticipant = {
  id: string
  name: string
  score: number | null
  status: string
  detail: string
}


type EngagementEstimate = {
  score: number | null
  status: string
  detail: string
}

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

  if (
    inappropriateWords.some(word =>
      text.split(' ').includes(word)
    )
  ) {
    return 'Inappropriate language'
  }

  return ''
}

type ModeratedConferenceProps = {
  isHost: boolean
}

function ModeratedConference({
  isHost
}: ModeratedConferenceProps) {

  // LIVEKIT ROOM
  const room = useRoomContext()

  // VIDEO TRACKS
  const tracks = useTracks(
    [
      {
        source: Track.Source.Camera,
        withPlaceholder: true
      },
      {
        source: Track.Source.ScreenShare,
        withPlaceholder: false
      }
    ],
    {
      onlySubscribed: false
    }
  )

  // LIVEKIT CHAT
  const {
    chatMessages,
    send,
    isSending
  } = useChat()

  // PANEL STATES
  const [activePanel, setActivePanel] =
    useState<PanelType>(null)

  const [showMoreMenu, setShowMoreMenu] =
    useState(false)

  // HOST ENGAGEMENT DASHBOARD DATA
  const [engagementParticipants, setEngagementParticipants] =
    useState<EngagementParticipant[]>([])

  // PARTICIPANT CONSENT STATE
  const [hasEngagementConsent, setHasEngagementConsent] =
    useState(false)

  // PARTICIPANT LOCAL ESTIMATE
  const [localEstimate, setLocalEstimate] =
    useState<EngagementEstimate>({
      score: null,
      status: 'Not assessed',
      detail: 'Waiting for consent'
    })

  // CHAT STATES
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  // MEETING ASSISTANT STATES
  const [transcript, setTranscript] = useState('')
  const [summary, setSummary] = useState('')
  const [actionItems, setActionItems] = useState<string[]>([])
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')

  const recognitionRef = useRef<any>(null)

  // HANDLE CONSENT CHANGES
  const handleConsentChange = (accepted: boolean) => {
    setHasEngagementConsent(accepted)

    if (!accepted) {
      setLocalEstimate({
        score: null,
        status: 'Not assessed',
        detail: 'AI engagement estimation is disabled'
      })
    } else {
      setLocalEstimate({
        score: null,
        status: 'Waiting for analysis',
        detail: 'AI estimation is starting'
      })
    }
  }

  
  // RECEIVE PRIVATE CONSENT AND ENGAGEMENT UPDATES
  useEffect(() => {
    if (!isHost) return

    const handleDataReceived = (
      payload: Uint8Array,
      participant?: any,
      _kind?: any,
      topic?: string
    ) => {
      if (
        topic !== 'meetnova-engagement' ||
        !participant
      ) {
        return
      }

      try {
        const data = JSON.parse(
          new TextDecoder().decode(payload)
        )

        const identity = participant.identity
        const name = participant.name || 'Participant'

        // PARTICIPANT CONSENT UPDATE
        if (
          data.type === 'engagement-consent' &&
          typeof data.accepted === 'boolean'
        ) {
          setEngagementParticipants(previous => {
            const updatedParticipant: EngagementParticipant = {
              id: identity,
              name,
              score: null,
              status: 'Not assessed',
              detail: data.accepted
                ? 'Opted in — waiting for camera analysis'
                : 'Declined AI estimation'
            }

            const existing = previous.findIndex(
              item => item.id === identity
            )

            if (existing === -1) {
              return [...previous, updatedParticipant]
            }

            return previous.map((item, index) =>
              index === existing
                ? updatedParticipant
                : item
            )
          })

          return
        }

        // PARTICIPANT SCORE UPDATE
        if (data.type === 'engagement-estimate') {
          const validScore =
            typeof data.score === 'number' &&
            Number.isFinite(data.score) &&
            data.score >= 0 &&
            data.score <= 100

          const score = validScore
            ? data.score
            : null

          const status =
            typeof data.status === 'string'
              ? data.status
              : 'Not assessed'

          setEngagementParticipants(previous => {
            const updatedParticipant: EngagementParticipant = {
              id: identity,
              name,
              score,
              status: score === null
                ? 'Not assessed'
                : status,
              detail: score === null
                ? 'No usable camera signals'
                : 'Latest visual alignment estimate'
            }

            const existing = previous.findIndex(
              item => item.id === identity
            )

            if (existing === -1) {
              return [...previous, updatedParticipant]
            }

            return previous.map((item, index) =>
              index === existing
                ? updatedParticipant
                : item
            )
          })
        }

      } catch (error) {
        console.error(
          'Engagement data message error:',
          error
        )
      }
    }

    room.on(
      RoomEvent.DataReceived,
      handleDataReceived
    )

    return () => {
      room.off(
        RoomEvent.DataReceived,
        handleDataReceived
      )
    }
  }, [room, isHost])


  // START TRANSCRIPTION
  const startListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      setError(
        'Speech recognition is not supported. Please use Google Chrome.'
      )
      setActivePanel('assistant')
      return
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }

    const recognition = new SpeechRecognition()

    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event: any) => {
      let newText = ''

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        if (event.results[i].isFinal) {
          newText += event.results[i][0].transcript + ' '
        }
      }

      if (newText) {
        setTranscript(previous => previous + newText)
      }
    }

    recognition.onerror = (event: any) => {
      setError('Microphone recognition error: ' + event.error)
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
    setError('')
    setActivePanel('assistant')

    try {
      recognition.start()
      setIsListening(true)
    } catch {
      setError(
        'Unable to start speech recognition. Please try again.'
      )
    }
  }

  // STOP TRANSCRIPTION
  const stopListening = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }

  // TRANSCRIPTION BUTTON
  const toggleTranscription = () => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }

  // GENERATE SUMMARY
  const generateSummary = () => {
    if (!transcript.trim()) {
      setError(
        'Please record or enter some meeting content first.'
      )
      setActivePanel('assistant')
      setShowMoreMenu(false)
      return
    }

    const sentences = transcript
      .split(/[.!?]+/)
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length > 10)

    const importantSentences = sentences.slice(0, 5)

    setSummary(
      importantSentences.length
        ? importantSentences
            .map(sentence => '• ' + sentence)
            .join('\n')
        : transcript
    )

    const actionPattern =
      /\b(need to|should|must|will|assign|complete|prepare|submit|follow up|deadline|responsible for|action item|by tomorrow|by monday|by friday)\b/i

    const actions = sentences.filter(sentence =>
      actionPattern.test(sentence)
    )

    setActionItems([...new Set(actions)])

    setError('')
    setActivePanel('assistant')
    setShowMoreMenu(false)
  }

  // DOWNLOAD NOTES
  const downloadNotes = () => {
    const content = `
MEETNOVA - MEETING NOTES

TRANSCRIPT:
${transcript}

SUMMARY:
${summary || 'Not generated yet'}

ACTION ITEMS:
${actionItems.length
  ? actionItems
      .map((item, index) => `${index + 1}. ${item}`)
      .join('\n')
  : 'No action items identified yet'}
`

    const blob = new Blob([content], {
      type: 'text/plain'
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = 'MEETNOVA-Meeting-Notes.txt'
    link.click()

    URL.revokeObjectURL(url)
    setShowMoreMenu(false)
  }

  // SEND MODERATED CHAT MESSAGE
  const sendMessage = async () => {
    const trimmedMessage = message.trim()

    if (!trimmedMessage || isSending) return

    const reason = checkMessage(trimmedMessage)

    if (reason) {
      setNotice(`⚠ Message blocked: ${reason}`)
      setMessage('')
      return
    }

    try {
      await send(trimmedMessage)
      setMessage('')
      setNotice('')
    } catch (error) {
      console.error('MEETNOVA Chat Error:', error)

      const errorMessage =
        error instanceof Error
          ? error.message
          : String(error)

      setNotice(`Message failed: ${errorMessage}`)
    }
  }

  // CLEAN UP MICROPHONE RECOGNITION
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  return (
    <div className="mn-conference">

      {/* VIDEO AREA */}
      <div
        className={`mn-video-area ${
          activePanel ? 'mn-video-with-panel' : ''
        }`}
      >
        <GridLayout tracks={tracks}>
          <ParticipantTile />
        </GridLayout>
      </div>

      {/* PARTICIPANT CONSENT NOTICE */}
      {!isHost && (
        <div className="mn-consent-overlay">
          <EngagementConsent
            onConsentChange={handleConsentChange}
          />
        </div>
      )}

      {/* PARTICIPANT BACKGROUND AI ANALYSIS */}
      {!isHost && (
        <div className="mn-background-focus">
          <FocusDetection
            enabled={hasEngagementConsent}
            onEstimate={setLocalEstimate}
          />
        </div>
      )}

      {/* RIGHT SIDE PANEL */}
      {activePanel && (
        <div className="mn-side-panel">

          {/* PANEL HEADER */}
          <div className="mn-panel-header">
            <div>
              <h3>
                {activePanel === 'chat'
                  ? '💬 Meeting Chat'
                  : activePanel === 'assistant'
                    ? '✦ AI Meeting Assistant'
                    : activePanel === 'focus'
                      ? '🎯 AI Focus Detection'
                      : '📊 AI Engagement Dashboard'}
              </h3>

              <p>
                {activePanel === 'chat'
                  ? 'Connect with meeting participants'
                  : activePanel === 'assistant'
                    ? 'Your intelligent meeting companion'
                    : activePanel === 'focus'
                      ? 'Monitor your camera face visibility'
                      : 'Host overview of meeting engagement'}
              </p>
            </div>

            <button
              className="mn-close-panel"
              onClick={() => setActivePanel(null)}
            >
              ✕
            </button>
          </div>

          {/* CHAT PANEL */}
          {activePanel === 'chat' && (
            <>
              <div className="mn-moderation-status">
                🛡️ Smart Moderation Active
                <small>
                  Messages are checked before sending.
                </small>
              </div>

              <div className="mn-chat-messages">
                {chatMessages.length === 0 && (
                  <div className="mn-empty-chat">
                    <span>💬</span>
                    <p>No messages yet.</p>
                    <small>Start the conversation!</small>
                  </div>
                )}

                {chatMessages.map((msg, index) => {
                  const reason = checkMessage(msg.message)

                  return (
                    <div
                      className="mn-chat-message"
                      key={`${msg.timestamp}-${index}`}
                    >
                      <strong>
                        {msg.from?.identity || 'Participant'}
                      </strong>

                      <p>{msg.message}</p>

                      {reason && (
                        <small className="mn-flagged-label">
                          ⚠ Flagged message
                        </small>
                      )}
                    </div>
                  )
                })}
              </div>

              {notice && (
                <div className="mn-chat-notice">
                  {notice}
                </div>
              )}

              <div className="mn-chat-input-area">
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

              <div className="mn-panel-footer">
                ✦ MEETNOVA Smart Safety
              </div>
            </>
          )}

          {/* AI ASSISTANT PANEL */}
          {activePanel === 'assistant' && (
            <div className="mn-assistant-content">

              <div className="mn-assistant-status">
                <span>
                  {isListening ? '● LISTENING' : '● READY'}
                </span>

                {isListening && (
                  <span>Recording meeting audio</span>
                )}
              </div>

              {error && (
                <div className="mn-assistant-error">
                  {error}
                </div>
              )}

              <div className="mn-assistant-section">
                <h4>📝 Live Transcript</h4>

                <textarea
                  value={transcript}
                  onChange={e => setTranscript(e.target.value)}
                  placeholder="Your spoken words will appear here. You can also type meeting notes manually."
                  rows={7}
                />
              </div>

              <div className="mn-assistant-section">
                <h4>✨ Meeting Summary</h4>

                <div className="mn-assistant-output">
                  {summary ||
                    'Your meeting summary will appear here.'}
                </div>
              </div>

              <div className="mn-assistant-section">
                <h4>📌 Action Items</h4>

                {actionItems.length > 0 ? (
                  <ul>
                    {actionItems.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mn-empty-actions">
                    No action items generated yet.
                  </p>
                )}
              </div>

            </div>
          )}

          {/* AI FOCUS DETECTION PANEL */}
          {activePanel === 'focus' && (
            <>
              <div className="mn-local-focus-result">

                {!hasEngagementConsent ? (
                  <>
                    <h4>AI Estimation Disabled</h4>

                    <p>
                      Allow AI estimation in the consent notice
                      to enable local camera analysis.
                    </p>
                  </>
                ) : (
                  <>
                    <h4>✦ Your Visual Alignment Estimate</h4>

                    <div className="mn-local-focus-status">
                      {localEstimate.status}
                    </div>

                    <p>{localEstimate.detail}</p>

                    {localEstimate.score !== null && (
                      <div className="mn-local-focus-score">
                        {localEstimate.score}/100
                      </div>
                    )}
                  </>
                )}

              </div>

              <div className="mn-panel-footer">
                Visual alignment is approximate and does not
                prove attention or understanding.
              </div>
            </>
          )}

          {/* HOST-ONLY ENGAGEMENT DASHBOARD */}
          {activePanel === 'engagement' && isHost && (
            <HostEngagementDashboard
              participants={engagementParticipants}
            />
          )}

        </div>
      )}

      {/* BOTTOM TOOLBAR */}
      <div className="mn-bottom-toolbar">

        {/* LIVEKIT MIC, CAMERA AND SCREEN SHARE */}
        <ControlBar
          controls={{
            microphone: true,
            camera: true,
            screenShare: true,
            chat: false,
            leave: false,
            settings: false
          }}
        />

        {/* TRANSCRIPTION BUTTON */}
        <button
          className={`mn-toolbar-button ${
            isListening ? 'mn-recording' : ''
          }`}
          onClick={toggleTranscription}
          title="Start or stop transcription"
        >
          🎙️ {isListening ? 'Stop' : 'Transcribe'}
        </button>

        {/* CHAT BUTTON */}
        <button
          className={`mn-toolbar-button ${
            activePanel === 'chat' ? 'mn-toolbar-active' : ''
          }`}
          onClick={() => {
            setActivePanel(
              activePanel === 'chat' ? null : 'chat'
            )
            setShowMoreMenu(false)
            setNotice('')
          }}
        >
          💬 Chat

          {chatMessages.length > 0 && (
            <span className="mn-chat-count">
              {chatMessages.length}
            </span>
          )}
        </button>

        {/* FOCUS DETECTION BUTTON */}
        <button
          className={`mn-toolbar-button ${
            activePanel === 'focus' ? 'mn-toolbar-active' : ''
          }`}
          onClick={() => {
            setActivePanel(
              activePanel === 'focus' ? null : 'focus'
            )
            setShowMoreMenu(false)
          }}
          title="Open AI Focus Detection"
        >
          🎯 Focus
        </button>

        {/* HOST-ONLY ENGAGEMENT BUTTON */}
        {isHost && (
          <button
            className={`mn-toolbar-button ${
              activePanel === 'engagement'
                ? 'mn-toolbar-active'
                : ''
            }`}
            onClick={() => {
              setActivePanel(
                activePanel === 'engagement'
                  ? null
                  : 'engagement'
              )
              setShowMoreMenu(false)
            }}
            title="Open host engagement dashboard"
          >
            📊 Engagement
          </button>
        )}

        {/* THREE DOT MENU */}
        <div className="mn-more-container">

          <button
            className="mn-toolbar-button mn-more-button"
            onClick={() =>
              setShowMoreMenu(previous => !previous)
            }
          >
            ⋯ More
          </button>

          {showMoreMenu && (
            <div className="mn-more-menu">

              <button onClick={generateSummary}>
                ✨ Generate Summary
              </button>

              <button
                onClick={() => {
                  setActivePanel('assistant')
                  setShowMoreMenu(false)
                }}
              >
                📌 View Action Items
              </button>

              <button onClick={downloadNotes}>
                ↓ Download Meeting Notes
              </button>

            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default ModeratedConference
