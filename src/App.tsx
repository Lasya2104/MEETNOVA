
import { useEffect, useState } from 'react'
import './App.css'

import {
  LiveKitRoom,
  RoomAudioRenderer
} from '@livekit/components-react'

import '@livekit/components-styles'
import ModeratedConference from './ModeratedConference'

type Meeting = {
  id: string
  name: string
  date: string
}

function App() {
  const [page, setPage] = useState('home')
  const [authPage, setAuthPage] = useState('')

  const [meetingName, setMeetingName] = useState('')
  const [meetingCode, setMeetingCode] = useState('')
  const [createdMeetingId, setCreatedMeetingId] = useState('')
  const [joinedMeeting, setJoinedMeeting] = useState<Meeting | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetEmail, setResetEmail] = useState('')

  const [liveKitServerUrl, setLiveKitServerUrl] = useState('')
  const [liveKitToken, setLiveKitToken] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)

  const [hostKey, setHostKey] = useState('')
  const [participantRole, setParticipantRole] = useState('participant')

  
  const [meetings, setMeetings] = useState<Meeting[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('meetnova_meetings') || '[]')
    } catch {
      return []
    }
  })

  const [user, setUser] = useState(() => {
    return localStorage.getItem('meetnova_user') || ''
  })

  useEffect(() => {
    localStorage.setItem('meetnova_meetings', JSON.stringify(meetings))
  }, [meetings])

  const saveMeeting = (meeting: Meeting) => {
    setMeetings(previous => {
      const updated = [
        meeting,
        ...previous.filter(item => item.id !== meeting.id)
      ]
      return updated.slice(0, 10)
    })
  }

  // CREATE A NEW MEETING
  const createMeeting = async () => {
    if (!meetingName.trim()) {
      alert('Please enter a meeting name')
      return
    }

    try {
      setIsConnecting(true)

      const response = await fetch(
        'http://localhost:5000/api/create-meeting',
        {
          method: 'POST'
        }
      )

      if (!response.ok) {
        throw new Error('Unable to create meeting')
      }

      const data = await response.json()

      if (!data.roomName || !data.hostKey) {
        throw new Error('Invalid meeting response from backend')
      }

      const id = data.roomName

      const meeting: Meeting = {
        id,
        name: meetingName.trim(),
        date: new Date().toLocaleString()
      }

      setHostKey(data.hostKey)
      setParticipantRole('host')
      setCreatedMeetingId(id)
      setJoinedMeeting(meeting)
      saveMeeting(meeting)
      setMeetingCode(id)

    } catch (error) {
      console.error('Meeting creation error:', error)

      alert(
        'Unable to create meeting. Please check whether your backend is running.'
      )
    } finally {
      setIsConnecting(false)
    }
  }

  // CONNECT TO LIVEKIT USING OUR BACKEND
  const connectToMeeting = async (meeting: Meeting) => {
    try {
      setIsConnecting(true)

      const isMeetingHost =
        meeting.id === createdMeetingId && hostKey !== ''

      const response = await fetch(
        'http://localhost:5000/api/token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            roomName: meeting.id,
            participantName: user || fullName || 'Guest',
            ...(isMeetingHost ? { hostKey } : {})
          })
        }
      )

      if (!response.ok) {
        throw new Error('Unable to generate meeting token')
      }

      const data = await response.json()

      if (!data.serverUrl || !data.participantToken) {
        throw new Error('Invalid token response from backend')
      }

      setJoinedMeeting(meeting)
      setLiveKitServerUrl(data.serverUrl)
      setLiveKitToken(data.participantToken)
      setParticipantRole(data.role || 'participant')

      setPage('room')
      setAuthPage('')

    } catch (error) {
      console.error('LiveKit connection error:', error)

      alert(
        'Unable to connect to the meeting. Please check whether your backend and LiveKit credentials are configured correctly.'
      )
    } finally {
      setIsConnecting(false)
    }
  }

  // ENTER CREATED MEETING
  const enterMeeting = () => {
    if (!joinedMeeting) return
    connectToMeeting(joinedMeeting)
  }

  // JOIN MEETING FROM ANOTHER DEVICE TOO
  const joinMeeting = () => {
    const code = meetingCode.trim().toUpperCase()

    if (!code) {
      alert('Please enter a Meeting ID')
      return
    }

    const found = meetings.find(item => item.id === code)

    const meeting: Meeting = found || {
      id: code,
      name: 'MEETNOVA Meeting',
      date: new Date().toLocaleString()
    }

    connectToMeeting(meeting)
  }

  // LEAVE MEETING
  const leaveMeeting = () => {
    if (!window.confirm('Are you sure you want to leave this meeting?')) {
      return
    }

    setLiveKitToken('')
    setLiveKitServerUrl('')
    setJoinedMeeting(null)
    setParticipantRole('participant')
    setPage('dashboard')
  }

  // REGISTRATION
  const register = () => {
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      alert('Please fill in all the fields')
      return
    }

    if (!email.includes('@')) {
      alert('Enter a valid email address')
      return
    }

    if (password.length < 6) {
      alert('Password must contain at least 6 characters')
      return
    }

    if (password !== confirmPassword) {
      alert('Passwords do not match')
      return
    }

    const accounts = JSON.parse(
      localStorage.getItem('meetnova_accounts') || '{}'
    )

    if (accounts[email]) {
      alert('An account with this email already exists.')
      return
    }

    accounts[email] = {
      name: fullName,
      password
    }

    localStorage.setItem('meetnova_accounts', JSON.stringify(accounts))

    alert('Account created successfully! Please sign in.')

    setAuthPage('signin')
    setPassword('')
    setConfirmPassword('')
  }

  // SIGN IN
  const signIn = () => {
    if (!email.trim() || !password) {
      alert('Please enter your email and password')
      return
    }

    const accounts = JSON.parse(
      localStorage.getItem('meetnova_accounts') || '{}'
    )

    const account = accounts[email]

    if (!account || account.password !== password) {
      alert('Account not found or incorrect password. Register first or try again.')
      return
    }

    setUser(account.name)
    localStorage.setItem('meetnova_user', account.name)

    setAuthPage('')
    setPage('dashboard')
    setPassword('')
  }

  // FORGOT PASSWORD
  const resetPassword = () => {
    if (!resetEmail.trim() || !resetEmail.includes('@')) {
      alert('Please enter a valid email address')
      return
    }

    alert('Password reset email is not connected in this prototype yet.')
    setAuthPage('signin')
  }

  // SIGN IN PAGE
  if (authPage === 'signin') {
    return (
      <div className="meeting-page">
        <button onClick={() => setAuthPage('')}>← Back to Home</button>

        <div className="meeting-form">
          <h1>Welcome Back!</h1>
          <p>Sign in to continue with MEETNOVA.</p>

          <label>Email Address</label>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />

          <label>Password</label>
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

          <p
            className="auth-link"
            onClick={() => setAuthPage('forgot')}
          >
            Forgot Password?
          </p>

          <button className="primary-button" onClick={signIn}>
            Sign In
          </button>

          <p>
            Don't have an account?{' '}
            <span
              className="auth-link"
              onClick={() => setAuthPage('register')}
            >
              Register
            </span>
          </p>
        </div>
      </div>
    )
  }

  // REGISTER PAGE
  if (authPage === 'register') {
    return (
      <div className="meeting-page">
        <button onClick={() => setAuthPage('')}>← Back to Home</button>

        <div className="meeting-form">
          <h1>Create Your Account</h1>
          <p>Join MEETNOVA and make every meeting smarter.</p>

          <label>Full Name</label>
          <input
            placeholder="Enter your full name"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
          />

          <label>Email Address</label>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />

          <label>Password</label>
          <input
            type="password"
            placeholder="Create a password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

          <label>Confirm Password</label>
          <input
            type="password"
            placeholder="Confirm your password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
          />

          <button className="primary-button" onClick={register}>
            Create Account
          </button>

          <p>
            Already have an account?{' '}
            <span
              className="auth-link"
              onClick={() => setAuthPage('signin')}
            >
              Sign In
            </span>
          </p>
        </div>
      </div>
    )
  }

  // FORGOT PASSWORD PAGE
  if (authPage === 'forgot') {
    return (
      <div className="meeting-page">
        <button onClick={() => setAuthPage('signin')}>
          ← Back to Sign In
        </button>

        <div className="meeting-form">
          <h1>Forgot Password?</h1>
          <p>Enter your registered email address.</p>

          <label>Email Address</label>
          <input
            type="email"
            placeholder="Enter your email"
            value={resetEmail}
            onChange={e => setResetEmail(e.target.value)}
          />

          <button className="primary-button" onClick={resetPassword}>
            Reset Password
          </button>
        </div>
      </div>
    )
  }

  // DASHBOARD
  if (page === 'dashboard') {
    return (
      <div className="meeting-page">
        <header className="room-header">
          <div className="logo">✦ MEETNOVA</div>

          <button
            className="nav-button"
            onClick={() => {
              localStorage.removeItem('meetnova_user')
              setUser('')
              setHostKey('')
              setCreatedMeetingId('')
              setParticipantRole('participant')
              setPage('home')
            }}
          >
            Logout
          </button>
        </header>

        <main className="room-main">
          <h1>Welcome{user ? `, ${user}` : ' to MEETNOVA'}! 👋</h1>
          <p>Your meetings, your space, your productivity.</p>

          <div className="dashboard-cards">
            <div className="meeting-form">
              <h2>🎥 Create Meeting</h2>
              <p>Start a new meeting and invite participants.</p>

              <button
                className="primary-button"
                onClick={() => setPage('create')}
              >
                Create Meeting
              </button>
            </div>

            <div className="meeting-form">
              <h2>🔗 Join Meeting</h2>
              <p>Join an existing meeting using a Meeting ID.</p>

              <button
                className="primary-button"
                onClick={() => setPage('join')}
              >
                Join Meeting
              </button>
            </div>
          </div>

          <div className="meeting-form recent-meetings">
            <h2>📅 Recent Meetings</h2>

            {meetings.length === 0 && (
              <p>No meetings yet. Start your first meeting!</p>
            )}

            {meetings.map(meeting => (
              <div className="recent-meeting-item" key={meeting.id}>
                <div>
                  <h3>{meeting.name}</h3>
                  <p>{meeting.date} · ID: {meeting.id}</p>
                </div>

                <span>Saved</span>
              </div>
            ))}
          </div>
        </main>
      </div>
    )
  }

  // CREATE MEETING PAGE
  if (page === 'create') {
    return (
      <div className="meeting-page">
        <button onClick={() => setPage('dashboard')}>
          ← Back to Dashboard
        </button>

        <div className="meeting-form">
          <h1>Create a Meeting</h1>
          <p>Give your meeting a name.</p>

          <label>Meeting Name</label>
          <input
            value={meetingName}
            onChange={e => setMeetingName(e.target.value)}
            placeholder="Enter meeting name"
          />

          <button
            className="primary-button"
            onClick={createMeeting}
            disabled={isConnecting}
          >
            {isConnecting ? 'Creating Meeting...' : 'Generate Meeting ID'}
          </button>

          {createdMeetingId && (
            <div className="created-meeting">
              <h3>Meeting Created Successfully!</h3>
              <p>Your Meeting ID:</p>
              <h2>{createdMeetingId}</h2>

              <button
                className="secondary-button"
                onClick={() => {
                  navigator.clipboard.writeText(createdMeetingId)
                  alert('Meeting ID copied!')
                }}
              >
                📋 Copy Meeting ID
              </button>

              <button
                className="primary-button"
                onClick={enterMeeting}
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting...' : 'Enter Meeting Room'}
              </button>

              <p>
                Share this ID with participants so they can join from
                another device.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // JOIN MEETING PAGE
  if (page === 'join') {
    return (
      <div className="meeting-page">
        <button onClick={() => setPage('dashboard')}>
          ← Back to Dashboard
        </button>

        <div className="meeting-form">
          <h1>Join a Meeting</h1>
          <p>Enter the Meeting ID shared with you.</p>

          <label>Meeting ID</label>
          <input
            value={meetingCode}
            onChange={e => setMeetingCode(e.target.value)}
            placeholder="Enter meeting ID"
          />

          <button
            className="primary-button"
            onClick={joinMeeting}
            disabled={isConnecting}
          >
            {isConnecting ? 'Connecting...' : 'Join Meeting'}
          </button>

          <p className="form-note">
            Enter the exact Meeting ID shared by the meeting host.
          </p>
        </div>
      </div>
    )
  }

  // LIVEKIT MEETING ROOM
  if (page === 'room') {
    return (
      <div className="room-page">
        <header className="room-header">
          <div className="logo">✦ MEETNOVA</div>

          <div className="room-info">
            <span className="live-indicator">● LIVE</span>
            <span>{joinedMeeting?.name}</span>
            <span>Meeting ID: {joinedMeeting?.id}</span>
            <span>
              {participantRole === 'host' ? 'Host' : 'Participant'}
            </span>
          </div>

          <button className="leave-button" onClick={leaveMeeting}>
            ☎ Leave Meeting
          </button>
        </header>

        {liveKitToken && liveKitServerUrl ? (
          <div
            data-lk-theme="default"
            style={{
              height: 'calc(100vh - 75px)',
              width: '100%'
            }}
          >
            <LiveKitRoom
              serverUrl={liveKitServerUrl}
              token={liveKitToken}
              connect={true}
              audio={true}
              video={true}
              onDisconnected={() => {
                setLiveKitToken('')
                setLiveKitServerUrl('')
                setJoinedMeeting(null)
                setParticipantRole('participant')
                setPage('dashboard')
              }}
              style={{ height: '100%' }}
            >
              <ModeratedConference isHost={participantRole === 'host'} />
              <RoomAudioRenderer />
            </LiveKitRoom>
          </div>
        ) : (
          <div className="meeting-form">
            <h2>Connecting to MEETNOVA...</h2>
            <p>Please wait while we connect you to the meeting.</p>
          </div>
        )}
      </div>
    )
  }

  // HOME PAGE
  return (
    <div className="app">
      <nav className="navbar">
        <div className="logo">
          <span className="logo-icon">✦</span> MEETNOVA
        </div>

        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#about">About</a>
          <a href="#how-it-works">How it works</a>
        </div>

        <div className="nav-actions">
          <button
            className="nav-button"
            onClick={() => setAuthPage('signin')}
          >
            Sign In
          </button>

          <button
            className="nav-button"
            onClick={() => setAuthPage('register')}
          >
            Register
          </button>
        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="hero-content">
            <div className="announcement">
              ✨ The future of meetings is here
            </div>

            <h1>
              Meetings that are<br />
              <span>smarter, simpler</span><br />
              and more human.
            </h1>

            <p>
              Experience a new way to connect. MEETNOVA brings intelligent
              meeting assistance, real-time collaboration and seamless
              video conferencing together.
            </p>

            <div className="hero-buttons">
              <button
                className="primary-button"
                onClick={() => setPage('create')}
              >
                Start a Meeting ↗
              </button>

              <button
                className="secondary-button"
                onClick={() => setPage('join')}
              >
                Join a Meeting
              </button>
            </div>

            <div className="hero-note">
              <span>●</span> Connect. Collaborate. Create.
            </div>
          </div>

          <div className="hero-visual">
            <div className="visual-glow"></div>

            <div className="meeting-card">
              <div className="meeting-top">
                <span>MEETNOVA LIVE</span>
                <span className="live-indicator">● LIVE</span>
              </div>

              <div className="participant-grid">
                <div className="participant">
                  <span>👩🏻‍💻</span>
                  <small>Alex Morgan</small>
                </div>

                <div className="participant participant-two">
                  <span>👨🏻‍💻</span>
                  <small>David James</small>
                </div>

                <div className="participant participant-three">
                  <span>👩🏽‍🎓</span>
                  <small>Sophia Lee</small>
                </div>

                <div className="participant participant-four">
                  <span>👨🏽‍💼</span>
                  <small>Ryan Smith</small>
                </div>
              </div>

              <div className="meeting-controls">
                <span>🎙️</span>
                <span>📹</span>
                <span>🖥️</span>
                <span>💬</span>
                <span className="end-call">☎</span>
              </div>
            </div>

            <div className="ai-card">
              <span>✦ AI MEETING ASSISTANT</span>
              <p>Meeting summary is ready!</p>
              <small>✓ Key points captured</small>
              <small>✓ Action items identified</small>
            </div>
          </div>
        </section>

        <section className="features" id="features">
          <div className="section-heading">
            <span>BUILT FOR BETTER CONNECTIONS</span>
            <h2>More than just a video call.</h2>
            <p>Everything you need to make every meeting productive.</p>
          </div>

          <div className="feature-grid">
            <div className="feature-card">
              <div className="feature-icon">✦</div>
              <h3>AI Meeting Assistant</h3>
              <p>
                Get smart meeting summaries, important highlights and
                automatically identified action items.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">◉</div>
              <h3>Smart Engagement</h3>
              <p>
                Understand meeting participation through privacy-aware
                engagement indicators.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">◎</div>
              <h3>Live Captions</h3>
              <p>
                Follow conversations with captions and multilingual
                communication support.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">◇</div>
              <h3>Smart Moderation</h3>
              <p>
                Create a safer meeting environment with intelligent
                chat moderation.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer id="about">
        <div className="logo">
          <span className="logo-icon">✦</span> MEETNOVA
        </div>

        <p>Bringing people and ideas together, intelligently.</p>
        <span>© 2026 MEETNOVA</span>
      </footer>
    </div>
  )
}

export default App
