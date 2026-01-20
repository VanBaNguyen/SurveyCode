/* Simple feedback page script: read last submission from localStorage and render mock feedback */

const BACKEND_URL = 'http://localhost:5001';

async function playFeedbackTTS(text) {
  try {
    console.log('Playing AI feedback via TTS...');
    const response = await fetch(`${BACKEND_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    
    if (!response.ok) {
      throw new Error(`TTS HTTP ${response.status}`);
    }
    
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    
    return new Promise((resolve, reject) => {
      audio.onended = () => {
        console.log('AI feedback TTS finished');
        resolve();
      };
      audio.onerror = (error) => {
        console.error('Audio playback error:', error);
        reject(error);
      };
      audio.play().catch(reject);
    });
  } catch (error) {
    console.error('TTS error:', error);
    // Don't block the page if TTS fails
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildMockFeedback(submission) {
  const lang = submission?.language || "python";
  const code = submission?.code || "";
  const passed = code.includes("return") || code.includes("nums");

  // Check if we have AI feedback from the interview
  const aiFeedback = submission?.ai_feedback;

  if (aiFeedback) {
    // Use AI-generated feedback from the voice interview
    return {
      verdictLabel: "AI Review Complete",
      strengths: [
        "You completed the voice interview successfully.",
        "Your code was reviewed by our AI interviewer.",
      ],
      improvements: [
        "Review the AI feedback below for specific suggestions.",
        "Consider the algorithmic approach and complexity analysis.",
      ],
      complexity: {
        time: "See AI feedback",
        space: "See AI feedback",
      },
      testsSummary: "AI feedback provided below includes analysis of your approach.",
      explanation: aiFeedback,
      referenceSolution:
        lang === "python"
          ? `from typing import List

class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        index = {}
        for i, x in enumerate(nums):
            need = target - x
            if need in index:
                return [index[need], i]
            index[x] = i
        return []
`
          : `// Reference solution available in Python; other languages are analogous.`,
    };
  }

  // Fallback to mock feedback if no AI feedback
  return {
    verdictLabel: passed ? "Looks correct" : "Needs work",
    strengths: [
      "You chose an efficient approach using a hash map.",
      "Your time complexity is optimal for this problem.",
    ],
    improvements: [
      "Add more comments describing your thought process.",
      "Consider additional edge cases such as repeated values and large inputs.",
    ],
    complexity: {
      time: "O(n)",
      space: "O(n)",
    },
    testsSummary: passed
      ? "On our sample suite, your solution passes the main functional cases."
      : "Your solution is close, but it likely fails on some edge cases (e.g. duplicates or large arrays).",
    explanation:
      "A common approach is to iterate through the array once while keeping a hash map from value to index. For each number, you check whether target - number already exists in the map; if it does, you have found the pair.",
    referenceSolution:
      lang === "python"
        ? `from typing import List

class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        index = {}
        for i, x in enumerate(nums):
            need = target - x
            if need in index:
                return [index[need], i]
            index[x] = i
        return []
`
        : `// Reference solution available in Python; other languages are analogous.`,
  };
}

let SEGMENTS = [];
let CURRENT_SEGMENT = 0;

function segmentCode(code, language) {
  const lines = code.replace(/\r\n/g, "\n").split("\n");
  const segments = [];

  let current = null;

  const startsNewBlock = (line) => {
    const t = line.trim();
    if (!t) return false;
    // Only create segments for major blocks
    if (/^def\s+/.test(t)) return true;
    if (/^class\s+/.test(t)) return true;
    if (/^function\b/.test(t)) return true;
    if (/^(public|private|protected)\s+(static\s+)?\w+/.test(t)) return true;
    return false;
  };

  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    if (!current) {
      current = { id: `seg-${segments.length + 1}`, startLine: lineNumber, endLine: lineNumber };
      segments.push(current);
      return;
    }

    // Start new segment only for major blocks
    if (startsNewBlock(line)) {
      current = { id: `seg-${segments.length + 1}`, startLine: lineNumber, endLine: lineNumber };
      segments.push(current);
    } else {
      current.endLine = lineNumber;
    }
  });

  // Merge very small segments (less than 3 lines) with adjacent ones
  const mergedSegments = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const span = seg.endLine - seg.startLine + 1;
    
    if (span < 3 && mergedSegments.length > 0) {
      // Merge with previous segment
      mergedSegments[mergedSegments.length - 1].endLine = seg.endLine;
    } else {
      mergedSegments.push(seg);
    }
  }

  // Fallback: if no segments, create one for entire code
  if (!mergedSegments.length) {
    mergedSegments.push({ id: "seg-1", startLine: 1, endLine: lines.length || 1 });
  }

  return mergedSegments;
}

async function generateSegmentFeedback(segmentCode, segmentIndex, totalSegments, language) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/segment_feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        code: segmentCode,
        segment_index: segmentIndex,
        total_segments: totalSegments,
        language: language
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data.feedback;
  } catch (error) {
    console.error('Segment feedback error:', error);
    // Fallback to generic feedback
    return buildSegmentNotes({ startLine: 0, endLine: 0 }, segmentIndex, totalSegments, language);
  }
}

function buildSegmentNotes(segment, idx, total, language) {
  const span = segment.endLine - segment.startLine + 1;
  if (idx === 0) {
    return `This opening segment sets up your solution. Make sure any imports, helper classes, and function signatures are clear and match the problem statement. (${span} line${span === 1 ? "" : "s"})`;
  }
  if (span >= 5) {
    return `This segment contains the main logic of your solution. Check that edge cases are handled (empty input, duplicates, large sizes) and that the loop conditions are correct.`;
  }
  return `This segment supports your main logic. Consider whether it can be simplified or merged for readability.`;
}

function renderCodeWithSegments(code, segments) {
  const container = document.getElementById("code-view");
  if (!container) return;

  const lines = code.replace(/\r\n/g, "\n").split("\n");
  container.innerHTML = lines
    .map((line, idx) => {
      const lineNumber = idx + 1;
      return `
<div class="code-line" data-line="${lineNumber}">
  <div class="code-line-number">${lineNumber}</div>
  <div class="code-line-text">${escapeHtml(line || " ")}</div>
</div>`;
    })
    .join("");

  applySegmentHighlight(0, segments);
}

function applySegmentHighlight(index, segments) {
  const lines = document.querySelectorAll(".code-line");
  if (!lines.length || !segments.length) {
    console.log('Cannot apply highlight - no lines or segments');
    return;
  }

  const seg = segments[Math.max(0, Math.min(index, segments.length - 1))];
  console.log(`Highlighting segment ${index}: lines ${seg.startLine}-${seg.endLine}`);
  
  lines.forEach((el) => {
    const n = Number(el.getAttribute("data-line"));
    el.classList.remove("code-line-highlight", "code-line-muted");
    if (n >= seg.startLine && n <= seg.endLine) {
      el.classList.add("code-line-highlight");
    } else {
      el.classList.add("code-line-muted");
    }
  });

  // Toggle active card
  const cards = document.querySelectorAll(".segment-card");
  cards.forEach((card, i) => {
    card.classList.toggle("is-active", i === index);
  });
}

async function buildSegmentCards(segments, language, fullCode) {
  const container = document.getElementById("segment-cards");
  if (!container) return;

  container.innerHTML = "<div style='padding: 10px; color: #666;'>Generating AI feedback for code segments...</div>";

  const lines = fullCode.replace(/\r\n/g, "\n").split("\n");
  
  for (let idx = 0; idx < segments.length; idx++) {
    const seg = segments[idx];
    const segmentCode = lines.slice(seg.startLine - 1, seg.endLine).join("\n");
    
    const card = document.createElement("div");
    card.className = "segment-card";
    if (idx === 0) card.classList.add("is-active");

    const title = document.createElement("div");
    title.className = "segment-card-title";
    title.textContent = `Segment ${idx + 1} of ${segments.length}`;

    const linesMeta = document.createElement("div");
    linesMeta.className = "segment-card-lines";
    linesMeta.textContent = `Lines ${seg.startLine}-${seg.endLine}`;

    const notes = document.createElement("p");
    notes.className = "feedback-text";
    notes.textContent = "Analyzing...";

    card.appendChild(title);
    card.appendChild(linesMeta);
    card.appendChild(notes);

    if (idx === 0) {
      container.innerHTML = "";
    }
    container.appendChild(card);
    
    // Generate AI feedback for this segment
    const feedback = await generateSegmentFeedback(segmentCode, idx, segments.length, language);
    notes.textContent = feedback;
  }
}

function renderFeedback() {
  let submission = null;
  try {
    const raw = localStorage.getItem("oa_last_submission");
    if (raw) submission = JSON.parse(raw);
  } catch (_) {}

  if (!submission) {
    // Nothing submitted, show a simple message
    const titleEl = document.getElementById("feedback-problem-title");
    if (titleEl) titleEl.textContent = "No recent submission found";
    const verdict = document.getElementById("feedback-verdict");
    if (verdict) verdict.textContent = "";
    return;
  }

  const mock = buildMockFeedback(submission);

  const titleEl = document.getElementById("feedback-problem-title");
  const verdictEl = document.getElementById("feedback-verdict");
  const strengthsEl = document.getElementById("feedback-strengths");
  const improvementsEl = document.getElementById("feedback-improvements");
  const complexityEl = document.getElementById("feedback-complexity");
  const testsEl = document.getElementById("feedback-tests");
  const explEl = document.getElementById("feedback-explanation");
  const solEl = document.getElementById("feedback-solution");

  if (titleEl) titleEl.textContent = submission?.oa?.title || "Coding Question";
  if (verdictEl) verdictEl.textContent = mock.verdictLabel;

  if (strengthsEl) {
    strengthsEl.innerHTML = mock.strengths.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  }

  if (improvementsEl) {
    improvementsEl.innerHTML = mock.improvements.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  }

  if (complexityEl) {
    complexityEl.textContent = `Time: ${mock.complexity.time}, Space: ${mock.complexity.space}`;
  }

  if (testsEl) {
    testsEl.textContent = mock.testsSummary;
  }

  if (explEl) explEl.textContent = mock.explanation;
  if (solEl) solEl.textContent = mock.referenceSolution;

  // Build and render code segments (async)
  (async () => {
    console.log('Building code segments...');
    SEGMENTS = segmentCode(submission.code || "", submission.language || "python");
    CURRENT_SEGMENT = 0;
    console.log(`Created ${SEGMENTS.length} segments`);
    await buildSegmentCards(SEGMENTS, submission.language || "python", submission.code || "");
    renderCodeWithSegments(submission.code || "", SEGMENTS);
    console.log('Code segments rendered');
  })();
}

function wireBackButtons() {
  const thankYouBtn = document.getElementById("btn-thank-you");
  if (thankYouBtn) {
    thankYouBtn.addEventListener("click", () => {
      window.location.href = "thankyou.html";
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  renderFeedback();
  wireBackButtons();
  const prev = document.getElementById("btn-prev-segment");
  const next = document.getElementById("btn-next-segment");
  
  console.log('Setting up segment navigation buttons');
  console.log('Prev button:', prev);
  console.log('Next button:', next);
  
  if (prev) {
    prev.addEventListener("click", () => {
      if (!SEGMENTS.length) return;
      CURRENT_SEGMENT = Math.max(0, CURRENT_SEGMENT - 1);
      console.log(`Moving to segment ${CURRENT_SEGMENT}`);
      applySegmentHighlight(CURRENT_SEGMENT, SEGMENTS);
    });
  }
  if (next) {
    next.addEventListener("click", () => {
      if (!SEGMENTS.length) return;
      CURRENT_SEGMENT = Math.min(SEGMENTS.length - 1, CURRENT_SEGMENT + 1);
      console.log(`Moving to segment ${CURRENT_SEGMENT}`);
      applySegmentHighlight(CURRENT_SEGMENT, SEGMENTS);
    });
  }
  
  // Play AI feedback TTS when page loads
  setTimeout(() => {
    const submission = JSON.parse(localStorage.getItem("oa_last_submission") || '{}');
    const aiFeedback = submission?.ai_feedback;
    
    if (aiFeedback) {
      console.log('AI feedback found, playing TTS immediately...');
      playFeedbackTTS(aiFeedback);
    } else {
      console.log('No AI feedback found in localStorage');
    }
  }, 500); // Wait 0.5 seconds for page to settle
});
