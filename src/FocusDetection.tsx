
import { useEffect, useRef, useState } from 'react'

import {
  FaceLandmarker,
  FilesetResolver
} from '@mediapipe/tasks-vision'

import {
  useTracks,
  useRoomContext,
  useParticipants
} from '@livekit/components-react'

import { Track } from 'livekit-client'

import './FocusDetection.css'

type EngagementEstimate = {
  score: number | null
  status: string
  detail: string
}

type FocusDetectionProps = {
  enabled?: boolean
  onEstimate?: (estimate: EngagementEstimate) => void
}

function FocusDetection({
  enabled = false,
  onEstimate
}: FocusDetectionProps) {

  const room = useRoomContext()
  const participants = useParticipants()

  const videoRef = useRef<HTMLVideoElement>(null)

  const callbackRef = useRef(onEstimate)
  const participantsRef = useRef(participants)

  const lastReportRef = useRef(0)

  const [status, setStatus] = useState('Consent required')
  const [faceDetected, setFaceDetected] = useState(false)

  const [headDirection, setHeadDirection] =
    useState('Not assessed')

  const [eyeGaze, setEyeGaze] =
    useState('Not assessed')

  const tracks = useTracks([Track.Source.Camera])

  // KEEP LATEST CALLBACK AND PARTICIPANTS
  useEffect(() => {
    callbackRef.current = onEstimate
  }, [onEstimate])

  useEffect(() => {
    participantsRef.current = participants
  }, [participants])

  // REPORT ESTIMATE LOCALLY AND PRIVATELY TO HOST
  const reportEstimate = (estimate: EngagementEstimate) => {

    callbackRef.current?.(estimate)

    if (!enabled) return

    const host = participantsRef.current.find(
      participant =>
        participant.attributes?.meetnova_role === 'host'
    )

    if (!host) {
      console.warn(
        'MeetNova: Host not available for engagement updates.'
      )
      return
    }

    const payload = {
      type: 'engagement-estimate',
      score: estimate.score,
      status: estimate.status
    }

    const encodedPayload = new TextEncoder().encode(
      JSON.stringify(payload)
    )

    room.localParticipant.publishData(
      encodedPayload,
      {
        reliable: true,
        topic: 'meetnova-engagement',
        destinationIdentities: [host.identity]
      }
    ).catch(error => {
      console.error(
        'Engagement score transmission failed:',
        error
      )
    })
  }

  // CONNECT CAMERA ONLY AFTER CONSENT
  useEffect(() => {

    if (!enabled) {
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }

      setStatus('Waiting for participant consent')
      setFaceDetected(false)
      setHeadDirection('Not assessed')
      setEyeGaze('Not assessed')

      return
    }

    const localTrack = tracks.find(
      track => track.participant.isLocal
    )

    const mediaTrack =
      localTrack?.publication?.track?.mediaStreamTrack

    if (
      !mediaTrack ||
      mediaTrack.readyState === 'ended' ||
      localTrack?.publication?.isMuted
    ) {
      setStatus('Camera unavailable')
      setFaceDetected(false)
      setHeadDirection('Not assessed')
      setEyeGaze('Not assessed')

      reportEstimate({
        score: null,
        status: 'Not assessed',
        detail: 'Camera unavailable'
      })

      return
    }

    if (!videoRef.current) return

    videoRef.current.srcObject = new MediaStream([
      mediaTrack
    ])

    videoRef.current.play().catch(error => {
      console.error('Camera playback error:', error)
    })

    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }

  }, [tracks, enabled])

  // AI FACE, HEAD AND EYE DETECTION
  useEffect(() => {

    if (!enabled) {
      setStatus('Waiting for participant consent')

      reportEstimate({
        score: null,
        status: 'Not assessed',
        detail: 'Participant has not enabled AI estimation'
      })

      return
    }

    let landmarker: FaceLandmarker | null = null

    let animationId = 0
    let active = true

    lastReportRef.current = 0

    const initializeAI = async () => {

      try {

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        )

        landmarker = await FaceLandmarker.createFromOptions(
          vision,
          {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
            },

            runningMode: 'VIDEO',
            numFaces: 1,
            outputFacialTransformationMatrixes: true
          }
        )

        if (!active) {
          landmarker.close()
          return
        }

        setStatus('AI Focus Detection Active')

        const detect = () => {

          if (
            !active ||
            !landmarker ||
            !videoRef.current
          ) {
            return
          }

          const video = videoRef.current

          if (video.readyState >= 2) {

            const result = landmarker.detectForVideo(
              video,
              performance.now()
            )

            const found =
              result.faceLandmarks.length > 0

            setFaceDetected(previous =>
              previous === found ? previous : found
            )

            setStatus(
              found
                ? 'Face detected'
                : 'Face not detected'
            )

            const now = Date.now()

            // NO FACE: NOT ASSESSED
            if (!found) {

              setHeadDirection('Not assessed')
              setEyeGaze('Not assessed')

              if (
                now - lastReportRef.current >= 2000
              ) {

                reportEstimate({
                  score: null,
                  status: 'Not assessed',
                  detail: 'No face detected'
                })

                lastReportRef.current = now
              }

            } else {

              const landmarks = result.faceLandmarks[0]

              // HEAD DIRECTION DETECTION
              const matrix =
                result.facialTransformationMatrixes?.[0]?.data

              let direction = ''

              if (matrix && matrix.length >= 16) {

                const yaw = Math.atan2(
                  matrix[8],
                  matrix[10]
                ) * (180 / Math.PI)

                const pitch = Math.asin(
                  Math.max(
                    -1,
                    Math.min(1, -matrix[9])
                  )
                ) * (180 / Math.PI)

                direction = 'Looking toward camera'

                if (yaw > 18) {
                  direction = 'Head turned left'
                } else if (yaw < -18) {
                  direction = 'Head turned right'
                } else if (pitch > 18) {
                  direction = 'Head tilted up'
                } else if (pitch < -18) {
                  direction = 'Head tilted down'
                }

                setHeadDirection(previous =>
                  previous === direction
                    ? previous
                    : direction
                )
              }

              // EYE GAZE DETECTION
              let gaze = ''

              if (landmarks.length >= 478) {

                const leftEye = {
                  inner: landmarks[133],
                  outer: landmarks[33],
                  iris: landmarks[468],
                  upper: landmarks[159],
                  lower: landmarks[145]
                }

                const rightEye = {
                  inner: landmarks[362],
                  outer: landmarks[263],
                  iris: landmarks[473],
                  upper: landmarks[386],
                  lower: landmarks[374]
                }

                const getEyePosition = (
                  eye: typeof leftEye
                ) => {

                  const eyeWidth = Math.abs(
                    eye.outer.x - eye.inner.x
                  )

                  if (eyeWidth === 0) return 0.5

                  return (
                    (eye.iris.x - Math.min(
                      eye.inner.x,
                      eye.outer.x
                    )) / eyeWidth
                  )
                }

                const getEyeOpenness = (
                  eye: typeof leftEye
                ) => {

                  const width = Math.abs(
                    eye.outer.x - eye.inner.x
                  )

                  if (width === 0) return 0

                  const height = Math.abs(
                    eye.upper.y - eye.lower.y
                  )

                  return height / width
                }

                const leftPosition =
                  getEyePosition(leftEye)

                const rightPosition =
                  getEyePosition(rightEye)

                const averagePosition =
                  (leftPosition + rightPosition) / 2

                const averageOpenness =
                  (
                    getEyeOpenness(leftEye) +
                    getEyeOpenness(rightEye)
                  ) / 2

                gaze = 'Looking toward screen'

                if (averageOpenness < 0.12) {
                  gaze = 'Eyes appear closed'
                } else if (averagePosition < 0.38) {
                  gaze = 'Gaze toward screen left'
                } else if (averagePosition > 0.62) {
                  gaze = 'Gaze toward screen right'
                }

                setEyeGaze(previous =>
                  previous === gaze ? previous : gaze
                )

              } else {

                setEyeGaze('Eye landmarks unavailable')
              }

              // CALCULATE VISUAL ALIGNMENT ESTIMATE
              if (
                direction &&
                gaze &&
                now - lastReportRef.current >= 2000
              ) {

                const headAligned =
                  direction === 'Looking toward camera'

                const gazeAligned =
                  gaze === 'Looking toward screen'

                let score = 40

                if (headAligned) {
                  score += 30
                }

                if (gazeAligned) {
                  score += 30
                }

                let estimateStatus =
                  'Lower visual alignment'

                if (score >= 80) {
                  estimateStatus =
                    'Higher visual alignment'
                } else if (score >= 50) {
                  estimateStatus =
                    'Moderate visual alignment'
                }

                reportEstimate({
                  score,
                  status: estimateStatus,
                  detail: `${direction}; ${gaze}`
                })

                lastReportRef.current = now
              }
            }
          }

          animationId = requestAnimationFrame(detect)
        }

        detect()

      } catch (error) {

        console.error(
          'Focus detection error:',
          error
        )

        setStatus('Unable to initialize AI detection')

        reportEstimate({
          score: null,
          status: 'Not assessed',
          detail: 'AI detection could not be initialized'
        })
      }
    }

    initializeAI()

    return () => {

      active = false

      cancelAnimationFrame(animationId)

      landmarker?.close()
    }

  }, [enabled, room])

  return (
    <div className="focus-detection">

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="focus-hidden-video"
      />

      <h3>✦ AI Focus Detection</h3>

      <div className="focus-status">
        <span>{faceDetected ? '🟢' : '🟡'}</span>
        {status}
      </div>

      <p>
        {faceDetected
          ? 'Your face is visible to the camera.'
          : 'Your face is not currently detected.'}
      </p>

      <div className="focus-status">
        <span>🧭</span>
        {headDirection}
      </div>

      <p>
        Head direction is estimated using facial landmarks.
      </p>

      <div className="focus-status">
        <span>👁️</span>
        {eyeGaze}
      </div>

      <p>
        Eye gaze and eye openness are approximate visual estimates.
      </p>

    </div>
  )
}

export default FocusDetection
