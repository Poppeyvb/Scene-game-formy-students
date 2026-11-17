/* =====================================================================
   1. ESL VOCABULARY QUESTION BANK (Friction: Useful vs. Harmful)
   - Target age: 10-12 ESL learners (simple, clear textbook sentences)
   - isMatch: true  -> Student tilts LEFT  (Correct match)
   - isMatch: false -> Student tilts RIGHT (Incorrect match)
   ===================================================================== */
const FRICTION_QUESTIONS = [
  {
    definition: "Lighting a match stick",
    word: "Useful",
    isMatch: true,
    explanation:
      "Lighting a match stick: Friction creates heat to light the match, so it is useful."
  },
  {
    definition: "Car brakes stopping a moving car",
    word: "Useful",
    isMatch: true,
    explanation:
      "Car brakes: Friction slows down the wheels safely, so this friction is useful."
  },
  {
    definition: "Shoe soles wearing out with holes",
    word: "Harmful",
    isMatch: true,
    explanation:
      "Shoe soles wearing out: Friction rubs away the bottom of your shoes, so it is harmful."
  },
  {
    definition: "Walking on the sidewalk without slipping",
    word: "Harmful",
    isMatch: false,
    explanation:
      "This is NOT harmful — friction between your shoes and the ground helps you walk safely, so it is useful!"
  },
  {
    definition: "Bicycle chain getting hot and wearing down",
    word: "Harmful",
    isMatch: true,
    explanation:
      "Bicycle chain: Metal parts rubbing together create heat and damage the chain, so it is harmful."
  },
  {
    definition: "Rubbing your hands together on a cold day",
    word: "Harmful",
    isMatch: false,
    explanation:
      "This is NOT harmful — rubbing your hands creates warm heat, so this friction is useful!"
  },
  {
    definition: "Writing on paper with a pencil",
    word: "Useful",
    isMatch: true,
    explanation:
      "Writing with a pencil: Friction leaves dark marks on the paper, so this friction is useful."
  },
  {
    definition: "Heavy box scraping and scratching a wooden floor",
    word: "Useful",
    isMatch: false,
    explanation:
      "This is NOT useful — strong friction makes the box hard to push and scratches the floor, so it is harmful!"
  }
];

/* =====================================================================
   2. HEAD-TILT TUNING CONSTANTS (Optimized for Classroom Stability)
   ===================================================================== */
const TILT_THRESHOLD_DEG = 15;     // Angle needed to register a Left or Right tilt
const NEUTRAL_THRESHOLD_DEG = 8;   // Angle considered "head upright / centered"
const HOLD_DURATION_MS = 650;      // Hold tilt for 0.65 seconds to lock in answer
const FEEDBACK_DISPLAY_MS = 3400;  // Show explanation for 3.4 seconds before next card

/* =====================================================================
   3. DOM ELEMENT REFERENCES
   ===================================================================== */
const startScreen = document.getElementById("startScreen");
const gameScreen = document.getElementById("gameScreen");
const endScreen = document.getElementById("endScreen");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const statusMsg = document.getElementById("statusMsg");

const scoreDisplay = document.getElementById("scoreDisplay");
const questionCounter = document.getElementById("questionCounter");

const videoEl = document.getElementById("webcamVideo");
const canvasEl = document.getElementById("outputCanvas");
const canvasCtx = canvasEl.getContext("2d");
const faceStatusBadge = document.getElementById("faceStatusBadge");

const tiltNeedle = document.getElementById("tiltNeedle");
const angleReadout = document.getElementById("angleReadout");

const definitionText = document.getElementById("definitionText");
const vocabWordText = document.getElementById("vocabWordText");

const leftChoiceCard = document.getElementById("leftChoiceCard");
const rightChoiceCard = document.getElementById("rightChoiceCard");
const leftProgressBar = document.getElementById("leftProgressBar");
const rightProgressBar = document.getElementById("rightProgressBar");

const feedbackBanner = document.getElementById("feedbackBanner");
const feedbackTitle = document.getElementById("feedbackTitle");
const feedbackExplanation = document.getElementById("feedbackExplanation");

const finalScoreText = document.getElementById("finalScoreText");
const finalMessage = document.getElementById("finalMessage");

/* =====================================================================
   4. GAME STATE VARIABLES
   ===================================================================== */
let currentQuestionIndex = 0;
let score = 0;
let isPlaying = false;
let isLocked = false;            // Pauses tilt detection while showing explanation
let needsRecenter = false;       // Ensures student returns upright after answering
let smoothedAngle = 0;           // Smoothed head roll angle in degrees
let currentHoldDirection = null; // "LEFT" | "RIGHT" | null
let holdStartTime = 0;
let faceMeshInstance = null;

/* =====================================================================
   5. START WEBCAM & INITIALIZE MEDIAPIPE FACE MESH
   ===================================================================== */
startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  startBtn.textContent = "Starting Camera... ⏳";
  statusMsg.textContent = "";

  try {
    // 1. Configure MediaPipe Face Mesh for single-student tracking
    faceMeshInstance = new FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`
    });

    faceMeshInstance.setOptions({
      maxNumFaces: 1,            // Track one student at a time
      refineLandmarks: false,    // Lightweight mode for Chromebooks & tablets
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });

    faceMeshInstance.onResults(onFaceMeshResults);

    // 2. Request user permission for the front camera (no data is saved)
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });

    videoEl.srcObject = stream;
    await videoEl.play();

    // 3. Switch to gameplay screen and start the frame loop
    startScreen.classList.add("hidden");
    gameScreen.classList.remove("hidden");
    startNewGame();
    processVideoFrame();
  } catch (error) {
    console.error("Camera initialization failed:", error);
    statusMsg.textContent =
      "⚠️ Camera access denied or unavailable. Please allow camera permission and open via HTTPS or localhost.";
    startBtn.disabled = false;
    startBtn.textContent = "Try Again 🎥";
  }
});

// Send each webcam frame to MediaPipe Face Mesh
async function processVideoFrame() {
  if (videoEl.readyState >= 2 && faceMeshInstance) {
    await faceMeshInstance.send({ image: videoEl });
  }
  requestAnimationFrame(processVideoFrame);
}

/* =====================================================================
   6. DETECT HEAD TILT (LEFT vs RIGHT) FROM EYE LANDMARKS
   ===================================================================== */
function onFaceMeshResults(results) {
  const width = canvasEl.width;
  const height = canvasEl.height;

  // Draw mirrored video onto the canvas so movement feels natural like a mirror
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, width, height);
  canvasCtx.scale(-1, 1);
  canvasCtx.drawImage(videoEl, -width, 0, width, height);
  canvasCtx.restore();

  // Check if a face is currently in view
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    faceStatusBadge.textContent = "⚠️ Move into camera view";
    resetHoldProgress();
    return;
  }

  faceStatusBadge.textContent = "✅ Student detected — Tilt head to answer!";
  const landmarks = results.multiFaceLandmarks[0];

  // Landmark 33  = student's right eye outer corner
  // Landmark 263 = student's left eye outer corner
  const rightEye = landmarks[33];
  const leftEye = landmarks[263];

  // Compute angle between the eyes in degrees:
  // Tilting head LEFT lowers leftEye (larger y) -> positive angle (+15° or more)
  // Tilting head RIGHT lowers rightEye (larger y) -> negative angle (-15° or less)
  const dx = leftEye.x - rightEye.x;
  const dy = leftEye.y - rightEye.y;
  const rawAngleDeg = Math.atan2(dy, dx) * (180 / Math.PI);

  // Smooth the angle to eliminate webcam jitter
  smoothedAngle = 0.7 * smoothedAngle + 0.3 * rawAngleDeg;

  // Draw a helpful eye-tracking line on the mirrored video
  drawEyeGuide(rightEye, leftEye, width, height);

  // Update the live horizontal tilt meter
  updateTiltMeter(smoothedAngle);

  // Check if the tilt triggers a game answer
  if (isPlaying && !isLocked) {
    evaluateHeadTilt(smoothedAngle);
  }
}

// Draw eye dots and a connecting line so students see how their head tilt is tracked
function drawEyeGuide(rightEye, leftEye, width, height) {
  const rx = (1 - rightEye.x) * width;
  const ry = rightEye.y * height;
  const lx = (1 - leftEye.x) * width;
  const ly = leftEye.y * height;

  canvasCtx.strokeStyle = "#38bdf8";
  canvasCtx.lineWidth = 4;
  canvasCtx.beginPath();
  canvasCtx.moveTo(rx, ry);
  canvasCtx.lineTo(lx, ly);
  canvasCtx.stroke();

  canvasCtx.fillStyle = "#facc15";
  [
    [rx, ry],
    [lx, ly]
  ].forEach(([x, y]) => {
    canvasCtx.beginPath();
    canvasCtx.arc(x, y, 6, 0, 2 * Math.PI);
    canvasCtx.fill();
  });
}

// Move the visual needle on the tilt gauge under the camera
function updateTiltMeter(angle) {
  const clamped = Math.max(-35, Math.min(35, angle));
  const percent = 50 - (clamped / 35) * 45;
  tiltNeedle.style.left = `${percent}%`;

  const rounded = Math.round(angle);
  if (angle >= TILT_THRESHOLD_DEG) {
    angleReadout.textContent = `⬅️ Tilting LEFT (${rounded}°)`;
    tiltNeedle.style.backgroundColor = "#16a34a";
  } else if (angle <= -TILT_THRESHOLD_DEG) {
    angleReadout.textContent = `Tilting RIGHT (${rounded}°) ➡️`;
    tiltNeedle.style.backgroundColor = "#dc2626";
  } else {
    angleReadout.textContent = `Center (${rounded}°)`;
    tiltNeedle.style.backgroundColor = "#2563eb";
  }
}

// Require the student to hold a Left or Right tilt for HOLD_DURATION_MS
function evaluateHeadTilt(angle) {
  // Wait for student to bring head back upright after answering
  if (needsRecenter) {
    if (Math.abs(angle) <= NEUTRAL_THRESHOLD_DEG) {
      needsRecenter = false;
    } else {
      faceStatusBadge.textContent = "⬆️ Return head to center first";
      return;
    }
  }

  let detectedDirection = null;
  if (angle >= TILT_THRESHOLD_DEG) {
    detectedDirection = "LEFT";
  } else if (angle <= -TILT_THRESHOLD_DEG) {
    detectedDirection = "RIGHT";
  }

  // Reset progress bar if head returns to center
  if (!detectedDirection) {
    resetHoldProgress();
    return;
  }

  // Start or continue timing the hold
  if (currentHoldDirection !== detectedDirection) {
    currentHoldDirection = detectedDirection;
    holdStartTime = performance.now();
  }

  const elapsed = performance.now() - holdStartTime;
  const progressPercent = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);

  if (detectedDirection === "LEFT") {
    leftChoiceCard.classList.add("active-tilt");
    rightChoiceCard.classList.remove("active-tilt");
    leftProgressBar.style.width = `${progressPercent}%`;
    rightProgressBar.style.width = "0%";
  } else {
    rightChoiceCard.classList.add("active-tilt");
    leftChoiceCard.classList.remove("active-tilt");
    rightProgressBar.style.width = `${progressPercent}%`;
    leftProgressBar.style.width = "0%";
  }

  // Lock in the answer once the progress bar reaches 100%
  if (elapsed >= HOLD_DURATION_MS) {
    const studentChoseMatch = detectedDirection === "LEFT";
    submitAnswer(studentChoseMatch);
  }
}

function resetHoldProgress() {
  currentHoldDirection = null;
  holdStartTime = 0;
  leftChoiceCard.classList.remove("active-tilt");
  rightChoiceCard.classList.remove("active-tilt");
  leftProgressBar.style.width = "0%";
  rightProgressBar.style.width = "0%";
}

/* =====================================================================
   7. GAME PROGRESSION, SCORING & EXPLANATION FEEDBACK
   ===================================================================== */
function startNewGame() {
  currentQuestionIndex = 0;
  score = 0;
  isPlaying = true;
  isLocked = false;
  needsRecenter = false;

  endScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  updateScoreboard();
  loadCurrentQuestion();
}

function loadCurrentQuestion() {
  const q = FRICTION_QUESTIONS[currentQuestionIndex];
  definitionText.textContent = `“${q.definition}”`;
  vocabWordText.textContent = q.word;

  feedbackBanner.classList.add("hidden");
  feedbackBanner.classList.remove("correct", "incorrect");
  resetHoldProgress();
  updateScoreboard();
}

function submitAnswer(studentChoseMatch) {
  if (isLocked) return;
  isLocked = true;
  needsRecenter = true;
  resetHoldProgress();

  const q = FRICTION_QUESTIONS[currentQuestionIndex];
  const isCorrect = studentChoseMatch === q.isMatch;

  if (isCorrect) {
    score++;
    feedbackBanner.classList.add("correct");
    feedbackTitle.textContent = "Correct ✅";
  } else {
    feedbackBanner.classList.add("incorrect");
    feedbackTitle.textContent = "Try Again ❌";
  }

  feedbackExplanation.textContent = q.explanation;
  feedbackBanner.classList.remove("hidden");
  updateScoreboard();

  // Advance to the next question after showing the explanation
  setTimeout(() => {
    currentQuestionIndex++;
    if (currentQuestionIndex < FRICTION_QUESTIONS.length) {
      isLocked = false;
      loadCurrentQuestion();
    } else {
      endGame();
    }
  }, FEEDBACK_DISPLAY_MS);
}

function updateScoreboard() {
  const total = FRICTION_QUESTIONS.length;
  const displayNum = Math.min(currentQuestionIndex + 1, total);
  questionCounter.textContent = `Question ${displayNum} / ${total}`;
  scoreDisplay.textContent = `⭐ Score: ${score}`;
}

function endGame() {
  isPlaying = false;
  gameScreen.classList.add("hidden");
  endScreen.classList.remove("hidden");

  const total = FRICTION_QUESTIONS.length;
  finalScoreText.textContent = `You scored ${score} out of ${total}!`;

  if (score === total) {
    finalMessage.textContent = "🌟 Perfect score! You know when friction is useful or harmful!";
  } else if (score >= total / 2) {
    finalMessage.textContent = "👏 Great work! Play again to get a perfect score!";
  } else {
    finalMessage.textContent = "💪 Nice effort! Read each friction clue carefully and try again.";
  }
}

restartBtn.addEventListener("click", startNewGame);

// Optional keyboard arrow-key backup for classroom accessibility
window.addEventListener("keydown", (event) => {
  if (!isPlaying || isLocked) return;
  if (event.key === "ArrowLeft") submitAnswer(true);
  if (event.key === "ArrowRight") submitAnswer(false);
});