
import { useEffect, useRef, useState } from 'react'
import './MeetingAssistant.css'

function MeetingAssistant() {
  const [transcript, setTranscript] = useState('')
  const [summary, setSummary] = useState('')
  const [actionItems, setActionItems] = useState<string[]>([])
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')

  const recognitionRef = useRef<any>(null)

  const startListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      setError('Speech recognition is not supported. Please use Google Chrome.')
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

      for (let i = event.resultIndex; i < event.results.length; i++) {
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

    try {
      recognition.start()
      setIsListening(true)
    } catch {
      setError('Unable to start speech recognition. Please try again.')
    }
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }

  const generateSummary = () => {
    if (!transcript.trim()) {
      setError('Please record or enter some meeting content first.')
      return
    }

    const sentences = transcript
      .split(/[.!?]+/)
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length > 10)

    const importantSentences = sentences.slice(0, 5)

    setSummary(
      importantSentences.length
        ? importantSentences.map(sentence => '• ' + sentence).join('\n')
        : transcript
    )

    const actionPattern =
      /\b(need to|should|must|will|assign|complete|prepare|submit|follow up|deadline|responsible for|action item|by tomorrow|by monday|by friday)\b/i

    const actions = sentences.filter(sentence =>
      actionPattern.test(sentence)
    )

    setActionItems([...new Set(actions)])

    setError('')
  }

  const downloadNotes = () => {
    const content = `
MEETNOVA - MEETING NOTES

TRANSCRIPT:
${transcript}

SUMMARY:
${summary || 'Not generated yet'}

ACTION ITEMS:
${actionItems.length
  ? actionItems.map((item, index) => `${index + 1}. ${item}`).join('\n')
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
  }

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  return (
    <div className="assistant-panel">
      <div className="assistant-header">
        <div>
          <span className="assistant-icon">✦</span>
          <h3>AI Meeting Assistant</h3>
          <p>Your intelligent meeting companion</p>
        </div>

        <span className="assistant-status">
          {isListening ? '● LISTENING' : '● READY'}
        </span>
      </div>

      <div className="assistant-controls">
        {!isListening ? (
          <button onClick={startListening}>
            🎙️ Start Transcription
          </button>
        ) : (
          <button className="stop-button" onClick={stopListening}>
            ⏹ Stop Transcription
          </button>
        )}

        <button onClick={generateSummary}>
          ✦ Generate Summary
        </button>
      </div>

      {error && <p className="assistant-error">{error}</p>}

      <div className="assistant-section">
        <h4>📝 Live Transcript</h4>

        <textarea
          value={transcript}
          onChange={e => setTranscript(e.target.value)}
          placeholder="Your spoken words will appear here... You can also type meeting notes manually."
          rows={6}
        />
      </div>

      <div className="assistant-section">
        <h4>✨ Meeting Summary</h4>

        <div className="assistant-output">
          {summary || 'Your meeting summary will appear here.'}
        </div>
      </div>

      <div className="assistant-section">
        <h4>📌 Action Items</h4>

        {actionItems.length > 0 ? (
          <ul>
            {actionItems.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="empty-actions">
            No action items generated yet.
          </p>
        )}
      </div>

      <button className="download-notes" onClick={downloadNotes}>
        ↓ Download Meeting Notes
      </button>
    </div>
  )
}

export default MeetingAssistant
