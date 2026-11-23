
require('dotenv').config()

const express = require('express')
const cors = require('cors')
const crypto = require('crypto')
const { AccessToken } = require('livekit-server-sdk')

const app = express()

app.use(cors({
  origin: 'http://localhost:5173'
}))

app.use(express.json())

const PORT = process.env.PORT || 5000

// Temporary host records for this prototype
const hostRecords = new Map()

// CHECK SERVER
app.get('/', (req, res) => {
  res.send('MeetNova Backend is Running!')
})

// CREATE MEETING AND REGISTER HOST
app.post('/api/create-meeting', (req, res) => {
  try {
    const roomName = crypto.randomBytes(4)
      .toString('hex')
      .toUpperCase()

    const hostKey = crypto.randomBytes(32).toString('hex')

    hostRecords.set(roomName, hostKey)

    res.json({
      roomName,
      hostKey
    })

  } catch (error) {
    console.error(error)
    res.status(500).json({
      error: 'Unable to create meeting'
    })
  }
})

// GENERATE LIVEKIT TOKEN
app.post('/api/token', async (req, res) => {
  try {
    const { roomName, participantName, hostKey } = req.body

    if (!roomName || !participantName) {
      return res.status(400).json({
        error: 'Meeting ID and participant name are required'
      })
    }

    const isHost =
      hostRecords.has(roomName) &&
      hostRecords.get(roomName) === hostKey &&
      typeof hostKey === 'string'

    const role = isHost ? 'host' : 'participant'

    const identity =
      `${crypto.randomUUID()}`

    const token = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity,
        name: participantName,
        ttl: '2h',
        attributes: {
          meetnova_role: role
        }
      }
    )

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true
    })

    const participantToken = await token.toJwt()
    const decodedPayload = JSON.parse(
  Buffer.from(
    participantToken.split('.')[1],
    'base64url'
  ).toString()
)

console.log('TOKEN CHECK:', {
  issuerMatchesConfiguredKey:
    decodedPayload.iss === process.env.LIVEKIT_API_KEY,

  roomMatchesRequest:
    decodedPayload.video?.room === roomName,

  roomJoinEnabled:
    decodedPayload.video?.roomJoin === true,

  expiresAt: new Date(
    decodedPayload.exp * 1000
  ).toISOString(),

  serverUrl: process.env.LIVEKIT_URL
})
    res.json({
      serverUrl: process.env.LIVEKIT_URL,
      participantToken,
      role
    })

  } catch (error) {
    console.error('Token generation error:', error)

    res.status(500).json({
      error: 'Unable to generate meeting token'
    })
  }
})

app.listen(PORT, () => {
  console.log(`MeetNova Backend running on port ${PORT}`)
})
