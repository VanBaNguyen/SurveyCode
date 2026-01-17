const STORAGE_KEY = "oa_simulator_state_v2";

const DEFAULT_OA = {
  id: "two-sum",
  title: "Two Sum",
  difficulty: "Easy",
  tags: ["Array", "Hash Map"],
  timeMinutes: 45,
  description: `Given an array of integers <code>nums</code> and an integer <code>target</code>, return <em>indices</em> of the two numbers such that they add up to <code>target</code>.
<br /><br />
You may assume that each input would have <strong>exactly one solution</strong>, and you may not use the same element twice.
<br /><br />
You can return the answer in any order.`,
  examples: [
    {
      input: "nums = [2,7,11,15], target = 9",
      output: "[0,1]",
      explanation: "Because nums[0] + nums[1] == 9, we return [0, 1]."
    },
    {
      input: "nums = [3,2,4], target = 6",
      output: "[1,2]"
    },
    {
      input: "nums = [3,3], target = 6",
      output: "[0,1]"
    }
  ],
  constraints: [
    "2 ≤ nums.length ≤ 10⁵",
    "-10⁶ ≤ nums[i] ≤ 10⁶",
    "-10⁶ ≤ target ≤ 10⁶",
    "Exactly one valid answer exists."
  ],
  templates: {
    python: `from typing import List\n\nclass Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        # Write your solution here\n        pass\n`,
    javascript: `/**\n * @param {number[]} nums\n * @param {number} target\n * @return {number[]}\n */\nvar twoSum = function(nums, target) {\n  // Write your solution here\n  return [];\n};\n`,
    java: `import java.util.*;\n\nclass Solution {\n    public int[] twoSum(int[] nums, int target) {\n        // Write your solution here\n        return new int[]{};\n    }\n}\n`,
    cpp: `#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        // Write your solution here\n        return {};\n    }\n};\n`
  }
};

function $(sel) {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
}

function $maybe(sel) {
  return document.querySelector(sel);
}

function $all(sel) {
  return Array.from(document.querySelectorAll(sel));
}

function renderProblem(oa) {
  $("#problem-title").textContent = oa.title;

  const desc = document.querySelector('[data-panel="description"]');
  const ex = document.querySelector('[data-panel="examples"]');
  const cons = document.querySelector('[data-panel="constraints"]');

  if (desc) {
    desc.innerHTML = `
      <p>${oa.description}</p>
    `;
  }

  if (ex) {
    ex.innerHTML = (oa.examples || [])
      .map(
        (e, idx) => `
        <div class="panel" style="margin-bottom: 12px">
          <div class="kicker">Example ${idx + 1}</div>
          <div class="muted"><strong>Input:</strong> <code>${escapeHtml(e.input)}</code></div>
          <div class="muted" style="margin-top: 8px"><strong>Output:</strong> <code>${escapeHtml(e.output)}</code></div>
          ${e.explanation ? `<div class="muted" style="margin-top: 8px"><strong>Explanation:</strong> ${escapeHtml(e.explanation)}</div>` : ""}
        </div>
      `
      )
      .join("");
  }

  if (cons) {
    cons.innerHTML = `
      <ul class="list">
        ${(oa.constraints || []).map((c) => `<li><span class="dot"></span>${escapeHtml(c)}</li>`).join("")}
      </ul>
    `;
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

function nowIso() {
  return new Date().toISOString();
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let cm = null;
let timerInterval = null;
let OA = null;

function initEditor(initialLang, initialCode) {
  const textarea = $("#editor");

  if (cm) {
    cm.toTextArea();
    cm = null;
  }

  cm = CodeMirror.fromTextArea(textarea, {
    value: initialCode,
    mode: modeForLang(initialLang),
    theme: "dracula",
    lineNumbers: true,
    tabSize: 2,
    indentUnit: 2,
    indentWithTabs: false,
    lineWrapping: false,
    autofocus: true
  });

  cm.setValue(initialCode);
  // Make the editor fill the entire editor-wrap height
  cm.setSize(null, "100%");
}

function modeForLang(lang) {
  switch (lang) {
    case "python":
      return "python";
    case "javascript":
      return "javascript";
    case "java":
      return "text/x-java";
    case "cpp":
      return "text/x-c++src";
    default:
      return "javascript";
  }
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function startTimer(endAtMs) {
  if (timerInterval) window.clearInterval(timerInterval);

  function tick() {
    const now = Date.now();
    const remaining = Math.max(0, Math.floor((endAtMs - now) / 1000));
    $("#timer").textContent = formatTime(remaining);

    if (remaining <= 0) {
      window.clearInterval(timerInterval);
      timerInterval = null;
      $("#timer").textContent = "00:00";
    }
  }

  tick();
  timerInterval = window.setInterval(tick, 250);
}

function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  if (timerInterval) window.clearInterval(timerInterval);
  timerInterval = null;
  const s = $maybe("#save-status");
  if (s) s.textContent = "";
  // Keep the current OA loaded; just reset timer/editor to defaults
  initAssessment({ fresh: true });
}

function updateSaveStatus(text) {
  const el = $maybe("#save-status");
  if (!el) return;
  el.textContent = text || "";
}

function init() {
  OA = loadOAFromUrl() || DEFAULT_OA;
  renderProblem(OA);

  // tabs
  $all(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      $all(".tab").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");

      const tab = btn.getAttribute("data-tab");
      $all(".tab-panel").forEach((p) => {
        p.hidden = p.getAttribute("data-panel") !== tab;
      });
    });
  });

  $("#btn-reset").addEventListener("click", () => resetAll());

  const backBtn = $maybe("#btn-back-to-code");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      showScreen("coding");
    });
  }

  initAssessment({ fresh: false });
}

function initAssessment({ fresh }) {
  if (!OA) OA = DEFAULT_OA;

  const progressEl = $maybe("#progress");
  if (progressEl) progressEl.textContent = "OA";

  const saved = fresh ? null : loadState();
  const storageMatchesThisOA = saved?.problemId && saved.problemId === OA.id;

  const initialLang = storageMatchesThisOA && saved?.language ? saved.language : "python";
  const initialCode = storageMatchesThisOA && saved?.code ? saved.code : OA.templates[initialLang];

  $("#language").value = initialLang;
  initEditor(initialLang, initialCode);

  // timer
  let endAt = storageMatchesThisOA && saved?.endAtMs ? saved.endAtMs : null;
  if (!endAt || Date.now() > endAt) {
    endAt = Date.now() + (OA.timeMinutes || 45) * 60 * 1000;
  }
  startTimer(endAt);

  function persist() {
    const next = {
      problemId: OA.id,
      language: $("#language").value,
      code: cm ? cm.getValue() : "",
      endAtMs: endAt,
      updatedAt: nowIso()
    };
    saveState(next);
    return next;
  }

  // remove old handlers by replacing buttons (simple + robust for this small app)
  const saveBtn = $("#btn-save");
  const submitBtn = $("#btn-submit");
  const langSelect = $("#language");

  saveBtn.replaceWith(saveBtn.cloneNode(true));
  submitBtn.replaceWith(submitBtn.cloneNode(true));
  langSelect.replaceWith(langSelect.cloneNode(true));

  updateSaveStatus("");
  persist();

  // re-grab after clone
  const saveBtn2 = $("#btn-save");
  const submitBtn2 = $("#btn-submit");
  const langSelect2 = $("#language");

  langSelect2.addEventListener("change", () => {
    const lang = langSelect2.value;
    cm.setOption("mode", modeForLang(lang));

    const current = cm ? cm.getValue() : "";
    const isStillTemplate = Object.values(OA.templates).includes(current);
    if (!current.trim() || isStillTemplate) {
      cm.setValue(OA.templates[lang] || "");
    }

    persist();
    updateSaveStatus("");
  });

  let autosaveHandle = null;
  if (cm) {
    cm.on("change", () => {
      if (autosaveHandle) window.clearTimeout(autosaveHandle);
      autosaveHandle = window.setTimeout(() => {
        persist();
        updateSaveStatus(`Saved locally at ${new Date().toLocaleTimeString()}`);
      }, 450);
    });
  }

  saveBtn2.addEventListener("click", () => {
    persist();
    updateSaveStatus(`Saved locally at ${new Date().toLocaleTimeString()}`);
  });

  submitBtn2.addEventListener("click", () => {
    console.log("Submit button clicked");
    const snapshot = persist();
    const payload = {
      submittedAt: nowIso(),
      oa: {
        id: OA.id,
        title: OA.title
      },
      language: snapshot.language,
      code: snapshot.code,
      timeRemainingSeconds: Math.max(0, Math.floor((snapshot.endAtMs - Date.now()) / 1000))
    };

    updateSaveStatus(`Submitted at ${new Date().toLocaleTimeString()}`);

    // Store the submission for the feedback page and navigate there
    try {
      localStorage.setItem("oa_last_submission", JSON.stringify(payload));
    } catch (_) {}

    window.location.href = "feedback.html";
  });
}

function loadOAFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("oa");
  if (!raw) return null;

  try {
    // Expect base64-encoded JSON
    const json = decodeURIComponent(escape(atob(raw)));
    const parsed = JSON.parse(json);
    return normalizeOA(parsed);
  } catch {
    // Fallback: try plain JSON in URL (useful during development)
    try {
      const parsed = JSON.parse(raw);
      return normalizeOA(parsed);
    } catch {
      return null;
    }
  }
}

function normalizeOA(input) {
  const oa = {
    ...DEFAULT_OA,
    ...input,
    templates: { ...DEFAULT_OA.templates, ...(input?.templates || {}) }
  };

  if (!oa.id) oa.id = `oa-${Math.random().toString(36).slice(2, 10)}`;
  if (!oa.title) oa.title = "Coding Question";
  if (!oa.timeMinutes || Number.isNaN(Number(oa.timeMinutes))) oa.timeMinutes = 45;
  if (!Array.isArray(oa.examples)) oa.examples = [];
  if (!Array.isArray(oa.constraints)) oa.constraints = [];
  return oa;
}

function showScreen(name) {
  $all("[data-screen]").forEach((el) => {
    el.hidden = el.getAttribute("data-screen") !== name;
  });
}

function modeFallbackLanguage(code) {
  // best-effort: do not attempt to detect fully
  if (code.includes("class Solution") && code.includes("def ")) return "python";
  if (code.includes("var ") || code.includes("function")) return "javascript";
  if (code.includes("public int[]") || code.includes("class Solution")) return "java";
  if (code.includes("#include") || code.includes("vector<int>")) return "cpp";
  return "python";
}

function renderMockFeedback(submission) {
  // In the future this will come from a backend /api/feedback call.
  const mock = buildMockFeedback(submission);

  const titleEl = $maybe("#feedback-problem-title");
  const verdictEl = $maybe("#feedback-verdict");
  const strengthsEl = $maybe("#feedback-strengths");
  const improvementsEl = $maybe("#feedback-improvements");
  const complexityEl = $maybe("#feedback-complexity");
  const testsEl = $maybe("#feedback-tests");
  const explEl = $maybe("#feedback-explanation");
  const solEl = $maybe("#feedback-solution");

  if (titleEl) titleEl.textContent = submission?.oa?.title || OA.title;
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
}

function buildMockFeedback(submission) {
  const lang = submission?.language || "python";

  // Very simple heuristic to vary verdict a bit
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

document.addEventListener("DOMContentLoaded", init);
