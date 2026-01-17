/* Simple feedback page script: read last submission from localStorage and render mock feedback */

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
    if (/^def\s+/.test(t)) return true;
    if (/^class\s+/.test(t)) return true;
    if (/^(for|while|if|elif|else)\b/.test(t)) return true;
    if (/^function\b/.test(t)) return true;
    if (/^(public|private|protected)\s+/.test(t)) return true;
    return false;
  };

  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    if (!current) {
      current = { id: `seg-${segments.length + 1}`, startLine: lineNumber, endLine: lineNumber };
      segments.push(current);
      return;
    }

    // If this line clearly starts a new logical block, start a new segment
    if (startsNewBlock(line)) {
      current = { id: `seg-${segments.length + 1}`, startLine: lineNumber, endLine: lineNumber };
      segments.push(current);
    } else {
      current.endLine = lineNumber;
    }
  });

  // Fallback: if for some reason nothing useful, one big segment
  if (!segments.length) {
    segments.push({ id: "seg-1", startLine: 1, endLine: lines.length || 1 });
  }

  return segments;
}

function buildSegmentNotes(segment, idx, total, language) {
  const span = segment.endLine - segment.startLine + 1;
  if (idx === 0) {
    return `This opening segment sets up your solution. Make sure any imports, helper classes, and function signatures are clear and match the problem statement. (${span} line${span === 1 ? "" : "s"})`;
  }
  if (span >= 5) {
    return `This segment contains the main logic of your solution. Check that edge cases are handled (empty input, duplicates, large sizes) and that the loop conditions are correct.`;
  }
  return `This shorter segment supports your main logic. Consider whether it can be simplified or merged for readability.`;
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
  if (!lines.length || !segments.length) return;

  const seg = segments[Math.max(0, Math.min(index, segments.length - 1))];
  
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

function buildSegmentCards(segments, language) {
  const container = document.getElementById("segment-cards");
  if (!container) return;

  container.innerHTML = "";

  segments.forEach((seg, idx) => {
    const card = document.createElement("div");
    card.className = "segment-card";

    const title = document.createElement("div");
    title.className = "segment-card-title";
    title.textContent = `Segment ${idx + 1} of ${segments.length}`;

    const linesMeta = document.createElement("div");
    linesMeta.className = "segment-card-lines";
    linesMeta.textContent = `Lines ${seg.startLine}-${seg.endLine}`;

    const notes = document.createElement("p");
    notes.className = "feedback-text";
    notes.textContent = buildSegmentNotes(seg, idx, segments.length, language);

    card.appendChild(title);
    card.appendChild(linesMeta);
    card.appendChild(notes);

    container.appendChild(card);
  });
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

  // Build and render code segments
  SEGMENTS = segmentCode(submission.code || "", submission.language || "python");
  CURRENT_SEGMENT = 0;
  buildSegmentCards(SEGMENTS, submission.language || "python");
  renderCodeWithSegments(submission.code || "", SEGMENTS);
}

function wireBackButtons() {
  const goBack = () => {
    window.location.href = "index.html";
  };

  const top = document.getElementById("btn-back");
  const bottom = document.getElementById("btn-back-bottom");
  if (top) top.addEventListener("click", goBack);
  if (bottom) bottom.addEventListener("click", goBack);
}

window.addEventListener("DOMContentLoaded", () => {
  renderFeedback();
  wireBackButtons();
  const prev = document.getElementById("btn-prev-segment");
  const next = document.getElementById("btn-next-segment");
  if (prev) {
    prev.addEventListener("click", () => {
      if (!SEGMENTS.length) return;
      CURRENT_SEGMENT = Math.max(0, CURRENT_SEGMENT - 1);
      applySegmentHighlight(CURRENT_SEGMENT, SEGMENTS);
    });
  }
  if (next) {
    next.addEventListener("click", () => {
      if (!SEGMENTS.length) return;
      CURRENT_SEGMENT = Math.min(SEGMENTS.length - 1, CURRENT_SEGMENT + 1);
      applySegmentHighlight(CURRENT_SEGMENT, SEGMENTS);
    });
  }
});
